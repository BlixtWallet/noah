use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Default)]
pub struct WideEvent {
    pub request_id: Option<String>,
    pub method: Option<String>,
    pub path: Option<String>,
    pub status_code: Option<u16>,
    pub duration_ms: Option<u128>,

    pub public_key: Option<String>,
    pub ln_address: Option<String>,
    pub email_verified: Option<bool>,

    pub outcome: Option<String>,
    pub error_type: Option<String>,
    pub error_message: Option<String>,

    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub context: HashMap<String, serde_json::Value>,

    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub timings: HashMap<String, u128>,

    #[serde(skip)]
    pub start_time: Option<Instant>,
}

#[allow(dead_code)]
impl WideEvent {
    pub fn new() -> Self {
        Self {
            request_id: Some(uuid::Uuid::new_v4().to_string()),
            start_time: Some(Instant::now()),
            ..Default::default()
        }
    }

    pub fn set_request_info(&mut self, method: &str, path: &str) {
        self.method = Some(method.to_string());
        self.path = Some(path.to_string());
    }

    pub fn set_user(&mut self, public_key: &str) {
        self.public_key = Some(public_key.to_string());
    }

    pub fn set_ln_address(&mut self, ln_address: &str) {
        self.ln_address = Some(ln_address.to_string());
    }

    pub fn set_email_verified(&mut self, verified: bool) {
        self.email_verified = Some(verified);
    }

    pub fn set_status(&mut self, status_code: u16) {
        self.status_code = Some(status_code);
        self.outcome = Some(if status_code < 400 {
            "success".to_string()
        } else if status_code < 500 {
            "client_error".to_string()
        } else {
            "server_error".to_string()
        });
    }

    pub fn set_error(&mut self, error_type: &str, message: &str) {
        self.error_type = Some(error_type.to_string());
        self.error_message = Some(message.to_string());
    }

    pub fn add_context<V: Serialize>(&mut self, key: &str, value: V) {
        if let Ok(json_value) = serde_json::to_value(value) {
            self.context.insert(key.to_string(), json_value);
        }
    }

    pub fn record_timing(&mut self, name: &str, duration_ms: u128) {
        self.timings.insert(name.to_string(), duration_ms);
    }

    pub fn finalize(&mut self) {
        if let Some(start) = self.start_time {
            self.duration_ms = Some(start.elapsed().as_millis());
        }
    }

    pub fn is_high_frequency_endpoint(&self) -> bool {
        self.path
            .as_ref()
            .map(|p| p == "/v0/getk1" || p == "/health" || p.starts_with("/.well-known/"))
            .unwrap_or(false)
    }

    pub fn is_slow(&self) -> bool {
        self.duration_ms.map(|d| d > 500).unwrap_or(false)
    }

    pub fn is_error(&self) -> bool {
        self.status_code.map(|s| s >= 400).unwrap_or(false)
    }

    pub fn is_server_error(&self) -> bool {
        self.status_code.map(|s| s >= 500).unwrap_or(false)
    }
}

#[derive(Clone, Default)]
pub struct WideEventHandle(pub Arc<Mutex<WideEvent>>);

#[allow(dead_code)]
impl WideEventHandle {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(WideEvent::new())))
    }

    pub fn with<F, R>(&self, f: F) -> R
    where
        F: FnOnce(&mut WideEvent) -> R,
    {
        let mut event = self.0.lock().unwrap();
        f(&mut event)
    }

    pub fn set_user(&self, public_key: &str) {
        self.with(|e| e.set_user(public_key));
    }

    pub fn set_ln_address(&self, ln_address: &str) {
        self.with(|e| e.set_ln_address(ln_address));
    }

    pub fn set_email_verified(&self, verified: bool) {
        self.with(|e| e.set_email_verified(verified));
    }

    pub fn add_context<V: Serialize>(&self, key: &str, value: V) {
        self.with(|e| e.add_context(key, value));
    }

    pub fn record_timing(&self, name: &str, duration_ms: u128) {
        self.with(|e| e.record_timing(name, duration_ms));
    }

    pub fn set_error(&self, error_type: &str, message: &str) {
        self.with(|e| e.set_error(error_type, message));
    }
}
