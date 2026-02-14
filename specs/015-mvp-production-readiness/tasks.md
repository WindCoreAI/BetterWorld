# Tasks: MVP Production Readiness

**Input**: Design documents from `/specs/015-mvp-production-readiness/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-changes.md, quickstart.md

**Tests**: Tests are included as they are explicitly required by spec FR-031/032/033.

**Organization**: Tasks are grouped by user story. 8 user stories (4 P1 + 4 P2), 35 functional requirements. 78 tasks total.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new dependencies and configure shared tooling needed across multiple stories

- [X] T001 [P] Install `@vladmandic/face-api` and `@sentry/node` in `apps/api/package.json`
- [X] T002 [P] Install `@sentry/nextjs` in `apps/web/package.json`
- [X] T003 [P] Install frontend test dependencies (`vitest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`) in `apps/web/package.json`
- [X] T004 [P] Install `@playwright/test` in root `package.json` and run `npx playwright install`
- [X] T005 [P] Upgrade `pino` from `^8.17.2` to `^9.6.0` in `packages/guardrails/package.json` (FR-035)
- [X] T006 Run `pnpm install` to update lockfile after all dependency changes

**Checkpoint**: All dependencies installed. Lockfile updated. `pnpm install --frozen-lockfile` passes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infrastructure changes that multiple user stories depend on

**⚠️ CRITICAL**: These must complete before user story work begins

- [X] T007 Create Drizzle migration `0013_mission_postgis_location` in `packages/db/drizzle/` — add `location geography(Point, 4326)` column to missions table, backfill from `requiredLatitude`/`requiredLongitude`, create GIST index `idx_missions_location` (FR-005, data-model.md)
- [X] T008 [P] Add `location` column definition to missions schema in `packages/db/src/schema/missions.ts` using the existing custom `geography(Point, 4326)` Drizzle type
- [X] T009 [P] Create Sentry initialization module in `apps/api/src/lib/sentry.ts` — init with `SENTRY_DSN` env var, configure PII scrubbing via `beforeSend` to strip emails/tokens, environment tags (FR-024)
- [X] T010 [P] Create frontend Vitest configuration in `apps/web/vitest.config.ts` — jsdom environment, setup file, include `src/**/*.test.{ts,tsx}`, coverage with v8 provider
- [X] T011 [P] Create frontend test setup file in `apps/web/src/__tests__/setup.ts` — import `@testing-library/jest-dom`, mock `window.matchMedia`, mock `next/navigation`
- [X] T012 [P] Add `"test"`, `"test:watch"`, and `"test:coverage"` scripts to `apps/web/package.json`
- [X] T013 Run migration `0013_mission_postgis_location` against local database and verify backfill

**Checkpoint**: Migration applied. Sentry configured. Frontend test infrastructure ready. `pnpm --filter @betterworld/web test` runs (even if no tests yet).

---

## Phase 3: User Story 1 — Automated Guardrail Evaluation (Priority: P1) 🎯 MVP

**Goal**: Fix the guardrail worker so content is automatically evaluated through the 3-layer pipeline without manual admin intervention.

**Independent Test**: Submit content via agent API → verify it flows through Layer A + Layer B → arrives at correct disposition.

### Implementation

- [X] T014 [US1] Convert dynamic imports to static imports in `apps/api/src/workers/guardrail-worker.ts` — replace `await import("../services/traffic-router.js")` (line ~227) and `await import("../services/feature-flags.js")` (line ~410) with top-level static imports (FR-001, research R1)
- [X] T015 [US1] Add BullMQ `jobId` to peer-consensus enqueue in `apps/api/src/workers/guardrail-worker.ts` — use `jobId: \`peer-${contentType}-${contentId}\`` at lines ~293-311 (production routing) and ~414-431 (shadow mode) to prevent duplicate peer consensus jobs on retry (FR-007, research R7)
- [X] T016 [US1] Verify guardrail worker starts without errors by running `pnpm --filter @betterworld/api dev:worker` in development mode and confirming no `ERR_MODULE_NOT_FOUND` for traffic-router or feature-flags

