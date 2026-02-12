-- Support lightning address autocomplete (prefix + trigram fuzzy search)
--
-- Store normalized username/domain once to avoid repeatedly computing split/lower
-- during each autocomplete query.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS lightning_address_username TEXT
        GENERATED ALWAYS AS (split_part(lower(lightning_address), '@', 1)) STORED,
    ADD COLUMN IF NOT EXISTS lightning_address_domain TEXT
        GENERATED ALWAYS AS (split_part(lower(lightning_address), '@', 2)) STORED;

-- Prefix/domain indexes for fast filtering and ordering.
CREATE INDEX IF NOT EXISTS idx_users_ln_address_domain
    ON users (lightning_address_domain)
    WHERE lightning_address_domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_ln_address_domain_username_prefix
    ON users (lightning_address_domain, lightning_address_username text_pattern_ops)
    WHERE lightning_address_domain IS NOT NULL
      AND lightning_address_username IS NOT NULL;

-- pg_trgm is required for deterministic fuzzy autocomplete behavior.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_users_ln_address_username_trgm
    ON users USING gin (lightning_address_username gin_trgm_ops)
    WHERE lightning_address_username IS NOT NULL;
