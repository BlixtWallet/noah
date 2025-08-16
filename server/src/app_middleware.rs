use axum::{
    body::Body,
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};
use http_body_util::BodyExt;
use serde::Deserialize;

use crate::{AppState, errors::ApiError, utils::verify_auth};

#[derive(Deserialize, Debug, Clone)]
pub struct AuthPayload {
    pub key: String,
    pub sig: String,
    pub k1: String,
}

pub async fn auth_middleware(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, impl IntoResponse> {
    let (parts, body) = request.into_parts();

    let bytes = match body.collect().await {
        Ok(collected) => collected.to_bytes(),
        Err(err) => {
            return Err((StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response());
        }
    };

    let payload: AuthPayload = match serde_json::from_slice(&bytes) {
        Ok(p) => p,
        Err(_) => {
            return Err(
                ApiError::InvalidArgument("Invalid or missing auth payload".to_string())
                    .into_response(),
            );
        }
    };

    if !state.k1_values.contains_key(&payload.k1) {
        return Err(ApiError::InvalidArgument("Invalid k1".to_string()).into_response());
    }

    let is_valid =
        match verify_auth(payload.k1.clone(), payload.sig.clone(), payload.key.clone()).await {
            Ok(valid) => valid,
            Err(_) => return Err(ApiError::InvalidSignature.into_response()),
        };

    if !is_valid {
        return Err(ApiError::InvalidSignature.into_response());
    }

    let mut parts = parts;
    parts.extensions.insert(payload);
    let request = Request::from_parts(parts, Body::from(bytes));
    Ok(next.run(request).await)
}
