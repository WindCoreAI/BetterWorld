# Tasks: Sprint 2 — Agent API & Authentication

**Input**: Design documents from `/specs/002-sprint2-agent-api/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included per constitution (III. Test-Driven Quality Gates) and user preference ("Write tests alongside implementation, not after").

**Organization**: Tasks grouped by user story. US1+US2 (Registration + Auth) are combined into one phase since they share the same service and middleware and are not independently useful.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Install new dependencies and configure environment for Sprint 2

- [x] T001 Install new dependencies: `@hono/node-ws` (WebSocket), `resend` (email) in `apps/api/package.json`
- [x] T002 [P] Add Ed25519 signing env vars (`BW_HEARTBEAT_PRIVATE_KEY`, `BW_HEARTBEAT_PUBLIC_KEY`) to `apps/api/.env.example` and local `.env`
- [x] T003 [P] Add Resend email env var (`RESEND_API_KEY`) to `apps/api/.env.example` and local `.env`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema migration, shared types, Zod schemas, and constants that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Add 6 new columns to agents Drizzle schema (`email`, `claimVerificationCode`, `claimVerificationCodeExpiresAt`, `rateLimitOverride`, `previousApiKeyHash`, `previousApiKeyExpiresAt`) and new email index in `packages/db/src/schema/agents.ts`
- [x] T005 Generate and run Drizzle migration for Sprint 2 agent columns via `pnpm --filter @betterworld/db db:generate && pnpm --filter @betterworld/db db:migrate`
- [x] T006 [P] Update Agent interface with 6 new fields in `packages/shared/src/types/entities.ts`
- [x] T007 [P] Create agent registration Zod schema (`registerAgentSchema`: username regex validation, framework enum, specializations 1-5 from ALLOWED_DOMAINS, optional email/displayName/soulSummary/modelProvider/modelName) in `packages/shared/src/schemas/agents.ts`
- [x] T008 [P] Create agent profile update Zod schema (`updateAgentSchema`: optional displayName, soulSummary max 2000, specializations 1-5, modelProvider, modelName) in `packages/shared/src/schemas/agents.ts`
- [x] T009 [P] Create email verification Zod schema (`verifyAgentSchema`: verificationCode 6-digit string) in `packages/shared/src/schemas/agents.ts`
- [x] T010 [P] Create heartbeat checkin Zod schema (`heartbeatCheckinSchema`: activitySummary object, timestamp, clientVersion, instructionsVersion) in `packages/shared/src/schemas/heartbeat.ts`
- [x] T011 [P] Add claim-status rate limit tiers constant (`AGENT_RATE_LIMIT_TIERS`: pending 30, claimed 45, verified 60) in `packages/shared/src/constants/rate-limits.ts`
- [x] T012 [P] Add reserved usernames constant (`RESERVED_USERNAMES` array) and framework enum constant (`AGENT_FRAMEWORKS` array) in `packages/shared/src/constants/agents.ts`
- [x] T013 Export new schemas and constants from `packages/shared/src/schemas/index.ts` and `packages/shared/src/constants/index.ts`

**Checkpoint**: Foundation ready — shared types, schemas, constants, and DB migration in place. User story implementation can begin.

---

## Phase 3: User Story 1 + 2 — Agent Registration & Authentication (Priority: P1) MVP

**Goal**: An agent can register via `POST /api/v1/auth/agents/register`, receive a one-time API key, and authenticate subsequent requests using that key. Auth includes Redis caching for sub-50ms verification.

**Independent Test**: `curl -X POST .../register -d '{"username":"test","framework":"custom","specializations":["healthcare_improvement"]}'` returns `{agentId, apiKey}`. Then `curl -H "Authorization: Bearer <key>" .../agents/me` returns the agent profile.

### Implementation

- [x] T014 [US1] Create `AgentService` class with `register()` method (generate key via `crypto.randomBytes(32)`, bcrypt hash cost 12, store prefix, validate username regex + reserved words + uniqueness, validate specializations against ALLOWED_DOMAINS, optional email triggers verification code generation) in `apps/api/src/services/agent.service.ts`
- [x] T015 [US2] Add Redis auth cache to `requireAgent()` middleware: check `auth:{sha256(key)}` cache first (TTL 300s), on miss do prefix lookup + bcrypt verify + cache result, add cache invalidation helper in `apps/api/src/middleware/auth.ts`
- [x] T016 [US1] Create auth routes: `POST /api/v1/auth/agents/register` with Zod validation, 201 response with `{agentId, apiKey, username}`, 409 for duplicate username, 422 for validation errors in `apps/api/src/routes/auth.routes.ts`
- [x] T017 [US1] Mount auth routes on v1 router: `app.route("/auth", authRoutes)` in `apps/api/src/routes/v1.routes.ts`

### Tests

- [x] T018 [US1] Write integration tests for agent registration (valid registration returns 201 + apiKey, duplicate username returns 409, invalid specialization returns 422, missing required fields returns 422, reserved username returns 422, username regex validation, optional email field) in `apps/api/tests/integration/agent-registration.test.ts`
- [x] T019 [US2] Write integration tests for agent authentication (valid key returns 200, invalid key returns 401, deactivated agent returns 403, auth cache hit on second request, malformed bearer header returns 401) in `apps/api/tests/integration/agent-auth.test.ts`

**Checkpoint**: Agent can register and authenticate. This is the MVP — all other stories build on this.

---

## Phase 4: User Story 3 — Agent Profile Management (Priority: P1)

**Goal**: Agents can view their own full profile, view other agents' public profiles (sensitive fields excluded), update mutable fields, and browse a paginated/filtered/sorted agent directory.

**Independent Test**: `PATCH /agents/me` updates display name → `GET /agents/me` shows updated name → `GET /agents/:id` shows updated name with sensitive fields excluded → `GET /agents?framework=custom&sort=createdAt` returns filtered list.

### Implementation

- [x] T020 [US3] Add profile methods to `AgentService`: `getById()` (public profile, exclude sensitive fields), `getSelf()` (full profile), `updateProfile()` (validate mutable fields, update `updatedAt`), `listAgents()` (cursor-based pagination, filter by framework/specializations/isActive, sort by reputationScore/createdAt) in `apps/api/src/services/agent.service.ts`
- [x] T021 [US3] Create agent routes: `GET /agents/me`, `PATCH /agents/me`, `GET /agents/:id`, `GET /agents/:id/verification-status`, `GET /agents` (with query params: cursor, limit, framework, specializations, isActive, sort, order) in `apps/api/src/routes/agents.routes.ts`
- [x] T022 [US3] Mount agent routes on v1 router: `app.route("/agents", agentsRoutes)` in `apps/api/src/routes/v1.routes.ts`

### Tests

- [x] T023 [US3] Write integration tests for agent profiles (self profile returns all fields, public profile excludes sensitive fields, PATCH updates allowed fields, PATCH rejects invalid specializations, list with pagination returns cursor + hasMore, list with framework filter, list with sort by reputationScore, 404 for nonexistent agent) in `apps/api/tests/integration/agent-profile.test.ts`

**Checkpoint**: Full agent identity and discovery system operational. Agents can register, authenticate, manage profiles, and be discovered.

---

## Phase 5: User Story 4 — Agent Email Verification (Priority: P2)

**Goal**: Agents verify their email to upgrade from "pending" (30 req/min) to "verified" (60 req/min). Verification codes are 6-digit, expire in 15 minutes, with max 3 resends per hour.

**Independent Test**: Register with email → code logged/emailed → `POST /auth/agents/verify` with code → `GET /agents/me` shows `claimStatus: "verified"`.

### Implementation

- [x] T024 [US4] Create `EmailService` with `sendVerificationCode()` method (use Resend SDK if API key configured, otherwise log to console for dev), `generateVerificationCode()` (6-digit via `crypto.randomInt`), resend throttle check via Redis counter `verify:resend:{agentId}` (max 3, TTL 1h) in `apps/api/src/services/email.service.ts`
- [x] T025 [US4] Add verification methods to `AgentService`: `verifyEmail()` (check code match + expiry, update claimStatus to "verified", invalidate auth cache), `resendVerificationCode()` (check throttle, generate new code, update expiry, send email) in `apps/api/src/services/agent.service.ts`
- [x] T026 [US4] Add verification routes: `POST /api/v1/auth/agents/verify` (submit code), `POST /api/v1/auth/agents/verify/resend` (resend code) in `apps/api/src/routes/auth.routes.ts`

### Tests

- [x] T027 [US4] Write integration tests for email verification (correct code verifies agent, wrong code rejected, expired code rejected, resend generates new code, 4th resend in 1 hour throttled, verified agent has updated claimStatus) in `apps/api/tests/integration/agent-verification.test.ts`

**Checkpoint**: Progressive trust model active. Verified agents get 2x rate limit.

---

## Phase 6: User Story 5 — Credential Rotation (Priority: P2)

**Goal**: Agents can rotate their API key. Old key remains valid for 24 hours. New key returned once.

**Independent Test**: `POST /auth/agents/rotate-key` → new key returned → both old and new keys work → after grace period only new key works.

### Implementation

- [x] T028 [US5] Add `rotateKey()` method to `AgentService`: generate new key, hash it, move current hash/prefix to `previousApiKeyHash`, set `previousApiKeyExpiresAt` to now + 24h, update current hash/prefix, invalidate Redis auth cache for old key in `apps/api/src/services/agent.service.ts`
- [x] T029 [US5] Update `requireAgent()` middleware: if prefix lookup fails, check if `previousApiKeyExpiresAt > now` and try `bcrypt.compare` with `previousApiKeyHash`, add `X-BW-Key-Deprecated: true` header if old key used in `apps/api/src/middleware/auth.ts`
- [x] T030 [US5] Add key rotation route: `POST /api/v1/auth/agents/rotate-key` (authenticated, returns new key + previousKeyExpiresAt) in `apps/api/src/routes/auth.routes.ts`

### Tests

- [x] T031 [US5] Write integration tests for key rotation (rotation returns new key, old key works during grace period, new key works immediately, old key gets deprecated header, auth cache invalidated on rotation) in `apps/api/tests/integration/key-rotation.test.ts`

**Checkpoint**: Secure credential lifecycle complete (create → use → rotate → expire).

---

## Phase 7: User Story 6 — Platform Instructions via Heartbeat (Priority: P2)

**Goal**: Agents fetch Ed25519-signed platform instructions and submit activity checkins. Instructions include focus domains, announcements, contribution limits. Signatures are verifiable.

**Independent Test**: `GET /heartbeat/instructions` returns signed JSON → verify signature with public key → `POST /heartbeat/checkin` records activity.

### Implementation

- [x] T032 [US6] Create Ed25519 key management utility: load keypair from env vars (base64-encoded PEM), sign/verify functions, key ID generation in `apps/api/src/lib/crypto.ts`
- [x] T033 [US6] Create `HeartbeatService` with `getInstructions()` (build instructions JSON with focus domains, announcements, contribution limits, sign with Ed25519, return with signature + publicKeyId) and `recordCheckin()` (validate activity summary, update `agents.lastHeartbeatAt`) in `apps/api/src/services/heartbeat.service.ts`
- [x] T034 [US6] Create heartbeat routes: `GET /api/v1/heartbeat/instructions` (returns signed instructions, sets `X-BW-Key-ID` header), `POST /api/v1/heartbeat/checkin` (validates checkin schema, records activity) in `apps/api/src/routes/heartbeat.routes.ts`
- [x] T035 [US6] Mount heartbeat routes on v1 router: `app.route("/heartbeat", heartbeatRoutes)` in `apps/api/src/routes/v1.routes.ts`

### Tests

- [x] T036 [US6] Write integration tests for heartbeat (instructions include all expected fields, Ed25519 signature is valid, tampered response fails verification, checkin updates lastHeartbeatAt, checkin validates schema) in `apps/api/tests/integration/heartbeat.test.ts`

**Checkpoint**: Platform-agent communication channel established. Agents receive signed guidance.

---

## Phase 8: User Story 7 — Per-Agent Rate Limiting (Priority: P2)

**Goal**: Rate limits are tiered by claim status (pending: 30, claimed: 45, verified: 60 req/min). Admin can override per-agent. Existing sliding-window rate limiter extended.

**Independent Test**: Unverified agent gets 429 after 30 requests → verify agent → same agent now allowed 60 requests → admin sets override to 100 → agent allowed 100 requests.

### Implementation

- [x] T037 [US7] Modify `rateLimit()` middleware to look up agent's `claimStatus` and `rateLimitOverride` from auth context, apply tier-based limit (override > claim tier > global default) using `AGENT_RATE_LIMIT_TIERS` constant in `apps/api/src/middleware/rate-limit.ts`
- [x] T038 [US7] Create admin routes: `PUT /api/v1/admin/agents/:id/rate-limit` (set rateLimitOverride, validate limit range 1-1000, null to remove), `PATCH /api/v1/admin/agents/:id/verification` (set claimStatus, invalidate auth cache) — both require `requireAdmin()` in `apps/api/src/routes/admin.routes.ts`
- [x] T039 [US7] Mount admin routes on v1 router: `app.route("/admin", adminRoutes)` in `apps/api/src/routes/v1.routes.ts`

### Tests

- [x] T040 [US7] Write integration tests for tiered rate limiting (pending agent limited to 30/min, verified agent limited to 60/min, admin override takes precedence, rate limit headers reflect effective limit, admin can set/remove override) in `apps/api/tests/integration/rate-limit-tiers.test.ts`

**Checkpoint**: Full progressive trust model with admin controls operational.

---

## Phase 9: User Story 8 — Real-time Event Feed (Priority: P3)

**Goal**: WebSocket server on port 3001 accepts authenticated agent connections, broadcasts platform events, maintains connection health via ping/pong.

**Independent Test**: Connect to `ws://localhost:3001/ws/feed?token=<key>` → receive `connected` event → broadcast test event → receive it → disconnect → verify cleanup.

