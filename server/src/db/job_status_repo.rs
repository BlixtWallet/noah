use anyhow::Result;
use sqlx::{Postgres, Transaction};

use crate::types::{ReportStatus, ReportType};

/// A struct to encapsulate job status report-related database operations.
/// It's an empty struct because its methods operate on transactions
/// passed in from other functions, rather than holding its own connection.
pub struct JobStatusRepository;

impl JobStatusRepository {
    async fn prune_by_pubkey(tx: &mut Transaction<'_, Postgres>, pubkey: &str) -> Result<()> {
        // Keep only the last 50 reports by deleting the oldest ones if the count exceeds 50.
        // This is more efficient than counting first.
        sqlx::query(
            "DELETE FROM job_status_reports
             WHERE pubkey = $1
             AND id NOT IN (
                 SELECT id FROM job_status_reports
                 WHERE pubkey = $1
                 ORDER BY created_at DESC, id DESC
                 LIMIT 50
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

    /// Backward-compatible insert path for old flows that don't pass a correlation k1.
    pub async fn create_and_prune(
        tx: &mut Transaction<'_, Postgres>,
        pubkey: &str,
        report_type: &ReportType,
        status: &ReportStatus,
        error_message: Option<String>,
    ) -> Result<()> {
        sqlx::query(
            "INSERT INTO job_status_reports (pubkey, report_type, status, error_message)
             VALUES ($1, $2, $3, $4)",
        )
        .bind(pubkey)
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
}
