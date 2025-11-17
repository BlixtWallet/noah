use anyhow::Context;
use chrono::{DateTime, Utc};
use libsql::{Connection, Row};
use sqlx::{Pool, Postgres};
use std::env;

// We need to define the structs here so we can deserialize the data from the database.
#[derive(Debug)]
pub struct User {
    pub pubkey: String,
    pub lightning_address: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug)]
pub struct Device {
    pub pubkey: String,
    pub device_manufacturer: Option<String>,
    pub device_model: Option<String>,
    pub os_name: Option<String>,
    pub os_version: Option<String>,
    pub app_version: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug)]
pub struct PushToken {
    pub pubkey: String,
    pub push_token: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug)]
pub struct BackupMetadata {
    pub pubkey: String,
    pub s3_key: String,
    pub backup_size: i64,
    pub backup_version: i32,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug)]
pub struct BackupSettings {
    pub pubkey: String,
    pub backup_enabled: bool,
    pub last_backup_at: Option<DateTime<Utc>>,
}

#[derive(Debug)]
pub struct HeartbeatNotification {
    pub id: i32,
    pub pubkey: String,
    pub notification_id: String,
    pub status: String,
    pub sent_at: DateTime<Utc>,
    pub responded_at: Option<DateTime<Utc>>,
}

#[derive(Debug)]
pub struct JobStatusReport {
    pub id: i32,
    pub pubkey: String,
    pub report_type: String,
    pub status: String,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug)]
pub struct NotificationTracking {
    pub pubkey: String,
    pub notification_type: String,
    pub last_sent_at: DateTime<Utc>,
}

#[derive(Debug)]
pub struct OffboardingRequest {
    pub request_id: String,
    pub pubkey: String,
    pub status: String,
    pub address: String,
    pub address_signature: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    let turso_db_url = env::var("TURSO_DATABASE_URL").context("TURSO_DATABASE_URL must be set")?;
    let turso_auth_token = env::var("TURSO_AUTH_TOKEN").context("TURSO_AUTH_TOKEN must be set")?;
    let postgres_db_url = env::var("DATABASE_URL").context("DATABASE_URL must be set")?;

    println!("Connecting to Turso DB...");
    let db = libsql::Database::open_remote(turso_db_url, turso_auth_token)?;
    let turso_conn = db.connect()?;
    println!("Connected to Turso DB");

    println!("Connecting to Postgres DB...");
    let postgres_pool = sqlx::postgres::PgPoolOptions::new()
        .connect(&postgres_db_url)
        .await
        .context("Failed to connect to Postgres DB")?;
    println!("Connected to Postgres DB");

    println!("Running Postgres migrations...");
    sqlx::migrate!("./migrations")
        .run(&postgres_pool)
        .await
        .context("Failed to run Postgres migrations")?;
    println!("Postgres migrations completed.");

    migrate_data(&turso_conn, &postgres_pool).await?;

    println!("Data migration completed successfully!");

    Ok(())
}

async fn migrate_data(
    turso_conn: &Connection,
    postgres_pool: &Pool<Postgres>,
) -> anyhow::Result<()> {
    println!("Starting data migration...");

    migrate_users(turso_conn, postgres_pool).await?;
    migrate_devices(turso_conn, postgres_pool).await?;
    migrate_push_tokens(turso_conn, postgres_pool).await?;
    migrate_backup_metadata(turso_conn, postgres_pool).await?;
    migrate_backup_settings(turso_conn, postgres_pool).await?;
    migrate_heartbeat_notifications(turso_conn, postgres_pool).await?;
    migrate_job_status_reports(turso_conn, postgres_pool).await?;
    migrate_notification_tracking(turso_conn, postgres_pool).await?;
    migrate_offboarding_requests(turso_conn, postgres_pool).await?;

    Ok(())
}

// Helper to convert row to a struct
trait FromLibsqlRow: Sized {
    fn from_row(row: &Row) -> anyhow::Result<Self>;
}

