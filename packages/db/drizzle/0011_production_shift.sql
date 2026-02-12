CREATE TYPE "public"."agent_credit_type" AS ENUM('earn_validation', 'earn_validation_local', 'earn_validation_complexity', 'earn_validation_domain', 'earn_starter_grant', 'spend_conversion', 'spend_submission_problem', 'spend_submission_solution', 'spend_submission_debate');--> statement-breakpoint
CREATE TYPE "public"."attestation_status" AS ENUM('confirmed', 'resolved', 'not_found');--> statement-breakpoint
CREATE TYPE "public"."consensus_decision" AS ENUM('approved', 'rejected', 'escalated', 'expired');--> statement-breakpoint
CREATE TYPE "public"."dispute_status" AS ENUM('open', 'admin_review', 'upheld', 'overturned', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."geographic_scope" AS ENUM('global', 'country', 'city', 'neighborhood');--> statement-breakpoint
CREATE TYPE "public"."observation_type" AS ENUM('photo', 'video_still', 'text_report', 'audio_transcript');--> statement-breakpoint
CREATE TYPE "public"."observation_verification" AS ENUM('pending', 'gps_verified', 'vision_verified', 'rejected', 'fraud_flagged');--> statement-breakpoint
CREATE TYPE "public"."photo_sequence_type" AS ENUM('before', 'after', 'standalone');--> statement-breakpoint
CREATE TYPE "public"."privacy_processing_status" AS ENUM('pending', 'processing', 'completed', 'quarantined');--> statement-breakpoint
CREATE TYPE "public"."review_type" AS ENUM('evidence', 'observation', 'before_after');--> statement-breakpoint
CREATE TYPE "public"."routing_decision" AS ENUM('layer_b', 'peer_consensus');--> statement-breakpoint
CREATE TYPE "public"."validator_tier" AS ENUM('apprentice', 'journeyman', 'expert');--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'earn_review_mission' BEFORE 'spend_vote';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'earn_conversion_received' BEFORE 'spend_vote';--> statement-breakpoint
CREATE TABLE "validator_pool" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"tier" "validator_tier" DEFAULT 'apprentice' NOT NULL,
	"f1_score" numeric(5, 4) DEFAULT '0.0000' NOT NULL,
	"precision" numeric(5, 4) DEFAULT '0.0000' NOT NULL,
	"recall" numeric(5, 4) DEFAULT '0.0000' NOT NULL,
	"total_evaluations" integer DEFAULT 0 NOT NULL,
	"correct_evaluations" integer DEFAULT 0 NOT NULL,
	"domain_scores" jsonb DEFAULT '{}'::jsonb,
	"home_regions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"home_region_name" varchar(200),
	"home_region_point" "geography(Point, 4326)",
	"daily_evaluation_count" integer DEFAULT 0 NOT NULL,
	"daily_count_reset_at" timestamp with time zone,
	"last_assignment_at" timestamp with time zone,
	"last_response_at" timestamp with time zone,
	"response_rate" numeric(3, 2) DEFAULT '1.00' NOT NULL,
	"capabilities" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"suspended_until" timestamp with time zone,
	"suspension_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "peer_evaluations" (
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
	"safety_flagged" boolean DEFAULT false NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"reward_credit_transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "peer_eval_unique_submission_validator" UNIQUE("submission_id","validator_id")
);
--> statement-breakpoint
CREATE TABLE "consensus_results" (
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
	"was_early_consensus" boolean DEFAULT false NOT NULL,
	"escalation_reason" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consensus_unique_submission" UNIQUE("submission_id","submission_type")
);
--> statement-breakpoint
CREATE TABLE "agent_credit_transactions" (
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
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "balance_consistency" CHECK ("agent_credit_transactions"."balance_after" = "agent_credit_transactions"."balance_before" + "agent_credit_transactions"."amount")
);
--> statement-breakpoint
CREATE TABLE "credit_conversions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_credits_spent" integer NOT NULL,
	"agent_credit_transaction_id" uuid,
	"human_id" uuid NOT NULL,
	"impact_tokens_received" integer NOT NULL,
	"human_transaction_id" uuid,
	"conversion_rate" numeric(8, 4) NOT NULL,
	"rate_snapshot" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations" (
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
	"location_point" "geography(Point, 4326)",
	"submitted_by_human_id" uuid NOT NULL,
	"verification_status" "observation_verification" DEFAULT 'pending' NOT NULL,
	"verification_notes" text,
	"perceptual_hash" varchar(64),
	"privacy_processing_status" "privacy_processing_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "problem_clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"domain" "problem_domain" NOT NULL,
	"scope" "geographic_scope" NOT NULL,
	"centroid_point" "geography(Point, 4326)",
	"radius_meters" integer NOT NULL,
	"city" varchar(100),
	"member_problem_ids" uuid[] DEFAULT '{}' NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"total_observations" integer DEFAULT 0 NOT NULL,
	"distinct_reporters" integer DEFAULT 0 NOT NULL,
	"promoted_to_problem_id" uuid,
	"promoted_at" timestamp with time zone,
	"centroid_embedding" "halfvec(1024)",
	"is_active" boolean DEFAULT true NOT NULL,
	"last_aggregated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consensus_id" uuid NOT NULL,
	"challenger_agent_id" uuid NOT NULL,
	"stake_amount" integer DEFAULT 10 NOT NULL,
	"stake_credit_transaction_id" uuid,
	"reasoning" text NOT NULL,
	"status" "dispute_status" DEFAULT 'open' NOT NULL,
	"admin_reviewer_id" uuid,
	"admin_decision" varchar(20),
	"admin_notes" text,
	"resolved_at" timestamp with time zone,
	"stake_returned" boolean DEFAULT false NOT NULL,
	"bonus_paid" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "validator_tier_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"validator_id" uuid NOT NULL,
	"from_tier" "validator_tier" NOT NULL,
	"to_tier" "validator_tier" NOT NULL,
	"f1_score_at_change" numeric(5, 4) NOT NULL,
	"total_evaluations_at_change" integer NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spot_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"submission_type" "content_type" NOT NULL,
	"peer_decision" "consensus_decision" NOT NULL,
	"peer_confidence" numeric(3, 2) NOT NULL,
	"layer_b_decision" "guardrail_decision" NOT NULL,
	"layer_b_alignment_score" numeric(3, 2) NOT NULL,
	"agrees" boolean NOT NULL,
	"disagreement_type" varchar(50),
	"admin_reviewed" boolean DEFAULT false NOT NULL,
	"admin_verdict" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attestations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"problem_id" uuid NOT NULL,
	"human_id" uuid NOT NULL,
	"status_type" "attestation_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mission_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text NOT NULL,
	"domain" "problem_domain" NOT NULL,
	"difficulty_level" varchar(20) NOT NULL,
	"required_photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gps_radius_meters" integer NOT NULL,
	"completion_criteria" jsonb NOT NULL,
	"step_instructions" jsonb NOT NULL,
	"estimated_duration_minutes" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gps_radius_positive" CHECK ("mission_templates"."gps_radius_meters" > 0)
);
--> statement-breakpoint
CREATE TABLE "economic_health_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"total_faucet" integer NOT NULL,
	"total_sink" integer NOT NULL,
	"faucet_sink_ratio" numeric(5, 2) NOT NULL,
	"active_agents" integer NOT NULL,
	"hardship_count" integer NOT NULL,
	"hardship_rate" numeric(5, 4) NOT NULL,
	"median_balance" numeric(10, 2) NOT NULL,
	"total_validators" integer NOT NULL,
	"alert_triggered" boolean DEFAULT false NOT NULL,
	"alert_details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "peer_reviews" ALTER COLUMN "evidence_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "credit_balance" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "home_region_name" varchar(200);--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "home_region_point" "geography(Point, 4326)";--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "local_problems_reported" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "local_reputation_score" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "location_point" "geography(Point, 4326)";--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "local_urgency" varchar(20);--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "actionability" varchar(20);--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "radius_meters" integer;--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "observation_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "municipal_source_id" varchar(100);--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "municipal_source_type" varchar(50);--> statement-breakpoint
