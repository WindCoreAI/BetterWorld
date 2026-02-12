# Tasks: Phase 3 Sprint 11 — Shadow Mode

**Input**: Design documents from `/specs/012-phase3-shadow-mode/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Shared types, schemas, queue names, and schema migration needed across all user stories

- [X] T001 [P] Add 3 new queue names (PEER_CONSENSUS, EVALUATION_TIMEOUT, CITY_METRICS) to `packages/shared/src/constants/queue.ts`
- [X] T002 [P] Create shared TypeScript types for evaluation, consensus, and validator in `packages/shared/src/types/shadow.ts` — include EvaluationResponse, ConsensusResult, ValidatorStats, CityMetrics interfaces matching the API contracts
- [X] T003 [P] Create Zod schemas for evaluation request/response validation in `packages/shared/src/schemas/evaluation.ts` — evaluationResponseSchema (recommendation: 'approved'|'flagged'|'rejected' matching guardrail_decision enum, confidence 0-1, scores 1-5, reasoning 50-2000 chars, safetyFlagged boolean), evaluationPendingQuerySchema (cursor, limit 1-50), homeRegionsSchema (array 0-3 to allow clearing regions, name 1-200 chars, lat -90/90, lng -180/180)
- [X] T004 [P] Add `home_regions` JSONB column (default '[]') to validator_pool schema in `packages/db/src/schema/validatorPool.ts` and export updated type
- [X] T004b [P] Create `validator_tier_changes` Drizzle schema in `packages/db/src/schema/validatorTierChanges.ts` — columns: id (UUID PK), validator_id (FK → validator_pool), from_tier (validator_tier enum), to_tier (validator_tier enum), f1_score_at_change (decimal 5,4), total_evaluations_at_change (integer), changed_at (timestamptz default now()); add index on (validator_id, changed_at DESC); export in schema index
- [X] T005 Generate and apply database migration for home_regions column on validator_pool AND new validator_tier_changes table (id UUID PK, validator_id FK, from_tier, to_tier, f1_score_at_change DECIMAL(5,4), total_evaluations_at_change INTEGER, changed_at TIMESTAMPTZ; index on validator_id+changed_at DESC) in `packages/db/drizzle/0010_shadow_mode.sql`
- [X] T006 [P] Add `sendToAgent(agentId, event)` targeted messaging function to `apps/api/src/ws/feed.ts` — iterate clients Map, filter by agentId, send JSON event (alongside existing broadcast)

**Checkpoint**: Shared types, schemas, migration applied, WebSocket targeting ready — user story implementation can begin

---

## Phase 2: User Story 1 — Shadow Peer Validation Pipeline (Priority: P1)

**Goal**: When shadow mode is enabled, the guardrail worker dispatches a peer consensus job in parallel with Layer B. Layer B remains the sole decision-maker. Peer consensus results are logged for comparison.

**Independent Test**: Submit content through the guardrail pipeline → verify both Layer B and peer consensus execute → Layer B alone routes the decision → peer result logged in consensus_results with layer_b_decision.

### Implementation

- [X] T007 [US1] Create evaluation assignment service in `apps/api/src/services/evaluation-assignment.ts` — implement `assignValidators(submissionId, submissionType, agentId, domain, locationPoint?)` function: (1) query active validators from validator_pool where is_active=true, suspended_until IS NULL or past, daily_evaluation_count < 10, agent_id != submissionAgentId; (2) exclude validators assigned to same *submitting* agent's last 3 submissions via peer_evaluations query; (3) prefer ≥1 journeyman+ tier in selection; if no journeyman+ available, proceed with all-apprentice quorum (shadow mode only — no production impact), log warning `journeyman_unavailable`, and set `tier_fallback: true` flag on the assignment context; (4) over-assign 5-8 validators (configurable via PEER_CONSENSUS_OVER_ASSIGN env); (5) insert peer_evaluations records with status='pending', expires_at=now()+30min; (6) increment daily_evaluation_count on validator_pool; (7) return assigned validator IDs and tier_fallback flag. Handle edge case: if fewer than 3 eligible validators, throw INSUFFICIENT_VALIDATORS error
- [X] T008 [US1] Add WebSocket notification dispatch to evaluation assignment in `apps/api/src/services/evaluation-assignment.ts` — after inserting peer_evaluations, call sendToAgent() for each assigned validator with evaluation_request event containing evaluationId, submission (id, type, title, description, domain), rubric text, and expiresAt (per websocket-events.md contract)
- [X] T009 [US1] Create consensus engine service in `apps/api/src/services/consensus-engine.ts` — implement `computeConsensus(submissionId, submissionType)` function: (1) acquire pg_advisory_xact_lock on hash of submissionId to prevent concurrent computation; (2) count completed peer_evaluations for submission; (3) if < quorum (3), return null; (4) check if any evaluation has safety_flagged=true → escalate immediately; (5) compute weighted votes: for each completed evaluation, weight = tierWeight(apprentice=1.0, journeyman=1.5, expert=2.0) × confidence; map recommendation enum to vote bucket: 'approved'→weighted_approve, 'rejected'→weighted_reject, 'flagged'→weighted_escalate; (6) total weight = sum of all weights; determine consensus_decision: 'approved' if weighted_approve/total ≥ 0.67, 'rejected' if weighted_reject/total ≥ 0.67, else 'escalated'; (7) insert into consensus_results with layer_b_decision, agrees_with_layer_b, consensus_latency_ms; (8) cancel remaining pending evaluations for this submission (set status='cancelled'); (9) broadcast consensus_reached WebSocket event; (10) return consensus result. Use ON CONFLICT (submission_id, submission_type) DO NOTHING for idempotency
- [X] T010 [US1] Create peer consensus worker in `apps/api/src/workers/peer-consensus.ts` — BullMQ worker on PEER_CONSENSUS queue: receives {submissionId, submissionType, agentId, content, domain, layerBDecision, layerBAlignmentScore, locationPoint?}; calls assignValidators(); follows createXxxWorker() pattern from existing workers (connection setup, error handlers, metrics logging, graceful shutdown). **Retry policy**: 3 attempts with exponential backoff (delay: 5000ms, factor: 2); on permanent failure (all retries exhausted), move to dead-letter queue `PEER_CONSENSUS_DLQ`; log structured error with submissionId; do NOT affect the Layer B routing decision (shadow mode is non-blocking). Handle orphaned peer_evaluations: if worker crashes after inserting evaluations but before completion, the evaluation-timeout worker (T011) will expire them after 30 minutes and create an escalated consensus with reason `quorum_timeout`
- [X] T011 [US1] Create evaluation timeout worker in `apps/api/src/workers/evaluation-timeout.ts` — BullMQ repeating job (every 60s) on EVALUATION_TIMEOUT queue: (1) query peer_evaluations WHERE status='pending' AND expires_at < now(); (2) batch update status='expired'; (3) for each unique (submission_id, submission_type) affected, check if quorum can still be met (count remaining pending); (4) if no pending remain and quorum not met, insert consensus_results with decision='escalated', escalation_reason='quorum_timeout'; (5) daily reset: use atomic idempotent query `UPDATE validator_pool SET daily_evaluation_count = 0, daily_count_reset_at = now() WHERE daily_count_reset_at < date_trunc('day', now() AT TIME ZONE 'UTC')` — this is safe against race conditions (concurrent 60s ticks) because the WHERE clause ensures each validator is reset at most once per day; log count of reset rows; follows existing worker pattern
- [X] T012 [US1] Integrate shadow pipeline into guardrail worker in `apps/api/src/workers/guardrail-worker.ts` — after the existing Layer B decision transaction (around line 263), add: (1) check PEER_VALIDATION_ENABLED feature flag via getFlag(); (2) if enabled, enqueue job to PEER_CONSENSUS queue with {submissionId: contentId, submissionType: contentType, agentId, content, domain: layerBResult.alignedDomain, layerBDecision: finalDecision, layerBAlignmentScore: score}; (3) this is non-blocking — do NOT await the peer consensus result; (4) wrap in try/catch so any peer consensus enqueue failure does NOT affect the Layer B routing decision; (5) log the enqueue action
- [X] T013 [US1] Register peer-consensus and evaluation-timeout workers in `apps/api/src/workers/all-workers.ts` — add imports and entries to the workers array following the existing pattern; evaluation-timeout worker should add its repeating job schedule on startup
- [X] T014 [US1] Mount evaluations routes in `apps/api/src/routes/v1.routes.ts` — add `/evaluations` route prefix pointing to evaluationsRoutes

**Checkpoint**: Shadow pipeline operational — submissions trigger peer consensus in parallel with Layer B; consensus results logged with Layer B comparison

---

## Phase 3: User Story 2 — Validator Evaluation Workflow (Priority: P1)

**Goal**: Validators can poll for pending evaluations, submit responses with scores/reasoning, and the system enforces self-review prevention, ownership, and expiry.

**Independent Test**: Assign evaluation to validator → validator polls GET /pending → validator submits POST /:id/respond → response recorded in peer_evaluations → quorum check triggered.

### Implementation

- [ ] T015 [US2] Implement GET /evaluations/pending route in `apps/api/src/routes/evaluations.routes.ts` — requireAgent middleware; query peer_evaluations WHERE validator_agent_id = authenticated agent AND status = 'pending', ordered by assigned_at ASC; cursor-based pagination (cursor = assigned_at ISO string); join to problems/solutions/debates to fetch submission title, description, domain; include static rubric text; limit 1-50 (default 20); return evaluations array with nextCursor and hasMore per evaluations-api.md contract
- [ ] T016 [US2] Implement POST /evaluations/:id/respond route in `apps/api/src/routes/evaluations.routes.ts` — requireAgent middleware; apply rate limiting (20 responses/min per agent using existing tiered rate limiter); validate body with evaluationResponseSchema (Zod); check ownership (validator_agent_id = authenticated agent); check status='pending' (409 if already completed); check expires_at > now() (410 if expired); map scores from 1-5 to 1-100 (multiply by 20) for storage; update peer_evaluations: set recommendation, confidence, reasoning, domain_relevance_score, accuracy_score, impact_score, safety_flagged, status='completed', responded_at=now(); after update, call computeConsensus(submissionId, submissionType) to check quorum; return evaluationId, status, consensusReached boolean, consensusDecision if reached
- [ ] T017 [US2] Implement GET /evaluations/:id route in `apps/api/src/routes/evaluations.routes.ts` — requireAgent middleware; fetch peer_evaluation by id; verify requester is assigned validator or admin; map scores back from 1-100 to 1-5 for response; return full evaluation details per contract
- [ ] T018 [US2] Add defense-in-depth self-review check in POST /evaluations/:id/respond route in `apps/api/src/routes/evaluations.routes.ts` — before processing the response, query the submission's original agent_id; if it matches the responding validator's agent_id, return 403 (this is a safety net beyond T007's assignment filter); add integration test covering: (1) self-review blocked at assignment, (2) self-review blocked at response submission

**Checkpoint**: Validators can discover, review, and submit evaluations through the API; self-review prevented

---

## Phase 4: User Story 3 — Consensus Engine & Weighted Voting (Priority: P1)

**Goal**: Weighted consensus computation produces approve/reject/escalate decisions; safety flags trigger immediate escalation; quorum timeout handled.

**Independent Test**: Simulate 3+ validator responses with varying tiers/confidence → run consensus → verify weighted decision matches expected outcomes for all scenarios.

### Implementation

- [ ] T019 [US3] Add consensus configuration constants in `packages/shared/src/constants/consensus.ts` — export TIER_WEIGHTS = { apprentice: 1.0, journeyman: 1.5, expert: 2.0 }, QUORUM_SIZE = 3, OVER_ASSIGN_COUNT = 6, EXPIRY_MINUTES = 30, APPROVE_THRESHOLD = 0.67, REJECT_THRESHOLD = 0.67; make configurable via env vars (PEER_CONSENSUS_QUORUM_SIZE, etc.)
- [ ] T020 [US3] Add integration test for consensus engine in `apps/api/src/__tests__/consensus-engine.test.ts` — test cases: (1) unanimous approve (3 apprentices) → approved; (2) unanimous reject → rejected; (3) mixed votes below thresholds → escalated; (4) safety flag on one evaluation → escalated with reason 'safety_flag'; (5) weighted tier influence: 1 expert approve vs 2 apprentice reject → test threshold; (6) quorum timeout path → escalated with reason 'quorum_timeout'; (7) idempotent computation (call twice, only one consensus_results row created); (8) concurrent response handling (advisory lock prevents race); use test DB with seeded validator_pool and peer_evaluations
- [ ] T021 [US3] Add integration test for shadow pipeline end-to-end in `apps/api/src/__tests__/shadow-pipeline.test.ts` — test cases: (1) submit problem with PEER_VALIDATION_ENABLED=true → peer_evaluations created → simulate responses → consensus_results created with layer_b_decision matching guardrail result; (2) peer consensus error does NOT affect Layer B routing; (3) PEER_VALIDATION_ENABLED=false → no peer_evaluations created; (4) feature flag toggle mid-operation

**Checkpoint**: Core P1 stories complete — shadow pipeline with validator workflow and consensus engine operational

---

## Phase 5: User Story 4 — F1 Score Tracking & Tier Management (Priority: P2)

**Goal**: After consensus, compare each validator's recommendation against Layer B; update rolling F1/precision/recall; promote/demote tiers automatically.

**Independent Test**: Record series of evaluations against known Layer B decisions → compute F1 over rolling window → verify tier changes at correct thresholds.

### Implementation

- [ ] T022 [US4] Create F1 score tracker service in `apps/api/src/services/f1-tracker.ts` — implement `updateValidatorMetrics(validatorId, recommendation, layerBDecision)`: (1) query last 100 peer_evaluations for this validator WHERE status='completed' and matching consensus_results exist; (2) compute TP (validator 'approved' + Layer B 'approved'), FP (validator 'approved' + Layer B 'rejected'/'flagged'), FN (validator 'rejected'/'flagged' + Layer B 'approved'), TN (validator 'rejected'/'flagged' + Layer B 'rejected'/'flagged'); for binary F1 classification, 'flagged' maps to the 'rejected' bucket; (3) compute precision = TP/(TP+FP), recall = TP/(TP+FN), F1 = 2×precision×recall/(precision+recall); handle division by zero (default 0); (4) update validator_pool: f1_score, precision, recall, total_evaluations++, correct_evaluations++ if match
- [ ] T023 [US4] Add tier promotion/demotion logic to F1 tracker in `apps/api/src/services/f1-tracker.ts` — implement `checkTierChange(validatorId)`: (1) read current tier and total_evaluations from validator_pool; (2) promotion: apprentice→journeyman if F1≥0.85 AND total_evaluations≥50; journeyman→expert if F1≥0.92 AND total_evaluations≥200; (3) demotion: expert→journeyman if F1<0.92 AND total_evaluations≥30 since last promotion (prevents oscillation); journeyman→apprentice if F1<0.85 AND total_evaluations≥30 since last promotion; (4) if tier changed, update validator_pool.tier AND insert record into `validator_tier_changes` table (from_tier, to_tier, f1_score_at_change, total_evaluations_at_change); (5) send tier_change WebSocket event to the agent; (6) log tier change with structured logging
- [ ] T024 [US4] Integrate F1 tracker into consensus engine in `apps/api/src/services/consensus-engine.ts` — after consensus is computed and stored, call updateValidatorMetrics() for each participating validator (those with status='completed' for this submission), passing their recommendation and the layerBDecision from consensus_results; then call checkTierChange() for each
- [ ] T025 [US4] Implement GET /validator/stats route in `apps/api/src/routes/validator.routes.ts` — requireAgent middleware; query validator_pool WHERE agent_id = authenticated agent; return tier, f1Score, precision, recall, totalEvaluations, correctEvaluations, responseRate, dailyEvaluationCount, dailyLimit (10), homeRegions (from JSONB), isActive, suspendedUntil per validator-api.md contract; return 404 if agent not in pool
- [ ] T026 [US4] Implement GET /validator/tier-history route in `apps/api/src/routes/validator.routes.ts` — requireAgent middleware; query `validator_tier_changes` table WHERE validator_id matches authenticated agent's validator record, ORDER BY changed_at DESC, limit from query param (default 20, max 50); return currentTier and history array (fromTier, toTier, f1ScoreAtChange, evaluationsAtChange, changedAt) per contract
- [ ] T027 [US4] Mount validator routes in `apps/api/src/routes/v1.routes.ts` — add `/validator` route prefix pointing to validatorRoutes
- [ ] T028 [US4] Add integration test for F1 tracking and tier promotion in `apps/api/src/__tests__/f1-tracker.test.ts` — test cases: (1) 50 correct evaluations → F1 ≥ 0.85 → promote apprentice to journeyman; (2) F1 drops below threshold → demotion; (3) rolling window only considers last 100; (4) division by zero handling (no evaluations yet)

**Checkpoint**: F1 tracking operational with automatic tier promotion/demotion; validators can view their stats

---

## Phase 6: User Story 5 — Agreement Dashboard (Priority: P2)

**Goal**: Admin dashboard showing peer vs Layer B agreement rates by domain and type, disagreement breakdown, and latency percentiles.

**Independent Test**: Generate shadow comparison data across domains/types → verify dashboard displays correct agreement %, disagreement counts, and latency p50/p95/p99.

### Implementation

- [ ] T029 [P] [US5] Create agreement statistics service in `apps/api/src/services/agreement-stats.ts` — implement `getAgreementStats(fromDate, toDate)`: (1) query consensus_results WHERE created_at BETWEEN fromDate AND toDate; (2) compute overall agreement rate from agrees_with_layer_b column; (3) group by aligned domain (join to problems/solutions for domain) for per-domain rates; (4) group by submission_type for per-type rates; (5) compute disagreement breakdown: count WHERE agrees_with_layer_b=false AND decision='approved' (peer approve, Layer B reject) vs reverse; (6) cache results in Redis with 300s TTL (betterworld:shadow:agreement:*); return structure per admin-shadow-api.md contract
- [ ] T030 [P] [US5] Create latency statistics service in `apps/api/src/services/agreement-stats.ts` — implement `getLatencyStats(fromDate, toDate)`: (1) query consensus_results.consensus_latency_ms WHERE created_at BETWEEN dates; (2) compute p50, p95, p99 using SQL percentile_cont(); (3) query peer_evaluations response times (responded_at - assigned_at) for validator response distribution; (4) compute quorum stats (total attempts, quorum met vs timeout); cache in Redis 300s TTL
- [ ] T031 [US5] Create admin shadow dashboard routes in `apps/api/src/routes/admin/shadow.ts` — requireAdmin middleware; (1) GET /shadow/agreement — call getAgreementStats, validate fromDate/toDate query params; (2) GET /shadow/latency — call getLatencyStats; (3) GET /shadow/validators — query validator_pool for pool overview: total, active, suspended, byTier counts, withHomeRegions count, avgF1Score, avgResponseRate, tier changes since fromDate; mount in admin routes
- [ ] T032 [US5] Create Agreement Dashboard frontend page in `apps/web/src/app/admin/shadow/page.tsx` — admin-gated page; fetch from GET /admin/shadow/agreement and /shadow/latency; display: (1) overall agreement rate as large percentage; (2) per-domain agreement table (15 rows); (3) per-type agreement table (3 rows); (4) disagreement breakdown (peer-approve-LB-reject vs reverse); (5) consensus latency p50/p95/p99 display
- [ ] T033 [P] [US5] Create AgreementChart component in `apps/web/src/components/AgreementChart.tsx` — bar chart showing agreement rates by domain or type; accepts data array with labels and percentages; use Tailwind for styling (no external chart library unless already in deps)
- [ ] T034 [P] [US5] Create LatencyHistogram component in `apps/web/src/components/LatencyHistogram.tsx` — display p50/p95/p99 as horizontal bar segments; visual indicator for whether p95 is under 15s target
- [ ] T035 [US5] Add integration test for agreement stats in `apps/api/src/__tests__/agreement-stats.test.ts` — seed consensus_results with known agreement/disagreement patterns across domains and types; verify stats computation matches expected values; test date range filtering; test Redis caching

**Checkpoint**: Admin can view comprehensive shadow mode analytics

---

## Phase 7: User Story 6 — Agent Affinity System (Priority: P2)

**Goal**: Validators declare 1-3 home regions; affinity data influences evaluation assignments for hyperlocal content.

**Independent Test**: Validator declares home regions via API → affinity data stored → evaluation assignment for hyperlocal submission prefers local validators.

### Implementation

- [ ] T036 [US6] Implement PATCH /validator/affinity route in `apps/api/src/routes/validator.routes.ts` — requireAgent middleware; validate body with homeRegionsSchema (Zod: array 0-3 items, each with name, lat, lng; empty array clears regions); check agent is in validator_pool; update validator_pool: set home_regions JSONB, sync home_region_name = homeRegions[0].name, home_region_point = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography for first region; return updated homeRegions and primaryRegion per contract
- [ ] T037 [US6] Add affinity boost to evaluation assignment in `apps/api/src/services/evaluation-assignment.ts` — when submission has location_point (hyperlocal): (1) for each candidate validator, check if any of their home_regions entries is within 100km of submission location using PostGIS ST_DWithin on home_region_point; (2) boost matching validators by adding them to a preferred pool; (3) select from preferred pool first, then fill remaining from general pool; ensure tier stratification still met
- [ ] T038 [US6] Create Validator Affinity Settings frontend page in `apps/web/src/app/validator/affinity/page.tsx` — agent-auth-gated page; fetch current home_regions from GET /validator/stats; display list of declared regions with remove buttons; city search input with autocomplete (use Nominatim geocoding from Sprint 7 — `nominatim.openstreetmap.org/search?format=json&q=`); add button to declare new region (max 3); submit via PATCH /validator/affinity
- [ ] T039 [US6] Add integration test for affinity system in `apps/api/src/__tests__/validator-affinity.test.ts` — test cases: (1) PATCH with 2 regions → stored correctly; (2) PATCH with 4 regions → 422 validation error; (3) home_region_name/point synced to first region; (4) assignment prefers local validators for hyperlocal submission

**Checkpoint**: Validators can declare home regions; hyperlocal submissions preferentially assigned to local validators

---

## Phase 8: User Story 7 — Local City Dashboards (Priority: P3)

**Goal**: City-level dashboards for Portland and Chicago showing problem counts by category, avg resolution time, heatmap, and local validator count.

**Independent Test**: Daily aggregation runs → city metrics cached → dashboard renders with correct category counts and heatmap.

### Implementation

- [ ] T040 [P] [US7] Create city configuration constants in `packages/shared/src/constants/cities.ts` — export SUPPORTED_CITIES array: [{ id: 'portland', displayName: 'Portland, OR', center: { lat: 45.5152, lng: -122.6784 } }, { id: 'chicago', displayName: 'Chicago, IL', center: { lat: 41.8781, lng: -87.6298 } }]
- [ ] T041 [US7] Create city metrics aggregation worker in `apps/api/src/workers/city-metrics.ts` — BullMQ repeating job (daily at 6AM UTC) on CITY_METRICS queue: for each SUPPORTED_CITIES entry: (1) query problems WHERE municipal_source_type IS NOT NULL OR location_point is within city bounds, group by domain → problemsByCategory; (2) compute avg resolution time from problems with status='resolved'; (3) query observations for this city area → totalObservations; (4) query validator_pool WHERE home_region_name LIKE city → activeLocalValidators; (5) query problems with location_point → heatmap array [{lat, lng, intensity}]; (6) cache JSON in Redis key `betterworld:city:metrics:{cityId}` with 3600s TTL; follows existing worker pattern
- [ ] T042 [US7] Create city metrics API routes in `apps/api/src/routes/city.routes.ts` — (1) GET /city/list — return SUPPORTED_CITIES with totalProblems count; (2) GET /city/:city/metrics — read from Redis cache `betterworld:city:metrics:{city}`, fallback to live query if cache miss; validate city is in SUPPORTED_CITIES (404 if not); return per admin-shadow-api.md contract; mount in v1.routes.ts at `/city`
- [ ] T043 [US7] Register city-metrics worker in `apps/api/src/workers/all-workers.ts` — add import and entry to workers array; add repeating job schedule on startup
- [ ] T044 [US7] Create City Dashboard frontend page in `apps/web/src/app/city/[city]/page.tsx` — dynamic route; fetch from GET /city/:city/metrics; display: (1) city name + total problems header; (2) problem counts by category as table/bars; (3) avg resolution time; (4) active local validators count; (5) CityHeatmap component with problem density
- [ ] T045 [P] [US7] Create CityHeatmap component in `apps/web/src/components/CityHeatmap.tsx` — dynamic import Leaflet + leaflet.heat (SSR-safe, following existing pattern from Sprint 7 mission map); render map centered on city coordinates; plot heatmap layer from data points; include zoom controls
- [ ] T046 [US7] Create city selector page in `apps/web/src/app/city/page.tsx` — fetch from GET /city/list; display cards for each city with name, totalProblems; link to /city/[cityId]
- [ ] T047 [P] [US7] Create ValidatorTierBadge component in `apps/web/src/components/ValidatorTierBadge.tsx` — display validator tier as colored badge: apprentice (gray), journeyman (blue), expert (gold); accept tier string prop

**Checkpoint**: City dashboards operational for Portland and Chicago with heatmaps

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Integration tests, existing test verification, final wiring

- [ ] T048 Add integration test for evaluation timeout handler in `apps/api/src/__tests__/evaluation-timeout.test.ts` — test cases: (1) expired evaluations marked as expired; (2) quorum timeout creates escalated consensus; (3) already-completed evaluations not affected; (4) concurrent timeout handling is safe
- [ ] T049 Add integration test for full shadow pipeline with affinity in `apps/api/src/__tests__/shadow-integration.test.ts` — end-to-end: create submission → evaluation assignment with affinity boost → validator responses → consensus → F1 update → agreement stats → verify all tables populated correctly; test shadow mode has zero impact on Layer B routing
- [ ] T050 Verify all 944+ existing tests still pass — run full test suite `pnpm test` to confirm no regressions from shadow mode integration into guardrail-worker.ts and other shared code
- [ ] T051 Run TypeScript strict mode check (`pnpm typecheck`) and ESLint (`pnpm lint`) — resolve any errors from new code across all packages
- [ ] T052 Add admin navigation links for shadow dashboard and city dashboards in `apps/web/src/app/admin/` layout — link to /admin/shadow from admin sidebar; link to /city from main navigation
- [ ] T053 Add shadow pipeline health monitoring to agreement stats service in `apps/api/src/services/agreement-stats.ts` — implement `getShadowPipelineHealth()`: compare count of guardrail_evaluations (Layer B decisions) with count of consensus_results for same date range; compute shadow_coverage_rate = consensus_results / guardrail_evaluations; include peer_consensus queue metrics (active/waiting/failed counts via BullMQ getJobCounts()); add to GET /admin/shadow/agreement response as `pipelineHealth: { shadowCoverageRate, queueActive, queueWaiting, queueFailed }`; log warning if coverage rate drops below 90% when shadow mode is enabled; also include quorumFormationRate (consensus_results with decision!='escalated' where escalation_reason='quorum_timeout' / total consensus_results) — log warning if quorum formation rate drops below 90%

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **US1 Shadow Pipeline (Phase 2)**: Depends on Phase 1 (queue names, types, schemas, WebSocket targeting)
- **US2 Evaluation Workflow (Phase 3)**: Depends on Phase 2 (needs evaluation assignment service, consensus engine)
- **US3 Consensus Engine (Phase 4)**: Depends on Phase 2 + 3 (tests exercise the full pipeline)
- **US4 F1 Tracking (Phase 5)**: Depends on Phase 4 (consensus engine must exist to integrate with)
- **US5 Agreement Dashboard (Phase 6)**: Depends on Phase 2 (needs consensus_results data); can run in parallel with US4
- **US6 Agent Affinity (Phase 7)**: Depends on Phase 1 (migration); can run in parallel with US4/US5
- **US7 City Dashboards (Phase 8)**: Depends on Phase 1; independent of all other stories
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

```
Phase 1 (Setup)
  │
  ├─→ Phase 2 (US1: Shadow Pipeline) ─→ Phase 3 (US2: Eval Workflow) ─→ Phase 4 (US3: Consensus Tests)
  │                                                                         │
  │                                                                         ├─→ Phase 5 (US4: F1 Tracking)
  │                                                                         │
  ├─→ Phase 6 (US5: Agreement Dashboard) ←── needs consensus_results ──────┘
  │
  ├─→ Phase 7 (US6: Agent Affinity) [independent after Phase 1]
  │
  └─→ Phase 8 (US7: City Dashboards) [independent after Phase 1]
