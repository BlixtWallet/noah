use std::time::Duration;

use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use rand::Rng;
use random_word::Lang;
use serde::{Deserialize, Serialize};
use tokio::{sync::oneshot, time::timeout};
use validator::Validate;

use crate::{
    AppState,
    errors::ApiError,
    push::{PushNotificationData, send_push_notification},
    types::{
        AuthEvent, AuthPayload, NotificationTypes, NotificationsData, RegisterPayload,
        RegisterResponse,
    },
    utils::make_k1,
};

/// Represents the response for a `k1` request, used in LNURL-auth.
#[derive(Serialize, Deserialize)]
pub struct GetK1 {
    /// A unique, single-use secret for the authentication process.
    pub k1: String,
    /// The LNURL-auth tag, which is always "login".
    pub tag: String,
}

const MAX_K1_VALUES: usize = 110;
const K1_VALUES_TO_REMOVE: usize = 10;
const LNURLP_MIN_SENDABLE: u64 = 330000;
const LNURLP_MAX_SENDABLE: u64 = 100000000;
const COMMENT_ALLOWED_SIZE: u16 = 280;

/// Generates and returns a new `k1` value for an LNURL-auth flow.
///
/// The `k1` value is a random 32-byte hex-encoded string that is stored in memory
/// to be used once for a login or registration attempt. This endpoint also manages
/// the size of the `k1` cache to prevent it from growing indefinitely.
pub async fn get_k1(State(state): State<AppState>) -> anyhow::Result<Json<GetK1>, StatusCode> {
    let k1 = make_k1(state.k1_values.clone());

    // Keep the map size around 100
    if state.k1_values.len() > MAX_K1_VALUES {
        let mut entries: Vec<_> = state
            .k1_values
            .iter()
            .map(|e| (e.key().clone(), *e.value()))
            .collect();
        entries.sort_by_key(|&(_, time)| time);
        let keys_to_remove: Vec<String> = entries
            .iter()
            .take(K1_VALUES_TO_REMOVE)
            .map(|(key, _)| key.clone())
            .collect();

        for key in keys_to_remove {
            state.k1_values.remove(&key);
        }
    }

    Ok(Json(GetK1 {
        k1,
        tag: "login".to_string(),
    }))
}

/// Represents the first response in the LNURL-pay protocol.
///
/// This response provides the necessary details for a wallet to make a payment,
/// such as the callback URL, sendable amounts, and metadata.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LnurlpDefaultResponse {
    /// The URL where the wallet should send the second request.
    pub callback: String,
    /// The maximum amount that can be sent in a single payment, in millisatoshis.
    pub max_sendable: u64,
    /// The minimum amount that can be sent in a single payment, in millisatoshis.
    pub min_sendable: u64,
    /// A JSON string containing metadata about the payment.
    pub metadata: String,
    /// The LNURL-pay tag, which is always "payRequest".
    pub tag: String,
    /// The maximum length of a comment that can be included with the payment.
    pub comment_allowed: u16,
}

/// Represents the second response in the LNURL-pay protocol.
///
/// This response contains the BOLT11 invoice that the wallet will use to pay.
#[derive(Serialize)]
pub struct LnurlpInvoiceResponse {
    /// The BOLT11 payment request (invoice).
    pr: String,
    /// A list of routes for the payment, typically empty.
    routes: Vec<String>,
}

/// Defines the query parameters for an LNURL-pay request.
#[derive(Deserialize)]
pub struct LnurlpRequestQuery {
    /// The amount of the payment in millisatoshis.
    amount: Option<u64>,
}

