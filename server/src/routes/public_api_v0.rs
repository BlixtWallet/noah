use std::time::Duration;

use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use rand::Rng;
use uuid::Uuid;

use serde::{Deserialize, Serialize};
use tokio::{sync::oneshot, time::timeout};
use validator::{Validate, ValidateEmail};

use crate::{
    AppState,
    db::{device_repo::DeviceRepository, user_repo::UserRepository},
    errors::ApiError,
    push::{PushNotificationData, send_push_notification},
    types::{
        AppVersionCheckPayload, AppVersionInfo, AuthEvent, AuthPayload,
        LightningInvoiceRequestNotification, NotificationData, RegisterPayload, RegisterResponse,
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

const LNURLP_MIN_SENDABLE: u64 = 330000;
const LNURLP_MAX_SENDABLE: u64 = 100000000;
const COMMENT_ALLOWED_SIZE: u16 = 280;

/// Generates and returns a new `k1` value for an LNURL-auth flow.
///
/// The `k1` value is a random 32-byte hex-encoded string that is stored in Redis with
/// a strict TTL so it can be used once for a login or registration attempt.
pub async fn get_k1(State(state): State<AppState>) -> anyhow::Result<Json<GetK1>, StatusCode> {
    let k1 = make_k1(&state.k1_cache).await.map_err(|e| {
        tracing::error!("Failed to create k1: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

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

    let user_repo = UserRepository::new(&state.db_pool);
    let pubkey = user_repo
        .find_pubkey_by_lightning_address(&lightning_address)
        .await?
        .ok_or_else(|| ApiError::InvalidArgument("User not found".to_string()))?;

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

    // Generate a unique transaction ID for this payment request
    let transaction_id = Uuid::new_v4().to_string();
    state
        .invoice_data_transmitters
        .insert(transaction_id.clone(), tx);

    // Generate a k1 for authentication optimization (avoids extra network call)
    let k1 = match make_k1(&state.k1_cache).await {
        Ok(value) => value,
        Err(e) => {
            state.invoice_data_transmitters.remove(&transaction_id);
            tracing::error!("Failed to create k1 for LNURL request: {}", e);
            return Err(ApiError::ServerErr(
                "Failed to create authentication challenge".to_string(),
            ));
        }
    };

    let state_clone = state.clone();
    let transaction_id_clone = transaction_id.clone();
    tokio::spawn(async move {
        let data = PushNotificationData {
            title: None,
            body: None,
            data: serde_json::to_string(&NotificationData::LightningInvoiceRequest(
                LightningInvoiceRequestNotification {
                    k1, // Include k1 for auth optimization
                    transaction_id: transaction_id_clone,
                    amount,
                },
            ))
            .unwrap(),
            priority: "high".to_string(),
            content_available: true,
        };
        if let Err(e) = send_push_notification(state_clone, data, Some(pubkey)).await {
            tracing::error!("Failed to send push notification: {}", e);
        }
    });

    tracing::debug!("Waiting for invoice with a 180s timeout...");
    let invoice_result = timeout(Duration::from_secs(180), rx).await;

    let invoice = match invoice_result {
        Ok(Ok(invoice)) => Ok(invoice),
        Ok(Err(_)) => {
            state.invoice_data_transmitters.remove(&transaction_id);
            Err(ApiError::ServerErr("Failed to receive invoice".to_string()))
        }
        Err(_) => {
            // Timeout occurred
            state.invoice_data_transmitters.remove(&transaction_id);
            tracing::error!(
                "Invoice request timed out after 180s for transaction_id: {}",
                transaction_id
            );
            Err(ApiError::ServerErr("Request timed out".to_string()))
        }
    }?;

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

    let user_repo = UserRepository::new(&state.db_pool);

    tracing::debug!(
        "Registering user with pubkey: {} and k1: {}",
        auth_payload.key,
        auth_payload.k1,
    );

    if let Some(user) = user_repo.find_by_pubkey(&auth_payload.key).await? {
        tracing::debug!("User with pubkey: {} already registered", auth_payload.key);

        if let Some(device_info) = payload.device_info {
            // For existing users, we'll just register the device in its own transaction
            let mut tx = state.db_pool.begin().await?;
            DeviceRepository::upsert(&mut tx, &auth_payload.key, &device_info).await?;
            tx.commit().await?;
        }

        return Ok(Json(RegisterResponse {
            status: "OK".to_string(),
            event: None,
            reason: Some("User already registered".to_string()),
            lightning_address: user.lightning_address,
        }));
    }

    let ln_address = payload.ln_address.unwrap_or_else(|| {
        let number = rand::rng().random_range(0..100);
        let random_word = random_word::get(random_word::Lang::En);
        format!("{}{}@{}", random_word, number, state.lnurl_domain)
    });

    if !ln_address.validate_email() {
        return Err(ApiError::InvalidArgument(
            "Invalid lightning address".to_string(),
        ));
    }

    // Create a new user in a transaction
    let mut tx = state.db_pool.begin().await?;
    let result = UserRepository::create(&mut tx, &auth_payload.key, &ln_address).await;

    if let Err(e) = result {
        if e.is::<crate::db::user_repo::LightningAddressTakenError>() {
            return Err(ApiError::InvalidArgument(
                "Lightning address already taken".to_string(),
            ));
        }
        return Err(e.into());
    }

    if let Some(device_info) = payload.device_info {
        DeviceRepository::upsert(&mut tx, &auth_payload.key, &device_info).await?;
    }

    tx.commit().await?;

    Ok(Json(RegisterResponse {
        status: "OK".to_string(),
        event: Some(AuthEvent::Registered),
        reason: None,
        lightning_address: Some(ln_address),
    }))
}

pub async fn check_app_version(
    State(state): State<AppState>,
    Json(payload): Json<AppVersionCheckPayload>,
) -> anyhow::Result<Json<AppVersionInfo>, ApiError> {
    let minimum_required = &state.config.load().minimum_app_version;
    let client_version = &payload.client_version;

    let minimum_parsed = semver::Version::parse(minimum_required).map_err(|e| {
        tracing::error!("Failed to parse minimum_app_version from config: {}", e);
        ApiError::ServerErr("Invalid server configuration".to_string())
    })?;

    let client_parsed = semver::Version::parse(client_version).map_err(|_| {
        ApiError::InvalidArgument(format!("Invalid client version format: {}", client_version))
    })?;

    let update_required = client_parsed < minimum_parsed;

    tracing::debug!(
        "Version check: client={}, minimum={}, update_required={}",
        client_version,
        minimum_required,
        update_required
    );

    Ok(Json(AppVersionInfo {
        minimum_required_version: minimum_required.clone(),
        update_required,
    }))
}
