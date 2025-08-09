use axum::{Json, extract::State, http::StatusCode};
use serde::Deserialize;

use crate::AppState;

#[derive(Deserialize, Debug)]
pub struct RegisterPayload {
    pub pubkey: String,
}

pub async fn register(
    State(state): State<AppState>,
    Json(payload): Json<RegisterPayload>,
) -> Result<StatusCode, StatusCode> {
    let conn = &state.conn;
    conn.execute(
        "INSERT INTO users (pubkey) VALUES (?)",
        libsql::params![payload.pubkey],
    )
    .await
    .map_err(|e| {
        tracing::error!("Register: failed to insert user: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(StatusCode::OK)
}

pub async fn health_check() -> StatusCode {
    StatusCode::OK
}
