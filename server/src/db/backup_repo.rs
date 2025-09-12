use anyhow::Result;

use crate::types::BackupInfo;

/// Represents a record from the `backup_metadata` table.
#[derive(Debug)]
pub struct BackupMetadata {
    pub pubkey: String,
    pub s3_key: String,
    pub backup_size: u64,
    pub backup_version: i32,
}

/// A struct to encapsulate backup-related database operations.
pub struct BackupRepository<'a> {
    conn: &'a libsql::Connection,
}

impl<'a> BackupRepository<'a> {
    /// Creates a new repository instance.
    pub fn new(conn: &'a libsql::Connection) -> Self {
        Self { conn }
    }

    /// Inserts or updates backup metadata.
    pub async fn upsert_metadata(
        &self,
        pubkey: &str,
        s3_key: &str,
        backup_size: u64,
        backup_version: i32,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT INTO backup_metadata (pubkey, s3_key, backup_size, backup_version) VALUES (?, ?, ?, ?)
             ON CONFLICT(pubkey, backup_version) DO UPDATE SET s3_key = excluded.s3_key, backup_size = excluded.backup_size, created_at = CURRENT_TIMESTAMP",
            libsql::params![pubkey, s3_key, backup_size, backup_version],
        )
        .await?;
        Ok(())
    }

    /// [TEST ONLY] Inserts or updates backup metadata with a specific creation timestamp.
    #[cfg(test)]
    pub async fn upsert_metadata_with_timestamp(
        &self,
        pubkey: &str,
        s3_key: &str,
        backup_size: u64,
        backup_version: i32,
        created_at_iso: &str,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT INTO backup_metadata (pubkey, s3_key, backup_size, backup_version, created_at) VALUES (?, ?, ?, ?, ?)",
            libsql::params![pubkey, s3_key, backup_size, backup_version, created_at_iso],
        )
        .await?;
        Ok(())
    }

    /// Lists all backups for a given user.
    pub async fn list(&self, pubkey: &str) -> Result<Vec<BackupInfo>> {
        let mut rows = self.conn
            .query(
                "SELECT backup_version, created_at, backup_size FROM backup_metadata WHERE pubkey = ?",
                libsql::params![pubkey],
            )
            .await?;

        let mut backups = Vec::new();
        while let Some(row) = rows.next().await? {
            backups.push(BackupInfo {
                backup_version: row.get(0)?,
                created_at: row.get(1)?,
                backup_size: row.get(2)?,
            });
        }
        Ok(backups)
    }

    /// Finds a specific backup by version.
    /// Returns a tuple of (s3_key, backup_size).
    pub async fn find_by_version(
        &self,
        pubkey: &str,
        version: i32,
    ) -> Result<Option<(String, u64)>> {
        let mut row = self.conn.query("SELECT s3_key, backup_size FROM backup_metadata WHERE pubkey = ? AND backup_version = ?", libsql::params![pubkey, version]).await?;
        match row.next().await? {
            Some(row) => Ok(Some((row.get(0)?, row.get(1)?))),
            None => Ok(None),
        }
    }

    /// Finds the latest backup for a user.
    /// Returns a tuple of (s3_key, backup_size).
    pub async fn find_latest(&self, pubkey: &str) -> Result<Option<(String, u64)>> {
        let mut row = self.conn.query("SELECT s3_key, backup_size FROM backup_metadata WHERE pubkey = ? ORDER BY created_at DESC LIMIT 1", libsql::params![pubkey]).await?;
        match row.next().await? {
            Some(row) => Ok(Some((row.get(0)?, row.get(1)?))),
            None => Ok(None),
        }
    }

    /// Finds the S3 key for a specific backup version.
    pub async fn find_s3_key_by_version(
        &self,
        pubkey: &str,
        version: i32,
    ) -> Result<Option<String>> {
        let mut row = self
            .conn
            .query(
                "SELECT s3_key FROM backup_metadata WHERE pubkey = ? AND backup_version = ?",
                libsql::params![pubkey, version],
            )
            .await?;
        match row.next().await? {
            Some(row) => Ok(Some(row.get(0)?)),
            None => Ok(None),
        }
    }

    /// Finds the full metadata for a specific backup version.
    #[cfg(test)]
    pub async fn find_by_pubkey_and_version(
        &self,
        pubkey: &str,
        version: i32,
    ) -> Result<Option<BackupMetadata>> {
        let mut rows = self.conn.query(
            "SELECT pubkey, s3_key, backup_size, backup_version FROM backup_metadata WHERE pubkey = ? AND backup_version = ?",
            libsql::params![pubkey, version],
        ).await?;

        match rows.next().await? {
            Some(row) => Ok(Some(BackupMetadata {
                pubkey: row.get(0)?,
                s3_key: row.get(1)?,
                backup_size: row.get(2)?,
                backup_version: row.get(3)?,
            })),
            None => Ok(None),
        }
    }

    /// Deletes a backup record by its version.
    pub async fn delete_by_version(&self, pubkey: &str, version: i32) -> Result<()> {
        self.conn
            .execute(
                "DELETE FROM backup_metadata WHERE pubkey = ? AND backup_version = ?",
                libsql::params![pubkey, version],
            )
            .await?;
        Ok(())
    }

    /// Inserts or updates backup settings for a user.
    pub async fn upsert_settings(&self, pubkey: &str, enabled: bool) -> Result<()> {
        self.conn
            .execute(
                "INSERT INTO backup_settings (pubkey, backup_enabled) VALUES (?, ?)
                 ON CONFLICT(pubkey) DO UPDATE SET backup_enabled = excluded.backup_enabled",
                libsql::params![pubkey, enabled],
            )
            .await?;
        Ok(())
    }

    /// Gets the backup settings for a user.
    #[cfg(test)]
    pub async fn get_settings(&self, pubkey: &str) -> Result<Option<bool>> {
        let mut rows = self
            .conn
            .query(
                "SELECT backup_enabled FROM backup_settings WHERE pubkey = ?",
                libsql::params![pubkey],
            )
            .await?;

        match rows.next().await? {
            Some(row) => Ok(Some(row.get(0)?)),
            None => Ok(None),
        }
    }
}
