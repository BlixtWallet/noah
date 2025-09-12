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

    /// Finds a push token by its associated public key.
    pub async fn find_by_pubkey(&self, pubkey: &str) -> Result<Option<String>> {
        let mut rows = self
            .conn
            .query(
                "SELECT push_token FROM push_tokens WHERE pubkey = ?",
                libsql::params![pubkey],
            )
            .await?;

        match rows.next().await? {
            Some(row) => Ok(Some(row.get(0)?)),
            None => Ok(None),
        }
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

    /// Finds all push tokens in the database.
    pub async fn find_all(&self) -> Result<Vec<String>> {
        let mut rows = self
            .conn
            .query("SELECT push_token FROM push_tokens", ())
            .await?;

        let mut tokens = Vec::new();
        while let Some(row) = rows.next().await? {
            tokens.push(row.get(0)?);
        }
        Ok(tokens)
    }
}