impl FromLibsqlRow for User {
    fn from_row(row: &Row) -> anyhow::Result<Self> {
        let created_at_str: String = row.get(2)?;
        let updated_at_str: String = row.get(3)?;
        Ok(User {
            pubkey: row.get(0)?,
            lightning_address: row.get(1)?,
            created_at: chrono::NaiveDateTime::parse_from_str(
                &created_at_str,
                "%Y-%m-%d %H:%M:%S",
            )?
            .and_utc(),
            updated_at: chrono::NaiveDateTime::parse_from_str(
                &updated_at_str,
                "%Y-%m-%d %H:%M:%S",
            )?
            .and_utc(),
        })
    }
}

impl FromLibsqlRow for Device {
    fn from_row(row: &Row) -> anyhow::Result<Self> {
        let created_at_str: String = row.get(6)?;
        let updated_at_str: String = row.get(7)?;
        Ok(Device {
            pubkey: row.get(0)?,
            device_manufacturer: row.get(1)?,
            device_model: row.get(2)?,
            os_name: row.get(3)?,
            os_version: row.get(4)?,
            app_version: row.get(5)?,
            created_at: chrono::NaiveDateTime::parse_from_str(
                &created_at_str,
                "%Y-%m-%d %H:%M:%S",
            )?
            .and_utc(),
            updated_at: chrono::NaiveDateTime::parse_from_str(
                &updated_at_str,
                "%Y-%m-%d %H:%M:%S",
            )?
            .and_utc(),
        })
    }
}

impl FromLibsqlRow for PushToken {
    fn from_row(row: &Row) -> anyhow::Result<Self> {
        let created_at_str: String = row.get(2)?;
        let updated_at_str: String = row.get(3)?;
        Ok(PushToken {
            pubkey: row.get(0)?,
            push_token: row.get(1)?,
            created_at: chrono::NaiveDateTime::parse_from_str(
                &created_at_str,
                "%Y-%m-%d %H:%M:%S",
            )?
            .and_utc(),
            updated_at: chrono::NaiveDateTime::parse_from_str(
                &updated_at_str,
                "%Y-%m-%d %H:%M:%S",
            )?
            .and_utc(),
        })
    }
}

impl FromLibsqlRow for BackupMetadata {
    fn from_row(row: &Row) -> anyhow::Result<Self> {
        let created_at_str: Option<String> = row.get(4)?;
        let created_at = created_at_str
            .and_then(|s| {
                if s.is_empty() {
                    None
                } else {
                    chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S")
                        .ok()
                        .map(|naive_dt| naive_dt.and_utc())
                }
            })
            .unwrap_or_else(Utc::now);

        Ok(BackupMetadata {
            pubkey: row.get(0)?,
            s3_key: row.get(1)?,
            backup_size: row.get(2)?,
            backup_version: row.get(3)?,
            created_at,
        })
    }
}

impl FromLibsqlRow for BackupSettings {
    fn from_row(row: &Row) -> anyhow::Result<Self> {
        let enabled_val: i64 = row.get(1)?;
        let last_backup_at_str: Option<String> = row.get(2)?;
        let last_backup_at = last_backup_at_str.and_then(|s| {
            if s.is_empty() {
                None
            } else {
                chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S")
                    .ok()
                    .map(|naive_dt| naive_dt.and_utc())
            }
        });
        Ok(BackupSettings {
            pubkey: row.get(0)?,
            backup_enabled: enabled_val != 0,
            last_backup_at,
        })
    }
}

impl FromLibsqlRow for HeartbeatNotification {
    fn from_row(row: &Row) -> anyhow::Result<Self> {
        let sent_at_str: Option<String> = row.get(4)?;
        let responded_at_str: Option<String> = row.get(5)?;

        let sent_at = sent_at_str
            .and_then(|s| {
                if s.is_empty() {
                    None
                } else {
                    chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S")
                        .ok()
                        .map(|naive_dt| naive_dt.and_utc())
                }
            })
            .unwrap_or_else(Utc::now);

        let responded_at = responded_at_str.and_then(|s| {
            if s.is_empty() {
                None
            } else {
                chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S")
                    .ok()
                    .map(|naive_dt| naive_dt.and_utc())
            }
        });

        Ok(HeartbeatNotification {
            id: row.get(0)?,
            pubkey: row.get(1)?,
            notification_id: row.get(2)?,
            status: row.get(3)?,
            sent_at,
            responded_at,
        })
    }
}

