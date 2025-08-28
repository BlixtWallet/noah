use anyhow::Context;
use expo_push_notification_client::{Expo, ExpoClientOptions, ExpoPushMessage};
use futures_util::{StreamExt, stream};
use serde::Serialize;

use crate::{AppState, errors::ApiError};

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
    let access_token = std::env::var("EXPO_ACCESS_TOKEN")
        .context("EXPO_ACCESS_TOKEN must be set in the environment variables")?;

    let expo = Expo::new(ExpoClientOptions {
        access_token: Some(access_token),
    });

    let mut push_tokens = Vec::new();

    if let Some(pubkey) = pubkey {
        let conn = app_state.db.connect()?;
        let mut rows = conn
            .query(
                "SELECT push_token FROM push_tokens WHERE pubkey = ?",
                libsql::params![pubkey],
            )
            .await?;
        if let Some(row) = rows.next().await? {
            push_tokens.push(row.get::<String>(0)?);
        }
    } else {
        let conn = app_state.db.connect()?;
        let mut rows = conn.query("SELECT push_token FROM push_tokens", ()).await?;
        while let Some(row) = rows.next().await? {
            push_tokens.push(row.get::<String>(0)?);
        }
    }

    tracing::debug!(
        "send_push_notification: Preparing to send push notification to tokens: {:?} {:?}",
        push_tokens,
        data.data
    );

    if push_tokens.is_empty() {
        return Ok(());
    }

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
        "send_push_notification: Sent push notification to tokens: {:?} {:?}",
        push_tokens,
        data.data
    );

    Ok(())
}
