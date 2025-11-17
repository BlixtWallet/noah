use anyhow::Result;
use chrono::{DateTime, Utc};
use sqlx::PgPool;

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
    pool: &'a PgPool,
}

impl<'a> NotificationTrackingRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    /// Check if enough time has passed since the last notification of any type to this user
    /// Returns true if we can send a notification (respecting minimum spacing)
    pub async fn can_send_notification(
        &self,
        pubkey: &str,
        min_spacing_minutes: i64,
    ) -> Result<bool> {
        let last_sent = sqlx::query_scalar::<_, Option<DateTime<Utc>>>(
            "SELECT MAX(last_sent_at) as last_sent
             FROM notification_tracking
             WHERE pubkey = $1",
        )
        .bind(pubkey)
        .fetch_optional(self.pool)
        .await?
        .flatten();

        if let Some(last_sent) = last_sent {
            let min_time = Utc::now() - chrono::Duration::minutes(min_spacing_minutes);
            return Ok(last_sent < min_time);
        }

        Ok(true)
    }

    /// Get the last time any notification was sent to this user
    pub async fn get_last_notification_time(&self, pubkey: &str) -> Result<Option<DateTime<Utc>>> {
        let last_sent = sqlx::query_scalar::<_, Option<DateTime<Utc>>>(
            "SELECT MAX(last_sent_at) as last_sent
             FROM notification_tracking
             WHERE pubkey = $1",
        )
        .bind(pubkey)
        .fetch_optional(self.pool)
        .await?
        .flatten();

        Ok(last_sent)
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
        sqlx::query(
            "INSERT INTO notification_tracking (pubkey, notification_type, last_sent_at)
             VALUES ($1, $2, now())
             ON CONFLICT(pubkey, notification_type)
             DO UPDATE SET last_sent_at = excluded.last_sent_at",
        )
        .bind(pubkey)
        .bind(notification_data.notification_type())
        .execute(self.pool)
        .await?;

        Ok(())
    }

    /// Get all users who are eligible for a notification type based on spacing requirements
    /// Returns list of pubkeys that can receive the notification
    pub async fn get_eligible_users(&self, min_spacing_minutes: i64) -> Result<Vec<String>> {
        let min_time = Utc::now() - chrono::Duration::minutes(min_spacing_minutes);

        let pubkeys = sqlx::query_scalar::<_, String>(
            "SELECT u.pubkey
             FROM users u
             WHERE NOT EXISTS (
                 SELECT 1
                 FROM notification_tracking nt
                 WHERE nt.pubkey = u.pubkey AND nt.last_sent_at > $1
             )",
        )
        .bind(min_time)
        .fetch_all(self.pool)
        .await?;

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
        let last_sent = sqlx::query_scalar::<_, Option<DateTime<Utc>>>(
            "SELECT last_sent_at
             FROM notification_tracking
             WHERE pubkey = $1 AND notification_type = $2",
        )
        .bind(pubkey)
        .bind(notification_data.notification_type())
        .fetch_optional(self.pool)
        .await?
        .flatten();

        Ok(last_sent)
    }

    /// Check if a user is currently in offboarding status (has pending or processing offboarding)
    pub async fn is_user_offboarding(&self, pubkey: &str) -> Result<bool> {
        let count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) as count
             FROM offboarding_requests
             WHERE pubkey = $1 AND status IN ($2, $3)",
        )
        .bind(pubkey)
        .bind(OffboardingStatus::Pending.to_string())
        .bind(OffboardingStatus::Processing.to_string())
        .fetch_one(self.pool)
        .await?;

        Ok(count > 0)
    }
}
