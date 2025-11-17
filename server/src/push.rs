use expo_push_notification_client::{Expo, ExpoClientOptions, ExpoPushMessage};
use futures_util::{StreamExt, stream};
use serde::Serialize;

use crate::{
    AppState, db::push_token_repo::PushTokenRepository, errors::ApiError, types::NotificationData,
    utils::make_k1,
};

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
            async move {
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

                let push_data = PushNotificationData {
                    title: None,
                    body: None,
                    data: data_string,
                    priority: "high".to_string(),
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

    let chunks = push_tokens
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

    tracing::debug!(
        "send_push_notification: Sent push notification with data: {:?}",
        data.data
    );

    Ok(())
}
