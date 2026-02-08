# Tasks: Constitutional Guardrails

**Input**: Design documents from `/specs/003-constitutional-guardrails/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: Included per constitution requirement (95% coverage target for guardrails package)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

BetterWorld uses a monorepo structure (Turborepo + pnpm workspaces):
- **Backend API**: `apps/api/src/`
- **Frontend**: `apps/web/src/`
- **New guardrails package**: `packages/guardrails/src/`
- **Database**: `packages/db/src/schema/`, `packages/db/migrations/`
- **Shared types**: `packages/shared/src/`
- **Tests**: Package-level (e.g., `packages/guardrails/tests/`)

---

## Phase 1: Setup (Shared Infrastructure) ✅ COMPLETE

**Purpose**: Initialize guardrails package and configure environment

- [X] T001 Create `packages/guardrails/` package structure with src/, tests/ directories
- [X] T002 Initialize `packages/guardrails/package.json` with dependencies (Anthropic SDK, ioredis, Zod)
- [X] T003 [P] Create environment variable definitions in `.env.example` (ANTHROPIC_API_KEY, guardrail thresholds, BullMQ config)
- [X] T004 [P] Create `config/domains.yaml` with 15 approved UN SDG-aligned domains
- [X] T005 [P] Create `config/forbidden-patterns.yaml` with 12 forbidden patterns and regex definitions

**Checkpoint**: ✅ Package structure and configuration files ready

---

## Phase 2: Foundational (Blocking Prerequisites) ✅ COMPLETE

**Purpose**: Core database schema, types, and infrastructure that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T006 Create `packages/db/src/schema/guardrails.ts` with all 6 table schemas (guardrail_evaluations, flagged_content, forbidden_patterns, approved_domains, trust_tiers, evaluation_cache)
- [X] T007 Generate Drizzle migration files for guardrail tables in `packages/db/migrations/`
- [X] T008 [P] Create seed data script for forbidden_patterns table in `packages/db/seeds/forbidden-patterns.ts`
- [X] T009 [P] Create seed data script for approved_domains table in `packages/db/seeds/approved-domains.ts`
- [X] T010 [P] Create seed data script for trust_tiers table (new + verified) in `packages/db/seeds/trust-tiers.ts`
- [X] T011 Run database migrations and seed scripts to initialize guardrail tables
- [X] T012 [P] Create TypeScript types for guardrail entities in `packages/shared/src/types/guardrails.ts`
- [X] T013 [P] Create Zod schemas for API request/response validation in `packages/shared/src/schemas/guardrails.ts`
- [X] T014 [P] Create constants for forbidden patterns in `packages/shared/src/constants/forbidden-patterns.ts`
- [X] T015 [P] Create constants for approved domains in `packages/shared/src/constants/approved-domains.ts`
- [X] T016 Initialize BullMQ queue in `apps/api/src/lib/queue.ts` with connection config

**Checkpoint**: ✅ Foundation ready - database schema deployed, types defined, queue initialized. User story implementation can now begin in parallel.

---

## Phase 3: User Story 1 - Agent Submits Valid Content (Priority: P1) 🎯 MVP ✅ COMPLETE

**Goal**: Valid content passes Layer A and Layer B automatically, becomes publicly visible within 5 seconds

**Independent Test**: Submit a well-formed problem in approved domain (e.g., "Community food bank needs volunteers" in food_security), verify it scores >0.7 and appears in public feed within 5s

### Implementation for User Story 1

#### Layer A: Rule Engine (Forbidden Pattern Detection) ✅ COMPLETE

- [X] T017 [P] [US1] Create `packages/guardrails/src/layer-a/patterns.ts` with ForbiddenPattern interface and pre-compiled regex array
- [X] T018 [P] [US1] Implement `evaluateLayerA()` function in `packages/guardrails/src/layer-a/rule-engine.ts` (<10ms target)
- [X] T019 [US1] Write unit tests for Layer A in `packages/guardrails/tests/unit/layer-a.test.ts` (12 forbidden patterns, valid content passes, execution time <10ms)

#### Layer B: LLM Classifier ✅ COMPLETE

- [X] T020 [P] [US1] Create few-shot examples array in `packages/guardrails/src/layer-b/few-shot-examples.ts` (7 examples: 3 approve, 2 flag, 2 reject)
- [X] T021 [P] [US1] Create prompt template with system instructions in `packages/guardrails/src/layer-b/prompt-template.ts` (15 domains, 12 patterns, scoring scale)
- [X] T022 [US1] Implement `evaluateLayerB()` function in `packages/guardrails/src/layer-b/classifier.ts` using Anthropic SDK (temp 0.3, max_tokens 500, JSON response)
- [X] T023 [US1] Write unit tests for Layer B in `packages/guardrails/tests/unit/layer-b.test.ts` (mocked Anthropic SDK, valid JSON parsing, score range 0.0-1.0)

#### Caching Layer ✅ COMPLETE

- [X] T024 [P] [US1] Implement `generateCacheKey()` function in `packages/guardrails/src/cache/cache-manager.ts` (SHA-256 of normalized content)
- [X] T025 [P] [US1] Implement `getCachedEvaluation()` and `setCachedEvaluation()` in `packages/guardrails/src/cache/cache-manager.ts` (1-hour TTL)
- [X] T026 [US1] Write unit tests for cache in `packages/guardrails/tests/unit/cache.test.ts` (hit/miss scenarios, TTL expiration, normalization)

#### BullMQ Worker ✅ COMPLETE

- [X] T027 [US1] Implement `processEvaluation()` function in `apps/api/src/workers/guardrail-worker.ts` (Layer A → cache check → Layer B → decision logic → DB update)
- [X] T028 [US1] Initialize BullMQ Worker in `apps/api/src/workers/guardrail-worker.ts` (concurrency 5, retry 3 times, exponential backoff)
- [X] T029 [US1] Add worker startup script to `apps/api/package.json` scripts section (dev:worker)

#### API Endpoints ✅ COMPLETE

- [X] T030 [US1] Implement POST `/api/v1/guardrails/evaluate` endpoint in `apps/api/src/routes/guardrails/evaluate.ts` (Zod validation, create evaluation record, queue job, return 202 Accepted)
- [X] T031 [P] [US1] Implement GET `/api/v1/guardrails/status/:id` endpoint in `apps/api/src/routes/guardrails/status.ts` (return evaluation status and results)
- [X] T032 [US1] Mount guardrail routes in `apps/api/src/routes/v1.routes.ts` at `/api/v1/guardrails`

#### Integration Tests ✅ COMPLETE

- [X] T033 [US1] Write integration test for valid content approval in `apps/api/tests/integration/guardrail-evaluation.test.ts` (submit problem, poll status, verify approved within 5s)
- [X] T034 [P] [US1] Write integration test for cache hit in `apps/api/tests/integration/guardrail-evaluation.test.ts` (submit identical content twice, verify second request uses cache)
- [X] T035 [P] [US1] Write integration test for high scores in `apps/api/tests/integration/guardrail-evaluation.test.ts` (score >=0.7 → approved, content publicly visible)

#### Package Exports ✅ COMPLETE

- [X] T036 [US1] Create `packages/guardrails/src/index.ts` with public API exports (evaluateLayerA, evaluateLayerB, cache functions, trust tier)

**Checkpoint**: ✅ User Story 1 complete. Valid content flows through Layer A → Layer B → auto-approval → public visibility. Test with food bank example (score ~0.85, approved <5s).

---

## Phase 4: User Story 2 - System Blocks Harmful Content (Priority: P1) ✅ COMPLETE

**Goal**: Content with forbidden patterns or low alignment scores is rejected before reaching public visibility

**Independent Test**: Submit content with forbidden pattern (e.g., "Build surveillance cameras for neighborhood"), verify rejected within 100ms with clear reason

### Implementation for User Story 2

#### Enhanced Layer A Tests ✅ COMPLETE

- [X] T037 [P] [US2] Expand Layer A unit tests in `packages/guardrails/tests/unit/layer-a.test.ts` to cover 262 adversarial cases (all 12 forbidden patterns, variations, false positives)
- [X] T038 [P] [US2] Add regression test suite for prompt injection attempts in `packages/guardrails/tests/unit/layer-a.test.ts` (semantic evasion, obfuscation, unicode substitution, bypass attempts)

#### Enhanced Layer B Tests ✅ COMPLETE

- [X] T039 [P] [US2] Expand Layer B unit tests in `packages/guardrails/tests/unit/layer-b.test.ts` to cover harmful content detection (score <0.4 → reject, 10 harmful cases)
- [X] T040 [P] [US2] Add boundary case tests in `packages/guardrails/tests/unit/layer-b.test.ts` (surveillance-adjacent, political-adjacent, subtle harm, negative scores, missing fields)

#### Integration Tests ✅ COMPLETE

- [X] T041 [US2] Write integration test for Layer A rejection in `apps/api/tests/integration/guardrail-evaluation.test.ts` (surveillance pattern → rejected, content hidden)
- [X] T042 [P] [US2] Write integration test for Layer B rejection in `apps/api/tests/integration/guardrail-evaluation.test.ts` (low score <0.4 → rejected with reasoning)
- [X] T043 [P] [US2] Write integration test for ambiguous content flagging in `apps/api/tests/integration/guardrail-evaluation.test.ts` (score 0.4-0.7 → flagged, routed to admin review)

#### Update Content Visibility Logic ✅ COMPLETE

- [X] T044 [US2] Create `apps/api/src/routes/problems.routes.ts` — only returns `guardrail_status = 'approved'` content in public listings

**Checkpoint**: ✅ User Story 2 complete. Harmful content detected and blocked. Test with surveillance example (rejected, never public).

---

## Phase 5: User Story 3 - Admin Reviews Flagged Content (Priority: P2) ✅ COMPLETE

**Goal**: Ambiguous content (score 0.4-0.7) routes to human admin review queue with all context for decision-making

**Independent Test**: Submit ambiguous content (e.g., "Create database of community health records"), verify appears in admin queue with score 0.4-0.7, admin can approve/reject with notes

### Implementation for User Story 3

#### Flagged Content Creation Logic ✅ COMPLETE

- [X] T045 [US3] Update `processEvaluation()` in `apps/api/src/workers/guardrail-worker.ts` to insert into `flagged_content` table when final_decision = 'flagged'

#### Admin Review API Endpoints ✅ COMPLETE

- [X] T046 [P] [US3] Implement GET `/api/v1/admin/flagged` in `apps/api/src/routes/admin/flagged.routes.ts` (cursor-based pagination, filter by status/content_type)
- [X] T047 [P] [US3] Implement POST `/api/v1/admin/flagged/:id/claim` in `apps/api/src/routes/admin/flagged.routes.ts` (atomic claim via WHERE assignedAdminId IS NULL)
- [X] T048 [P] [US3] Implement GET `/api/v1/admin/flagged/:id` in `apps/api/src/routes/admin/flagged.routes.ts` (full details: content, scores, reasoning)
- [X] T049 [US3] Implement POST `/api/v1/admin/flagged/:id/review` in `apps/api/src/routes/admin/flagged.routes.ts` (approve/reject decision, mandatory notes min 10 chars, update content status)
- [X] T050 [US3] Mount admin flagged routes in `apps/api/src/routes/admin.routes.ts` at `/api/v1/admin/flagged`

#### Admin Review UI (Next.js) ✅ COMPLETE

- [X] T051 [US3] Create flagged content list page in `apps/web/app/(admin)/admin/flagged/page.tsx` (fetch queue, display cards with scores)
- [X] T052 [P] [US3] Create flagged content detail page in `apps/web/app/(admin)/admin/flagged/[id]/page.tsx` (show content, classifier reasoning, approve/reject form)
- [X] T053 [P] [US3] Create UI components for admin review in `apps/web/src/components/admin/FlaggedContentCard.tsx`, `ReviewDecisionForm.tsx`

#### Integration Tests ✅ COMPLETE

- [X] T054 [US3] Write integration test for flagging flow in `apps/api/tests/integration/admin-review.test.ts` (score 0.55 → flagged, in queue, not public)
- [X] T055 [P] [US3] Write integration test for admin approval in `apps/api/tests/integration/admin-review.test.ts` (claim → approve with notes → content public)
- [X] T056 [P] [US3] Write integration test for admin rejection in `apps/api/tests/integration/admin-review.test.ts` (claim → reject with notes → content hidden)
- [X] T057 [P] [US3] Write integration test for concurrent claim prevention in `apps/api/tests/integration/admin-review.test.ts` (verify assignedAdminId blocks double-claim)

**Checkpoint**: ✅ User Story 3 complete. Ambiguous content routes to admin queue, admins can review and decide with full context.

---

## Phase 6: User Story 4 - Verified Agent Gets Faster Evaluation (Priority: P3) ✅ COMPLETE

**Goal**: Agents with 8+ days age and 3+ approvals (verified tier) bypass human review, use normal thresholds

**Independent Test**: Create verified agent (mock 3 prior approvals, 8+ days old), submit content scoring 0.75, verify auto-approved without human review

### Implementation for User Story 4

#### Trust Tier Logic ✅ COMPLETE

- [X] T058 [P] [US4] Implement `determineTrustTier()` function in `packages/guardrails/src/trust/trust-tier.ts` (pure function: age + approvals → tier)
- [X] T059 [P] [US4] Implement `getThresholds()` function in `packages/guardrails/src/trust/trust-tier.ts` (new: autoApprove=1.0, verified: autoApprove=0.70, configurable via env)
- [X] T060 [US4] Write unit tests for trust tier logic in `packages/guardrails/tests/unit/trust-tier.test.ts` (27 tests: boundaries, thresholds, decision matrix)

#### Update Worker Decision Logic ✅ COMPLETE

- [X] T061 [US4] Update `processEvaluation()` in `apps/api/src/workers/guardrail-worker.ts` to query agent trust tier from DB (createdAt + approved count)
- [X] T062 [US4] Update decision thresholds in `apps/api/src/workers/guardrail-worker.ts` to use `getThresholds(trustTier)` instead of hardcoded values

#### Integration Tests ✅ COMPLETE

- [X] T063 [US4] Write integration test for new agent routing in `apps/api/tests/integration/trust-tier.test.ts` (new agent, score 0.75 → flagged for human review despite high score)
- [X] T064 [P] [US4] Write integration test for verified agent auto-approval in `apps/api/tests/integration/trust-tier.test.ts` (verified agent, score 0.75 → auto-approved, no human review)
- [X] T065 [P] [US4] Write integration test for trust tier transition in `apps/api/tests/integration/trust-tier.test.ts` (agent transitions new→verified, thresholds change for same score)

**Checkpoint**: ✅ User Story 4 complete. Trust tier model operational, new agents routed to human review, verified agents use efficient thresholds.

---

## Phase 7: User Story 5 - System Handles High Volume (Priority: P3) ✅ COMPLETE

**Goal**: 50+ concurrent submissions queue correctly, process asynchronously, complete within 60s, no data loss or duplication

**Independent Test**: Simulate 50 concurrent submissions, verify all queued with status "pending", all complete evaluation within 60s, no lost or duplicate evaluations

### Implementation for User Story 5

#### Queue Configuration Hardening ✅ COMPLETE

- [X] T066 [P] [US5] Add queue monitoring metrics in `apps/api/src/workers/guardrail-worker.ts` (WorkerMetrics: job count, processing time, failure rate, periodic logging)
- [X] T067 [P] [US5] Add dead letter queue handling in `apps/api/src/workers/guardrail-worker.ts` (check attemptsMade >= maxAttempts in failed event, log DEAD LETTER for manual review)

#### Load Testing ✅ COMPLETE

- [X] T068 [US5] Write load test in `apps/api/tests/load/guardrail-concurrency.test.ts` (submit 50 concurrent requests via Promise.all, verify all complete within 30s)
- [X] T069 [P] [US5] Write load test in `apps/api/tests/load/guardrail-cache.test.ts` (20 submissions with ~50% duplicates, verify cache hit rate >=30%)
- [X] T070 [P] [US5] Write load test in `apps/api/tests/load/guardrail-throughput.test.ts` (10 sequential items, verify avg <2s/item → >100 items/hour)

#### Resilience Tests ✅ COMPLETE

- [X] T071 [US5] Write integration test for LLM API failure in `apps/api/tests/integration/guardrail-evaluation.test.ts` (mock API 500 → 3 retries → job in failed state, evaluation not completed)
- [X] T072 [P] [US5] Write integration test for worker recovery in `apps/api/tests/integration/guardrail-evaluation.test.ts` (worker processes jobs reliably after setup)
- [X] T073 [P] [US5] Write integration test for duplicate submission prevention in `apps/api/tests/integration/guardrail-evaluation.test.ts` (10 identical → 1 LLM call + 9 cache hits)

**Checkpoint**: ✅ User Story 5 complete. System handles high volume without data loss, queue processes efficiently, resilient to failures.

---

## Phase 8: Polish & Cross-Cutting Concerns ✅ COMPLETE

**Purpose**: Improvements that affect multiple user stories and final deployment readiness

- [X] T074 [P] Add structured Pino logging for all guardrail operations in `packages/guardrails/src/` (layer-a, layer-b, cache — results, scores, decisions, cache hits)
- [X] T075 [P] Add monitoring dashboards config in `config/grafana-dashboards.json` (8 panels: latency, rates, cache, queue depth, DLQ, throughput)
- [X] T076 [P] Add alerting rules in `config/alerts.yml` (6 Prometheus alerts: latency, backlog, failure rate, DLQ, LLM errors, cache miss)
- [X] T077 [P] Create API documentation in `docs/api/guardrails.md` (all endpoints, pipeline diagram, trust tiers, approved domains)
- [X] T078 [P] Create troubleshooting guide in `docs/ops/guardrails-troubleshooting.md` (6 common issues, env vars table, health checks)
- [X] T079 Add Fly.io Procfile with worker entry: `worker: node apps/api/dist/workers/guardrail-worker.js`
- [ ] T080 [P] Add environment variables to Fly.io secrets (ANTHROPIC_API_KEY, guardrail thresholds) — **deferred to deployment**
- [ ] T081 Run full test suite and verify 95% coverage target for `packages/guardrails` — **requires CI with DB/Redis**
- [ ] T082 Run quickstart.md validation end-to-end — **requires deployed environment**
- [X] T083 [P] Add CI job in `.github/workflows/ci.yml` for guardrail regression suite (200+ adversarial test cases, coverage check)
- [X] T084 Update CLAUDE.md with Sprint 3 completion status

**Checkpoint**: ✅ Implementation complete. T080-T082 deferred to deployment phase (require live infrastructure).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - **BLOCKS all user stories**
- **User Story 1 (Phase 3)**: Depends on Foundational completion - MVP target
- **User Story 2 (Phase 4)**: Depends on Foundational completion - Can run in parallel with US1 (different test files, shared core logic)
- **User Story 3 (Phase 5)**: Depends on Foundational completion - Requires US1/US2 evaluation logic but independently testable
- **User Story 4 (Phase 6)**: Depends on Foundational + US1 completion (trust tier logic extends base evaluation)
- **User Story 5 (Phase 7)**: Depends on Foundational + US1 completion (tests existing pipeline under load)
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

```
Foundational (Phase 2) ✅ MUST COMPLETE FIRST
         │
         ├──────────┬──────────┬──────────┬──────────┐
         ▼          ▼          ▼          ▼          ▼
      US1 (P1)   US2 (P1)   US3 (P2)   US4 (P3)   US5 (P3)
      Valid      Harmful    Admin      Trust      High
      Content    Content    Review     Tiers      Volume
         │          │          │          │          │
         │          │          │          │          │
         └──────────┴──────────┴──────────┴──────────┘
                            │
                            ▼
                    Polish (Phase 8)
