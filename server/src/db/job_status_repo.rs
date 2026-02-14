use anyhow::Result;
use sqlx::{Postgres, Transaction};

use crate::types::{ReportStatus, ReportType};

/// A struct to encapsulate job status report-related database operations.
/// It's an empty struct because its methods operate on transactions
/// passed in from other functions, rather than holding its own connection.
pub struct JobStatusRepository;

impl JobStatusRepository {
    async fn prune_by_pubkey(tx: &mut Transaction<'_, Postgres>, pubkey: &str) -> Result<()> {
        // Keep only the last 30 reports per report type for this user.
        sqlx::query(
            "DELETE FROM job_status_reports
             WHERE id IN (
                 SELECT id FROM (
                     SELECT id,
                            ROW_NUMBER() OVER (
                                PARTITION BY report_type
                                ORDER BY created_at DESC, id DESC
                            ) AS rn
                     FROM job_status_reports
                     WHERE pubkey = $1
                 ) ranked
                 WHERE ranked.rn > 30
             )",
        )
        .bind(pubkey)
        .execute(&mut **tx)
        .await?;

        Ok(())
    }

    /// Inserts a new job status report with a correlation k1 and prunes old rows.
    pub async fn create_with_k1_and_prune(
        tx: &mut Transaction<'_, Postgres>,
        pubkey: &str,
        notification_k1: &str,
        report_type: &ReportType,
        status: &ReportStatus,
        error_message: Option<String>,
    ) -> Result<()> {
        sqlx::query(
            "INSERT INTO job_status_reports (pubkey, notification_k1, report_type, status, error_message)
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(pubkey)
        .bind(notification_k1)
        .bind(format!("{:?}", report_type))
        .bind(format!("{:?}", status))
        .bind(error_message)
        .execute(&mut **tx)
        .await?;

        Self::prune_by_pubkey(tx, pubkey).await?;

        Ok(())
    }

    /// Updates an existing report by `(pubkey, notification_k1)`.
    pub async fn update_by_k1(
        tx: &mut Transaction<'_, Postgres>,
        pubkey: &str,
        notification_k1: &str,
        report_type: &ReportType,
        status: &ReportStatus,
        error_message: Option<String>,
    ) -> Result<bool> {
        let result = sqlx::query(
            "UPDATE job_status_reports
             SET report_type = $1,
                 status = $2,
                 error_message = $3,
                 updated_at = now()
             WHERE pubkey = $4
               AND notification_k1 = $5",
        )
        .bind(format!("{:?}", report_type))
        .bind(format!("{:?}", status))
        .bind(error_message)
        .bind(pubkey)
        .bind(notification_k1)
        .execute(&mut **tx)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Marks stale pending job reports as timeout after the given age threshold.
    pub async fn mark_stale_pending_as_timeout(
        pool: &sqlx::PgPool,
        older_than_minutes: i64,
        timeout_error_message: &str,
    ) -> Result<u64> {
        let result = sqlx::query(
            "UPDATE job_status_reports
             SET status = $1,
                 error_message = COALESCE(error_message, $2),
                 updated_at = now()
             WHERE status = $3
               AND created_at <= now() - ($4::bigint * interval '1 minute')",
        )
        .bind(format!("{:?}", ReportStatus::Timeout))
        .bind(timeout_error_message)
        .bind(format!("{:?}", ReportStatus::Pending))
        .bind(older_than_minutes)
        .execute(pool)
        .await?;

        Ok(result.rows_affected())
    }

    /// [TEST ONLY] Counts the number of job status reports for a given user.
    #[cfg(test)]
    pub async fn count_by_pubkey(pool: &sqlx::PgPool, pubkey: &str) -> Result<i64> {
        let count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM job_status_reports WHERE pubkey = $1",
        )
        .bind(pubkey)
        .fetch_one(pool)
        .await?;
        Ok(count)
    }

    /// [TEST ONLY] Counts reports for a user filtered by report type.
    #[cfg(test)]
    pub async fn count_by_pubkey_and_report_type(
        pool: &sqlx::PgPool,
        pubkey: &str,
        report_type: &ReportType,
    ) -> Result<i64> {
        let count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*)
             FROM job_status_reports
             WHERE pubkey = $1 AND report_type = $2",
        )
        .bind(pubkey)
        .bind(format!("{:?}", report_type))
        .fetch_one(pool)
        .await?;
        Ok(count)
    }

    /// [TEST ONLY] Finds all error messages for a given user, ordered by creation date.
    #[cfg(test)]
    pub async fn find_error_messages_by_pubkey_ordered(
        pool: &sqlx::PgPool,
        pubkey: &str,
    ) -> Result<Vec<String>> {
        let messages = sqlx::query_scalar::<_, Option<String>>(
            "SELECT error_message
             FROM job_status_reports
             WHERE pubkey = $1
             ORDER BY created_at ASC, id ASC",
        )
        .bind(pubkey)
        .fetch_all(pool)
        .await?
        .into_iter()
        .flatten()
        .collect();
        Ok(messages)
    }

    /// [TEST ONLY] Inserts a report with an explicit `created_at` timestamp.
    #[cfg(test)]
    pub async fn create_with_k1_and_created_at(
        pool: &sqlx::PgPool,
        pubkey: &str,
        notification_k1: &str,
        report_type: &ReportType,
        status: &ReportStatus,
        error_message: Option<String>,
        created_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<()> {
        sqlx::query(
            "INSERT INTO job_status_reports (
                 pubkey, notification_k1, report_type, status, error_message, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $6)",
        )
        .bind(pubkey)
        .bind(notification_k1)
        .bind(format!("{:?}", report_type))
        .bind(format!("{:?}", status))
        .bind(error_message)
        .bind(created_at)
        .execute(pool)
        .await?;

        Ok(())
    }

    /// [TEST ONLY] Reads status and error by `(pubkey, notification_k1)`.
    #[cfg(test)]
    pub async fn find_status_and_error_by_k1(
        pool: &sqlx::PgPool,
        pubkey: &str,
        notification_k1: &str,
    ) -> Result<Option<(String, Option<String>)>> {
        let row = sqlx::query_as::<_, (String, Option<String>)>(
            "SELECT status, error_message
             FROM job_status_reports
             WHERE pubkey = $1 AND notification_k1 = $2",
        )
        .bind(pubkey)
        .bind(notification_k1)
        .fetch_optional(pool)
        .await?;

        Ok(row)
    }
}