### Tests

- [X] T017 [US1] Write test in `apps/api/src/__tests__/guardrail-worker-fix.test.ts` — verify static imports resolve correctly, verify peer consensus enqueue includes jobId, verify duplicate enqueue with same jobId is idempotent (FR-001, FR-007)

**Checkpoint**: Guardrail worker starts in dev mode. Layer A → Layer B → Layer C pipeline runs automatically. Peer consensus enqueue is idempotent.

---

## Phase 4: User Story 2 — Reliable Platform Performance (Priority: P1)

**Goal**: Fix N+1 queries, debate depth walkback, PostGIS geo-search, and remaining worker idempotency/reliability gaps.

**Independent Test**: Measure evaluations endpoint <500ms for 100 items, geo-search <200ms, zero duplicate records on worker retry.

### Performance Fixes

- [X] T018 [US2] Fix N+1 query in `apps/api/src/routes/evaluations.routes.ts` (lines ~74-124) — replace `Promise.all()` with per-evaluation queries with batch fetch using `inArray()` to load all problems/solutions/debates in 1-3 queries, then map results to evaluations in memory (FR-003)
- [X] T019 [P] [US2] Replace `getThreadDepth()` loop in `apps/api/src/routes/debates.routes.ts` (lines ~27-43) with a PostgreSQL recursive CTE that calculates depth in a single query (FR-004, research R6)
- [X] T020 [P] [US2] Move debate pagination filter from JavaScript post-fetch (lines ~121-126 in `apps/api/src/routes/debates.routes.ts`) to the SQL WHERE clause so `guardrail_status` and agent visibility are filtered before pagination (FR-006)
- [X] T021 [US2] Replace Haversine formula in `apps/api/src/routes/missions/index.ts` (lines ~434-443) with `ST_DWithin(location, ST_MakePoint(lng, lat)::geography, radius_meters)` using the new PostGIS column. Also update mission creation to populate the `location` column when `requiredLatitude`/`requiredLongitude` are provided (FR-005, data-model.md)

### Worker Reliability Fixes

- [X] T022 [P] [US2] Add idempotency check in `apps/api/src/workers/peer-consensus.ts` (lines ~89-97) — before calling `assignValidators()`, query existing `peer_evaluations` for the submission to skip if validators are already assigned (FR-007, research R7)
- [X] T023 [P] [US2] Add idempotency key to rate adjustment worker in `apps/api/src/workers/rate-adjustment-worker.ts` — use `jobId: \`rate-adj-${isoYearWeek}\`` on the repeatable job registration to prevent duplicate weekly runs (FR-009, research R7)
- [X] T024a [P] [US2] Add BullMQ `jobId` to fraud-scoring worker enqueue in `apps/api/src/workers/fraud-scoring.ts` — use `jobId: \`fraud-${evidenceId}\`` to prevent duplicate fraud scoring jobs on retry (FR-007, research R7)
- [X] T024 [P] [US2] Replace direct `postgres()` client creation in `apps/api/src/workers/municipal-ingest.ts` (lines ~85-90) with `getDb()` singleton from `apps/api/src/lib/container.ts` (FR-010)
- [X] T025 [P] [US2] Add `removeOnComplete: { count: 100 }` and `removeOnFail: { count: 50 }` retention policies to `queue.add()` calls in each of these worker files: `guardrail-worker.ts`, `evidence-verification.ts`, `fraud-scoring.ts`, `peer-consensus.ts`, `municipal-ingest.ts`, `privacy-worker.ts`, `pattern-aggregation.ts`, `spot-check.ts`, `reputation-decay.ts`, `evaluation-timeout.ts`, `economic-health.ts`, `rate-adjustment-worker.ts`, `city-metrics.ts` in `apps/api/src/workers/` (FR-011)
- [X] T026 [P] [US2] Add per-item try-catch in `apps/api/src/workers/reputation-decay.ts` batch processing — wrap each human's `applyDecay()` call so one failure doesn't block the batch (FR-012). Apply same pattern to evaluation-timeout worker per-evaluation processing