```

**Independence**: Each user story can start after Foundational phase completes. US2, US3, US4, US5 can run in parallel if team capacity allows.

**Recommended Sequence** (single developer):
1. Foundational (blocks everything)
2. US1 (P1) - Core happy path, MVP target
3. US2 (P1) - Security critical, extends US1 tests
4. US3 (P2) - Human oversight for edge cases
5. US4 (P3) - Efficiency optimization
6. US5 (P3) - Scalability validation
7. Polish - Final hardening

### Within Each User Story

- Tests → Models → Services → Endpoints → Integration
- Models marked [P] can run in parallel
- Tests marked [P] can run in parallel
- Endpoints marked [P] can run in parallel
- Core logic before integration
- Story fully tested before moving to next priority

### Parallel Opportunities

**Setup (Phase 1)**:
- T003, T004, T005 can run in parallel (different config files)

**Foundational (Phase 2)**:
- T008, T009, T010 can run in parallel (different seed scripts)
- T012, T013, T014, T015 can run in parallel (different type/schema files)

**User Story 1 (Phase 3)**:
- T017, T018 can run in parallel (different layer-a files)
- T020, T021 can run in parallel (different layer-b files)
- T024, T025 can run in parallel (cache functions in same file but independent)
- T031, T033, T034, T035 can run in parallel (different test files, GET endpoint separate)

**User Story 2 (Phase 4)**:
- T037, T038, T039, T040 can run in parallel (different test files)
- T041, T042, T043 can run in parallel (different test scenarios)

**User Story 3 (Phase 5)**:
- T046, T047, T048 can run in parallel (different admin endpoints)
- T052, T053 can run in parallel (different UI pages/components)
- T054, T055, T056, T057 can run in parallel (different test scenarios)

**User Story 4 (Phase 6)**:
- T058, T059 can run in parallel (different trust-tier functions)
- T063, T064, T065 can run in parallel (different test scenarios)

**User Story 5 (Phase 7)**:
- T066, T067 can run in parallel (different worker enhancements)
- T069, T070 can run in parallel (different load test files)
- T072, T073 can run in parallel (different resilience test scenarios)

**Polish (Phase 8)**:
- T074, T075, T076, T077, T078, T080, T083 can run in parallel (different files/configs)

---

## Parallel Example: User Story 1

```bash
# After Foundational phase completes, launch Layer A and Layer B in parallel:

