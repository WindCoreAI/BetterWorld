-- Sprint 10: Phase 3 Foundation Migration
-- PostGIS extension + new enums + new tables + table extensions + backfill + seed

-- ============================================================================
-- 1. PostGIS Extension
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================================
-- 2. New Enums (8)
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE "public"."validator_tier" AS ENUM('apprentice', 'journeyman', 'expert');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."consensus_decision" AS ENUM('approved', 'rejected', 'escalated', 'expired');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."dispute_status" AS ENUM('open', 'admin_review', 'upheld', 'overturned', 'dismissed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."geographic_scope" AS ENUM('global', 'country', 'city', 'neighborhood');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."observation_type" AS ENUM('photo', 'video_still', 'text_report', 'audio_transcript');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."observation_verification" AS ENUM('pending', 'gps_verified', 'vision_verified', 'rejected', 'fraud_flagged');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."review_type" AS ENUM('evidence', 'observation', 'before_after');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."agent_credit_type" AS ENUM('earn_validation', 'earn_validation_local', 'earn_validation_complexity', 'earn_validation_domain', 'earn_starter_grant', 'spend_conversion');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- 3. Enum Extensions
-- ============================================================================
ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'earn_review_mission';
ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'earn_conversion_received';

-- ============================================================================
-- 4. New Tables
-- ============================================================================

-- 4a. validator_pool
CREATE TABLE IF NOT EXISTS "validator_pool" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL,
  "tier" "validator_tier" NOT NULL DEFAULT 'apprentice',
  "f1_score" numeric(5, 4) NOT NULL DEFAULT '0.0000',
  "precision" numeric(5, 4) NOT NULL DEFAULT '0.0000',
  "recall" numeric(5, 4) NOT NULL DEFAULT '0.0000',
  "total_evaluations" integer NOT NULL DEFAULT 0,
  "correct_evaluations" integer NOT NULL DEFAULT 0,
  "domain_scores" jsonb DEFAULT '{}',
  "home_region_name" varchar(200),
  "home_region_point" geography(Point, 4326),
  "daily_evaluation_count" integer NOT NULL DEFAULT 0,
  "daily_count_reset_at" timestamp with time zone,
  "last_assignment_at" timestamp with time zone,
  "last_response_at" timestamp with time zone,
  "response_rate" numeric(3, 2) NOT NULL DEFAULT '1.00',
  "capabilities" jsonb DEFAULT '{}',
  "is_active" boolean NOT NULL DEFAULT true,
  "suspended_until" timestamp with time zone,
  "suspension_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "validator_pool_agent_id_idx" UNIQUE("agent_id")
);

ALTER TABLE "validator_pool" ADD CONSTRAINT "validator_pool_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "validator_pool_tier_idx" ON "validator_pool" USING btree ("tier");
CREATE INDEX IF NOT EXISTS "validator_pool_f1_score_idx" ON "validator_pool" USING btree ("f1_score");
CREATE INDEX IF NOT EXISTS "validator_pool_is_active_idx" ON "validator_pool" USING btree ("is_active");

-- 4b. peer_evaluations
CREATE TABLE IF NOT EXISTS "peer_evaluations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "submission_id" uuid NOT NULL,
  "submission_type" "content_type" NOT NULL,
  "validator_id" uuid NOT NULL,
  "validator_agent_id" uuid NOT NULL,
  "recommendation" "guardrail_decision",
  "confidence" numeric(3, 2),
  "reasoning" text,
  "domain_relevance_score" integer,
  "accuracy_score" integer,
  "impact_score" integer,
  "safety_flagged" boolean NOT NULL DEFAULT false,
  "assigned_at" timestamp with time zone NOT NULL DEFAULT now(),
  "responded_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "reward_credit_transaction_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "peer_eval_unique_submission_validator" UNIQUE("submission_id", "validator_id")
);

