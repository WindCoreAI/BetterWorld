# Tasks: Phase 3 Integration (Sprint 13)

**Input**: Design documents from `/specs/014-phase3-integration/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup (DB Schema & Enums)

**Purpose**: Database migration and schema changes that ALL user stories depend on

- [ ] T001 [P] Add new enums (`evidence_review_status_enum`, `rate_direction_enum`) and extend `agentCreditTypeEnum` with 4 new values (`spend_dispute_stake`, `earn_dispute_refund`, `earn_dispute_bonus`, `earn_evidence_review`) in `packages/db/src/schema/enums.ts`. Note: `dispute_status_enum` already exists with values `open/admin_review/upheld/overturned/dismissed` — no changes needed.
- [ ] T002 [P] Extend existing `disputes` table in `packages/db/src/schema/disputes.ts` — the table already has: id, consensus_id FK, challenger_agent_id FK, stake_amount, stake_credit_transaction_id FK, reasoning, status (dispute_status_enum), admin_reviewer_id, admin_decision, admin_notes, resolved_at, stake_returned, bonus_paid, created_at. Verify schema matches Sprint 13 needs; add any missing columns if needed.
- [ ] T003 [P] Create `rate_adjustments` table schema in `packages/db/src/schema/rateAdjustments.ts` — id, adjustment_type, faucet_sink_ratio, reward/cost multiplier before/after, change_percent, circuit_breaker_active, period_start, period_end, triggered_by, created_at; indexes on created_at, (circuit_breaker_active, created_at)
- [ ] T004 [P] Create `evidence_review_assignments` table schema in `packages/db/src/schema/evidenceReviews.ts` — id, evidence_id FK, validator_id FK, validator_agent_id FK, capability_match, recommendation, confidence, reasoning, reward_amount, reward_transaction_id FK, status, assigned_at, responded_at, expires_at, created_at; indexes on evidence_id, validator_id, status, expires_at; unique (evidence_id, validator_id)
- [ ] T005 [P] Extend `validator_pool` table in `packages/db/src/schema/validatorPool.ts` — `capabilities` JSONB already exists (default {}), change default to []; add `disputeSuspendedUntil` timestamp(tz), `localValidationCount` integer (default 0), `globalValidationCount` integer (default 0)
- [ ] T006 [P] Extend `problem_clusters` table in `packages/db/src/schema/problemClusters.ts` — add `isSystemic` boolean (default false), `summaryGeneratedAt` timestamp(tz)
- [ ] T007 Export all new tables from `packages/db/src/schema/index.ts` and re-export relations
- [ ] T008 Generate and apply migration `0012_phase3_integration` via `pnpm --filter @betterworld/db generate && pnpm --filter @betterworld/db migrate`

**Checkpoint**: Migration applied, all existing 1096 tests still pass

---

## Phase 2: Foundational (Shared Constants & Types)

**Purpose**: Shared types, constants, and Zod schemas that multiple user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [ ] T009 [P] Add dispute constants to `packages/shared/src/constants/phase3.ts` — DISPUTE_STAKE_AMOUNT (10), DISPUTE_BONUS (5), DISPUTE_SUSPENSION_DAYS (60), DISPUTE_FAILURE_THRESHOLD (3), DISPUTE_FAILURE_WINDOW_DAYS (30)
- [ ] T010 [P] Add rate adjustment constants to `packages/shared/src/constants/phase3.ts` — RATE_ADJUSTMENT_STEP (0.10), RATE_ADJUSTMENT_CAP (0.20), FAUCET_SINK_UPPER (1.15), FAUCET_SINK_LOWER (0.85), CIRCUIT_BREAKER_RATIO (2.0), CIRCUIT_BREAKER_DAYS (3)
- [ ] T011 [P] Add evidence review constants to `packages/shared/src/constants/phase3.ts` — EVIDENCE_REVIEW_REWARD (1.5), EVIDENCE_REVIEW_EXPIRY_HOURS (1), MIN_EVIDENCE_REVIEWERS (3), VALIDATOR_CAPABILITIES allowlist (["vision", "document_review", "geo_verification"])
- [ ] T012 [P] Add domain specialization constants to `packages/shared/src/constants/phase3.ts` — SPECIALIST_F1_THRESHOLD (0.90), SPECIALIST_MIN_EVALUATIONS (50), SPECIALIST_REVOCATION_F1 (0.85), SPECIALIST_GRACE_EVALUATIONS (10), SPECIALIST_WEIGHT_MULTIPLIER (1.5)
- [ ] T013 [P] Add hybrid quorum constants to `packages/shared/src/constants/phase3.ts` — LOCAL_RADIUS_KM (50), LOCAL_QUORUM_SIZE (2), GLOBAL_QUORUM_SIZE (1), LOCAL_REWARD_MULTIPLIER (1.5)
- [ ] T014 [P] Add pattern aggregation constants to `packages/shared/src/constants/phase3.ts` — CLUSTER_RADIUS_KM (1), CLUSTER_MIN_SIZE (5), CLUSTER_SIMILARITY_THRESHOLD (0.85), SYSTEMIC_ISSUE_THRESHOLD (5)
- [ ] T015 [P] Add Zod schemas for dispute filing/resolution, rate adjustment override, evidence review submission in `packages/shared/src/schemas/` or extend existing schema file
- [ ] T016 [P] Add Denver city config to `packages/shared/src/constants/phase3.ts` — endpoint, category mappings (potholes, streetlights, graffiti, illegal_dumping), population

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Dispute Resolution (Priority: P1)

**Goal**: Validators challenge consensus decisions via credit staking; admins arbitrate

**Independent Test**: File a dispute → admin reviews → verify credit movement (refund+bonus or forfeit)

### Tests for US1

- [ ] T017 [P] [US1] Unit tests for dispute service in `apps/api/src/services/__tests__/dispute.service.test.ts` — fileDispute (stake deduction, eligibility, explicit self-dispute rejection test: "rejects dispute when challenger participated in the consensus decision", duplicate prevention), resolveDispute (upheld: stake returned + bonus paid, dismissed: stake forfeited), checkDisputeSuspension (30-day rolling window of dismissed disputes, 60-day suspension). Rate limit: add request-level rate limit test on POST /disputes.
- [ ] T018 [P] [US1] Route tests for dispute endpoints in `apps/api/src/routes/__tests__/disputes.routes.test.ts` — POST /disputes (validation, auth, insufficient credits, already disputed), GET /disputes (list own disputes), GET /disputes/:id (detail), GET /admin/disputes (admin queue), POST /admin/disputes/:id/resolve (admin verdict)

### Implementation for US1

- [ ] T019 [US1] Implement dispute service in `apps/api/src/services/dispute.service.ts` — `fileDispute(db, redis, agentId, consensusId, reasoning)`: validate consensus exists + not self-dispute (challenger not in consensus participants) + no open dispute for same consensus + not suspended (disputeSuspendedUntil) + sufficient credits (≥10); atomic transaction (SELECT FOR UPDATE agent, deduct stake via `spend_dispute_stake`, insert dispute with status `open`, insert credit transaction with idempotency key `dispute:{consensusId}:{agentId}`). Apply request-level rate limiting on the POST /disputes endpoint.
- [ ] T020 [US1] Implement `resolveDispute(db, disputeId, verdict, adminNotes, adminId)` in `apps/api/src/services/dispute.service.ts` — atomic transaction: if upheld → set status `upheld`, set stakeReturned=true, bonusPaid=true, refund 10 credits (`earn_dispute_refund`) + 5 credit bonus (`earn_dispute_bonus`); if rejected → set status `dismissed`, stake forfeited (stakeReturned/bonusPaid remain false); set adminReviewerId, adminDecision, adminNotes, resolvedAt; check if challenger hits suspension threshold → set disputeSuspendedUntil on validator_pool
- [ ] T021 [US1] Implement `checkDisputeSuspension(db, validatorId)` in `apps/api/src/services/dispute.service.ts` — COUNT disputes with status `dismissed` in 30-day window, compare to DISPUTE_FAILURE_THRESHOLD (3), check disputeSuspendedUntil timestamp on validator_pool
- [ ] T022 [US1] Implement dispute routes in `apps/api/src/routes/disputes.routes.ts` — POST /v1/disputes (file dispute, agent auth), GET /v1/disputes (list own, cursor pagination), GET /v1/disputes/:id (detail with ownership check), GET /v1/admin/disputes (admin queue, status filter), POST /v1/admin/disputes/:id/resolve (admin resolve with verdict + notes)
- [ ] T023 [US1] Register dispute routes in `apps/api/src/routes/index.ts`
- [ ] T024 [P] [US1] Create dispute filing UI component in `apps/web/src/components/disputes/DisputeForm.tsx` — reason textarea, stake amount display, confirmation dialog
- [ ] T025 [P] [US1] Create dispute card component in `apps/web/src/components/disputes/DisputeCard.tsx` — status badge, reason, verdict, credit outcome
- [ ] T026 [US1] Create dispute list page in `apps/web/app/disputes/page.tsx` — list own disputes with status filter
- [ ] T027 [US1] Create admin dispute queue page in `apps/web/app/admin/disputes/page.tsx` — pending disputes, review form, resolve action
- [ ] T028 [P] [US1] Create admin dispute review panel in `apps/web/src/components/admin/DisputeReviewPanel.tsx` — consensus details, challenger's reason, verdict buttons, admin notes field

**Checkpoint**: Dispute lifecycle fully functional — file, review, resolve, suspension

---

## Phase 4: User Story 2 — Credit Economy Self-Regulation (Priority: P1)

**Goal**: Automated weekly faucet/sink balancing with circuit breaker safety net

**Independent Test**: Simulate credit flow data → verify rate adjustment triggers → verify circuit breaker

### Tests for US2

- [ ] T029 [P] [US2] Unit tests for rate adjustment service in `apps/api/src/services/__tests__/rate-adjustment.service.test.ts` — calculateFaucetSinkRatio (trailing 7-day window, edge cases), applyRateAdjustment (increase/decrease/none, 20% cap), checkCircuitBreaker (3 consecutive days, reset)
- [ ] T030 [P] [US2] Route tests for admin rate endpoints in `apps/api/src/routes/__tests__/admin-rate.routes.test.ts` — GET /admin/rate-adjustments (history), POST /admin/rate-adjustments/override (manual override)
- [ ] T031 [P] [US2] Worker test for rate adjustment worker in `apps/api/src/workers/__tests__/rate-adjustment-worker.test.ts` — weekly cron scheduling, ratio calculation trigger, circuit breaker activation, admin webhook alert

### Implementation for US2

- [ ] T032 [US2] Implement rate adjustment service in `apps/api/src/services/rate-adjustment.service.ts` — `calculateFaucetSinkRatio(db, periodDays)`: SUM earn_* types / SUM spend_* types from agentCreditTransactions within trailing window
- [ ] T033 [US2] Implement `applyRateAdjustment(db, redis, ratio)` in `apps/api/src/services/rate-adjustment.service.ts` — determine direction (increase/decrease/none) based on thresholds (FAUCET_SINK_UPPER/LOWER), apply ±10% (capped at 20%), update Redis feature flags (SUBMISSION_COST_MULTIPLIER, VALIDATION_REWARD_MULTIPLIER), insert `rate_adjustments` row with before/after multiplier values for audit trail (FR-012)
- [ ] T034 [US2] Implement `checkCircuitBreaker(redis)` in `apps/api/src/services/rate-adjustment.service.ts` — read Redis sorted set `circuit:ratio:daily` (daily snapshots recorded by the existing economic-health hourly worker), check if last 3 entries all exceed CIRCUIT_BREAKER_RATIO (2.0), set RATE_ADJUSTMENT_PAUSED flag if triggered, send admin webhook alert
- [ ] T035 [US2] Implement rate adjustment worker in `apps/api/src/workers/rate-adjustment-worker.ts` — BullMQ repeatable job (weekly, `0 0 * * 0`), calculate ratio, check circuit breaker, apply adjustment if not paused, log results
- [ ] T036 [US2] Implement admin rate routes in `apps/api/src/routes/admin-rate.routes.ts` — GET /v1/admin/rate-adjustments (history with pagination), POST /v1/admin/rate-adjustments/override (manual multiplier set, admin auth + RBAC)
- [ ] T037 [US2] Register admin rate routes in `apps/api/src/routes/index.ts`
- [ ] T038 [US2] Register rate adjustment worker in worker entrypoint (alongside existing workers)
- [ ] T039 [P] [US2] Create rate adjustment admin panel component in `apps/web/src/components/admin/RateAdjustmentPanel.tsx` — current multipliers, adjustment history chart, circuit breaker status, manual override form
- [ ] T040 [US2] Add rate adjustment panel to admin dashboard page

**Checkpoint**: Weekly auto-adjustment runs, circuit breaker activates, admin can override

---

## Phase 5: User Story 3 — Evidence Review Economy (Priority: P2)

**Goal**: Validators earn credits by reviewing mission evidence; capability-based assignment

**Independent Test**: Submit evidence → assign reviewers → submit review → verify reward credited

### Tests for US3

- [ ] T041 [P] [US3] Unit tests for evidence review service in `apps/api/src/services/__tests__/evidence-review.service.test.ts` — assignEvidenceReviewers (capability filtering, vision priority, fallback to AI), submitEvidenceReview (recommendation validation, reward distribution, idempotency), expiration handling
- [ ] T042 [P] [US3] Route tests for evidence review endpoints in `apps/api/src/routes/__tests__/evidence-reviews.routes.test.ts` — GET /evidence-reviews/pending (list assigned), POST /evidence-reviews/:id/respond (submit review), GET /evidence-reviews/:id (detail)

### Implementation for US3

- [ ] T043 [US3] Implement evidence review service in `apps/api/src/services/evidence-review.service.ts` — `assignEvidenceReviewers(db, evidenceId, evidenceType)`: query validator_pool filtering by capabilities (JSONB containment for vision), exclude evidence submitter, select up to MIN_EVIDENCE_REVIEWERS, insert evidence_review_assignments with 1-hour expiry; fall back to AI review if insufficient candidates
- [ ] T044 [US3] Implement `submitEvidenceReview(db, reviewId, recommendation, confidence, reasoning)` in `apps/api/src/services/evidence-review.service.ts` — validate assignment exists + belongs to caller + not expired + not already completed; update assignment with recommendation/confidence/reasoning; atomic credit reward transaction (earn_evidence_review, 1.5 credits, idempotency key `evidence_review:${reviewId}`)
- [ ] T045 [US3] Implement evidence review routes in `apps/api/src/routes/evidence-reviews.routes.ts` — GET /v1/evidence-reviews/pending (list own pending assignments, agent auth), POST /v1/evidence-reviews/:id/respond (submit review), GET /v1/evidence-reviews/:id (detail with ownership check)
- [ ] T046 [US3] Register evidence review routes in `apps/api/src/routes/index.ts`
- [ ] T047 [US3] Hook evidence review assignment into existing evidence submission flow — when Claude Vision routes evidence to `peer_review` (confidence 0.50-0.80), call `assignEvidenceReviewers()` to assign qualified validators (gated by EVIDENCE_REVIEW_ENABLED flag). Modify the evidence-verification worker to trigger assignment after AI scoring.
- [ ] T048 [P] [US3] Create evidence review queue page in `apps/web/app/evidence-reviews/page.tsx` — list pending assignments, review form, submission
- [ ] T049 [P] [US3] Create evidence review components in `apps/web/src/components/evidence/` — EvidenceReviewCard, EvidenceReviewForm

**Checkpoint**: Validators receive assignments, submit reviews, earn credits

---

## Phase 6: User Story 4 — Domain Specialization (Priority: P2)

**Goal**: Per-domain F1 tracking with specialist designation and consensus weight multiplier

**Independent Test**: Validator accumulates 50+ domain evaluations with F1 >= 0.90 → earns specialist → consensus weight = 1.5x

### Tests for US4

- [ ] T050 [P] [US4] Unit tests for domain specialization service in `apps/api/src/services/__tests__/domain-specialization.test.ts` — updateDomainScore (correct/incorrect tracking, F1 computation), checkSpecialistDesignation (threshold check, grace period on revocation), getValidatorSpecializations
- [ ] T051 [P] [US4] Integration test for specialist consensus weight in `apps/api/src/services/__tests__/consensus-engine-specialist.test.ts` — verify specialist gets 1.5x weight in domain-matching consensus

### Implementation for US4

- [ ] T052 [US4] Implement domain specialization service in `apps/api/src/services/domain-specialization.ts` — `updateDomainScore(db, validatorId, domain, isCorrect)`: read current domain_scores JSONB, increment evaluations/correct counts, recalculate F1, write back; `checkSpecialistDesignation(db, validatorId, domain)`: check thresholds for designation (F1 >= 0.90, 50+ evals) and revocation (F1 < 0.85, grace period of 10 evals)
- [ ] T053 [US4] Integrate domain score updates into F1 tracker — modify `apps/api/src/services/f1-tracker.ts` to call `updateDomainScore()` after each evaluation, passing the submission's domain
- [ ] T054 [US4] Modify consensus engine for specialist weight — in `apps/api/src/services/consensus-engine.ts`, check if validator has specialist status for the submission's domain; if so, apply 1.5x multiplier to their vote weight
- [ ] T055 [US4] Add specialist info and local/global counts to validator routes — extend `apps/api/src/routes/validator.routes.ts` with specialist domains in validator stats response, per-validator specialization detail, and localValidationCount/globalValidationCount (FR-025)
- [ ] T056 [P] [US4] Add specialist badge display to frontend — create `apps/web/src/components/validators/SpecialistBadge.tsx` and integrate into validator profile views

**Checkpoint**: Specialists designated, weight multiplier applied in consensus

---

## Phase 7: User Story 5 — Hybrid Quorum & Local Bonuses (Priority: P2)

**Goal**: 2 local + 1 global validator assignment for hyperlocal problems; 1.5x local reward bonus

**Independent Test**: Create hyperlocal problem → verify 2+1 quorum → local validators get 1.5x reward

### Tests for US5

- [ ] T057 [P] [US5] Unit tests for hybrid quorum in `apps/api/src/services/__tests__/hybrid-quorum.test.ts` — assignHybridQuorum (2 local + 1 global composition, graceful degradation to 3 global, author exclusion from local pool)
- [ ] T058 [P] [US5] Unit tests for local reward bonus in `apps/api/src/services/__tests__/validation-reward-local.test.ts` — verify 1.5x multiplier for local validators, standard rate for global, local/global count increment

### Implementation for US5

- [ ] T059 [US5] Implement hybrid quorum logic — modify `apps/api/src/services/evaluation-assignment.ts` to detect hyperlocal problems (city/neighborhood scope), split candidates into local (<50km via ST_DWithin) and global pools, select 2 local + 1 global; degrade to 3 global if <2 local available
- [ ] T060 [US5] Implement local reward bonus — modify `apps/api/src/services/validation-reward.service.ts` to check if validator's home_region_point is within 50km of submission location; if local, multiply tier reward by 1.5x; increment localValidationCount or globalValidationCount on validator_pool
- [ ] T061 [US5] Track local/global validation counts — update validator_pool record after each completed validation with incremented local or global count

**Checkpoint**: Hybrid quorum assigned for hyperlocal, local bonus applied

---

## Phase 8: User Story 6 — Pattern Aggregation (Priority: P3)

**Goal**: Cluster similar hyperlocal problems into systemic issues with AI-generated summaries

**Independent Test**: Create 5+ similar problems within 1km → daily cron runs → cluster created with summary

### Tests for US6

- [ ] T062 [P] [US6] Unit tests for pattern aggregation service in `apps/api/src/services/__tests__/pattern-aggregation.test.ts` — findClusters (proximity + category + similarity filtering, systemic flag at 5+ members, single-cluster membership), generateClusterSummary (Claude Sonnet tool_use mock)
- [ ] T063 [P] [US6] Worker test for pattern aggregation worker in `apps/api/src/workers/__tests__/pattern-aggregation-worker.test.ts` — daily cron scheduling, feature flag gate, cluster creation flow
- [ ] T064 [P] [US6] Route tests for pattern endpoints in `apps/api/src/routes/__tests__/pattern.routes.test.ts` — GET /patterns (list clusters), GET /patterns/:id (detail), POST /admin/patterns/refresh (trigger re-clustering)

### Implementation for US6

- [ ] T065 [US6] Implement pattern aggregation service in `apps/api/src/services/pattern-aggregation.ts` — `findClusters(db, domain, city)`: fetch hyperlocal problems from last 30 days, group by domain+city, compute pairwise PostGIS distances (ST_Distance), form clusters within 1km of centroid, check pgvector cosine similarity on existing `embedding` column (threshold 0.85, skip similarity check for problems without embeddings), flag clusters with 5+ members as systemic; `generateClusterSummary(problems)`: call Claude Sonnet with tool_use to produce human-readable summary. Note: relies on problem embeddings generated during submission (Voyage AI). Problems without embeddings are clustered by proximity+category only.
- [ ] T066 [US6] Implement pattern aggregation worker in `apps/api/src/workers/pattern-aggregation-worker.ts` — BullMQ repeatable job (daily, `0 3 * * *`), iterate cities × domains, call findClusters, update/create problem_clusters records, generate summaries for new clusters, gate with PATTERN_AGGREGATION_ENABLED flag
- [ ] T067 [US6] Implement pattern routes in `apps/api/src/routes/pattern.routes.ts` — GET /v1/patterns (list clusters with domain/city/systemic filters, cursor pagination), GET /v1/patterns/:id (cluster detail with member problems), POST /v1/admin/patterns/refresh (trigger immediate re-clustering, admin auth)
- [ ] T068 [US6] Register pattern routes in `apps/api/src/routes/index.ts` and register pattern aggregation worker
- [ ] T069 [P] [US6] Create pattern cluster view component in `apps/web/src/components/admin/PatternClusterView.tsx` — cluster map, member problem list, summary, systemic badge
- [ ] T070 [US6] Create admin patterns page in `apps/web/app/admin/patterns/page.tsx` — cluster list with filters, detail view, refresh trigger

**Checkpoint**: Daily clustering runs, systemic issues flagged, summaries generated

---

## Phase 9: User Story 7 — Denver Expansion (Priority: P3)

**Goal**: Denver onboarded as third city for Open311 ingestion

**Independent Test**: Trigger Denver ingestion → problems created with correct categories → appears in city selector

### Tests for US7

- [ ] T071 [P] [US7] Unit tests for Denver ingestion in `apps/api/src/services/__tests__/open311-denver.test.ts` — Denver config validation, category mapping (potholes, streetlights, graffiti, illegal_dumping), deduplication, sync timestamp
- [ ] T072 [P] [US7] Integration test verifying Denver appears in city configs and city selector

### Implementation for US7

- [ ] T073 [US7] Add Denver to OPEN311_CITY_CONFIGS in `packages/shared/src/constants/phase3.ts` — endpoint URL (placeholder: `https://www.denvergov.org/open311/v2`, must be verified against Denver PocketGov API before production), service code mappings for potholes/streetlights/graffiti/illegal_dumping, population (715,522), enabled: false by default
- [ ] T074 [US7] Verify existing `apps/api/src/services/open311.service.ts` handles Denver config without modification (GeoReport v2 standard)
- [ ] T075 [US7] Add Denver to city list in municipal ingestion worker — ensure `apps/api/src/workers/municipal-ingest.ts` picks up Denver from city configs
- [ ] T076 [US7] Update city selector in frontend to include Denver — ensure city dashboard and city metrics pages list Denver alongside Portland and Chicago

