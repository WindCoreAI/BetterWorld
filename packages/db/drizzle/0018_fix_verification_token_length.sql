-- Fix: verification_tokens.token column was varchar(10) but stores SHA256 hex hashes (64 chars)
-- This caused registration to fail with "value too long for type character varying(10)"
ALTER TABLE "verification_tokens" ALTER COLUMN "token" TYPE varchar(64);
