use axum::{
    body::Body, extract::Request, http::Response, middleware::Next, response::IntoResponse,
};
use http_body_util::BodyExt;

use crate::wide_event::{WideEvent, WideEventHandle};

pub async fn trace_middleware(mut req: Request, next: Next) -> impl IntoResponse {
    let event_handle = WideEventHandle::new();

    let user_agent = req
        .headers()
        .get("user-agent")
        .and_then(|v| v.to_str().ok());

    event_handle.with(|e| {
        e.set_request_info(req.method().as_str(), req.uri().path(), user_agent);
    });

    req.extensions_mut().insert(event_handle.clone());

    let response = next.run(req).await;

    let status = response.status();

    event_handle.with(|e| {
        e.set_status(status.as_u16());
        e.finalize();
    });

    let needs_body = status.is_client_error() || status.is_server_error();

    if needs_body {
        let (parts, body) = response.into_parts();
        let bytes = match body.collect().await {
            Ok(collected) => collected.to_bytes(),
            Err(_) => {
                event_handle.set_error("body_read_error", "Failed to read response body");
                emit_wide_event(&event_handle);
                return Response::from_parts(parts, Body::empty()).into_response();
            }
        };

        let error_msg = extract_error_message(&bytes);
        event_handle.set_error("api_error", &error_msg);

        emit_wide_event(&event_handle);
        Response::from_parts(parts, Body::from(bytes)).into_response()
    } else {
        emit_wide_event(&event_handle);
        response
    }
}

fn emit_wide_event(handle: &WideEventHandle) {
    handle.with(|event| {
        if should_skip_logging(event) {
            return;
        }

        let json = serde_json::to_string(event).unwrap_or_else(|_| "{}".to_string());

        if event.is_server_error() {
            tracing::error!("{}", json);
        } else if event.status_code == Some(401) {
            // 401 Unauthorized is common from bot traffic, log at debug to reduce noise
            tracing::debug!("{}", json);
        } else if event.is_error() || event.is_slow() {
            tracing::warn!("{}", json);
        } else {
            tracing::info!("{}", json);
        }
    });
}

fn should_skip_logging(event: &WideEvent) -> bool {
    if event.is_high_frequency_endpoint() && !event.is_error() && !event.is_slow() {
        return true;
    }
    if event.is_bot_probe() {
        return true;
    }
    false
}

fn extract_error_message(bytes: &[u8]) -> String {
    if let Ok(json_str) = std::str::from_utf8(bytes) {
        if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(json_str) {
            return json_value
                .get("reason")
                .or_else(|| json_value.get("message"))
                .or_else(|| json_value.get("error"))
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown error")
                .to_string();
        }
        if json_str.len() > 200 {
            return format!("{}...", &json_str[..200]);
        }
        return json_str.to_string();
    }
    "Unable to parse error message".to_string()
}
