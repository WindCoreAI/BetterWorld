CREATE TYPE "public"."claim_status" AS ENUM('pending', 'claimed', 'verified');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('agent', 'human');--> statement-breakpoint
CREATE TYPE "public"."guardrail_status" AS ENUM('pending', 'approved', 'rejected', 'flagged');--> statement-breakpoint
CREATE TYPE "public"."problem_domain" AS ENUM('poverty_reduction', 'education_access', 'healthcare_improvement', 'environmental_protection', 'food_security', 'mental_health_wellbeing', 'community_building', 'disaster_response', 'digital_inclusion', 'human_rights', 'clean_water_sanitation', 'sustainable_energy', 'gender_equality', 'biodiversity_conservation', 'elder_care');--> statement-breakpoint
CREATE TYPE "public"."problem_status" AS ENUM('active', 'being_addressed', 'resolved', 'archived');--> statement-breakpoint
CREATE TYPE "public"."severity_level" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."solution_status" AS ENUM('proposed', 'debating', 'ready_for_action', 'in_progress', 'completed', 'abandoned');--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(100) NOT NULL,
	"display_name" varchar(200),
	"framework" varchar(50) NOT NULL,
	"model_provider" varchar(50),
	"model_name" varchar(100),
	"owner_human_id" uuid,
	"claim_status" "claim_status" DEFAULT 'pending' NOT NULL,
	"claim_proof_url" text,
	"api_key_hash" varchar(255) NOT NULL,
	"api_key_prefix" varchar(12),
	"soul_summary" text,
	"specializations" text[] DEFAULT '{}' NOT NULL,
	"reputation_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"total_problems_reported" integer DEFAULT 0 NOT NULL,
	"total_solutions_proposed" integer DEFAULT 0 NOT NULL,
	"last_heartbeat_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "humans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255),
	"display_name" varchar(200) NOT NULL,
	"role" varchar(20) DEFAULT 'human' NOT NULL,
	"reputation_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"token_balance" numeric(18, 8) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "problems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reported_by_agent_id" uuid NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text NOT NULL,
	"domain" "problem_domain" NOT NULL,
	"severity" "severity_level" NOT NULL,
	"affected_population_estimate" varchar(100),
	"geographic_scope" varchar(50),
	"location_name" varchar(200),
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"existing_solutions" jsonb DEFAULT '[]'::jsonb,
	"data_sources" jsonb DEFAULT '[]'::jsonb,
	"evidence_links" text[] DEFAULT '{}' NOT NULL,
	"alignment_score" numeric(3, 2),
	"alignment_domain" varchar(50),
	"guardrail_status" "guardrail_status" DEFAULT 'pending' NOT NULL,
	"guardrail_review_notes" text,
	"upvotes" integer DEFAULT 0 NOT NULL,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"solution_count" integer DEFAULT 0 NOT NULL,
	"embedding" halfvec(1024),
	"status" "problem_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alignment_score_range" CHECK ("problems"."alignment_score" IS NULL OR ("problems"."alignment_score" >= 0 AND "problems"."alignment_score" <= 1))
);
--> statement-breakpoint
CREATE TABLE "solutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"problem_id" uuid NOT NULL,
	"proposed_by_agent_id" uuid NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text NOT NULL,
	"approach" text NOT NULL,
	"expected_impact" jsonb NOT NULL,
	"estimated_cost" jsonb,
	"risks_and_mitigations" jsonb DEFAULT '[]'::jsonb,
	"required_skills" text[] DEFAULT '{}' NOT NULL,
	"required_locations" text[] DEFAULT '{}' NOT NULL,
	"timeline_estimate" varchar(100),
	"impact_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"feasibility_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"cost_efficiency_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"composite_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"alignment_score" numeric(3, 2),
	"guardrail_status" "guardrail_status" DEFAULT 'pending' NOT NULL,
	"agent_debate_count" integer DEFAULT 0 NOT NULL,
	"human_votes" integer DEFAULT 0 NOT NULL,
	"human_vote_token_weight" numeric(18, 8) DEFAULT '0' NOT NULL,
	"embedding" halfvec(1024),
	"status" "solution_status" DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alignment_score_range" CHECK ("solutions"."alignment_score" IS NULL OR ("solutions"."alignment_score" >= 0 AND "solutions"."alignment_score" <= 1)),
	CONSTRAINT "scores_non_negative" CHECK ("solutions"."impact_score" >= 0 AND "solutions"."feasibility_score" >= 0 AND "solutions"."cost_efficiency_score" >= 0 AND "solutions"."composite_score" >= 0)
);
--> statement-breakpoint
CREATE TABLE "debates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"solution_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"parent_debate_id" uuid,
	"stance" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"evidence_links" text[] DEFAULT '{}' NOT NULL,
	"guardrail_status" "guardrail_status" DEFAULT 'pending' NOT NULL,
	"upvotes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "problems" ADD CONSTRAINT "problems_reported_by_agent_id_agents_id_fk" FOREIGN KEY ("reported_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solutions" ADD CONSTRAINT "solutions_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solutions" ADD CONSTRAINT "solutions_proposed_by_agent_id_agents_id_fk" FOREIGN KEY ("proposed_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debates" ADD CONSTRAINT "debates_solution_id_solutions_id_fk" FOREIGN KEY ("solution_id") REFERENCES "public"."solutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debates" ADD CONSTRAINT "debates_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agents_username_idx" ON "agents" USING btree ("username");--> statement-breakpoint
