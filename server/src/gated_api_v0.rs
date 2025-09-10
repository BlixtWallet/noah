use crate::s3_client::S3BackupClient;
use crate::types::{
    BackupInfo, BackupSettingsPayload, CompleteUploadPayload, DefaultSuccessPayload,
    DeleteBackupPayload, DownloadUrlResponse, GetDownloadUrlPayload, RegisterOffboardingResponse,
    ReportJobStatusPayload, SubmitInvoicePayload, UserInfoResponse,
};
use crate::{
    AppState,
    errors::ApiError,
    types::{
        AuthEvent, AuthPayload, GetUploadUrlPayload, LNUrlAuthResponse, RegisterPayload,
        RegisterPushToken, UpdateLnAddressPayload, UploadUrlResponse,
    },
};
use axum::{Extension, Json, extract::State};
use rand::Rng;
use random_word::Lang;
use uuid::Uuid;
use validator::Validate;

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

    Ok(Json(LNUrlAuthResponse {
        status: "OK".to_string(),
        event: Some(AuthEvent::Registered),
        reason: None,
        lightning_address: Some(ln_address),
    }))
}

/// Registers a push notification token for a user.
///
/// This endpoint associates a push token with a user's public key, allowing
/// the server to send push notifications to the user's device.
pub async fn register_push_token(
    State(app_state): State<AppState>,
    Extension(auth_payload): Extension<AuthPayload>,
    Json(payload): Json<RegisterPushToken>,
) -> anyhow::Result<Json<DefaultSuccessPayload>, ApiError> {
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

    Ok(Json(DefaultSuccessPayload { success: true }))
}

/// Receives and processes a BOLT11 invoice from a user's device.
///
/// After a user generates an invoice in response to a push notification,
/// this endpoint receives it and forwards it to the waiting payer.
pub async fn submit_invoice(
    State(state): State<AppState>,
    Extension(auth_payload): Extension<AuthPayload>,
    Json(payload): Json<SubmitInvoicePayload>,
) -> anyhow::Result<Json<DefaultSuccessPayload>, ApiError> {
    tracing::info!(
        "Received submit invoice request for pubkey: {} and k1: {}",
        auth_payload.key,
        auth_payload.k1
    );

    if let Some((_, tx)) = state.invoice_data_transmitters.remove(&auth_payload.k1) {
        tx.send(payload.invoice)
            .map_err(|_| ApiError::ServerErr("Failed to send invoice".to_string()))?;

        Ok(Json(DefaultSuccessPayload { success: true }))
    } else {
        Err(ApiError::InvalidArgument(
            "Payment request transaction not found".to_string(),
        ))
    }
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

/// Updates a user's lightning address.
///
/// This endpoint allows a user to update their lightning address.
pub async fn update_ln_address(
    State(state): State<AppState>,
    Extension(auth_payload): Extension<AuthPayload>,
    Json(payload): Json<UpdateLnAddressPayload>,
) -> anyhow::Result<Json<DefaultSuccessPayload>, ApiError> {
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

    Ok(Json(DefaultSuccessPayload { success: true }))
}

pub async fn get_upload_url(
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

pub async fn complete_upload(
    State(state): State<AppState>,
    Extension(auth_payload): Extension<AuthPayload>,
    Json(payload): Json<CompleteUploadPayload>,
) -> anyhow::Result<Json<DefaultSuccessPayload>, ApiError> {
    let conn = state.db.connect()?;
    conn.execute(
        "INSERT INTO backup_metadata (pubkey, s3_key, backup_size, backup_version) VALUES (?, ?, ?, ?)
         ON CONFLICT(pubkey, backup_version) DO UPDATE SET s3_key = excluded.s3_key, backup_size = excluded.backup_size, created_at = CURRENT_TIMESTAMP",
        libsql::params![auth_payload.key.clone(), payload.s3_key, payload.backup_size, payload.backup_version],
    )
    .await?;

    Ok(Json(DefaultSuccessPayload { success: true }))
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

pub async fn get_download_url(
    State(state): State<AppState>,
    Extension(auth_payload): Extension<AuthPayload>,
    Json(payload): Json<GetDownloadUrlPayload>,
) -> Result<Json<DownloadUrlResponse>, ApiError> {
    let conn = state.db.connect()?;
    let (s3_key, backup_size): (String, u64) = if let Some(version) = payload.backup_version {
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

pub async fn delete_backup(
    State(state): State<AppState>,
    Extension(auth_payload): Extension<AuthPayload>,
    Json(payload): Json<DeleteBackupPayload>,
) -> anyhow::Result<Json<DefaultSuccessPayload>, ApiError> {
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

    Ok(Json(DefaultSuccessPayload { success: true }))
}

pub async fn report_job_status(
    Extension(auth_payload): Extension<AuthPayload>,
    Json(payload): Json<ReportJobStatusPayload>,
) -> anyhow::Result<Json<DefaultSuccessPayload>, ApiError> {
    tracing::info!(
        "Received job status report from pubkey: {}. Report type: {:?}, Status: {:?}, Error: {:?}",
        auth_payload.key,
        payload.report_type,
        payload.status,
        payload.error_message
    );

    Ok(Json(DefaultSuccessPayload { success: true }))
}

pub async fn update_backup_settings(
    State(state): State<AppState>,
    Extension(auth_payload): Extension<AuthPayload>,
    Json(payload): Json<BackupSettingsPayload>,
) -> anyhow::Result<Json<DefaultSuccessPayload>, ApiError> {
    let conn = state.db.connect()?;
    conn.execute(
        "INSERT INTO backup_settings (pubkey, backup_enabled) VALUES (?, ?)
         ON CONFLICT(pubkey) DO UPDATE SET backup_enabled = excluded.backup_enabled",
        libsql::params![auth_payload.key.clone(), payload.backup_enabled],
    )
    .await?;

    Ok(Json(DefaultSuccessPayload { success: true }))
}

pub async fn register_offboarding_request(
    State(state): State<AppState>,
    Extension(auth_payload): Extension<AuthPayload>,
) -> anyhow::Result<Json<RegisterOffboardingResponse>, ApiError> {
    tracing::info!(
        "Received offboarding request for pubkey: {}",
        auth_payload.key
    );

    let request_id = Uuid::new_v4().to_string();

    let conn = state.db.connect()?;
    conn.execute(
        "INSERT INTO offboarding_requests (request_id, pubkey) VALUES (?, ?)",
        libsql::params![request_id.clone(), auth_payload.key],
    )
    .await?;

    Ok(Json(RegisterOffboardingResponse {
        success: true,
        request_id,
    }))
}

pub async fn deregister(
    State(state): State<AppState>,
    Extension(auth_payload): Extension<AuthPayload>,
) -> anyhow::Result<Json<DefaultSuccessPayload>, ApiError> {
    let conn = state.db.connect()?;
    let pubkey = auth_payload.key;

    tracing::info!("Deregistering user with pubkey: {}", pubkey);

    // Use a transaction to ensure all or nothing is deleted
    let tx = conn.transaction().await?;

    tx.execute(
        "DELETE FROM push_tokens WHERE pubkey = ?",
        libsql::params![pubkey.clone()],
    )
    .await?;
    tx.execute(
        "DELETE FROM offboarding_requests WHERE pubkey = ?",
        libsql::params![pubkey.clone()],
    )
    .await?;

    tx.commit().await?;

    Ok(Json(DefaultSuccessPayload { success: true }))
}
