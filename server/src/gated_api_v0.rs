use axum::{Extension, Json, extract::State};
use random_word::Lang;
use serde::{Deserialize, Serialize};
use validator::Validate;

use crate::{AppState, app_middleware::AuthPayload, errors::ApiError};
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
    /// The user's lightning address.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lightning_address: Option<String>,
}

/// Defines the payload for a user registration request.
#[derive(Deserialize, Debug, Validate)]
pub struct RegisterPayload {
    /// User chosen lightning address
    #[validate(email)]
    pub ln_address: Option<String>,
}

/// Handles user registration via LNURL-auth.
///
/// This endpoint receives a user's public key, a signature, and a `k1` value.
/// It verifies the signature against the `k1` value and, if valid, registers
/// the user in the database.
pub async fn register(
    State(state): State<AppState>,
    Extension(auth_payload): Extension<AuthPayload>,
    Json(payload): Json<RegisterPayload>,
) -> anyhow::Result<Json<LNUrlAuthResponse>, ApiError> {
    if let Some(ln_address) = &payload.ln_address {
        if let Err(e) = payload.validate() {
            return Err(ApiError::InvalidArgument(e.to_string()));
        }
    }
    let lnurl_domain = &state.lnurl_domain;

    let conn = &state.conn;

    tracing::debug!(
        "Registering user with pubkey: {} and k1: {}",
        auth_payload.key,
        auth_payload.k1,
    );

    let mut rows = conn
        .query(
            "SELECT pubkey FROM users WHERE pubkey = ?",
            libsql::params![auth_payload.key.clone()],
        )
        .await?;

    if rows.next().await?.is_some() {
        tracing::debug!("User with pubkey: {} already registered", auth_payload.key);
        let mut rows = conn
            .query(
                "SELECT lightning_address FROM users WHERE pubkey = ?",
                libsql::params![auth_payload.key.clone()],
            )
            .await?;

        let lightning_address: Option<String> = if let Some(row) = rows.next().await? {
            Some(row.get(0)?)
        } else {
            None
        };

        return Ok(Json(LNUrlAuthResponse {
            status: "OK".to_string(),
            event: None,
            reason: Some("User already registered".to_string()),
            lightning_address,
        }));
    }

    let ln_address = payload.ln_address.unwrap_or_else(|| {
        let number = rand::rng().random_range(0..1000);
        format!("{}{}@{}", random_word::get(Lang::En), number, lnurl_domain)
    });

    conn.execute(
        "INSERT INTO users (pubkey, lightning_address) VALUES (?, ?)",
        libsql::params![auth_payload.key, ln_address.clone()],
    )
    .await?;

    state.k1_values.remove(&auth_payload.k1);

    Ok(Json(LNUrlAuthResponse {
        status: "OK".to_string(),
        event: Some(AuthEvent::Registered),
        reason: None,
        lightning_address: Some(ln_address),
    }))
}

/// Defines the payload for registering a push notification token.
#[derive(Deserialize)]
pub struct RegisterPushToken {
    /// The Expo push token for the user's device.
    pub push_token: String,
}

/// Registers a push notification token for a user.
///
/// This endpoint associates a push token with a user's public key, allowing
/// the server to send push notifications to the user's device.
pub async fn register_push_token(
    State(app_state): State<AppState>,
    Extension(auth_payload): Extension<AuthPayload>,
    Json(payload): Json<RegisterPushToken>,
) -> Result<(), ApiError> {
    tracing::debug!(
        "Received push token registration request for pubkey: {}",
        auth_payload.key
    );

    let mut rows = app_state
        .conn
        .query(
            "SELECT pubkey FROM users WHERE pubkey = ?",
            libsql::params![auth_payload.key.clone()],
        )
        .await?;

    if rows.next().await?.is_none() {
        return Err(ApiError::InvalidArgument("User not registered".to_string()));
    }

    app_state
        .conn
        .execute(
            "INSERT INTO push_tokens (pubkey, push_token) VALUES (?, ?) ON CONFLICT(pubkey) DO UPDATE SET push_token = excluded.push_token",
            libsql::params![auth_payload.key, payload.push_token],
        )
        .await?;

    Ok(())
}

/// Defines the payload for submitting a BOLT11 invoice.
#[derive(Deserialize)]
pub struct SubmitInvoicePayload {
    /// The BOLT11 invoice to be paid.
    pub invoice: String,
}

/// Receives and processes a BOLT11 invoice from a user's device.
///
/// After a user generates an invoice in response to a push notification,
/// this endpoint receives it and forwards it to the waiting payer.
pub async fn submit_invoice(
    State(state): State<AppState>,
    Extension(auth_payload): Extension<AuthPayload>,
    Json(payload): Json<SubmitInvoicePayload>,
) -> Result<(), ApiError> {
    tracing::debug!(
        "Received submit invoice request for pubkey: {} and k1: {}",
        auth_payload.key,
        auth_payload.k1
    );

    if let Some((_, tx)) = state.invoice_data_transmitters.remove(&auth_payload.k1) {
        state.k1_values.remove(&auth_payload.k1);

        tx.send(payload.invoice)
            .map_err(|_| ApiError::ServerErr("Failed to send invoice".to_string()))?;
    }
    Ok(())
}

/// Represents the response for a user's information.
#[derive(Serialize)]
pub struct UserInfoResponse {
    /// The user's lightning address.
    pub lightning_address: String,
}

/// Retrieves the user's information.
///
/// This endpoint returns the user's lightning address.
pub async fn get_user_info(
    State(state): State<AppState>,
    Extension(auth_payload): Extension<AuthPayload>,
) -> anyhow::Result<Json<UserInfoResponse>, ApiError> {
    let mut rows = state
        .conn
        .query(
            "SELECT lightning_address FROM users WHERE pubkey = ?",
            libsql::params![auth_payload.key.clone()],
        )
        .await?;

    if let Some(row) = rows.next().await? {
        let lightning_address: String = row.get(0)?;
        Ok(Json(UserInfoResponse { lightning_address }))
    } else {
        Err(ApiError::InvalidArgument("User not found".to_string()))
    }
}

/// Defines the payload for updating a user's lightning address.
#[derive(Deserialize, Validate)]
pub struct UpdateLnAddressPayload {
    /// The new lightning address for the user.
    #[validate(email)]
    pub ln_address: String,
}

/// Updates a user's lightning address.
///
/// This endpoint allows a user to update their lightning address.
pub async fn update_ln_address(
    State(state): State<AppState>,
    Extension(auth_payload): Extension<AuthPayload>,
    Json(payload): Json<UpdateLnAddressPayload>,
) -> Result<(), ApiError> {
    if let Err(e) = payload.validate() {
        return Err(ApiError::InvalidArgument(e.to_string()));
    }
    let mut rows = state
        .conn
        .query(
            "SELECT pubkey FROM users WHERE lightning_address = ?",
            libsql::params![payload.ln_address.clone()],
        )
        .await?;

    if rows.next().await?.is_some() {
        return Err(ApiError::InvalidArgument(
            "Lightning address already taken".to_string(),
        ));
    }

    state
        .conn
        .execute(
            "UPDATE users SET lightning_address = ? WHERE pubkey = ?",
            libsql::params![payload.ln_address, auth_payload.key],
        )
        .await?;

    Ok(())
}
