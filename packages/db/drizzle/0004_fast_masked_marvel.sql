CREATE TYPE "public"."transaction_type" AS ENUM('earn_orientation', 'earn_mission', 'earn_reward', 'earn_bonus', 'earn_referral', 'spend_vote', 'spend_circle', 'spend_analytics', 'spend_custom');--> statement-breakpoint
CREATE TABLE "human_profiles" (
	"human_id" uuid PRIMARY KEY NOT NULL,
	"skills" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"city" varchar(200),
	"country" varchar(100),
	"location" varchar(255),
	"service_radius" integer DEFAULT 10,
	"languages" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"availability" jsonb,
	"bio" text,
	"avatar_url" varchar(500),
	"wallet_address" varchar(100),
	"certifications" text[],
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"profile_completeness_score" integer DEFAULT 0 NOT NULL,
	"orientation_completed_at" timestamp with time zone,
	"total_missions_completed" integer DEFAULT 0 NOT NULL,
	"total_tokens_earned" integer DEFAULT 0 NOT NULL,
	"streak_days" integer DEFAULT 0 NOT NULL,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"human_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"balance_before" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"transaction_type" "transaction_type" NOT NULL,
	"reference_id" uuid,
	"reference_type" varchar(50),
	"description" text,
	"idempotency_key" varchar(64),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_token" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"refresh_token" varchar(255),
	"refresh_token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_session_token_unique" UNIQUE("session_token"),
	CONSTRAINT "sessions_refresh_token_unique" UNIQUE("refresh_token")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(50) NOT NULL,
	"provider_account_id" varchar(255) NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"token_type" varchar(50),
	"scope" varchar(500),
	"id_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" varchar(255) NOT NULL,
	"token" varchar(10) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"resend_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "humans" ADD COLUMN "oauth_provider" varchar(50);--> statement-breakpoint
ALTER TABLE "humans" ADD COLUMN "oauth_provider_id" varchar(255);--> statement-breakpoint
ALTER TABLE "humans" ADD COLUMN "avatar_url" varchar(500);--> statement-breakpoint
ALTER TABLE "humans" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "humans" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "human_profiles" ADD CONSTRAINT "human_profiles_human_id_humans_id_fk" FOREIGN KEY ("human_id") REFERENCES "public"."humans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_transactions" ADD CONSTRAINT "token_transactions_human_id_humans_id_fk" FOREIGN KEY ("human_id") REFERENCES "public"."humans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_humans_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."humans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_humans_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."humans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "human_profiles_skills_idx" ON "human_profiles" USING btree ("skills");--> statement-breakpoint
CREATE INDEX "human_profiles_completeness_idx" ON "human_profiles" USING btree ("profile_completeness_score");--> statement-breakpoint
CREATE INDEX "human_profiles_last_active_idx" ON "human_profiles" USING btree ("last_active_at");--> statement-breakpoint
CREATE INDEX "token_tx_human_created_idx" ON "token_transactions" USING btree ("human_id","created_at");--> statement-breakpoint
CREATE INDEX "token_tx_type_idx" ON "token_transactions" USING btree ("transaction_type");--> statement-breakpoint
CREATE INDEX "token_tx_reference_idx" ON "token_transactions" USING btree ("reference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "token_tx_idempotency_idx" ON "token_transactions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "accounts_provider_idx" ON "accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "humans_oauth_provider_idx" ON "humans" USING btree ("oauth_provider","oauth_provider_id");