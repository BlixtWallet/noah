use anyhow::Result;

/// A struct to encapsulate offboarding-related database operations.
pub struct OffboardingRepository<'a> {
    conn: &'a libsql::Connection,
}

impl<'a> OffboardingRepository<'a> {
    /// Creates a new repository instance.
    pub fn new(conn: &'a libsql::Connection) -> Self {
        Self { conn }
    }

    /// Creates a new offboarding request.
    pub async fn create_request(&self, request_id: &str, pubkey: &str) -> Result<()> {
        self.conn
            .execute(
                "INSERT INTO offboarding_requests (request_id, pubkey) VALUES (?, ?)",
                libsql::params![request_id, pubkey],
            )
            .await?;
        Ok(())
    }

    /// Deletes all offboarding requests for a given user within a transaction.
    /// This is a static method because it operates on a transaction, not a connection
    /// owned by the repository instance.
    pub async fn delete_by_pubkey(tx: &libsql::Transaction, pubkey: &str) -> Result<()> {
        tx.execute(
            "DELETE FROM offboarding_requests WHERE pubkey = ?",
            libsql::params![pubkey],
        )
        .await?;
        Ok(())
    }
}
