use anyhow::Result;

/// A struct to encapsulate push token-related database operations.
pub struct PushTokenRepository<'a> {
    conn: &'a libsql::Connection,
}

impl<'a> PushTokenRepository<'a> {
    /// Creates a new repository instance.
    pub fn new(conn: &'a libsql::Connection) -> Self {
        Self { conn }
    }

    /// Inserts a new push token record, or updates the token if the pubkey already exists.
    pub async fn upsert(&self, pubkey: &str, push_token: &str) -> Result<()> {
        self.conn
            .execute(
                "INSERT INTO push_tokens (pubkey, push_token) VALUES (?, ?)
                 ON CONFLICT(pubkey) DO UPDATE SET push_token = excluded.push_token",
                libsql::params![pubkey, push_token],
            )
            .await?;
        Ok(())
    }
    /// Deletes all push tokens for a given user within a transaction.
    pub async fn delete_by_pubkey(tx: &libsql::Transaction, pubkey: &str) -> Result<()> {
        tx.execute(
            "DELETE FROM push_tokens WHERE pubkey = ?",
            libsql::params![pubkey],
        )
        .await?;
        Ok(())
    }
}