**Checkpoint**: Denver ingestion operational, appears in all city views

---

## Phase 10: User Story 8 — Cross-City Dashboard (Priority: P3)

**Goal**: Comparative metrics dashboard across all operational cities

**Independent Test**: With data from 3 cities → dashboard shows side-by-side per-capita metrics

### Tests for US8

- [ ] T077 [P] [US8] Unit tests for cross-city service in `apps/api/src/services/__tests__/cross-city.test.ts` — per-capita normalization, comparative metrics (problem counts, resolution times, validator density), multi-city aggregation
- [ ] T078 [P] [US8] Route tests for cross-city endpoints in `apps/api/src/routes/__tests__/cross-city.routes.test.ts` — GET /cross-city/compare (all metrics), GET /cross-city/compare/:metric (single metric detail)

### Implementation for US8

- [ ] T079 [US8] Implement cross-city service in `apps/api/src/services/cross-city.service.ts` — `getComparativeMetrics(db)`: query per-city problem counts (GROUP BY city), observation counts, average resolution times, validator counts; normalize by population from city configs; return all cities in single response
- [ ] T080 [US8] Implement cross-city routes in `apps/api/src/routes/cross-city.routes.ts` — GET /v1/cross-city/compare (full comparison), GET /v1/cross-city/compare/:metric (single metric like problems_per_capita, resolution_time, validator_density)
- [ ] T081 [US8] Register cross-city routes in `apps/api/src/routes/index.ts`
- [ ] T082 [P] [US8] Create cross-city dashboard component in `apps/web/src/components/admin/CrossCityDashboard.tsx` — bar charts for per-capita metrics, category distribution comparison, validator density map
- [ ] T083 [US8] Create admin cross-city page in `apps/web/app/admin/cross-city/page.tsx` — render CrossCityDashboard with data fetching

