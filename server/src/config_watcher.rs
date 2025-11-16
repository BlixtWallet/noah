use anyhow::{Context, Result};
use arc_swap::ArcSwap;
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

use crate::config::Config;

pub async fn start_config_watcher(
    config_path: String,
    config_swap: Arc<ArcSwap<Config>>,
) -> Result<()> {
    let (tx, mut rx) = mpsc::channel(100);

    let mut watcher: RecommendedWatcher =
        notify::recommended_watcher(move |res: Result<Event, _>| {
            if let Ok(event) = res {
                if matches!(
                    event.kind,
                    notify::EventKind::Modify(_) | notify::EventKind::Create(_)
                ) {
                    let _ = tx.blocking_send(event);
                }
            }
        })
        .context("Failed to create file watcher")?;

    let path = Path::new(&config_path);
    watcher
        .watch(path, RecursiveMode::NonRecursive)
        .context("Failed to watch config file")?;

    info!("Started watching config file: {}", config_path);

    tokio::spawn(async move {
        let _watcher = watcher;

        while let Some(_event) = rx.recv().await {
            debug!("Config file changed, reloading...");

            match Config::from_file(&config_path) {
                Ok(new_config) => {
                    let old_config = config_swap.load();

                    let non_reloadable = log_config_changes(&old_config, &new_config);

                    if non_reloadable {
                        warn!(
                            "Config changes detected that require server restart: \
                            host, port, private_port, postgres urls, pool settings, or server_network"
                        );
                    }

                    config_swap.store(Arc::new(new_config.clone()));
                }
                Err(e) => {
                    error!("Failed to reload config: {}. Keeping old config.", e);
                }
            }
        }
    });

    Ok(())
}

fn log_config_changes(old: &Config, new: &Config) -> bool {
    let mut has_non_reloadable = false;

    if old.host != new.host {
        warn!(
            "host changed: {} -> {} (requires restart)",
            old.host, new.host
        );
        has_non_reloadable = true;
    }
    if old.port != new.port {
        warn!(
            "port changed: {} -> {} (requires restart)",
            old.port, new.port
        );
        has_non_reloadable = true;
    }
    if old.private_port != new.private_port {
        warn!(
            "private_port changed: {} -> {} (requires restart)",
            old.private_port, new.private_port
        );
        has_non_reloadable = true;
    }
    if old.server_network != new.server_network {
        warn!(
            "server_network changed: {} -> {} (requires restart)",
            old.server_network, new.server_network
        );
        has_non_reloadable = true;
    }
    if old.postgres_url != new.postgres_url {
        warn!("postgres_url changed (requires restart)");
        has_non_reloadable = true;
    }
    if old.postgres_max_connections != new.postgres_max_connections
        || old.postgres_min_connections != new.postgres_min_connections
    {
        warn!("postgres connection pool settings changed (requires restart)");
        has_non_reloadable = true;
    }

    // Log hot-reloadable changes
    if old.lnurl_domain != new.lnurl_domain {
        info!(
            "lnurl_domain changed: {} -> {}",
            old.lnurl_domain, new.lnurl_domain
        );
    }
    if old.ark_server_url != new.ark_server_url {
        info!(
            "ark_server_url changed: {} -> {}",
            old.ark_server_url, new.ark_server_url
        );
    }
    if old.expo_access_token != new.expo_access_token {
        info!("expo_access_token changed");
    }
    if old.backup_cron != new.backup_cron {
        info!(
            "backup_cron changed: {} -> {}",
            old.backup_cron, new.backup_cron
        );
    }
    if old.heartbeat_cron != new.heartbeat_cron {
        info!(
            "heartbeat_cron changed: {} -> {}",
            old.heartbeat_cron, new.heartbeat_cron
        );
    }
    if old.deregister_cron != new.deregister_cron {
        info!(
            "deregister_cron changed: {} -> {}",
            old.deregister_cron, new.deregister_cron
        );
    }
    if old.maintenance_interval_rounds != new.maintenance_interval_rounds {
        info!(
            "maintenance_interval_rounds changed: {} -> {}",
            old.maintenance_interval_rounds, new.maintenance_interval_rounds
        );
    }
    if old.s3_bucket_name != new.s3_bucket_name {
        info!(
            "s3_bucket_name changed: {} -> {}",
            old.s3_bucket_name, new.s3_bucket_name
        );
    }
    if old.aws_region != new.aws_region {
        info!("aws_region changed");
    }
    if old.minimum_app_version != new.minimum_app_version {
        info!(
            "minimum_app_version changed: {} -> {}",
            old.minimum_app_version, new.minimum_app_version
        );
    }
    if old.sentry_url != new.sentry_url {
        info!("sentry_url changed");
    }

    has_non_reloadable
}