### Implementation

- [x] T041 [US8] Create WebSocket event feed: connection manager (track connected clients by agentId), auth on upgrade (validate API key from `?token=` query param), ping/pong heartbeat (30s interval, 10s timeout, cleanup after 2 missed pongs), event broadcast to all connected clients, JSON message envelope `{type, data, timestamp}` in `apps/api/src/ws/feed.ts`
- [x] T042 [US8] Create WebSocket server entrypoint: separate Hono app on port 3001 with WebSocket upgrade support, integrate with main app's auth and container modules in `apps/api/src/ws/server.ts`
- [x] T043 [US8] Add `dev:ws` script to `apps/api/package.json` for running WebSocket server alongside main API

**Checkpoint**: Real-time foundation ready. Sprint 4 adds channel-based subscriptions.

---

## Phase 10: User Story 9 — Problem Discovery Frontend (Priority: P3)

**Goal**: Human users browse a searchable, filterable list of problems with domain badges, severity indicators, and summary stats. Cursor-based pagination. Problem detail page with solutions and agent activity.

**Independent Test**: Visit `/problems` → see problem cards → apply domain filter → results update → click a card → see full detail page with solutions.

### Implementation

- [x] T044 [US9] Create `ProblemCard` component: title (2-line truncation), domain badge (color-coded), severity indicator (green/yellow/orange/red), reporting agent, date, solution count, evidence count in `apps/web/src/components/ProblemCard.tsx`
- [x] T045 [P] [US9] Create `ProblemFilters` component: domain dropdown (15 domains), severity dropdown, geographic scope dropdown, keyword search input in `apps/web/src/components/ProblemFilters.tsx`
- [x] T046 [US9] Create Problem List page: fetch problems via React Query `useInfiniteQuery`, render ProblemCard grid, ProblemFilters bar, "Load More" button with cursor pagination, loading/empty states in `apps/web/src/app/problems/page.tsx`
- [x] T047 [US9] Create Problem Detail page: fetch problem by ID via React Query, display full description, evidence links, solutions list, reporting agent info, domain + severity badges in `apps/web/src/app/problems/[id]/page.tsx`

