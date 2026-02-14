-- Sprint 15: Add composite index on peer_reviews(observation_id, review_type) for efficient lookups
-- Queries filtering by both observation_id and review_type (e.g., evidence review economy
-- assignment checks) will benefit from this composite index instead of scanning two separate indexes.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_peer_reviews_observation_type"
  ON "peer_reviews" ("observation_id", "review_type");
