-- Add last_login_at column to track user activity
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ;

-- Index for querying inactive users
CREATE INDEX idx_users_last_login_at ON users(last_login_at);