### Tests

- [X] T027 [US2] Write test in `apps/api/src/__tests__/evaluation-batch.test.ts` — mock 50 pending evaluations across problem/solution/debate types, verify exactly 3 batch queries issued (not 50), verify response shape matches contract (FR-003)
- [X] T028 [P] [US2] Write test in `apps/api/src/__tests__/worker-idempotency.test.ts` — verify peer-consensus skips if evaluations exist for submission, verify rate-adjustment jobId prevents duplicate runs, verify municipal-ingest uses shared DB pool (FR-007, FR-009, FR-010)

**Checkpoint**: Evaluations endpoint loads in <500ms. Debate threads resolve in 1 query. Geo-search uses PostGIS index. Worker retries produce zero duplicates.

---

## Phase 5: User Story 3 — Frontend Error Handling & Auth Recovery (Priority: P1)

**Goal**: Fix token refresh race condition, auth wrapper usage, network error handling, and add error/404 pages.

**Independent Test**: Simulate expired token during POST → no auto-retry. Network failure → error message with retry button.

### Implementation

- [X] T029 [US3] Fix token refresh race condition in `apps/web/src/lib/humanApi.ts` (lines ~35-54) — check request method before auto-retry: only retry GET/HEAD requests after token refresh, for POST/PUT/PATCH/DELETE return an error indicating the user must retry manually (FR-013)
- [X] T030 [P] [US3] Replace manual auth header in `apps/web/app/missions/[id]/submit/page.tsx` (lines ~45-61) with `humanFetch()` wrapper from `apps/web/src/lib/humanApi.ts` — remove manual `getHumanToken()` + header construction, use the centralized auth client instead (FR-014)
- [X] T031 [P] [US3] Add error handling to mission marketplace in `apps/web/app/missions/page.tsx` (lines ~37-38) — replace empty `catch {}` with error state: `setError("Failed to load missions")`, render error message with retry button using `onClick={() => fetchMissions()}` (FR-015)
- [X] T032 [P] [US3] Add authentication credentials to disputes list fetch in `apps/web/app/disputes/page.tsx` (line ~30) — replace plain `fetch()` with `humanFetch()` or add `credentials: "include"` and Authorization header (FR-016)
- [X] T033 [P] [US3] Create global error boundary in `apps/web/app/error.tsx` — Next.js error boundary component with "Something went wrong" message, "Try again" button calling `reset()`, and "Go home" link to `/` (FR-017)
- [X] T034 [P] [US3] Create custom 404 page in `apps/web/app/not-found.tsx` — styled page with "Page not found" message and navigation links back to dashboard/home (FR-018)
- [X] T035 [US3] Add credit balance check to dispute form in `apps/web/src/components/disputes/DisputeForm.tsx` (lines ~14-39) — fetch balance from `/api/v1/tokens/balance` on mount, disable form and show "Insufficient credits" if balance < stakeAmount. Also verify the server-side dispute endpoint in `apps/api/src/routes/disputes.routes.ts` rejects submissions when balance is insufficient (defense in depth) (FR-019)

### Tests

- [X] T036 [US3] Write test in `apps/web/src/__tests__/lib/humanApi.test.ts` — verify GET requests are retried after 401 refresh, verify POST/PUT/PATCH/DELETE requests are NOT retried after 401 refresh, verify failed refresh clears tokens (FR-013)

**Checkpoint**: POST requests not auto-retried. Evidence form uses auth wrapper. Mission list shows error+retry. Error/404 pages render. Dispute form checks balance.

---

## Phase 6: User Story 4 — Privacy-Protected Photos (Priority: P1)

**Goal**: Replace face/plate detection stubs with real implementations. Fix dead-letter quarantine.

**Independent Test**: Upload photo with faces → detected and blurred. Privacy worker dead-letter → observation quarantined.

### Implementation