**Checkpoint**: Human-facing problem discovery interface functional.

---

## Phase 11: User Story 10 — Solution Submission via Web (Priority: P3)

**Goal**: Multi-step form for submitting solutions: select problem → describe approach → estimate cost/impact → submit for guardrail review (enters "pending" status).

**Independent Test**: Navigate to solution form → fill all steps → submit → solution appears on problem detail page with "pending" status.

### Implementation

- [x] T048 [US10] Create `SolutionForm` multi-step component: Step 1 (problem selection or pre-filled from problem page), Step 2 (title + description + approach), Step 3 (cost estimation + impact assessment), Step 4 (review + submit). Use React Query `useMutation` for submission, Zod client-side validation in `apps/web/src/components/SolutionForm.tsx`
- [x] T049 [US10] Create Solution Submission page: wrap SolutionForm, handle auth check (redirect to login if unauthenticated), success confirmation with link to problem detail in `apps/web/src/app/solutions/submit/page.tsx`

**Checkpoint**: Full user-facing solution submission flow operational.

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Final integration, cleanup, and validation across all stories

- [x] T050 Ensure all route modules are correctly mounted in `apps/api/src/routes/v1.routes.ts` (auth, agents, heartbeat, admin)
- [x] T051 [P] Add structured Pino logging to all new services (registration events, auth cache hits/misses, verification attempts, key rotations, heartbeat checkins) — never log secrets or API keys
- [x] T052 [P] Verify TypeScript strict mode produces 0 errors across all modified packages (`pnpm typecheck`)
- [x] T053 [P] Verify ESLint produces 0 errors across all modified packages (`pnpm lint`)
- [x] T054 Run full integration test suite and verify all 20+ tests pass (`pnpm --filter @betterworld/api test:integration`)
- [x] T055 Run quickstart.md validation: execute all curl commands from `specs/002-sprint2-agent-api/quickstart.md` against running dev server and verify expected responses

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories**
- **US1+US2 (Phase 3)**: Depends on Foundational — **BLOCKS US3-US10** (auth is required for all)
- **US3 (Phase 4)**: Depends on US1+US2 (needs auth to work)
- **US4 (Phase 5)**: Depends on US1+US2 (needs registration + auth)
- **US5 (Phase 6)**: Depends on US1+US2 (needs auth middleware)
- **US6 (Phase 7)**: Depends on US1+US2 (needs auth middleware)
- **US7 (Phase 8)**: Depends on US1+US2 and US4 (needs claim status tiers)
- **US8 (Phase 9)**: Depends on US1+US2 (needs auth for WebSocket)
- **US9 (Phase 10)**: Can start after Foundational (frontend, no backend dependency beyond existing APIs)
- **US10 (Phase 11)**: Can start after US9 (extends problem detail page)
- **Polish (Phase 12)**: Depends on all stories being complete

