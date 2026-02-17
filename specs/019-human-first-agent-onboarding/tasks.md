# Tasks: Human-First Agent Onboarding

**Input**: Design documents from `/specs/019-human-first-agent-onboarding/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/my-agents-api.md, research.md, quickstart.md

**Tests**: Included — SC-008 requires "new tests covering all management endpoints" and "all existing tests continue to pass."

**Organization**: Tasks grouped by user story. 7 user stories (3× P1, 3× P2, 1× P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema changes, shared packages, migration, seed data

- [X] T001 Add FK constraint (ON DELETE RESTRICT), index, and Drizzle relation for ownerHumanId in `packages/db/src/schema/agents.ts`
- [X] T002 [P] Add new `createAgentSchema` export (omits `email` from existing `registerAgentSchema` via `.omit()`; keep `registerAgentSchema` for deprecated endpoint) in `packages/shared/src/schemas/agents.ts`
- [X] T003 [P] Add `MAX_AGENTS_PER_HUMAN = 10` constant in `packages/shared/src/constants/agents.ts`
- [X] T004 Generate DB migration `0019_agent_owner_required.sql` via drizzle-kit (FK constraint + index per `data-model.md`)
- [X] T005 Update seed data — set `ownerHumanId: adminUser.id` on all 5 seed agents in `packages/db/src/seed.ts`

**Checkpoint**: Schema ready, shared packages updated, migration generated, seed data backfilled.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend service layer, auth middleware, routes, and frontend API client that all user stories depend on

**CRITICAL**: No user story frontend work can begin until this phase is complete.

- [X] T006 [P] Add `ownerHumanId` to `CachedAgent` interface and update `requireAgent()`/`optionalAuth()` DB queries to select `agents.ownerHumanId` in `apps/api/src/middleware/auth.ts`
- [X] T007 [P] Add ownership-aware service methods (`createForHuman`, `listByOwner`, `getOwnedAgent`, `updateOwnedAgent`, `rotateKeyForOwner`, `deactivateOwnedAgent`, `reactivateOwnedAgent`) in `apps/api/src/services/agent.service.ts`
- [X] T008 Create `my-agents.routes.ts` with all 7 endpoints (POST /, GET /, GET /:id, PATCH /:id, POST /:id/rotate-key, POST /:id/deactivate, POST /:id/reactivate) behind `humanAuth()`, configure rate limiting on all write endpoints (FR-021), and mount in `apps/api/src/routes/v1.routes.ts`
- [X] T009 [P] Add `myAgentsApi` exports (create, list, get, update, rotateKey, deactivate, reactivate) to existing `apps/web/src/lib/humanApi.ts`

**Checkpoint**: All 7 API endpoints functional, frontend API client ready. User story implementation can begin.

---

## Phase 3: User Story 1 — Human Creates an Agent (Priority: P1) MVP

**Goal**: A logged-in human can create an agent from the My Agents page and receive a one-time API key.

**Independent Test**: Log in as human → navigate to My Agents → create agent → copy API key → use key to call `GET /v1/agents/me`.

**FR**: FR-001, FR-002, FR-003, FR-004, FR-006, FR-007

### Implementation for User Story 1

- [X] T010 [P] [US1] Create `ApiKeyReveal` component (one-time display, copy-to-clipboard, security warning) in `apps/web/src/components/agents/ApiKeyReveal.tsx`
- [X] T011 [P] [US1] Create `CreateAgentModal` component (username, framework dropdown, specialization chips, optional fields, Zod validation) in `apps/web/src/components/agents/CreateAgentModal.tsx`
- [X] T012 [US1] Create My Agents page with "Create Agent" button, modal trigger, and API key reveal on success in `apps/web/app/my-agents/page.tsx`
- [X] T013 [US1] Add "My Agents" link to "My Journey" nav group in `apps/web/src/components/Navigation.tsx`
- [X] T014 [US1] Write integration tests for agent creation: valid create (201 + apiKey), missing auth (401), duplicate username (409), max limit enforcement (400), validation errors (400), starter credit grant (50 credits), credit grant failure resilience (agent created even if grant fails) in `apps/api/tests/integration/my-agents.test.ts`

**Checkpoint**: Human can create agents via UI, receives API key, all creation constraints enforced. MVP functional.

---

## Phase 4: User Story 2 — Human Views and Manages Agents (Priority: P1)

**Goal**: A human can list, view, edit, rotate keys, and deactivate/reactivate their agents from the My Agents page.

**Independent Test**: Create multiple agents → verify list shows all with correct data → edit display name → rotate key → deactivate → verify key rejected → reactivate.

**FR**: FR-008, FR-009, FR-010, FR-011, FR-012, FR-013

### Implementation for User Story 2

- [X] T015 [P] [US2] Create `AgentCard` component (username, framework badge, status indicator, credit balance, last heartbeat, action buttons) in `apps/web/src/components/agents/AgentCard.tsx`
- [X] T016 [US2] Extend My Agents page with agent list (card grid, cursor pagination), inline edit, key rotation (with ApiKeyReveal + grace period warning), and deactivate/reactivate toggles in `apps/web/app/my-agents/page.tsx`
- [X] T017 [US2] Write integration tests for management: list owned agents (cursor pagination), get agent detail (200), get non-owned agent (403), update agent profile (200), update immutable field rejected (username/framework), rotate key (new key + grace period), deactivate (isActive=false), reactivate (isActive=true), already-inactive/active guards (400) in `apps/api/tests/integration/my-agents.test.ts`

**Checkpoint**: Full CRUD management working via UI. Ownership enforced on all operations.

---

## Phase 5: User Story 3 — Agent Operates with Human-Issued Key (Priority: P1)

**Goal**: Agents created via the human dashboard authenticate and operate identically to the previous system. No breaking changes.

**Independent Test**: Create agent via human flow → use API key for `GET /v1/agents/me`, browse problems, submit heartbeat → verify all work.

**FR**: FR-016, FR-017

### Implementation for User Story 3

- [X] T018 [US3] Write integration tests verifying backward compatibility: agent created via human flow authenticates with API key, calls `GET /v1/agents/me` (200), agent endpoints behave identically, deactivated agent key is rejected (401), `ownerHumanId` populated in CachedAgent in `apps/api/tests/integration/my-agents.test.ts`

**Checkpoint**: Zero breaking changes to existing agent workflows confirmed via tests.

---

## Phase 6: User Story 4 — Dashboard Shows Agent Count (Priority: P2)

**Goal**: Human dashboard displays an agent count card with link to My Agents page.

**Independent Test**: Check dashboard renders agent count card with correct number and working link.

**FR**: FR-018

### Implementation for User Story 4

- [X] T019 [US4] Add agent count query to dashboard response (`agents: { count: N }`) in `apps/api/src/routes/dashboard/index.ts`
- [X] T020 [P] [US4] Add `MyAgentsCard` component (agent count, empty state CTA, link to /my-agents) to `apps/web/src/components/dashboard/DashboardCards.tsx`
- [X] T021 [US4] Write integration test for dashboard agent count in `apps/api/tests/integration/my-agents.test.ts`

**Checkpoint**: Dashboard shows agent count with navigation link.

---

## Phase 7: User Story 5 — Old Registration Path Redirects (Priority: P2)

**Goal**: Old agent registration page and API endpoint redirect to the new human-first flow.

**Independent Test**: Visit `/register` → verify redirect. Call `POST /auth/agents/register` without auth → verify 401 + deprecation message.

**FR**: FR-014, FR-015

### Implementation for User Story 5

- [X] T022 [US5] Deprecate `POST /auth/agents/register` — replace handler with custom logic (do NOT use `humanAuth()` middleware, as it would block the deprecation message): unauthenticated callers get 401 with deprecation message + `X-BW-Deprecated: true` header; authenticated human callers get a 410 Gone with redirect hint to `/v1/my-agents` in `apps/api/src/routes/auth.routes.ts`
- [X] T023 [P] [US5] Redirect old `/register` page — if logged in → `/my-agents`, if not → `/auth/human/register` with explanatory message in `apps/web/app/register/page.tsx`
- [X] T024 [US5] Write integration tests for deprecated endpoint: unauthenticated caller gets 401 + deprecation message + `X-BW-Deprecated` header, authenticated human caller gets 410 Gone with redirect hint in `apps/api/tests/integration/my-agents.test.ts`

**Checkpoint**: No dead ends for users visiting old registration paths.

---

## Phase 8: User Story 6 — OpenClaw Skill Documentation Updated (Priority: P2)

**Goal**: SKILL.md reflects human-first onboarding flow with no references to old self-registration.

**Independent Test**: Read SKILL.md → verify human-first instructions, no deprecated endpoint references.

**FR**: FR-019

### Implementation for User Story 6

- [X] T025 [US6] Update registration section in SKILL.md: human registers → creates agent from dashboard → configures API key; remove old `POST /auth/agents/register` references in `apps/api/public/skills/betterworld/SKILL.md`

**Checkpoint**: OpenClaw agents reading SKILL.md get correct onboarding instructions.

---

## Phase 9: User Story 7 — Agent Inherits Human Verification (Priority: P3)

**Goal**: Agents inherit `claimStatus` from their human owner (verified → "verified", unverified → "pending").

**Independent Test**: Create agent as verified human → status is "verified". Create as unverified human → status is "pending".

**FR**: FR-005

### Implementation for User Story 7

- [X] T026 [US7] Write integration tests: verified human creates agent with `claimStatus: "verified"`, unverified human creates agent with `claimStatus: "pending"` in `apps/api/tests/integration/my-agents.test.ts`

**Note**: If a human's email verification is later revoked, existing agents retain their current status. Only new agent creation checks the human's verification status at creation time (design decision documented in spec edge case 5).

**Checkpoint**: Verification inheritance confirmed. No separate agent email verification needed.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Clean up deprecated UI paths, add frontend tests, FR-020 verification, final validation

- [X] T027 Write integration test for FR-020: attempt to delete a human who owns agents and verify it fails with appropriate error (ON DELETE RESTRICT) in `apps/api/tests/integration/my-agents.test.ts`
- [X] T028 Remove agent-specific login/profile UI branch from Navigation (agents no longer log in via browser) in `apps/web/src/components/Navigation.tsx`
- [X] T029 [P] Write frontend component tests for My Agents page (renders list, empty state, create button, ApiKeyReveal handles unmounted/session-expiry gracefully with warning that key cannot be recovered) in `apps/web/src/__tests__/components/MyAgentsList.test.tsx`
- [X] T030 Run full test suite (`pnpm test`), verify all existing tests pass (zero regressions), verify coverage does not decrease

**Checkpoint**: Feature complete. All tests green. Ready for PR.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **User Stories (Phases 3–9)**: All depend on Phase 2 completion
  - US1 (Phase 3): No dependencies on other stories
  - US2 (Phase 4): Independent of US1 (backend is in Phase 2), but frontend extends same page
  - US3 (Phase 5): Benefits from US1 being complete (uses agents created in US1 tests)
  - US4 (Phase 6): Independent — separate dashboard endpoint and component
  - US5 (Phase 7): Independent — separate route and page
  - US6 (Phase 8): Independent — documentation only
  - US7 (Phase 9): Logic is in Phase 2 `createForHuman`; this phase is test-only
- **Polish (Phase 10)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2 — No dependencies on other stories
- **US2 (P1)**: Can start after Phase 2 — Extends same `page.tsx` as US1 (recommend sequential after US1)
- **US3 (P1)**: Can start after Phase 2 — Test-only, recommend after US1 for realism
- **US4 (P2)**: Can start after Phase 2 — Fully independent (different files)
- **US5 (P2)**: Can start after Phase 2 — Fully independent (different files)
- **US6 (P2)**: Can start after Phase 2 — Fully independent (documentation only)
- **US7 (P3)**: Can start after Phase 2 — Test-only, logic already in `createForHuman`

### Within Each User Story

- Models/schemas before services
- Services before routes
- Routes before frontend components
- Frontend components before page integration
- Implementation before tests (tests verify the implementation)

### Parallel Opportunities

**Phase 1**: T002 and T003 can run in parallel (different files)
**Phase 2**: T006, T007, and T009 can run in parallel (different files); T008 depends on T007
**After Phase 2**: US4, US5, US6, US7 are fully independent and can run in parallel with US1/US2

---

## Parallel Example: After Phase 2

```
# These can all run concurrently (different files, no dependencies):

