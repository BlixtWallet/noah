use axum::{Json, http::StatusCode};
use serde::Serialize;

/// Represents the response for a health check request.
#[derive(Serialize)]
pub struct HealthCheckResponse {
    /// The status of the server, typically "OK".
    status: String,
    /// A message indicating the server's status.
    message: String,
}

/// Provides a simple health check endpoint to verify that the server is running.
pub async fn health_check() -> Result<Json<HealthCheckResponse>, StatusCode> {
    Ok(Json(HealthCheckResponse {
        status: "OK".to_string(),
        message: "Server is running".to_string(),
    }))
}
