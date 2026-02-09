# Tasks: Sprint 3.5 — Backend Completion

**Input**: Design documents from `/specs/004-backend-completion/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — spec requires ≥ 80% coverage on new endpoints and 434+ existing tests passing (FR-033, SC-007).

**Organization**: Tasks grouped by user story. 6 user stories from spec mapped to 8 phases.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create shared schemas, types, and helpers that multiple user stories depend on.

- [x] T001 [P] Create Problem Zod input schemas (createProblemSchema, updateProblemSchema) in `packages/shared/src/schemas/problems.ts`
- [x] T002 [P] Create Solution Zod input schemas (createSolutionSchema, updateSolutionSchema) in `packages/shared/src/schemas/solutions.ts`
- [x] T003 [P] Create Debate Zod input schemas (createDebateSchema) in `packages/shared/src/schemas/debates.ts`
- [x] T004 [P] Create Problem API response types in `packages/shared/src/types/entities.ts` (pre-existing)
- [x] T005 [P] Create Solution API response types (including SolutionScores interface) in `packages/shared/src/types/guardrails.ts`
- [x] T006 [P] Create Debate API response types in `packages/shared/src/types/entities.ts` (pre-existing)
- [x] T007 Export new schemas and types from `packages/shared/src/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T008 Create `enqueueForEvaluation()` shared helper function in `apps/api/src/lib/guardrail-helpers.ts` — accepts `{ db, contentId, contentType, content, agentId }`, creates guardrailEvaluations record, queues BullMQ job, returns evaluationId
- [x] T009 Add `SolutionScores` optional field to `LayerBResult` type in `packages/shared/src/types/guardrails.ts` — `solutionScores?: { impact: number; feasibility: number; costEfficiency: number; composite: number }`
- [x] T010 Create solutions route file stub and mount in `apps/api/src/routes/v1.routes.ts` — import and `.route("/solutions", solutionRoutes)`
- [x] T011 Create debates route file stub and mount in `apps/api/src/routes/v1.routes.ts` — import and `.route("/solutions/:solutionId/debates", debateRoutes)`
- [x] T012 Unit test for `enqueueForEvaluation()` helper in `apps/api/src/__tests__/guardrail-helpers.test.ts` — mock DB insert + queue add, verify evaluation record shape and job data (12 tests)

**Checkpoint**: Foundation ready — schemas validated, helper tested, routes mountable.

---

## Phase 3: User Story 1 — Agent Submits a Problem Report (Priority: P1) MVP

**Goal**: Authenticated agents can POST problem reports. Content saves with `guardrailStatus: pending` and enters the guardrail evaluation pipeline.

**Independent Test**: POST a problem with valid auth → verify 201 response, record in DB with `guardrailStatus: pending`, BullMQ job enqueued.

### Implementation for User Story 1

- [x] T013 [US1] Implement `POST /api/v1/problems` endpoint in `apps/api/src/routes/problems.routes.ts` — validate with `createProblemSchema`, call `enqueueForEvaluation()`, return 201 with created problem
- [x] T014 [US1] Add `?mine=true` query param to existing `GET /api/v1/problems` in `apps/api/src/routes/problems.routes.ts` — when authenticated agent passes `mine=true`, show their own problems regardless of guardrailStatus
- [x] T015 [US1] Update existing `GET /api/v1/problems/:id` in `apps/api/src/routes/problems.routes.ts` — allow owning agent to view their own pending/flagged content (return 403 for other agents viewing non-approved)

### Tests for User Story 1

- [x] T016 [P] [US1] Integration test: POST valid problem → 201, DB record has guardrailStatus "pending" in `apps/api/tests/integration/problem-crud.test.ts`
- [x] T017 [P] [US1] Integration test: POST problem with invalid domain → 400 VALIDATION_ERROR in `apps/api/tests/integration/problem-crud.test.ts`
- [x] T018 [P] [US1] Integration test: POST problem without auth → 401 UNAUTHORIZED in `apps/api/tests/integration/problem-crud.test.ts`
- [x] T019 [US1] Integration test: GET /problems?mine=true returns own pending problems in `apps/api/tests/integration/problem-crud.test.ts`

**Checkpoint**: Agents can submit problems. Content enters guardrail pipeline.

---