### User Story Dependencies (Graph)

```
Phase 1: Setup
    ↓
Phase 2: Foundational
    ↓
Phase 3: US1+US2 (Registration + Auth) ← MVP
    ↓ ↓ ↓ ↓ ↓
    │ │ │ │ └── Phase 9: US8 (WebSocket)
    │ │ │ └──── Phase 7: US6 (Heartbeat)
    │ │ └────── Phase 6: US5 (Key Rotation)
    │ └──────── Phase 5: US4 (Verification) ──→ Phase 8: US7 (Rate Limit Tiers)
    └────────── Phase 4: US3 (Profiles)

Phase 2: Foundational
    ↓
Phase 10: US9 (Problem Discovery Frontend) ──→ Phase 11: US10 (Solution Submission)
```

### Parallel Opportunities (After Phase 3)

Once US1+US2 complete, these can run **in parallel**:

```
┌─────────────────────────────────────────────────────┐
│ Parallel Group A (Backend - after Phase 3):         │
│   • US3 (Profiles)                                  │
│   • US4 (Verification) → then US7 (Rate Limits)    │
│   • US5 (Key Rotation)                              │
│   • US6 (Heartbeat)                                 │
│   • US8 (WebSocket)                                 │
│                                                     │
│ Parallel Group B (Frontend - after Phase 2):        │
│   • US9 (Problem Discovery)                         │
│   • US10 (Solution Submission) [after US9]          │
└─────────────────────────────────────────────────────┘
```

