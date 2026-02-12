-- Support lightning address autocomplete (prefix + trigram fuzzy search)

-- Prefix search indexes for username/domain extraction from lightning_address.
CREATE INDEX IF NOT EXISTS idx_users_ln_address_username_prefix
    ON users ((split_part(lower(lightning_address), '@', 1)));

CREATE INDEX IF NOT EXISTS idx_users_ln_address_domain
    ON users ((split_part(lower(lightning_address), '@', 2)));

-- pg_trgm is required for deterministic fuzzy autocomplete behavior.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_users_ln_address_username_trgm
    ON users USING gin ((split_part(lower(lightning_address), '@', 1)) gin_trgm_ops);
