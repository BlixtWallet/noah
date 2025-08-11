use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

use crate::AppState;

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
) -> Result<Json<LNUrlAuthResponse>, Json<LNUrlAuthResponse>> {
    let conn = &state.conn;

    let signature = bitcoin::secp256k1::ecdsa::Signature::from_str(&payload.sig).map_err(|e| {
        tracing::warn!("Register: failed to parse signature: {}", e);
        Json(LNUrlAuthResponse {
            status: "ERROR".to_string(),
            event: None,
            reason: Some("Failed to parse signature".to_string()),
        })
    })?;

    let public_key = bitcoin::secp256k1::PublicKey::from_str(&payload.key).map_err(|e| {
        tracing::warn!("Register: failed to parse public key: {}", e);
        Json(LNUrlAuthResponse {
            status: "ERROR".to_string(),
            event: None,
            reason: Some("Failed to parse public key".to_string()),
        })
    })?;

    let is_valid = verify_message(&payload.k1, signature, &public_key)
        .await
        .map_err(|e| {
            tracing::warn!("Register: failed to verify message: {}", e);
            Json(LNUrlAuthResponse {
                status: "ERROR".to_string(),
                event: None,
                reason: Some("Failed to verify message".to_string()),
            })
        })?;

    if !is_valid {
        return Err(Json(LNUrlAuthResponse {
            status: "ERROR".to_string(),
            event: None,
            reason: Some("Invalid signature".to_string()),
        }));
    }

    conn.execute(
        "INSERT INTO users (pubkey) VALUES (?)",
        libsql::params![payload.key],
    )
    .await
    .map_err(|e| {
        tracing::error!("Register: failed to insert user: {}", e);
        Json(LNUrlAuthResponse {
            status: "ERROR".to_string(),
            event: None,
            reason: Some("Failed to register user".to_string()),
        })
    })?;

    conn.execute(
        "DELETE FROM k1_values WHERE k1 = ?",
        libsql::params![payload.k1],
    )
    .await
    .map_err(|e| {
        tracing::error!("Register: failed to delete k1: {}", e);
        Json(LNUrlAuthResponse {
            status: "ERROR".to_string(),
            event: None,
            reason: Some("Failed to finalize registration".to_string()),
        })
    })?;

    Ok(Json(LNUrlAuthResponse {
        status: "OK".to_string(),
        event: Some(AuthEvent::Registered),
        reason: None,
    }))
}

pub async fn health_check() -> StatusCode {
    StatusCode::OK
}

#[derive(Serialize)]
pub struct GetK1 {
    pub k1: String,
    pub tag: String,
}

pub async fn get_k1(State(state): State<AppState>) -> Result<Json<GetK1>, StatusCode> {
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

pub async fn verify_message(
    message: &str,
    signature: bitcoin::secp256k1::ecdsa::Signature,
    public_key: &bitcoin::secp256k1::PublicKey,
) -> anyhow::Result<bool> {
    let hash = bitcoin::sign_message::signed_msg_hash(message);
    let secp = bitcoin::secp256k1::Secp256k1::new();
    let msg = bitcoin::secp256k1::Message::from_digest_slice(&hash[..]).unwrap();
    Ok(secp.verify_ecdsa(&msg, &signature, &public_key).is_ok())
}
