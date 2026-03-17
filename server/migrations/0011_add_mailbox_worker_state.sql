ALTER TABLE mailbox_authorizations
ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'invalid', 'revoked'));

ALTER TABLE mailbox_authorizations
ADD COLUMN failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0);

ALTER TABLE mailbox_authorizations
ADD COLUMN last_error TEXT;

ALTER TABLE mailbox_authorizations
ADD COLUMN last_connected_at TIMESTAMPTZ;

ALTER TABLE mailbox_authorizations
ADD COLUMN next_retry_at TIMESTAMPTZ;

CREATE INDEX idx_mailbox_authorizations_runnable
    ON mailbox_authorizations(status, next_retry_at)
    WHERE enabled = TRUE;
