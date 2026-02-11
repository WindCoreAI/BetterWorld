CREATE TYPE "public"."difficulty_level" AS ENUM('beginner', 'intermediate', 'advanced', 'expert');--> statement-breakpoint
CREATE TYPE "public"."endorsement_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."evidence_type" AS ENUM('photo', 'video', 'document', 'text_report');--> statement-breakpoint
CREATE TYPE "public"."evidence_verification_stage" AS ENUM('pending', 'ai_processing', 'peer_review', 'verified', 'rejected', 'appealed', 'admin_review');--> statement-breakpoint
CREATE TYPE "public"."fraud_action" AS ENUM('flag_for_review', 'auto_suspend', 'clear_flag', 'reset_score', 'manual_suspend', 'unsuspend');--> statement-breakpoint
CREATE TYPE "public"."mission_claim_status" AS ENUM('active', 'submitted', 'verified', 'abandoned', 'released');--> statement-breakpoint
CREATE TYPE "public"."mission_status" AS ENUM('open', 'claimed', 'in_progress', 'submitted', 'verified', 'expired', 'archived');--> statement-breakpoint
CREATE TYPE "public"."peer_review_verdict" AS ENUM('approve', 'reject');--> statement-breakpoint
CREATE TYPE "public"."portfolio_visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TYPE "public"."reputation_tier" AS ENUM('newcomer', 'contributor', 'advocate', 'leader', 'champion');--> statement-breakpoint
ALTER TYPE "public"."content_type" ADD VALUE 'mission';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'earn_evidence_verified' BEFORE 'spend_vote';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'earn_peer_review' BEFORE 'spend_vote';--> statement-breakpoint
CREATE TABLE "missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"solution_id" uuid NOT NULL,
	"created_by_agent_id" uuid NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text NOT NULL,
	"instructions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_required" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_skills" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"domain" "problem_domain" NOT NULL,
	"required_location_name" varchar(200),
	"required_latitude" numeric(10, 7),
	"required_longitude" numeric(10, 7),
	"location_radius_km" integer DEFAULT 5,
	"estimated_duration_minutes" integer NOT NULL,
	"difficulty" "difficulty_level" DEFAULT 'intermediate' NOT NULL,
	"mission_type" varchar(50),
	"token_reward" integer NOT NULL,
	"bonus_for_quality" integer DEFAULT 0,
	"max_claims" integer DEFAULT 1 NOT NULL,
	"current_claim_count" integer DEFAULT 0 NOT NULL,
	"guardrail_status" "guardrail_status" DEFAULT 'pending' NOT NULL,
	"guardrail_evaluation_id" uuid,
	"status" "mission_status" DEFAULT 'open' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"is_honeypot" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "token_reward_positive" CHECK ("missions"."token_reward" > 0),
	CONSTRAINT "bonus_for_quality_non_negative" CHECK ("missions"."bonus_for_quality" >= 0),
	CONSTRAINT "max_claims_at_least_one" CHECK ("missions"."max_claims" >= 1),
	CONSTRAINT "current_claim_count_non_negative" CHECK ("missions"."current_claim_count" >= 0),
	CONSTRAINT "current_claim_count_within_max" CHECK ("missions"."current_claim_count" <= "missions"."max_claims")
);
--> statement-breakpoint
CREATE TABLE "mission_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mission_id" uuid NOT NULL,
	"human_id" uuid NOT NULL,
	"status" "mission_claim_status" DEFAULT 'active' NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"progress_percent" integer DEFAULT 0,
	"completed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progress_percent_range" CHECK ("mission_claims"."progress_percent" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" uuid NOT NULL,
	"receiver_id" uuid NOT NULL,
	"thread_id" uuid,
	"encrypted_content" text NOT NULL,
	"encryption_key_version" integer DEFAULT 1 NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "no_self_message" CHECK ("messages"."sender_id" != "messages"."receiver_id")
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mission_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"submitted_by_human_id" uuid NOT NULL,
	"evidence_type" "evidence_type" NOT NULL,
	"content_url" text,
	"text_content" text,
	"thumbnail_url" text,
	"medium_url" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"captured_at" timestamp with time zone,
	"exif_data" jsonb,
	"file_size" integer,
	"mime_type" varchar(100),
	"ai_verification_score" numeric(3, 2),
	"ai_verification_reasoning" text,
	"verification_stage" "evidence_verification_stage" DEFAULT 'pending' NOT NULL,
	"peer_review_count" integer DEFAULT 0 NOT NULL,
	"peer_reviews_needed" integer DEFAULT 3 NOT NULL,
	"peer_verdict" varchar(20),
	"peer_average_confidence" numeric(3, 2),
	"final_verdict" varchar(20),
	"final_confidence" numeric(3, 2),
	"reward_transaction_id" uuid,
	"is_honeypot_submission" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_score_range" CHECK ("evidence"."ai_verification_score" IS NULL OR ("evidence"."ai_verification_score" >= 0 AND "evidence"."ai_verification_score" <= 1)),
	CONSTRAINT "peer_count_non_negative" CHECK ("evidence"."peer_review_count" >= 0),
	CONSTRAINT "peer_needed_positive" CHECK ("evidence"."peer_reviews_needed" >= 1),
	CONSTRAINT "has_content" CHECK ("evidence"."content_url" IS NOT NULL OR "evidence"."text_content" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "peer_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL,
	"reviewer_human_id" uuid NOT NULL,
	"verdict" "peer_review_verdict" NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	"reasoning" text NOT NULL,
	"reward_transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_peer_review" UNIQUE("evidence_id","reviewer_human_id"),
	CONSTRAINT "confidence_range" CHECK ("peer_reviews"."confidence" >= 0 AND "peer_reviews"."confidence" <= 1)
);
--> statement-breakpoint
CREATE TABLE "review_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reviewer_human_id" uuid NOT NULL,
	"submitter_human_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "no_self_review_history" CHECK ("review_history"."reviewer_human_id" != "review_history"."submitter_human_id")
);
--> statement-breakpoint
CREATE TABLE "verification_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL,
	"decision_source" varchar(20) NOT NULL,
	"decision" varchar(20) NOT NULL,
	"score" numeric(3, 2),
	"reasoning" text,
	"decided_by_human_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reputation_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"human_id" uuid NOT NULL,
	"score_before" numeric(10, 2) NOT NULL,
	"score_after" numeric(10, 2) NOT NULL,
	"delta" numeric(10, 2) NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"event_source_id" uuid,
	"event_source_type" varchar(50),
	"tier_before" "reputation_tier",
	"tier_after" "reputation_tier",
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reputation_scores" (
	"human_id" uuid PRIMARY KEY NOT NULL,
	"total_score" numeric(10, 2) DEFAULT '0' NOT NULL,
	"mission_quality_score" numeric(8, 2) DEFAULT '0' NOT NULL,
	"peer_accuracy_score" numeric(8, 2) DEFAULT '0' NOT NULL,
	"streak_score" numeric(8, 2) DEFAULT '0' NOT NULL,
	"endorsement_score" numeric(8, 2) DEFAULT '0' NOT NULL,
	"current_tier" "reputation_tier" DEFAULT 'newcomer' NOT NULL,
	"tier_multiplier" numeric(3, 2) DEFAULT '1.00' NOT NULL,
	"grace_period_start" timestamp with time zone,
	"grace_period_tier" "reputation_tier",
	"last_activity_at" timestamp with time zone,
	"last_decay_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "total_score_non_negative" CHECK ("reputation_scores"."total_score" >= 0)
);
--> statement-breakpoint
CREATE TABLE "streaks" (
	"human_id" uuid PRIMARY KEY NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_active_date" date,
	"streak_multiplier" numeric(3, 2) DEFAULT '1.00' NOT NULL,
	"freeze_available" boolean DEFAULT true NOT NULL,
	"freeze_last_used_at" timestamp with time zone,
	"freeze_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "current_streak_non_negative" CHECK ("streaks"."current_streak" >= 0),
	CONSTRAINT "longest_streak_non_negative" CHECK ("streaks"."longest_streak" >= 0)
);
--> statement-breakpoint
CREATE TABLE "endorsements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_human_id" uuid NOT NULL,
	"to_human_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" "endorsement_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "no_self_endorsement" CHECK ("endorsements"."from_human_id" != "endorsements"."to_human_id")
);
--> statement-breakpoint
CREATE TABLE "fraud_admin_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"human_id" uuid NOT NULL,
	"admin_id" uuid NOT NULL,
	"action" "fraud_action" NOT NULL,
	"reason" text NOT NULL,
	"fraud_score_before" integer NOT NULL,
	"fraud_score_after" integer NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fraud_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"human_id" uuid NOT NULL,
	"evidence_id" uuid,
	"detection_type" varchar(50) NOT NULL,
	"score_delta" integer NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fraud_scores" (
	"human_id" uuid PRIMARY KEY NOT NULL,
	"total_score" integer DEFAULT 0 NOT NULL,
	"phash_score" integer DEFAULT 0 NOT NULL,
	"velocity_score" integer DEFAULT 0 NOT NULL,
	"statistical_score" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'clean' NOT NULL,
	"flagged_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"last_scored_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "total_score_non_negative" CHECK ("fraud_scores"."total_score" >= 0)
);
--> statement-breakpoint
CREATE TABLE "evidence_phashes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL,
	"human_id" uuid NOT NULL,
	"phash" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "humans" ADD COLUMN "portfolio_visibility" "portfolio_visibility" DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_solution_id_solutions_id_fk" FOREIGN KEY ("solution_id") REFERENCES "public"."solutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_guardrail_evaluation_id_guardrail_evaluations_id_fk" FOREIGN KEY ("guardrail_evaluation_id") REFERENCES "public"."guardrail_evaluations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_claims" ADD CONSTRAINT "mission_claims_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_claims" ADD CONSTRAINT "mission_claims_human_id_humans_id_fk" FOREIGN KEY ("human_id") REFERENCES "public"."humans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_agents_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_receiver_id_agents_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_messages_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."messages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_claim_id_mission_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."mission_claims"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_submitted_by_human_id_humans_id_fk" FOREIGN KEY ("submitted_by_human_id") REFERENCES "public"."humans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_reward_transaction_id_token_transactions_id_fk" FOREIGN KEY ("reward_transaction_id") REFERENCES "public"."token_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_reviews" ADD CONSTRAINT "peer_reviews_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_reviews" ADD CONSTRAINT "peer_reviews_reviewer_human_id_humans_id_fk" FOREIGN KEY ("reviewer_human_id") REFERENCES "public"."humans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_reviews" ADD CONSTRAINT "peer_reviews_reward_transaction_id_token_transactions_id_fk" FOREIGN KEY ("reward_transaction_id") REFERENCES "public"."token_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_history" ADD CONSTRAINT "review_history_reviewer_human_id_humans_id_fk" FOREIGN KEY ("reviewer_human_id") REFERENCES "public"."humans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_history" ADD CONSTRAINT "review_history_submitter_human_id_humans_id_fk" FOREIGN KEY ("submitter_human_id") REFERENCES "public"."humans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_history" ADD CONSTRAINT "review_history_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_audit_log" ADD CONSTRAINT "verification_audit_log_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_audit_log" ADD CONSTRAINT "verification_audit_log_decided_by_human_id_humans_id_fk" FOREIGN KEY ("decided_by_human_id") REFERENCES "public"."humans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation_history" ADD CONSTRAINT "reputation_history_human_id_humans_id_fk" FOREIGN KEY ("human_id") REFERENCES "public"."humans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation_scores" ADD CONSTRAINT "reputation_scores_human_id_humans_id_fk" FOREIGN KEY ("human_id") REFERENCES "public"."humans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_human_id_humans_id_fk" FOREIGN KEY ("human_id") REFERENCES "public"."humans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endorsements" ADD CONSTRAINT "endorsements_from_human_id_humans_id_fk" FOREIGN KEY ("from_human_id") REFERENCES "public"."humans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endorsements" ADD CONSTRAINT "endorsements_to_human_id_humans_id_fk" FOREIGN KEY ("to_human_id") REFERENCES "public"."humans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_admin_actions" ADD CONSTRAINT "fraud_admin_actions_human_id_humans_id_fk" FOREIGN KEY ("human_id") REFERENCES "public"."humans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_events" ADD CONSTRAINT "fraud_events_human_id_humans_id_fk" FOREIGN KEY ("human_id") REFERENCES "public"."humans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_events" ADD CONSTRAINT "fraud_events_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_scores" ADD CONSTRAINT "fraud_scores_human_id_humans_id_fk" FOREIGN KEY ("human_id") REFERENCES "public"."humans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_phashes" ADD CONSTRAINT "evidence_phashes_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_phashes" ADD CONSTRAINT "evidence_phashes_human_id_humans_id_fk" FOREIGN KEY ("human_id") REFERENCES "public"."humans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_missions_solution_id" ON "missions" USING btree ("solution_id");--> statement-breakpoint
