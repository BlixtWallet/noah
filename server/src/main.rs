use axum::{
    Router, middleware,
    routing::{get, post},
};
mod cache;
mod config;
mod constants;
mod routes;
mod types;
use bitcoin::Network;
use sentry::integrations::{
    tower::{NewSentryLayer, SentryHttpLayer},
    tracing::EventFilter,
};
use std::{net::SocketAddr, sync::Arc};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::{
    cache::{invoice_store::InvoiceStore, k1_store::K1Store, redis_client::RedisClient},
    config::Config,
    cron::cron_scheduler,
    routes::{
        app_middleware,
        gated_api_v0::{
            complete_upload, delete_backup, deregister, get_download_url, get_upload_url,
            get_user_info, heartbeat_response, list_backups, register_offboarding_request,
            register_push_token, report_job_status, submit_invoice, update_backup_settings,
            update_ln_address,
        },
        private_api_v0::health_check,
        public_api_v0::{check_app_version, get_k1, lnurlp_request, register},
    },
};

mod ark_client;
mod cron;
pub mod db;
mod errors;
mod notification_coordinator;
mod push;
mod rate_limit;
mod s3_client;
#[cfg(test)]
mod tests;
mod trace_layer;
mod utils;

use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;

type AppState = Arc<AppStruct>;
const K1_TTL_SECONDS: usize = 600;

#[derive(Clone)]
pub struct AppStruct {
    pub config: Arc<Config>,
    pub lnurl_domain: String,
    pub db_pool: PgPool,
    pub k1_cache: K1Store,
    pub invoice_store: InvoiceStore,
}

fn main() -> anyhow::Result<()> {
    let config = Config::load()?;

    let server_network = config.network()?;

    // Initialize Sentry first if we're on production networks
    let _sentry_guard = if server_network == Network::Bitcoin || server_network == Network::Signet {
        config.sentry_url.clone().map(|sentry_url| {
            sentry::init((
                sentry_url,
                sentry::ClientOptions {
                    release: sentry::release_name!(),
                    enable_logs: true,
                    send_default_pii: false,
                    traces_sample_rate: 1.0,
                    ..Default::default()
                },
            ))
        })
    } else {
        None
    };

    // Build subscriber with conditional Sentry layer
    let subscriber = tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "server=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer());

    // Initialize subscriber with or without Sentry layer
    if _sentry_guard.is_some() {
        let sentry_layer =
            sentry::integrations::tracing::layer().event_filter(|md| match *md.level() {
                tracing::Level::ERROR => EventFilter::Log,
                tracing::Level::WARN => EventFilter::Log,
                tracing::Level::INFO => EventFilter::Log,
                tracing::Level::DEBUG => EventFilter::Log,
                _ => EventFilter::Ignore,
            });
        subscriber.with(sentry_layer).init();
    } else {
        subscriber.init();
    }

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;

    runtime.block_on(async { start_server(config).await })?;

    Ok(())
}

async fn start_server(config: Config) -> anyhow::Result<()> {
    let host = config.host()?;
    let _server_network = config.network()?;

    let db_pool = PgPoolOptions::new()
        .max_connections(config.postgres_max_connections)
        .min_connections(config.postgres_min_connections.unwrap_or(1))
        .connect(&config.postgres_url)
        .await?;

    db::migrations::run_migrations(&db_pool).await?;

    let redis_client = RedisClient::new(&config.redis_url)?;
    redis_client.check_connection().await?;
    let k1_cache = K1Store::new(redis_client.clone(), K1_TTL_SECONDS);
    let invoice_store = InvoiceStore::new(redis_client);

    let app_state = Arc::new(AppStruct {
        config: Arc::new(config.clone()),
        lnurl_domain: config.lnurl_domain.clone(),
        db_pool: db_pool.clone(),
        k1_cache: k1_cache.clone(),
        invoice_store,
    });

    config.log_config();

    let backup_cron = config.backup_cron.clone();
    let cron_handle = cron_scheduler(app_state.clone(), backup_cron).await?;

    cron_handle.start().await?;

    let ark_client_app_state = app_state.clone();
    let ark_server_url = config.ark_server_url.clone();

    tokio::spawn(async move {
        if let Err(e) =
            ark_client::connect_to_ark_server(ark_client_app_state, ark_server_url).await
        {
            tracing::error!("Failed to connect to ark server: {}", e);
        }
    });

    // Middleware that checks the signature and authenticates the user
    let auth_layer =
        middleware::from_fn_with_state(app_state.clone(), app_middleware::auth_middleware);

    // Middleware that only checks for user existence
    let user_exists_layer =
        middleware::from_fn_with_state(app_state.clone(), app_middleware::user_exists_middleware);

    // Create rate limiters
    let public_rate_limiter = rate_limit::create_public_rate_limiter();
    let auth_rate_limiter = rate_limit::create_auth_rate_limiter();

    // Gated routes, need auth and for user to exist
    let gated_router = Router::new()
        .route("/register_push_token", post(register_push_token))
        .route(
            "/register_offboarding_request",
            post(register_offboarding_request),
        )
        .route("/lnurlp/submit_invoice", post(submit_invoice))
        .route("/user_info", post(get_user_info))
        .route("/update_ln_address", post(update_ln_address))
        .route("/deregister", post(deregister))
        .route("/backup/upload_url", post(get_upload_url))
        .route("/backup/complete_upload", post(complete_upload))
        .route("/backup/list", post(list_backups))
        .route("/backup/download_url", post(get_download_url))
        .route("/backup/delete", post(delete_backup))
        .route("/backup/settings", post(update_backup_settings))
        .route("/report_job_status", post(report_job_status))
        .route("/heartbeat_response", post(heartbeat_response))
        .layer(user_exists_layer);

    // Routes that need auth but user may not exist (like registration)
    // Apply auth rate limiter to these routes
    let auth_router = Router::new()
        .route("/register", post(register))
        .merge(gated_router)
        .layer(auth_rate_limiter)
        .layer(auth_layer);

    // Public routes with strict rate limiting on getk1
    let v0_router = Router::new()
        .route("/getk1", get(get_k1).layer(public_rate_limiter))
        .route("/app_version", post(check_app_version))
        .merge(auth_router);

    // Public route
    let lnurl_router = Router::new().route("/.well-known/lnurlp/{username}", get(lnurlp_request));

    let app = Router::new()
        .nest("/v0", v0_router)
        .merge(lnurl_router)
        .with_state(app_state.clone())
        .layer(middleware::from_fn(trace_layer::trace_middleware))
        .layer(SentryHttpLayer::new().enable_transaction())
        .layer(NewSentryLayer::new_from_top());

    let addr = SocketAddr::from((host, config.port));
    tracing::debug!("server started listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;

    // Private routes, not exposed to the internet.
    let private_addr = SocketAddr::from((host, config.private_port));
    let private_router = Router::new()
        .route("/health", get(health_check))
        .layer(TraceLayer::new_for_http());
    tracing::debug!("private server started listening on {}", private_addr);
    let private_listener = tokio::net::TcpListener::bind(private_addr).await?;

    tokio::spawn(async move {
        axum::serve(private_listener, private_router).await.unwrap();
    });

    // Important: Use into_make_service_with_connect_info to provide IP information for rate limiting
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;

    Ok(())
}
