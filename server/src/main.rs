use anyhow::{Context, bail};
use axum::{
    Router, middleware,
    routing::{get, post},
};
mod gated_api_v0;
mod private_api_v0;
mod public_api_v0;
mod types;
use bitcoin::Network;
use dashmap::DashMap;
use sentry::integrations::{tower::NewSentryLayer, tracing::EventFilter};
use std::{
    net::{Ipv4Addr, SocketAddr},
    str::FromStr,
    sync::Arc,
};
use tower::ServiceBuilder;
use tower_http::trace::TraceLayer;
use tracing::{error, info};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::{
    cron::cron_scheduler,
    gated_api_v0::{
        complete_upload, delete_backup, deregister, get_download_url, get_upload_url,
        get_user_info, list_backups, register_offboarding_request, register_push_token,
        report_job_status, submit_invoice, update_backup_settings, update_ln_address,
    },
    private_api_v0::health_check,
    public_api_v0::{get_k1, lnurlp_request, register},
};

mod app_middleware;
mod ark_client;
mod cron;
mod errors;
mod migrations;
mod push;
mod s3_client;
#[cfg(test)]
mod tests;
mod trace_layer;
mod utils;

use std::time::SystemTime;

type AppState = Arc<AppStruct>;

#[derive(Clone)]
pub struct AppStruct {
    pub lnurl_domain: String,
    pub db: Arc<libsql::Database>,
    pub k1_values: Arc<DashMap<String, SystemTime>>,
    pub invoice_data_transmitters: Arc<DashMap<String, tokio::sync::oneshot::Sender<String>>>,
    expo_access_token: String,
}

#[derive(Clone)]
struct Config {
    host: Ipv4Addr,
    port: u16,
    private_port: u16,
    lnurl_domain: String,
    turso_url: String,
    turso_api_key: String,
    expo_access_token: String,
    ark_server_url: String,
    server_network: Network,
    sentry_token: Option<String>,
}

fn main() -> anyhow::Result<()> {
    dotenv::dotenv().ok();
    let config = load_config()?;

    let subscriber = tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "server=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer());

    if config.server_network == Network::Bitcoin || config.server_network == Network::Signet {
        if let Some(sentry_token) = config.sentry_token.clone() {
            let _guard = sentry::init((
                sentry_token,
                sentry::ClientOptions {
                    release: sentry::release_name!(),
                    enable_logs: true,
                    send_default_pii: false,
                    ..Default::default()
                },
            ));

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
    } else {
        subscriber.init();
    }

    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?
        .block_on(async {
            if let Err(e) = start_server(config).await {
                error!("Failed to start server: {}", e);
            }
        });

    Ok(())
}

fn load_config() -> anyhow::Result<Config> {
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
    let expo_access_token = std::env::var("EXPO_ACCESS_TOKEN")
        .context("EXPO_ACCESS_TOKEN must be set in the environment variables")?;
    let ark_server_url = std::env::var("ARK_SERVER_URL")
        .context("ARK_SERVER_URL must be set in the environment variables")?;
    let server_network = Network::from_str(
        &std::env::var("SERVER_NETWORK").unwrap_or_else(|_| "regtest".to_string()),
    )?;
    let sentry_token = std::env::var("SENTRY_TOKEN").ok();

    Ok(Config {
        host,
        port,
        private_port,
        lnurl_domain,
        turso_url,
        turso_api_key,
        expo_access_token,
        ark_server_url,
        server_network,
        sentry_token,
    })
}

async fn start_server(config: Config) -> anyhow::Result<()> {
    let db = match config.server_network {
        Network::Bitcoin | Network::Signet => {
            libsql::Builder::new_remote(config.turso_url.clone(), config.turso_api_key.clone())
                .build()
                .await?
        }
        Network::Regtest => {
            libsql::Builder::new_local("noah-regtest.db")
                .build()
                .await?
        }
        _ => {
            bail!("Unsupported network: {}", config.server_network);
        }
    };

    let conn = db.connect()?;
    migrations::migrate(&conn).await?;

    let app_state = Arc::new(AppStruct {
        lnurl_domain: config.lnurl_domain.clone(),
        db: Arc::new(db),
        k1_values: Arc::new(DashMap::new()),
        invoice_data_transmitters: Arc::new(DashMap::new()),
        expo_access_token: config.expo_access_token,
    });

    let server_config = serde_json::json!({
        "HOST": config.host,
        "PORT": config.port,
        "PRIVATE_PORT": config.private_port,
        "LNURL_DOMAIN": config.lnurl_domain,
        "ARK_SERVER_URL": config.ark_server_url,
        "SERVER_ENV": config.server_network,
    });

    info!("Server environment: {}", server_config);

    let cron_handle = cron_scheduler(app_state.clone()).await?;

    cron_handle.start().await?;

    let ark_client_app_state = app_state.clone();
    let ark_server_url = config.ark_server_url.clone();

    tokio::spawn(async move {
        if let Err(e) =
            ark_client::connect_to_ark_server(ark_client_app_state, ark_server_url).await
        {
            bail!("Failed to connect to ark server: {}", e);
        }
        Ok(())
    });

    // Gated routes, need auth
    let auth_router = Router::new()
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
        .route_layer(middleware::from_fn_with_state(
            app_state.clone(),
            app_middleware::auth_middleware,
        ));

    // Public route
    let v0_router = Router::new()
        .route("/getk1", get(get_k1))
        .route(
            "/register",
            post(register).route_layer(middleware::from_fn_with_state(
                app_state.clone(),
                app_middleware::auth_middleware,
            )),
        )
        .merge(auth_router);

    // Public route
    let lnurl_router = Router::new().route("/.well-known/lnurlp/{username}", get(lnurlp_request));

    let app = Router::new()
        .nest("/v0", v0_router)
        .merge(lnurl_router)
        .with_state(app_state.clone())
        .layer(middleware::from_fn(trace_layer::trace_middleware))
        .layer(ServiceBuilder::new().layer(NewSentryLayer::new_from_top()));

    let addr = SocketAddr::from((config.host, config.port));
    tracing::debug!("server started listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;

    // Private routes, not exposed to the internet.
    let private_addr = SocketAddr::from((config.host, config.private_port));
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
