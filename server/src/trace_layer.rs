use axum::{
    body::Body,
    extract::Request,
    http::{Response, StatusCode},
    middleware::Next,
    response::IntoResponse,
};
use http_body_util::BodyExt;
use std::time::Instant;
use tracing::{debug, error, info, warn};

/// Custom trace middleware that logs meaningful request/response details
pub async fn trace_middleware(req: Request, next: Next) -> impl IntoResponse {
    let start = Instant::now();
    let method = req.method().clone();
    let uri = req.uri().clone();
    let path = uri.path().to_string();

    // Process the request
    let response = next.run(req).await;

    // Calculate request duration
    let duration = start.elapsed();
    let duration_ms = duration.as_millis();
    let status = response.status();

    // Define high-frequency endpoints that we don't want to spam logs with
    let is_high_frequency =
        path == "/v0/getk1" || path == "/health" || path.starts_with("/.well-known/");

    match status {
        // Success cases
        StatusCode::OK | StatusCode::CREATED | StatusCode::ACCEPTED | StatusCode::NO_CONTENT => {
            // Only log slow requests or non-high-frequency endpoints
            if duration_ms > 500 {
                warn!(
                    method = %method,
                    path = %path,
                    status = %status.as_u16(),
                    duration_ms = %duration_ms,
                    "Slow request"
                );
            } else if duration_ms > 100 && !is_high_frequency {
                info!(
                    method = %method,
                    path = %path,
                    status = %status.as_u16(),
                    duration_ms = %duration_ms,
                    "Request completed"
                );
            } else if !is_high_frequency {
                debug!(
                    method = %method,
                    path = %path,
                    status = %status.as_u16(),
                    duration_ms = %duration_ms,
                    "Request completed"
                );
            }
            // Don't log anything for fast, high-frequency successful requests
            response
        }

        // Client errors - these are often expected, so log at info/warn level
        StatusCode::BAD_REQUEST | StatusCode::FORBIDDEN | StatusCode::NOT_FOUND => {
            let (parts, body) = response.into_parts();
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

            let error_msg = extract_error_message(&bytes);

            warn!(
                method = %method,
                path = %path,
                status = %status.as_u16(),
                duration_ms = %duration_ms,
                error = %error_msg,
                "Client error"
            );

            Response::from_parts(parts, Body::from(bytes)).into_response()
        }

        // Unauthorized - very common, log at debug level to reduce noise
        StatusCode::UNAUTHORIZED => {
            debug!(
                method = %method,
                path = %path,
                status = %status.as_u16(),
                duration_ms = %duration_ms,
                "Unauthorized request"
            );
            response
        }

        // Server errors and other unexpected status codes - always log these
        _ => {
            let (parts, body) = response.into_parts();
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

            let error_msg = extract_error_message(&bytes);

            error!(
                method = %method,
                path = %path,
                status = %status.as_u16(),
                duration_ms = %duration_ms,
                error = %error_msg,
                "Server error"
            );

            Response::from_parts(parts, Body::from(bytes)).into_response()
        }
    }
}

fn extract_error_message(bytes: &[u8]) -> String {
    if let Ok(json_str) = std::str::from_utf8(bytes) {
        if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(json_str) {
            json_value
                .get("reason")
                .and_then(|v| v.as_str())
                .unwrap_or_else(|| {
                    // Try other common error field names
                    json_value
                        .get("message")
                        .or_else(|| json_value.get("error"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("Unknown error")
                })
                .to_string()
        } else {
            // If it's not JSON, truncate long strings to avoid log spam
            if json_str.len() > 200 {
                format!("{}...", &json_str[..200])
            } else {
                json_str.to_string()
            }
        }
    } else {
        "Unable to parse error message".to_string()
    }
}
