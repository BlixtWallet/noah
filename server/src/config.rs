use anyhow::{Context, Result};
use bitcoin::Network;
use std::net::Ipv4Addr;
use std::str::FromStr;

/// Configuration for the Noah server
///
/// All config fields are set via environment variables:
/// - `HOST`, `PORT`, `PRIVATE_PORT`
/// - `POSTGRES_URL`, `REDIS_URL`
/// - `EXPO_ACCESS_TOKEN`, `ARK_SERVER_URL`
/// - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
#[derive(Debug, Clone)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub private_port: u16,
    pub lnurl_domain: String,
    pub postgres_url: String,
    pub postgres_max_connections: u32,
    pub postgres_min_connections: Option<u32>,
    pub expo_access_token: String,
    pub ark_server_url: String,
    pub server_network: String,
    pub sentry_url: Option<String>,
    pub backup_cron: String,
    pub maintenance_interval_rounds: u16,
    pub heartbeat_cron: String,
    pub deregister_cron: String,
    pub notification_spacing_minutes: i64,
    pub s3_bucket_name: String,
    pub minimum_app_version: String,
    pub redis_url: String,
    pub ntfy_auth_token: String,
}

impl Config {
    pub fn load() -> Result<Self> {
        // Load .env file if present (useful for local development)
        // Try current directory first, then parent directory
        if dotenvy::dotenv().is_err() {
            let _ = dotenvy::from_filename("../.env");
        }

        let config = Self {
            host: std::env::var("HOST").unwrap_or_else(|_| default_host()),
            port: std::env::var("PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or_else(default_port),
            private_port: std::env::var("PRIVATE_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or_else(default_private_port),
            lnurl_domain: std::env::var("LNURL_DOMAIN").unwrap_or_else(|_| default_lnurl_domain()),
            postgres_url: std::env::var("POSTGRES_URL").unwrap_or_default(),
            postgres_max_connections: std::env::var("POSTGRES_MAX_CONNECTIONS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(10),
            postgres_min_connections: std::env::var("POSTGRES_MIN_CONNECTIONS")
                .ok()
                .and_then(|v| v.parse().ok()),
            expo_access_token: std::env::var("EXPO_ACCESS_TOKEN").unwrap_or_default(),
            ark_server_url: std::env::var("ARK_SERVER_URL").unwrap_or_default(),
            server_network: std::env::var("SERVER_NETWORK")
                .unwrap_or_else(|_| default_server_network()),
            sentry_url: std::env::var("SENTRY_URL").ok(),
            backup_cron: std::env::var("BACKUP_CRON").unwrap_or_else(|_| default_backup_cron()),
            maintenance_interval_rounds: std::env::var("MAINTENANCE_INTERVAL_ROUNDS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or_else(default_maintenance_interval_rounds),
            heartbeat_cron: std::env::var("HEARTBEAT_CRON")
                .unwrap_or_else(|_| default_heartbeat_cron()),
            deregister_cron: std::env::var("DEREGISTER_CRON")
                .unwrap_or_else(|_| default_deregister_cron()),
            notification_spacing_minutes: std::env::var("NOTIFICATION_SPACING_MINUTES")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(45),
            s3_bucket_name: std::env::var("S3_BUCKET_NAME").unwrap_or_default(),
            minimum_app_version: std::env::var("MINIMUM_APP_VERSION")
                .unwrap_or_else(|_| "0.0.1".to_string()),
            redis_url: std::env::var("REDIS_URL").unwrap_or_else(|_| default_redis_url()),
            ntfy_auth_token: std::env::var("NTFY_AUTH_TOKEN").unwrap_or_default(),
        };

        config.validate()?;

        Ok(config)
    }

    fn validate(&self) -> Result<()> {
        if self.postgres_url.is_empty() {
            anyhow::bail!("POSTGRES_URL is required");
        }
        if self.expo_access_token.is_empty() {
            anyhow::bail!("EXPO_ACCESS_TOKEN is required");
        }
        if self.ark_server_url.is_empty() {
            anyhow::bail!("ARK_SERVER_URL is required");
        }
        if self.s3_bucket_name.is_empty() {
            anyhow::bail!("S3_BUCKET_NAME is required");
        }
        Ok(())
    }

    pub fn host(&self) -> Result<Ipv4Addr> {
        Ipv4Addr::from_str(&self.host).context(format!("Invalid host address: {}", self.host))
    }

    pub fn network(&self) -> Result<Network> {
        Network::from_str(&self.server_network)
            .context(format!("Invalid network: {}", self.server_network))
    }

    pub fn log_config(&self) {
        tracing::debug!("=== Server Configuration ===");
        tracing::debug!("Host: {}", self.host);
        tracing::debug!("Port: {}", self.port);
        tracing::debug!("Private Port: {}", self.private_port);
        tracing::debug!("LNURL Domain: {}", self.lnurl_domain);
        tracing::debug!("Postgres URL: [REDACTED]");
        tracing::debug!(
            "Postgres connection pool: max={}, min={}",
            self.postgres_max_connections,
            self.postgres_min_connections.unwrap_or(1)
        );
        tracing::debug!("Expo Access Token: [REDACTED]");
        tracing::debug!("Ark Server URL: {}", self.ark_server_url);
        tracing::debug!("Server Network: {}", self.server_network);
        tracing::debug!(
            "Sentry URL: {}",
            if self.sentry_url.is_some() {
                "[SET]"
            } else {
                "[NOT SET]"
            }
        );
        tracing::debug!("Backup Cron: {}", self.backup_cron);
        tracing::debug!("Heartbeat Cron: {}", self.heartbeat_cron);
        tracing::debug!("Deregister Cron: {}", self.deregister_cron);
        tracing::debug!(
            "Notification Spacing Minutes: {}",
            self.notification_spacing_minutes
        );
        tracing::debug!(
            "Maintenance Interval Rounds: {}",
            self.maintenance_interval_rounds
        );
        tracing::debug!("S3 Bucket Name: {}", self.s3_bucket_name);
        tracing::debug!("Minimum App Version: {}", self.minimum_app_version);
        tracing::debug!("Redis URL: {}", self.redis_url);
        tracing::debug!("Ntfy Auth Token: [REDACTED]");
        tracing::debug!("============================");
    }
}

fn default_host() -> String {
    crate::constants::DEFAULT_HOST.to_string()
}

fn default_port() -> u16 {
    crate::constants::DEFAULT_PORT.parse().unwrap()
}

fn default_private_port() -> u16 {
    crate::constants::DEFAULT_PRIVATE_PORT.parse().unwrap()
}

fn default_lnurl_domain() -> String {
    crate::constants::DEFAULT_LNURL_DOMAIN.to_string()
}

fn default_server_network() -> String {
    crate::constants::DEFAULT_SERVER_NETWORK.to_string()
}

fn default_backup_cron() -> String {
    crate::constants::DEFAULT_BACKUP_CRON.to_string()
}

fn default_heartbeat_cron() -> String {
    crate::constants::DEFAULT_HEARTBEAT_CRON.to_string()
}

fn default_deregister_cron() -> String {
    crate::constants::DEFAULT_DEREGISTER_CRON.to_string()
}

fn default_maintenance_interval_rounds() -> u16 {
    crate::constants::DEFAULT_MAINTENANCE_INTERVAL_ROUNDS
}

fn default_redis_url() -> String {
    crate::constants::DEFAULT_REDIS_URL.to_string()
}
