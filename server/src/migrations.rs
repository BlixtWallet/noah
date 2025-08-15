use tracing::debug;

/// Migrations are defined as a series of SQL statements.
/// Each string in the array represents a single versioned migration.
/// Add new migrations to the end of this array.
const MIGRATIONS: &[&str] = &[
    // Version 1: Create initial users table and a trigger for updated_at.
    r#"
    CREATE TABLE users (
        pubkey TEXT PRIMARY KEY,
        lightning_address TEXT UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TRIGGER update_users_updated_at
    AFTER UPDATE ON users
    FOR EACH ROW
    BEGIN
        UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE pubkey = OLD.pubkey;
    END;
    "#,
    // To add a new migration, add a new raw string literal here.
    // e.g. r#"ALTER TABLE users ADD COLUMN email TEXT;"#,
    r#"
    CREATE TABLE push_tokens (
        pubkey TEXT PRIMARY KEY,
        push_token TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TRIGGER update_push_tokens_updated_at
    AFTER UPDATE ON push_tokens
    FOR EACH ROW
    BEGIN
        UPDATE push_tokens SET updated_at = CURRENT_TIMESTAMP WHERE pubkey = OLD.pubkey;
    END;
    "#,
];

/// Applies all pending migrations to the database.
///
/// This function maintains a `migration_history` table to track which
/// migrations have been applied. It compares the applied versions with
/// the `MIGRATIONS` array and applies any new ones sequentially.
/// Each migration is run within a transaction to ensure atomicity.
pub async fn migrate(conn: &libsql::Connection) -> anyhow::Result<()> {
    // Ensure the migration history table exists.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS migration_history (version INTEGER PRIMARY KEY, applied_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
        (),
    ).await?;

    // Get the latest migration version that has been applied.
    let latest_version: i32 = {
        let mut rows = conn
            .query("SELECT MAX(version) FROM migration_history", ())
            .await?;
        match rows.next().await? {
            // `MAX(version)` on an empty table returns a row with a NULL value.
            // We handle this by trying to get an i32 and defaulting to 0 if it's NULL or fails.
            Some(row) => row.get::<Option<i32>>(0)?.unwrap_or(0),
            // This case should ideally not happen if the table exists, but as a fallback,
            // we assume no migrations have run.
            None => 0,
        }
    };

    debug!(
        "Current database version: {}. Checking for new migrations...",
        latest_version
    );

    // Sequentially apply all migrations that are newer than the current version.
    for (i, &migration_sql) in MIGRATIONS.iter().enumerate() {
        let version_to_apply = (i + 1) as i32;
        if version_to_apply > latest_version {
            debug!("Applying migration version {}", version_to_apply);
            let tx = conn.transaction().await?;

            tx.execute_batch(migration_sql).await?;
            tx.execute(
                "INSERT INTO migration_history (version) VALUES (?)",
                libsql::params![version_to_apply],
            )
            .await?;

            tx.commit().await?;
            debug!(
                "Successfully applied migration version {}",
                version_to_apply
            );
        }
    }

    debug!("Database migrations are up to date.");
    Ok(())
}
