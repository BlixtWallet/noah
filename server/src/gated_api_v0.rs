use axum::{Extension, Json, extract::State};
use random_word::Lang;
use serde::{Deserialize, Serialize};
use validator::Validate;

use crate::{AppState, app_middleware::AuthPayload, errors::ApiError};
use rand::Rng;

/// Represents events that can occur during LNURL-auth.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum AuthEvent {
    /// Indicates that a user has been successfully registered.
    Registered,
}

/// Represents the response for an LNURL-auth request.
#[derive(Serialize, Deserialize)]
pub struct LNUrlAuthResponse {
    /// The status of the request, either "OK" or "ERROR".
    pub status: String,
    /// An optional event indicating the outcome of the authentication.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event: Option<AuthEvent>,
    /// An optional reason for an error, if one occurred.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
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
    if let Some(_ln_address) = &payload.ln_address {
        if let Err(e) = payload.validate() {
            return Err(ApiError::InvalidArgument(e.to_string()));
        }
    }

    let lnurl_domain = &state.lnurl_domain;

    let conn = state.db.connect()?;

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

    let conn = app_state.db.connect()?;
    let mut rows = conn
        .query(
            "SELECT pubkey FROM users WHERE pubkey = ?",
            libsql::params![auth_payload.key.clone()],
        )
        .await?;

    if rows.next().await?.is_none() {
        return Err(ApiError::InvalidArgument("User not registered".to_string()));
    }

    conn
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
    tracing::info!(
        "Received submit invoice request for pubkey: {} and k1: {}",
        auth_payload.key,
        auth_payload.k1
    );

    if let Some((_, tx)) = state.invoice_data_transmitters.remove(&auth_payload.k1) {
        state.k1_values.remove(&auth_payload.k1);

        tx.send(payload.invoice)
            .map_err(|_| ApiError::ServerErr("Failed to send invoice".to_string()))?;

        Ok(())
    } else {
        Err(ApiError::InvalidArgument(
            "Payment request transaction not found".to_string(),
        ))
    }
}

/// Represents the response for a user's information.
#[derive(Serialize, Deserialize)]
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
    let conn = state.db.connect()?;
    let mut rows = conn
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

    let conn = state.db.connect()?;
    let mut rows = conn
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

    let conn = state.db.connect()?;
    conn.execute(
        "UPDATE users SET lightning_address = ? WHERE pubkey = ?",
        libsql::params![payload.ln_address, auth_payload.key],
    )
    .await?;

    Ok(())
}

use crate::s3_client::S3BackupClient;

#[derive(Deserialize)]
pub struct GetUploadUrlPayload {
    pub backup_version: i32, // 1 or 2 (rolling)
    pub backup_size: i64,    // For validation
}

#[derive(Serialize)]
pub struct UploadUrlResponse {
    pub upload_url: String, // Pre-signed S3 URL
    pub s3_key: String,     // S3 object key
}

pub async fn get_upload_url(
    State(state): State<AppState>,
    Extension(auth_payload): Extension<AuthPayload>,
    Json(payload): Json<GetUploadUrlPayload>,
) -> Result<Json<UploadUrlResponse>, ApiError> {
    let s3_client = S3BackupClient::new().await?;
    let s3_key = format!(
        "{}/backup_v{}.db",
        auth_payload.key.clone(),
        payload.backup_version
    );
    let upload_url = s3_client.generate_upload_url(&s3_key).await?;

    Ok(Json(UploadUrlResponse { upload_url, s3_key }))
}

#[derive(Deserialize)]
pub struct CompleteUploadPayload {
    pub s3_key: String,
    pub backup_version: i32,
    pub backup_size: i64,
}

pub async fn complete_upload(
    State(state): State<AppState>,
    Extension(auth_payload): Extension<AuthPayload>,
    Json(payload): Json<CompleteUploadPayload>,
) -> Result<(), ApiError> {
    let conn = state.db.connect()?;
    conn.execute(
        "INSERT INTO backup_metadata (pubkey, s3_key, backup_size, backup_version) VALUES (?, ?, ?, ?)
         ON CONFLICT(pubkey, backup_version) DO UPDATE SET s3_key = excluded.s3_key, backup_size = excluded.backup_size, created_at = CURRENT_TIMESTAMP",
        libsql::params![auth_payload.key.clone(), payload.s3_key, payload.backup_size, payload.backup_version],
    )
    .await?;

    Ok(())
}

