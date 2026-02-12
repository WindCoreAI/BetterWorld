-- Sprint 11: Shadow Mode Migration
-- Adds home_regions JSONB column to validator_pool
-- Creates validator_tier_changes table for tier history audit log

-- Add home_regions JSONB column to validator_pool
ALTER TABLE "validator_pool" ADD COLUMN IF NOT EXISTS "home_regions" jsonb NOT NULL DEFAULT '[]';

-- Create validator_tier_changes table
CREATE TABLE IF NOT EXISTS "validator_tier_changes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "validator_id" uuid NOT NULL REFERENCES "validator_pool"("id") ON DELETE RESTRICT,
  "from_tier" "validator_tier" NOT NULL,
  "to_tier" "validator_tier" NOT NULL,
  "f1_score_at_change" decimal(5,4) NOT NULL,
  "total_evaluations_at_change" integer NOT NULL,
  "changed_at" timestamptz NOT NULL DEFAULT now()
);

-- Index for querying tier history by validator
CREATE INDEX IF NOT EXISTS "tier_changes_validator_idx" ON "validator_tier_changes" ("validator_id", "changed_at" DESC);