**Checkpoint**: Cross-city comparison renders with normalized metrics

---

## Phase 11: User Story 9 — Offline Observation Support (Priority: P4)

**Goal**: PWA with offline observation queuing via IndexedDB + Background Sync

**Independent Test**: Disable network → submit observation → re-enable → observation uploads

### Tests for US9

- [ ] T084 [P] [US9] Unit tests for offline queue logic in `apps/web/src/lib/__tests__/offline-queue.test.ts` — queue observation, dequeue on sync, persist across sessions, retry with backoff
- [ ] T085 [P] [US9] PWA manifest validation — verify manifest.json has required fields (name, icons, start_url, display: standalone)

### Implementation for US9

- [ ] T086 [US9] Create PWA manifest in `apps/web/public/manifest.json` — name, short_name, description, start_url, display: standalone, theme_color, background_color, icons (192x192, 512x512)
- [ ] T087 [US9] Create PWA icons in `apps/web/public/icons/` — icon-192.png, icon-512.png (BetterWorld branding)
- [ ] T088 [US9] Create service worker in `apps/web/public/sw.js` — Workbox strategies: NetworkFirst for navigation, StaleWhileRevalidate for API reads (problem lists), Background Sync for observation submissions. Prerequisite: add `workbox-precaching`, `workbox-routing`, `workbox-strategies`, `workbox-background-sync` to `apps/web/package.json` devDependencies, or implement equivalent strategies manually without Workbox.
- [ ] T089 [US9] Implement offline observation queue in `apps/web/src/lib/offline-queue.ts` — IndexedDB storage (idb-keyval), queue observation with photos + GPS, dequeue on Background Sync trigger, exponential backoff retry (initial delay: 1s, max delay: 5min, max retries: 10), persist across sessions/logouts
- [ ] T090 [US9] Register service worker in Next.js — add registration script in `apps/web/app/layout.tsx` or dedicated `apps/web/src/components/ServiceWorkerRegistration.tsx`
- [ ] T091 [US9] Create install prompt component in `apps/web/src/components/pwa/InstallPrompt.tsx` — detect `beforeinstallprompt` event, show install banner
- [ ] T092 [US9] Create offline indicator component in `apps/web/src/components/pwa/OfflineIndicator.tsx` — detect online/offline state, show status bar
- [ ] T093 [US9] Create queue status component in `apps/web/src/components/pwa/QueueStatus.tsx` — show pending observations count, upload progress, retry status
- [ ] T094 [US9] Add `<link rel="manifest">` to `apps/web/app/layout.tsx` and meta tags for PWA (theme-color, apple-mobile-web-app-capable)

