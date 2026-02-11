-- Fix: Replace btree index on skills array with GIN index
-- btree only supports equality on the entire array, while GIN supports @> (array containment) queries
DROP INDEX IF EXISTS "human_profiles_skills_idx";--> statement-breakpoint
CREATE INDEX "human_profiles_skills_idx" ON "human_profiles" USING gin ("skills");
