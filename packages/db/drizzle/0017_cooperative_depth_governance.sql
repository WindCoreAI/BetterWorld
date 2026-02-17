-- Sprint 18: Cooperative Depth & Governance
-- Migration: 0017_cooperative_depth_governance.sql

-- ============================================================================
-- New Enums
-- ============================================================================

CREATE TYPE "mentorship_status" AS ENUM ('pending', 'active', 'completed', 'terminated');
CREATE TYPE "buddy_status" AS ENUM ('pending', 'accepted', 'declined', 'expired');
CREATE TYPE "help_offer_status" AS ENUM ('pending', 'accepted', 'declined');
CREATE TYPE "moderator_action_type" AS ENUM ('content_approved', 'content_rejected', 'content_escalated', 'help_response', 'newcomer_welcome');
CREATE TYPE "circle_role" AS ENUM ('founder', 'moderator', 'member');
CREATE TYPE "circle_post_type" AS ENUM ('discussion', 'mission_share', 'celebration');
CREATE TYPE "case_study_status" AS ENUM ('draft', 'published', 'archived');
CREATE TYPE "challenge_type" AS ENUM ('city_vs_city', 'domain_sprint', 'cross_pollination');
CREATE TYPE "challenge_status" AS ENUM ('upcoming', 'active', 'completed', 'cancelled');
CREATE TYPE "pathway_level" AS ENUM ('observer', 'practitioner', 'specialist_candidate', 'specialist');
CREATE TYPE "cooperative_achievement_type" AS ENUM ('first_responders', 'cross_city_bridge', 'perfect_consensus', 'domain_sweep', 'growth_partners');
CREATE TYPE "feed_event_type" AS ENUM ('problem_created', 'solution_proposed', 'mission_claimed', 'evidence_submitted', 'thread_created', 'reply_created', 'achievement_earned', 'milestone_reached', 'help_requested', 'case_study_published', 'challenge_started');

-- ============================================================================
-- Extended Enums
-- ============================================================================

ALTER TYPE "mission_status" ADD VALUE 'pending_endorsement';

ALTER TYPE "transaction_type" ADD VALUE 'earn_mentorship_bonus';
ALTER TYPE "transaction_type" ADD VALUE 'earn_mentee_first_mission';
ALTER TYPE "transaction_type" ADD VALUE 'earn_mentorship_completion';
ALTER TYPE "transaction_type" ADD VALUE 'earn_buddy_split';
ALTER TYPE "transaction_type" ADD VALUE 'earn_helper_reward';
ALTER TYPE "transaction_type" ADD VALUE 'spend_buddy_share';
ALTER TYPE "transaction_type" ADD VALUE 'spend_helper_share';
ALTER TYPE "transaction_type" ADD VALUE 'earn_teaching_reward';
ALTER TYPE "transaction_type" ADD VALUE 'earn_ambassador_welcome';
ALTER TYPE "transaction_type" ADD VALUE 'earn_case_study_contribution';

ALTER TYPE "content_type" ADD VALUE 'circle_post';
ALTER TYPE "content_type" ADD VALUE 'help_offer_message';
ALTER TYPE "content_type" ADD VALUE 'help_request_note';
ALTER TYPE "content_type" ADD VALUE 'gratitude_narrative';
ALTER TYPE "content_type" ADD VALUE 'human_solution';
ALTER TYPE "content_type" ADD VALUE 'human_mission_proposal';

ALTER TYPE "notification_type" ADD VALUE 'mentorship_request';
ALTER TYPE "notification_type" ADD VALUE 'mentorship_accepted';
ALTER TYPE "notification_type" ADD VALUE 'mentorship_completed';
ALTER TYPE "notification_type" ADD VALUE 'mentorship_rating_prompt';
ALTER TYPE "notification_type" ADD VALUE 'mentee_mission_completed';
ALTER TYPE "notification_type" ADD VALUE 'buddy_invitation';
ALTER TYPE "notification_type" ADD VALUE 'buddy_accepted';
ALTER TYPE "notification_type" ADD VALUE 'buddy_declined';
ALTER TYPE "notification_type" ADD VALUE 'help_offer_received';
ALTER TYPE "notification_type" ADD VALUE 'help_offer_accepted';
ALTER TYPE "notification_type" ADD VALUE 'help_offer_declined';
ALTER TYPE "notification_type" ADD VALUE 'moderator_approved';
ALTER TYPE "notification_type" ADD VALUE 'moderator_decision';
ALTER TYPE "notification_type" ADD VALUE 'pathway_level_up';
ALTER TYPE "notification_type" ADD VALUE 'challenge_started';
ALTER TYPE "notification_type" ADD VALUE 'challenge_completed';
ALTER TYPE "notification_type" ADD VALUE 'achievement_earned';
ALTER TYPE "notification_type" ADD VALUE 'ambassador_assigned';
ALTER TYPE "notification_type" ADD VALUE 'ambassador_welcome';