- [X] T037 [US4] Implement face detection in `apps/api/src/services/privacy-pipeline.ts` `detectFaces()` function (lines ~46-82) — load `@vladmandic/face-api` SSD MobileNet v1 model at startup, replace stub with actual detection: resize image to 320x240, run `detectAllFaces()`, filter by confidence >= 0.70 and size >= 50x50px, map results to `BoundingBox[]` with scale correction (FR-020, research R2)
- [X] T038 [US4] Create face detection model download script at `scripts/download-face-models.js` — download SSD MobileNet v1 model files (~15MB) from @vladmandic/face-api repo to `apps/api/assets/models/` directory. Add `.gitignore` entry for model files. Add model loading initialization in privacy-pipeline.ts that loads models once at import time. Also add a `RUN node scripts/download-face-models.js` step to `Dockerfile.worker` so models are baked into the Docker image for production
- [X] T039 [US4] Implement license plate detection in `apps/api/src/services/privacy-pipeline.ts` `detectPlates()` function (lines ~85-97) — use sharp to: (1) convert to grayscale, (2) apply edge detection, (3) find rectangular contours with aspect ratio 2:1-5:1, (4) filter by minimum size, (5) return `BoundingBox[]` for regions matching plate-like characteristics (FR-021, research R2)
- [X] T040 [US4] Update dead-letter handler in `apps/api/src/workers/privacy-worker.ts` — on job failure after all retries exhausted (dead-letter), update observation `privacyProcessingStatus` to `"quarantined"` instead of leaving as `"processing"`. Log quarantine event with observation ID (FR-008, data-model.md state machine)
- [X] T041 [US4] Set feature flag `PRIVACY_BLUR_ENABLED` to `true` in default configuration and update `packages/shared/src/types/phase3.ts` default value. Document rollback: to disable privacy detection, set `PRIVACY_BLUR_ENABLED=false` in Redis via `SET feature:PRIVACY_BLUR_ENABLED false` — photos will pass through without face/plate detection (FR-020/021)

### Tests

- [X] T042 [US4] Write test in `apps/api/src/__tests__/unit/privacy-detection.test.ts` — test face detection with sample image buffer containing face (mock @vladmandic/face-api), verify BoundingBox returned with correct coordinates. Test plate detection with high-contrast rectangle, verify detection. Test dead-letter handler sets quarantined status (FR-020, FR-021, FR-008)

**Checkpoint**: Face detection returns real bounding boxes. Plate detection identifies rectangular regions. Dead-letter quarantine works. PRIVACY_BLUR_ENABLED defaults to true.

---

## Phase 7: User Story 5 — System Health Monitoring (Priority: P2)

**Goal**: Add Sentry error tracking, worker queue metrics, and configure alert delivery.

**Independent Test**: Trigger error → appears in Sentry. Check `/metrics` → worker queue gauges present.

### Implementation

- [X] T043 [US5] Integrate Sentry into API error handler in `apps/api/src/middleware/error-handler.ts` — import Sentry from `apps/api/src/lib/sentry.ts`, call `Sentry.captureException(err)` for unexpected errors (non-AppError), attach `requestId`, route, and user type as context (FR-024)
- [X] T044 [P] [US5] Integrate Sentry into BullMQ workers in `apps/api/src/workers/all-workers.ts` — add `Sentry.captureException()` in each worker's error/failed event handler to report dead-letter failures (FR-024)
- [X] T045 [P] [US5] Integrate `@sentry/nextjs` into frontend in `apps/web/` — run `npx @sentry/wizard@latest -i nextjs`, configure `sentry.client.config.ts` and `sentry.server.config.ts` with SENTRY_DSN, add PII scrubbing (FR-024)
- [X] T046 [US5] Add worker queue metrics to Prometheus endpoint in `apps/api/src/routes/metrics.ts` — for each queue in QUEUE_NAMES, call `queue.getJobCounts()` and emit `betterworld_worker_queue_waiting`, `betterworld_worker_queue_active`, `betterworld_worker_queue_failed` gauges with queue name label (FR-025, contracts/api-changes.md)
- [X] T047 [P] [US5] Configure alert delivery receivers in `config/alerts.yml` — add `receivers` section with webhook receiver pointing to `ALERT_WEBHOOK_URL` env var for Slack/Discord notification delivery. Add `ALERT_WEBHOOK_URL` to `.env.example` with a comment explaining it is required in production for alert delivery (FR-026)
- [X] T048 [P] [US5] Update health endpoints in `apps/api/src/routes/health.routes.ts` — add `data` wrapper to `/healthz` response and `ok` field to `/readyz` response to match standard envelope contract (contracts/api-changes.md P3)

