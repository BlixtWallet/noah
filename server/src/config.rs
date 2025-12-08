use anyhow::{Context, Result};
use bitcoin::Network;
use serde::Deserialize;
use std::net::Ipv4Addr;
use std::str::FromStr;

const ENV_PREFIX: &str = "NOAH_";

/// Configuration for the Noah server
///
/// # Configuration Sources (in order of precedence)
/// 1. Environment variables (prefixed with `NOAH_`)
/// 2. Config file (TOML)
/// 3. Default values
///
/// # Environment Variables
/// All config fields can be set via environment variables with the `NOAH_` prefix.
/// Field names are converted to SCREAMING_SNAKE_CASE:
/// - `host` -> `NOAH_HOST`
/// - `postgres_url` -> `NOAH_POSTGRES_URL`
/// - `ark_server_url` -> `NOAH_ARK_SERVER_URL`
///
/// # Hot-Reloadable Configuration
/// Most config values can be updated at runtime by modifying the config file.
/// The server watches for file changes and automatically reloads the config.
/// Environment variables are also re-read on each reload.
///
/// ## Non-Reloadable (requires restart):
/// - `host`, `port`, `private_port`: Network binding configuration
/// - `postgres_url`: Database connection settings
/// - `server_network`: Bitcoin network selection
///
/// ## Hot-Reloadable (applies automatically):
/// - `lnurl_domain`, `ark_server_url`: External service URLs
/// - `expo_access_token`: Push notification credentials
/// - `backup_cron`, `heartbeat_cron`, `deregister_cron`: Cron schedules
/// - `maintenance_interval_rounds`: Maintenance settings
/// - `s3_bucket_name`, AWS credentials: S3 configuration
/// - `minimum_app_version`: App version requirements
/// - `sentry_url`: Monitoring configuration
#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    #[serde(default = "default_host")]
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default = "default_private_port")]
    pub private_port: u16,
    #[serde(default = "default_lnurl_domain")]
    pub lnurl_domain: String,
    pub postgres_url: String,
    #[serde(default = "default_postgres_max_connections")]
    pub postgres_max_connections: u32,
    #[serde(default)]
    pub postgres_min_connections: Option<u32>,
    pub expo_access_token: String,
    pub ark_server_url: String,
    #[serde(default = "default_server_network")]
    pub server_network: String,
    pub sentry_url: Option<String>,
    #[serde(default = "default_backup_cron")]
    pub backup_cron: String,
    #[serde(default = "default_maintenance_interval_rounds")]
    pub maintenance_interval_rounds: u16,
    #[serde(default = "default_heartbeat_cron")]
    pub heartbeat_cron: String,
    #[serde(default = "default_deregister_cron")]
    pub deregister_cron: String,
    #[serde(default = "default_notification_spacing_minutes")]
    pub notification_spacing_minutes: i64,
    pub s3_bucket_name: String,
    pub aws_access_key_id: Option<String>,
    pub aws_secret_access_key: Option<String>,
    pub aws_region: Option<String>,
    #[serde(default = "default_minimum_app_version")]
    pub minimum_app_version: String,
    #[serde(default = "default_redis_url")]
    pub redis_url: String,
    #[serde(default)]
    pub ntfy_auth_token: String,
}

impl Config {
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

    pub fn from_file(path: &str) -> Result<Self> {
        let content = std::fs::read_to_string(path)
            .context(format!("Failed to read config file at: {}", path))?;
        let mut config: Config = toml::from_str(&content).context("Failed to parse TOML config")?;

        config.apply_env_overrides();
        config.set_aws_env_vars();

        Ok(config)
    }

    pub fn from_env() -> Result<Self> {
        let mut config = Self {
            host: default_host(),
            port: default_port(),
            private_port: default_private_port(),
            lnurl_domain: default_lnurl_domain(),
            postgres_url: String::new(),
            postgres_max_connections: default_postgres_max_connections(),
            postgres_min_connections: None,
            expo_access_token: String::new(),
            ark_server_url: String::new(),
            server_network: default_server_network(),
            sentry_url: None,
            backup_cron: default_backup_cron(),
            maintenance_interval_rounds: default_maintenance_interval_rounds(),
            heartbeat_cron: default_heartbeat_cron(),
            deregister_cron: default_deregister_cron(),
            notification_spacing_minutes: default_notification_spacing_minutes(),
            s3_bucket_name: String::new(),
            aws_access_key_id: None,
            aws_secret_access_key: None,
            aws_region: None,
            minimum_app_version: default_minimum_app_version(),
            redis_url: default_redis_url(),
            ntfy_auth_token: String::new(),
        };

        config.apply_env_overrides();
        config.validate()?;
        config.set_aws_env_vars();

        Ok(config)
    }