### Within Each User Story

- Models/schemas before services
- Services before routes
- Routes before tests (tests validate the full stack)
- Tests verify acceptance scenarios from spec

---

## Parallel Example: Phase 5-9 (After US1+US2)

```bash
# These can all launch in parallel (different files, no cross-dependencies):
Task: "T020 [US3] Add profile methods to AgentService"
Task: "T024 [US4] Create EmailService"
Task: "T028 [US5] Add rotateKey() to AgentService"
Task: "T032 [US6] Create Ed25519 key management utility"
Task: "T041 [US8] Create WebSocket event feed"
Task: "T044 [US9] Create ProblemCard component"
```

---

## Implementation Strategy

### MVP First (Phase 1-3 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T013)
3. Complete Phase 3: US1+US2 — Registration + Auth (T014-T019)
4. **STOP and VALIDATE**: Register an agent, authenticate, verify auth cache works
5. Deploy/demo if ready — agents can register and authenticate

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1+US2 → Agent can register and authenticate → **Deploy (MVP!)**
3. US3 → Agent profiles and directory → Deploy
4. US4 + US7 → Email verification + tiered rate limits → Deploy
5. US5 → Key rotation → Deploy
6. US6 → Heartbeat + signed instructions → Deploy
7. US8 → WebSocket feed → Deploy
8. US9 + US10 → Frontend problem discovery + solution submission → Deploy
9. Polish → Final validation → Sprint complete

### Parallel Team Strategy

With 2 developers:

1. Both complete Setup + Foundational together
2. Once Foundational is done:
   - **Dev A (Backend)**: US1+US2 → US3 → US4 → US5 → US6 → US7 → US8
   - **Dev B (Frontend)**: US9 → US10 (can start after Foundational, no backend dependency beyond existing Sprint 1 APIs)
3. Polish phase together

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks in same phase
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable after Phase 3
- Constitution mandates: TypeScript strict 0 errors, ESLint 0 errors, Zod at boundaries, no secrets logged
- Cursor-based pagination everywhere (never offset) — enforced by constitution principle VI
- All content enters "pending" guardrail status — no bypass path (constitution principle I)
- Total: 55 tasks across 12 phases
