use anyhow::Result;
use sqlx::{PgPool, Postgres, Transaction};

#[derive(Debug, Clone)]
pub struct LightningAddressTakenError;

impl std::fmt::Display for LightningAddressTakenError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "Lightning address already taken")
    }
}

impl std::error::Error for LightningAddressTakenError {}

#[derive(Debug, Clone)]
pub struct DuplicateArkAddressError;

impl std::fmt::Display for DuplicateArkAddressError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "Invalid Ark address, duplicate exists in our database")
    }
}

impl std::error::Error for DuplicateArkAddressError {}

#[derive(Debug, Clone)]
pub struct DuplicateEmailError;

impl std::fmt::Display for DuplicateEmailError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "Email address already in use")
    }
}

impl std::error::Error for DuplicateEmailError {}

// This struct represents a user record from the database.
// It's a good practice to have a model struct for each of your database tables.
#[derive(Debug, sqlx::FromRow)]
pub struct User {
    pub pubkey: String,
    pub lightning_address: Option<String>,
    pub ark_address: Option<String>,
    pub email: Option<String>,
    pub is_email_verified: bool,
}

// A struct to encapsulate user-related database operations
pub struct UserRepository<'a> {
    // We use a lifetime parameter 'a to show that this struct borrows the pool.
    pool: &'a PgPool,
}

impl<'a> UserRepository<'a> {
    /// Creates a new repository instance.
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    /// Finds a user by their public key.
    pub async fn find_by_pubkey(&self, pubkey: &str) -> Result<Option<User>> {
        let user = sqlx::query_as::<_, User>(
            "SELECT pubkey, lightning_address, ark_address, email, is_email_verified FROM users WHERE pubkey = $1",
        )
        .bind(pubkey)
        .fetch_optional(self.pool)
        .await?;

        Ok(user)
    }

    /// Finds a user's pubkey by their lightning address.
    pub async fn find_pubkey_by_lightning_address(
        &self,
        ln_address: &str,
    ) -> Result<Option<String>> {
        let pubkey = sqlx::query_scalar::<_, String>(
            "SELECT pubkey FROM users WHERE lightning_address = $1",
        )
        .bind(ln_address)
        .fetch_optional(self.pool)
        .await?;

        Ok(pubkey)
    }

    /// Finds a user by their lightning address.
    pub async fn find_by_lightning_address(&self, ln_address: &str) -> Result<Option<User>> {
        let user = sqlx::query_as::<_, User>(
            "SELECT pubkey, lightning_address, ark_address, email, is_email_verified FROM users WHERE lightning_address = $1",
        )
        .bind(ln_address)
        .fetch_optional(self.pool)
        .await?;

        Ok(user)
    }

    /// Creates a new user within a transaction. This is a static method because
    // it operates on a transaction, not a connection owned by the repository instance.
    pub async fn create(
        tx: &mut Transaction<'_, Postgres>,
        pubkey: &str,
        ln_address: &str,
        ark_address: Option<&str>,
    ) -> Result<()> {
        match sqlx::query(
            "INSERT INTO users (pubkey, lightning_address, ark_address) VALUES ($1, $2, $3)",
        )
        .bind(pubkey)
        .bind(ln_address)
        .bind(ark_address)
        .execute(&mut **tx)
        .await
        {
            Ok(_) => Ok(()),
            Err(e) => {
                if is_lightning_address_conflict(&e) {
                    return Err(LightningAddressTakenError.into());
                }
                if is_ark_address_conflict(&e) {
                    return Err(DuplicateArkAddressError.into());
                }
                Err(e.into())
            }
        }
    }

    /// Updates a user's lightning address.
    pub async fn update_lightning_address(&self, pubkey: &str, ln_address: &str) -> Result<()> {
        match sqlx::query(
            "UPDATE users SET lightning_address = $1, updated_at = now() WHERE pubkey = $2",
        )
        .bind(ln_address)
        .bind(pubkey)
        .execute(self.pool)
        .await
        {
            Ok(_) => Ok(()),
            Err(e) => {
                if is_lightning_address_conflict(&e) {
                    return Err(LightningAddressTakenError.into());
                }
                Err(e.into())
            }
        }
    }