-- ============================================================================
-- New Tables
-- ============================================================================

-- 1. Mentorships
CREATE TABLE "mentorships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "mentor_human_id" uuid NOT NULL REFERENCES "humans"("id"),
  "mentee_human_id" uuid NOT NULL REFERENCES "humans"("id"),
  "domain" "problem_domain" NOT NULL,
  "status" "mentorship_status" NOT NULL DEFAULT 'pending',
  "mentor_accepted" boolean NOT NULL DEFAULT false,
  "mentee_accepted" boolean NOT NULL DEFAULT false,
  "missions_guided" integer NOT NULL DEFAULT 0,
  "tokens_earned_by_mentor" integer NOT NULL DEFAULT 0,
  "mentor_rating" integer CHECK ("mentor_rating" IS NULL OR ("mentor_rating" >= 1 AND "mentor_rating" <= 5)),
  "mentee_rating" integer CHECK ("mentee_rating" IS NULL OR ("mentee_rating" >= 1 AND "mentee_rating" <= 5)),
  "expires_at" timestamptz NOT NULL,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_mentorships_mentor" ON "mentorships" ("mentor_human_id");
CREATE INDEX "idx_mentorships_mentee" ON "mentorships" ("mentee_human_id");
CREATE UNIQUE INDEX "idx_mentorships_active_mentee" ON "mentorships" ("mentee_human_id") WHERE "status" IN ('pending', 'active');

-- 2. Mission Help Offers
CREATE TABLE "mission_help_offers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "mission_claim_id" uuid NOT NULL REFERENCES "mission_claims"("id"),
  "helper_human_id" uuid NOT NULL REFERENCES "humans"("id"),
  "message" varchar(500) NOT NULL,
  "status" "help_offer_status" NOT NULL DEFAULT 'pending',
  "is_contributing" boolean NOT NULL DEFAULT false,
  "guardrail_status" "guardrail_status" NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "idx_help_offers_unique" ON "mission_help_offers" ("mission_claim_id", "helper_human_id");
CREATE INDEX "idx_help_offers_claim" ON "mission_help_offers" ("mission_claim_id");
CREATE INDEX "idx_help_offers_helper" ON "mission_help_offers" ("helper_human_id");

-- 3. Circles
CREATE TABLE "circles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(100) NOT NULL,
  "description" text,
  "domain" "problem_domain",
  "created_by_human_id" uuid NOT NULL REFERENCES "humans"("id"),
  "member_count" integer NOT NULL DEFAULT 1,
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_circles_creator" ON "circles" ("created_by_human_id");
CREATE INDEX "idx_circles_domain" ON "circles" ("domain");

-- 4. Circle Members
CREATE TABLE "circle_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "circle_id" uuid NOT NULL REFERENCES "circles"("id") ON DELETE CASCADE,
  "human_id" uuid NOT NULL REFERENCES "humans"("id"),
  "role" "circle_role" NOT NULL DEFAULT 'member',
  "joined_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "idx_circle_members_unique" ON "circle_members" ("circle_id", "human_id");
CREATE INDEX "idx_circle_members_human" ON "circle_members" ("human_id");

-- 5. Circle Posts
CREATE TABLE "circle_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "circle_id" uuid NOT NULL REFERENCES "circles"("id") ON DELETE CASCADE,
  "author_human_id" uuid NOT NULL REFERENCES "humans"("id"),
  "content" text NOT NULL,
  "post_type" "circle_post_type" NOT NULL DEFAULT 'discussion',
  "guardrail_status" "guardrail_status" NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_circle_posts_circle" ON "circle_posts" ("circle_id", "created_at" DESC);

-- 6. Circle Missions
CREATE TABLE "circle_missions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "circle_id" uuid NOT NULL REFERENCES "circles"("id") ON DELETE CASCADE,
  "mission_id" uuid NOT NULL REFERENCES "missions"("id"),
  "shared_by_human_id" uuid NOT NULL REFERENCES "humans"("id"),
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "idx_circle_missions_unique" ON "circle_missions" ("circle_id", "mission_id");

-- 7. Cooperative Achievements
CREATE TABLE "cooperative_achievements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "achievement_type" "cooperative_achievement_type" NOT NULL,
  "title" varchar(200) NOT NULL,
  "description" text,
  "reference_ids" jsonb NOT NULL DEFAULT '[]',
  "earned_at" timestamptz NOT NULL DEFAULT NOW()
);

