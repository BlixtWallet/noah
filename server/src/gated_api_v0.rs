use crate::db::backup_repo::BackupRepository;
use crate::db::job_status_repo::JobStatusRepository;
use crate::db::offboarding_repo::OffboardingRepository;
use crate::db::push_token_repo::PushTokenRepository;
use crate::db::user_repo::UserRepository;
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
        AuthPayload, GetUploadUrlPayload, RegisterPushToken, UpdateLnAddressPayload,
        UploadUrlResponse,
    },
};
use axum::{Extension, Json, extract::State};
use uuid::Uuid;
use validator::Validate;

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
        "Received push registration request for public key: {}",
        auth_payload.key
    );

    let conn = app_state.db.connect()?;
    let push_token_repo = PushTokenRepository::new(&conn);
    push_token_repo
        .upsert(&auth_payload.key, &payload.push_token)
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
        "Received submit invoice request for pubkey: {} and transaction_id: {}",
        auth_payload.key,
        payload.transaction_id
    );

    if let Some((_, tx)) = state
        .invoice_data_transmitters
        .remove(&payload.transaction_id)
    {
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
    let user_repo = UserRepository::new(&conn);

    let user = user_repo
        .find_by_pubkey(&auth_payload.key)
        .await?
        .ok_or(ApiError::NotFound("User not found".to_string()))?;

    let lightning_address = user.lightning_address.ok_or(ApiError::NotFound(
        "User does not have a lightning address".to_string(),
    ))?;

    Ok(Json(UserInfoResponse { lightning_address }))
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
    let user_repo = UserRepository::new(&conn);

    let result = user_repo
        .update_lightning_address(&auth_payload.key, &payload.ln_address)
        .await;

    if let Err(e) = result {
        if e.is::<crate::db::user_repo::LightningAddressTakenError>() {
            return Err(ApiError::InvalidArgument(
                "Lightning address already taken".to_string(),
            ));
        }
        return Err(e.into());
    }

    Ok(Json(DefaultSuccessPayload { success: true }))
}

pub async fn get_upload_url(
    State(_state): State<AppState>,
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
    let backup_repo = BackupRepository::new(&conn);
    backup_repo
        .upsert_metadata(
            &auth_payload.key,
            &payload.s3_key,
            payload.backup_size,
            payload.backup_version,
        )
        .await?;

    Ok(Json(DefaultSuccessPayload { success: true }))
}

pub async fn list_backups(
    State(state): State<AppState>,
    Extension(auth_payload): Extension<AuthPayload>,
) -> Result<Json<Vec<BackupInfo>>, ApiError> {
    let conn = state.db.connect()?;
    let backup_repo = BackupRepository::new(&conn);
    let backups = backup_repo.list(&auth_payload.key).await?;
    Ok(Json(backups))
}

pub async fn get_download_url(
    State(state): State<AppState>,
    Extension(auth_payload): Extension<AuthPayload>,
    Json(payload): Json<GetDownloadUrlPayload>,
) -> Result<Json<DownloadUrlResponse>, ApiError> {
    let conn = state.db.connect()?;
    let backup_repo = BackupRepository::new(&conn);

    let (s3_key, backup_size) = if let Some(version) = payload.backup_version {
        backup_repo
            .find_by_version(&auth_payload.key, version)
            .await?
            .ok_or(ApiError::NotFound("Backup not found".to_string()))?
    } else {
        backup_repo
            .find_latest(&auth_payload.key)
            .await?
            .ok_or(ApiError::NotFound("Backup not found".to_string()))?
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
    let backup_repo = BackupRepository::new(&conn);

    let s3_key = backup_repo
        .find_s3_key_by_version(&auth_payload.key, payload.backup_version)
        .await?
        .ok_or(ApiError::NotFound("Backup not found".to_string()))?;

    let s3_client = S3BackupClient::new().await?;
    s3_client.delete_object(&s3_key).await?;

    backup_repo
        .delete_by_version(&auth_payload.key, payload.backup_version)
        .await?;

    Ok(Json(DefaultSuccessPayload { success: true }))
}

pub async fn report_job_status(
    State(app_state): State<AppState>,
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

    let conn = app_state.db.connect()?;
    let tx = conn.transaction().await?;

    JobStatusRepository::create_and_prune(
        &tx,
        &auth_payload.key,
        &payload.report_type,
        &payload.status,
        payload.error_message,
    )
    .await?;

    tx.commit().await?;

    Ok(Json(DefaultSuccessPayload { success: true }))
}

pub async fn update_backup_settings(
    State(state): State<AppState>,
    Extension(auth_payload): Extension<AuthPayload>,
    Json(payload): Json<BackupSettingsPayload>,
) -> anyhow::Result<Json<DefaultSuccessPayload>, ApiError> {
    let conn = state.db.connect()?;
    let backup_repo = BackupRepository::new(&conn);
    backup_repo
        .upsert_settings(&auth_payload.key, payload.backup_enabled)
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
    let offboarding_repo = OffboardingRepository::new(&conn);
    offboarding_repo
        .create_request(&request_id, &auth_payload.key)
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

    PushTokenRepository::delete_by_pubkey(&tx, &pubkey).await?;
    OffboardingRepository::delete_by_pubkey(&tx, &pubkey).await?;

    tx.commit().await?;

    Ok(Json(DefaultSuccessPayload { success: true }))
}
