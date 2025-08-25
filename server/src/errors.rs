use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("Invalid argument: {0}")]
    InvalidArgument(String),
    #[error("Serialize error: {0}")]
    SerializeErr(String),
    #[error("Server error: {0}")]
    ServerErr(String),
    #[error("Database error: {0}")]
    Database(#[from] libsql::Error),
    #[error("Expo push notification error: {0}")]
    Expo(#[from] expo_push_notification_client::CustomError),
    #[error("Anyhow error: {0}")]
    Anyhow(#[from] anyhow::Error),
    #[error("secp256k1 error: {0}")]
    Secp256k1(#[from] bitcoin::secp256k1::Error),
    #[error("Invalid Signature")]
    InvalidSignature,
    #[error("Not found: {0}")]
    NotFound(String),
}

#[derive(Serialize)]
pub struct ErrorResponse {
    status: String,
    reason: String,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, reason) = match self {
            ApiError::InvalidArgument(e) => (StatusCode::BAD_REQUEST, e.to_string()),
            ApiError::SerializeErr(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
            ApiError::ServerErr(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
            ApiError::Database(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {}", e),
            ),
            ApiError::Expo(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Expo error: {}", e),
            ),
            ApiError::Anyhow(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Internal server error: {}", e),
            ),
            ApiError::Secp256k1(e) => (StatusCode::BAD_REQUEST, format!("Crypto error: {}", e)),
            ApiError::InvalidSignature => {
                (StatusCode::UNAUTHORIZED, "Invalid signature".to_string())
            }
            ApiError::NotFound(e) => (StatusCode::NOT_FOUND, e.to_string()),
        };

        let body = Json(ErrorResponse {
            status: "ERROR".to_string(),
            reason,
        });

        (status, body).into_response()
    }
}
