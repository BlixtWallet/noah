use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::str::{self, FromStr};

use crate::{AppState, errors::ApiError, utils::verify_message};

#[derive(Serialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum AuthEvent {
    Registered,
}

#[derive(Serialize)]
pub struct LNUrlAuthResponse {
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    event: Option<AuthEvent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct RegisterPayload {
    pub key: String,
    pub sig: String,
    pub k1: String,
}

pub async fn register(
    State(state): State<AppState>,
    Query(payload): Query<RegisterPayload>,
) -> anyhow::Result<Json<LNUrlAuthResponse>, ApiError> {
    let conn = &state.conn;

    let signature = bitcoin::secp256k1::ecdsa::Signature::from_str(&payload.sig)?;

    let public_key = bitcoin::secp256k1::PublicKey::from_str(&payload.key)?;

    let is_valid = verify_message(&payload.k1, signature, &public_key).await?;

    if !is_valid {
        return Err(ApiError::InvalidSignature);
    }

    conn.execute(
        "INSERT INTO users (pubkey) VALUES (?)",
        libsql::params![payload.key],
    )
    .await?;

    conn.execute(
        "DELETE FROM k1_values WHERE k1 = ?",
        libsql::params![payload.k1],
    )
    .await?;

    Ok(Json(LNUrlAuthResponse {
        status: "OK".to_string(),
        event: Some(AuthEvent::Registered),
        reason: None,
    }))
}

#[derive(Serialize)]
pub struct HealthCheckResponse {
    status: String,
    message: String,
}

pub async fn health_check() -> Result<Json<HealthCheckResponse>, StatusCode> {
    Ok(Json(HealthCheckResponse {
        status: "OK".to_string(),
        message: "Server is running".to_string(),
    }))
}

#[derive(Serialize)]
pub struct GetK1 {
    pub k1: String,
    pub tag: String,
}

pub async fn get_k1(State(state): State<AppState>) -> anyhow::Result<Json<GetK1>, StatusCode> {
    let conn = &state.conn;
    let mut k1_bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut k1_bytes);
    let k1 = hex::encode(k1_bytes);

    conn.execute(
        "INSERT INTO k1_values (k1) VALUES (?)",
        libsql::params![k1.clone()],
    )
    .await
    .map_err(|e| {
        tracing::error!("GetK1: failed to insert k1: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(GetK1 {
        k1,
        tag: "login".to_string(),
    }))
}

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
