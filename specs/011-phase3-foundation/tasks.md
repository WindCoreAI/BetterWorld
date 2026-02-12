# Tasks: Phase 3 Foundation — Credit Economy + Hyperlocal System

**Input**: Design documents from `/specs/011-phase3-foundation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Integration tests are required per FR-036 (20+ new tests). Tests are included within their respective user story phases.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Database schema**: `packages/db/src/schema/`
- **Shared config/types**: `packages/shared/src/`
- **API routes/services/workers**: `apps/api/src/`
- **Frontend components**: `apps/web/src/`
- **Migrations**: `packages/db/drizzle/`
- **Tests**: `apps/api/tests/` and `packages/*/tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization — PostGIS extension, new enums, shared types, Drizzle config update

- [X] T001 Add PostGIS to local dev database init script in `scripts/init-db.sql` — add `CREATE EXTENSION IF NOT EXISTS "postgis";` alongside existing extensions
- [X] T002 Update Drizzle config to filter PostGIS internal tables — add `extensionsFilters: ['postgis']` to `packages/db/drizzle.config.ts`
- [X] T003 [P] Add 8 new enum definitions to `packages/db/src/schema/enums.ts` — validatorTierEnum, consensusDecisionEnum, disputeStatusEnum, geographicScopeEnum, observationTypeEnum, observationVerificationEnum, reviewTypeEnum, agentCreditTypeEnum (per data-model.md)
- [X] T004 [P] Add 2 new values to existing transactionTypeEnum in `packages/db/src/schema/enums.ts` — append `earn_review_mission` and `earn_conversion_received` to the transactionTypeEnum array
- [X] T005 [P] Create shared Phase 3 types in `packages/shared/src/types/phase3.ts` — export Zod schemas and TypeScript types for Open311 service request, city config, GPS validation, observation input, credit transaction input, feature flag definitions
- [X] T006 [P] Add Phase 3 constants to `packages/shared/src/constants/phase3.ts` — STARTER_GRANT_AMOUNT (50), scoring weights (hyperlocal vs global), Open311 city configs (Chicago primary + Portland secondary: endpoints, service code → domain mappings, polling intervals), GPS validation thresholds (null island, polar limit 80, accuracy limit 1000m), OPEN311_BATCH_SIZE (100); export all from `packages/shared/src/index.ts` following existing re-export pattern
- [X] T007 [P] Create `geographyPoint` custom type helper in `packages/db/src/schema/types.ts` — implement Drizzle `customType` for `geography(Point, 4326)` per research.md R1, to be reused across all tables needing PostGIS columns

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema (8 new tables + 3 extensions), migration, and feature flag service — MUST complete before any user story

**CRITICAL**: No user story work can begin until this phase is complete

### Schema: New Tables

- [X] T008 [P] Create `validatorPool` schema in `packages/db/src/schema/validatorPool.ts` — define all 21 columns per data-model.md (id, agentId unique FK, tier, f1Score, precision, recall, totalEvaluations, correctEvaluations, domainScores jsonb, homeRegionName, homeRegionPoint geography, dailyEvaluationCount, dailyCountResetAt, lastAssignmentAt, lastResponseAt, responseRate, capabilities jsonb, isActive, suspendedUntil, suspensionCount, timestamps), indexes (tier, f1Score, isActive, GIST homeRegionPoint), relations to agents
- [X] T009 [P] Create `peerEvaluations` schema in `packages/db/src/schema/peerEvaluations.ts` — define all 17 columns per data-model.md (id, submissionId, submissionType, validatorId FK→validatorPool, validatorAgentId FK→agents, recommendation nullable, confidence, reasoning, 3 dimension scores, safetyFlagged, assignedAt, respondedAt, expiresAt, status, rewardCreditTransactionId, createdAt), indexes and UNIQUE(submissionId, validatorId), relations
- [X] T010 [P] Create `consensusResults` schema in `packages/db/src/schema/consensusResults.ts` — define all 17 columns per data-model.md (id, submissionId, submissionType, decision, confidence, quorumSize, responsesReceived, 3 weighted tallies, layerBDecision, layerBAlignmentScore, agreesWithLayerB, consensusLatencyMs, wasEarlyConsensus, escalationReason, createdAt), indexes and UNIQUE(submissionId, submissionType), relations
- [X] T011 [P] Create `agentCreditTransactions` schema in `packages/db/src/schema/agentCreditTransactions.ts` — define all 12 columns per data-model.md (id, agentId FK, amount integer, balanceBefore integer NOT NULL, balanceAfter integer NOT NULL, transactionType agentCreditTypeEnum, referenceId, referenceType, description, idempotencyKey, metadata jsonb, createdAt), add CHECK constraint (balanceAfter = balanceBefore + amount), indexes (agentId+createdAt, transactionType, UNIQUE idempotencyKey), relations — follows Constitution Principle IV double-entry accounting pattern matching tokenTransactions
- [X] T012 [P] Create `creditConversions` schema in `packages/db/src/schema/creditConversions.ts` — define all 10 columns per data-model.md (id, agentId FK, agentCreditsSpent, agentCreditTransactionId FK, humanId FK, impactTokensReceived, humanTransactionId FK, conversionRate decimal(8,4), rateSnapshot jsonb, createdAt), indexes, relations
- [X] T013 [P] Create `observations` schema in `packages/db/src/schema/observations.ts` — define all 16 columns per data-model.md (id, problemId nullable FK, observationType, mediaUrl, thumbnailUrl, caption, capturedAt, gpsLat, gpsLng, gpsAccuracyMeters, locationPoint geography, submittedByHumanId FK, verificationStatus, verificationNotes, perceptualHash, timestamps), indexes (problemId, humanId, verificationStatus, createdAt, GIST locationPoint), relations
- [X] T014 [P] Create `problemClusters` schema in `packages/db/src/schema/problemClusters.ts` — define all 17 columns per data-model.md (id, title, description, domain, scope geographicScopeEnum, centroidPoint geography, radiusMeters, city, memberProblemIds uuid[], memberCount, totalObservations, distinctReporters, promotedToProblemId FK, promotedAt, centroidEmbedding halfvec(1024), isActive, lastAggregatedAt, timestamps), indexes (domain, city, isActive), relations
- [X] T015 [P] Create `disputes` schema in `packages/db/src/schema/disputes.ts` — define all 14 columns per data-model.md (id, consensusId FK, challengerAgentId FK, stakeAmount default 10, stakeCreditTransactionId FK, reasoning, status disputeStatusEnum, adminReviewerId, adminDecision, adminNotes, resolvedAt, stakeReturned, bonusPaid, createdAt), indexes (consensusId, challengerAgentId, status), relations

### Schema: Table Extensions

- [X] T016 Extend `agents` table in `packages/db/src/schema/agents.ts` — add 5 new columns: creditBalance (integer NOT NULL default 0), homeRegionName (varchar 200), homeRegionPoint (geographyPoint), localProblemsReported (integer NOT NULL default 0), localReputationScore (decimal(5,2) NOT NULL default 0); add new indexes (GIST homeRegionPoint, creditBalance)
- [X] T017 Extend `problems` table in `packages/db/src/schema/problems.ts` — add 7 new columns: locationPoint (geographyPoint), localUrgency (varchar 20), actionability (varchar 20), radiusMeters (integer), observationCount (integer NOT NULL default 0), municipalSourceId (varchar 100), municipalSourceType (varchar 50); add new indexes (GIST locationPoint, geographic_scope+local_urgency+created_at, municipal_source_type+municipal_source_id, observationCount). NOTE: the existing `geographicScope` column is varchar(50) — leave as varchar for now (migration to geographicScopeEnum deferred to avoid data validation complexity); use the new `geographicScopeEnum` only for `problemClusters.scope`
- [X] T018 Extend `peerReviews` table in `packages/db/src/schema/peerReviews.ts` — add reviewType (varchar 20 NOT NULL default "evidence"), observationId (uuid FK→observations nullable); make evidenceId nullable; add CHECK constraint (evidenceId IS NOT NULL OR observationId IS NOT NULL); add indexes (reviewType, observationId); update relations

### Schema: Index and Export

- [X] T019 Update schema barrel export in `packages/db/src/schema/index.ts` — export all 8 new table schemas and their relations

### Migration

- [X] T020 Generate and customize Drizzle migration — run `pnpm --filter db generate` to create `packages/db/drizzle/0009_*.sql`, then manually prepend `CREATE EXTENSION IF NOT EXISTS postgis;` at the top, append PostGIS backfill SQL (`UPDATE problems SET location_point = ST_SetSRID(ST_MakePoint(longitude::float, latitude::float), 4326)::geography WHERE latitude IS NOT NULL AND longitude IS NOT NULL`), and append system agent seed (`INSERT INTO agents (id, username, framework, api_key_hash, api_key_prefix, is_active) VALUES ('00000000-0000-0000-0000-000000000311', 'system-municipal-311', 'system', '$system$', 'sys_', true)`)

### Feature Flags Service

- [X] T021 Create feature flags service in `apps/api/src/services/feature-flags.ts` — implement Redis-backed flags with env var fallback per research.md R3: Zod-validated flag schema (8 flags per spec FR-031), `getFeatureFlags(redis)` with 60s in-memory cache, `getFlag(redis, name)`, `setFlag(redis, name, value)` with cache invalidation, `resetFlag(redis, name)`, `invalidateFlagCache()` for tests

**Checkpoint**: Foundation ready — all 8 new tables created, 3 tables extended, migration applied, feature flags service operational. User story implementation can now begin.

---

## Phase 3: User Story 4 — PostGIS Spatial Infrastructure (Priority: P1)

**Goal**: Enable PostGIS spatial queries — backfill existing problems, extend geo-helpers with PostGIS query builders

**Independent Test**: Run migration, verify PostGIS extension is active, verify existing problems have location_point populated, verify ST_DWithin proximity query returns correct results

**Note**: This is sequenced first because US1, US2, and US3 all depend on PostGIS being functional.

### Implementation

- [X] T022 [US4] Extend `apps/api/src/lib/geo-helpers.ts` with PostGIS query builders — add `buildPostGISProximityFilter(column, lat, lng, radiusMeters)` returning `sql\`ST_DWithin(...)\``, `buildPostGISDistanceSelect(column, lat, lng)` returning `sql\`ST_Distance(...)\``, `buildPostGISPoint(lat, lng)` returning `sql\`ST_SetSRID(ST_MakePoint(...))\``, and `parsePostGISPointFromHex(hex)` for reading geography column output
- [X] T023 [US4] Write integration tests for PostGIS spatial queries in `apps/api/tests/integration/postgis.test.ts` — test PostGIS extension is enabled, test location_point backfill populates from existing lat/lng, test ST_DWithin returns problems within radius, test ST_DWithin excludes problems outside radius, test ST_Distance returns correct ordering by proximity (5+ tests)

**Checkpoint**: PostGIS infrastructure verified — spatial queries work correctly on backfilled data

---

## Phase 4: User Story 1 — Agent Earns Credits for Participation (Priority: P1) MVP

**Goal**: Agent credit ledger with atomic balance operations, starter grants on registration, balance + transaction history endpoint

**Independent Test**: Register a new agent → verify starter grant of 50 credits → query balance endpoint → verify balance and transaction record

### Implementation

- [X] T024 [US1] Create agent credit service in `apps/api/src/services/agent-credit.service.ts` — implement `earnCredits(agentId, amount, type, referenceId, idempotencyKey)` with SELECT FOR UPDATE on agents.creditBalance, record balanceBefore from locked row, compute balanceAfter = balanceBefore + amount, INSERT into agentCreditTransactions with balanceBefore/balanceAfter (double-entry per Constitution Principle IV), UPDATE agents.creditBalance atomically in transaction; implement `getBalance(agentId)` returning creditBalance; implement `getTransactionHistory(agentId, cursor, limit)` with cursor pagination; implement `issueStarterGrant(agentId)` using idempotencyKey `starter-grant:{agentId}` for exactly-once; validate balanceAfter >= 0 on all operations (reject if negative)
- [X] T025 [US1] Hook starter grant into agent registration flow — in existing agent registration route (`apps/api/src/routes/agents.routes.ts`), after successful agent creation call `issueStarterGrant(agent.id)`, gated behind feature flag check (fail gracefully if credit economy not yet enabled)
- [X] T026 [US1] Create agent credits routes in `apps/api/src/routes/agent-credits.routes.ts` — implement GET `/api/v1/agents/credits/balance` per contracts/agent-credits.yaml (agentAuth, returns creditBalance + cursor-paginated transactions with balanceBefore/balanceAfter + nextCursor), implement GET `/api/v1/agents/credits/rate` as placeholder returning seed rate 5:1 with FEATURE_DISABLED if CREDIT_CONVERSION_ENABLED is false; mount in `apps/api/src/routes/v1.routes.ts`
- [X] T027 [US1] Write integration tests for agent credits in `apps/api/tests/integration/agent-credits.test.ts` — test starter grant on registration (50 credits), test idempotent starter grant (duplicate rejected), test balance endpoint returns correct balance + transactions, test concurrent credit operations serialize correctly (no lost updates), test negative balance rejection (5+ tests)

**Checkpoint**: Agent credit economy is functional — agents receive starter grants and can query their balance

---

## Phase 5: User Story 8 — Feature Flags Control Phase 3 Rollout (Priority: P2, but needed early)

**Goal**: Admin API for feature flags — list, set, reset; verify Phase 2 behavior unchanged when all flags disabled

**Independent Test**: Fetch flags (all false) → set HYPERLOCAL_INGESTION_ENABLED to true → verify reflected in GET → reset → verify default restored

**Note**: Sequenced before other P2 stories because US2, US3 depend on flags being operational for gating.

### Implementation

- [X] T028 [US8] Create admin feature flags routes in `apps/api/src/routes/admin/phase3.ts` — implement GET `/api/v1/admin/feature-flags` (list all flags), PUT `/api/v1/admin/feature-flags/:flagName` (set value with Zod validation), DELETE `/api/v1/admin/feature-flags/:flagName` (reset to default) per contracts/admin-phase3.yaml; require humanAuth + requireAdmin; log flag changes for audit; mount on admin routes
- [X] T029 [US8] Write integration tests for feature flags in `apps/api/tests/integration/feature-flags.test.ts` — test all flags default to disabled, test set boolean flag via admin API, test set numeric flag (PEER_VALIDATION_TRAFFIC_PCT), test reset flag to default, test env var fallback when Redis unavailable, test existing 944+ tests still pass with all flags disabled (6+ tests)

**Checkpoint**: Feature flags operational — admin can toggle Phase 3 features at runtime

---

## Phase 6: User Story 2 — Municipal Problems via Open311 Ingestion (Priority: P1)

**Goal**: Open311 client + per-city adapters (Chicago primary, Portland secondary), BullMQ ingestion worker, dedup, geocoding, guardrail routing

**Independent Test**: Mock Open311 API → run ingestion worker → verify municipal reports appear as problems on board with correct domain/location → verify duplicates skipped

### Implementation

- [X] T030 [US2] Create Open311 client service in `apps/api/src/services/open311.service.ts` — implement generic `Open311Client` class: `fetchRequests(endpoint, params)` calling GET /requests.json with start_date/end_date/status filters, `fetchServices(endpoint)` calling GET /services.json; implement `transformRequestToProblem(request, cityConfig)` mapping Open311 fields to problem schema (title from service_name + description, domain from serviceCodeMapping, severity from mapping, lat/long to coordinates, municipalSourceId/Type); implement `getLastSyncTimestamp(redis, cityId)` and `setLastSyncTimestamp(redis, cityId)`; handle malformed data gracefully (skip + log warning)
- [X] T031 [US2] Create municipal ingestion worker in `apps/api/src/workers/municipal-ingest.ts` — implement BullMQ worker for queue "municipal-ingest" with typed `IngestJobData { cityId: string }`; flow: check HYPERLOCAL_INGESTION_ENABLED flag → fetch since last sync → filter by mapped service codes → dedup via municipalSourceType+municipalSourceId DB check → geocode addresses without coordinates using existing Nominatim service (when geocoding fails: store problem with address but null locationPoint, do not set guardrailStatus to approved until coordinates resolved) → batch process (use OPEN311_BATCH_SIZE constant from phase3 constants) → submit each through full existing 3-layer guardrail pipeline (system-municipal-311 agent at "new" trust tier) → update last sync timestamp; implement error handling (log + retry, no partial records); add to `apps/api/src/workers/all-workers.ts` worker registry
- [X] T032 [US2] Register Open311 repeatable jobs — in worker startup (`apps/api/src/workers/all-workers.ts`), add BullMQ repeatable jobs: one per enabled city from constants config, with configurable polling interval (default 15 min), gated behind HYPERLOCAL_INGESTION_ENABLED flag
- [X] T033 [US2] Write integration tests for Open311 ingestion in `apps/api/tests/integration/open311.test.ts` — test system agent `system-municipal-311` exists and can be used as reportedByAgentId, test Open311 API response parsing (valid + malformed), test service code → domain mapping, test deduplication (same municipalSourceId skipped), test geocoding fallback for address-only records (store with null locationPoint when geocoding fails), test batch processing uses OPEN311_BATCH_SIZE constant, test guardrail pipeline routing (problems enter as "pending" via full 3-layer pipeline), test ingestion stats tracking in Redis (7+ tests)

**Checkpoint**: Open311 ingestion operational — municipal reports from configured cities flow into the problem board

---

## Phase 7: User Story 3 — Human Submits a Local Observation (Priority: P1)

**Goal**: Observation submission API (attach to problem + standalone), GPS validation, pHash computation, media upload

**Independent Test**: Submit observation with valid GPS to existing problem → verify stored with location data → submit to null island → verify rejected → submit standalone → verify auto-creates problem

### Implementation

- [X] T034 [US3] Create observation service in `apps/api/src/services/observation.service.ts` — implement `validateGPS(lat, lng, accuracyMeters)` rejecting null island (lat===0 AND lng===0), polar (|lat|>80), low accuracy (>1000m); implement `validateProximity(observationLat, observationLng, problem)` checking distance < problem.radiusMeters + gpsAccuracyMeters using PostGIS ST_Distance; implement `computeLocationPoint(lat, lng)` returning PostGIS geography SQL; implement `createObservation(input, humanId)` that stores observation + increments problem.observationCount atomically; implement `createStandaloneObservation(input, humanId)` that auto-creates problem (using `system-municipal-311` agent as reportedByAgentId since problems.reportedByAgentId is NOT NULL, caption as description, GPS coords for location, geographicScope="neighborhood") + links observation in transaction; implement pHash computation for photo observations using existing blockhash-core pattern from Sprint 8
- [X] T035 [US3] Create observation routes in `apps/api/src/routes/observations.routes.ts` — implement POST `/api/v1/problems/:problemId/observations` (humanAuth, Zod validation, GPS validation, proximity check, media upload to Supabase Storage, pHash, create observation) per contracts/observations.yaml; implement POST `/api/v1/observations` (standalone, auto-create problem with `system-municipal-311` agent as reportedByAgentId); implement GET `/api/v1/observations/:id`; implement GET `/api/v1/problems/:problemId/observations` (cursor pagination, verificationStatus filter); add rate limiting (10 submissions/hour per human via Redis sliding window); mount in `apps/api/src/routes/v1.routes.ts`
- [X] T036 [US3] Write integration tests for observations in `apps/api/tests/integration/observations.test.ts` — test create observation attached to problem (observation stored, problem.observationCount incremented), test standalone observation auto-creates problem, test GPS validation rejects null island, test GPS validation rejects polar coordinates, test GPS validation rejects low accuracy, test proximity validation rejects distant observation, test pHash computed for photo, test rate limiting (6+ tests)

**Checkpoint**: Observation submission operational — humans can submit local observations with GPS verification

---

## Phase 8: User Story 5 — Validator Pool Initialized from Existing Agents (Priority: P2)

**Goal**: Backfill validator pool from qualifying agents, idempotent operation

**Independent Test**: Run backfill → verify qualifying agents appear in validator_pool at apprentice tier → run again → verify no duplicates

### Implementation

- [X] T037 [US5] Create validator pool backfill service in `apps/api/src/services/validator-pool.service.ts` — implement `backfillValidatorPool()` that selects all agents WHERE `is_active = true` AND `claim_status = 'verified'` (Drizzle: `agents.isActive` + `agents.claimStatus`) AND NOT EXISTS in validatorPool, inserts each as apprentice tier with initial metrics (f1Score=0, totalEvaluations=0, responseRate=1.0), uses ON CONFLICT (agent_id) DO NOTHING for idempotency; return count of newly added validators
- [X] T038 [US5] Create admin trigger for validator pool backfill — add POST `/api/v1/admin/validators/backfill` route in `apps/api/src/routes/admin/phase3.ts` (humanAuth + requireAdmin), calls backfillValidatorPool(), returns { addedCount, totalPoolSize }
- [X] T039 [US5] Write integration tests for validator pool in `apps/api/tests/integration/validator-pool.test.ts` — test backfill adds qualifying agents, test inactive agents excluded, test non-verified agents excluded, test idempotent (run twice, no duplicates), test initial metrics correct (3+ tests)

**Checkpoint**: Validator pool populated — ready for Sprint 11 peer validation assignment

---

## Phase 9: User Story 6 — Hyperlocal Scoring Engine (Priority: P2)

**Goal**: Scale-adaptive scoring — hyperlocal problems use urgency+actionability weights, global problems retain Phase 2 weights

**Independent Test**: Create neighborhood-scope problem with high urgency → score → verify hyperlocal weights applied → create global problem → verify Phase 2 weights preserved

### Implementation

- [X] T040 [US6] Create hyperlocal scoring service in `apps/api/src/services/hyperlocal-scoring.ts` — implement `computeScore(problem)` that checks geographicScope: if "neighborhood" or "city" use hyperlocal weights (urgency 0.30 + actionability 0.30 + feasibility 0.25 + communityDemand 0.15), else use Phase 2 weights (impact 0.40 + feasibility 0.35 + costEfficiency 0.25); implement helper `urgencyScore(localUrgency)` mapping immediate=100, days=75, weeks=50, months=25, null=50; implement `actionabilityScore(actionability)` mapping individual=100, small_group=75, organization=50, institutional=25, null=50; implement `communityDemandScore(problem)` based on observationCount + upvotes
- [X] T041 [US6] Integrate hyperlocal scoring into existing scoring pipeline — find the existing scoring engine in `apps/api/src/` and modify it to delegate to `computeScore()` from hyperlocal-scoring.ts for problems with geographicScope; preserve original behavior as default when scope is null/global/country
- [X] T042 [US6] Write unit tests for hyperlocal scoring in `apps/api/tests/unit/hyperlocal-scoring.test.ts` — test neighborhood scope uses hyperlocal weights, test city scope uses hyperlocal weights, test global scope uses Phase 2 weights, test null scope defaults to Phase 2, test urgency mapping values, test actionability mapping values, test community demand formula (5+ tests)

**Checkpoint**: Scoring engine is scale-adaptive — hyperlocal and global problems scored with appropriate weights

---

## Phase 10: User Story 7 — Admin Monitors Credit Supply and Validator Pool (Priority: P2)

**Goal**: Admin dashboard API endpoints for credit economy health and validator pool metrics; frontend dashboard components

**Independent Test**: Create agents with credits → hit admin credit stats endpoint → verify correct totals; backfill validators → hit admin validator stats → verify tier breakdown

### Implementation

- [X] T043 [US7] Create admin credit stats endpoint in `apps/api/src/routes/admin/phase3.ts` — implement GET `/api/v1/admin/credits/stats` per contracts/admin-phase3.yaml: query SUM(credit_balance) from agents, COUNT earn_starter_grant transactions, SUM positive/negative transactions, compute faucetSinkRatio, compute distribution stats (mean, median via percentile_cont, p90, max); require humanAuth + requireAdmin
- [X] T044 [US7] Create admin validator stats endpoint in `apps/api/src/routes/admin/phase3.ts` — implement GET `/api/v1/admin/validators/stats` per contracts/admin-phase3.yaml: query COUNT total/active/suspended from validatorPool, GROUP BY tier for breakdown, AVG f1Score, AVG responseRate, SUM dailyEvaluationCount for today; require humanAuth + requireAdmin
- [X] T045 [US7] Create admin Open311 stats endpoint in `apps/api/src/routes/admin/phase3.ts` — implement GET `/api/v1/admin/open311/stats` per contracts/admin-phase3.yaml: for each city config return enabled status, lastSyncAt from Redis, count ingested problems by municipalSourceType, last error from Redis
- [X] T046 [P] [US7] Create CreditEconomyDashboard component in `apps/web/src/components/admin/CreditEconomyDashboard.tsx` — React component fetching GET /api/v1/admin/credits/stats, display total credits in circulation, starter grants issued, faucet/sink ratio, distribution stats; use existing Card, Badge UI components; client component with React Query
- [X] T047 [P] [US7] Create ValidatorPoolDashboard component in `apps/web/src/components/admin/ValidatorPoolDashboard.tsx` — React component fetching GET /api/v1/admin/validators/stats, display pool size, tier breakdown (bar chart or stats cards), active vs suspended, average F1 score; use existing Card, Badge UI components
- [X] T048 [US7] Integrate Phase 3 admin components into admin page — add CreditEconomyDashboard and ValidatorPoolDashboard to the existing admin panel page (`apps/web/src/app/admin/` or equivalent), conditionally rendered

**Checkpoint**: Admin has visibility into credit economy and validator pool health

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final integration tests, regression verification, CLAUDE.md update

- [X] T049 Write cross-story integration tests in `apps/api/tests/integration/phase3-integration.test.ts` — test full flow: register agent → starter grant → verify credits; test Open311 ingest → problem created → observation attached; test feature flag disabled → Open311 worker skips; test all existing 944+ tests still pass (regression gate) (4+ tests)
- [X] T050 Run full test suite and fix any failures — execute `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, fix any TypeScript errors, ESLint violations, or test failures; verify total test count exceeds 960
- [X] T051 Update CLAUDE.md with Sprint 10 changes — add 011-phase3-foundation entry to Recent Changes section documenting: schema (8 new tables, 3 extensions, PostGIS), agent credits (starter grants, balance API), Open311 ingestion (Chicago + Portland adapters, BullMQ worker), observations (GPS validation, pHash), hyperlocal scoring, validator pool backfill, feature flags (Redis-backed, 8 flags), admin dashboard (credit + validator metrics), test count

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US4 PostGIS (Phase 3)**: Depends on Phase 2 — BLOCKS US2, US3 (spatial queries)
- **US1 Agent Credits (Phase 4)**: Depends on Phase 2 — independent of other stories
- **US8 Feature Flags (Phase 5)**: Depends on Phase 2 — US2 depends on flags for gating
- **US2 Open311 (Phase 6)**: Depends on Phase 3 (PostGIS) + Phase 5 (flags)
- **US3 Observations (Phase 7)**: Depends on Phase 3 (PostGIS)
- **US5 Validator Pool (Phase 8)**: Depends on Phase 2 only — independent
- **US6 Hyperlocal Scoring (Phase 9)**: Depends on Phase 2 only — independent
- **US7 Admin Dashboard (Phase 10)**: Depends on US1 + US5 (data to display)
- **Polish (Phase 11)**: Depends on all desired user stories being complete

### User Story Dependencies

```
Phase 1: Setup
    ↓
Phase 2: Foundational (schema + migration + feature flags service)
    ↓
    ├── Phase 3: US4 PostGIS ──┬──→ Phase 6: US2 Open311 (needs PostGIS + flags)
    │                          └──→ Phase 7: US3 Observations (needs PostGIS)
    ├── Phase 4: US1 Agent Credits (independent) ──→ Phase 10: US7 Admin (needs credit data)
    ├── Phase 5: US8 Feature Flags ──→ Phase 6: US2 Open311 (needs flag gating)
    ├── Phase 8: US5 Validator Pool (independent) ──→ Phase 10: US7 Admin (needs validator data)
    └── Phase 9: US6 Hyperlocal Scoring (independent)
         ↓
    Phase 11: Polish
```

### Within Each User Story

- Schema/models created in Phase 2 (shared foundation)
- Services before routes
- Routes before integration tests
- Tests verify acceptance scenarios

### Parallel Opportunities

- **Phase 1**: T003, T004, T005, T006, T007 can all run in parallel (different files)
- **Phase 2**: T008-T015 (8 new table schemas) can all run in parallel; T016, T017, T018 (table extensions) can run in parallel after new tables
- **After Phase 2**: US4 + US1 + US8 + US5 + US6 can all start in parallel
- **After Phase 3 (PostGIS)**: US2 and US3 can start in parallel
- **Phase 10**: T046, T047 (frontend components) can run in parallel

---

## Parallel Example: Phase 2 Foundation

```bash
# Launch all 8 new table schemas in parallel (different files, no deps):
Task T008: "Create validatorPool schema in packages/db/src/schema/validatorPool.ts"
Task T009: "Create peerEvaluations schema in packages/db/src/schema/peerEvaluations.ts"
Task T010: "Create consensusResults schema in packages/db/src/schema/consensusResults.ts"
Task T011: "Create agentCreditTransactions schema in packages/db/src/schema/agentCreditTransactions.ts"
Task T012: "Create creditConversions schema in packages/db/src/schema/creditConversions.ts"
Task T013: "Create observations schema in packages/db/src/schema/observations.ts"
Task T014: "Create problemClusters schema in packages/db/src/schema/problemClusters.ts"
Task T015: "Create disputes schema in packages/db/src/schema/disputes.ts"
```

## Parallel Example: After Phase 2

```bash
# Launch independent user stories in parallel:
Task T022: US4 "Extend geo-helpers with PostGIS query builders"
Task T024: US1 "Create agent credit service"
Task T028: US8 "Create admin feature flags routes"
Task T037: US5 "Create validator pool backfill service"
Task T040: US6 "Create hyperlocal scoring service"
```

---

## Implementation Strategy

### MVP First (US4 + US1 — PostGIS + Agent Credits)

1. Complete Phase 1: Setup (T001-T007)
2. Complete Phase 2: Foundation (T008-T021)
3. Complete Phase 3: US4 PostGIS (T022-T023)
4. Complete Phase 4: US1 Agent Credits (T024-T027)
5. **STOP and VALIDATE**: Agents receive credits, spatial queries work
6. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundation → Schema ready, feature flags operational
2. Add US4 PostGIS → Spatial infrastructure verified
3. Add US1 Agent Credits → Credit economy bootstrapped (MVP!)
4. Add US8 Feature Flags admin → Admin can toggle features
5. Add US2 Open311 → Municipal data flowing in
6. Add US3 Observations → Humans can submit observations
7. Add US5+US6 → Validator pool + hyperlocal scoring
8. Add US7 Admin Dashboard → Full operational visibility
9. Polish → Tests, regression verification, docs

---

## Notes

- [P] tasks = different files, no dependencies — safe to parallelize
- [Story] label maps task to specific user story for traceability
- Each user story should be independently testable at its checkpoint
- All Phase 3 features are behind feature flags — zero risk to Phase 2
- PostGIS migration is the critical path — must succeed before hyperlocal features
- Agent credit operations MUST use SELECT FOR UPDATE — no shortcuts on atomicity
- GPS validation MUST reject null island, polar, and low-accuracy — security boundary
- Total expected: 51 tasks, 20+ integration tests across all stories
