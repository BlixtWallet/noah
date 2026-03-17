ALTER TABLE mailbox_authorizations
ADD COLUMN auth_version BIGINT NOT NULL DEFAULT 1 CHECK (auth_version > 0);

ALTER TABLE mailbox_authorizations
ADD COLUMN lease_owner TEXT;

ALTER TABLE mailbox_authorizations
ADD COLUMN lease_expires_at TIMESTAMPTZ;

CREATE INDEX idx_mailbox_authorizations_leases
    ON mailbox_authorizations(lease_expires_at)
    WHERE enabled = TRUE;
