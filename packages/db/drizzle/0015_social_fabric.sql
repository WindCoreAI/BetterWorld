-- Sprint 16: Social Fabric Foundation
-- 4 new enums, 2 enum value additions, 5 new tables

-- Step 1: Create new enums
CREATE TYPE "connection_status" AS ENUM ('pending', 'accepted', 'declined');
CREATE TYPE "notification_type" AS ENUM ('streak_warning', 'milestone', 'cheer', 'celebration', 'comeback', 'reply', 'connection_request', 'connection_accepted', 'follow');
CREATE TYPE "discussion_scope_type" AS ENUM ('domain', 'city');
CREATE TYPE "care_moment_type" AS ENUM ('cheer', 'celebrate');

-- Step 2: Add new values to existing enums
ALTER TYPE "transaction_type" ADD VALUE 'spend_cheer';
ALTER TYPE "transaction_type" ADD VALUE 'spend_celebrate';
ALTER TYPE "content_type" ADD VALUE 'discussion_thread';
ALTER TYPE "content_type" ADD VALUE 'discussion_reply';

-- Step 3: Create follows table
CREATE TABLE "follows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "follower_human_id" uuid NOT NULL REFERENCES "humans"("id") ON DELETE CASCADE,
  "following_human_id" uuid NOT NULL REFERENCES "humans"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "no_self_follow" CHECK ("follower_human_id" != "following_human_id")
);

CREATE INDEX "idx_follows_follower" ON "follows" ("follower_human_id");
CREATE INDEX "idx_follows_following" ON "follows" ("following_human_id");
CREATE UNIQUE INDEX "idx_follows_unique" ON "follows" ("follower_human_id", "following_human_id");

-- Step 4: Create connections table
CREATE TABLE "connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "requester_human_id" uuid NOT NULL REFERENCES "humans"("id") ON DELETE CASCADE,
  "recipient_human_id" uuid NOT NULL REFERENCES "humans"("id") ON DELETE CASCADE,
  "status" "connection_status" DEFAULT 'pending' NOT NULL,
  "shared_domains" text[] DEFAULT ARRAY[]::text[] NOT NULL,
  "interaction_count" integer DEFAULT 0 NOT NULL,
  "first_interaction_at" timestamp with time zone,
  "declined_at" timestamp with time zone,
  "accepted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "no_self_connection" CHECK ("requester_human_id" != "recipient_human_id")
);

CREATE INDEX "idx_connections_requester_status" ON "connections" ("requester_human_id");
CREATE INDEX "idx_connections_recipient_status" ON "connections" ("recipient_human_id");
CREATE INDEX "idx_connections_recipient_pending" ON "connections" ("recipient_human_id");
CREATE UNIQUE INDEX "idx_connections_unique" ON "connections" ("requester_human_id", "recipient_human_id");

-- Step 5: Create discussion_threads table
CREATE TABLE "discussion_threads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope_type" "discussion_scope_type" NOT NULL,
  "scope_value" varchar(100) NOT NULL,
  "author_human_id" uuid NOT NULL REFERENCES "humans"("id") ON DELETE RESTRICT,
  "title" varchar(200) NOT NULL,
  "content" text NOT NULL,
  "guardrail_status" "guardrail_status" DEFAULT 'pending' NOT NULL,
  "guardrail_evaluation_id" uuid REFERENCES "guardrail_evaluations"("id"),
  "reply_count" integer DEFAULT 0 NOT NULL,
  "last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "idx_threads_scope_activity" ON "discussion_threads" ("scope_type", "scope_value", "last_activity_at");
CREATE INDEX "idx_threads_author" ON "discussion_threads" ("author_human_id");
CREATE INDEX "idx_threads_created" ON "discussion_threads" ("created_at");

-- Step 6: Create discussion_replies table
CREATE TABLE "discussion_replies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "thread_id" uuid NOT NULL REFERENCES "discussion_threads"("id") ON DELETE CASCADE,
  "author_human_id" uuid NOT NULL REFERENCES "humans"("id") ON DELETE RESTRICT,
  "content" text NOT NULL,
  "guardrail_status" "guardrail_status" DEFAULT 'pending' NOT NULL,
  "guardrail_evaluation_id" uuid REFERENCES "guardrail_evaluations"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "idx_replies_thread_created" ON "discussion_replies" ("thread_id", "created_at");
CREATE INDEX "idx_replies_author" ON "discussion_replies" ("author_human_id");

-- Step 7: Create notifications table
CREATE TABLE "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recipient_human_id" uuid NOT NULL REFERENCES "humans"("id") ON DELETE CASCADE,
  "type" "notification_type" NOT NULL,
  "reference_id" uuid,
  "reference_type" varchar(50),
  "actor_human_id" uuid REFERENCES "humans"("id") ON DELETE SET NULL,
  "message" text NOT NULL,
  "aggregation_key" varchar(100),
  "aggregation_count" integer DEFAULT 1 NOT NULL,
  "is_read" boolean DEFAULT false NOT NULL,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "idx_notifications_recipient_unread" ON "notifications" ("recipient_human_id", "is_read");
CREATE INDEX "idx_notifications_recipient_created" ON "notifications" ("recipient_human_id", "created_at");
CREATE INDEX "idx_notifications_aggregation" ON "notifications" ("aggregation_key");
