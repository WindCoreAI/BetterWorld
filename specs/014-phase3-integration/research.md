# Research: Phase 3 Integration (Sprint 13)

**Branch**: `014-phase3-integration` | **Date**: 2026-02-13

## R1: Dispute Resolution — Credit Staking Pattern

**Decision**: Use existing double-entry credit transaction pattern with a new `spend_dispute_stake` / `earn_dispute_refund` / `earn_dispute_bonus` transaction types.

**Rationale**: The `agentCreditTransactions` table already supports atomic SELECT FOR UPDATE with `balance_before`/`balance_after` enforcement (Sprint 10). Adding dispute-specific transaction types maintains the same auditability and idempotency (via idempotency keys). The `disputes` table references the `consensus_results` entry being challenged, creating a clear audit trail.

**Alternatives considered**:
- Separate dispute escrow table: Rejected — over-engineering for the current scale. The existing credit transaction system handles stake/refund atomically.
- Inline dispute fields on consensus_results: Rejected — disputes are a separate lifecycle (filed → reviewed → resolved) with their own admin queue.

## R2: Dispute Suspension — Rolling Window Pattern

**Decision**: Use SQL `COUNT(*)` with `WHERE created_at > NOW() - INTERVAL '30 days' AND verdict = 'rejected'` to check suspension eligibility at dispute filing time. Store `disputeSuspendedUntil` on `validator_pool` table.

**Rationale**: Check-at-filing is simpler than maintaining a running counter. With expected low dispute volume (<100/month), the query is cheap. The suspension timestamp on `validator_pool` allows fast lookup without re-querying dispute history.

**Alternatives considered**:
- Redis counter with TTL window: Rejected — dispute filing is infrequent, DB query is fine. Redis adds unnecessary complexity.
- BullMQ delayed job to lift suspension: Rejected — simply checking `suspended_until < NOW()` at filing time is simpler and stateless.

## R3: Dynamic Rate Adjustment — Weekly Cron Strategy

**Decision**: BullMQ repeatable job running weekly (Sunday midnight UTC, `0 0 * * 0`). Calculates trailing 7-day faucet/sink ratio from `agentCreditTransactions`, applies ±10% adjustment (capped at 20%), and stores result in `rate_adjustments` table. Current multipliers stored in Redis feature flags (`SUBMISSION_COST_MULTIPLIER`, `VALIDATION_REWARD_MULTIPLIER`).

**Rationale**: Weekly cadence provides stability — daily would be too reactive to short-term fluctuations. Using existing feature flag infrastructure means the adjusted rates take effect immediately across all services that read these flags. The `rate_adjustments` table provides audit history.

**Alternatives considered**:
- Daily adjustment with smaller steps: Rejected — creates oscillation risk. Weekly provides natural dampening.
- Storing rates in DB instead of Redis flags: Rejected — all services already read feature flags from Redis. Adding a DB lookup would require refactoring the cost/reward services.
- ML-based prediction: Rejected — over-engineering. Simple proportional control (10% step) is predictable and auditable.

## R4: Circuit Breaker — Consecutive Day Tracking

**Decision**: Store daily faucet/sink ratio in Redis sorted set (`circuit:ratio:daily`, score = timestamp, value = ratio). Circuit breaker activates when the last 3 entries all exceed 2.0. When activated, set feature flag `RATE_ADJUSTMENT_PAUSED = true` and trigger admin webhook alert.

**Rationale**: Redis sorted set with timestamp scores provides efficient window queries. The 3-day consecutive requirement prevents false positives from single anomalous days. Admin webhook ensures human awareness.

**Alternatives considered**:
- Database-only tracking: Works but Redis sorted sets are purpose-built for time-series windows.
- Immediate pause on first breach: Too aggressive — single spikes shouldn't halt the system.

## R5: Evidence Review Economy — Capability-Based Assignment