    /// Updates a user's ark address.
    pub async fn update_ark_address(&self, pubkey: &str, ark_address: &str) -> Result<()> {
        match sqlx::query("UPDATE users SET ark_address = $1, updated_at = now() WHERE pubkey = $2")
            .bind(ark_address)
            .bind(pubkey)
            .execute(self.pool)
            .await
        {
            Ok(_) => Ok(()),
            Err(e) => {
                if is_ark_address_conflict(&e) {
                    return Err(DuplicateArkAddressError.into());
                }
                Err(e.into())
            }
        }
    }

    /// Checks if a user exists by their public key.
    pub async fn exists_by_pubkey(&self, pubkey: &str) -> Result<bool, sqlx::Error> {
        let exists =
            sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM users WHERE pubkey = $1)")
                .bind(pubkey)
                .fetch_one(self.pool)
                .await?;

        Ok(exists)
    }

    /// Updates a user's email address. Empty strings are converted to NULL.
    pub async fn update_email(&self, pubkey: &str, email: &str) -> Result<()> {
        // Treat empty strings as NULL to avoid unique constraint issues
        let email_value: Option<&str> = if email.is_empty() { None } else { Some(email) };

        match sqlx::query("UPDATE users SET email = $1, updated_at = now() WHERE pubkey = $2")
            .bind(email_value)
            .bind(pubkey)
            .execute(self.pool)
            .await
        {
            Ok(_) => Ok(()),
            Err(e) => {
                if is_email_conflict(&e) {
                    return Err(DuplicateEmailError.into());
                }
                Err(e.into())
            }
        }
    }

    /// Marks a user's email as verified.
    pub async fn set_email_verified(&self, pubkey: &str) -> Result<()> {
        sqlx::query(
            "UPDATE users SET is_email_verified = true, updated_at = now() WHERE pubkey = $1",
        )
        .bind(pubkey)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    /// Checks if a user's email is verified.
    pub async fn is_email_verified(&self, pubkey: &str) -> Result<bool> {
        let verified =
            sqlx::query_scalar::<_, bool>("SELECT is_email_verified FROM users WHERE pubkey = $1")
                .bind(pubkey)
                .fetch_optional(self.pool)
                .await?;
        Ok(verified.unwrap_or(false))
    }

    /// Checks if an email address is already in use by another user.
    /// Returns false for empty emails since those are stored as NULL.
    pub async fn email_exists(&self, email: &str, exclude_pubkey: &str) -> Result<bool> {
        // Empty emails are stored as NULL, so they can't conflict
        if email.is_empty() {
            return Ok(false);
        }

        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM users WHERE email = $1 AND pubkey != $2 AND email IS NOT NULL AND email != '')",
        )
        .bind(email)
        .bind(exclude_pubkey)
        .fetch_one(self.pool)
        .await?;
        Ok(exists)
    }
}

fn is_lightning_address_conflict(error: &sqlx::Error) -> bool {
    if let sqlx::Error::Database(db_err) = error {
        return db_err.code().as_deref() == Some("23505")
            && db_err.constraint() == Some("users_lightning_address_key");
    }

    false
}

fn is_ark_address_conflict(error: &sqlx::Error) -> bool {
    if let sqlx::Error::Database(db_err) = error {
        return db_err.code().as_deref() == Some("23505")
            && db_err.constraint() == Some("users_ark_address_key");
    }

    false
}

fn is_email_conflict(error: &sqlx::Error) -> bool {
    if let sqlx::Error::Database(db_err) = error {
        if db_err.code().as_deref() == Some("23505") {
            // Check for both possible constraint names
            let constraint = db_err.constraint();
            return constraint == Some("users_email_key")
                || constraint == Some("idx_users_email_unique");
        }
    }

    false
}
