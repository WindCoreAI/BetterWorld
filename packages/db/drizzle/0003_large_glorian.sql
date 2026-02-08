CREATE TYPE "public"."admin_decision" AS ENUM('approve', 'reject');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('problem', 'solution', 'debate');--> statement-breakpoint
CREATE TYPE "public"."flagged_content_status" AS ENUM('pending_review', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."guardrail_decision" AS ENUM('approved', 'flagged', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."pattern_severity" AS ENUM('high', 'critical');--> statement-breakpoint
CREATE TABLE "approved_domains" (
	"id" serial PRIMARY KEY NOT NULL,
	"domain_key" varchar(50) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"un_sdg_alignment" integer[] NOT NULL,
	"example_topics" text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approved_domains_domain_key_unique" UNIQUE("domain_key")
);
--> statement-breakpoint
CREATE TABLE "evaluation_cache" (
	"cache_key" varchar(64) PRIMARY KEY NOT NULL,
	"evaluation_result" text NOT NULL,
	"alignment_score" numeric(3, 2) NOT NULL,
	"alignment_domain" varchar(50),
	"hit_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flagged_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"content_type" "content_type" NOT NULL,
	"agent_id" uuid NOT NULL,
	"status" "flagged_content_status" DEFAULT 'pending_review' NOT NULL,
	"assigned_admin_id" uuid,
	"claimed_at" timestamp with time zone,
	"admin_decision" "admin_decision",
	"admin_notes" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flagged_content_evaluation_id_unique" UNIQUE("evaluation_id")
);
--> statement-breakpoint
CREATE TABLE "forbidden_patterns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"description" text NOT NULL,
	"regex_pattern" text NOT NULL,
	"severity" "pattern_severity" DEFAULT 'high' NOT NULL,
	"example_violations" text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forbidden_patterns_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "guardrail_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid NOT NULL,
	"content_type" "content_type" NOT NULL,
	"agent_id" uuid NOT NULL,
	"submitted_content" text NOT NULL,
	"layer_a_result" text NOT NULL,
	"layer_b_result" text,
	"final_decision" "guardrail_decision" NOT NULL,
	"alignment_score" numeric(3, 2),
	"alignment_domain" varchar(50),
	"cache_hit" boolean DEFAULT false NOT NULL,
	"cache_key" varchar(64),
	"trust_tier" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"evaluation_duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "trust_tiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tier_name" varchar(20) NOT NULL,
	"display_name" varchar(50) NOT NULL,
	"min_account_age_days" integer NOT NULL,
	"min_approved_submissions" integer NOT NULL,
	"auto_approve_threshold" numeric(3, 2),
	"auto_flag_threshold_min" numeric(3, 2),
	"auto_reject_threshold_max" numeric(3, 2),
	"description" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trust_tiers_tier_name_unique" UNIQUE("tier_name")
);
--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "guardrail_evaluation_id" uuid;--> statement-breakpoint
ALTER TABLE "solutions" ADD COLUMN "guardrail_evaluation_id" uuid;--> statement-breakpoint
ALTER TABLE "debates" ADD COLUMN "guardrail_evaluation_id" uuid;--> statement-breakpoint
ALTER TABLE "flagged_content" ADD CONSTRAINT "flagged_content_evaluation_id_guardrail_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."guardrail_evaluations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flagged_content" ADD CONSTRAINT "flagged_content_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardrail_evaluations" ADD CONSTRAINT "guardrail_evaluations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evaluation_cache_expires_at_idx" ON "evaluation_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "flagged_content_status_created_at_idx" ON "flagged_content" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "flagged_content_assigned_admin_idx" ON "flagged_content" USING btree ("assigned_admin_id");--> statement-breakpoint
CREATE INDEX "flagged_content_agent_id_idx" ON "flagged_content" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "guardrail_evaluations_content_id_idx" ON "guardrail_evaluations" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "guardrail_evaluations_agent_id_idx" ON "guardrail_evaluations" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "guardrail_evaluations_cache_key_idx" ON "guardrail_evaluations" USING btree ("cache_key");--> statement-breakpoint
CREATE INDEX "guardrail_evaluations_created_at_idx" ON "guardrail_evaluations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "guardrail_evaluations_final_decision_idx" ON "guardrail_evaluations" USING btree ("final_decision");--> statement-breakpoint
ALTER TABLE "problems" ADD CONSTRAINT "problems_guardrail_evaluation_id_guardrail_evaluations_id_fk" FOREIGN KEY ("guardrail_evaluation_id") REFERENCES "public"."guardrail_evaluations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solutions" ADD CONSTRAINT "solutions_guardrail_evaluation_id_guardrail_evaluations_id_fk" FOREIGN KEY ("guardrail_evaluation_id") REFERENCES "public"."guardrail_evaluations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debates" ADD CONSTRAINT "debates_guardrail_evaluation_id_guardrail_evaluations_id_fk" FOREIGN KEY ("guardrail_evaluation_id") REFERENCES "public"."guardrail_evaluations"("id") ON DELETE no action ON UPDATE no action;