ALTER TABLE "peer_evaluations" ADD CONSTRAINT "peer_evaluations_validator_id_fk" FOREIGN KEY ("validator_id") REFERENCES "public"."validator_pool"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "peer_evaluations" ADD CONSTRAINT "peer_evaluations_validator_agent_id_fk" FOREIGN KEY ("validator_agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "peer_eval_submission_idx" ON "peer_evaluations" USING btree ("submission_id", "submission_type");
CREATE INDEX IF NOT EXISTS "peer_eval_validator_idx" ON "peer_evaluations" USING btree ("validator_id");
CREATE INDEX IF NOT EXISTS "peer_eval_status_idx" ON "peer_evaluations" USING btree ("status");
CREATE INDEX IF NOT EXISTS "peer_eval_agent_status_idx" ON "peer_evaluations" USING btree ("validator_agent_id", "status");
CREATE INDEX IF NOT EXISTS "peer_eval_expires_idx" ON "peer_evaluations" USING btree ("expires_at");

-- 4c. consensus_results
CREATE TABLE IF NOT EXISTS "consensus_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "submission_id" uuid NOT NULL,
  "submission_type" "content_type" NOT NULL,
  "decision" "consensus_decision" NOT NULL,
  "confidence" numeric(3, 2) NOT NULL,
  "quorum_size" integer NOT NULL,
  "responses_received" integer NOT NULL,
  "weighted_approve" numeric(8, 4) NOT NULL,
  "weighted_reject" numeric(8, 4) NOT NULL,
  "weighted_escalate" numeric(8, 4) NOT NULL,
  "layer_b_decision" "guardrail_decision",
  "layer_b_alignment_score" numeric(3, 2),
  "agrees_with_layer_b" boolean,
  "consensus_latency_ms" integer,
  "was_early_consensus" boolean NOT NULL DEFAULT false,
  "escalation_reason" varchar(100),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "consensus_unique_submission" UNIQUE("submission_id", "submission_type")
);

CREATE INDEX IF NOT EXISTS "consensus_submission_idx" ON "consensus_results" USING btree ("submission_id", "submission_type");
CREATE INDEX IF NOT EXISTS "consensus_decision_idx" ON "consensus_results" USING btree ("decision");
CREATE INDEX IF NOT EXISTS "consensus_created_idx" ON "consensus_results" USING btree ("created_at");

-- 4d. agent_credit_transactions
CREATE TABLE IF NOT EXISTS "agent_credit_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL,
  "amount" integer NOT NULL,
  "balance_before" integer NOT NULL,
  "balance_after" integer NOT NULL,
  "transaction_type" "agent_credit_type" NOT NULL,
  "reference_id" uuid,
  "reference_type" varchar(50),
  "description" text,
  "idempotency_key" varchar(64),
  "metadata" jsonb DEFAULT '{}',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "balance_consistency" CHECK ("balance_after" = "balance_before" + "amount")
);

ALTER TABLE "agent_credit_transactions" ADD CONSTRAINT "agent_credit_tx_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "agent_credit_tx_agent_created_idx" ON "agent_credit_transactions" USING btree ("agent_id", "created_at");
CREATE INDEX IF NOT EXISTS "agent_credit_tx_type_idx" ON "agent_credit_transactions" USING btree ("transaction_type");
CREATE UNIQUE INDEX IF NOT EXISTS "agent_credit_tx_idempotency_idx" ON "agent_credit_transactions" USING btree ("idempotency_key");

-- 4e. credit_conversions
CREATE TABLE IF NOT EXISTS "credit_conversions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL,
  "agent_credits_spent" integer NOT NULL,
  "agent_credit_transaction_id" uuid,
  "human_id" uuid NOT NULL,
  "impact_tokens_received" integer NOT NULL,
  "human_transaction_id" uuid,
  "conversion_rate" numeric(8, 4) NOT NULL,
  "rate_snapshot" jsonb DEFAULT '{}',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE "credit_conversions" ADD CONSTRAINT "credit_conv_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "credit_conversions" ADD CONSTRAINT "credit_conv_human_id_fk" FOREIGN KEY ("human_id") REFERENCES "public"."humans"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "credit_conversions" ADD CONSTRAINT "credit_conv_agent_tx_fk" FOREIGN KEY ("agent_credit_transaction_id") REFERENCES "public"."agent_credit_transactions"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "credit_conversions" ADD CONSTRAINT "credit_conv_human_tx_fk" FOREIGN KEY ("human_transaction_id") REFERENCES "public"."token_transactions"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "credit_conv_agent_created_idx" ON "credit_conversions" USING btree ("agent_id", "created_at");
