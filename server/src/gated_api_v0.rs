use axum::{
    Json,
    extract::{Query, State},
};
use random_word::Lang;
use serde::{Deserialize, Serialize};

use crate::{AppState, errors::ApiError, utils::verify_auth};
use rand::Rng;

/// Represents events that can occur during LNURL-auth.
#[derive(Serialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum AuthEvent {
    /// Indicates that a user has been successfully registered.
    Registered,
}

/// Represents the response for an LNURL-auth request.
#[derive(Serialize)]
pub struct LNUrlAuthResponse {
    /// The status of the request, either "OK" or "ERROR".
    status: String,
    /// An optional event indicating the outcome of the authentication.
    #[serde(skip_serializing_if = "Option::is_none")]
    event: Option<AuthEvent>,
    /// An optional reason for an error, if one occurred.
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

/// Defines the payload for a user registration request.
#[derive(Deserialize, Debug)]
pub struct RegisterPayload {
    /// The user's public key.
    pub key: String,
    /// The signature proving ownership of the public key.
    pub sig: String,
    /// A unique, single-use secret for the authentication process.
    pub k1: String,
    /// User chosen lightning address
    pub ln_address: Option<String>,
}

/// Handles user registration via LNURL-auth.
///
/// This endpoint receives a user's public key, a signature, and a `k1` value.
/// It verifies the signature against the `k1` value and, if valid, registers
/// the user in the database.
pub async fn register(
    State(state): State<AppState>,
    Query(payload): Query<RegisterPayload>,
) -> anyhow::Result<Json<LNUrlAuthResponse>, ApiError> {
    let lnurl_domain = &state.lnurl_domain;

    let conn = &state.conn;

    if !state.k1_values.contains_key(&payload.k1) {
        return Err(ApiError::InvalidArgument("Invalid k1".to_string()));
    }

    let is_valid = verify_auth(payload.k1.clone(), payload.sig, payload.key.clone()).await?;

    if !is_valid {
        return Err(ApiError::InvalidSignature);
    }

    tracing::debug!(
        "Registering user with pubkey: {} and k1: {}",
        payload.key,
        payload.k1
    );

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

    let ln_address = payload.ln_address.unwrap_or_else(|| {
        let number = rand::rng().random_range(0..1000);
        format!("{}{}@{}", random_word::get(Lang::En), number, lnurl_domain)
    });

    conn.execute(
        "INSERT INTO users (pubkey, lightning_address) VALUES (?, ?)",
        libsql::params![payload.key, ln_address],
    )
    .await?;

    state.k1_values.remove(&payload.k1);

    Ok(Json(LNUrlAuthResponse {
        status: "OK".to_string(),
        event: Some(AuthEvent::Registered),
        reason: None,
    }))
}

/// Defines the payload for registering a push notification token.
#[derive(Deserialize)]
pub struct RegisterPushToken {
    /// The Expo push token for the user's device.
    pub push_token: String,
    /// The user's public key.
    pub key: String,
    /// The signature for authentication.
    pub sig: String,
    /// The `k1` value for authentication.
    pub k1: String,
}

/// Registers a push notification token for a user.
///
/// This endpoint associates a push token with a user's public key, allowing
/// the server to send push notifications to the user's device.
pub async fn register_push_token(
    State(app_state): State<AppState>,
    Json(payload): Json<RegisterPushToken>,
) -> Result<(), ApiError> {
    tracing::debug!(
        "Received push token registration request: {:?}",
        payload.key
    );

    let is_valid = verify_auth(payload.k1, payload.sig, payload.key.clone()).await?;

    if !is_valid {
        return Err(ApiError::InvalidSignature);
    }

    tracing::debug!(
        "Push token registration for pubkey: {} is valid",
        payload.key
    );

    let mut rows = app_state
        .conn
        .query(
            "SELECT pubkey FROM users WHERE pubkey = ?",
            libsql::params![payload.key.clone()],
        )
        .await?;

    if rows.next().await?.is_none() {
        return Err(ApiError::InvalidArgument("User not registered".to_string()));
    }

    app_state
        .conn
        .execute(
            "INSERT INTO push_tokens (pubkey, push_token) VALUES (?, ?) ON CONFLICT(pubkey) DO UPDATE SET push_token = excluded.push_token",
            libsql::params![payload.key, payload.push_token],
        )
        .await?;

    Ok(())
}

/// Defines the payload for submitting a BOLT11 invoice.
#[derive(Deserialize)]
pub struct SubmitInvoicePayload {
    /// The `k1` value that initiated the invoice request.
    k1: String,
    /// The BOLT11 invoice to be paid.
    invoice: String,
    /// The user's public key for authentication.
    key: String,
    /// The signature for authentication.
    sig: String,
}

/// Receives and processes a BOLT11 invoice from a user's device.
///
/// After a user generates an invoice in response to a push notification,
/// this endpoint receives it and forwards it to the waiting payer.
pub async fn submit_invoice(
    State(state): State<AppState>,
    Json(payload): Json<SubmitInvoicePayload>,
) -> Result<(), ApiError> {
    let is_valid = verify_auth(payload.k1.clone(), payload.sig, payload.key).await?;

    if !is_valid {
        return Err(ApiError::InvalidSignature);
    }

    if let Some((_, tx)) = state.invoice_requests.remove(&payload.k1) {
        tx.send(payload.invoice)
            .map_err(|_| ApiError::ServerErr("Failed to send invoice".to_string()))?;
    }
    Ok(())
}
