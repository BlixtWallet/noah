-- Initial schema migrated from libsql to PostgreSQL

CREATE TABLE users (
    pubkey TEXT PRIMARY KEY,
    lightning_address TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE push_tokens (
    pubkey TEXT PRIMARY KEY REFERENCES users(pubkey) ON DELETE CASCADE,
    push_token TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE backup_metadata (
    id BIGSERIAL PRIMARY KEY,
    pubkey TEXT NOT NULL REFERENCES users(pubkey) ON DELETE CASCADE,
    s3_key TEXT NOT NULL,
    backup_size BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    backup_version INTEGER NOT NULL DEFAULT 1,
    UNIQUE (pubkey, backup_version)
);

CREATE INDEX idx_backup_metadata_pubkey ON backup_metadata(pubkey);
CREATE INDEX idx_backup_metadata_created_at ON backup_metadata(created_at);

CREATE TABLE backup_settings (
    pubkey TEXT PRIMARY KEY REFERENCES users(pubkey) ON DELETE CASCADE,
    backup_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    last_backup_at TIMESTAMPTZ
);

CREATE TABLE offboarding_requests (
    request_id TEXT PRIMARY KEY,
    pubkey TEXT NOT NULL REFERENCES users(pubkey) ON DELETE CASCADE,
    address TEXT NOT NULL,
    address_signature TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_offboarding_requests_pubkey ON offboarding_requests(pubkey);
CREATE INDEX idx_offboarding_requests_status ON offboarding_requests(status);

CREATE TABLE job_status_reports (
    id BIGSERIAL PRIMARY KEY,
    pubkey TEXT NOT NULL REFERENCES users(pubkey) ON DELETE CASCADE,
    report_type TEXT NOT NULL,
    status TEXT NOT NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_status_reports_pubkey ON job_status_reports(pubkey);

CREATE TABLE devices (
    pubkey TEXT PRIMARY KEY REFERENCES users(pubkey) ON DELETE CASCADE,
    device_manufacturer TEXT,
    device_model TEXT,
    os_name TEXT,
    os_version TEXT,
    app_version TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE heartbeat_notifications (
    id BIGSERIAL PRIMARY KEY,
    pubkey TEXT NOT NULL REFERENCES users(pubkey) ON DELETE CASCADE,
    notification_id TEXT NOT NULL UNIQUE,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX idx_heartbeat_notifications_pubkey ON heartbeat_notifications(pubkey);
CREATE INDEX idx_heartbeat_notifications_status ON heartbeat_notifications(status);
CREATE INDEX idx_heartbeat_notifications_sent_at ON heartbeat_notifications(sent_at);

CREATE TABLE notification_tracking (
    pubkey TEXT NOT NULL REFERENCES users(pubkey) ON DELETE CASCADE,
    notification_type TEXT NOT NULL,
    last_sent_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (pubkey, notification_type)
);

CREATE INDEX idx_notification_tracking_pubkey ON notification_tracking(pubkey);
CREATE INDEX idx_notification_tracking_last_sent_at ON notification_tracking(last_sent_at);