impl FromLibsqlRow for JobStatusReport {
    fn from_row(row: &Row) -> anyhow::Result<Self> {
        let created_at_str: Option<String> = row.get(5)?;
        let created_at = created_at_str
            .and_then(|s| {
                if s.is_empty() {
                    None
                } else {
                    chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S")
                        .ok()
                        .map(|naive_dt| naive_dt.and_utc())
                }
            })
            .unwrap_or_else(Utc::now);

        Ok(JobStatusReport {
            id: row.get(0)?,
            pubkey: row.get(1)?,
            report_type: row.get(2)?,
            status: row.get(3)?,
            error_message: row.get(4)?,
            created_at,
        })
    }
}

impl FromLibsqlRow for NotificationTracking {
    fn from_row(row: &Row) -> anyhow::Result<Self> {
        let last_sent_at_str: Option<String> = row.get(2)?;
        let last_sent_at = last_sent_at_str
            .and_then(|s| {
                if s.is_empty() {
                    None
                } else {
                    chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S")
                        .ok()
                        .map(|naive_dt| naive_dt.and_utc())
                }
            })
            .unwrap_or_else(Utc::now);

        Ok(NotificationTracking {
            pubkey: row.get(0)?,
            notification_type: row.get(1)?,
            last_sent_at,
        })
    }
}

impl FromLibsqlRow for OffboardingRequest {
    fn from_row(row: &Row) -> anyhow::Result<Self> {
        let created_at_str: Option<String> = row.get(5)?;
        let updated_at_str: Option<String> = row.get(6)?;

        let created_at = created_at_str
            .and_then(|s| {
                if s.is_empty() {
                    None
                } else {
                    chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S")
                        .ok()
                        .map(|naive_dt| naive_dt.and_utc())
                }
            })
            .unwrap_or_else(Utc::now);
        let updated_at = updated_at_str
            .and_then(|s| {
                if s.is_empty() {
                    None
                } else {
                    chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S")
                        .ok()
                        .map(|naive_dt| naive_dt.and_utc())
                }
            })
            .unwrap_or_else(Utc::now);

        Ok(OffboardingRequest {
            request_id: row.get(0)?,
            pubkey: row.get(1)?,
            status: row.get(2)?,
            address: row.get(3)?,
            address_signature: row.get(4)?,
            created_at,
            updated_at,
        })
    }
}

async fn fetch_and_parse<T: FromLibsqlRow>(
    conn: &Connection,
    query: &str,
) -> anyhow::Result<Vec<T>> {
    let mut rows = conn.query(query, ()).await?;
    let mut results = Vec::new();
    while let Some(row) = rows.next().await? {
        results.push(T::from_row(&row)?);
    }
    Ok(results)
}

async fn migrate_users(
    turso_conn: &Connection,
    postgres_pool: &Pool<Postgres>,
) -> anyhow::Result<()> {
    println!("Migrating users...");
    let users = fetch_and_parse::<User>(
        turso_conn,
        "SELECT pubkey, lightning_address, created_at, updated_at FROM users",
    )
    .await?;
    for user in users {
        sqlx::query(
            "INSERT INTO users (pubkey, lightning_address, created_at, updated_at) VALUES ($1, $2, $3, $4) ON CONFLICT (pubkey) DO UPDATE SET lightning_address = EXCLUDED.lightning_address, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at",
        )
        .bind(&user.pubkey)
        .bind(&user.lightning_address)
        .bind(user.created_at)
        .bind(user.updated_at)
        .execute(postgres_pool)
        .await?;
    }
    println!("Users migration completed.");
    Ok(())
}

