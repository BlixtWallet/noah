use anyhow::Result;
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
    conn: &'a libsql::Connection,
}

impl<'a> OffboardingRepository<'a> {
    /// Creates a new repository instance.
    pub fn new(conn: &'a libsql::Connection) -> Self {
        Self { conn }
    }

    /// Creates a new offboarding request.
    pub async fn create_request(
        &self,
        request_id: &str,
        pubkey: &str,
        address: &str,
        address_signature: &str,
    ) -> Result<()> {
        self.conn
            .execute(
                "INSERT INTO offboarding_requests (request_id, pubkey, address, address_signature) VALUES (?, ?, ?, ?)",
                libsql::params![request_id, pubkey, address, address_signature],
            )
            .await?;
        Ok(())
    }

    /// Finds an offboarding request by the user's public key.
    /// Note: A user could theoretically have multiple, so this just finds the first one.
    #[cfg(test)]
    pub async fn find_by_pubkey(&self, pubkey: &str) -> Result<Option<OffboardingRequest>> {
        let mut rows = self
            .conn
            .query(
                "SELECT request_id, pubkey, status, address, address_signature FROM offboarding_requests WHERE pubkey = ?",
                libsql::params![pubkey],
            )
            .await?;

        match rows.next().await? {
            Some(row) => {
                let status_str: String = row.get(2)?;
                Ok(Some(OffboardingRequest {
                    request_id: row.get(0)?,
                    pubkey: row.get(1)?,
                    status: OffboardingStatus::from_str(&status_str)?,
                    address: row.get(3)?,
                    address_signature: row.get(4)?,
                }))
            }
            None => Ok(None),
        }
    }

    /// Finds all offboarding requests with a 'pending' status.
    pub async fn find_all_pending(&self) -> Result<Vec<OffboardingRequest>> {
        let mut rows = self
            .conn
            .query(
                "SELECT request_id, pubkey, status, address, address_signature FROM offboarding_requests WHERE status = ?",
                libsql::params![OffboardingStatus::Pending.to_string()],
            )
            .await?;

        let mut requests = Vec::new();
        while let Some(row) = rows.next().await? {
            let status_str: String = row.get(2)?;
            requests.push(OffboardingRequest {
                request_id: row.get(0)?,
                pubkey: row.get(1)?,
                status: OffboardingStatus::from_str(&status_str)?,
                address: row.get(3)?,
                address_signature: row.get(4)?,
            });
        }
        Ok(requests)
    }

    /// Updates the status of an offboarding request.
    pub async fn update_status(&self, request_id: &str, status: OffboardingStatus) -> Result<()> {
        self.conn
            .execute(
                "UPDATE offboarding_requests SET status = ? WHERE request_id = ?",
                libsql::params![status.to_string(), request_id],
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
