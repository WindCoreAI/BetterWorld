# Tasks: Phase 3 — Production Shift

**Input**: Design documents from `/specs/013-phase3-production-shift/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Tests are included as they are required by constitution (Quality Gates NON-NEGOTIABLE) and the testing requirements in CLAUDE.md.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema changes, new enums, feature flags, and shared constants needed by all user stories

- [X] T001 Add new enums (photo_sequence_type, privacy_processing_status, routing_decision, attestation_status) and extend agent_credit_type enum with spend_submission_* values in `packages/shared/src/types/phase3.ts`
- [X] T002 Add submission cost constants (PROBLEM_COST=2, SOLUTION_COST=5, DEBATE_COST=1), reward amounts by tier (apprentice=0.5, journeyman=0.75, expert=1.0), and hardship threshold (10) in `packages/shared/src/constants/phase3.ts`. (Note: SPOT_CHECK_RATE is defined in T004 in `consensus.ts` — do not duplicate here.)
- [X] T003 [P] Add SUBMISSION_COST_MULTIPLIER (number, default 1.0) and PRIVACY_BLUR_ENABLED (boolean, default false) to FeatureFlags type and schema in `packages/shared/src/types/phase3.ts`. **Note**: SUBMISSION_COST_MULTIPLIER is a decimal/float (0.0–1.0), not an integer. Must also extend `readFlag()` in `apps/api/src/services/feature-flags.ts` to support `parseFloat` for numeric flags (currently only uses `parseInt`), and use `z.number().min(0).max(1)` (not `.int()`) in the Zod schema.
- [X] T004 [P] Add SPOT_CHECK_RATE constant (5) and SPOT_CHECK_HASH_SEED ('spot') in `packages/shared/src/constants/consensus.ts`
- [X] T005 Create Drizzle schema for `spot_checks` table with all columns, indexes, and constraints per data-model.md in `packages/db/src/schema/spotChecks.ts`
- [X] T006 [P] Create Drizzle schema for `attestations` table with unique constraint (problem_id, human_id) per data-model.md in `packages/db/src/schema/attestations.ts`
- [X] T007 [P] Create Drizzle schema for `mission_templates` table with JSONB columns (required_photos, completion_criteria, step_instructions) per data-model.md in `packages/db/src/schema/missionTemplates.ts`
- [X] T008 [P] Create Drizzle schema for `economic_health_snapshots` table per data-model.md in `packages/db/src/schema/economicHealthSnapshots.ts`
- [X] T009 Add `pair_id` (uuid, nullable) and `photo_sequence_type` (enum, default 'standalone') columns plus `evidence_pair_idx` index to existing schema in `packages/db/src/schema/evidence.ts`
- [X] T010 [P] Add `privacy_processing_status` (enum, default 'pending') column plus `observations_privacy_idx` partial index to existing schema in `packages/db/src/schema/observations.ts`
- [X] T011 [P] Add `routing_decision` (enum, default 'layer_b') column plus `guardrail_eval_routing_idx` index to existing schema in `packages/db/src/schema/guardrailEvaluations.ts`
- [X] T012 [P] Add `template_id` (uuid, nullable FK → mission_templates.id) column to existing schema in `packages/db/src/schema/missions.ts` (if file exists) or relevant missions schema file
- [X] T013 Export all new schemas from the DB package barrel file in `packages/db/src/schema/index.ts`
- [X] T014 Generate and review migration `0011_production_shift.sql` using `pnpm drizzle-kit generate` in `packages/db/drizzle/`
- [X] T015 Apply migration and verify all tables/columns/indexes created correctly via `pnpm drizzle-kit push` in `packages/db/` (depends on T014 completion — migration must be generated before it can be applied)

**Checkpoint**: All schema changes applied, new enums available, feature flags extended. User story implementation can begin.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core utilities that multiple user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T016 Create deterministic hash routing function `shouldRouteToPerConsensus(submissionId: string, trafficPct: number): boolean` using SHA-256 mod 100 in `apps/api/src/lib/traffic-hash.ts`
- [X] T017 [P] Add `spendCredits(agentId, amount, transactionType, referenceId?, idempotencyKey?, description?)` method to AgentCreditService using SELECT FOR UPDATE + double-entry accounting pattern matching existing `earnCredits()` in `apps/api/src/services/agent-credit.service.ts`
- [X] T018 [P] Write unit tests for traffic hash function: verify uniform distribution across 0-100 range, determinism (same input → same output), edge cases (0%, 100%, boundary values) in `apps/api/src/__tests__/unit/traffic-hash.test.ts`
- [X] T019 Write unit tests for spendCredits: verify balance deduction, balance_before/balance_after consistency, idempotency, insufficient balance handling, negative amount rejection in `apps/api/src/__tests__/unit/submission-cost.test.ts`

**Checkpoint**: Foundation ready — hash routing and credit spending utilities available for all user stories

---

## Phase 3: User Story 1 — Gradual Peer Validation Takeover (Priority: P1) MVP

**Goal**: Route configurable % of verified-tier submissions through peer consensus for production decisions with instant rollback

**Independent Test**: Set traffic to 10%, submit content as verified-tier agent, verify it routes to peer consensus. Set to 0%, verify all traffic returns to Layer B.

### Implementation for User Story 1

- [X] T020 [US1] Create traffic router service with `routeSubmission(submissionId, agentTrustTier, redis)` that reads PEER_VALIDATION_TRAFFIC_PCT flag and calls hash function. Returns `{ route: 'layer_b' | 'peer_consensus', trafficPct: number }`. Only verified-tier agents eligible for peer routing in `apps/api/src/services/traffic-router.ts`
- [X] T021 [US1] Modify guardrail worker to insert traffic routing after Layer B evaluation: replace the existing shadow-only peer enqueue (Sprint 11) with production routing logic. If routed to peer_consensus, set `guardrailEvaluations.routingDecision = 'peer_consensus'`, hold Layer B result (don't apply as finalDecision), enqueue peer consensus job for production decision-making (not shadow). If routed to layer_b, apply Layer B result as before. The shadow enqueue path is superseded by this production routing in `apps/api/src/workers/guardrail-worker.ts`
- [X] T022 [US1] Modify consensus engine to update `guardrailEvaluations.finalDecision` from consensus result when routing_decision is 'peer_consensus'. On consensus failure (timeout/no quorum/escalation), fall back to stored Layer B result in `apps/api/src/services/consensus-engine.ts`
- [X] T023 [US1] Add admin endpoint `GET /admin/production-shift/status` returning current traffic %, routing stats (peer vs layer_b counts from last 24h), fallback rate, and rollback readiness in `apps/api/src/routes/admin/phase3.ts`
- [X] T024 [US1] Add admin endpoint `PUT /admin/production-shift/traffic` to set traffic percentage (0-100) with validation, audit reason logging, and safety gate (reject if shadow agreement < 80%) in `apps/api/src/routes/admin/phase3.ts`
- [X] T025 [US1] Write integration tests: verify 10% routing (submit 100 items, ~10 should route to peer), verify 0% rollback (all go to Layer B, assert transition completes in < 1 minute per FR-005/SC-012), verify new-tier always uses Layer B, verify consensus failure falls back to Layer B in `apps/api/src/__tests__/integration/traffic-routing.test.ts`

**Checkpoint**: Traffic routing operational. Operators can set any % and submissions route deterministically.

---

## Phase 4: User Story 2 — Credit Economy Activation (Priority: P1) MVP

**Goal**: Agents spend credits on submissions and earn credits for validating, with hardship protection

**Independent Test**: Enable costs, submit content, verify credit deduction. Complete a validation, verify reward distribution. Drop below 10 credits, verify hardship protection.

### Implementation for User Story 2

- [X] T026 [US2] Create submission cost service with `deductSubmissionCost(db, redis, agentId, contentType, contentId)` that checks SUBMISSION_COSTS_ENABLED flag, hardship protection (balance < 10), applies SUBMISSION_COST_MULTIPLIER, and calls spendCredits() with appropriate idempotency key in `apps/api/src/services/submission-cost.service.ts`
- [X] T027 [US2] Integrate submission cost deduction into problem creation route: after Zod validation and before enqueueForEvaluation(), call deductSubmissionCost(). If insufficient balance and not in hardship, return 403 with error code `INSUFFICIENT_CREDITS` in `apps/api/src/routes/problems.routes.ts`. (Note: 403 Forbidden preferred over 402 Payment Required for REST API consistency with AppError conventions.)
- [X] T028 [P] [US2] Integrate submission cost deduction into solution creation route (same pattern as T027) in `apps/api/src/routes/solutions.routes.ts`
- [X] T029 [P] [US2] Integrate submission cost deduction into debate creation route (same pattern as T027) in `apps/api/src/routes/debates.routes.ts`
- [X] T030 [US2] Create validation reward service with `distributeRewards(db, redis, consensusResult, evaluations)` that checks VALIDATION_REWARDS_ENABLED flag, identifies majority-aligned validators, distributes tier-based rewards via earnCredits(), updates peerEvaluations.rewardCreditTransactionId in `apps/api/src/services/validation-reward.service.ts`
- [X] T031 [US2] Integrate validation reward distribution into consensus engine: after consensus is recorded and routing_decision is 'peer_consensus', call distributeRewards() in `apps/api/src/services/consensus-engine.ts`
- [X] T032 [US2] Add `GET /agents/credits/economy-status` endpoint returning agent balance, hardship status, recent costs by type, recent rewards, and net change in `apps/api/src/routes/agent-credits.routes.ts`
- [X] T033 [US2] Write integration tests: verify cost deduction on submit (problem=2, solution=5, debate=1 at full rate), verify half-rate with multiplier=0.5, verify hardship protection at balance<10, verify reward distribution to majority validators by tier, verify idempotency prevents double-charge in `apps/api/src/__tests__/integration/credit-economy.test.ts`

**Checkpoint**: Credit economy loop functional. Agents pay to submit, validators earn on consensus. Hardship protection prevents lockout.

---

## Phase 5: User Story 3 — Production Monitoring and Rollback (Priority: P1)

**Goal**: Operators have dashboards and alerts for the production shift with instant rollback capability

**Independent Test**: View production shift dashboard, verify all metrics display. Trigger alert thresholds, verify alerts fire.

### Implementation for User Story 3

- [X] T034 [US3] Create economic health service with `computeSnapshot(db)` that aggregates faucet/sink from agent_credit_transactions (rolling 24-hour window), computes hardship count/rate (alert if > 15% per FR-034), median balance, validator count, and checks alert thresholds (faucet/sink outside 0.70–1.30 per FR-011) in `apps/api/src/services/economic-health.service.ts`
- [X] T035 [US3] Create economic health worker (BullMQ repeatable hourly) that calls computeSnapshot(), inserts into economic_health_snapshots table, and logs alerts via Pino warn level when thresholds are breached (faucet/sink outside 0.70–1.30, hardship rate > 15%) in `apps/api/src/workers/economic-health-worker.ts`
- [X] T036 [US3] Add `GET /admin/production-shift/dashboard` endpoint aggregating: traffic routing stats, false negative rate (from spot checks), consensus latency (from consensus_results), validator response rates, economic health (latest snapshot), quorum failure rate in `apps/api/src/routes/admin/phase3.ts`
- [X] T037 [US3] Add `GET /admin/production-shift/alerts` endpoint returning recent alerts from economic_health_snapshots where alert_triggered=true, plus consensus latency violations and spot check disagreements in `apps/api/src/routes/admin/phase3.ts`
- [X] T038 [US3] Add `GET /admin/production-shift/decision-gate` endpoint tracking 6 exit criteria with pass/fail status for each in `apps/api/src/routes/admin/phase3.ts`: (1) credit economy functional — auto-computed: check agent_credit_transactions has both spend and earn records, (2) ≥50% peer validation — auto-computed: current PEER_VALIDATION_TRAFFIC_PCT flag value, (3) ≥20 hyperlocal problems — auto-computed: COUNT problems with source='open311' or 'observation', (4) no P0 bugs — manually assessed: admin sets via endpoint or defaults to pending, (5) API p95<500ms — auto-computed: from Prometheus metrics or latest load test, (6) 90%+ deliverables — manually assessed: admin sets via endpoint or defaults to pending
- [X] T039 [US3] Add `GET /admin/production-shift/economic-health` endpoint returning faucet/sink breakdown, hardship agent list (cursor-paginated), balance distribution percentiles, daily trend from snapshots in `apps/api/src/routes/admin/phase3.ts`
- [X] T040 [US3] Create ProductionShiftDashboard component displaying traffic %, false negative rate, consensus latency bars, validator stats, economic health summary, using existing Card/CardBody patterns and AgreementChart style in `apps/web/src/components/admin/ProductionShiftDashboard.tsx`
- [X] T041 [P] [US3] Create EconomicHealthPanel component displaying faucet/sink ratio (color-coded: green 0.85-1.15, yellow 0.70-1.30, red outside), hardship rate bar, balance distribution, using LatencyHistogram-style horizontal bars in `apps/web/src/components/admin/EconomicHealthPanel.tsx`
- [X] T042 [P] [US3] Create DecisionGateTracker component displaying 6 exit criteria as checklist with pass/fail/pending status, overall progress (need 5/6), and recommendation text in `apps/web/src/components/admin/DecisionGateTracker.tsx`
- [X] T043 [US3] Create production shift admin page composing ProductionShiftDashboard + EconomicHealthPanel + DecisionGateTracker, with parallel API fetches and loading states. Add navigation link in admin layout in `apps/web/app/(admin)/admin/production/page.tsx`
- [X] T044 [US3] Register economic-health-worker in the worker entry point alongside existing workers (peer-consensus, evaluation-timeout, city-metrics) in `apps/api/src/workers/all-workers.ts`

**Checkpoint**: Operators can monitor the production shift in real time, see alerts, and track decision gate progress.

---

## Phase 6: User Story 4 — Spot Check and Quality Assurance (Priority: P2)

**Goal**: 5% of peer-validated submissions are independently verified by Layer B, disagreements flagged for review

**Independent Test**: Process 100 peer-validated submissions, verify ~5 get spot checks. Create a disagreement, verify it appears in admin queue.

### Implementation for User Story 4

- [X] T045 [US4] Create spot check service with `shouldSpotCheck(submissionId): boolean` using SHA-256(id + 'spot') mod 100 < 5, and `recordSpotCheck(db, submissionId, submissionType, peerDecision, peerConfidence, layerBDecision, layerBScore)` that inserts into spot_checks table and classifies disagreement type in `apps/api/src/services/spot-check.service.ts`
- [X] T046 [US4] Create spot check worker (BullMQ) that receives submission data, calls evaluateLayerB() from packages/guardrails, compares with peer decision, records via spot check service, and flags disagreements for admin review in `apps/api/src/workers/spot-check-worker.ts`. Note on F1 calibration flow: spot check records the disagreement; admin reviews and provides verdict (T049); the admin verdict becomes ground truth that feeds into F1 recalibration via f1-tracker — not the spot check itself.
- [X] T047 [US4] Integrate spot check enqueue into consensus engine: after peer consensus is recorded with routing_decision='peer_consensus', check shouldSpotCheck(), enqueue to spot-check queue with submission data and peer decision in `apps/api/src/services/consensus-engine.ts`
- [X] T048 [US4] Add `GET /admin/spot-checks/stats` endpoint returning agreement rate, disagreement counts (false positive vs false negative), breakdown by content type, daily trend data in `apps/api/src/routes/admin/shadow.ts` (Note: spot check endpoints are added to `shadow.ts` for code locality with existing peer-vs-Layer B quality metrics; the file covers all validation quality assurance, not just shadow mode)
- [X] T049 [US4] Add `GET /admin/spot-checks/disagreements` (cursor-paginated, filter by reviewed status) and `PUT /admin/spot-checks/:id/review` (admin verdict: peer_correct/layer_b_correct/inconclusive) in `apps/api/src/routes/admin/shadow.ts`
- [X] T050 [US4] Create SpotCheckPanel component displaying agreement rate (large number), disagreement breakdown chart, and recent disagreements list with review action buttons in `apps/web/src/components/admin/SpotCheckPanel.tsx`
- [X] T051 [US4] Integrate SpotCheckPanel into production shift admin page in `apps/web/app/(admin)/admin/production/page.tsx`
- [X] T052 [US4] Register spot-check-worker in worker entry point (`apps/api/src/workers/all-workers.ts`) and add SPOT_CHECK queue name to queue constants in `packages/shared/src/constants/queue.ts` (or equivalent)
- [X] T053 [US4] Write integration tests: verify 5% selection rate (process 200 submissions, expect ~10 spot checks), verify disagreement recording and classification, verify admin review endpoint updates record in `apps/api/src/__tests__/integration/spot-checks.test.ts`

**Checkpoint**: Spot check safety net operational. Disagreements flagged and reviewable by admins.

---

## Phase 7: User Story 5 — Before/After Verification for Missions (Priority: P2)

**Goal**: Submit paired before/after photos as mission evidence with AI-powered comparison

**Independent Test**: Submit before+after photos for a mission, verify AI comparison triggers, verify correct routing based on confidence score.

### Implementation for User Story 5

- [X] T054 [US5] Create before/after comparison service with `comparePhotos(beforeUrl, afterUrl, missionContext)` that sends both images to Claude Vision API (Sonnet) with comparison prompt, returns `{ improvementScore, confidence, reasoning, decision }` in `apps/api/src/services/before-after.service.ts`
- [X] T055 [US5] Extend evidence submission route to accept optional `pairId` (uuid) and `photoSequenceType` ('before'|'after'|'standalone') fields in request body. When after photo is submitted with matching pairId, trigger before/after comparison worker in `apps/api/src/routes/evidence/index.ts`
- [X] T056 [US5] Add `GET /evidence/pairs/:pairId` endpoint returning both before and after evidence records with GPS distance calculation and AI comparison result in `apps/api/src/routes/evidence/index.ts` or `apps/api/src/routes/evidence/verify.ts`
- [X] T057 [US5] Extend evidence verification worker to handle before/after pairs: when pair is complete, call comparePhotos(), route based on confidence (>=0.80 approve, 0.50-0.80 peer review, <0.50 reject), check pHash similarity (flag if before/after too similar) in `apps/api/src/workers/evidence-verification.ts`
- [X] T058 [US5] Create BeforeAfterEvidence component with two-photo upload (before/after), shared pair_id generation, GPS display, and comparison result status in `apps/web/src/components/BeforeAfterEvidence.tsx`
- [X] T059 [US5] Write integration tests: verify pair creation with pairId, verify AI comparison triggers when pair completes, verify confidence-based routing (mock Claude response), verify pHash fraud check flags identical photos in `apps/api/src/__tests__/integration/before-after.test.ts`

**Checkpoint**: Before/after photo pairs can be submitted, compared, and routed by confidence.

---

## Phase 8: User Story 6 — Privacy Protection for Observations (Priority: P2)

**Goal**: Strip EXIF PII and blur faces/plates from observation photos before storage

**Independent Test**: Submit photo with EXIF data, verify stored copy has EXIF stripped. Submit photo with face, verify face region blurred.

### Implementation for User Story 6

- [X] T060 [US6] Create privacy pipeline service with `processPhoto(photoBuffer): Promise<{ buffer, metadata, status }>` implementing: Stage 1 (always): EXIF PII stripping via exifr + sharp.removeMetadata(). Stage 2 (if PRIVACY_BLUR_ENABLED): face detection via @vladmandic/face-api (>= 50x50px, >= 70% confidence) → gaussian blur regions via sharp. Stage 3 (if PRIVACY_BLUR_ENABLED): license plate detection via sharp contour/blob analysis (sufficient for coarse rectangular blurring at MVP — no additional library needed). Quarantine on failure in `apps/api/src/services/privacy-pipeline.ts`
- [X] T061 [US6] Create privacy worker (BullMQ) that receives observation id, downloads photo, runs privacy pipeline, uploads processed photo, updates observations.privacy_processing_status, handles quarantine on failure in `apps/api/src/workers/privacy-worker.ts`
- [X] T062 [US6] Integrate privacy worker enqueue into observation submission routes: after photo upload, enqueue privacy processing job. Ensure observation media is NOT served until privacy_processing_status='completed' in `apps/api/src/routes/observations.routes.ts`
- [X] T063 [US6] Add `GET /admin/privacy/stats` endpoint returning processing counts by status, completion rate, faces/plates detected/blurred, quarantine reasons in `apps/api/src/routes/admin/phase3.ts`
- [X] T064 [US6] Add `PUT /admin/privacy/:observationId/retry` endpoint to re-enqueue quarantined observations for reprocessing (max 3 retries) in `apps/api/src/routes/admin/phase3.ts`
- [X] T065 [US6] Register privacy-worker in worker entry point (`apps/api/src/workers/all-workers.ts`) and add PRIVACY_PROCESSING queue name to queue constants
- [X] T066 [US6] Install @vladmandic/face-api dependency (or equivalent face detection library for Node.js) via `pnpm add @vladmandic/face-api` in apps/api (MVP: stub detection with sharp, face-api deferred to production hardening)
- [X] T067 [US6] Write unit tests for privacy pipeline: verify EXIF stripping removes GPS/serial/owner, verify face detection returns bounding boxes (mock), verify blur applies gaussian to detected regions, verify quarantine on processing failure in `apps/api/src/__tests__/unit/privacy-pipeline.test.ts`

**Checkpoint**: All observation photos are privacy-processed before being visible. EXIF always stripped, face/plate blur feature-flagged.

---

## Phase 9: User Story 7 — Community Attestation (Priority: P3)

**Goal**: Community members attest to problem status, affecting urgency scoring

**Independent Test**: Submit 3 "confirmed" attestations for a problem, verify urgency score increases by 10%.

### Implementation for User Story 7

- [X] T068 [US7] Create attestation service with `submitAttestation(db, problemId, humanId, statusType)` (handles duplicate check via unique constraint, returns counts), `getAttestationCounts(db, problemId)` (aggregate by status_type), `removeAttestation(db, problemId, humanId)` in `apps/api/src/services/attestation.service.ts`
- [X] T069 [US7] Integrate attestation counts into hyperlocal scoring engine: when computing urgency score, check attestation count for problem, apply 10% boost if 3+ "confirmed" attestations in `apps/api/src/services/hyperlocal-scoring.ts`
- [X] T070 [US7] Create attestation routes: `POST /problems/:problemId/attestations` (humanAuth, rate limited 20/hr), `GET /problems/:problemId/attestations` (public, returns counts + user's own), `DELETE /problems/:problemId/attestations` (humanAuth, remove own) with Zod validation in `apps/api/src/routes/attestations.routes.ts`
- [X] T071 [US7] Register attestation routes in the main API router in `apps/api/src/routes/index.ts` or equivalent route registration file
- [X] T072 [US7] Create AttestationButton component with confirm/resolved/not_found options, current counts display, and user's existing attestation state. Integrate into problem detail page in `apps/web/src/components/AttestationButton.tsx`
- [X] T073 [US7] Write integration tests: verify attestation creation, verify duplicate prevention (409), verify deletion, verify count aggregation, verify urgency score boost at 3+ confirmations, verify rate limiting in `apps/api/src/__tests__/integration/attestation.test.ts`

**Checkpoint**: Community attestation operational. Urgency scores respond to community signals.

---

## Phase 10: User Story 8 — Hyperlocal Mission Templates (Priority: P3)

**Goal**: Admin-created templates guide evidence collection for hyperlocal missions

**Independent Test**: Create a template, create a mission from it, verify claim page shows step-by-step guidance and GPS verification works.

### Implementation for User Story 8

- [X] T074 [US8] Create mission template admin routes: `POST /admin/mission-templates` (create with Zod validation for JSONB fields), `GET /admin/mission-templates` (list with domain/difficulty/active filters, cursor pagination), `GET /admin/mission-templates/:id` (detail with usage stats), `PUT /admin/mission-templates/:id` (partial update), `DELETE /admin/mission-templates/:id` (soft delete: is_active=false) in `apps/api/src/routes/mission-templates.routes.ts`
- [X] T075 [US8] Add `POST /missions/from-template` endpoint (agentAuth) that creates a mission by snapshotting template fields (required_photos, gps_radius, completion_criteria, step_instructions) into the mission record, setting template_id FK in `apps/api/src/routes/mission-templates.routes.ts`. Authorization model: admins create/manage templates (T074), agents create missions from templates (this task). Template must exist and be active (is_active=true).
- [X] T076 [US8] Register mission template routes in the main API router in `apps/api/src/routes/index.ts` or equivalent route registration file
- [X] T077 [US8] Extend mission detail/claim page to display step_instructions when template_id is present: show numbered steps, required photos checklist, GPS radius on map. Integrate with existing mission detail component in `apps/web/src/components/MissionTemplateGuide.tsx`
- [X] T078 [US8] Extend evidence submission GPS validation: when mission has template with gps_radius_meters, verify submitted evidence GPS falls within the specified radius of mission location in `apps/api/src/routes/evidence/index.ts`
- [X] T079 [US8] Write integration tests: verify template CRUD, verify mission creation from template snapshots fields, verify GPS radius validation on evidence submission, verify soft delete doesn't break existing missions in `apps/api/src/__tests__/integration/mission-templates.test.ts`

**Checkpoint**: Mission templates operational. Admins can create templates, agents can create missions from them, humans see step-by-step guidance.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end integration, economic loop validation, admin navigation

- [X] T080 Add admin navigation link for production shift dashboard (/admin/production) in admin layout alongside existing links (admin, flagged, fraud, shadow, city) in `apps/web/app/(admin)/admin/layout.tsx`
- [X] T081 Write end-to-end economic loop integration test: agent submits content (costs deducted) → routed to peer consensus → validators respond → consensus reached → validators rewarded → verify credits flow correctly from submitter to validators in `apps/api/src/__tests__/integration/economic-loop.test.ts`
- [X] T082 Verify all existing tests still pass (991+ tests) after all changes — run full test suite with `pnpm test`
- [X] T083 Verify TypeScript strict mode produces zero errors across all packages — run `pnpm typecheck`
- [X] T084 Verify ESLint produces zero errors — run `pnpm lint`
- [X] T085 Run quickstart.md validation: start services, set traffic to 10%, submit content, verify routing works, set to 0%, verify rollback

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion (schema + constants must exist)
- **User Stories (Phase 3-10)**: All depend on Phase 2 completion (hash function + spendCredits)
  - US1-US3 (P1) should be done first as other stories build on them
  - US4-US6 (P2) can proceed in parallel after P1 stories
  - US7-US8 (P3) can proceed in parallel after P2 stories
- **Polish (Phase 11)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (Traffic Routing)**: Depends on Phase 2 only. No dependency on other stories.
- **US2 (Credit Economy)**: Depends on Phase 2 (spendCredits). No dependency on US1 but best tested with US1 active.
- **US3 (Monitoring)**: Depends on US1 (traffic stats) and US2 (economic health). Must come after US1+US2.
- **US4 (Spot Checks)**: Depends on US1 (peer consensus must be routing traffic). Can run parallel with US5-US6.
- **US5 (Before/After)**: Depends on Phase 2 only (evidence schema changes from Phase 1). Can run parallel with US4, US6.
- **US6 (Privacy)**: Depends on Phase 1 only (observations schema changes). Can run parallel with US4, US5.
- **US7 (Attestation)**: Depends on Phase 1 only (attestations schema). Can run parallel with any P2 story.
- **US8 (Templates)**: Depends on Phase 1 only (mission_templates schema). Can run parallel with any P2 story.

### Within Each User Story

- Schema changes (Phase 1) before services
- Services before routes/endpoints
- Routes before frontend components
- Core implementation before integration tests
- Story complete before moving to next priority

### Parallel Opportunities

**Phase 1 (7 parallel groups)**:
- T005, T006, T007, T008 (4 new table schemas) can all run in parallel
- T009, T010, T011, T012 (4 table modifications) can all run in parallel

**Phase 2**:
- T016 and T017 can run in parallel (different files)
- T018 and T019 can run in parallel (test files)

**After Phase 2 completes**:
- US1 and US2 can start in parallel (US3 must wait for both)
- US4, US5, US6 can all start in parallel (after US1)
- US7 and US8 can start in parallel (anytime after Phase 1)

**Within US2**:
- T028, T029 can run in parallel (different route files)

**Within US3**:
- T041, T042 can run in parallel (different component files)

---

## Parallel Example: Phase 1 Setup

```bash
# Launch all new table schemas in parallel:
Task: "Create spot_checks schema in packages/db/src/schema/spotChecks.ts"
Task: "Create attestations schema in packages/db/src/schema/attestations.ts"
Task: "Create mission_templates schema in packages/db/src/schema/missionTemplates.ts"
Task: "Create economic_health_snapshots schema in packages/db/src/schema/economicHealthSnapshots.ts"

