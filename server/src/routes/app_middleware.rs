use axum::{
    extract::{Request, State},
    middleware::Next,
    response::{IntoResponse, Response},
};

use crate::{
    AppState,
    db::user_repo::UserRepository,
    errors::ApiError,
    types::AuthPayload,
    utils::{verify_auth, verify_user_exists},
    wide_event::WideEventHandle,
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

    let k1_exists = state.k1_cache.contains(&payload.k1).await.map_err(|e| {
        tracing::error!(
            uri = %uri_path,
            k1 = %payload.k1,
            error = %e,
            "Auth failed: Unable to check k1 cache"
        );
        ApiError::ServerErr("Failed to validate k1".to_string()).into_response()
    })?;

    if !k1_exists {
        tracing::warn!(
            uri = %uri_path,
            k1 = %payload.k1,
            "Auth failed: k1 not found in cache - may have been already used or never existed"
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
        let age_seconds = now.saturating_sub(timestamp);
        tracing::warn!(
            uri = %uri_path,
            k1 = %payload.k1,
            age_seconds = %age_seconds,
            max_age_seconds = 600,
            "Auth failed: k1 expired (age {} seconds exceeds 10 minute limit)",
            age_seconds
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
                    "Auth failed: Error during signature verification process"
                );
                return Err(ApiError::InvalidSignature.into_response());
            }
        };

    if !is_valid {
        tracing::warn!(
            uri = %uri_path,
            key = %payload.key,
            k1 = %payload.k1,
            "Auth failed: Signature verification failed - signature does not match the public key for the given k1"
        );
        return Err(ApiError::InvalidSignature.into_response());
    }

    if let Some(event) = request.extensions().get::<WideEventHandle>() {
        event.set_user(&payload.key);
    }

    sentry::configure_scope(|scope| {
        scope.set_user(Some(sentry::User {
            id: Some(payload.key.clone()),
            ..Default::default()
        }));
    });

    tracing::debug!(key = %payload.key, "Auth successful");

    // Remove the k1 value to prevent reuse
    if let Err(e) = state.k1_cache.remove(&payload.k1).await {
        tracing::error!(
            uri = %uri_path,
            k1 = %payload.k1,
            error = %e,
            "Failed to evict k1 from Redis cache after successful auth"
        );
    }

    request.extensions_mut().insert(payload);
    Ok(next.run(request).await)
}

pub async fn user_exists_middleware(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, impl IntoResponse> {
    let auth_payload = match request.extensions().get::<AuthPayload>() {
        Some(payload) => payload,
        None => {
            return Err(ApiError::ServerErr(
                "Authentication failed. Please try again.".to_string(),
            )
            .into_response());
        }
    };

    let uri_path = request.uri().path().to_string();

    if !verify_user_exists(&state.db_pool, &auth_payload.key)
        .await
        .map_err(|e| {
            tracing::error!(
                uri = %uri_path,
                key = %auth_payload.key,
                error = %e,
                "User existence check failed: Error checking user existence"
            );
            ApiError::UserNotFound.into_response()
        })?
    {
        tracing::warn!(
            uri = %uri_path,
            key = %auth_payload.key,
            "User existence check failed: User not found in database"
        );
        return Err(ApiError::UserNotFound.into_response());
    }

    Ok(next.run(request).await)
}

pub async fn email_verified_middleware(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, impl IntoResponse> {
    let auth_payload = match request.extensions().get::<AuthPayload>() {
        Some(payload) => payload,
        None => {
            return Err(ApiError::ServerErr(
                "Authentication failed. Please try again.".to_string(),
            )
            .into_response());
        }
    };

    let user_repo = UserRepository::new(&state.db_pool);
    let is_verified = user_repo
        .is_email_verified(&auth_payload.key)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "Email verification check failed");
            ApiError::ServerErr("Failed to check email verification status".to_string())
                .into_response()
        })?;

    if let Some(event) = request.extensions().get::<WideEventHandle>() {
        event.set_email_verified(is_verified);
    }

    if !is_verified {
        // TODO: Temporarily just logging instead of blocking - re-enable blocking later
        tracing::warn!(
            path = %request.uri().path(),
            "Email not verified (allowing request temporarily)"
        );
        // return Err(ApiError::InvalidArgument("Email not verified".to_string()).into_response());
    }

    Ok(next.run(request).await)
}
