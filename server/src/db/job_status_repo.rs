use anyhow::Result;

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
        tx: &libsql::Transaction,
        pubkey: &str,
        report_type: &ReportType,
        status: &ReportStatus,
        error_message: Option<String>,
    ) -> Result<()> {
        // First, insert the new report
        tx.execute(
            "INSERT INTO job_status_reports (pubkey, report_type, status, error_message) VALUES (?, ?, ?, ?)",
            libsql::params![
                pubkey,
                format!("{:?}", report_type),
                format!("{:?}", status),
                error_message
            ],
        )
        .await?;

        // Keep only the last 20 reports by deleting the oldest ones if the count exceeds 20.
        // This is more efficient than counting first.
        tx.execute(
            "DELETE FROM job_status_reports
             WHERE pubkey = ?
             AND id NOT IN (
                 SELECT id FROM job_status_reports
                 WHERE pubkey = ?
                 ORDER BY created_at DESC, id DESC
                 LIMIT 20
             )",
            libsql::params![pubkey, pubkey],
        )
        .await?;

        Ok(())
    }

    /// [TEST ONLY] Counts the number of job status reports for a given user.
    #[cfg(test)]
    pub async fn count_by_pubkey(conn: &libsql::Connection, pubkey: &str) -> Result<i64> {
        let mut rows = conn
            .query(
                "SELECT COUNT(*) FROM job_status_reports WHERE pubkey = ?",
                libsql::params![pubkey],
            )
            .await?;
        let count = match rows.next().await? {
            Some(row) => row.get(0)?,
            None => 0,
        };
        Ok(count)
    }

    /// [TEST ONLY] Finds all error messages for a given user, ordered by creation date.
    #[cfg(test)]
    pub async fn find_error_messages_by_pubkey_ordered(
        conn: &libsql::Connection,
        pubkey: &str,
    ) -> Result<Vec<String>> {
        let mut rows = conn
            .query(
                "SELECT error_message FROM job_status_reports WHERE pubkey = ? ORDER BY created_at ASC, id ASC",
                libsql::params![pubkey],
            )
            .await?;
        let mut messages = Vec::new();
        while let Some(row) = rows.next().await? {
            messages.push(row.get(0)?);
        }
        Ok(messages)
    }
}