**Checkpoint**: PWA installable, observations queue offline and sync on reconnect

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Integration tests, performance, code quality

- [ ] T095 [P] Integration test: dispute lifecycle (file → admin review → credit movement) in `apps/api/src/services/__tests__/dispute-lifecycle.integration.test.ts`
- [ ] T096 [P] Integration test: evidence submission → peer review → reward in `apps/api/src/services/__tests__/evidence-review-lifecycle.integration.test.ts`
- [ ] T097 [P] Integration test: rate adjustment trigger → multiplier update → circuit breaker in `apps/api/src/services/__tests__/rate-adjustment-lifecycle.integration.test.ts`
- [ ] T098 [P] Integration test: specialist designation → consensus weight → reward in `apps/api/src/services/__tests__/specialist-consensus.integration.test.ts`
- [ ] T099 [P] Integration test: hybrid quorum composition → local bonus in `apps/api/src/services/__tests__/hybrid-quorum-lifecycle.integration.test.ts`
- [ ] T100 [P] Integration test: pattern aggregation cluster → systemic flag → summary in `apps/api/src/services/__tests__/pattern-aggregation-lifecycle.integration.test.ts`
- [ ] T101 [P] Integration test: Denver ingestion → city dashboard → cross-city compare in `apps/api/src/services/__tests__/denver-cross-city.integration.test.ts`
- [ ] T102 Performance: Add PostGIS GIST indexes on `validator_pool.home_region_point` and problem location columns if not present, verify ST_DWithin queries use spatial index
- [ ] T103 Performance: Add Redis cache for validator locations (1hr TTL, key `validator:locations:{tier}`) to avoid repeated spatial lookups during consensus
- [ ] T104 TypeScript strict mode zero errors across all new files — run `pnpm typecheck`
- [ ] T105 ESLint zero errors across all new files — run `pnpm lint`
- [ ] T106 Run full test suite (`pnpm test`) and verify all tests pass (existing 1096 + new)
- [ ] T107 Run quickstart.md validation — verify dev setup instructions still work
- [ ] T108 [Verification only] Confirm all new routes are registered in `apps/api/src/routes/index.ts` — disputes, admin-rate, evidence-reviews, pattern, cross-city (each was registered in its US phase; this is a final consistency check)
- [ ] T109 Add AI cost comparison metric for SC-001 validation — create a query or dashboard metric comparing current AI verification spend (Redis `ai:budget:*` counters) to Phase 2 baseline, verify ≥80% reduction target
- [ ] T110 [P] Add `OFFLINE_PWA_ENABLED` feature flag to gate service worker registration — add to feature flags constants and check in T090's registration logic, allowing PWA to be disabled without code change

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (enums + tables must exist for constants to reference)
- **User Stories (Phases 3-11)**: All depend on Phase 2 completion
  - **US1 (Disputes)** and **US2 (Rate Adjustment)** can proceed in parallel — different services/routes
  - **US3 (Evidence Review)** can proceed in parallel with US1/US2 — independent service
  - **US4 (Domain Specialization)** depends on existing F1 tracker, can proceed in parallel with US1-US3
  - **US5 (Hybrid Quorum)** depends on existing evaluation-assignment, can proceed in parallel with US1-US4
  - **US6 (Pattern Aggregation)** depends on existing problem_clusters, can proceed in parallel with US1-US5
  - **US7 (Denver)** depends on existing Open311 pipeline, can proceed in parallel with US1-US6
  - **US8 (Cross-City)** benefits from US7 (Denver data), but can be developed with Portland+Chicago data
  - **US9 (Offline PWA)** is fully independent (frontend-only) — can proceed in parallel with all others
