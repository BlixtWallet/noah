use anyhow::Result;
use chrono::{DateTime, Utc};
use libsql::Connection;

use crate::types::{NotificationData, OffboardingStatus};

/// Repository for tracking when notifications were sent to users.
///
/// This enables notification coordination to prevent overlapping notifications
/// that would cause mobile background job failures.
///
/// # Type Safety
/// All methods accept `&NotificationData` instead of strings, ensuring:
/// - Compile-time validation of notification types
/// - Single source of truth (enum → string via `.notification_type()`)
/// - No typos or invalid notification type strings
pub struct NotificationTrackingRepository<'a> {
    conn: &'a Connection,
}

impl<'a> NotificationTrackingRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    /// Check if enough time has passed since the last notification of any type to this user
    /// Returns true if we can send a notification (respecting minimum spacing)
    pub async fn can_send_notification(
        &self,
        pubkey: &str,
        min_spacing_minutes: i64,
    ) -> Result<bool> {
        let mut rows = self
            .conn
            .query(
                "SELECT MAX(last_sent_at) as last_sent
                 FROM notification_tracking
                 WHERE pubkey = ?",
                libsql::params![pubkey],
            )
            .await?;

        if let Some(row) = rows.next().await? {
            if let Ok(Some(last_sent_str)) = row.get::<Option<String>>(0) {
                let last_sent = DateTime::parse_from_rfc3339(&last_sent_str)?.with_timezone(&Utc);
                let min_time = Utc::now() - chrono::Duration::minutes(min_spacing_minutes);

                // If last notification was sent after min_time, we can't send yet
                return Ok(last_sent < min_time);
            }
        }

        // No previous notifications, can send
        Ok(true)
    }

    /// Get the last time any notification was sent to this user
    pub async fn get_last_notification_time(&self, pubkey: &str) -> Result<Option<DateTime<Utc>>> {
        let mut rows = self
            .conn
            .query(
                "SELECT MAX(last_sent_at) as last_sent
                 FROM notification_tracking
                 WHERE pubkey = ?",
                libsql::params![pubkey],
            )
            .await?;

        if let Some(row) = rows.next().await? {
            if let Ok(Some(last_sent_str)) = row.get::<Option<String>>(0) {
                let last_sent = DateTime::parse_from_rfc3339(&last_sent_str)?.with_timezone(&Utc);
                return Ok(Some(last_sent));
            }
        }

        Ok(None)
    }

    /// Record that a notification was sent to a user.
    ///
    /// # Type Safety
    /// Accepts `&NotificationData` instead of a string, ensuring the notification
    /// type is valid and comes from the canonical enum.
    ///
    /// The notification type string is extracted via `.notification_type()` internally.
    pub async fn record_notification_sent(
        &self,
        pubkey: &str,
        notification_data: &NotificationData,
    ) -> Result<()> {
        let now = Utc::now().to_rfc3339();

        self.conn
            .execute(
                "INSERT INTO notification_tracking (pubkey, notification_type, last_sent_at)
                 VALUES (?, ?, ?)
                 ON CONFLICT(pubkey, notification_type)
                 DO UPDATE SET last_sent_at = ?",
                libsql::params![
                    pubkey,
                    notification_data.notification_type(),
                    now.clone(),
                    now
                ],
            )
            .await?;

        Ok(())
    }

    /// Get all users who are eligible for a notification type based on spacing requirements
    /// Returns list of pubkeys that can receive the notification
    pub async fn get_eligible_users(&self, min_spacing_minutes: i64) -> Result<Vec<String>> {
        let min_time = (Utc::now() - chrono::Duration::minutes(min_spacing_minutes)).to_rfc3339();

        let mut rows = self
            .conn
            .query(
                "SELECT DISTINCT u.pubkey
                 FROM users u
                 LEFT JOIN notification_tracking nt ON u.pubkey = nt.pubkey
                 WHERE nt.pubkey IS NULL
                    OR nt.pubkey NOT IN (
                        SELECT pubkey
                        FROM notification_tracking
                        WHERE last_sent_at > ?
                    )",
                libsql::params![min_time],
            )
            .await?;

        let mut pubkeys = Vec::new();
        while let Some(row) = rows.next().await? {
            if let Ok(pubkey) = row.get::<String>(0) {
                pubkeys.push(pubkey);
            }
        }

        Ok(pubkeys)
    }

    /// Get the last time a specific notification type was sent to a user.
    ///
    /// # Type Safety
    /// Accepts `&NotificationData` to ensure type safety. Only the notification
    /// type is extracted and used for the query.
    pub async fn get_last_notification_time_by_type(
        &self,
        pubkey: &str,
        notification_data: &NotificationData,
    ) -> Result<Option<DateTime<Utc>>> {
        let mut rows = self
            .conn
            .query(
                "SELECT last_sent_at
                 FROM notification_tracking
                 WHERE pubkey = ? AND notification_type = ?",
                libsql::params![pubkey, notification_data.notification_type()],
            )
            .await?;

        if let Some(row) = rows.next().await? {
            if let Ok(last_sent_str) = row.get::<String>(0) {
                let last_sent = DateTime::parse_from_rfc3339(&last_sent_str)?.with_timezone(&Utc);
                return Ok(Some(last_sent));
            }
        }

        Ok(None)
    }

    /// Check if a user is currently in offboarding status (has pending or processing offboarding)
    pub async fn is_user_offboarding(&self, pubkey: &str) -> Result<bool> {
        let mut rows = self
            .conn
            .query(
                "SELECT COUNT(*) as count
                 FROM offboarding_requests
                 WHERE pubkey = ? AND status IN (?, ?)",
                libsql::params![
                    pubkey,
                    OffboardingStatus::Pending.to_string(),
                    OffboardingStatus::Processing.to_string()
                ],
            )
            .await?;

        if let Some(row) = rows.next().await? {
            if let Ok(count) = row.get::<i64>(0) {
                return Ok(count > 0);
            }
        }

        Ok(false)
    }
}
