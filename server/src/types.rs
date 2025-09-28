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

/// Represents the response for an user registration.
#[derive(Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
pub struct RegisterResponse {
    /// The status of the request, either "OK" or "ERROR".
    pub status: String,
    /// An optional event indicating the outcome of the authentication.
    pub event: Option<AuthEvent>,
    /// An optional reason for an error, if one occurred.
    pub reason: Option<String>,
    /// The user's lightning address.
    pub lightning_address: Option<String>,
}

/// Defines device information captured during registration.
#[derive(Serialize, Deserialize, TS, Debug)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
pub struct DeviceInfo {
    pub device_manufacturer: Option<String>,
    pub device_model: Option<String>,
    pub os_name: Option<String>,
    pub os_version: Option<String>,
    pub app_version: Option<String>,
}

/// Defines the payload for a user registration request.
#[derive(Serialize, Deserialize, TS, Validate)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
pub struct RegisterPayload {
    /// User chosen lightning address
    #[validate(email)]
    pub ln_address: Option<String>,
    /// Optional device information.
    pub device_info: Option<DeviceInfo>,
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
    /// The unique identifier for the payment transaction.
    pub transaction_id: String,
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
    Offboarding,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
#[serde(rename_all = "camelCase")]
pub enum ReportStatus {
    Success,
    Failure,
}

#[derive(Debug, Serialize, Deserialize, TS, Clone)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
pub struct MaintenanceNotification {
    pub k1: String,
}

#[derive(Debug, Serialize, Deserialize, TS, Clone)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
pub struct LightningInvoiceRequestNotification {
    pub k1: String,
    pub transaction_id: String,
    #[ts(type = "number")]
    pub amount: u64,
}

#[derive(Debug, Serialize, Deserialize, TS, Clone)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
pub struct BackupTriggerNotification {
    pub k1: String,
}

#[derive(Debug, Serialize, Deserialize, TS, Clone)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
pub struct OffboardingNotification {
    pub k1: String,
    pub offboarding_request_id: String,
}

#[derive(Debug, Serialize, Deserialize, TS, Clone)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
pub struct HeartbeatNotification {
    pub k1: String,
    pub notification_id: String,
}

// Enum wrapper for all notification types
#[derive(Debug, Serialize, Deserialize, TS, Clone)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
#[serde(tag = "notification_type", rename_all = "snake_case")]
pub enum NotificationData {
    Maintenance(MaintenanceNotification),
    LightningInvoiceRequest(LightningInvoiceRequestNotification),
    BackupTrigger(BackupTriggerNotification),
    Offboarding(OffboardingNotification),
    Heartbeat(HeartbeatNotification),
}

impl NotificationData {
    /// Check if this notification needs a unique k1 per device
    pub fn needs_unique_k1(&self) -> bool {
        matches!(
            self,
            NotificationData::Maintenance(_)
                | NotificationData::BackupTrigger(_)
                | NotificationData::Offboarding(_)
                | NotificationData::Heartbeat(_)
        )
    }

    /// Set the k1 value for notifications that require it
    pub fn set_k1(&mut self, k1: String) {
        match self {
            NotificationData::Maintenance(n) => n.k1 = k1,
            NotificationData::BackupTrigger(n) => n.k1 = k1,
            NotificationData::Offboarding(n) => n.k1 = k1,
            NotificationData::Heartbeat(n) => n.k1 = k1,
            NotificationData::LightningInvoiceRequest(n) => n.k1 = k1,
        }
    }
}

// Legacy support - keeping the old structure for backward compatibility if needed
#[derive(Debug, Serialize, Deserialize, TS, Clone)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
#[serde(rename_all = "snake_case")]
pub enum NotificationTypes {
    Maintenance,
    LightningInvoiceRequest,
    BackupTrigger,
    Offboarding,
    Heartbeat,
}

#[derive(Debug, Deserialize, Validate, TS)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
pub struct HeartbeatResponsePayload {
    pub notification_id: String,
}

#[derive(Debug, Serialize, Deserialize, TS)]
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

#[derive(Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/serverTypes.ts")]
pub struct RegisterOffboardingResponse {
    pub success: bool,
    pub request_id: String,
}