-- 8. Cooperative Achievement Earners
CREATE TABLE "cooperative_achievement_earners" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "achievement_id" uuid NOT NULL REFERENCES "cooperative_achievements"("id") ON DELETE CASCADE,
  "human_id" uuid NOT NULL REFERENCES "humans"("id"),
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "idx_achievement_earners_unique" ON "cooperative_achievement_earners" ("achievement_id", "human_id");
CREATE INDEX "idx_achievement_earners_human" ON "cooperative_achievement_earners" ("human_id", "created_at" DESC);

-- 9. Moderator Actions (Immutable Audit Log)
CREATE TABLE "moderator_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "moderator_human_id" uuid NOT NULL REFERENCES "humans"("id"),
  "action_type" "moderator_action_type" NOT NULL,
  "target_id" uuid NOT NULL,
  "target_type" varchar(50) NOT NULL,
  "decision" varchar(20),
  "reason" text,
  "domain" "problem_domain" NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_mod_actions_moderator" ON "moderator_actions" ("moderator_human_id", "created_at" DESC);
CREATE INDEX "idx_mod_actions_target" ON "moderator_actions" ("target_id", "target_type");

-- 10. Learning Pathways
CREATE TABLE "learning_pathways" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "human_id" uuid NOT NULL REFERENCES "humans"("id"),
  "domain" "problem_domain" NOT NULL,
  "current_level" "pathway_level" NOT NULL DEFAULT 'observer',
  "missions_completed" integer NOT NULL DEFAULT 0,
  "mission_types_count" integer NOT NULL DEFAULT 0,
  "peer_reviews_completed" integer NOT NULL DEFAULT 0,
  "review_accuracy" decimal(5,4),
  "debates_participated" integer NOT NULL DEFAULT 0,
  "cross_city_missions" integer NOT NULL DEFAULT 0,
  "case_studies_read" integer NOT NULL DEFAULT 0,
  "progress_percent" integer NOT NULL DEFAULT 0,
  "level_reached_at" timestamptz,
  "enrolled_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "idx_pathways_unique" ON "learning_pathways" ("human_id", "domain");
CREATE INDEX "idx_pathways_human" ON "learning_pathways" ("human_id");
CREATE INDEX "idx_pathways_domain_level" ON "learning_pathways" ("domain", "current_level");

-- 11. Case Studies
CREATE TABLE "case_studies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "mission_id" uuid NOT NULL REFERENCES "missions"("id"),
  "domain" "problem_domain" NOT NULL,
  "title" varchar(300) NOT NULL,
  "summary" text NOT NULL,
  "context" text,
  "approach" text,
  "evidence_quality" text,
  "key_learnings" text,
  "contributor_human_ids" uuid[] NOT NULL DEFAULT '{}',
  "status" "case_study_status" NOT NULL DEFAULT 'draft',
  "published_at" timestamptz,
  "published_by_human_id" uuid REFERENCES "humans"("id"),
  "read_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "idx_case_studies_mission" ON "case_studies" ("mission_id");
CREATE INDEX "idx_case_studies_domain" ON "case_studies" ("domain");
CREATE INDEX "idx_case_studies_status" ON "case_studies" ("status", "created_at" DESC);

-- 12. Group Challenges
CREATE TABLE "group_challenges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "challenge_type" "challenge_type" NOT NULL,
  "title" varchar(200) NOT NULL,
  "description" text,
  "groups" jsonb NOT NULL,
  "metric" varchar(50) NOT NULL,
  "target_value" integer,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "status" "challenge_status" NOT NULL DEFAULT 'upcoming',
  "results" jsonb,
  "created_by_human_id" uuid REFERENCES "humans"("id"),
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_challenges_status" ON "group_challenges" ("status", "start_date");
CREATE INDEX "idx_challenges_dates" ON "group_challenges" ("start_date", "end_date");

-- 13. Challenge Participants
CREATE TABLE "challenge_participants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "challenge_id" uuid NOT NULL REFERENCES "group_challenges"("id") ON DELETE CASCADE,
  "human_id" uuid NOT NULL REFERENCES "humans"("id"),
  "group_type" "group_type" NOT NULL,
  "group_value" varchar(100) NOT NULL,
  "score" decimal(10,2) NOT NULL DEFAULT 0,
  "joined_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "idx_challenge_participants_unique" ON "challenge_participants" ("challenge_id", "human_id");
CREATE INDEX "idx_challenge_participants_challenge" ON "challenge_participants" ("challenge_id", "score" DESC);

-- 14. Power Distribution Snapshots
CREATE TABLE "power_distribution_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "review_gini" decimal(5,4) NOT NULL,
  "decision_concentration" decimal(5,4) NOT NULL,
  "admin_override_rate" decimal(5,4) NOT NULL,
  "tier_distribution" jsonb NOT NULL,
  "domain_coverage" decimal(5,4) NOT NULL,
  "geographic_balance" decimal(5,4) NOT NULL,
  "computed_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_power_snapshots_computed" ON "power_distribution_snapshots" ("computed_at" DESC);

