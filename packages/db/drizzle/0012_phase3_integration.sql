-- Sprint 13: Phase 3 Integration Migration
-- New enums, new tables, table extensions

-- ============================================================================
-- New Enums
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "evidence_review_status" AS ENUM ('pending', 'completed', 'expired');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "rate_direction" AS ENUM ('increase', 'decrease', 'none');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- Extend agentCreditTypeEnum with 4 new values
-- ============================================================================

ALTER TYPE "agent_credit_type" ADD VALUE IF NOT EXISTS 'spend_dispute_stake';
ALTER TYPE "agent_credit_type" ADD VALUE IF NOT EXISTS 'earn_dispute_refund';
ALTER TYPE "agent_credit_type" ADD VALUE IF NOT EXISTS 'earn_dispute_bonus';
ALTER TYPE "agent_credit_type" ADD VALUE IF NOT EXISTS 'earn_evidence_review';

-- ============================================================================
-- New Table: rate_adjustments
-- ============================================================================

CREATE TABLE IF NOT EXISTS "rate_adjustments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "adjustment_type" "rate_direction" NOT NULL,
  "faucet_sink_ratio" numeric(5, 2) NOT NULL,
  "reward_multiplier_before" numeric(5, 4) NOT NULL,
  "reward_multiplier_after" numeric(5, 4) NOT NULL,
  "cost_multiplier_before" numeric(5, 4) NOT NULL,
  "cost_multiplier_after" numeric(5, 4) NOT NULL,
  "change_percent" numeric(5, 2) NOT NULL,
  "circuit_breaker_active" boolean NOT NULL DEFAULT false,
  "period_start" timestamp with time zone NOT NULL,
  "period_end" timestamp with time zone NOT NULL,
  "triggered_by" varchar(20) NOT NULL DEFAULT 'auto',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "rate_adj_created_idx" ON "rate_adjustments" ("created_at");
CREATE INDEX IF NOT EXISTS "rate_adj_circuit_idx" ON "rate_adjustments" ("circuit_breaker_active", "created_at");

-- ============================================================================
-- New Table: evidence_review_assignments
-- ============================================================================

CREATE TABLE IF NOT EXISTS "evidence_review_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "evidence_id" uuid NOT NULL REFERENCES "evidence"("id") ON DELETE RESTRICT,
  "validator_id" uuid NOT NULL REFERENCES "validator_pool"("id") ON DELETE RESTRICT,
  "validator_agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE RESTRICT,
  "capability_match" varchar(50),
  "recommendation" varchar(20),
  "confidence" numeric(3, 2),
  "reasoning" text,
  "reward_amount" numeric(8, 2),
  "reward_transaction_id" uuid REFERENCES "agent_credit_transactions"("id"),
  "status" "evidence_review_status" NOT NULL DEFAULT 'pending',
  "assigned_at" timestamp with time zone NOT NULL DEFAULT now(),
  "responded_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "evi_review_evidence_idx" ON "evidence_review_assignments" ("evidence_id");
CREATE INDEX IF NOT EXISTS "evi_review_validator_idx" ON "evidence_review_assignments" ("validator_id");
CREATE INDEX IF NOT EXISTS "evi_review_status_idx" ON "evidence_review_assignments" ("status");
CREATE INDEX IF NOT EXISTS "evi_review_expires_idx" ON "evidence_review_assignments" ("expires_at");
CREATE UNIQUE INDEX IF NOT EXISTS "evi_review_unique_idx" ON "evidence_review_assignments" ("evidence_id", "validator_id");

-- ============================================================================
-- Extend validator_pool: capabilities default change, new columns
-- ============================================================================

-- Change capabilities default from {} to [] (new rows will get [])
ALTER TABLE "validator_pool" ALTER COLUMN "capabilities" SET DEFAULT '[]'::jsonb;

-- Add new columns
ALTER TABLE "validator_pool" ADD COLUMN IF NOT EXISTS "dispute_suspended_until" timestamp with time zone;
ALTER TABLE "validator_pool" ADD COLUMN IF NOT EXISTS "local_validation_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "validator_pool" ADD COLUMN IF NOT EXISTS "global_validation_count" integer NOT NULL DEFAULT 0;

-- ============================================================================
-- Extend problem_clusters: systemic issue tracking
-- ============================================================================

ALTER TABLE "problem_clusters" ADD COLUMN IF NOT EXISTS "is_systemic" boolean NOT NULL DEFAULT false;
ALTER TABLE "problem_clusters" ADD COLUMN IF NOT EXISTS "summary_generated_at" timestamp with time zone;
