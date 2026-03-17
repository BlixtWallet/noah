CREATE TABLE mailbox_authorizations (
    pubkey TEXT PRIMARY KEY REFERENCES users(pubkey) ON DELETE CASCADE,
    mailbox_id TEXT NOT NULL,
    authorization_hex TEXT,
    authorization_expires_at BIGINT,
    last_checkpoint BIGINT NOT NULL DEFAULT 0 CHECK (last_checkpoint >= 0),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        enabled = FALSE
        OR (
            authorization_hex IS NOT NULL
            AND authorization_expires_at IS NOT NULL
        )
    )
);

CREATE INDEX idx_mailbox_authorizations_enabled
    ON mailbox_authorizations(enabled)
    WHERE enabled = TRUE;
