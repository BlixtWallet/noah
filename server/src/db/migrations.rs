use anyhow::Result;
use libsql::Connection;
use std::future::Future;
use std::pin::Pin;
use tracing::info;

pub struct Migration {
    pub version: i32,
    pub name: &'static str,
    pub up: fn(&Connection) -> Pin<Box<dyn Future<Output = Result<()>> + '_>>,
}

pub async fn run_migrations(db: &libsql::Database) -> Result<()> {
    let conn = db.connect()?;

    create_migrations_table(&conn).await?;

    let migrations = get_migrations();
    let current_version = get_current_version(&conn).await?;

    info!("Current database version: {}", current_version);

    for migration in migrations {
        if migration.version > current_version {
            info!(
                "Running migration v{}: {}",
                migration.version, migration.name
            );
            (migration.up)(&conn).await?;
            update_version(&conn, migration.version, migration.name).await?;
            info!("Migration v{} completed", migration.version);
        }
    }

    info!("All migrations completed");
    Ok(())
}

async fn create_migrations_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS migration_history (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_on TEXT NOT NULL
        )",
        (),
    )
    .await?;

    Ok(())
}

async fn get_current_version(conn: &Connection) -> Result<i32> {
    let mut result = conn
        .query("SELECT MAX(version) as version FROM migration_history", ())
        .await?;

    if let Some(row) = result.next().await? {
        if let Ok(Some(version)) = row.get::<Option<i32>>(0) {
            return Ok(version);
        }
    }

    Ok(0)
}

async fn update_version(conn: &Connection, version: i32, name: &str) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO migration_history (version, name, applied_on) VALUES (?, ?, ?)",
        libsql::params![version, name, now],
    )
    .await?;

    Ok(())
}

fn get_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            name: "create_users_table",
            up: |conn| Box::pin(migration_v1_create_users(conn)),
        },
        Migration {
            version: 2,
            name: "create_push_tokens_table",
            up: |conn| Box::pin(migration_v2_create_push_tokens(conn)),
        },
        Migration {
            version: 3,
            name: "create_backup_tables",
            up: |conn| Box::pin(migration_v3_create_backup_tables(conn)),
        },
        Migration {
            version: 4,
            name: "create_offboarding_requests_table",
            up: |conn| Box::pin(migration_v4_create_offboarding_requests(conn)),
        },
        Migration {
            version: 5,
            name: "create_job_status_reports_table",
            up: |conn| Box::pin(migration_v5_create_job_status_reports(conn)),
        },
        Migration {
            version: 6,
            name: "create_devices_table",
            up: |conn| Box::pin(migration_v6_create_devices(conn)),
        },
        Migration {
            version: 7,
            name: "create_heartbeat_notifications_table",
            up: |conn| Box::pin(migration_v7_create_heartbeat_notifications(conn)),
        },
        Migration {
            version: 8,
            name: "create_notification_tracking_table",
            up: |conn| Box::pin(migration_v8_create_notification_tracking(conn)),
        },
    ]
}

async fn migration_v1_create_users(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE users (
            pubkey TEXT PRIMARY KEY,
            lightning_address TEXT UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )",
        (),
    )
    .await?;

    conn.execute(
        "CREATE TRIGGER update_users_updated_at
        AFTER UPDATE ON users
        FOR EACH ROW
        BEGIN
            UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE pubkey = OLD.pubkey;
        END",
        (),
    )
    .await?;

    Ok(())
}

async fn migration_v2_create_push_tokens(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE push_tokens (
            pubkey TEXT PRIMARY KEY,
            push_token TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )",
        (),
    )
    .await?;

    conn.execute(
        "CREATE TRIGGER update_push_tokens_updated_at
        AFTER UPDATE ON push_tokens
        FOR EACH ROW
        BEGIN
            UPDATE push_tokens SET updated_at = CURRENT_TIMESTAMP WHERE pubkey = OLD.pubkey;
        END",
        (),
    )
    .await?;

    Ok(())
}

