use anyhow::Result;

// This struct represents a user record from the database.
// It's a good practice to have a model struct for each of your database tables.
#[derive(Debug)]
pub struct User {
    pub pubkey: String,
    pub lightning_address: Option<String>,
}

// A struct to encapsulate user-related database operations
pub struct UserRepository<'a> {
    // We use a lifetime parameter 'a to show that this struct borrows the connection.
    conn: &'a libsql::Connection,
}

impl<'a> UserRepository<'a> {
    /// Creates a new repository instance.
    pub fn new(conn: &'a libsql::Connection) -> Self {
        Self { conn }
    }

    /// Finds a user by their public key.
    pub async fn find_by_pubkey(&self, pubkey: &str) -> Result<Option<User>> {
        let mut rows = self
            .conn
            .query(
                "SELECT pubkey, lightning_address FROM users WHERE pubkey = ?",
                libsql::params![pubkey],
            )
            .await?;

        match rows.next().await? {
            Some(row) => Ok(Some(User {
                pubkey: row.get(0)?,
                lightning_address: row.get(1)?,
            })),
            None => Ok(None),
        }
    }

    /// Finds a user's pubkey by their lightning address.
    pub async fn find_pubkey_by_lightning_address(
        &self,
        ln_address: &str,
    ) -> Result<Option<String>> {
        let mut rows = self
            .conn
            .query(
                "SELECT pubkey FROM users WHERE lightning_address = ?",
                libsql::params![ln_address],
            )
            .await?;

        match rows.next().await? {
            Some(row) => Ok(Some(row.get(0)?)),
            None => Ok(None),
        }
    }

    /// Creates a new user within a transaction. This is a static method because
    // it operates on a transaction, not a connection owned by the repository instance.
    pub async fn create(tx: &libsql::Transaction, pubkey: &str, ln_address: &str) -> Result<()> {
        tx.execute(
            "INSERT INTO users (pubkey, lightning_address) VALUES (?, ?)",
            libsql::params![pubkey, ln_address],
        )
        .await?;
        Ok(())
    }

    /// Checks if a lightning address is already taken.
    pub async fn exists_by_lightning_address(&self, ln_address: &str) -> Result<bool> {
        let mut rows = self
            .conn
            .query(
                "SELECT 1 FROM users WHERE lightning_address = ?",
                libsql::params![ln_address],
            )
            .await?;

        Ok(rows.next().await?.is_some())
    }

    /// Updates a user's lightning address.
    pub async fn update_lightning_address(&self, pubkey: &str, ln_address: &str) -> Result<()> {
        self.conn
            .execute(
                "UPDATE users SET lightning_address = ? WHERE pubkey = ?",
                libsql::params![ln_address, pubkey],
            )
            .await?;
        Ok(())
    }

    /// Checks if a user exists by their public key.
    pub async fn exists_by_pubkey(&self, pubkey: &str) -> Result<bool, libsql::Error> {
        let mut rows = self
            .conn
            .query("SELECT 1 FROM users WHERE pubkey = ?", [pubkey])
            .await?;

        Ok(rows.next().await?.is_some())
    }
}
