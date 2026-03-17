#![allow(dead_code)]

use std::{cmp, collections::HashSet, sync::Arc, time::Duration};

use anyhow::Result;
use async_trait::async_trait;
use chrono::Utc;
use expo_push_notification_client::Priority;
use futures_util::StreamExt;
use server_rpc::tonic::{Code, Status};
use server_rpc::{
    mailbox::MailboxServiceClient,
    protos::mailbox_server::{MailboxMessage, MailboxRequest, mailbox_message::Message},
};
use tokio::{sync::Semaphore, task::JoinSet, time::sleep};

use crate::{
    AppState,
    db::mailbox_authorization_repo::{ActiveMailboxAuthorization, MailboxAuthorizationRepository},
    errors::ApiError,
    push::{PushNotificationData, send_push_notification},
};

#[derive(Debug, Clone)]
pub struct MailboxWorkerConfig {
    pub concurrency_limit: usize,
    pub scan_interval: Duration,
    pub batch_size: i64,
    pub base_retry_delay: Duration,
    pub max_retry_delay: Duration,
}

impl Default for MailboxWorkerConfig {
    fn default() -> Self {
        Self {
            concurrency_limit: 50,
            scan_interval: Duration::from_secs(15),
            batch_size: 100,
            base_retry_delay: Duration::from_secs(5),
            max_retry_delay: Duration::from_secs(300),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MailboxSessionOutcome {
    Completed,
    Retryable { reason: String },
    InvalidAuth { reason: String },
    Expired { reason: String },
}

#[async_trait]
pub trait MailboxTransport: Send + Sync {
    async fn run_session(
        &self,
        app_state: AppState,
        mailbox: ActiveMailboxAuthorization,
    ) -> Result<MailboxSessionOutcome>;
}

pub struct MailboxWorker<T> {
    app_state: AppState,
    transport: Arc<T>,
    config: MailboxWorkerConfig,
    semaphore: Arc<Semaphore>,
}

impl<T> MailboxWorker<T>
where
    T: MailboxTransport + 'static,
{
    pub fn new(app_state: AppState, transport: Arc<T>, config: MailboxWorkerConfig) -> Self {
        let semaphore = Arc::new(Semaphore::new(config.concurrency_limit));
        Self {
            app_state,
            transport,
            config,
            semaphore,
        }
    }

    pub async fn run(&self) -> Result<()> {
        let mut join_set = JoinSet::new();
        let mut active_pubkeys = HashSet::new();

        loop {
            while let Some(result) = join_set.try_join_next() {
                self.handle_session_result(result, &mut active_pubkeys)
                    .await?;
            }

            let scheduled = self
                .schedule_runnable_sessions(&mut join_set, &mut active_pubkeys)
                .await?;
            tracing::debug!(
                service = "mailbox_worker",
                scheduled = scheduled,
                active_sessions = active_pubkeys.len(),
                "mailbox worker iteration complete"
            );

            tokio::select! {
                result = join_set.join_next(), if !join_set.is_empty() => {
                    if let Some(result) = result {
                        self.handle_session_result(result, &mut active_pubkeys).await?;
                    }
                }
                _ = sleep(self.config.scan_interval) => {}
            }
        }
    }

    pub async fn run_once(&self) -> Result<usize> {
        let mut join_set = JoinSet::new();
        let mut active_pubkeys = HashSet::new();
        let scheduled = self
            .schedule_runnable_sessions(&mut join_set, &mut active_pubkeys)
            .await?;

        while let Some(result) = join_set.join_next().await {
            self.handle_session_result(result, &mut active_pubkeys)
                .await?;
        }

        Ok(scheduled)
    }

    async fn schedule_runnable_sessions(
        &self,
        join_set: &mut JoinSet<(String, Result<()>)>,
        active_pubkeys: &mut HashSet<String>,
    ) -> Result<usize> {
        let available_slots = self.semaphore.available_permits();
        if available_slots == 0 {
            return Ok(0);
        }

        let repo = MailboxAuthorizationRepository::new(&self.app_state.db_pool);
        let fetch_limit = cmp::max(self.config.batch_size, available_slots as i64);
        let runnable = repo.list_runnable(Utc::now(), fetch_limit).await?;

        let mut scheduled = 0usize;

        for mailbox in runnable {
            if active_pubkeys.contains(&mailbox.pubkey) {
                continue;
            }

            let Ok(permit) = self.semaphore.clone().try_acquire_owned() else {
                break;
            };

            let pubkey = mailbox.pubkey.clone();
            let app_state = self.app_state.clone();
            let transport = self.transport.clone();
            let config = self.config.clone();

            active_pubkeys.insert(pubkey.clone());
            join_set.spawn(async move {
                let _permit = permit;
                let result = process_mailbox_session(app_state, transport, config, mailbox).await;
                (pubkey, result)
            });
            scheduled += 1;
        }

        Ok(scheduled)
    }

    async fn handle_session_result(
        &self,
        result: std::result::Result<(String, Result<()>), tokio::task::JoinError>,
        active_pubkeys: &mut HashSet<String>,
    ) -> Result<()> {
        let (pubkey, session_result) = result?;
        active_pubkeys.remove(&pubkey);
        session_result
    }
}

async fn process_mailbox_session<T>(
    app_state: AppState,
    transport: Arc<T>,
    config: MailboxWorkerConfig,
    mailbox: ActiveMailboxAuthorization,
) -> Result<()>
where
    T: MailboxTransport + 'static,
{
    let repo = MailboxAuthorizationRepository::new(&app_state.db_pool);
    repo.mark_connected(&mailbox.pubkey).await?;

    let outcome = match transport
        .run_session(app_state.clone(), mailbox.clone())
        .await
    {
        Ok(outcome) => outcome,
        Err(error) => MailboxSessionOutcome::Retryable {
            reason: error.to_string(),
        },
    };

    match outcome {
        MailboxSessionOutcome::Completed => {
            repo.clear_error(&mailbox.pubkey).await?;
        }
        MailboxSessionOutcome::Retryable { reason } => {
            let retry_at =
                Utc::now() + compute_retry_delay(&repo, &mailbox.pubkey, &config).await?;
            repo.mark_retry(&mailbox.pubkey, retry_at, &reason).await?;
        }
        MailboxSessionOutcome::InvalidAuth { reason } => {
            repo.mark_invalid(&mailbox.pubkey, &reason).await?;
        }
        MailboxSessionOutcome::Expired { reason } => {
            repo.mark_expired(&mailbox.pubkey, &reason).await?;
        }
    }

    Ok(())
}

async fn compute_retry_delay(
    repo: &MailboxAuthorizationRepository<'_>,
    pubkey: &str,
    config: &MailboxWorkerConfig,
) -> Result<chrono::TimeDelta> {
    let retries = repo.current_failure_count(pubkey).await?.saturating_add(1);

    let shift = retries.saturating_sub(1).min(16) as u32;
    let base_secs = config.base_retry_delay.as_secs();
    let max_secs = config.max_retry_delay.as_secs();
    let delay_secs = cmp::min(base_secs.saturating_mul(1u64 << shift), max_secs);

    Ok(chrono::TimeDelta::seconds(delay_secs as i64))
}

pub struct MailboxTransportUnavailable;

#[async_trait]
impl MailboxTransport for MailboxTransportUnavailable {
    async fn run_session(
        &self,
        _app_state: AppState,
        _mailbox: ActiveMailboxAuthorization,
    ) -> Result<MailboxSessionOutcome> {
        Ok(MailboxSessionOutcome::Retryable {
            reason: "mailbox transport not implemented".to_string(),
        })
    }
}

pub struct Beta8MailboxTransport;

#[async_trait]
impl MailboxTransport for Beta8MailboxTransport {
    async fn run_session(
        &self,
        app_state: AppState,
        mailbox: ActiveMailboxAuthorization,
    ) -> Result<MailboxSessionOutcome> {
        let now = Utc::now().timestamp();
        if mailbox.authorization_expires_at <= now {
            return Ok(MailboxSessionOutcome::Expired {
                reason: "mailbox authorization has expired".to_string(),
            });
        }

        let unblinded_id = match decode_hex_bytes("mailbox_id", &mailbox.mailbox_id) {
            Ok(value) => value,
            Err(reason) => return Ok(MailboxSessionOutcome::InvalidAuth { reason }),
        };
        let authorization = match decode_hex_bytes("authorization", &mailbox.authorization_hex) {
            Ok(value) => value,
            Err(reason) => return Ok(MailboxSessionOutcome::InvalidAuth { reason }),
        };

        let mut client =
            MailboxServiceClient::connect(app_state.config.ark_server_url.clone()).await?;

        let mut checkpoint = mailbox.last_checkpoint as u64;

        loop {
            let read_response = client
                .read_mailbox(MailboxRequest {
                    unblinded_id: unblinded_id.clone(),
                    authorization: Some(authorization.clone()),
                    checkpoint,
                })
                .await;

            let read_response = match read_response {
                Ok(response) => response,
                Err(status) => return Ok(map_tonic_status(status)),
            };

            let messages = read_response.into_inner().messages;
            if messages.is_empty() {
                break;
            }

            for message in messages {
                process_mailbox_message(&app_state, &mailbox.pubkey, &message).await?;
                checkpoint = message.checkpoint;
                MailboxAuthorizationRepository::new(&app_state.db_pool)
                    .update_checkpoint(&mailbox.pubkey, checkpoint as i64)
                    .await?;
            }
        }

        let stream_response = client
            .subscribe_mailbox(MailboxRequest {
                unblinded_id,
                authorization: Some(authorization),
                checkpoint,
            })
            .await;

        let mut stream = match stream_response {
            Ok(response) => response.into_inner(),
            Err(status) => return Ok(map_tonic_status(status)),
        };

        while let Some(next) = stream.next().await {
            let message = match next {
                Ok(message) => message,
                Err(status) => return Ok(map_tonic_status(status)),
            };

            process_mailbox_message(&app_state, &mailbox.pubkey, &message).await?;
            checkpoint = message.checkpoint;
            MailboxAuthorizationRepository::new(&app_state.db_pool)
                .update_checkpoint(&mailbox.pubkey, checkpoint as i64)
                .await?;
        }

        Ok(MailboxSessionOutcome::Retryable {
            reason: "mailbox stream ended".to_string(),
        })
    }
}

fn decode_hex_bytes(field: &str, value: &str) -> std::result::Result<Vec<u8>, String> {
    hex::decode(value).map_err(|e| format!("invalid {} hex: {}", field, e))
}

fn map_tonic_status(status: Status) -> MailboxSessionOutcome {
    match status.code() {
        Code::Unauthenticated | Code::PermissionDenied => MailboxSessionOutcome::InvalidAuth {
            reason: status.message().to_string(),
        },
        Code::FailedPrecondition => MailboxSessionOutcome::Expired {
            reason: status.message().to_string(),
        },
        _ => MailboxSessionOutcome::Retryable {
            reason: status.to_string(),
        },
    }
}

async fn process_mailbox_message(
    app_state: &AppState,
    pubkey: &str,
    message: &MailboxMessage,
) -> Result<(), ApiError> {
    match &message.message {
        Some(Message::Arkoor(arkoor)) if !arkoor.vtxos.is_empty() => {
            let data = PushNotificationData {
                title: Some("New Ark wallet activity".to_string()),
                body: Some("Open Noah to review recent Ark activity.".to_string()),
                data: "{}".to_string(),
                priority: Priority::High,
                content_available: false,
            };

            send_push_notification(app_state.clone(), data, Some(pubkey.to_string())).await?;
        }
        _ => {}
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retry_delay_grows_and_caps() {
        let config = MailboxWorkerConfig {
            base_retry_delay: Duration::from_secs(5),
            max_retry_delay: Duration::from_secs(300),
            ..Default::default()
        };

        let delay_for = |failures: i32| {
            let retries = failures.saturating_add(1) as u32;
            let shift = retries.saturating_sub(1).min(16);
            let secs = cmp::min(
                config
                    .base_retry_delay
                    .as_secs()
                    .saturating_mul(1u64 << shift),
                config.max_retry_delay.as_secs(),
            );
            chrono::TimeDelta::seconds(secs as i64)
        };

        assert_eq!(delay_for(0), chrono::TimeDelta::seconds(5));
        assert_eq!(delay_for(1), chrono::TimeDelta::seconds(10));
        assert_eq!(delay_for(2), chrono::TimeDelta::seconds(20));
        assert_eq!(delay_for(10), chrono::TimeDelta::seconds(300));
    }
}