/// Handles LNURL-pay requests.
///
/// This endpoint manages the two-step LNURL-pay flow. The first request (without an amount)
/// returns payment parameters. The second request (with an amount) triggers a push
/// notification to the user to generate an invoice, which is then returned to the payer.
pub async fn lnurlp_request(
    State(state): State<AppState>,
    Path(username): Path<String>,
    Query(query): Query<LnurlpRequestQuery>,
) -> anyhow::Result<axum::response::Json<serde_json::Value>, ApiError> {
    let lnurl_domain = &state.lnurl_domain;
    let lightning_address = format!("{}@{}", username, lnurl_domain);

    tracing::debug!("Lightning address is {}", lightning_address);

    let conn = state.db.connect()?;
    let mut rows = conn
        .query(
            "SELECT pubkey FROM users WHERE lightning_address = ?",
            libsql::params![lightning_address.clone()],
        )
        .await?;

    let pubkey = match rows.next().await? {
        Some(row) => row.get::<String>(0)?,
        None => return Err(ApiError::InvalidArgument("User not found".to_string())),
    };

    if query.amount.is_none() {
        let metadata = serde_json::json!([
            ["text/identifier", lightning_address],
            [
                "text/plain",
                format!("Paying satoshis to {}", lightning_address)
            ]
        ])
        .to_string();

        let response = LnurlpDefaultResponse {
            callback: format!("https://{}/.well-known/lnurlp/{}", lnurl_domain, username),
            min_sendable: LNURLP_MIN_SENDABLE,
            max_sendable: LNURLP_MAX_SENDABLE,
            metadata,
            tag: "payRequest".to_string(),
            comment_allowed: COMMENT_ALLOWED_SIZE,
        };
        return Ok(Json(
            serde_json::to_value(response).map_err(|e| ApiError::SerializeErr(e.to_string()))?,
        ));
    }

    let amount = query.amount.unwrap();

    if amount < LNURLP_MIN_SENDABLE {
        return Err(ApiError::InvalidArgument(format!(
            "Minimum invoice request is {} mSats",
            LNURLP_MIN_SENDABLE
        )));
    }

    if amount > LNURLP_MAX_SENDABLE {
        return Err(ApiError::InvalidArgument(format!(
            "Maximum invoice request is {} mSats",
            LNURLP_MAX_SENDABLE
        )));
    }

    let (tx, rx) = oneshot::channel();

    // TODO Nitesh:
    // This could be a retarded solution for now.
    // We are using two separate states for k1
    // One is signed from server, the other to just manage channel requests
    // Probably need a better solution

    let k1 = make_k1(state.k1_values.clone());
    state.invoice_data_transmitters.insert(k1.clone(), tx);

    let state_clone = state.clone();
    tokio::spawn(async move {
        let data = PushNotificationData {
            title: None,
            body: None,
            data: serde_json::to_string(&NotificationsData {
                notification_type: NotificationTypes::LightningInvoiceRequest,
                k1: Some(k1),
                amount: Some(amount),
                offboarding_request_id: None,
            })
            .unwrap(),
            priority: "high".to_string(),
            content_available: true,
        };
        if let Err(e) = send_push_notification(state_clone, data, Some(pubkey)).await {
            tracing::error!("Failed to send push notification: {}", e);
        }
    });

    tracing::debug!("Waiting for invoice with a 180s timeout...");
    let invoice = timeout(Duration::from_secs(180), rx)
        .await
        .map_err(|_| {
            tracing::error!("Invoice request timed out after 180s");
            ApiError::ServerErr("Request timed out".to_string())
        })?
        .map_err(|_| ApiError::ServerErr("Failed to receive invoice".to_string()))?;

    let response = LnurlpInvoiceResponse {
        pr: invoice,
        routes: vec![],
    };
    Ok(Json(
        serde_json::to_value(response).map_err(|e| ApiError::SerializeErr(e.to_string()))?,
    ))
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
) -> anyhow::Result<Json<RegisterResponse>, ApiError> {
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

        if let Some(device_info) = payload.device_info {
            // For existing users, we'll just register the device in its own transaction
            let tx = conn.transaction().await?;
            register_device(&tx, &auth_payload.key, &device_info).await?;
            tx.commit().await?;
        }

        return Ok(Json(RegisterResponse {
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

    let tx = conn.transaction().await?;

    tx.execute(
        "INSERT INTO users (pubkey, lightning_address) VALUES (?, ?)",
        libsql::params![auth_payload.key.clone(), ln_address.clone()],
    )
    .await?;

    if let Some(ref device_info) = payload.device_info {
        register_device(&tx, &auth_payload.key, device_info).await?;
    }

    tx.commit().await?;

    Ok(Json(RegisterResponse {
        status: "OK".to_string(),
        event: Some(AuthEvent::Registered),
        reason: None,
        lightning_address: Some(ln_address),
    }))
}

/// Registers a device's information.
///
/// This function inserts a new device record into the database within a given transaction.
async fn register_device(
    tx: &libsql::Transaction,
    pubkey: &str,
    device_info: &crate::types::DeviceInfo,
) -> anyhow::Result<()> {
    tx.execute(
        "INSERT INTO devices (pubkey, device_manufacturer, device_model, os_name, os_version, app_version)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(pubkey) DO UPDATE SET
             device_manufacturer = excluded.device_manufacturer,
             device_model = excluded.device_model,
             os_name = excluded.os_name,
             os_version = excluded.os_version,
             app_version = excluded.app_version,
             updated_at = CURRENT_TIMESTAMP",
        libsql::params![
            pubkey,
            device_info.device_manufacturer.clone(),
            device_info.device_model.clone(),
            device_info.os_name.clone(),
            device_info.os_version.clone(),
            device_info.app_version.clone()
        ],
    )
    .await?;
    Ok(())
}
