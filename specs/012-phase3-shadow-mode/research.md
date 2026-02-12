# Research: Phase 3 Sprint 11 — Shadow Mode

**Feature Branch**: `012-phase3-shadow-mode`
**Date**: 2026-02-11

## R1: Shadow Pipeline Integration Point

**Decision**: Extend the existing guardrail worker (`guardrail-worker.ts`) to dispatch a parallel peer consensus job after Layer B evaluation completes, gated by the `PEER_VALIDATION_ENABLED` feature flag.

**Rationale**: The guardrail worker already processes every submission. After the Layer B decision is recorded (line ~263), we add a non-blocking call to enqueue a peer consensus job on a new `PEER_CONSENSUS` BullMQ queue. This keeps the existing Layer B flow untouched — the peer consensus runs asynchronously and writes to `consensus_results` when complete. The Layer B decision is passed to the consensus job so it can be stored in `layer_b_decision` for comparison.

**Alternatives considered**:
- **Inline peer evaluation in guardrail worker**: Rejected — consensus requires waiting for validator responses (up to 30 min), which would block the guardrail worker.
- **Separate trigger from API routes**: Rejected — would require hooking into every content creation route; the guardrail worker is the single point of truth for all submissions.
- **Event-driven via Redis pub/sub**: Rejected — BullMQ already provides reliable job delivery with retries; adding pub/sub would duplicate infrastructure.

## R2: Consensus Worker Architecture

**Decision**: Create a two-worker system: (1) `peer-consensus-worker` handles the orchestration (assignment, quorum monitoring, consensus computation), and (2) `evaluation-timeout-worker` runs on a 60-second repeating schedule to expire stale evaluations.

**Rationale**: The peer consensus worker is triggered once per submission and manages the full lifecycle: assign validators → wait for quorum (via BullMQ delayed re-check) → compute consensus → log shadow comparison. The timeout worker runs independently to clean up expired evaluations and trigger escalation. This separation follows the existing pattern of distinct workers for distinct responsibilities (e.g., `mission-expiration` vs `metrics-aggregation`).

**Alternatives considered**:
- **Single monolithic worker**: Rejected — mixing scheduled cleanup with event-driven processing would complicate the job type discrimination.
- **Database triggers for timeout**: Rejected — PostgreSQL triggers don't integrate with BullMQ or the application's logging/notification patterns.

## R3: Validator Assignment Algorithm

**Decision**: Implement a weighted random selection from the active validator pool, applying exclusion filters (self-review, daily cap, recent rotation) and tier stratification (≥1 journeyman+ per quorum), with affinity boost for hyperlocal content.

**Rationale**: The validator_pool table already has `daily_evaluation_count`, `last_assignment_at`, `response_rate`, `tier`, `is_active`, and `home_region_point` columns from Sprint 10. The algorithm:
1. Filter: `is_active = true`, `suspended_until IS NULL OR < now()`, `daily_evaluation_count < 10`, `agent_id != submission.agent_id`
2. Exclude: validators assigned to same agent's last 3 submissions (query `peer_evaluations` for recent assignments)
3. Boost: if submission has `location_point`, boost validators with `home_region_point` within 100km (PostGIS `ST_DWithin`)
4. Stratify: ensure ≥1 validator with `tier IN ('journeyman', 'expert')`
5. Over-assign: select 5-8 validators (configurable) to ensure quorum of 3

**Alternatives considered**:
- **Round-robin assignment**: Rejected — doesn't account for validator responsiveness or domain expertise.
- **Auction-based assignment**: Rejected — overly complex for shadow mode; may be considered for Sprint 12+.

## R4: Consensus Computation Approach

**Decision**: Compute weighted consensus synchronously when the Nth evaluation response arrives and meets quorum. Use a database advisory lock (`pg_advisory_xact_lock`) on the submission ID to prevent race conditions when multiple validators respond concurrently.

**Rationale**: When a validator submits their evaluation, the API handler checks if the quorum threshold (≥3 completed evaluations) has been met. If so, it acquires an advisory lock and computes consensus. The `consensus_unique_submission` unique constraint on `(submission_id, submission_type)` provides an additional idempotency guarantee. Advisory locks are lightweight and release automatically at transaction end.

**Alternatives considered**:
- **Delayed BullMQ job to check quorum**: Rejected — adds latency; the check-on-response approach is immediate.
- **Application-level mutex via Redis**: Rejected — advisory locks are native to PostgreSQL and more reliable within transaction boundaries.

## R5: F1 Score Rolling Window

**Decision**: Maintain a rolling window of the last 100 evaluations per validator using the existing `peer_evaluations` table as the source of truth. Compute F1/precision/recall by querying the last 100 evaluations where `recommendation IS NOT NULL` and comparing against the corresponding `consensus_results.layer_b_decision`.