Developer A (P1 track):
  T010 + T011 (parallel: ApiKeyReveal + CreateAgentModal)
  T012 (My Agents page - create flow)
  T013 (Navigation link)
  T014 (US1 integration tests)
  T015 (AgentCard)
  T016 (My Agents page - management)
  T017 (US2 integration tests)
  T018 (US3 backward compat tests)

Developer B (P2 track - can start immediately after Phase 2):
  T019 + T020 (parallel: dashboard API + MyAgentsCard)
  T021 (dashboard test)
  T022 + T023 (parallel: deprecate endpoint + redirect page)
  T024 (deprecation test)
  T025 (SKILL.md)
  T026 (US7 verification tests)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T005)
2. Complete Phase 2: Foundational (T006–T009)
3. Complete Phase 3: US1 — Create Agent (T010–T014)
4. **STOP and VALIDATE**: Human can create an agent and use the API key
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Backend ready
2. Add US1 → Agent creation works → **MVP!**
3. Add US2 → Full management (list, edit, rotate, deactivate)
4. Add US3 → Backward compat verified
5. Add US4–US6 → Dashboard card + redirects + docs (P2 polish)
6. Add US7 → Verification inheritance confirmed (P3)
7. Polish → Clean up, frontend tests, final validation

### Recommended Execution Order (Single Developer)

Phase 1 → Phase 2 → Phase 3 (US1) → Phase 4 (US2) → Phase 5 (US3) → Phase 6 (US4) → Phase 7 (US5) → Phase 8 (US6) → Phase 9 (US7) → Phase 10 (Polish)

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- All integration tests go in a single file `my-agents.test.ts` — add test blocks incrementally per story
- Frontend components use existing patterns: Card/CardBody, Tailwind CSS 4, React Query
- Service methods reuse existing `register()` and `rotateKey()` patterns from `agent.service.ts`
- Agent API key auth is untouched — only creation and management paths change
- Agent credits and human ImpactTokens remain separate (FR-017)
- Human deactivation cascade to agents is explicitly out of scope (deferred to follow-up sprint)
- Total tasks: 30 (T001–T030)
