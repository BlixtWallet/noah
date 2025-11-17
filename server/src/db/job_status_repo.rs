use anyhow::Result;
use sqlx::{Postgres, Transaction};

use crate::types::{ReportStatus, ReportType};

/// A struct to encapsulate job status report-related database operations.
/// It's an empty struct because its methods operate on transactions
/// passed in from other functions, rather than holding its own connection.
pub struct JobStatusRepository;

impl JobStatusRepository {
    /// Inserts a new job status report and then prunes the table to keep only the
    /// last 20 reports for the given user. This is done within a single transaction
    /// to ensure atomicity.
    pub async fn create_and_prune(
        tx: &mut Transaction<'_, Postgres>,
        pubkey: &str,
        report_type: &ReportType,
        status: &ReportStatus,
        error_message: Option<String>,
    ) -> Result<()> {
        // First, insert the new report
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

        // Keep only the last 20 reports by deleting the oldest ones if the count exceeds 20.
        // This is more efficient than counting first.
        sqlx::query(
            "DELETE FROM job_status_reports
             WHERE pubkey = $1
             AND id NOT IN (
                 SELECT id FROM job_status_reports
                 WHERE pubkey = $1
                 ORDER BY created_at DESC, id DESC
                 LIMIT 20
             )",
        )
        .bind(pubkey)
        .execute(&mut **tx)
        .await?;

        Ok(())
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
