use expo_push_notification_client::{Expo, ExpoClientOptions, ExpoPushMessage};
use futures_util::{StreamExt, stream};
use serde::Serialize;

use crate::{
    AppState, db::push_token_repo::PushTokenRepository, errors::ApiError, types::NotificationData,
    utils::make_k1,
};

#[derive(Debug, Clone, PartialEq)]
enum PushTokenType {
    Expo,
    UnifiedPush,
}

fn detect_token_type(token: &str) -> PushTokenType {
    if token.starts_with("Expo") || token.starts_with("expo") {
        PushTokenType::Expo
    } else {
        PushTokenType::UnifiedPush
    }
}

async fn send_to_unified_push_endpoint(
    endpoint: String,
    data: String,
) -> anyhow::Result<(), ApiError> {
    let client = reqwest::Client::new();

    match client
        .post(&endpoint)
        .header("Content-Type", "application/json")
        .header("Priority", "high")
        .body(data)
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                tracing::debug!("Successfully sent to UnifiedPush endpoint: {}", endpoint);
                Ok(())
            } else {
                tracing::error!(
                    "UnifiedPush endpoint returned error status {}: {}",
                    response.status(),
                    endpoint
                );
                Err(ApiError::ServerErr(format!(
                    "UnifiedPush endpoint returned status {}",
                    response.status()
                )))
            }
        }
        Err(e) => {
            tracing::error!("Failed to send to UnifiedPush endpoint {}: {}", endpoint, e);
            Err(ApiError::ServerErr(format!(
                "Failed to send to UnifiedPush: {}",
                e
            )))
        }
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct PushNotificationData {
    pub title: Option<String>,
    pub body: Option<String>,
    pub data: String,
    pub priority: String,
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

    let conn = app_state.db.connect()?;
    let push_token_repo = PushTokenRepository::new(&conn);

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
            async move {
                let token_type = detect_token_type(&push_token);

                // Create notification data with unique k1 if needed
                let mut notification_data = base_data_clone;
                if notification_data.needs_unique_k1() {
                    let unique_k1 = make_k1(app_state_clone.k1_values.clone());
                    notification_data.set_k1(unique_k1);
                }

                let data_string = match serde_json::to_string(&notification_data) {
                    Ok(s) => s,
                    Err(e) => {
                        tracing::error!("Failed to serialize notification data: {}", e);
                        return;
                    }
                };

                match token_type {
                    PushTokenType::Expo => {
                        let push_data = PushNotificationData {
                            title: None,
                            body: None,
                            data: data_string,
                            priority: "high".to_string(),
                            content_available: true,
                        };

                        let message = match ExpoPushMessage::builder(vec![push_token.clone()])
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
                    }
                    PushTokenType::UnifiedPush => {
                        if let Err(e) = send_to_unified_push_endpoint(push_token, data_string).await
                        {
                            tracing::error!("Failed to send to UnifiedPush endpoint: {}", e);
                        }
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

    let conn = app_state.db.connect()?;
    let push_token_repo = PushTokenRepository::new(&conn);

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

    // Separate tokens by type
    let mut expo_tokens = Vec::new();
    let mut unified_push_tokens = Vec::new();

    for token in push_tokens {
        match detect_token_type(&token) {
            PushTokenType::Expo => expo_tokens.push(token),
            PushTokenType::UnifiedPush => unified_push_tokens.push(token),
        }
    }

    tracing::debug!(
        "send_push_notification: Sending to {} Expo tokens and {} UnifiedPush tokens",
        expo_tokens.len(),
        unified_push_tokens.len()
    );

    // Send to Expo tokens in parallel
    let expo_future = async {
        if expo_tokens.is_empty() {
            return;
        }

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
    };

    // Send to UnifiedPush endpoints in parallel
    let unified_push_future = async {
        if unified_push_tokens.is_empty() {
            return;
        }

        stream::iter(unified_push_tokens)
            .for_each_concurrent(None, |endpoint| {
                let data_clone = data.clone();
                async move {
                    if let Err(e) = send_to_unified_push_endpoint(endpoint, data_clone.data).await {
                        tracing::error!("Failed to send to UnifiedPush endpoint: {}", e);
                    }
                }
            })
            .await;
    };

    // Run both in parallel
    tokio::join!(expo_future, unified_push_future);

    tracing::debug!(
        "send_push_notification: Sent push notification with data: {:?}",
        data.data
    );

    Ok(())
}
