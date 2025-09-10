use axum::{
    body::Body,
    extract::Request,
    http::{Response, StatusCode},
    middleware::Next,
    response::IntoResponse,
};
use http_body_util::BodyExt;
use std::time::Instant;
use tracing::{debug, error, warn};

/// Custom trace middleware that logs request/response details including error bodies
pub async fn trace_middleware(req: Request, next: Next) -> impl IntoResponse {
    let start = Instant::now();
    let method = req.method().clone();
    let uri = req.uri().clone();
    let path = uri.path().to_string();

    // Log the incoming request
    debug!(
        method = %method,
        path = %path,
        "Incoming request"
    );

    // Process the request
    let response = next.run(req).await;

    // Calculate request duration
    let duration = start.elapsed();
    let duration_ms = duration.as_millis();

    // Get the status code
    let status = response.status();

    // Log based on status code
    match status {
        StatusCode::OK | StatusCode::CREATED | StatusCode::ACCEPTED | StatusCode::NO_CONTENT => {
            debug!(
                method = %method,
                path = %path,
                status = %status.as_u16(),
                duration_ms = %duration_ms,
                "Request completed successfully"
            );
            response
        }
        StatusCode::BAD_REQUEST
        | StatusCode::UNAUTHORIZED
        | StatusCode::FORBIDDEN
        | StatusCode::NOT_FOUND => {
            // For client errors, try to extract the error message from the response body
            let (parts, body) = response.into_parts();

            // Collect the body to inspect it
            let bytes = match body.collect().await {
                Ok(collected) => collected.to_bytes(),
                Err(_) => {
                    warn!(
                        method = %method,
                        path = %path,
                        status = %status.as_u16(),
                        duration_ms = %duration_ms,
                        "Client error (failed to read response body)"
                    );
                    return Response::from_parts(parts, Body::empty()).into_response();
                }
            };

            // Try to parse the error message
            let error_msg = if let Ok(json_str) = std::str::from_utf8(&bytes) {
                if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(json_str) {
                    json_value
                        .get("reason")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Unknown error")
                        .to_string()
                } else {
                    json_str.to_string()
                }
            } else {
                "Unable to parse error message".to_string()
            };

            warn!(
                method = %method,
                path = %path,
                status = %status.as_u16(),
                duration_ms = %duration_ms,
                error = %error_msg,
                "Client error"
            );

            // Reconstruct the response with the original body
            Response::from_parts(parts, Body::from(bytes)).into_response()
        }
        _ => {
            // For server errors and other status codes
            let (parts, body) = response.into_parts();

            // Collect the body to inspect it
            let bytes = match body.collect().await {
                Ok(collected) => collected.to_bytes(),
                Err(_) => {
                    error!(
                        method = %method,
                        path = %path,
                        status = %status.as_u16(),
                        duration_ms = %duration_ms,
                        "Server error (failed to read response body)"
                    );
                    return Response::from_parts(parts, Body::empty()).into_response();
                }
            };

            // Try to parse the error message
            let error_msg = if let Ok(json_str) = std::str::from_utf8(&bytes) {
                if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(json_str) {
                    json_value
                        .get("reason")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Unknown error")
                        .to_string()
                } else {
                    json_str.to_string()
                }
            } else {
                "Unable to parse error message".to_string()
            };

            error!(
                method = %method,
                path = %path,
                status = %status.as_u16(),
                duration_ms = %duration_ms,
                error = %error_msg,
                "Server error"
            );

            // Reconstruct the response with the original body
            Response::from_parts(parts, Body::from(bytes)).into_response()
        }
    }
}