# Terminal 1 - Layer A (T017 + T018 + T019)
Task: "Create patterns.ts + Implement evaluateLayerA() + Write unit tests"

# Terminal 2 - Layer B (T020 + T021 + T022 + T023)
Task: "Create few-shot examples + prompt template + Implement evaluateLayerB() + Write unit tests"

# Terminal 3 - Caching (T024 + T025 + T026)
Task: "Implement cache functions + Write unit tests"

# After T017-T026 complete, proceed sequentially:
# T027: BullMQ worker (depends on Layer A + Layer B + Cache)
# T028: Worker initialization
# T029: Worker script
# T030-T032: API endpoints (depends on worker)
# T033-T035: Integration tests (depends on endpoints)
# T036: Package exports
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

**Target**: Functional guardrail pipeline for valid content approval

1. Complete Phase 1: Setup (~30 min)
2. Complete Phase 2: Foundational (~2 hours - database, types, queue)
3. Complete Phase 3: User Story 1 (~6 hours - Layers A/B, cache, worker, endpoints, tests)
4. **STOP and VALIDATE**: Test US1 independently with food bank example
5. Deploy worker + API to Fly.io
6. Demo: Agent submits valid content → auto-approved <5s

**Estimated Total**: ~1 day (8 hours)

### Incremental Delivery

