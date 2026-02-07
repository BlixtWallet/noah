-- Allow multiple users to share the same email address.
--
-- Pubkey is the canonical user identity in Noah; email is optional metadata
-- used for verification and (future) notifications.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
DROP INDEX IF EXISTS idx_users_email_unique;

