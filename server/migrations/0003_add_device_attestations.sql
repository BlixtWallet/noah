-- Device attestations for iOS App Attestation and Android Play Integrity

CREATE TABLE device_attestations (
    id BIGSERIAL PRIMARY KEY,
    pubkey TEXT NOT NULL REFERENCES users(pubkey) ON DELETE CASCADE,
    platform TEXT NOT NULL, -- 'ios' or 'android'
    key_id TEXT NOT NULL,
    public_key TEXT, -- Base64-encoded public key bytes
    receipt BYTEA, -- iOS attestation receipt for future fraud checks
    environment TEXT NOT NULL, -- 'production' or 'development'
    attestation_passed BOOLEAN NOT NULL DEFAULT FALSE,
    failure_reason TEXT, -- If attestation_passed is false, why
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (pubkey, platform)
);

CREATE INDEX idx_device_attestations_pubkey ON device_attestations(pubkey);
CREATE INDEX idx_device_attestations_platform ON device_attestations(platform);
CREATE INDEX idx_device_attestations_attestation_passed ON device_attestations(attestation_passed);
