use axum::{
    extract::{Request, State},
    middleware::Next,
    response::{IntoResponse, Response},
};

use crate::{
    AppState, errors::ApiError, types::AuthPayload, utils::verify_auth, utils::verify_user_exists,
};
use std::time::SystemTime;

pub async fn auth_middleware(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, impl IntoResponse> {
    let uri_path = request.uri().path().to_string();

    let k1 = request
        .headers()
        .get("x-auth-k1")
        .and_then(|v| v.to_str().ok())
        .map(String::from);
    let sig = request
        .headers()
        .get("x-auth-sig")
        .and_then(|v| v.to_str().ok())
        .map(String::from);
    let key = request
        .headers()
        .get("x-auth-key")
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    let (k1, sig, key) = match (k1, sig, key) {
        (Some(k1), Some(sig), Some(key)) => (k1, sig, key),
        _ => {
            tracing::warn!(
                uri = %uri_path,
                "Auth failed: Missing or invalid auth headers"
            );
            return Err(
                ApiError::InvalidArgument("Missing or invalid auth headers".to_string())
                    .into_response(),
            );
        }
    };

    let payload = AuthPayload {
        k1: k1.clone(),
        sig: sig.clone(),
        key: key.clone(),
    };

    if !state.k1_values.contains_key(&payload.k1) {
        tracing::warn!(
            uri = %uri_path,
            k1 = %payload.k1,
            "Auth failed: Invalid k1 (not found in cache)"
        );
        return Err(ApiError::InvalidArgument("Invalid k1".to_string()).into_response());
    }

    let k1_parts: Vec<&str> = payload.k1.split('_').collect();
    if k1_parts.len() != 2 {
        tracing::warn!(
            uri = %uri_path,
            k1 = %payload.k1,
            "Auth failed: Invalid k1 format"
        );
        return Err(ApiError::InvalidArgument("Invalid k1 format".to_string()).into_response());
    }

    let timestamp_str = k1_parts[1];
    let timestamp = match timestamp_str.parse::<u64>() {
        Ok(t) => t,
        Err(_) => {
            tracing::warn!(
                uri = %uri_path,
                k1 = %payload.k1,
                "Auth failed: Invalid timestamp in k1"
            );
            return Err(
                ApiError::InvalidArgument("Invalid timestamp in k1".to_string()).into_response(),
            );
        }
    };

    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    if now.saturating_sub(timestamp) > 600 {
        tracing::warn!(
            uri = %uri_path,
            k1 = %payload.k1,
            age_seconds = %(now.saturating_sub(timestamp)),
            "Auth failed: K1 expired"
        );
        return Err(ApiError::K1Expired.into_response());
    }

    let is_valid =
        match verify_auth(payload.k1.clone(), payload.sig.clone(), payload.key.clone()).await {
            Ok(valid) => valid,
            Err(e) => {
                tracing::warn!(
                    uri = %uri_path,
                    key = %payload.key,
                    error = %e,
                    "Auth failed: Signature verification error"
                );
                return Err(ApiError::InvalidSignature.into_response());
            }
        };

    if !is_valid {
        tracing::warn!(
            uri = %uri_path,
            key = %payload.key,
            "Auth failed: Invalid signature"
        );
        return Err(ApiError::InvalidSignature.into_response());
    }

    if request.uri().path() != "/register" {
        let conn = state.db.connect().map_err(|e| {
            tracing::error!(
                uri = %uri_path,
                error = %e,
                "Auth failed: Database connection error"
            );
            ApiError::ServerErr("Failed to connect to database".to_string()).into_response()
        })?;

        if !verify_user_exists(&conn, &payload.key).await.map_err(|e| {
            tracing::error!(
                uri = %uri_path,
                key = %payload.key,
                error = %e,
                "Auth failed: Error checking user existence"
            );
            ApiError::UserNotFound.into_response()
        })? {
            tracing::warn!(
                uri = %uri_path,
                key = %payload.key,
                "Auth failed: User not found"
            );
            return Err(ApiError::UserNotFound.into_response());
        }
    }

    // Remove the k1 value to prevent reuse
    state.k1_values.remove(&payload.k1);

    request.extensions_mut().insert(payload);
    Ok(next.run(request).await)
}
