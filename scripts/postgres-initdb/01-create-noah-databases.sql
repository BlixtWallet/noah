-- Initializes the Noah databases inside the shared Postgres container.
-- This script runs only the first time the Postgres volume is initialized.

CREATE DATABASE "noah";
CREATE DATABASE "noah_test";
CREATE DATABASE "cln";

-- Enable extensions required by Noah in each app database.
\connect noah
CREATE EXTENSION IF NOT EXISTS pg_trgm;

\connect noah_test
CREATE EXTENSION IF NOT EXISTS pg_trgm;