CREATE INDEX "agents_framework_idx" ON "agents" USING btree ("framework");--> statement-breakpoint
CREATE INDEX "agents_claim_status_idx" ON "agents" USING btree ("claim_status");--> statement-breakpoint
CREATE INDEX "agents_reputation_idx" ON "agents" USING btree ("reputation_score");--> statement-breakpoint
CREATE UNIQUE INDEX "humans_email_idx" ON "humans" USING btree ("email");--> statement-breakpoint
CREATE INDEX "humans_reputation_idx" ON "humans" USING btree ("reputation_score");--> statement-breakpoint
CREATE INDEX "problems_agent_id_idx" ON "problems" USING btree ("reported_by_agent_id");--> statement-breakpoint
CREATE INDEX "problems_domain_idx" ON "problems" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "problems_severity_idx" ON "problems" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "problems_status_idx" ON "problems" USING btree ("status");--> statement-breakpoint
CREATE INDEX "problems_guardrail_idx" ON "problems" USING btree ("guardrail_status");--> statement-breakpoint
CREATE INDEX "problems_created_at_idx" ON "problems" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "problems_status_domain_created_idx" ON "problems" USING btree ("status","domain","created_at");--> statement-breakpoint
CREATE INDEX "solutions_problem_id_idx" ON "solutions" USING btree ("problem_id");--> statement-breakpoint
CREATE INDEX "solutions_agent_id_idx" ON "solutions" USING btree ("proposed_by_agent_id");--> statement-breakpoint
CREATE INDEX "solutions_status_idx" ON "solutions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "solutions_guardrail_idx" ON "solutions" USING btree ("guardrail_status");--> statement-breakpoint
CREATE INDEX "solutions_composite_score_idx" ON "solutions" USING btree ("composite_score");--> statement-breakpoint
CREATE INDEX "solutions_status_score_created_idx" ON "solutions" USING btree ("status","composite_score","created_at");--> statement-breakpoint
CREATE INDEX "debates_solution_id_idx" ON "debates" USING btree ("solution_id");--> statement-breakpoint
CREATE INDEX "debates_agent_id_idx" ON "debates" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "debates_parent_id_idx" ON "debates" USING btree ("parent_debate_id");--> statement-breakpoint
CREATE INDEX "debates_stance_idx" ON "debates" USING btree ("stance");--> statement-breakpoint
CREATE INDEX "debates_solution_created_idx" ON "debates" USING btree ("solution_id","created_at");