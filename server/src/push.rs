use anyhow::Context;
use axum::{Json, extract::State};
use expo_push_notification_client::{Expo, ExpoClientOptions, ExpoPushMessage};
use serde::{Deserialize, Serialize};
use std::str::FromStr;

use crate::{AppState, errors::ApiError, utils::verify_message};

#[derive(Deserialize)]
pub struct RegisterPushToken {
    pub push_token: String,
    pub pubkey: String,
    pub sig: String,
    pub k1: String,
}

pub async fn register_push_token(
    State(app_state): State<AppState>,
    Json(payload): Json<RegisterPushToken>,
) -> Result<(), ApiError> {
    tracing::debug!(
        "Received push token registration request: {:?}",
        payload.pubkey
    );

    let signature = bitcoin::secp256k1::ecdsa::Signature::from_str(&payload.sig)?;
    let public_key = bitcoin::secp256k1::PublicKey::from_str(&payload.pubkey)?;

    let is_valid = verify_message(&payload.k1, signature, &public_key).await?;

    if !is_valid {
        return Err(ApiError::InvalidSignature);
    }

    tracing::debug!(
        "Push token registration for pubkey: {} is valid",
        payload.pubkey
    );

    let mut rows = app_state
        .conn
        .query(
            "SELECT pubkey FROM users WHERE pubkey = ?",
            libsql::params![payload.pubkey.clone()],
        )
        .await?;

    if rows.next().await?.is_none() {
        return Err(ApiError::InvalidArgument("User not registered".to_string()));
    }

    app_state
        .conn
        .execute(
            "INSERT INTO push_tokens (pubkey, push_token) VALUES (?, ?) ON CONFLICT(pubkey) DO UPDATE SET push_token = excluded.push_token",
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
