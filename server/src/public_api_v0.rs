use std::time::{Duration, SystemTime};

use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use tokio::{sync::oneshot, time::timeout};

use crate::{
    AppState,
    errors::ApiError,
    push::{PushNotificationData, send_push_notification},
};

/// Represents the response for a `k1` request, used in LNURL-auth.
#[derive(Serialize)]
pub struct GetK1 {
    /// A unique, single-use secret for the authentication process.
    pub k1: String,
    /// The LNURL-auth tag, which is always "login".
    pub tag: String,
}

const MAX_K1_VALUES: usize = 110;
const K1_VALUES_TO_REMOVE: usize = 10;

/// Generates and returns a new `k1` value for an LNURL-auth flow.
///
/// The `k1` value is a random 32-byte hex-encoded string that is stored in memory
/// to be used once for a login or registration attempt. This endpoint also manages
/// the size of the `k1` cache to prevent it from growing indefinitely.
pub async fn get_k1(State(state): State<AppState>) -> anyhow::Result<Json<GetK1>, StatusCode> {
    let mut k1_bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut k1_bytes);
    let k1 = hex::encode(k1_bytes);

    state.k1_values.insert(k1.clone(), SystemTime::now());

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
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LnurlpDefaultResponse {
    /// The URL where the wallet should send the second request.
    callback: String,
    /// The maximum amount that can be sent in a single payment, in millisatoshis.
    max_sendable: u64,
    /// The minimum amount that can be sent in a single payment, in millisatoshis.
    min_sendable: u64,
    /// A JSON string containing metadata about the payment.
    metadata: String,
    /// The LNURL-pay tag, which is always "payRequest".
    tag: String,
    /// The maximum length of a comment that can be included with the payment.
    comment_allowed: u16,
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

    let mut rows = state
        .conn
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
            max_sendable: 100000000,
            min_sendable: 1000,
            metadata,
            tag: "payRequest".to_string(),
            comment_allowed: 280,
        };
        return Ok(Json(
            serde_json::to_value(response).map_err(|e| ApiError::SerializeErr(e.to_string()))?,
        ));
    }

    let amount = query.amount.unwrap();

    let (tx, rx) = oneshot::channel();
    let request_id = uuid::Uuid::new_v4().to_string();
    state.invoice_requests.insert(request_id.clone(), tx);

    let state_clone = state.clone();
    tokio::spawn(async move {
        let data = PushNotificationData {
            title: None,
            body: None,
            data: format!(
                r#"{{"type": "lightning-invoice-request", "request_id": "{}", "amount": {}}}"#,
                request_id, amount
            ),
            priority: "high".to_string(),
            content_available: true,
        };
        if let Err(e) = send_push_notification(state_clone, data, Some(pubkey)).await {
            tracing::error!("Failed to send push notification: {}", e);
        }
    });

    let invoice = timeout(Duration::from_secs(45), rx)
        .await
        .map_err(|_| ApiError::ServerErr("Request timed out".to_string()))?
        .map_err(|_| ApiError::ServerErr("Failed to receive invoice".to_string()))?;

    let response = LnurlpInvoiceResponse {
        pr: invoice,
        routes: vec![],
    };
    Ok(Json(
        serde_json::to_value(response).map_err(|e| ApiError::SerializeErr(e.to_string()))?,
    ))
}
