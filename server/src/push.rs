use expo_push_notification_client::{Expo, ExpoClientOptions, ExpoPushMessage, Priority};
use futures_util::{StreamExt, stream};
use reqwest::Client;
use serde::Serialize;

use crate::{
    AppState, db::push_token_repo::PushTokenRepository, errors::ApiError, types::NotificationData,
    utils::make_k1,
};

/// Determines if a push token is an Expo push token.
/// All other tokens (e.g., UnifiedPush HTTP endpoints) are treated as non-Expo.
fn is_expo_token(token: &str) -> bool {
    ((token.starts_with("ExponentPushToken[") || token.starts_with("ExpoPushToken["))
        && token.ends_with(']'))
        || regex::Regex::new(r"^[a-z\d]{8}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{12}$")
            .expect("regex is valid")
            .is_match(token)
}

#[derive(Serialize, Clone, Debug)]
pub struct PushNotificationData {
    pub title: Option<String>,
    pub body: Option<String>,
    pub data: String,
    pub priority: Priority,
    // This is iOS only which makes the app wake up to do things
    pub content_available: bool,
}

pub async fn send_push_notification(
    app_state: AppState,
    data: PushNotificationData,
    pubkey: Option<String>,
) -> anyhow::Result<(), ApiError> {
    send_push_notification_internal(app_state, data, pubkey).await
}

pub async fn send_push_notification_with_unique_k1(
    app_state: AppState,
    base_notification_data: NotificationData,
    pubkey: Option<String>,
) -> anyhow::Result<(), ApiError> {
    // For notifications that need unique k1 per device, we don't use the batching approach
    // Instead, we send individual notifications with unique k1 values
    let expo = Expo::new(ExpoClientOptions {
        access_token: Some(app_state.config.load().expo_access_token.clone()),
    });
    let http_client = Client::new();

    let push_token_repo = PushTokenRepository::new(&app_state.db_pool);

    let push_tokens = if let Some(pubkey) = pubkey {
        // A single token might not be found, which is not an error, so we handle the Option.
        match push_token_repo.find_by_pubkey(&pubkey).await? {
            Some(token) => vec![token],
            None => vec![],
        }
    } else {
        push_token_repo.find_all().await?
    };

    if push_tokens.is_empty() {
        return Ok(());
    }

    // Send individual notifications with unique k1 for each device
    stream::iter(push_tokens.clone())
        .for_each_concurrent(None, |push_token| {
            let expo_clone = expo.clone();
            let app_state_clone = app_state.clone();
            let base_data_clone = base_notification_data.clone();
            let http_client_clone = http_client.clone();
            let ntfy_auth = app_state.config.load().ntfy_auth_token.clone();
            async move {
                // Create notification data with unique k1 if needed
                let mut notification_data = base_data_clone;
                if notification_data.needs_unique_k1() {
                    match make_k1(&app_state_clone.k1_cache).await {
                        Ok(unique_k1) => notification_data.set_k1(unique_k1),
                        Err(e) => {
                            tracing::error!(
                                "Failed to create unique k1 for push notification: {}",
                                e
                            );
                            return;
                        }
                    }
                }

                let data_string = match serde_json::to_string(&notification_data) {
                    Ok(s) => s,
                    Err(e) => {
                        tracing::error!("Failed to serialize notification data: {}", e);
                        return;
                    }
                };

                if is_expo_token(&push_token) {
                    let push_data = PushNotificationData {
                        title: None,
                        body: None,
                        data: data_string,
                        priority: Priority::High,
                        content_available: true,
                    };

                    let message = match ExpoPushMessage::builder(vec![push_token])
                        .data(&push_data.data)
                        .and_then(|b| {
                            b.priority(push_data.priority.clone())
                                .content_available(push_data.content_available)
                                .mutable_content(false)
                                .build()
                        }) {
                        Ok(msg) => msg,
                        Err(e) => {
                            tracing::error!("Failed to build push notification message: {}", e);
                            return;
                        }
                    };

                    if let Err(e) = expo_clone.send_push_notifications(message).await {
                        tracing::error!("Failed to send push notification: {}", e);
                    }
                } else {
                    if let Err(e) = send_unified_notification(
                        &http_client_clone,
                        &push_token,
                        &data_string,
                        &ntfy_auth,
                    )
                    .await
                    {
                        tracing::error!("Failed to send unified push notification: {}", e);
                    }
                }
            }
        })
        .await;

    tracing::debug!(
        "send_push_notification_with_unique_k1: Sending to {} tokens with unique k1s {:?}",
        push_tokens.len(),
        base_notification_data
    );
    Ok(())
}

