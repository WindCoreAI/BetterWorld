-- Sprint 20: Security Hardening — Migration
-- Creates deletion_request_status enum and account_deletion_requests table

-- 1. Create enum for deletion request status
DO $$ BEGIN
  CREATE TYPE "public"."deletion_request_status" AS ENUM('pending', 'cancelled', 'completed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Create account_deletion_requests table
CREATE TABLE IF NOT EXISTS "account_deletion_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "human_id" uuid NOT NULL,
  "status" "deletion_request_status" DEFAULT 'pending' NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "cooling_off_expires_at" timestamp with time zone NOT NULL,
  "cancelled_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "anonymized_identifier" varchar(12),
  "deletion_log" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- 3. Add foreign key constraint
DO $$ BEGIN
  ALTER TABLE "account_deletion_requests"
    ADD CONSTRAINT "account_deletion_requests_human_id_humans_id_fk"
    FOREIGN KEY ("human_id") REFERENCES "public"."humans"("id")
    ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 4. Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS "idx_deletion_requests_human_pending"
  ON "account_deletion_requests" ("human_id")
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS "idx_deletion_requests_status_expires"
  ON "account_deletion_requests" ("status", "cooling_off_expires_at")
  WHERE status = 'pending';