#[derive(Serialize)]
pub struct BackupInfo {
    pub backup_version: i32,
    pub created_at: String,
    pub backup_size: i64,
}

pub async fn list_backups(
    State(state): State<AppState>,
    Extension(auth_payload): Extension<AuthPayload>,
) -> Result<Json<Vec<BackupInfo>>, ApiError> {
    let conn = state.db.connect()?;
    let mut rows = conn
        .query(
            "SELECT backup_version, created_at, backup_size FROM backup_metadata WHERE pubkey = ?",
            libsql::params![auth_payload.key.clone()],
        )
        .await?;

    let mut backups = Vec::new();
    while let Some(row) = rows.next().await? {
        backups.push(BackupInfo {
            backup_version: row.get(0)?,
            created_at: row.get(1)?,
            backup_size: row.get(2)?,
        });
    }

    Ok(Json(backups))
}

#[derive(Deserialize)]
pub struct GetDownloadUrlPayload {
    pub backup_version: Option<i32>, // None = latest
}

#[derive(Serialize)]
pub struct DownloadUrlResponse {
    pub download_url: String, // Pre-signed S3 URL
    pub backup_size: i64,
}

pub async fn get_download_url(
    State(state): State<AppState>,
    Extension(auth_payload): Extension<AuthPayload>,
    Json(payload): Json<GetDownloadUrlPayload>,
) -> Result<Json<DownloadUrlResponse>, ApiError> {
    let conn = state.db.connect()?;
    let (s3_key, backup_size): (String, i64) = if let Some(version) = payload.backup_version {
        let mut row = conn.query("SELECT s3_key, backup_size FROM backup_metadata WHERE pubkey = ? AND backup_version = ?", libsql::params![auth_payload.key.clone(), version]).await?;
        if let Some(row) = row.next().await? {
            (row.get(0)?, row.get(1)?)
        } else {
            return Err(ApiError::NotFound("Backup not found".to_string()));
        }
    } else {
        let mut row = conn.query("SELECT s3_key, backup_size FROM backup_metadata WHERE pubkey = ? ORDER BY created_at DESC LIMIT 1", libsql::params![auth_payload.key.clone()]).await?;
        if let Some(row) = row.next().await? {
            (row.get(0)?, row.get(1)?)
        } else {
            return Err(ApiError::NotFound("Backup not found".to_string()));
        }
    };

    let s3_client = S3BackupClient::new().await?;
    let download_url = s3_client.generate_download_url(&s3_key).await?;

    Ok(Json(DownloadUrlResponse {
        download_url,
        backup_size,
    }))
}

#[derive(Deserialize)]
pub struct DeleteBackupPayload {
    pub backup_version: i32,
}

pub async fn delete_backup(
    State(state): State<AppState>,
    Extension(auth_payload): Extension<AuthPayload>,
    Json(payload): Json<DeleteBackupPayload>,
) -> Result<(), ApiError> {
    let conn = state.db.connect()?;
    let s3_key: String = {
        let mut row = conn
            .query(
                "SELECT s3_key FROM backup_metadata WHERE pubkey = ? AND backup_version = ?",
                libsql::params![auth_payload.key.clone(), payload.backup_version],
            )
            .await?;
        if let Some(row) = row.next().await? {
            row.get(0)?
        } else {
            return Err(ApiError::NotFound("Backup not found".to_string()));
        }
    };

    let s3_client = S3BackupClient::new().await?;
    s3_client.delete_object(&s3_key).await?;

    conn.execute(
        "DELETE FROM backup_metadata WHERE pubkey = ? AND backup_version = ?",
        libsql::params![auth_payload.key.clone(), payload.backup_version],
    )
    .await?;

    Ok(())
}

#[derive(Deserialize)]
pub struct BackupSettingsPayload {
    pub backup_enabled: bool,
}

pub async fn update_backup_settings(
    State(state): State<AppState>,
    Extension(auth_payload): Extension<AuthPayload>,
    Json(payload): Json<BackupSettingsPayload>,
) -> Result<(), ApiError> {
    let conn = state.db.connect()?;
    conn.execute(
        "INSERT INTO backup_settings (pubkey, backup_enabled) VALUES (?, ?)
         ON CONFLICT(pubkey) DO UPDATE SET backup_enabled = excluded.backup_enabled",
        libsql::params![auth_payload.key.clone(), payload.backup_enabled],
    )
    .await?;

    Ok(())
}