- **Polish (Phase 12)**: Depends on all desired user stories being complete

### Within Each User Story

- Tests should be written alongside implementation (test file + service file)
- Schema/constants before services
- Services before routes
- Routes before frontend
- Core implementation before integration with existing systems

### Parallel Opportunities

- All Phase 1 tasks (T001-T006) can run in parallel — different schema files
- All Phase 2 tasks (T009-T016) can run in parallel — different constant sections
- US1 through US9 can proceed in parallel after Phase 2 (if team capacity allows)
- Within each US, tests marked [P] can run in parallel with each other
- Frontend components marked [P] can be built in parallel with backend
- All Phase 12 integration tests (T095-T101) can run in parallel

---

## Implementation Strategy

### MVP First (P1 Stories Only)

1. Complete Phase 1: Setup (T001-T008)
2. Complete Phase 2: Foundational (T009-T016)
3. Complete Phase 3: US1 — Dispute Resolution (T017-T028)
4. Complete Phase 4: US2 — Credit Economy Self-Regulation (T029-T040)
5. **STOP and VALIDATE**: Both P1 stories functional and tested
6. Run integration tests for P1 features

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 + US2 → Test → P1 MVP delivered
3. Add US3 + US4 + US5 → Test → P2 features delivered
4. Add US6 + US7 + US8 → Test → P3 features delivered
5. Add US9 → Test → P4 offline support delivered
6. Polish phase → All integration tests pass → Sprint 13 complete

### Parallel Team Strategy

With multiple developers:
1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (Disputes) + US2 (Rate Adjustment)
   - Developer B: US3 (Evidence Review) + US4 (Domain Specialization) + US5 (Hybrid Quorum)
   - Developer C: US6 (Pattern Aggregation) + US7 (Denver) + US8 (Cross-City)
   - Developer D: US9 (Offline PWA)
3. All merge → integration tests → polish

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Feature flags gate all new features — safe to deploy incrementally
- SC-003 (100+ validators) is an ops/marketing deliverable, not a code task — validator pool growth depends on agent onboarding, not Sprint 13 implementation
- Total: 110 tasks across 12 phases