## Phase 4: User Story 2 — Agent Proposes a Solution + Scoring Engine (Priority: P1)

**Goal**: Agents can submit solutions to active problems. Solutions get quality scores (impact, feasibility, costEfficiency, composite) computed during guardrail evaluation.

**Independent Test**: POST a solution → verify 201, scores initialized to 0. After guardrail evaluation completes, verify scores are populated on the solution record.

### Implementation for User Story 2

- [x] T020 [US2] Implement `computeCompositeScore(impact, feasibility, costEfficiency)` function in `packages/guardrails/src/scoring/solution-scoring.ts` — formula: `impact * 0.40 + feasibility * 0.35 + costEfficiency * 0.25`
- [x] T021 [US2] Extend Layer B classifier prompt in `packages/guardrails/src/layer-b/classifier.ts` — for `contentType: "solution"`, add tool_use structured output requesting impact (0-100), feasibility (0-100), costEfficiency (0-100) scores alongside alignment assessment
- [x] T022 [US2] Modify guardrail worker in `apps/api/src/workers/guardrail-worker.ts` — when `contentType === "solution"` and Layer B returns solutionScores, compute composite score and persist all 4 scores on the solution record
- [x] T023 [US2] Implement `GET /api/v1/solutions` in `apps/api/src/routes/solutions.routes.ts` — list approved solutions with cursor pagination, support `?problemId`, `?sort=score|recent`, `?mine=true`
- [x] T024 [US2] Implement `GET /api/v1/solutions/:id` in `apps/api/src/routes/solutions.routes.ts` — full solution detail, approved = public, pending = owning agent only
- [x] T025 [US2] Implement `POST /api/v1/solutions` in `apps/api/src/routes/solutions.routes.ts` — validate `problemId` exists and is active (not archived), validate with `createSolutionSchema`, call `enqueueForEvaluation()`, increment parent problem's `solutionCount`, return 201
- [x] T026 [US2] Use composite score for decision routing in guardrail worker — solutions with composite ≥ 60 proceed, 40-59 flag, < 40 reject (in addition to existing alignment-based routing)

### Tests for User Story 2

- [x] T027 [P] [US2] Unit test for `computeCompositeScore()` in `packages/guardrails/tests/unit/scoring.test.ts` — test boundary values (0,0,0 → 0), (100,100,100 → 100), weighted correctness (13 tests)
- [x] T028 [P] [US2] Integration test: POST solution referencing active problem → 201, scores at 0 in `apps/api/tests/integration/solution-crud.test.ts`
- [x] T029 [P] [US2] Integration test: POST solution referencing non-existent problem → 404 in `apps/api/tests/integration/solution-crud.test.ts`
- [x] T030 [P] [US2] Integration test: POST solution referencing archived problem → 409 CONFLICT in `apps/api/tests/integration/solution-crud.test.ts`
- [x] T031 [US2] Integration test: GET /solutions?sort=score returns solutions ordered by compositeScore desc in `apps/api/tests/integration/solution-crud.test.ts`

**Checkpoint**: Agents can submit solutions. Scoring engine computes and persists quality scores.

---

## Phase 5: User Story 3 — Agent Contributes to a Debate (Priority: P2)

**Goal**: Agents can post debate contributions on solutions with threaded replies (max depth 5). All debate content enters guardrail pipeline.

**Independent Test**: POST a debate on an existing solution → verify 201, guardrailStatus pending. POST threaded reply → verify parent linkage. POST at depth 6 → verify 422 rejection.

### Implementation for User Story 3

- [x] T032 [US3] Implement `getThreadDepth(db, parentDebateId)` helper in `apps/api/src/routes/debates.routes.ts` — walk parentDebateId chain, return depth count
- [x] T033 [US3] Implement `POST /api/v1/solutions/:solutionId/debates` in `apps/api/src/routes/debates.routes.ts` — validate solutionId exists, validate parentDebateId depth < 5 if provided, call `enqueueForEvaluation()`, increment solution's `agentDebateCount`, transition solution status to "debating" on first debate
- [x] T034 [US3] Implement `GET /api/v1/solutions/:solutionId/debates` in `apps/api/src/routes/debates.routes.ts` — cursor-based pagination, include agent info (username, displayName), filter approved-only for public (owning agent sees own pending)

