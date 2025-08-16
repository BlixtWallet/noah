use anyhow::Context;
use axum::{
    Router, middleware,
    routing::{get, post},
};
mod gated_api_v0;
mod private_api_v0;
mod public_api_v0;
use dashmap::DashMap;
use std::{
    net::{Ipv4Addr, SocketAddr},
    str::FromStr,
    sync::Arc,
};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::{
    cron::cron_scheduler,
    gated_api_v0::{register, register_push_token, submit_invoice},
    private_api_v0::health_check,
    public_api_v0::{get_k1, lnurlp_request},
};

mod app_middleware;
mod cron;
mod errors;
mod migrations;
mod push;
mod utils;

use std::time::SystemTime;

type AppState = Arc<AppStruct>;

#[derive(Clone)]
pub struct AppStruct {
    pub lnurl_domain: String,
    pub conn: libsql::Connection,
    pub k1_values: Arc<DashMap<String, SystemTime>>,
    pub invoice_data_transmitters: Arc<DashMap<String, tokio::sync::oneshot::Sender<String>>>,
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
    let private_port = std::env::var("PRIVATE_PORT")
        .unwrap_or_else(|_| "3099".to_string())
        .parse::<u16>()?;

    let lnurl_domain = std::env::var("LNURL_DOMAIN").unwrap_or_else(|_| "localhost".to_string());

    let turso_url =
        std::env::var("TURSO_URL").context("TURSO_URL must be set in the environment variables")?;
    let turso_api_key = std::env::var("TURSO_API_KEY")
        .context("TURSO_API_KEY must be set in the environment variables")?;

    let _ = std::env::var("EXPO_ACCESS_TOKEN")
        .context("EXPO_ACCESS_TOKEN must be set in the environment variables")?;

    let db = libsql::Builder::new_remote(turso_url, turso_api_key)
        .build()
        .await?;

    let conn = db.connect()?;

    migrations::migrate(&conn).await?;

    let app_state = Arc::new(AppStruct {
        lnurl_domain,
        conn,
        k1_values: Arc::new(DashMap::new()),
        invoice_data_transmitters: Arc::new(DashMap::new()),
    });

    let cron_handle = cron_scheduler(app_state.clone()).await?;

    cron_handle.start().await?;

    let auth_router = Router::new()
        .route("/register", post(register))
        .route("/register_push_token", post(register_push_token))
        .route("/lnurlp/submit_invoice", post(submit_invoice))
        .route_layer(middleware::from_fn_with_state(
            app_state.clone(),
            app_middleware::auth_middleware,
        ));

    let v0_router = Router::new()
        .route("/getk1", get(get_k1))
        .merge(auth_router);

    let lnurl_router = Router::new().route("/.well-known/lnurlp/{username}", get(lnurlp_request));

    let app = Router::new()
        .nest("/v0", v0_router)
        .merge(lnurl_router)
        .with_state(app_state.clone())
        .layer(TraceLayer::new_for_http());

    let addr = SocketAddr::from((host, port));
    tracing::debug!("server started listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;

    let private_addr = SocketAddr::from((host, private_port));
    let private_router = Router::new()
        .route("/health", get(health_check))
        .layer(TraceLayer::new_for_http());
    tracing::debug!("private server started listening on {}", private_addr);
    let private_listener = tokio::net::TcpListener::bind(private_addr).await?;

    tokio::spawn(async move {
        axum::serve(private_listener, private_router).await.unwrap();
    });

    axum::serve(listener, app).await?;

    Ok(())
}
