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

    if !state.k1_values.contains_key(&payload.k1) {
        return Err(ApiError::InvalidArgument("Invalid k1".to_string()));
    }

    let signature = bitcoin::secp256k1::ecdsa::Signature::from_str(&payload.sig)?;

    let public_key = bitcoin::secp256k1::PublicKey::from_str(&payload.key)?;

    let is_valid = verify_message(&payload.k1, signature, &public_key).await?;

    tracing::debug!(
        "Registering user with pubkey: {} and k1: {}",
        payload.key,
        payload.k1
    );

    if !is_valid {
        return Err(ApiError::InvalidSignature);
    }

    tracing::debug!("Registration for pubkey: {} is valid", payload.key);

    let mut rows = conn
        .query(
            "SELECT pubkey FROM users WHERE pubkey = ?",
            libsql::params![payload.key.clone()],
        )
        .await?;

    if rows.next().await?.is_some() {
        tracing::debug!("User with pubkey: {} already registered", payload.key);
        return Ok(Json(LNUrlAuthResponse {
            status: "OK".to_string(),
            event: None,
            reason: Some("User already registered".to_string()),
        }));
    }

    conn.execute(
        "INSERT INTO users (pubkey) VALUES (?)",
        libsql::params![payload.key],
    )
    .await?;

    state.k1_values.remove(&payload.k1);

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
    let mut k1_bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut k1_bytes);
    let k1 = hex::encode(k1_bytes);

    state.k1_values.insert(k1.clone(), ());

    // Keep the map size around 100
    if state.k1_values.len() > 110 {
        let keys_to_remove: Vec<String> = state
            .k1_values
            .iter()
            .take(10)
            .map(|entry| entry.key().clone())
            .collect();

        for key in keys_to_remove {
            state.k1_values.remove(&key);
        }
    }

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