**Rationale**: Storing raw evaluation history in `peer_evaluations` with the associated `layer_b_decision` from `consensus_results` allows accurate recomputation at any time. The `total_evaluations` and `correct_evaluations` counters on `validator_pool` provide a fast path for display, while the rolling window query provides the precision/recall breakdown. For Sprint 11, Layer B is the proxy ground truth; this can shift to admin decisions in Sprint 12+.

**Alternatives considered**:
- **Exponential moving average**: Rejected — doesn't provide the interpretable precision/recall/F1 breakdown needed for tier decisions.
- **Materialized view**: Rejected — adds schema complexity; the windowed query over 100 rows per validator is fast enough.

## R6: WebSocket Evaluation Notifications

**Decision**: Extend the existing WebSocket feed (`apps/api/src/ws/feed.ts`) to support targeted (per-agent) messages in addition to broadcasts. Add an `evaluation_request` event type.

**Rationale**: The existing `broadcast()` function sends to all connected clients. For evaluation assignments, we need to notify specific validators. The `clients` Map is keyed by `WSContext` with `agentId` in the value, so we can filter by agent. A new `sendToAgent(agentId, event)` function iterates over the clients map and sends to matching agents. This is a minimal extension of the existing infrastructure.

**Alternatives considered**:
- **Separate WebSocket channel for evaluations**: Rejected — would require validators to maintain two connections.
- **Redis pub/sub for targeted delivery**: Rejected — the WebSocket server already has the client registry; adding Redis pub/sub would duplicate state.

## R7: Local Dashboard Aggregation Strategy

**Decision**: Daily BullMQ cron job (`city-metrics-aggregation`) computes per-city statistics and caches in Redis with 1-hour TTL. API serves from Redis cache with database fallback.

**Rationale**: Pre-aggregation avoids expensive real-time queries across problems, observations, and validator_pool for every dashboard request. The daily aggregation matches the Open311 ingestion cadence (also daily). Redis TTL ensures cache freshness while reducing database load. The aggregation worker follows the existing `metrics-aggregation` worker pattern.

**Alternatives considered**:
- **PostgreSQL materialized views**: Rejected — Drizzle ORM doesn't natively support materialized view refresh; manual SQL would bypass the ORM layer.
- **Real-time aggregation with 15-minute cache**: Rejected — overkill for daily-refresh Open311 data; wastes compute.

## R8: Evaluation Score Dimensions Mapping

**Decision**: Map the spec's "per-dimension scores (domain alignment, factual accuracy, impact potential; each 1-5)" to the existing `peer_evaluations` columns: `domain_relevance_score` (1-100), `accuracy_score` (1-100), `impact_score` (1-100).

**Rationale**: The Sprint 10 schema already defines these columns with integer type (1-100 range). Rather than adding new columns or changing the schema, we use the existing 1-100 scale. The spec's 1-5 range is mapped to 1-100 by the API layer (multiply by 20) for storage, and converted back for display. This preserves backward compatibility and avoids a migration.

**Alternatives considered**:
- **Add new 1-5 columns**: Rejected — duplicates existing columns; schema change for cosmetic difference.
- **Use JSONB for scores**: Rejected — the existing typed columns are more efficient for queries and indexing.

## R9: Home Region Multi-City Support

**Decision**: The `validator_pool.home_region_name` and `home_region_point` columns support a single home region. For the Sprint 11 spec requirement of "1-3 home regions," add a `home_regions` JSONB column to `validator_pool` containing an array of `{ name: string, point: { lat: number, lng: number } }`.

**Rationale**: The existing single `home_region_name`/`home_region_point` pair doesn't support multiple regions. A JSONB array is the most flexible approach — it avoids a new join table while supporting spatial queries via application-level filtering. For the affinity boost in assignment, we extract all region points and check `ST_DWithin` against each. The existing single-region columns remain for backward compatibility and are set to the primary (first) region.

**Alternatives considered**:
- **Separate `validator_home_regions` table**: Rejected — adds join complexity for a 1-3 item array; JSONB is simpler.
- **Array of geography points**: Rejected — Drizzle ORM doesn't have native support for geography arrays; JSONB with application-level PostGIS queries is more maintainable.

## R10: Peer Evaluation Status Values

**Decision**: The `peer_evaluations.status` column (VARCHAR(20), default 'pending') will use the following values: `pending` (assigned, awaiting response), `completed` (validator responded), `expired` (timeout reached), `cancelled` (submission resolved before response).

**Rationale**: The Sprint 10 schema defines this as a VARCHAR(20) rather than an enum, allowing flexibility to add statuses without migration. The four statuses cover all lifecycle states: happy path (pending → completed), timeout (pending → expired), and early resolution (pending → cancelled when consensus reached or Layer B resolved before all validators respond).

**Alternatives considered**:
- **Add a `peer_evaluation_status` enum**: Rejected — unnecessary migration for a 4-value set on a VARCHAR(20) column that already exists.