CREATE INDEX "idx_missions_created_by_agent" ON "missions" USING btree ("created_by_agent_id");--> statement-breakpoint
CREATE INDEX "idx_missions_status" ON "missions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_missions_domain" ON "missions" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "idx_missions_difficulty" ON "missions" USING btree ("difficulty");--> statement-breakpoint
CREATE INDEX "idx_missions_expires_at" ON "missions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_missions_skills" ON "missions" USING btree ("required_skills");--> statement-breakpoint
CREATE INDEX "idx_missions_marketplace" ON "missions" USING btree ("status","domain","difficulty","created_at");--> statement-breakpoint
CREATE INDEX "idx_claims_mission_id" ON "mission_claims" USING btree ("mission_id");--> statement-breakpoint
CREATE INDEX "idx_claims_human_id" ON "mission_claims" USING btree ("human_id");--> statement-breakpoint
CREATE INDEX "idx_claims_status" ON "mission_claims" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_claims_deadline" ON "mission_claims" USING btree ("deadline_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_claims_unique_active" ON "mission_claims" USING btree ("mission_id","human_id") WHERE "mission_claims"."status" = 'active';--> statement-breakpoint
CREATE INDEX "idx_messages_sender" ON "messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "idx_messages_receiver_created" ON "messages" USING btree ("receiver_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_messages_thread" ON "messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "idx_evidence_mission_id" ON "evidence" USING btree ("mission_id");--> statement-breakpoint
CREATE INDEX "idx_evidence_claim_id" ON "evidence" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "idx_evidence_human_id" ON "evidence" USING btree ("submitted_by_human_id");--> statement-breakpoint
CREATE INDEX "idx_evidence_stage" ON "evidence" USING btree ("verification_stage");--> statement-breakpoint
CREATE INDEX "idx_evidence_pending" ON "evidence" USING btree ("verification_stage","created_at");--> statement-breakpoint
CREATE INDEX "idx_evidence_peer_review" ON "evidence" USING btree ("verification_stage","created_at");--> statement-breakpoint
CREATE INDEX "idx_peer_reviews_evidence" ON "peer_reviews" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "idx_peer_reviews_reviewer" ON "peer_reviews" USING btree ("reviewer_human_id");--> statement-breakpoint
CREATE INDEX "idx_review_history_reviewer" ON "review_history" USING btree ("reviewer_human_id");--> statement-breakpoint
CREATE INDEX "idx_review_history_submitter" ON "review_history" USING btree ("submitter_human_id");--> statement-breakpoint
CREATE INDEX "idx_review_history_pair" ON "review_history" USING btree ("reviewer_human_id","submitter_human_id");--> statement-breakpoint
CREATE INDEX "idx_audit_evidence" ON "verification_audit_log" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "idx_audit_source" ON "verification_audit_log" USING btree ("decision_source");--> statement-breakpoint
CREATE INDEX "idx_audit_created" ON "verification_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_rep_history_human_created" ON "reputation_history" USING btree ("human_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_rep_history_event_type" ON "reputation_history" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_rep_history_created" ON "reputation_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_rep_scores_total" ON "reputation_scores" USING btree ("total_score");--> statement-breakpoint
CREATE INDEX "idx_rep_scores_tier" ON "reputation_scores" USING btree ("current_tier");--> statement-breakpoint
CREATE INDEX "idx_rep_scores_last_activity" ON "reputation_scores" USING btree ("last_activity_at");--> statement-breakpoint
CREATE INDEX "idx_streaks_current" ON "streaks" USING btree ("current_streak");--> statement-breakpoint
CREATE INDEX "idx_streaks_last_active" ON "streaks" USING btree ("last_active_date");--> statement-breakpoint
CREATE INDEX "idx_endorsements_to" ON "endorsements" USING btree ("to_human_id","status");--> statement-breakpoint
CREATE INDEX "idx_endorsements_from" ON "endorsements" USING btree ("from_human_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_endorsements_unique" ON "endorsements" USING btree ("from_human_id","to_human_id");--> statement-breakpoint
CREATE INDEX "idx_fraud_admin_human" ON "fraud_admin_actions" USING btree ("human_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_fraud_admin_admin" ON "fraud_admin_actions" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "idx_fraud_events_human" ON "fraud_events" USING btree ("human_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_fraud_events_type" ON "fraud_events" USING btree ("detection_type");--> statement-breakpoint
CREATE INDEX "idx_fraud_events_evidence" ON "fraud_events" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "idx_fraud_scores_total" ON "fraud_scores" USING btree ("total_score");--> statement-breakpoint
CREATE INDEX "idx_phashes_human" ON "evidence_phashes" USING btree ("human_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_phashes_hash" ON "evidence_phashes" USING btree ("phash");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_phashes_evidence" ON "evidence_phashes" USING btree ("evidence_id");