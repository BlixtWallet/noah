use serde::{Deserialize, Serialize};
use ts_rs::TS;
use validator::Validate;

#[derive(Deserialize, Debug, Clone, TS)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
pub struct AuthPayload {
    pub key: String,
    pub sig: String,
    pub k1: String,
}

/// Represents events that can occur during LNURL-auth.
#[derive(Serialize, Deserialize, TS)]
#[serde(rename_all = "UPPERCASE")]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
pub enum AuthEvent {
    /// Indicates that a user has been successfully registered.
    Registered,
}

/// Represents the response for an LNURL-auth request.
#[derive(Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
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
#[derive(Serialize, Deserialize, TS, Validate)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
pub struct RegisterPayload {
    /// User chosen lightning address
    #[validate(email)]
    pub ln_address: Option<String>,
}

/// Defines the payload for registering a push notification token.
#[derive(Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
pub struct RegisterPushToken {
    /// The Expo push token for the user's device.
    pub push_token: String,
}

/// Represents the response for a user's information.
#[derive(Serialize, Deserialize)]
pub struct UserInfoResponse {
    /// The user's lightning address.
    pub lightning_address: String,
}

/// Defines the payload for submitting a BOLT11 invoice.
#[derive(Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
pub struct SubmitInvoicePayload {
    /// The BOLT11 invoice to be paid.
    pub invoice: String,
}

/// Defines the payload for updating a user's lightning address.
#[derive(Serialize, Deserialize, TS, Validate)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
pub struct UpdateLnAddressPayload {
    /// The new lightning address for the user.
    #[validate(email)]
    pub ln_address: String,
}

#[derive(Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
pub struct GetUploadUrlPayload {
    pub backup_version: i32, // 1 or 2 (rolling)
}

#[derive(Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
pub struct UploadUrlResponse {
    pub upload_url: String, // Pre-signed S3 URL
    pub s3_key: String,     // S3 object key
}

#[derive(Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
pub struct CompleteUploadPayload {
    pub s3_key: String,
    pub backup_version: i32,
    #[ts(type = "number")]
    pub backup_size: u64,
}

#[derive(Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
pub struct BackupInfo {
    pub backup_version: i32,
    pub created_at: String,
    #[ts(type = "number")]
    pub backup_size: u64,
}

#[derive(Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
pub struct GetDownloadUrlPayload {
    pub backup_version: Option<i32>, // None = latest
}

#[derive(Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
pub struct DownloadUrlResponse {
    pub download_url: String, // Pre-signed S3 URL
    #[ts(type = "number")]
    pub backup_size: u64,
}

#[derive(Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
pub struct DeleteBackupPayload {
    pub backup_version: i32,
}

#[derive(Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
pub struct BackupSettingsPayload {
    pub backup_enabled: bool,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
#[serde(rename_all = "camelCase")]
pub enum ReportType {
    Maintenance,
    Backup,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
#[serde(rename_all = "camelCase")]
pub enum ReportStatus {
    Success,
    Failure,
}

#[derive(Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
pub struct ReportJobStatusPayload {
    pub report_type: ReportType,
    pub status: ReportStatus,
    pub error_message: Option<String>,
}

#[derive(Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
pub struct DefaultSuccessPayload {
    pub success: bool,
}