async fn migrate_devices(
    turso_conn: &Connection,
    postgres_pool: &Pool<Postgres>,
) -> anyhow::Result<()> {
    println!("Migrating devices...");
    let devices = fetch_and_parse::<Device>(turso_conn, "SELECT pubkey, device_manufacturer, device_model, os_name, os_version, app_version, created_at, updated_at FROM devices").await?;
    for device in devices {
        sqlx::query(
            "INSERT INTO devices (pubkey, device_manufacturer, device_model, os_name, os_version, app_version, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (pubkey) DO UPDATE SET device_manufacturer = EXCLUDED.device_manufacturer, device_model = EXCLUDED.device_model, os_name = EXCLUDED.os_name, os_version = EXCLUDED.os_version, app_version = EXCLUDED.app_version, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at"
        )
        .bind(&device.pubkey)
        .bind(&device.device_manufacturer)
        .bind(&device.device_model)
        .bind(&device.os_name)
        .bind(&device.os_version)
        .bind(&device.app_version)
        .bind(device.created_at)
        .bind(device.updated_at)
        .execute(postgres_pool)
        .await?;
    }
    println!("Devices migration completed.");
    Ok(())
}

async fn migrate_push_tokens(
    turso_conn: &Connection,
    postgres_pool: &Pool<Postgres>,
) -> anyhow::Result<()> {
    println!("Migrating push tokens...");
    let tokens = fetch_and_parse::<PushToken>(
        turso_conn,
        "SELECT pubkey, push_token, created_at, updated_at FROM push_tokens",
    )
    .await?;
    for token in tokens {
        sqlx::query(
            "INSERT INTO push_tokens (pubkey, push_token, created_at, updated_at) VALUES ($1, $2, $3, $4) ON CONFLICT (pubkey) DO UPDATE SET push_token = EXCLUDED.push_token, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at",
        )
        .bind(&token.pubkey)
        .bind(&token.push_token)
        .bind(token.created_at)
        .bind(token.updated_at)
        .execute(postgres_pool)
        .await?;
    }
    println!("Push tokens migration completed.");
    Ok(())
}

async fn migrate_backup_metadata(
    turso_conn: &Connection,
    postgres_pool: &Pool<Postgres>,
) -> anyhow::Result<()> {
    println!("Migrating backup metadata...");
    let metadata_records = fetch_and_parse::<BackupMetadata>(
        turso_conn,
        "SELECT pubkey, s3_key, backup_size, backup_version, created_at FROM backup_metadata",
    )
    .await?;
    for record in metadata_records {
        sqlx::query(
            "INSERT INTO backup_metadata (pubkey, s3_key, backup_size, backup_version, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (pubkey, backup_version) DO UPDATE SET s3_key = EXCLUDED.s3_key, backup_size = EXCLUDED.backup_size, created_at = EXCLUDED.created_at",
        )
        .bind(&record.pubkey)
        .bind(&record.s3_key)
        .bind(record.backup_size)
        .bind(record.backup_version)
        .bind(record.created_at)
        .execute(postgres_pool)
        .await?;
    }
    println!("Backup metadata migration completed.");
    Ok(())
}

async fn migrate_backup_settings(
    turso_conn: &Connection,
    postgres_pool: &Pool<Postgres>,
) -> anyhow::Result<()> {
    println!("Migrating backup settings...");
    let settings_records = fetch_and_parse::<BackupSettings>(
        turso_conn,
        "SELECT pubkey, backup_enabled, last_backup_at FROM backup_settings",
    )
    .await?;
    for record in settings_records {
        sqlx::query(
            "INSERT INTO backup_settings (pubkey, backup_enabled, last_backup_at) VALUES ($1, $2, $3) ON CONFLICT (pubkey) DO UPDATE SET backup_enabled = EXCLUDED.backup_enabled, last_backup_at = EXCLUDED.last_backup_at",
        )
        .bind(&record.pubkey)
        .bind(record.backup_enabled)
        .bind(record.last_backup_at)
        .execute(postgres_pool)
        .await?;
    }
    println!("Backup settings migration completed.");
    Ok(())
}