**Checkpoint**: Errors captured in Sentry with context. `/metrics` includes worker queue gauges. Alert receivers configured. Health endpoints follow envelope.

---

## Phase 8: User Story 6 — Onboarding Enforcement (Priority: P2)

**Goal**: Redirect users who haven't completed onboarding to the wizard before accessing protected pages.

**Independent Test**: New user navigates to `/dashboard` → redirected to `/onboarding`.

### Implementation

- [X] T049 [US6] Create onboarding check middleware/wrapper in `apps/web/src/lib/onboardingGuard.ts` — utility that checks if the logged-in user has `orientationCompleted === true` via the profile API, returns redirect to `/onboarding` if not (FR-023)
- [X] T050 [US6] Add onboarding redirect to `apps/web/app/dashboard/page.tsx` — replace the soft banner check (lines ~123-140) with a hard redirect: if `!dashboard.profile.orientationCompleted`, call `redirect("/onboarding")` from `next/navigation` before rendering the page (FR-023)
- [X] T051 [P] [US6] Add onboarding redirect to `apps/web/app/missions/page.tsx` — check onboarding completion at the top of the component, redirect to `/onboarding` if incomplete (FR-023)
- [X] T052 [P] [US6] Add onboarding redirect to `apps/web/app/disputes/page.tsx` — check onboarding completion, redirect if incomplete (FR-023)
- [X] T053 [P] [US6] Add onboarding redirect to `apps/web/app/evidence-reviews/page.tsx` and `apps/web/app/missions/[id]/submit/page.tsx` — check onboarding completion, redirect if incomplete (FR-023)

**Checkpoint**: All protected pages redirect to onboarding if incomplete. Completed users access pages normally.

---

## Phase 9: User Story 7 — End-to-End Test Validation (Priority: P2)

**Goal**: Add frontend component tests for critical flows, golden-path E2E test, and CI coverage enforcement.

**Independent Test**: `pnpm --filter @betterworld/web test` passes. `playwright test e2e/` passes. CI enforces coverage.

### Frontend Component Tests

- [X] T054 [US7] Write component test in `apps/web/src/__tests__/components/RegisterForm.test.tsx` — render RegisterForm, test step navigation, test form validation (required fields), test submission callback fires with correct data (FR-031)
- [X] T055 [P] [US7] Write component test in `apps/web/src/__tests__/components/OrientationSteps.test.tsx` — render OrientationSteps, test 5-step progression, test completion callback, test back navigation (FR-031)
- [X] T056 [P] [US7] Write component test in `apps/web/src/__tests__/components/MissionClaimButton.test.tsx` — render with mission data, test loading state on click, test success state, test error state display (FR-031)
- [X] T057 [P] [US7] Write component test in `apps/web/src/__tests__/components/EvidenceSubmitForm.test.tsx` — render form, test file input validation (max 5, max 10MB), test GPS detection state, test submit with valid data (FR-031)

### E2E Test

- [X] T058 [US7] Write golden-path E2E test in `e2e/golden-path.test.ts` — using Playwright: (1) agent registers via API, (2) agent submits problem, (3) guardrail evaluates — poll `GET /api/v1/evaluations/:id` every 1s with 30s timeout until status changes from `pending` (wait for worker), (4) human registers, (5) human claims mission, (6) human submits evidence, (7) verification completes (poll evidence status), (8) token balance increases. Use API calls for backend steps, browser for frontend steps. Seed test data via API calls (not direct DB inserts) to exercise real validation paths (FR-032)
- [X] T059 [US7] Create Playwright config at `playwright.config.ts` — configure base URL, test directory `e2e/`, webServer to start API + frontend, timeout 60s

