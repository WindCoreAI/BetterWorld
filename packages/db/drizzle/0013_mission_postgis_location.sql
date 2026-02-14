-- Sprint 15: Add PostGIS geography column to missions table for efficient geo-search (FR-005)
-- Replaces Haversine formula with ST_DWithin for radius queries

-- Step 1: Add geography(Point, 4326) column
ALTER TABLE "missions" ADD COLUMN IF NOT EXISTS "location" geography(Point, 4326);

-- Step 2: Backfill from existing requiredLatitude/requiredLongitude columns
UPDATE missions
SET location = ST_MakePoint(
  CAST(required_longitude AS double precision),
  CAST(required_latitude AS double precision)
)::geography
WHERE required_latitude IS NOT NULL
  AND required_longitude IS NOT NULL
  AND location IS NULL;

-- Step 3: Create GIST index for efficient spatial queries
CREATE INDEX IF NOT EXISTS "idx_missions_location" ON "missions" USING GIST ("location");