async fn migration_v3_create_backup_tables(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE backup_metadata (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pubkey TEXT NOT NULL,
            s3_key TEXT NOT NULL,
            backup_size INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            backup_version INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (pubkey) REFERENCES users(pubkey),
            UNIQUE(pubkey, backup_version)
        )",
        (),
    )
    .await?;

    conn.execute(
        "CREATE INDEX idx_backup_metadata_pubkey ON backup_metadata(pubkey)",
        (),
    )
    .await?;

    conn.execute(
        "CREATE INDEX idx_backup_metadata_created_at ON backup_metadata(created_at)",
        (),
    )
    .await?;

    conn.execute(
        "CREATE TABLE backup_settings (
            pubkey TEXT PRIMARY KEY,
            backup_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            last_backup_at TIMESTAMP,
            FOREIGN KEY (pubkey) REFERENCES users(pubkey)
        )",
        (),
    )
    .await?;

    Ok(())
}

async fn migration_v4_create_offboarding_requests(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE offboarding_requests (
            request_id TEXT PRIMARY KEY,
            pubkey TEXT NOT NULL,
            address TEXT NOT NULL,
            address_signature TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (pubkey) REFERENCES users(pubkey)
        )",
        (),
    )
    .await?;

    conn.execute(
        "CREATE INDEX idx_offboarding_requests_pubkey ON offboarding_requests(pubkey)",
        (),
    )
    .await?;

    conn.execute(
        "CREATE INDEX idx_offboarding_requests_status ON offboarding_requests(status)",
        (),
    )
    .await?;

    conn.execute(
        "CREATE TRIGGER update_offboarding_requests_updated_at
        AFTER UPDATE ON offboarding_requests
        FOR EACH ROW
        BEGIN
            UPDATE offboarding_requests SET updated_at = CURRENT_TIMESTAMP WHERE request_id = OLD.request_id;
        END",
        (),
    )
    .await?;

    Ok(())
}

async fn migration_v5_create_job_status_reports(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE job_status_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pubkey TEXT NOT NULL,
            report_type TEXT NOT NULL,
            status TEXT NOT NULL,
            error_message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (pubkey) REFERENCES users(pubkey)
        )",
        (),
    )
    .await?;

    conn.execute(
        "CREATE INDEX idx_job_status_reports_pubkey ON job_status_reports(pubkey)",
        (),
    )
    .await?;

    Ok(())
}

async fn migration_v6_create_devices(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE devices (
            pubkey TEXT PRIMARY KEY,
            device_manufacturer TEXT,
            device_model TEXT,
            os_name TEXT,
            os_version TEXT,
            app_version TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (pubkey) REFERENCES users(pubkey)
        )",
        (),
    )
    .await?;

    conn.execute(
        "CREATE TRIGGER update_devices_updated_at
        AFTER UPDATE ON devices
        FOR EACH ROW
        BEGIN
            UPDATE devices SET updated_at = CURRENT_TIMESTAMP WHERE pubkey = OLD.pubkey;
        END",
        (),
    )
    .await?;

    Ok(())
}

async fn migration_v8_create_notification_tracking(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE notification_tracking (
            pubkey TEXT NOT NULL,
            notification_type TEXT NOT NULL,
            last_sent_at TIMESTAMP NOT NULL,
            PRIMARY KEY (pubkey, notification_type),
            FOREIGN KEY (pubkey) REFERENCES users(pubkey)
        )",
        (),
    )
    .await?;

    conn.execute(
        "CREATE INDEX idx_notification_tracking_pubkey ON notification_tracking(pubkey)",
        (),
    )
    .await?;

    conn.execute(
        "CREATE INDEX idx_notification_tracking_last_sent_at ON notification_tracking(last_sent_at)",
        (),
    )
    .await?;

    Ok(())
}

async fn migration_v7_create_heartbeat_notifications(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE heartbeat_notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pubkey TEXT NOT NULL,
            notification_id TEXT NOT NULL UNIQUE,
            sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            responded_at TIMESTAMP,
            status TEXT NOT NULL DEFAULT 'pending',
            FOREIGN KEY (pubkey) REFERENCES users(pubkey)
        )",
        (),
    )
    .await?;

    conn.execute(
        "CREATE INDEX idx_heartbeat_notifications_pubkey ON heartbeat_notifications(pubkey)",
        (),
    )
    .await?;

    conn.execute(
        "CREATE INDEX idx_heartbeat_notifications_status ON heartbeat_notifications(status)",
        (),
    )
    .await?;

    conn.execute(
        "CREATE INDEX idx_heartbeat_notifications_sent_at ON heartbeat_notifications(sent_at)",
        (),
    )
    .await?;

    Ok(())
}
