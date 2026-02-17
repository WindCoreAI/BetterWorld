-- Sprint 19: Human-First Agent Onboarding
-- Add foreign key constraint and index for agent ownership

-- Add foreign key constraint (ON DELETE RESTRICT prevents human deletion while agents exist)
DO $$ BEGIN
 ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_human_id_fk" FOREIGN KEY ("owner_human_id") REFERENCES "public"."humans"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Add index for ownership queries (listByOwner)
CREATE INDEX IF NOT EXISTS "agents_owner_human_id_idx" ON "agents" USING btree ("owner_human_id");
