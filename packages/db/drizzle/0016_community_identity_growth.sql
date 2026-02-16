-- Sprint 17: Community Identity & Visible Growth
-- Migration 0016: 3 new enums, 3 enum value additions, 3 new tables, 6 column additions, 1 new index

-- 1. CREATE TYPE group_type_enum
DO $$ BEGIN
  CREATE TYPE "group_type" AS ENUM ('domain', 'city');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. CREATE TYPE milestone_type_enum
DO $$ BEGIN
  CREATE TYPE "milestone_type" AS ENUM ('missions_completed', 'problems_resolved', 'members_joined', 'perfect_week', 'cross_city_solution');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. CREATE TYPE feedback_type_enum
DO $$ BEGIN
  CREATE TYPE "feedback_type" AS ENUM ('evidence_rejection', 'review_disagreement', 'high_performer_recognition');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4-6. ALTER TYPE notification_type ADD VALUE (idempotent — IF NOT EXISTS)
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'feedback';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'milestone_celebration';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'intelligence_report';

-- 7. CREATE TABLE group_milestones
CREATE TABLE IF NOT EXISTS "group_milestones" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_type" "group_type" NOT NULL,
  "group_value" varchar(100) NOT NULL,
  "milestone_type" "milestone_type" NOT NULL,
  "target_value" integer NOT NULL,
  "current_value" integer DEFAULT 0 NOT NULL,
  "reached_at" timestamp with time zone,
  "banner_expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "group_milestones_unique" UNIQUE("group_type", "group_value", "milestone_type", "target_value")
);

CREATE INDEX IF NOT EXISTS "group_milestones_group_idx" ON "group_milestones" ("group_type", "group_value");
CREATE INDEX IF NOT EXISTS "group_milestones_active_banner_idx" ON "group_milestones" ("banner_expires_at") WHERE banner_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS "group_milestones_unreached_idx" ON "group_milestones" ("group_type", "group_value") WHERE reached_at IS NULL;

-- 8. CREATE TABLE review_feedback
CREATE TABLE IF NOT EXISTS "review_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recipient_human_id" uuid REFERENCES "humans"("id") ON DELETE CASCADE,
  "recipient_agent_id" uuid REFERENCES "agents"("id") ON DELETE CASCADE,
  "feedback_type" "feedback_type" NOT NULL,
  "reference_id" uuid NOT NULL,
  "reference_type" varchar(50) NOT NULL,
  "message" text NOT NULL,
  "improvement_tips" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "is_read" boolean DEFAULT false NOT NULL,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "at_least_one_recipient" CHECK (recipient_human_id IS NOT NULL OR recipient_agent_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "review_feedback_human_unread_idx" ON "review_feedback" ("recipient_human_id", "is_read") WHERE recipient_human_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS "review_feedback_agent_unread_idx" ON "review_feedback" ("recipient_agent_id", "is_read") WHERE recipient_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS "review_feedback_created_idx" ON "review_feedback" ("created_at");
CREATE INDEX IF NOT EXISTS "review_feedback_reference_idx" ON "review_feedback" ("reference_id", "reference_type");

-- 9. CREATE TABLE intelligence_reports
CREATE TABLE IF NOT EXISTS "intelligence_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "report_month" varchar(7) NOT NULL UNIQUE,
  "report_data" jsonb NOT NULL,
  "generated_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- 10-12. ALTER TABLE human_profiles — add 3 columns
ALTER TABLE "human_profiles" ADD COLUMN IF NOT EXISTS "motivation" text;
ALTER TABLE "human_profiles" ADD COLUMN IF NOT EXISTS "primary_domain" "problem_domain";
ALTER TABLE "human_profiles" ADD COLUMN IF NOT EXISTS "local_context" text;

-- 13. ALTER TABLE agents — add approach_philosophy
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "approach_philosophy" text;

-- 14. ALTER TABLE problems — add contributor_note
ALTER TABLE "problems" ADD COLUMN IF NOT EXISTS "contributor_note" text;

-- 15. ALTER TABLE solutions — add contributor_note
ALTER TABLE "solutions" ADD COLUMN IF NOT EXISTS "contributor_note" text;

-- 16. CREATE INDEX on human_profiles.primary_domain
CREATE INDEX IF NOT EXISTS "human_profiles_primary_domain_idx" ON "human_profiles" ("primary_domain") WHERE primary_domain IS NOT NULL;