### CI Pipeline Updates

- [X] T060 [US7] Add coverage threshold enforcement to `.github/workflows/ci.yml` — add `--coverage` flag to test commands, add step that checks coverage output against constitution thresholds (guardrails >= 95%, tokens >= 90%, db >= 85%, api >= 80%, global >= 75%), fail build if any threshold not met or coverage decreases (FR-033)
- [X] T061 [P] [US7] Add `pnpm audit --prod --audit-level=high` step to `.github/workflows/ci.yml` as a required CI job that fails on high/critical vulnerabilities (FR-034)
- [X] T062 [P] [US7] Add frontend test job to `.github/workflows/ci.yml` — `pnpm --filter @betterworld/web test` as a parallel CI job

**Checkpoint**: 4 component tests + 1 E2E test pass. CI enforces coverage thresholds. Vulnerability scanning active.

---

## Phase 10: User Story 8 — Security Hardening (Priority: P2)

**Goal**: Harden optionalAuth, CORS, PII logging, and admin route paths.

**Independent Test**: Malformed token → 401 (not silent public). Bad CORS origin → rejected. Admin logs → no emails.

### Implementation

- [X] T063 [US8] Harden `optionalAuth()` in `apps/api/src/middleware/auth.ts` (lines ~217-346) — when an `Authorization` header IS present but JWT verification fails AND API key lookup fails, return 401 Unauthorized instead of falling through to `public` role. Only fall through to `public` when NO Authorization header is present (FR-027, contracts/api-changes.md)
- [X] T064 [P] [US8] Add CORS origin whitelist validation in `apps/api/src/middleware/cors.ts` (lines ~4-8) — define a constant `ALLOWED_ORIGINS` array, validate each origin from `CORS_ORIGINS` env var against a URL pattern (must start with `https://` in production, no wildcards), reject invalid origins at startup (FR-028)
- [X] T065 [P] [US8] Remove PII from admin rate adjustment logs in `apps/api/src/routes/admin-rate.routes.ts` (lines ~182-190) — replace `admin: human?.email` with `adminId: human?.id` or masked identifier using the existing email masking pattern from `email.service.ts` (FR-029)
- [X] T066 [US8] De-overlap admin routes in `apps/api/src/routes/v1.routes.ts` (lines ~58, 95, 102) — change `v1Routes.route("/admin", phase3AdminRoutes)` to `v1Routes.route("/admin/phase3", phase3AdminRoutes)` and `v1Routes.route("/admin", shadowAdminRoutes)` to `v1Routes.route("/admin/shadow", shadowAdminRoutes)`. Update any frontend API calls that reference these admin paths (FR-030, contracts/api-changes.md)
- [X] T067 [P] [US8] Update Phase 3 admin frontend pages to use new route paths — search `apps/web/` for fetch calls to admin Phase 3 and Shadow Mode endpoints, update to `/admin/phase3/` and `/admin/shadow/` prefixes

### Tests

- [X] T068 [US8] Write test in `apps/api/src/__tests__/security-hardening.test.ts` — verify optionalAuth returns 401 on malformed Bearer token (not public), verify optionalAuth returns public on missing header, verify CORS rejects unlisted origin, verify admin-rate log output contains no email addresses (FR-027, FR-028, FR-029)

**Checkpoint**: Invalid tokens rejected. CORS validated. No PII in logs. Admin routes don't shadow.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup, edge cases, and validation

