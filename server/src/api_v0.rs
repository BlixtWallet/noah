use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
use serde_json;

use crate::{
    AppState,
    errors::ApiError,
    push::{PushNotificationData, send_push_notification},
    utils::verify_auth,
};
use axum::extract::Path;
use rand::RngCore;
use std::time::Duration;
use std::time::SystemTime;
use tokio::{sync::oneshot, time::timeout};

#[derive(Serialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum AuthEvent {
    Registered,
}

#[derive(Serialize)]
pub struct LNUrlAuthResponse {
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    event: Option<AuthEvent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct RegisterPayload {
    pub key: String,
    pub sig: String,
    pub k1: String,
}

pub async fn register(
    State(state): State<AppState>,
    Query(payload): Query<RegisterPayload>,
) -> anyhow::Result<Json<LNUrlAuthResponse>, ApiError> {
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

    if !is_valid {
        return Err(ApiError::InvalidSignature);
    }

    tracing::debug!("Registration for pubkey: {} is valid", payload.key);

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

    conn.execute(
        "INSERT INTO users (pubkey) VALUES (?)",
        libsql::params![payload.key],
    )
    .await?;

    state.k1_values.remove(&payload.k1);

    Ok(Json(LNUrlAuthResponse {
        status: "OK".to_string(),
        event: Some(AuthEvent::Registered),
        reason: None,
    }))
}

#[derive(Serialize)]
pub struct HealthCheckResponse {
    status: String,
    message: String,
}

pub async fn health_check() -> Result<Json<HealthCheckResponse>, StatusCode> {
    Ok(Json(HealthCheckResponse {
        status: "OK".to_string(),
        message: "Server is running".to_string(),
    }))
}

#[derive(Serialize)]
pub struct GetK1 {
    pub k1: String,
    pub tag: String,
}

const MAX_K1_VALUES: usize = 110;
const K1_VALUES_TO_REMOVE: usize = 10;

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

#[derive(Deserialize)]
pub struct RegisterPushToken {
    pub push_token: String,
    pub key: String,
    pub sig: String,
    pub k1: String,
}

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LnurlpFirstResponse {
    callback: String,
    max_sendable: u64,
    min_sendable: u64,
    metadata: String,
    tag: String,
    comment_allowed: u16,
}

#[derive(Serialize)]
pub struct LnurlpSecondResponse {
    pr: String,
    routes: Vec<String>,
}

#[derive(Deserialize)]
pub struct LnurlpRequestQuery {
    amount: Option<u64>,
}

pub async fn lnurlp_request(
    State(state): State<AppState>,
    Path(username): Path<String>,
    Query(query): Query<LnurlpRequestQuery>,
) -> anyhow::Result<axum::response::Json<serde_json::Value>, ApiError> {
    let domain = std::env::var("LN_ADDRESS_DOMAIN").unwrap_or_else(|_| "localhost".to_string());
    let lightning_address = format!("{}@{}", username, domain);

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

        let response = LnurlpFirstResponse {
            callback: format!("https://{}/.well-known/lnurlp/{}", domain, username),
            max_sendable: 100000000,
            min_sendable: 1000,
            metadata,
            tag: "payRequest".to_string(),
            comment_allowed: 280,
        };
        return Ok(Json(serde_json::to_value(response).unwrap()));
    }

    let amount = query.amount.unwrap();

    let (tx, rx) = oneshot::channel();
    let request_id = uuid::Uuid::new_v4().to_string();
    state.invoice_requests.insert(request_id.clone(), tx);

    let state_clone = state.clone();
    tokio::spawn(async move {
        let data = PushNotificationData {
            title: Some("Lightning Invoice Request".to_string()),
            body: Some(format!("Someone wants to pay you {} sats!", amount / 1000)),
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

    let response = LnurlpSecondResponse {
        pr: invoice,
        routes: vec![],
    };
    Ok(Json(serde_json::to_value(response).unwrap()))
}

#[derive(Deserialize)]
pub struct SubmitInvoicePayload {
    k1: String,
    invoice: String,
    key: String,
    sig: String,
}

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
