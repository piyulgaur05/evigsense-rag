-- Enable extensions required by the app schema.
-- Runs after the base image's migrate.sh (filename sorts after "migrate.sh"),
-- which is what creates the `extensions` schema in the first place — running
-- earlier put these in `public` instead, breaking storage's
-- extensions.uuid_generate_v4() calls.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA extensions;