- [X] T069 Fix offline queue cleanup in `apps/web/src/lib/offline-queue.ts` (lines ~131-167) — after MAX_RETRIES (10) exhausted, remove observation from IndexedDB queue and emit a user-visible notification of permanent failure (edge case from spec)
- [X] T070 [P] Add UUID validation to public agent profile endpoint in `apps/api/src/routes/agents.routes.ts` (lines ~74-92) — add `parseUuidParam(c.req.param("id"))` call matching other routes (P3-S6 from scan)
- [X] T071 [P] Add composite index on `peerReviews(observationId, reviewType)` — create migration `0014_peer_review_composite_index` in `packages/db/drizzle/` (P3-D5 from scan)
- [X] T071a [P] Validate CSP headers work with the actual deployed frontend — start the Next.js dev server, open browser devtools console, verify no CSP violations for script/style/image/font loading. Adjust `Content-Security-Policy` header in `apps/api/src/middleware/` if any resources are blocked (edge case from spec)
- [X] T072 Run full backend test suite: `pnpm --filter @betterworld/api test` — verify all 628+ existing tests still pass plus new tests
- [X] T073 Run full frontend test suite: `pnpm --filter @betterworld/web test` — verify component tests pass
- [X] T074 Run E2E test: `pnpm exec playwright test e2e/golden-path.test.ts` — verify golden path completes. CI job added to `.github/workflows/ci.yml` with Postgres + Redis services, Playwright browser install, and artifact upload on failure.
- [X] T075 Run CI validation locally: lint + typecheck + tests + build — simulate full CI pipeline to verify it passes before push
- [X] T076 Verify `PRIVACY_BLUR_ENABLED=true` processes a test image through the full pipeline: EXIF strip → face detect → plate detect → blur → upload. Privacy worker fixed to use `getFlag()` service (Zod default: `true`). Dockerfile.worker bakes face models via `download-face-models.js --copy`. Model path resolution checks assets/, local node_modules, and root node_modules.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 (T006 lockfile update)
- **Phase 3-6 (P1 Stories)**: All depend on Phase 2 completion. Can run in parallel with each other:
  - US1 (Guardrail) — independent
  - US2 (Performance) — depends on Phase 2 migration (T007/T013)
  - US3 (Frontend) — independent
  - US4 (Privacy) — independent
- **Phase 7-10 (P2 Stories)**: Depend on Phase 2. Can run in parallel:
  - US5 (Monitoring) — depends on Sentry setup (T009)
  - US6 (Onboarding) — independent
  - US7 (Testing) — depends on all US1-4 being implemented (tests validate implemented behavior). Should start after Phase 2 (test infra in T010-T012) but component tests can be written in parallel with implementation.
  - US8 (Security) — independent
- **Phase 11 (Polish)**: After all user stories complete

### User Story Dependencies

| Story | Depends On | Can Parallel With |
|-------|-----------|-------------------|
| US1 (Guardrail) | Phase 2 | US2, US3, US4 |
| US2 (Performance) | Phase 2 + migration T013 | US1, US3, US4 |
| US3 (Frontend) | Phase 2 | US1, US2, US4 |
| US4 (Privacy) | Phase 2 | US1, US2, US3 |
| US5 (Monitoring) | Phase 2 + Sentry T009 | US6, US7, US8 |
| US6 (Onboarding) | Phase 2 | US5, US7, US8 |
| US7 (Testing) | Phase 2 + US1-US4 implementation | US5, US6, US8 |
| US8 (Security) | Phase 2 | US5, US6, US7 |

### Within Each User Story

- Implementation tasks before tests (tests validate the fix)
- Schema/migration before route changes
- Service changes before route changes
- Backend before frontend (where applicable)

### Parallel Opportunities

**Phase 1**: T001-T005 are all [P] (different package.json files) — T006 is sequential (lockfile update depends on all)
**Phase 2**: T008-T012 are all [P] (different files)
**Phase 3 (US1)**: T014-T015 are sequential (same file)
**Phase 4 (US2)**: T019+T020 parallel (different parts of debates.routes.ts — T20 is pagination, T19 is depth), T022-T026 all parallel (different worker files)
**Phase 5 (US3)**: T030-T035 all parallel (different files)
**Phase 6 (US4)**: T037-T041 mostly sequential (same file for detection, different for worker)
**Phase 7 (US5)**: T044-T048 parallel (different files)
**Phase 8 (US6)**: T051-T053 parallel (different page files)
**Phase 9 (US7)**: T054-T057 parallel (different test files), T060-T062 parallel (different CI concerns)
**Phase 10 (US8)**: T064-T065+T067 parallel (different files)

