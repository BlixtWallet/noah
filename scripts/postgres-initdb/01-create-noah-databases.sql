-- Initializes the Noah database inside the shared Postgres container.
-- This script runs only the first time the Postgres volume is initialized.

CREATE DATABASE "noah";
CREATE DATABASE "noah_test";
CREATE DATABASE "cln";