ALTER TABLE "guardrail_evaluations" ADD COLUMN "routing_decision" "routing_decision" DEFAULT 'layer_b' NOT NULL;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "pair_id" uuid;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "photo_sequence_type" "photo_sequence_type" DEFAULT 'standalone' NOT NULL;--> statement-breakpoint
ALTER TABLE "peer_reviews" ADD COLUMN "review_type" varchar(20) DEFAULT 'evidence' NOT NULL;--> statement-breakpoint
ALTER TABLE "peer_reviews" ADD COLUMN "observation_id" uuid;--> statement-breakpoint
ALTER TABLE "validator_pool" ADD CONSTRAINT "validator_pool_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_evaluations" ADD CONSTRAINT "peer_evaluations_validator_id_validator_pool_id_fk" FOREIGN KEY ("validator_id") REFERENCES "public"."validator_pool"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_evaluations" ADD CONSTRAINT "peer_evaluations_validator_agent_id_agents_id_fk" FOREIGN KEY ("validator_agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_credit_transactions" ADD CONSTRAINT "agent_credit_transactions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_conversions" ADD CONSTRAINT "credit_conversions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_conversions" ADD CONSTRAINT "credit_conversions_agent_credit_transaction_id_agent_credit_transactions_id_fk" FOREIGN KEY ("agent_credit_transaction_id") REFERENCES "public"."agent_credit_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_conversions" ADD CONSTRAINT "credit_conversions_human_id_humans_id_fk" FOREIGN KEY ("human_id") REFERENCES "public"."humans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_conversions" ADD CONSTRAINT "credit_conversions_human_transaction_id_token_transactions_id_fk" FOREIGN KEY ("human_transaction_id") REFERENCES "public"."token_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_submitted_by_human_id_humans_id_fk" FOREIGN KEY ("submitted_by_human_id") REFERENCES "public"."humans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_clusters" ADD CONSTRAINT "problem_clusters_promoted_to_problem_id_problems_id_fk" FOREIGN KEY ("promoted_to_problem_id") REFERENCES "public"."problems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_consensus_id_consensus_results_id_fk" FOREIGN KEY ("consensus_id") REFERENCES "public"."consensus_results"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_challenger_agent_id_agents_id_fk" FOREIGN KEY ("challenger_agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_stake_credit_transaction_id_agent_credit_transactions_id_fk" FOREIGN KEY ("stake_credit_transaction_id") REFERENCES "public"."agent_credit_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validator_tier_changes" ADD CONSTRAINT "validator_tier_changes_validator_id_validator_pool_id_fk" FOREIGN KEY ("validator_id") REFERENCES "public"."validator_pool"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_human_id_humans_id_fk" FOREIGN KEY ("human_id") REFERENCES "public"."humans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "validator_pool_agent_id_idx" ON "validator_pool" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "validator_pool_tier_idx" ON "validator_pool" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "validator_pool_f1_score_idx" ON "validator_pool" USING btree ("f1_score");--> statement-breakpoint
CREATE INDEX "validator_pool_is_active_idx" ON "validator_pool" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "peer_eval_submission_idx" ON "peer_evaluations" USING btree ("submission_id","submission_type");--> statement-breakpoint
CREATE INDEX "peer_eval_validator_idx" ON "peer_evaluations" USING btree ("validator_id");--> statement-breakpoint
CREATE INDEX "peer_eval_status_idx" ON "peer_evaluations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "peer_eval_agent_status_idx" ON "peer_evaluations" USING btree ("validator_agent_id","status");--> statement-breakpoint
CREATE INDEX "peer_eval_expires_idx" ON "peer_evaluations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "consensus_submission_idx" ON "consensus_results" USING btree ("submission_id","submission_type");--> statement-breakpoint
CREATE INDEX "consensus_decision_idx" ON "consensus_results" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "consensus_created_idx" ON "consensus_results" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_credit_tx_agent_created_idx" ON "agent_credit_transactions" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_credit_tx_type_idx" ON "agent_credit_transactions" USING btree ("transaction_type");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_credit_tx_idempotency_idx" ON "agent_credit_transactions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "credit_conv_agent_created_idx" ON "credit_conversions" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "credit_conv_human_created_idx" ON "credit_conversions" USING btree ("human_id","created_at");--> statement-breakpoint
CREATE INDEX "observations_problem_id_idx" ON "observations" USING btree ("problem_id");--> statement-breakpoint
CREATE INDEX "observations_human_id_idx" ON "observations" USING btree ("submitted_by_human_id");--> statement-breakpoint
CREATE INDEX "observations_verification_idx" ON "observations" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX "observations_created_at_idx" ON "observations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "observations_privacy_idx" ON "observations" USING btree ("privacy_processing_status") WHERE privacy_processing_status != 'completed';--> statement-breakpoint
CREATE INDEX "clusters_domain_idx" ON "problem_clusters" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "clusters_city_idx" ON "problem_clusters" USING btree ("city");--> statement-breakpoint
CREATE INDEX "clusters_is_active_idx" ON "problem_clusters" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "disputes_consensus_idx" ON "disputes" USING btree ("consensus_id");--> statement-breakpoint
CREATE INDEX "disputes_challenger_idx" ON "disputes" USING btree ("challenger_agent_id");--> statement-breakpoint
CREATE INDEX "disputes_status_idx" ON "disputes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tier_changes_validator_idx" ON "validator_tier_changes" USING btree ("validator_id","changed_at");--> statement-breakpoint
CREATE INDEX "spot_checks_submission_idx" ON "spot_checks" USING btree ("submission_id","submission_type");--> statement-breakpoint
CREATE INDEX "spot_checks_agrees_idx" ON "spot_checks" USING btree ("agrees") WHERE agrees = false;--> statement-breakpoint
CREATE INDEX "spot_checks_created_idx" ON "spot_checks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "attestations_problem_status_idx" ON "attestations" USING btree ("problem_id","status_type");--> statement-breakpoint
CREATE INDEX "attestations_human_idx" ON "attestations" USING btree ("human_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attestations_unique" ON "attestations" USING btree ("problem_id","human_id");--> statement-breakpoint
CREATE INDEX "mission_templates_domain_idx" ON "mission_templates" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "mission_templates_active_idx" ON "mission_templates" USING btree ("is_active") WHERE is_active = true;--> statement-breakpoint
CREATE INDEX "econ_health_created_idx" ON "economic_health_snapshots" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "econ_health_alert_idx" ON "economic_health_snapshots" USING btree ("alert_triggered") WHERE alert_triggered = true;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_template_id_mission_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."mission_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_reviews" ADD CONSTRAINT "peer_reviews_observation_id_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agents_credit_balance_idx" ON "agents" USING btree ("credit_balance");--> statement-breakpoint
CREATE INDEX "problems_geo_scope_urgency_idx" ON "problems" USING btree ("geographic_scope","local_urgency","created_at");--> statement-breakpoint
CREATE INDEX "problems_municipal_source_idx" ON "problems" USING btree ("municipal_source_type","municipal_source_id");--> statement-breakpoint
CREATE INDEX "problems_observation_count_idx" ON "problems" USING btree ("observation_count");--> statement-breakpoint
CREATE INDEX "guardrail_eval_routing_idx" ON "guardrail_evaluations" USING btree ("routing_decision");--> statement-breakpoint
CREATE INDEX "evidence_pair_idx" ON "evidence" USING btree ("pair_id") WHERE pair_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_peer_reviews_type" ON "peer_reviews" USING btree ("review_type");--> statement-breakpoint
CREATE INDEX "idx_peer_reviews_observation" ON "peer_reviews" USING btree ("observation_id");--> statement-breakpoint
ALTER TABLE "peer_reviews" ADD CONSTRAINT "has_review_target" CHECK ("peer_reviews"."evidence_id" IS NOT NULL OR "peer_reviews"."observation_id" IS NOT NULL);