-- 15. Agent Fingerprints
CREATE TABLE "agent_fingerprints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "agent_id" uuid NOT NULL REFERENCES "agents"("id"),
  "domain_focus" jsonb NOT NULL,
  "approach_pattern" jsonb NOT NULL,
  "geographic_focus" jsonb NOT NULL,
  "scale_preference" jsonb NOT NULL,
  "computed_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_agent_fingerprints_agent" ON "agent_fingerprints" ("agent_id", "computed_at" DESC);

-- 16. Feed Events
CREATE TABLE "feed_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_type" "feed_event_type" NOT NULL,
  "actor_human_id" uuid REFERENCES "humans"("id"),
  "actor_agent_id" uuid REFERENCES "agents"("id"),
  "target_id" uuid NOT NULL,
  "target_type" varchar(50) NOT NULL,
  "domain" "problem_domain",
  "city" varchar(100),
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_feed_events_created" ON "feed_events" ("created_at" DESC);
CREATE INDEX "idx_feed_events_domain" ON "feed_events" ("domain", "created_at" DESC);
CREATE INDEX "idx_feed_events_city" ON "feed_events" ("city", "created_at" DESC);

-- 17. Mission Endorsements
CREATE TABLE "mission_endorsements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "mission_id" uuid NOT NULL REFERENCES "missions"("id") ON DELETE CASCADE,
  "human_id" uuid NOT NULL REFERENCES "humans"("id"),
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "idx_mission_endorsements_unique" ON "mission_endorsements" ("mission_id", "human_id");
CREATE INDEX "idx_mission_endorsements_mission" ON "mission_endorsements" ("mission_id");

-- 18. Ambassador Assignments
CREATE TABLE "ambassador_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ambassador_human_id" uuid NOT NULL REFERENCES "humans"("id"),
  "newcomer_human_id" uuid NOT NULL REFERENCES "humans"("id"),
  "message" varchar(500),
  "sent_at" timestamptz,
  "token_awarded" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "idx_ambassador_assignments_newcomer" ON "ambassador_assignments" ("newcomer_human_id");
CREATE INDEX "idx_ambassador_assignments_ambassador" ON "ambassador_assignments" ("ambassador_human_id", "created_at" DESC);

-- ============================================================================
-- Modified Tables
-- ============================================================================

-- Humans: Add moderator fields
ALTER TABLE "humans" ADD COLUMN "is_moderator" boolean NOT NULL DEFAULT false;
ALTER TABLE "humans" ADD COLUMN "moderator_since" timestamptz;
ALTER TABLE "humans" ADD COLUMN "moderator_domains" text[] DEFAULT '{}';

-- Solutions: Make proposed_by_agent_id nullable, add proposed_by_human_id
ALTER TABLE "solutions" ALTER COLUMN "proposed_by_agent_id" DROP NOT NULL;
ALTER TABLE "solutions" ADD COLUMN "proposed_by_human_id" uuid REFERENCES "humans"("id");
ALTER TABLE "solutions" ADD CONSTRAINT "one_proposer_required" CHECK (("proposed_by_agent_id" IS NOT NULL) OR ("proposed_by_human_id" IS NOT NULL));

-- Endorsements: Add narrative and featuring
ALTER TABLE "endorsements" ADD COLUMN "narrative" text;
ALTER TABLE "endorsements" ADD COLUMN "is_featured" boolean NOT NULL DEFAULT false;

-- Mission Claims: Add buddy and help fields
ALTER TABLE "mission_claims" ADD COLUMN "buddy_human_id" uuid REFERENCES "humans"("id");
ALTER TABLE "mission_claims" ADD COLUMN "buddy_status" "buddy_status";
ALTER TABLE "mission_claims" ADD COLUMN "is_buddy" boolean NOT NULL DEFAULT false;
ALTER TABLE "mission_claims" ADD COLUMN "help_requested" boolean NOT NULL DEFAULT false;
ALTER TABLE "mission_claims" ADD COLUMN "help_request_note" text;

-- Missions: Add human proposer and endorsement count, make solutionId/createdByAgentId nullable
ALTER TABLE "missions" ALTER COLUMN "solution_id" DROP NOT NULL;
ALTER TABLE "missions" ALTER COLUMN "created_by_agent_id" DROP NOT NULL;
ALTER TABLE "missions" ADD COLUMN "proposed_by_human_id" uuid REFERENCES "humans"("id");
ALTER TABLE "missions" ADD COLUMN "endorsement_count" integer NOT NULL DEFAULT 0;
