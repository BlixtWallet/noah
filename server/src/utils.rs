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
