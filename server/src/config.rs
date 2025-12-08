use anyhow::{Context, Result};
use bitcoin::Network;
use std::net::Ipv4Addr;
use std::str::FromStr;

const ENV_PREFIX: &str = "NOAH_";

/// Configuration for the Noah server
///
/// All config fields are set via environment variables with the `NOAH_` prefix.
/// Field names are converted to SCREAMING_SNAKE_CASE:
/// - `host` -> `NOAH_HOST`
/// - `postgres_url` -> `NOAH_POSTGRES_URL`
/// - `ark_server_url` -> `NOAH_ARK_SERVER_URL`
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
    pub aws_access_key_id: Option<String>,
    pub aws_secret_access_key: Option<String>,
    pub aws_region: Option<String>,
    pub minimum_app_version: String,
    pub redis_url: String,
    pub ntfy_auth_token: String,
}

impl Config {
    pub fn load() -> Result<Self> {
        // Load .env file if present (useful for local development)
        let _ = dotenvy::dotenv();

        let config = Self {
            host: get_env("HOST").unwrap_or_else(default_host),
            port: get_env("PORT")
                .and_then(|v| v.parse().ok())
                .unwrap_or_else(default_port),
            private_port: get_env("PRIVATE_PORT")
                .and_then(|v| v.parse().ok())
                .unwrap_or_else(default_private_port),
            lnurl_domain: get_env("LNURL_DOMAIN").unwrap_or_else(default_lnurl_domain),
            postgres_url: get_env("POSTGRES_URL").unwrap_or_default(),
            postgres_max_connections: get_env("POSTGRES_MAX_CONNECTIONS")
                .and_then(|v| v.parse().ok())
                .unwrap_or(10),
            postgres_min_connections: get_env("POSTGRES_MIN_CONNECTIONS")
                .and_then(|v| v.parse().ok()),
            expo_access_token: get_env("EXPO_ACCESS_TOKEN").unwrap_or_default(),
            ark_server_url: get_env("ARK_SERVER_URL").unwrap_or_default(),
            server_network: get_env("SERVER_NETWORK").unwrap_or_else(default_server_network),
            sentry_url: get_env("SENTRY_URL"),
            backup_cron: get_env("BACKUP_CRON").unwrap_or_else(default_backup_cron),
            maintenance_interval_rounds: get_env("MAINTENANCE_INTERVAL_ROUNDS")
                .and_then(|v| v.parse().ok())
                .unwrap_or_else(default_maintenance_interval_rounds),
            heartbeat_cron: get_env("HEARTBEAT_CRON").unwrap_or_else(default_heartbeat_cron),
            deregister_cron: get_env("DEREGISTER_CRON").unwrap_or_else(default_deregister_cron),
            notification_spacing_minutes: get_env("NOTIFICATION_SPACING_MINUTES")
                .and_then(|v| v.parse().ok())
                .unwrap_or(45),
            s3_bucket_name: get_env("S3_BUCKET_NAME").unwrap_or_default(),
            aws_access_key_id: get_env("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key: get_env("AWS_SECRET_ACCESS_KEY"),
            aws_region: get_env("AWS_REGION"),
            minimum_app_version: get_env("MINIMUM_APP_VERSION")
                .unwrap_or_else(|| "0.0.1".to_string()),
            redis_url: get_env("REDIS_URL").unwrap_or_else(default_redis_url),
            ntfy_auth_token: get_env("NTFY_AUTH_TOKEN").unwrap_or_default(),
        };

        config.validate()?;
        config.set_aws_env_vars();

        Ok(config)
    }

    fn validate(&self) -> Result<()> {
        if self.postgres_url.is_empty() {
            anyhow::bail!("NOAH_POSTGRES_URL is required");
        }
        if self.expo_access_token.is_empty() {
            anyhow::bail!("NOAH_EXPO_ACCESS_TOKEN is required");
        }
        if self.ark_server_url.is_empty() {
            anyhow::bail!("NOAH_ARK_SERVER_URL is required");
        }
        if self.s3_bucket_name.is_empty() {
            anyhow::bail!("NOAH_S3_BUCKET_NAME is required");
        }
        Ok(())
    }

    fn set_aws_env_vars(&self) {
        if let Some(access_key) = &self.aws_access_key_id {
            unsafe {
                std::env::set_var("AWS_ACCESS_KEY_ID", access_key);
            }
        }
        if let Some(secret_key) = &self.aws_secret_access_key {
            unsafe {
                std::env::set_var("AWS_SECRET_ACCESS_KEY", secret_key);
            }
        }
        if let Some(region) = &self.aws_region {
            unsafe {
                std::env::set_var("AWS_REGION", region);
            }
        }
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
        tracing::debug!(
            "AWS Access Key ID: {}",
            if self.aws_access_key_id.is_some() {
                "[SET]"
            } else {
                "[NOT SET]"
            }
        );
        tracing::debug!(
            "AWS Secret Access Key: {}",
            if self.aws_secret_access_key.is_some() {
                "[SET]"
            } else {
                "[NOT SET]"
            }
        );
        tracing::debug!(
            "AWS Region: {}",
            self.aws_region.as_deref().unwrap_or("[NOT SET]")
        );
        tracing::debug!("Minimum App Version: {}", self.minimum_app_version);
        tracing::debug!("Redis URL: {}", self.redis_url);
        tracing::debug!("Ntfy Auth Token: [REDACTED]");
        tracing::debug!("============================");
    }
}

fn get_env(name: &str) -> Option<String> {
    std::env::var(format!("{ENV_PREFIX}{name}")).ok()
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
