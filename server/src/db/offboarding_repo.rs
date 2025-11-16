use anyhow::Result;
use sqlx::{PgPool, Postgres, Row, Transaction};
use std::str::FromStr;

use crate::types::OffboardingStatus;

#[derive(Debug)]
pub struct OffboardingRequest {
    pub request_id: String,
    pub pubkey: String,
    pub status: OffboardingStatus,
    pub address: String,
    pub address_signature: String,
}

/// A struct to encapsulate offboarding-related database operations.
pub struct OffboardingRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> OffboardingRepository<'a> {
    /// Creates a new repository instance.
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    /// Creates a new offboarding request.
    pub async fn create_request(
        &self,
        request_id: &str,
        pubkey: &str,
        address: &str,
        address_signature: &str,
    ) -> Result<()> {
        sqlx::query(
            "INSERT INTO offboarding_requests (request_id, pubkey, address, address_signature)
             VALUES ($1, $2, $3, $4)",
        )
        .bind(request_id)
        .bind(pubkey)
        .bind(address)
        .bind(address_signature)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    /// Finds an offboarding request by the user's public key.
    /// Note: A user could theoretically have multiple, so this just finds the first one.
    #[cfg(test)]
    pub async fn find_by_pubkey(&self, pubkey: &str) -> Result<Option<OffboardingRequest>> {
        let row = sqlx::query(
            "SELECT request_id, pubkey, status, address, address_signature
             FROM offboarding_requests
             WHERE pubkey = $1
             LIMIT 1",
        )
        .bind(pubkey)
        .fetch_optional(self.pool)
        .await?;

        if let Some(row) = row {
            let status_str: String = row.try_get("status")?;
            Ok(Some(OffboardingRequest {
                request_id: row.try_get("request_id")?,
                pubkey: row.try_get("pubkey")?,
                status: OffboardingStatus::from_str(&status_str)?,
                address: row.try_get("address")?,
                address_signature: row.try_get("address_signature")?,
            }))
        } else {
            Ok(None)
        }
    }

    /// Finds all offboarding requests with a 'pending' status.
    pub async fn find_all_pending(&self) -> Result<Vec<OffboardingRequest>> {
        let rows = sqlx::query(
            "SELECT request_id, pubkey, status, address, address_signature
             FROM offboarding_requests
             WHERE status = $1",
        )
        .bind(OffboardingStatus::Pending.to_string())
        .fetch_all(self.pool)
        .await?;

        let mut requests = Vec::new();
        for row in rows {
            let status_str: String = row.try_get("status")?;
            requests.push(OffboardingRequest {
                request_id: row.try_get("request_id")?,
                pubkey: row.try_get("pubkey")?,
                status: OffboardingStatus::from_str(&status_str)?,
                address: row.try_get("address")?,
                address_signature: row.try_get("address_signature")?,
            });
        }
        Ok(requests)
    }

    /// Updates the status of an offboarding request.
    pub async fn update_status(&self, request_id: &str, status: OffboardingStatus) -> Result<()> {
        sqlx::query(
            "UPDATE offboarding_requests
             SET status = $1, updated_at = now()
             WHERE request_id = $2",
        )
        .bind(status.to_string())
        .bind(request_id)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    /// Deletes all offboarding requests for a given user within a transaction.
    /// This is a static method because it operates on a transaction, not a connection
    /// owned by the repository instance.
    pub async fn delete_by_pubkey(
        tx: &mut Transaction<'_, Postgres>,
        pubkey: &str,
    ) -> Result<()> {
        sqlx::query("DELETE FROM offboarding_requests WHERE pubkey = $1")
            .bind(pubkey)
            .execute(&mut **tx)
            .await?;
        Ok(())
    }
}