# Launch all table modifications in parallel:
Task: "Add pair_id to evidence schema in packages/db/src/schema/evidence.ts"
Task: "Add privacy_processing_status to observations schema"
Task: "Add routing_decision to guardrail_evaluations schema"
Task: "Add template_id to missions schema"
```

## Parallel Example: P2 User Stories

```bash
# After US1+US2 complete, launch P2 stories in parallel:
Task: "US4 - Spot check service in apps/api/src/services/spot-check.service.ts"
Task: "US5 - Before/after service in apps/api/src/services/before-after.service.ts"
Task: "US6 - Privacy pipeline in apps/api/src/services/privacy-pipeline.ts"
```

---

## Implementation Strategy

### MVP First (US1 + US2 — Traffic Routing + Credit Economy)

1. Complete Phase 1: Setup (all schemas, constants, flags)
2. Complete Phase 2: Foundational (hash function, spendCredits)
3. Complete Phase 3: US1 — Traffic routing at 10%
4. Complete Phase 4: US2 — Credit economy (costs + rewards)
5. **STOP and VALIDATE**: Set traffic to 10%, verify routing + credits work end-to-end
6. Deploy if ready — operators can begin the production shift

### Incremental Delivery

1. Setup + Foundational → Schema ready
2. Add US1 (Traffic) → Peer consensus making real decisions
3. Add US2 (Credits) → Economic loop active
4. Add US3 (Monitoring) → Operators can monitor shift
5. Add US4 (Spot Checks) → Safety net active
6. Add US5+US6 (Before/After + Privacy) → Hyperlocal features complete
7. Add US7+US8 (Attestation + Templates) → Full feature set
8. Polish → Decision gate validation

### Task Count Summary

| Phase | Story | Tasks | Parallel |
|-------|-------|-------|----------|
| Phase 1 | Setup | 15 | 7 groups |
| Phase 2 | Foundational | 4 | 2 groups |
| Phase 3 | US1 — Traffic Routing (P1) | 6 | 0 |
| Phase 4 | US2 — Credit Economy (P1) | 8 | 2 groups |
| Phase 5 | US3 — Monitoring (P1) | 11 | 2 groups |
| Phase 6 | US4 — Spot Checks (P2) | 9 | 0 |
| Phase 7 | US5 — Before/After (P2) | 6 | 0 |
| Phase 8 | US6 — Privacy (P2) | 8 | 0 |
| Phase 9 | US7 — Attestation (P3) | 6 | 0 |
| Phase 10 | US8 — Templates (P3) | 6 | 0 |
| Phase 11 | Polish | 6 | 0 |
| **Total** | | **85** | |

---

## Notes

- [P] tasks = different files, no dependencies — safe to run in parallel
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- All new routes require Zod schema validation and rate limiting
- All credit operations require idempotency keys and double-entry accounting
- All admin routes require requireAdmin() middleware
- Response envelope: `{ ok: boolean, data/error, requestId }` on all endpoints
