use anyhow::Result;
use uuid::Uuid;

pub struct HeartbeatRepository<'a> {
    conn: &'a libsql::Connection,
}

impl<'a> HeartbeatRepository<'a> {
    pub fn new(conn: &'a libsql::Connection) -> Self {
        Self { conn }
    }

    /// Creates a new heartbeat notification record
    pub async fn create_notification(&self, pubkey: &str) -> Result<String> {
        let notification_id = Uuid::new_v4().to_string();

        self.conn
            .execute(
                "INSERT INTO heartbeat_notifications (pubkey, notification_id, status) VALUES (?, ?, 'pending')",
                libsql::params![pubkey, notification_id.clone()],
            )
            .await?;

        Ok(notification_id)
    }

    /// Marks a heartbeat notification as responded
    pub async fn mark_as_responded(&self, notification_id: &str) -> Result<bool> {
        let result = self.conn
            .execute(
                "UPDATE heartbeat_notifications SET responded_at = CURRENT_TIMESTAMP, status = 'responded' WHERE notification_id = ? AND status = 'pending'",
                libsql::params![notification_id],
            )
            .await?;

        Ok(result > 0)
    }

    /// Counts consecutive missed heartbeats for a user (most recent first)
    pub async fn count_consecutive_missed(&self, pubkey: &str) -> Result<i32> {
        let mut rows = self.conn
            .query(
                "SELECT status FROM heartbeat_notifications WHERE pubkey = ? ORDER BY sent_at DESC LIMIT 10",
                libsql::params![pubkey],
            )
            .await?;

        let mut consecutive_missed = 0;
        while let Some(row) = rows.next().await? {
            let status: String = row.get(0)?;
            if status == "pending" {
                consecutive_missed += 1;
            } else {
                break;
            }
        }

        Ok(consecutive_missed)
    }

    /// Gets all users who have push tokens (active users)
    pub async fn get_active_users(&self) -> Result<Vec<String>> {
        let mut rows = self.conn
            .query(
                "SELECT DISTINCT pt.pubkey FROM push_tokens pt INNER JOIN users u ON pt.pubkey = u.pubkey",
                (),
            )
            .await?;

        let mut pubkeys = Vec::new();
        while let Some(row) = rows.next().await? {
            let pubkey: String = row.get(0)?;
            pubkeys.push(pubkey);
        }

        Ok(pubkeys)
    }

    /// Cleans up old heartbeat notifications (keeps only last 15 per user)
    pub async fn cleanup_old_notifications(&self) -> Result<()> {
        self.conn
            .execute(
                "DELETE FROM heartbeat_notifications WHERE id NOT IN (
                    SELECT id FROM (
                        SELECT id, ROW_NUMBER() OVER (PARTITION BY pubkey ORDER BY sent_at DESC) as rn
                        FROM heartbeat_notifications
                    ) ranked WHERE rn <= 15
                )",
                (),
            )
            .await?;

        Ok(())
    }

    /// Gets users who have missed 10 or more consecutive heartbeats
    pub async fn get_users_to_deregister(&self) -> Result<Vec<String>> {
        let mut rows = self
            .conn
            .query(
                "WITH recent_heartbeats AS (
                    SELECT pubkey, status, sent_at,
                           ROW_NUMBER() OVER (PARTITION BY pubkey ORDER BY sent_at DESC) as rn
                    FROM heartbeat_notifications
                ),
                consecutive_missed AS (
                    SELECT pubkey,
                           COUNT(*) as missed_count
                    FROM recent_heartbeats
                    WHERE rn <= 10 AND status = 'pending'
                    GROUP BY pubkey
                    HAVING COUNT(*) = 10
                )
                SELECT pubkey FROM consecutive_missed",
                (),
            )
            .await?;

        let mut pubkeys = Vec::new();
        while let Some(row) = rows.next().await? {
            let pubkey: String = row.get(0)?;
            pubkeys.push(pubkey);
        }

        Ok(pubkeys)
    }
}
