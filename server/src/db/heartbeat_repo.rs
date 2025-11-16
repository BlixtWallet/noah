use anyhow::Result;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::types::HeartbeatStatus;
#[cfg(test)]
use std::str::FromStr;

pub struct HeartbeatRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> HeartbeatRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    /// Creates a new heartbeat notification record
    pub async fn create_notification(&self, pubkey: &str) -> Result<String> {
        let notification_id = Uuid::new_v4().to_string();

        sqlx::query(
            "INSERT INTO heartbeat_notifications (pubkey, notification_id, status)
             VALUES ($1, $2, $3)",
        )
        .bind(pubkey)
        .bind(notification_id.clone())
        .bind(HeartbeatStatus::Pending.to_string())
        .execute(self.pool)
        .await?;

        Ok(notification_id)
    }

    /// Marks a heartbeat notification as responded
    pub async fn mark_as_responded(&self, notification_id: &str) -> Result<bool> {
        let result = sqlx::query(
            "UPDATE heartbeat_notifications
             SET responded_at = now(), status = $1
             WHERE notification_id = $2 AND status = $3",
        )
        .bind(HeartbeatStatus::Responded.to_string())
        .bind(notification_id)
        .bind(HeartbeatStatus::Pending.to_string())
        .execute(self.pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Deletes a heartbeat notification by its ID
    pub async fn delete_notification(&self, notification_id: &str) -> Result<()> {
        sqlx::query("DELETE FROM heartbeat_notifications WHERE notification_id = $1")
            .bind(notification_id)
            .execute(self.pool)
            .await?;
        Ok(())
    }

    /// Deletes all heartbeat notifications for a user by pubkey
    pub async fn delete_by_pubkey_tx(
        tx: &mut Transaction<'_, Postgres>,
        pubkey: &str,
    ) -> Result<()> {
        sqlx::query("DELETE FROM heartbeat_notifications WHERE pubkey = $1")
            .bind(pubkey)
            .execute(&mut *tx)
            .await?;
        Ok(())
    }

    /// Counts consecutive missed heartbeats for a user (most recent first)
    #[cfg(test)]
    pub async fn count_consecutive_missed(&self, pubkey: &str) -> Result<i32> {
        let rows = sqlx::query_scalar::<_, String>(
            "SELECT status
             FROM heartbeat_notifications
             WHERE pubkey = $1
             ORDER BY sent_at DESC
             LIMIT 10",
        )
        .bind(pubkey)
        .fetch_all(self.pool)
        .await?;

        let mut consecutive_missed = 0;
        for status_str in rows {
            let status = HeartbeatStatus::from_str(&status_str)?;
            if status == HeartbeatStatus::Pending {
                consecutive_missed += 1;
            } else {
                break;
            }
        }

        Ok(consecutive_missed)
    }

    /// Gets all users who have push tokens (active users)
    pub async fn get_active_users(&self) -> Result<Vec<String>> {
        let pubkeys = sqlx::query_scalar::<_, String>(
            "SELECT DISTINCT pt.pubkey
             FROM push_tokens pt
             INNER JOIN users u ON pt.pubkey = u.pubkey",
        )
        .fetch_all(self.pool)
        .await?;

        Ok(pubkeys)
    }

    /// Cleans up old heartbeat notifications (keeps only last 15 per user)
    pub async fn cleanup_old_notifications(&self) -> Result<()> {
        sqlx::query(
            "DELETE FROM heartbeat_notifications
             WHERE id NOT IN (
                 SELECT id FROM (
                     SELECT id,
                            ROW_NUMBER() OVER (PARTITION BY pubkey ORDER BY sent_at DESC) as rn
                     FROM heartbeat_notifications
                 ) ranked WHERE rn <= 15
             )",
        )
        .execute(self.pool)
        .await?;

        Ok(())
    }

    /// Gets users who have missed 10 or more consecutive heartbeats
    pub async fn get_users_to_deregister(&self) -> Result<Vec<String>> {
        let pubkeys = sqlx::query_scalar::<_, String>(
            "WITH recent_heartbeats AS (
                SELECT pubkey, status, sent_at,
                       ROW_NUMBER() OVER (PARTITION BY pubkey ORDER BY sent_at DESC) as rn
                FROM heartbeat_notifications
            ),
            consecutive_missed AS (
                SELECT pubkey,
                       COUNT(*) as missed_count
                FROM recent_heartbeats
                WHERE rn <= 10 AND status = $1
                GROUP BY pubkey
                HAVING COUNT(*) >= 10
            )
            SELECT pubkey FROM consecutive_missed",
        )
        .bind(HeartbeatStatus::Pending.to_string())
        .fetch_all(self.pool)
        .await?;

        Ok(pubkeys)
    }
}