```

### Within Each User Story

- Services before routes
- Routes before frontend pages
- Core implementation before integration tests
- All tasks within a story complete before marking story done

### Parallel Opportunities

**Phase 1**: T001, T002, T003, T004, T006 can all run in parallel (different files)
**After Phase 4**: US5, US6, US7 can all run in parallel (independent stories)
**Within US5**: T029, T030 (stats services) parallel; T033, T034 (UI components) parallel
**Within US7**: T040, T045, T047 parallel (constants, heatmap component, badge component)

---

## Parallel Example: Phase 1 Setup

```bash
# Launch all setup tasks together:
Task: "Add queue names to packages/shared/src/constants/queue.ts"          # T001
Task: "Create TypeScript types in packages/shared/src/types/shadow.ts"     # T002
Task: "Create Zod schemas in packages/shared/src/schemas/evaluation.ts"    # T003
Task: "Add home_regions column to packages/db/src/schema/validatorPool.ts" # T004
Task: "Add sendToAgent to apps/api/src/ws/feed.ts"                        # T006
```

## Parallel Example: After Phase 4 (US4/US5/US6/US7)

```bash
# These stories are independent and can run in parallel:
Agent A: US4 (F1 Tracking — T022-T028)
Agent B: US5 (Agreement Dashboard — T029-T035)
Agent C: US6 (Agent Affinity — T036-T039)
Agent D: US7 (City Dashboards — T040-T047)
```

---

## Implementation Strategy

### MVP First (User Stories 1-3 Only)

1. Complete Phase 1: Setup (T001-T006)
2. Complete Phase 2: US1 Shadow Pipeline (T007-T014)
3. Complete Phase 3: US2 Evaluation Workflow (T015-T018)
4. Complete Phase 4: US3 Consensus Engine Tests (T019-T021)
5. **STOP and VALIDATE**: Shadow mode running, peer consensus collecting comparison data
6. This is a deployable MVP — shadow data collection begins

### Incremental Delivery

1. Setup + US1 + US2 + US3 → Shadow pipeline MVP (deploy, start collecting data)
2. Add US4 (F1 Tracking) → Tier system responsive
3. Add US5 (Agreement Dashboard) → Admin visibility for go/no-go decision
4. Add US6 (Agent Affinity) → Hyperlocal evaluation quality
5. Add US7 (City Dashboards) → Community engagement
6. Polish → Full test coverage, navigation, cleanup

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks in same phase
- [Story] label maps task to specific user story for traceability
- Score mapping: spec says 1-5, DB stores 1-100 (multiply by 20 at API layer)
- Recommendation enum mapping: validators use `guardrail_decision` enum (approved/flagged/rejected); `flagged` maps to escalation weight in consensus; consensus decisions use `consensus_decision` enum (approved/rejected/escalated/expired)
- Feature flag `PEER_VALIDATION_ENABLED` gates shadow mode — no code changes needed to disable
- All new routes use standard envelope `{ ok, data/error, requestId }` and Zod validation
- Cursor-based pagination everywhere (never offset)
- pg_advisory_xact_lock on submission ID prevents consensus race conditions
- Evaluation expiry default: 30 minutes from assignment