    fn validate(&self) -> Result<()> {
        if self.postgres_url.is_empty() {
            anyhow::bail!("postgres_url is required (set NOAH_POSTGRES_URL)");
        }
        if self.expo_access_token.is_empty() {
            anyhow::bail!("expo_access_token is required (set NOAH_EXPO_ACCESS_TOKEN)");
        }
        if self.ark_server_url.is_empty() {
            anyhow::bail!("ark_server_url is required (set NOAH_ARK_SERVER_URL)");
        }
        if self.s3_bucket_name.is_empty() {
            anyhow::bail!("s3_bucket_name is required (set NOAH_S3_BUCKET_NAME)");
        }
        Ok(())
    }

    fn apply_env_overrides(&mut self) {
        if let Some(val) = get_env("HOST") {
            self.host = val;
        }
        if let Some(val) = get_env("PORT") {
            if let Ok(port) = val.parse() {
                self.port = port;
            }
        }
        if let Some(val) = get_env("PRIVATE_PORT") {
            if let Ok(port) = val.parse() {
                self.private_port = port;
            }
        }
        if let Some(val) = get_env("LNURL_DOMAIN") {
            self.lnurl_domain = val;
        }
        if let Some(val) = get_env("POSTGRES_URL") {
            self.postgres_url = val;
        }
        if let Some(val) = get_env("POSTGRES_MAX_CONNECTIONS") {
            if let Ok(max) = val.parse() {
                self.postgres_max_connections = max;
            }
        }
        if let Some(val) = get_env("POSTGRES_MIN_CONNECTIONS") {
            if let Ok(min) = val.parse() {
                self.postgres_min_connections = Some(min);
            }
        }
        if let Some(val) = get_env("EXPO_ACCESS_TOKEN") {
            self.expo_access_token = val;
        }
        if let Some(val) = get_env("ARK_SERVER_URL") {
            self.ark_server_url = val;
        }
        if let Some(val) = get_env("SERVER_NETWORK") {
            self.server_network = val;
        }
        if let Some(val) = get_env("SENTRY_URL") {
            self.sentry_url = Some(val);
        }
        if let Some(val) = get_env("BACKUP_CRON") {
            self.backup_cron = val;
        }
        if let Some(val) = get_env("MAINTENANCE_INTERVAL_ROUNDS") {
            if let Ok(rounds) = val.parse() {
                self.maintenance_interval_rounds = rounds;
            }
        }
        if let Some(val) = get_env("HEARTBEAT_CRON") {
            self.heartbeat_cron = val;
        }
        if let Some(val) = get_env("DEREGISTER_CRON") {
            self.deregister_cron = val;
        }
        if let Some(val) = get_env("NOTIFICATION_SPACING_MINUTES") {
            if let Ok(mins) = val.parse() {
                self.notification_spacing_minutes = mins;
            }
        }
        if let Some(val) = get_env("S3_BUCKET_NAME") {
            self.s3_bucket_name = val;
        }
        if let Some(val) = get_env("AWS_ACCESS_KEY_ID") {
            self.aws_access_key_id = Some(val);
        }
        if let Some(val) = get_env("AWS_SECRET_ACCESS_KEY") {
            self.aws_secret_access_key = Some(val);
        }
        if let Some(val) = get_env("AWS_REGION") {
            self.aws_region = Some(val);
        }
        if let Some(val) = get_env("MINIMUM_APP_VERSION") {
            self.minimum_app_version = val;
        }
        if let Some(val) = get_env("REDIS_URL") {
            self.redis_url = val;
        }
        if let Some(val) = get_env("NTFY_AUTH_TOKEN") {
            self.ntfy_auth_token = val;
        }
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

    pub fn get_config_path() -> Option<String> {
        let args: Vec<String> = std::env::args().collect();
        for i in 0..args.len() {
            if args[i] == "--config-path" && i + 1 < args.len() {
                return Some(args[i + 1].clone());
            }
            if args[i] == "--env-only" {
                return None;
            }
        }

        if std::env::var(format!("{ENV_PREFIX}ENV_ONLY")).is_ok() {
            return None;
        }

        let path = std::env::var("CONFIG_PATH")
            .or_else(|_| std::env::var(format!("{ENV_PREFIX}CONFIG_PATH")))
            .unwrap_or_else(|_| "config.toml".to_string());

        Some(path)
    }

    pub fn load_config(path: Option<&str>) -> anyhow::Result<Config> {
        match path {
            Some(p) => Self::from_file(p),
            None => Self::from_env(),
        }
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

fn default_postgres_max_connections() -> u32 {
    10
}

fn default_maintenance_interval_rounds() -> u16 {
    crate::constants::DEFAULT_MAINTENANCE_INTERVAL_ROUNDS
}

fn default_notification_spacing_minutes() -> i64 {
    45
}

fn default_minimum_app_version() -> String {
    "0.0.1".to_string()
}

fn default_redis_url() -> String {
    crate::constants::DEFAULT_REDIS_URL.to_string()
}
