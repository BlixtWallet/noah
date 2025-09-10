use std::{str::FromStr, sync::Arc, time::SystemTime};

use dashmap::DashMap;
use rand::RngCore;

use crate::errors::ApiError;

pub async fn verify_message(
    message: &str,
    signature: bitcoin::secp256k1::ecdsa::Signature,
    public_key: &bitcoin::secp256k1::PublicKey,
) -> Result<bool, ApiError> {
    let hash = bitcoin::sign_message::signed_msg_hash(message);
    let secp = bitcoin::secp256k1::Secp256k1::new();
    let msg = bitcoin::secp256k1::Message::from_digest_slice(&hash[..])?;
    Ok(secp.verify_ecdsa(&msg, &signature, public_key).is_ok())
}

pub async fn verify_auth(
    k1: String,
    signature: String,
    public_key: String,
) -> anyhow::Result<bool> {
    let signature = bitcoin::secp256k1::ecdsa::Signature::from_str(&signature)?;
    let public_key = bitcoin::secp256k1::PublicKey::from_str(&public_key)?;

    let is_valid = verify_message(&k1, signature, &public_key).await?;

    Ok(is_valid)
}

pub fn make_k1(k1_values: Arc<DashMap<String, SystemTime>>) -> String {
    let mut k1_bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut k1_bytes);
    let k1 = hex::encode(k1_bytes);
    let timestamp = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let k1_with_timestamp = format!("{}_{}", k1, timestamp);
    k1_values.insert(k1_with_timestamp.clone(), SystemTime::now());
    k1_with_timestamp
}

pub async fn verify_user_exists(conn: &libsql::Connection, pubkey: &str) -> Result<bool, ApiError> {
    let mut rows = conn
        .query("SELECT pubkey FROM users WHERE pubkey = ?", [pubkey])
        .await
        .map_err(|e| {
            tracing::error!("Failed to query user: {}", e);
            ApiError::Database(e)
        })?;

    Ok(rows
        .next()
        .await
        .map_err(|e| {
            tracing::error!("Failed to get next row: {}", e);
            ApiError::Database(e)
        })?
        .is_some())
}
