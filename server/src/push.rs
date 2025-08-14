use anyhow::Context;
use axum::extract::State;
use expo_push_notification_client::{Expo, ExpoClientOptions, ExpoPushMessage};
use serde::Serialize;

use crate::{AppState, errors::ApiError};

#[derive(Serialize, Clone, Debug)]
pub struct PushNotificationData {
    pub title: Option<String>,
    pub body: Option<String>,
    pub data: String,
    pub priority: String,
}

pub async fn send_push_notification(
    State(app_state): State<AppState>,
    data: PushNotificationData,
) -> anyhow::Result<(), ApiError> {
    let access_token = std::env::var("EXPO_ACCESS_TOKEN")
        .context("EXPO_ACCESS_TOKEN must be set in the environment variables")?;

    let expo = Expo::new(ExpoClientOptions {
        access_token: Some(access_token),
    });

    let mut rows = app_state
        .conn
        .query("SELECT push_token FROM push_tokens", ())
        .await?;

    let mut push_tokens = Vec::new();
    while let Some(row) = rows.next().await? {
        push_tokens.push(row.get::<String>(0)?);
    }

    if push_tokens.is_empty() {
        return Ok(());
    }

    let mut builder = ExpoPushMessage::builder(push_tokens.clone());

    if let Some(title) = data.title {
        builder = builder.title(title);
    }

    if let Some(body) = data.body {
        builder = builder.body(body);
    }

    let expo_push_message = builder
        .data(&data.data)
        .map_err(|e| ApiError::SerializeErr(e.to_string()))?
        .priority(data.priority)
        .content_available(true)
        .mutable_content(false)
        .build()
        .map_err(|e| ApiError::ServerErr(e.to_string()))?;

    expo.send_push_notifications(expo_push_message)
        .await
        .map_err(|e| ApiError::ServerErr(e.to_string()))?;

    tracing::debug!(
        "send_push_notification: Sent push notification to tokens: {:?} {:?}",
        push_tokens,
        data.data
    );

    Ok(())
}