**Decision**: Add `capabilities` JSONB field to `validator_pool` table (e.g., `["vision", "document_review", "geo_verification"]`). When evidence contains photos, filter candidates by `capabilities @> '["vision"]'::jsonb`. Fall back to AI-assisted review if fewer than 3 capable validators available.

**Rationale**: JSONB array with containment operator is PostgreSQL-native and efficient with GIN index. The existing evaluation assignment service already handles candidate filtering and can be extended with a capabilities check.

**Alternatives considered**:
- Separate capabilities table (many-to-many): Rejected — JSONB is simpler for a small fixed set of capabilities.
- Assume all validators can review evidence: Rejected — photo evidence genuinely requires different skills than text content evaluation.

## R6: Domain Specialization — Per-Domain F1 Tracking

**Decision**: Extend existing `validator_pool.domain_scores` JSONB field to track per-domain `{ evaluations: number, correct: number, f1: number, specialist: boolean, designatedAt: Date | null }`. Updated after each evaluation via the existing `updateValidatorMetrics()` flow in `f1-tracker.ts`. Specialist designation at F1 ≥ 0.90 with 50+ evaluations; revocation at F1 < 0.85 with 10-evaluation grace period.

**Rationale**: The `domain_scores` JSONB field already exists on `validator_pool` (Sprint 10). Extending its schema avoids a new table and keeps all validator metrics co-located. The F1 tracker already runs after every consensus — adding domain-level tracking is a natural extension.

**Alternatives considered**:
- Separate `domain_specializations` table: Rejected — adds a JOIN to every consensus computation. JSONB avoids this.
- Global F1 only (no per-domain): Rejected — spec requires domain-specific specialist designation.

## R7: Hybrid Quorum — PostGIS Distance Query

**Decision**: Modify `assignValidators()` to split candidates into local (<50km via `ST_DWithin`) and global pools when `geographicScope` is 'city' or 'neighborhood'. Select 2 from local pool (if available), 1 from global. If <2 local available, fall back to 3 global. Use existing `home_region_point` PostGIS geography field on `validator_pool`.

**Rationale**: The existing assignment service already partitions by local/non-local using ST_DWithin at 100km (Sprint 11). Narrowing to 50km and enforcing a 2+1 composition is a parameter change + selection logic update, not a new system. The existing spatial index on `home_region_point` supports this efficiently.

**Alternatives considered**:
- Haversine formula instead of PostGIS: Rejected — PostGIS `ST_DWithin` is already used in Sprint 11 and is more efficient with GIST index.
- Fixed local pool size: Rejected — graceful degradation to all-global is essential for areas with sparse validators.

## R8: Local Validator Reward Bonus — Reward Multiplier

**Decision**: Modify `distributeRewards()` in `validation-reward.service.ts` to check if each validator's `home_region_point` is within 50km of the submission's location. If local, multiply the tier reward by 1.5x. Track as `earn_validation_local` transaction type (already exists in enum).

**Rationale**: The `earn_validation_local` transaction type already exists in `agentCreditTypeEnum` (Sprint 10). The reward distribution function already iterates over completed evaluations — adding a distance check per validator is minimal overhead. Location data is available from the problem/submission record.

**Alternatives considered**:
- Separate bonus transaction: Rejected — single transaction with the local rate is simpler and more atomic.
- Flat bonus instead of multiplier: Rejected — spec requires 1.5x multiplier tied to tier.

## R9: Pattern Aggregation — Clustering Algorithm

**Decision**: Daily BullMQ cron job. Algorithm:
1. Fetch hyperlocal problems (city/neighborhood scope) from the last 30 days.
2. Group by domain + city.
3. Within each group, compute pairwise PostGIS distance (`ST_Distance`).
4. Form clusters where problems are within 1km of the cluster centroid.
5. For description similarity, use pgvector cosine distance on existing `embedding` column (threshold 0.85).
6. Clusters with ≥5 members are flagged as systemic issues.
7. Generate summary via Claude Sonnet tool_use.

