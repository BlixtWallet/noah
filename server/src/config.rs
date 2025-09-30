use anyhow::{Context, Result};
use bitcoin::Network;
use serde::Deserialize;
use std::net::Ipv4Addr;
use std::str::FromStr;

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
    pub turso_url: String,
    pub turso_api_key: String,
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
    pub s3_bucket_name: String,
    pub aws_access_key_id: Option<String>,
    pub aws_secret_access_key: Option<String>,
    pub aws_region: Option<String>,
}

impl Config {
    pub fn from_file(path: &str) -> Result<Self> {
        let content = std::fs::read_to_string(path)
            .context(format!("Failed to read config file at: {}", path))?;
        let config: Config = toml::from_str(&content).context("Failed to parse TOML config")?;

        // Set AWS credentials as environment variables if provided in config
        if let Some(access_key) = &config.aws_access_key_id {
            unsafe {
                std::env::set_var("AWS_ACCESS_KEY_ID", access_key);
            }
        }
        if let Some(secret_key) = &config.aws_secret_access_key {
            unsafe {
                std::env::set_var("AWS_SECRET_ACCESS_KEY", secret_key);
            }
        }

        if let Some(region) = &config.aws_region {
            unsafe {
                std::env::set_var("AWS_REGION", region);
            }
        }

        Ok(config)
    }

    pub fn host(&self) -> Result<Ipv4Addr> {
        Ipv4Addr::from_str(&self.host).context(format!("Invalid host address: {}", self.host))
    }

    pub fn network(&self) -> Result<Network> {
        Network::from_str(&self.server_network)
            .context(format!("Invalid network: {}", self.server_network))
    }

    pub fn get_config_path() -> String {
        // Check for --config-path CLI argument first
        let args: Vec<String> = std::env::args().collect();
        for i in 0..args.len() {
            if args[i] == "--config-path" && i + 1 < args.len() {
                return args[i + 1].clone();
            }
        }

        // Fall back to CONFIG_PATH env variable
        std::env::var("CONFIG_PATH").unwrap_or_else(|_| "config.toml".to_string())
    }

    pub fn load_config(path: &str) -> anyhow::Result<Config> {
        Self::from_file(path)
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
