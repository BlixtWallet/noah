use anyhow::Context;
use axum::{Json, extract::State};
use expo_push_notification_client::{Expo, ExpoClientOptions, ExpoPushMessage};
use serde::{Deserialize, Serialize};

use crate::{AppState, errors::ApiError};

#[derive(Deserialize)]
pub struct RegisterPushToken {
    pub push_token: String,
    pub pubkey: String,
}

pub async fn register_push_token(
    State(app_state): State<AppState>,
    Json(payload): Json<RegisterPushToken>,
) -> Result<(), ApiError> {
    app_state
        .conn
        .execute(
            "INSERT INTO push_tokens (pubkey, push_token) VALUES (?, ?)",
            libsql::params![payload.pubkey, payload.push_token],
        )
        .await?;

    Ok(())
}

#[derive(Serialize)]
struct Data {
    data: String,
}

pub async fn send_push_notification(
    State(app_state): State<AppState>,
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

    let expo_push_message = ExpoPushMessage::builder(push_tokens)
        .body("Silent push to trigger background sync")
        .data(&Data {
            data: "{}".to_string(),
        })
        .map_err(|e| ApiError::SerializeErr(e.to_string()))?
        .priority("high")
        .mutable_content(true)
        .build()
        .map_err(|e| ApiError::ServerErr(e.to_string()))?;

    expo.send_push_notifications(expo_push_message)
        .await
        .map_err(|e| ApiError::ServerErr(e.to_string()))?;

    Ok(())
}
