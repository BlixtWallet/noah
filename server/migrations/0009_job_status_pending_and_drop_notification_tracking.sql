ALTER TABLE job_status_reports
ADD COLUMN IF NOT EXISTS notification_k1 TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_status_reports_pubkey_notification_k1
ON job_status_reports(pubkey, notification_k1)
WHERE notification_k1 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_status_reports_pubkey_status
ON job_status_reports(pubkey, status);

DROP TABLE IF EXISTS notification_tracking;
