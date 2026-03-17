use anyhow::Result;
use sqlx::{FromRow, PgPool, Postgres, Transaction};

#[derive(Debug, Clone, PartialEq, Eq, FromRow)]
pub struct ActiveMailboxAuthorization {
    pub pubkey: String,
    pub mailbox_id: String,
    pub authorization_hex: String,
    pub authorization_expires_at: i64,
    pub last_checkpoint: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, FromRow)]
pub struct RevokedMailboxAuthorization {
    pub pubkey: String,
    pub mailbox_id: String,
    pub last_checkpoint: i64,
}

pub struct MailboxAuthorizationRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> MailboxAuthorizationRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn upsert(
        &self,
        pubkey: &str,
        mailbox_id: &str,
        authorization_hex: &str,
        authorization_expires_at: i64,
    ) -> Result<()> {
        sqlx::query(
            "INSERT INTO mailbox_authorizations (
                pubkey,
                mailbox_id,
                authorization_hex,
                authorization_expires_at,
                enabled
            )
            VALUES ($1, $2, $3, $4, TRUE)
            ON CONFLICT (pubkey) DO UPDATE SET
                mailbox_id = excluded.mailbox_id,
                authorization_hex = excluded.authorization_hex,
                authorization_expires_at = excluded.authorization_expires_at,
                enabled = TRUE,
                updated_at = now()",
        )
        .bind(pubkey)
        .bind(mailbox_id)
        .bind(authorization_hex)
        .bind(authorization_expires_at)
        .execute(self.pool)
        .await?;

        Ok(())
    }

    pub async fn find_by_pubkey(&self, pubkey: &str) -> Result<Option<ActiveMailboxAuthorization>> {
        let record = sqlx::query_as::<_, ActiveMailboxAuthorization>(
            "SELECT
                pubkey,
                mailbox_id,
                authorization_hex,
                authorization_expires_at,
                last_checkpoint
             FROM mailbox_authorizations
             WHERE pubkey = $1
               AND enabled = TRUE
               AND authorization_hex IS NOT NULL
               AND authorization_expires_at IS NOT NULL",
        )
        .bind(pubkey)
        .fetch_optional(self.pool)
        .await?;

        Ok(record)
    }

    pub async fn find_all_enabled(&self) -> Result<Vec<ActiveMailboxAuthorization>> {
        let records = sqlx::query_as::<_, ActiveMailboxAuthorization>(
            "SELECT
                pubkey,
                mailbox_id,
                authorization_hex,
                authorization_expires_at,
                last_checkpoint
             FROM mailbox_authorizations
             WHERE enabled = TRUE
               AND authorization_hex IS NOT NULL
               AND authorization_expires_at IS NOT NULL",
        )
        .fetch_all(self.pool)
        .await?;

        Ok(records)
    }

    pub async fn find_revoked_by_pubkey(
        &self,
        pubkey: &str,
    ) -> Result<Option<RevokedMailboxAuthorization>> {
        let record = sqlx::query_as::<_, RevokedMailboxAuthorization>(
            "SELECT
                pubkey,
                mailbox_id,
                last_checkpoint
             FROM mailbox_authorizations
             WHERE pubkey = $1
               AND enabled = FALSE",
        )
        .bind(pubkey)
        .fetch_optional(self.pool)
        .await?;

        Ok(record)
    }

    pub async fn update_checkpoint(&self, pubkey: &str, checkpoint: i64) -> Result<()> {
        sqlx::query(
            "UPDATE mailbox_authorizations
             SET last_checkpoint = $2, updated_at = now()
             WHERE pubkey = $1",
        )
        .bind(pubkey)
        .bind(checkpoint)
        .execute(self.pool)
        .await?;

        Ok(())
    }

    pub async fn revoke(&self, pubkey: &str) -> Result<()> {
        sqlx::query(
            "UPDATE mailbox_authorizations
             SET enabled = FALSE,
                 authorization_hex = NULL,
                 authorization_expires_at = NULL,
                 updated_at = now()
             WHERE pubkey = $1",
        )
        .bind(pubkey)
        .execute(self.pool)
        .await?;

        Ok(())
    }

    pub async fn delete_by_pubkey(tx: &mut Transaction<'_, Postgres>, pubkey: &str) -> Result<()> {
        sqlx::query("DELETE FROM mailbox_authorizations WHERE pubkey = $1")
            .bind(pubkey)
            .execute(&mut **tx)
            .await?;

        Ok(())
    }
}