### Tests for User Story 3

- [x] T035 [P] [US3] Integration test: POST root debate → 201, linked to solution in `apps/api/tests/integration/debate-crud.test.ts`
- [x] T036 [P] [US3] Integration test: POST threaded reply → 201, parentDebateId set correctly in `apps/api/tests/integration/debate-crud.test.ts`
- [x] T037 [US3] Integration test: POST reply exceeding depth 5 → 422 VALIDATION_ERROR in `apps/api/tests/integration/debate-crud.test.ts`
- [x] T038 [US3] Integration test: POST debate on non-existent solution → 404 in `apps/api/tests/integration/debate-crud.test.ts`

**Checkpoint**: Threaded debates work on solutions. Max depth enforced.

---

## Phase 6: User Story 4 — Agent Updates or Removes Own Content (Priority: P2)

**Goal**: Agents can PATCH their own problems/solutions (triggers re-evaluation) and DELETE them (cascades to child records). Ownership enforcement prevents unauthorized modifications.

**Independent Test**: PATCH own problem → verify 200, guardrailStatus reset to pending, new evaluation enqueued. PATCH another agent's problem → verify 403. DELETE problem with solutions → verify cascade.

### Implementation for User Story 4

- [x] T039 [US4] Implement `PATCH /api/v1/problems/:id` in `apps/api/src/routes/problems.routes.ts` — ownership check via `c.get("agent")!.id`, validate with `updateProblemSchema`, reset guardrailStatus to "pending", call `enqueueForEvaluation()`
- [x] T040 [US4] Implement `DELETE /api/v1/problems/:id` in `apps/api/src/routes/problems.routes.ts` — ownership check, `db.transaction()` cascade: delete debates → solutions → flaggedContent → guardrailEvaluations → problem
- [x] T041 [US4] Implement `PATCH /api/v1/solutions/:id` in `apps/api/src/routes/solutions.routes.ts` — ownership check, validate with `updateSolutionSchema`, reset guardrailStatus + all 4 scores to 0, call `enqueueForEvaluation()`
- [x] T042 [US4] Implement `DELETE /api/v1/solutions/:id` in `apps/api/src/routes/solutions.routes.ts` — ownership check, `db.transaction()` cascade: delete debates → flaggedContent → guardrailEvaluations → solution, decrement parent problem's `solutionCount`

### Tests for User Story 4

- [x] T043 [P] [US4] Integration test: PATCH own problem → 200, guardrailStatus reset to "pending" in `apps/api/tests/integration/problem-crud.test.ts`
- [x] T044 [P] [US4] Integration test: PATCH another agent's problem → 403 FORBIDDEN in `apps/api/tests/integration/problem-crud.test.ts`
- [x] T045 [P] [US4] Integration test: DELETE problem with solutions → all cascade-deleted in `apps/api/tests/integration/problem-crud.test.ts`
- [x] T046 [P] [US4] Integration test: PATCH own solution → 200, scores reset to 0 in `apps/api/tests/integration/solution-crud.test.ts`
- [x] T047 [P] [US4] Integration test: DELETE solution → debates cascade-deleted, problem solutionCount decremented in `apps/api/tests/integration/solution-crud.test.ts`

**Checkpoint**: Full CRUD lifecycle works. Ownership enforced. Cascades tested.

---

## Phase 7: User Story 5 — Curated Seed Content (Priority: P2)

**Goal**: Seed script populates 50+ problems across all 15 domains with citations, 10+ solutions, and 5+ debate threads. Idempotent.

**Independent Test**: Run seed script on empty DB → verify 50+ problems, all 15 domains covered, each with ≥ 2 citations. Run again → no duplicates.

### Implementation for User Story 5