1. **Day 1**: Setup + Foundational + US1 → **MVP deployed** ✅
2. **Day 2**: US2 (harmful content blocking) → Security hardened ✅
3. **Day 3**: US3 (admin review) → Human oversight operational ✅
4. **Day 4**: US4 (trust tiers) + US5 (high volume) → Efficiency + scale validated ✅
5. **Day 5**: Polish → Production-ready ✅

Each day adds value without breaking previous functionality.

### Parallel Team Strategy

With 3 developers after Foundational phase:

**Week 1**:
- **Developer A**: US1 (valid content) - MVP
- **Developer B**: US2 (harmful content) - Security
- **Developer C**: Foundational support + documentation

**Week 2**:
- **Developer A**: US3 (admin review) - Human oversight
- **Developer B**: US4 (trust tiers) - Optimization
- **Developer C**: US5 (high volume) + Polish - Resilience + deploy

**Total**: 2 weeks with 3 developers, all stories complete in parallel

---

## Task Summary

**Total Tasks**: 84 (81 completed, 3 deferred to deployment)
- **Setup**: 5/5 ✅
- **Foundational**: 11/11 ✅
- **User Story 1 (P1)**: 20/20 ✅ (valid content approval)
- **User Story 2 (P1)**: 8/8 ✅ (harmful content blocking)
- **User Story 3 (P2)**: 13/13 ✅ (admin review queue)
- **User Story 4 (P3)**: 8/8 ✅ (trust tier optimization)
- **User Story 5 (P3)**: 8/8 ✅ (high volume resilience)
- **Polish**: 8/11 ✅ (3 deferred: T080 Fly.io secrets, T081 coverage run, T082 quickstart validation)

**Test Counts**: 341 guardrails unit tests + 93 shared tests + 16 integration tests + 3 load tests = **453+ total tests**

**Coverage Target**: 95% for packages/guardrails (per constitution requirement)

**Estimated Timeline**:
- **Single developer**: 4-5 days (sequential execution)
- **Team of 3**: 2 weeks (parallel user stories)
- **MVP only**: 1 day (US1 only)

---

## Notes

- [P] tasks = different files, no dependencies, can run in parallel
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Tests MUST be written and FAIL before implementation (TDD per constitution)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- **MVP first**: Deploy US1, gather feedback, iterate
- **Incremental delivery**: Each story adds value without breaking previous stories
- **Avoid**: Cross-story dependencies that break independence, vague tasks, same-file conflicts
