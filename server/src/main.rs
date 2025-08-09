use axum::{
    Router,
    routing::{get, post},
};
mod v0;
use std::{
    net::{Ipv4Addr, SocketAddr},
    str::FromStr,
    sync::Arc,
};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::v0::api_v0::{health_check, register};

mod migrations;

type AppState = Arc<DbConnection>;

#[derive(Clone)]
struct DbConnection {
    conn: libsql::Connection,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv::dotenv().ok();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "server=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let host =
        Ipv4Addr::from_str(&std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()))?;
    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "3000".to_string())
        .parse::<u16>()?;

    let turso_url =
        std::env::var("TURSO_URL").expect("TURSO_URL must be set in the environment variables");
    let turso_api_key = std::env::var("TURSO_API_KEY")
        .expect("TURSO_API_KEY must be set in the environment variables");

    let db = libsql::Builder::new_remote(turso_url, turso_api_key)
        .build()
        .await?;

    let conn = db.connect()?;

    migrations::migrate(&conn).await?;

    let app_state = Arc::new(DbConnection { conn });

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/register", post(register))
        .with_state(app_state)
        .layer(TraceLayer::new_for_http());

    let addr = SocketAddr::from((host, port));
    tracing::debug!("server started listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