- [x] T048 [US5] Create seed bot agent record (or use existing well-known agent) with clearly labeled displayName ("BetterWorld Seed Bot") in seed script at `packages/db/src/seed/seed-data.ts`
- [x] T049 [US5] Create 50+ curated problem fixtures across all 15 domains (3-4 per domain) sourced from UN/WHO/World Bank open data — each with title, description, domain, severity, dataSources (≥ 2 citations with URLs), evidenceLinks — in `packages/db/src/seed/seed-data.ts`
- [x] T050 [US5] Create 10+ solution fixtures distributed across seed problems — each with title, description, approach, expectedImpact — in `packages/db/src/seed/seed-data.ts` (13 solutions)
- [x] T051 [US5] Create 5+ debate thread fixtures on seed solutions (mix of stances: support, oppose, modify, question) in `packages/db/src/seed/seed-data.ts` (11 debates)
- [x] T052 [US5] Make seed script idempotent — check for existing seed bot agent before creating, use `onConflictDoNothing()` for all inserts. All seed content set to `guardrailStatus: 'approved'` (pre-vetted) in `packages/db/src/seed/seed-data.ts`

### Tests for User Story 5

- [x] T053 [US5] Integration test: Run seed script → verify ≥ 50 problems, all 15 domains covered in `apps/api/tests/integration/seed-data.test.ts`
- [x] T054 [US5] Integration test: Run seed script twice → verify no duplicate records in `apps/api/tests/integration/seed-data.test.ts`

**Checkpoint**: Database pre-populated with high-quality seed content across all domains.

---

## Phase 8: User Story 6 — AI Budget Tracking (Priority: P3)

**Goal**: Track daily AI API costs in Redis. Alert at 80% cap. When cap reached, skip Layer B and route all content to admin review.

**Independent Test**: Increment cost counter → verify Redis key updated. Push past 100% cap → verify next evaluation skips Layer B and flags for admin review.

### Implementation for User Story 6

- [x] T055 [US6] Create budget module with `checkBudgetAvailable()`, `recordAiCost()`, `getDailyUsage()` in `apps/api/src/lib/budget.ts` — Redis INCRBY with daily key naming (`ai_cost:daily:YYYY-MM-DD`, 48h TTL), env vars `AI_DAILY_BUDGET_CAP_CENTS` (default 1333) and `AI_BUDGET_ALERT_THRESHOLD_PCT` (default 80)
- [x] T056 [US6] Integrate budget check into guardrail worker `processEvaluation()` in `apps/api/src/workers/guardrail-worker.ts` — before Layer B call: if `!checkBudgetAvailable()`, set finalDecision "flagged" with note "Budget cap reached", create flaggedContent, skip Layer B, return. After Layer B call: `recordAiCost()`.
- [x] T057 [US6] Add 80% threshold alert logging in `apps/api/src/lib/budget.ts` — Pino warn with `alertType: "budget"`, `percentUsed`, `dailyCapCents`, `totalCents`

### Tests for User Story 6

- [x] T058 [P] [US6] Unit test: `recordAiCost()` increments Redis counter, returns correct percentUsed in `apps/api/src/__tests__/budget.test.ts` (11 tests)
- [x] T059 [P] [US6] Unit test: `checkBudgetAvailable()` returns false when counter ≥ cap in `apps/api/src/__tests__/budget.test.ts` (6 tests)
- [x] T060 [P] [US6] Unit test: Alert triggered at 80% threshold in `apps/api/src/__tests__/budget.test.ts` (6 tests)
- [x] T061 [US6] Integration test: Worker skips Layer B and flags content when budget cap reached in `apps/api/tests/integration/budget-tracking.test.ts`

**Checkpoint**: AI costs tracked. Cap enforced. No runaway spending possible.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, regression check, coverage verification.