---

## Parallel Example: Phase 4 (US2 Performance + Workers)

```text
# Batch 1 — performance fixes (parallel where possible):
Task T018: "Fix N+1 in evaluations.routes.ts"
Task T019: "Replace getThreadDepth with recursive CTE in debates.routes.ts"
Task T020: "Move debate pagination filter to WHERE in debates.routes.ts"

# Batch 2 — worker reliability (all parallel — different files):
Task T022: "Add idempotency check in peer-consensus.ts"
Task T023: "Add idempotency key to rate-adjustment-worker.ts"
Task T024a: "Add idempotency key to fraud-scoring.ts"
Task T024: "Fix DB connection in municipal-ingest.ts"
Task T025: "Add retention policies across all 13 worker files"
Task T026: "Add per-item try-catch in reputation-decay.ts"

# Batch 3 — depends on above:
Task T021: "Replace Haversine with ST_DWithin in missions/index.ts" (needs migration T013)

# Batch 4 — tests:
Task T027: "evaluation-batch.test.ts"
Task T028: "worker-idempotency.test.ts"
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup (T001-T006)
2. Complete Phase 2: Foundational (T007-T013)
3. Complete Phase 3: US1 Guardrail Fix (T014-T017)
4. **STOP and VALIDATE**: Submit content → verify automatic evaluation
5. This alone restores the core platform value proposition

### Incremental Delivery

1. Setup + Foundational → infrastructure ready
2. US1 (Guardrail) → core pipeline works → **Deploy-worthy milestone**
3. US2 (Performance) → fast queries, reliable workers
4. US3 (Frontend) → users see proper errors, auth works
5. US4 (Privacy) → photos are safe to upload → **Ready for real users**
6. US5 (Monitoring) → team can see what's happening
7. US6 (Onboarding) → users can't skip setup
8. US7 (Testing) → regression protection
9. US8 (Security) → attack surface hardened → **Production-ready**

### Subagent-Driven Parallel Strategy

With subagent parallelism:

1. Phase 1+2 sequentially (shared lockfile + migration)
2. After Phase 2 complete, dispatch 4 parallel subagents:
   - Agent A: US1 (Guardrail) — 4 tasks
   - Agent B: US2 (Performance) — 12 tasks
   - Agent C: US3 (Frontend) — 8 tasks
   - Agent D: US4 (Privacy) — 6 tasks
3. After P1 stories complete, dispatch 4 parallel subagents:
   - Agent E: US5 (Monitoring) — 6 tasks
   - Agent F: US6 (Onboarding) — 5 tasks
   - Agent G: US7 (Testing) — 9 tasks (may start component tests earlier)
   - Agent H: US8 (Security) — 6 tasks
4. Phase 11 (Polish) — sequential final validation

---

## Summary

| Phase | Story | Tasks | Parallel |
|-------|-------|-------|----------|
| 1 Setup | — | 6 | 5 [P] |
| 2 Foundational | — | 7 | 5 [P] |
| 3 US1 Guardrail | P1 | 4 | 0 |
| 4 US2 Performance | P1 | 12 | 9 [P] |
| 5 US3 Frontend | P1 | 8 | 6 [P] |
| 6 US4 Privacy | P1 | 6 | 0 |
| 7 US5 Monitoring | P2 | 6 | 4 [P] |
| 8 US6 Onboarding | P2 | 5 | 3 [P] |
| 9 US7 Testing | P2 | 9 | 5 [P] |
| 10 US8 Security | P2 | 6 | 3 [P] |
| 11 Polish | — | 9 | 3 [P] |
| **Total** | | **78** | **43 [P]** |

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story is independently testable after its phase completes
- Commit after each task or logical batch
- The spec requires tests (FR-031/032/033) — test tasks are included accordingly
- All file paths are relative to repository root `/Users/zhiruifeng/Workspace/WindCore/BetterWorld/`
