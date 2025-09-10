#[derive(strum_macros::Display, strum_macros::IntoStaticStr)]
pub enum EnvVariables {
    #[strum(serialize = "HOST")]
    Host,
    #[strum(serialize = "PORT")]
    Port,
    #[strum(serialize = "PRIVATE_PORT")]
    PrivatePort,
    #[strum(serialize = "LNURL_DOMAIN")]
    LnurlDomain,
    #[strum(serialize = "TURSO_URL")]
    TursoUrl,
    #[strum(serialize = "TURSO_API_KEY")]
    TursoApiKey,
    #[strum(serialize = "EXPO_ACCESS_TOKEN")]
    ExpoAccessToken,
    #[strum(serialize = "ARK_SERVER_URL")]
    ArkServerUrl,
    #[strum(serialize = "SERVER_NETWORK")]
    ServerNetwork,
    #[strum(serialize = "SENTRY_TOKEN")]
    SentryToken,
    #[strum(serialize = "BACKGROUND_SYNC_CRON")]
    BackgroundSyncCron,
    #[strum(serialize = "BACKUP_CRON")]
    BackupCron,
    #[strum(serialize = "S3_BUCKET_NAME")]
    S3BucketName,
}

pub const DEFAULT_HOST: &str = "0.0.0.0";
pub const DEFAULT_PORT: &str = "3000";
pub const DEFAULT_PRIVATE_PORT: &str = "3099";
pub const DEFAULT_LNURL_DOMAIN: &str = "localhost";
pub const DEFAULT_SERVER_NETWORK: &str = "regtest";
pub const DEFAULT_BACKUP_CRON: &str = "every 2 hours";
pub const DEFAULT_BACKGROUND_SYNC_CRON: &str = "every 2 hours";