CREATE INDEX IF NOT EXISTS "credit_conv_human_created_idx" ON "credit_conversions" USING btree ("human_id", "created_at");

-- 4f. observations
CREATE TABLE IF NOT EXISTS "observations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "problem_id" uuid,
  "observation_type" "observation_type" NOT NULL,
  "media_url" text,
  "thumbnail_url" text,
  "caption" varchar(500) NOT NULL,
  "captured_at" timestamp with time zone,
  "gps_lat" numeric(10, 7),
  "gps_lng" numeric(10, 7),
  "gps_accuracy_meters" integer,
  "location_point" geography(Point, 4326),
  "submitted_by_human_id" uuid NOT NULL,
  "verification_status" "observation_verification" NOT NULL DEFAULT 'pending',
  "verification_notes" text,
  "perceptual_hash" varchar(64),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE "observations" ADD CONSTRAINT "observations_problem_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "observations" ADD CONSTRAINT "observations_human_id_fk" FOREIGN KEY ("submitted_by_human_id") REFERENCES "public"."humans"("id") ON DELETE restrict ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "observations_problem_id_idx" ON "observations" USING btree ("problem_id");
CREATE INDEX IF NOT EXISTS "observations_human_id_idx" ON "observations" USING btree ("submitted_by_human_id");
CREATE INDEX IF NOT EXISTS "observations_verification_idx" ON "observations" USING btree ("verification_status");
CREATE INDEX IF NOT EXISTS "observations_created_at_idx" ON "observations" USING btree ("created_at");

-- 4g. problem_clusters
CREATE TABLE IF NOT EXISTS "problem_clusters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(500) NOT NULL,
  "description" text,
  "domain" "problem_domain" NOT NULL,
  "scope" "geographic_scope" NOT NULL,
  "centroid_point" geography(Point, 4326),
  "radius_meters" integer NOT NULL,
  "city" varchar(100),
  "member_problem_ids" uuid[] NOT NULL DEFAULT '{}',
  "member_count" integer NOT NULL DEFAULT 0,
  "total_observations" integer NOT NULL DEFAULT 0,
  "distinct_reporters" integer NOT NULL DEFAULT 0,
  "promoted_to_problem_id" uuid,
  "promoted_at" timestamp with time zone,
  "centroid_embedding" halfvec(1024),
  "is_active" boolean NOT NULL DEFAULT true,
  "last_aggregated_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE "problem_clusters" ADD CONSTRAINT "clusters_promoted_problem_fk" FOREIGN KEY ("promoted_to_problem_id") REFERENCES "public"."problems"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "clusters_domain_idx" ON "problem_clusters" USING btree ("domain");
CREATE INDEX IF NOT EXISTS "clusters_city_idx" ON "problem_clusters" USING btree ("city");
CREATE INDEX IF NOT EXISTS "clusters_is_active_idx" ON "problem_clusters" USING btree ("is_active");

-- 4h. disputes
CREATE TABLE IF NOT EXISTS "disputes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "consensus_id" uuid NOT NULL,
  "challenger_agent_id" uuid NOT NULL,
  "stake_amount" integer NOT NULL DEFAULT 10,
  "stake_credit_transaction_id" uuid,
  "reasoning" text NOT NULL,
  "status" "dispute_status" NOT NULL DEFAULT 'open',
  "admin_reviewer_id" uuid,
  "admin_decision" varchar(20),
  "admin_notes" text,
  "resolved_at" timestamp with time zone,
  "stake_returned" boolean NOT NULL DEFAULT false,
  "bonus_paid" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE "disputes" ADD CONSTRAINT "disputes_consensus_id_fk" FOREIGN KEY ("consensus_id") REFERENCES "public"."consensus_results"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_challenger_agent_id_fk" FOREIGN KEY ("challenger_agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_stake_tx_fk" FOREIGN KEY ("stake_credit_transaction_id") REFERENCES "public"."agent_credit_transactions"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "disputes_consensus_idx" ON "disputes" USING btree ("consensus_id");