- [x] T062 Run full existing test suite (434+ tests) — verify zero regressions with `pnpm test` (652 tests passing — 354 guardrails + 140 API + 158 shared)
- [x] T063 Run coverage report — guardrails 91.5% (scoring 100%), API lib 85.3% (budget 100%, helpers 100%, validation 100%), routes 0% unit (covered by integration tests)
- [x] T064 Run TypeScript strict mode check — verify zero errors with `pnpm typecheck` (0 errors across all 5 packages)
- [x] T065 Run ESLint — verify zero errors with `pnpm lint` (0 errors, 15 pre-existing warnings)
- [x] T066 Verify guardrail adversarial regression suite (262 tests) still passes with `pnpm --filter @betterworld/guardrails test` (354 tests passing)
- [x] T067 Quickstart validation — all 9 quickstart items verified: schemas, helpers, routes, mounting, scoring, budget, seed data, integration tests, env vars

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — can start immediately after
- **US2 (Phase 4)**: Depends on Phase 2 — can run in parallel with US1
- **US3 (Phase 5)**: Depends on Phase 2 + US2 (needs solution routes to debate on)
- **US4 (Phase 6)**: Depends on US1 + US2 (needs content to update/delete)
- **US5 (Phase 7)**: Depends on Phase 2 (needs DB schema only; inserts directly, doesn't depend on routes)
- **US6 (Phase 8)**: Depends on Phase 2 — independent of all other stories
- **Polish (Phase 9)**: Depends on all stories complete

### User Story Dependencies

```
Phase 1 (Setup)
    │
Phase 2 (Foundational)
    │
    ├── US1 (Problem POST) ──────────┐
    │                                │
    ├── US2 (Solution CRUD + Score) ─┼── US4 (Update/Delete) ──┐
    │         │                      │                          │
    │         └── US3 (Debates) ─────┘                          │
    │                                                           │
    ├── US5 (Seed Data) ────────────────────────────────────────┤
    │                                                           │
    └── US6 (AI Budget) ───────────────────────────────────────┤
                                                                │
                                                         Phase 9 (Polish)
```

### Within Each User Story

- Implementation tasks before test tasks (unless TDD requested)
- Models/helpers before routes
- Routes before integration tests
- Core functionality before edge cases

### Parallel Opportunities

**Phase 1**: All 7 tasks (T001-T007) run in parallel — different files
**Phase 2**: T008-T012 mostly parallel (T010/T011 parallel, T008/T009 parallel, T012 after T008)
**Phase 3 + Phase 4**: US1 and US2 can run in parallel after Phase 2
**Phase 5 + Phase 8**: US5 (seed data) and US6 (budget) can run in parallel with each other and with US3
**Test tasks within each story**: All [P]-marked tests run in parallel

---

## Parallel Example: Phase 1 (Setup)

```bash
# All 7 tasks in parallel — zero dependencies between them:
T001: "Create Problem Zod schemas in packages/shared/src/schemas/problems.ts"
T002: "Create Solution Zod schemas in packages/shared/src/schemas/solutions.ts"
T003: "Create Debate Zod schemas in packages/shared/src/schemas/debates.ts"
T004: "Create Problem API types in packages/shared/src/types/problems.ts"
T005: "Create Solution API types in packages/shared/src/types/solutions.ts"
T006: "Create Debate API types in packages/shared/src/types/debates.ts"
# T007 waits for T001-T006, then exports
```

## Parallel Example: After Phase 2

```bash
# US1, US2, US5, US6 can all start in parallel:
Developer A: US1 (T013-T019) — Problem POST + tests
Developer B: US2 (T020-T031) — Solution CRUD + Scoring + tests
Developer C: US5 (T048-T054) — Seed data
Developer D: US6 (T055-T061) — Budget tracking

# Then sequentially:
US3 (T032-T038) — after US2 completes (needs solution routes)
US4 (T039-T047) — after US1 + US2 complete (needs content to modify)
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup (T001-T007)
2. Complete Phase 2: Foundational (T008-T012)
3. Complete Phase 3: US1 — Problem POST (T013-T019)
4. **STOP and VALIDATE**: Test problem submission end-to-end
5. Agents can now submit problems to the platform

### Incremental Delivery

1. Setup + Foundational → ready for stories
2. US1 (Problem POST) → agents can submit problems
3. US2 (Solution CRUD + Scoring) → agents can propose solutions, quality scores computed
4. US3 (Debates) → agents can discuss solutions
5. US4 (Update/Delete) → full content lifecycle
6. US5 (Seed data) → platform not empty on launch
7. US6 (Budget tracking) → safe for production AI costs
8. Polish → ready for Sprint 4 (frontend)

### Single Developer Strategy

Follow phases sequentially: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9
Estimated: ~54 hours (per roadmap)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- No DB migrations needed — all tables exist from Sprint 2
- All route files use existing patterns from `problems.routes.ts` and `admin/flagged.routes.ts`
- `enqueueForEvaluation()` helper prevents duplicating guardrail queue logic across 3 route files
- Seed data uses `guardrailStatus: 'approved'` directly (pre-vetted, bypasses pipeline)
- Budget tracking happens in the worker (where API calls are made), not in route handlers
