ALTER TABLE "agents" ADD COLUMN "email" varchar(255);--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "claim_verification_code" varchar(10);--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "claim_verification_code_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "rate_limit_override" integer;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "previous_api_key_hash" varchar(255);--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "previous_api_key_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "agents_email_idx" ON "agents" USING btree ("email");