async fn migrate_heartbeat_notifications(
    turso_conn: &Connection,
    postgres_pool: &Pool<Postgres>,
) -> anyhow::Result<()> {
    println!("Migrating heartbeat notifications...");
    let notifications = fetch_and_parse::<HeartbeatNotification>(turso_conn, "SELECT id, pubkey, notification_id, status, sent_at, responded_at FROM heartbeat_notifications").await?;
    for notification in notifications {
        sqlx::query(
            "INSERT INTO heartbeat_notifications (id, pubkey, notification_id, status, sent_at, responded_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET pubkey = EXCLUDED.pubkey, notification_id = EXCLUDED.notification_id, status = EXCLUDED.status, sent_at = EXCLUDED.sent_at, responded_at = EXCLUDED.responded_at",
        )
        .bind(notification.id)
        .bind(&notification.pubkey)
        .bind(&notification.notification_id)
        .bind(&notification.status)
        .bind(notification.sent_at)
        .bind(notification.responded_at)
        .execute(postgres_pool)
        .await?;
    }
    println!("Heartbeat notifications migration completed.");
    Ok(())
}

async fn migrate_job_status_reports(
    turso_conn: &Connection,
    postgres_pool: &Pool<Postgres>,
) -> anyhow::Result<()> {
    println!("Migrating job status reports...");
    let reports = fetch_and_parse::<JobStatusReport>(
        turso_conn,
        "SELECT id, pubkey, report_type, status, error_message, created_at FROM job_status_reports",
    )
    .await?;
    for report in reports {
        sqlx::query(
            "INSERT INTO job_status_reports (id, pubkey, report_type, status, error_message, created_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET pubkey = EXCLUDED.pubkey, report_type = EXCLUDED.report_type, status = EXCLUDED.status, error_message = EXCLUDED.error_message, created_at = EXCLUDED.created_at",
        )
        .bind(report.id)
        .bind(&report.pubkey)
        .bind(&report.report_type)
        .bind(&report.status)
        .bind(&report.error_message)
        .bind(report.created_at)
        .execute(postgres_pool)
        .await?;
    }
    println!("Job status reports migration completed.");
    Ok(())
}

async fn migrate_notification_tracking(
    turso_conn: &Connection,
    postgres_pool: &Pool<Postgres>,
) -> anyhow::Result<()> {
    println!("Migrating notification tracking...");
    let tracking_records = fetch_and_parse::<NotificationTracking>(
        turso_conn,
        "SELECT pubkey, notification_type, last_sent_at FROM notification_tracking",
    )
    .await?;
    for record in tracking_records {
        sqlx::query(
            "INSERT INTO notification_tracking (pubkey, notification_type, last_sent_at) VALUES ($1, $2, $3) ON CONFLICT (pubkey, notification_type) DO UPDATE SET last_sent_at = EXCLUDED.last_sent_at",
        )
        .bind(&record.pubkey)
        .bind(&record.notification_type)
        .bind(record.last_sent_at)
        .execute(postgres_pool)
        .await?;
    }
    println!("Notification tracking migration completed.");
    Ok(())
}

async fn migrate_offboarding_requests(
    turso_conn: &Connection,
    postgres_pool: &Pool<Postgres>,
) -> anyhow::Result<()> {
    println!("Migrating offboarding requests...");
    let requests = fetch_and_parse::<OffboardingRequest>(turso_conn, "SELECT request_id, pubkey, status, address, address_signature, created_at, updated_at FROM offboarding_requests").await?;
    for request in requests {
        sqlx::query(
            "INSERT INTO offboarding_requests (request_id, pubkey, status, address, address_signature, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (request_id) DO UPDATE SET pubkey = EXCLUDED.pubkey, status = EXCLUDED.status, address = EXCLUDED.address, address_signature = EXCLUDED.address_signature, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at",
        )
        .bind(&request.request_id)
        .bind(&request.pubkey)
        .bind(&request.status)
        .bind(&request.address)
        .bind(&request.address_signature)
        .bind(request.created_at)
        .bind(request.updated_at)
        .execute(postgres_pool)
        .await?;
    }
    println!("Offboarding requests migration completed.");
    Ok(())
}