**Rationale**: The `problem_clusters` table already exists (Sprint 10) with `centroidPoint`, `memberProblemIds`, `memberCount`, and `centroidEmbedding` fields. The algorithm leverages existing PostGIS spatial queries and pgvector embeddings. Claude Sonnet generates human-readable summaries.

**Alternatives considered**:
- DBSCAN clustering: More sophisticated but requires a Python library or custom implementation. Simple centroid-based clustering is sufficient for <10K problems.
- Real-time clustering on insert: Rejected — daily batch is simpler and avoids performance impact on submission flow.

## R10: Denver Open311 — City Configuration

**Decision**: Add Denver to `OPEN311_CITY_CONFIGS` in `packages/shared/src/constants/phase3.ts` with endpoint URL (placeholder pending verification: `https://www.denvergov.org/open311/v2`), category mappings for potholes, streetlights, graffiti, illegal dumping, population 715,522 (US Census 2024 estimate).

**Rationale**: The Open311 ingestion pipeline is already generalized for multi-city support (Sprint 10). Adding Denver is a configuration entry + service code mapping. The existing `municipal-ingest` worker handles repeatable jobs per city.

**Alternatives considered**:
- Custom Denver API adapter: Rejected — Denver follows GeoReport v2 standard, same as Chicago.
- Manual Denver data import: Rejected — automated ingestion is the platform's value proposition.

## R11: Cross-City Dashboard — Comparative Metrics

**Decision**: New service `cross-city.service.ts` that queries per-city problem counts, observation counts, resolution times, and validator counts. Population data stored as a constant in city configs for per-capita normalization. API returns all cities in a single response for side-by-side rendering.

**Rationale**: City data is already partitioned (problems have `city` field from Open311 ingestion). Aggregation queries using GROUP BY city are efficient. Population constants avoid the need for external API calls.

**Alternatives considered**:
- Per-city API calls from frontend: Rejected — N+1 requests. Single aggregated endpoint is more efficient.
- Redis-cached dashboard: Could add later if query becomes slow. For 3 cities, direct DB query is fine.

## R12: Offline PWA — Service Worker Strategy

**Decision**: Use Workbox (via `next-pwa` or manual registration) for the service worker. Strategies:
- **Navigation**: NetworkFirst (try network, fall back to cached shell)
- **API reads**: StaleWhileRevalidate for problem lists (cache first, update in background)
- **Observation submission**: Background Sync API. Store pending observations in IndexedDB (`idb-keyval` library). Retry with exponential backoff on connectivity restoration.
- **Photos**: Cache in IndexedDB alongside observation data.
- **Manifest**: Standard PWA manifest with BetterWorld branding and icons.

**Rationale**: Workbox is the industry standard for service worker management. Background Sync API is purpose-built for offline-first form submissions. IndexedDB provides persistent local storage that survives browser restarts and logouts (as required by FR-040).

**Alternatives considered**:
- Custom service worker without Workbox: Rejected — Workbox abstracts browser differences and provides battle-tested caching strategies.
- localStorage for offline queue: Rejected — 5MB limit is too small for photos. IndexedDB supports blobs.
- Native app (React Native): Rejected — spec explicitly scopes to PWA. Native app is out of scope.

## R13: Performance Optimization — Spatial Indexes

**Decision**: Add PostGIS GIST indexes on `validator_pool.home_region_point` and `problems.location_point`. Add Redis cache for validator locations (1hr TTL, key `validator:locations:{tier}`). Batch-fetch validator distances in a single PostGIS query instead of per-validator checks.

**Rationale**: The consensus p95 target drops from 15s to 10s. Current per-validator ST_DWithin checks are N queries. A single query with `ST_DWithin` filter and ORDER BY distance reduces to 1 query. Redis caching avoids repeated spatial lookups for the same validator pool.

**Alternatives considered**:
- In-memory Haversine: Faster but loses PostGIS accuracy for geographic projection. Not recommended for production.
- Pre-computed distance matrix: Over-engineering — only needed at much larger scale (10K+ validators).
