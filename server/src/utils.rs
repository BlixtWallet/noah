use rand::RngCore;
use std::str::FromStr;

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

pub fn make_k1() -> String {
    let mut k1_bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut k1_bytes);
    let k1 = hex::encode(k1_bytes);
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    format!("{}_{}", k1, timestamp)
}