CREATE INDEX IF NOT EXISTS "disputes_challenger_idx" ON "disputes" USING btree ("challenger_agent_id");
CREATE INDEX IF NOT EXISTS "disputes_status_idx" ON "disputes" USING btree ("status");

-- ============================================================================
-- 5. Table Extensions
-- ============================================================================

-- 5a. agents: Add credit balance + validator fields
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "credit_balance" integer NOT NULL DEFAULT 0;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "home_region_name" varchar(200);
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "home_region_point" geography(Point, 4326);
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "local_problems_reported" integer NOT NULL DEFAULT 0;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "local_reputation_score" numeric(5, 2) NOT NULL DEFAULT '0';

CREATE INDEX IF NOT EXISTS "agents_credit_balance_idx" ON "agents" USING btree ("credit_balance");

-- 5b. problems: Add PostGIS + hyperlocal fields
ALTER TABLE "problems" ADD COLUMN IF NOT EXISTS "location_point" geography(Point, 4326);
ALTER TABLE "problems" ADD COLUMN IF NOT EXISTS "local_urgency" varchar(20);
ALTER TABLE "problems" ADD COLUMN IF NOT EXISTS "actionability" varchar(20);
ALTER TABLE "problems" ADD COLUMN IF NOT EXISTS "radius_meters" integer;
ALTER TABLE "problems" ADD COLUMN IF NOT EXISTS "observation_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "problems" ADD COLUMN IF NOT EXISTS "municipal_source_id" varchar(100);
ALTER TABLE "problems" ADD COLUMN IF NOT EXISTS "municipal_source_type" varchar(50);

CREATE INDEX IF NOT EXISTS "problems_geo_scope_urgency_idx" ON "problems" USING btree ("geographic_scope", "local_urgency", "created_at");
CREATE INDEX IF NOT EXISTS "problems_municipal_source_idx" ON "problems" USING btree ("municipal_source_type", "municipal_source_id");
CREATE INDEX IF NOT EXISTS "problems_observation_count_idx" ON "problems" USING btree ("observation_count");

-- 5c. peer_reviews: Add review type + observation reference
ALTER TABLE "peer_reviews" ALTER COLUMN "evidence_id" DROP NOT NULL;
ALTER TABLE "peer_reviews" ADD COLUMN IF NOT EXISTS "review_type" varchar(20) NOT NULL DEFAULT 'evidence';
ALTER TABLE "peer_reviews" ADD COLUMN IF NOT EXISTS "observation_id" uuid;

ALTER TABLE "peer_reviews" ADD CONSTRAINT "peer_reviews_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observations"("id") ON DELETE restrict ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "idx_peer_reviews_type" ON "peer_reviews" USING btree ("review_type");
CREATE INDEX IF NOT EXISTS "idx_peer_reviews_observation" ON "peer_reviews" USING btree ("observation_id");

-- Add check constraint (evidence or observation must be set)
-- Drop old constraint if exists first to avoid conflict
ALTER TABLE "peer_reviews" DROP CONSTRAINT IF EXISTS "has_review_target";
ALTER TABLE "peer_reviews" ADD CONSTRAINT "has_review_target" CHECK ("evidence_id" IS NOT NULL OR "observation_id" IS NOT NULL);

-- ============================================================================
-- 6. PostGIS Backfill
-- ============================================================================
UPDATE problems
SET location_point = ST_SetSRID(ST_MakePoint(longitude::float, latitude::float), 4326)::geography
WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND location_point IS NULL;

-- ============================================================================
-- 7. System Agent Seed
-- ============================================================================
INSERT INTO agents (id, username, framework, api_key_hash, api_key_prefix, is_active)
VALUES ('00000000-0000-0000-0000-000000000311', 'system-municipal-311', 'system', '$system$', 'sys_', true)
ON CONFLICT (id) DO NOTHING;
