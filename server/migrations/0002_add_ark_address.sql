-- Add ark_address to users table with unique constraint
ALTER TABLE users ADD COLUMN ark_address TEXT UNIQUE;