async fn send_push_notification_internal(
    app_state: AppState,
    data: PushNotificationData,
    pubkey: Option<String>,
) -> anyhow::Result<(), ApiError> {
    let expo = Expo::new(ExpoClientOptions {
        access_token: Some(app_state.config.load().expo_access_token.clone()),
    });
    let http_client = Client::new();

    let push_token_repo = PushTokenRepository::new(&app_state.db_pool);

    let push_tokens = if let Some(pubkey) = pubkey {
        // A single token might not be found, which is not an error, so we handle the Option.
        match push_token_repo.find_by_pubkey(&pubkey).await? {
            Some(token) => vec![token],
            None => vec![],
        }
    } else {
        push_token_repo.find_all().await?
    };

    if push_tokens.is_empty() {
        return Ok(());
    }

    tracing::debug!(
        "send_push_notification: Sending to {} tokens",
        push_tokens.len()
    );

    let (expo_tokens, unified_tokens): (Vec<_>, Vec<_>) =
        push_tokens.into_iter().partition(|t| is_expo_token(t));

    if !expo_tokens.is_empty() {
        let chunks = expo_tokens
            .chunks(100)
            .map(|c| c.to_vec())
            .collect::<Vec<_>>();

        stream::iter(chunks)
            .for_each_concurrent(None, |chunk| {
                let expo_clone = expo.clone();
                let data_clone = data.clone();
                async move {
                    let mut builder = ExpoPushMessage::builder(chunk);
                    if let Some(title) = &data_clone.title {
                        builder = builder.title(title.clone());
                    }
                    if let Some(body) = &data_clone.body {
                        builder = builder.body(body.clone());
                    }
                    let message = match builder.data(&data_clone.data).and_then(|b| {
                        b.priority(data_clone.priority.clone())
                            .content_available(data_clone.content_available)
                            .mutable_content(false)
                            .build()
                    }) {
                        Ok(msg) => msg,
                        Err(e) => {
                            tracing::error!("Failed to build push notification message: {}", e);
                            return;
                        }
                    };

                    if let Err(e) = expo_clone.send_push_notifications(message).await {
                        tracing::error!("Failed to send push notification chunk: {}", e);
                    }
                }
            })
            .await;
    }

    if !unified_tokens.is_empty() {
        let ntfy_auth = app_state.config.load().ntfy_auth_token.clone();
        let data_clone = data.clone();
        stream::iter(unified_tokens)
            .for_each_concurrent(None, |endpoint| {
                let http_client_clone = http_client.clone();
                let ntfy_auth = ntfy_auth.clone();
                let payload = data_clone.clone();
                async move {
                    if let Err(e) = send_unified_notification(
                        &http_client_clone,
                        &endpoint,
                        &payload.data,
                        &ntfy_auth,
                    )
                    .await
                    {
                        tracing::error!("Failed to send unified push notification: {}", e);
                    }
                }
            })
            .await;
    }

    tracing::debug!(
        "send_push_notification: Sent push notification with data: {:?}",
        data.data
    );

    Ok(())
}

async fn send_unified_notification(
    client: &Client,
    endpoint: &str,
    payload: &str,
    auth_token: &str,
) -> Result<(), ApiError> {
    let mut request = client.post(endpoint).body(payload.to_string());
    request = request.bearer_auth(auth_token);

    let response = request
        .send()
        .await
        .map_err(|e| ApiError::ServerErr(e.to_string()))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        tracing::error!("UnifiedPush endpoint returned {}: {}", status, text);
    }

    Ok(())
}
