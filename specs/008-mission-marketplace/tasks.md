# Tasks: Mission Marketplace

**Input**: Design documents from `/specs/008-mission-marketplace/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Included — spec requires 20+ integration tests (SC-010), constitution mandates quality gates (NON-NEGOTIABLE).

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies, configure environment, enable PostGIS

- [x] T001 Install frontend map dependencies: `pnpm --filter @betterworld/web add leaflet react-leaflet leaflet.markercluster` and `pnpm --filter @betterworld/web add -D @types/leaflet @types/leaflet.markercluster`
- [x] T002 Add `MESSAGE_ENCRYPTION_KEY` to `.env.example` and `.env` with generated 32-byte base64 key; document in `apps/api/src/lib/env.ts` Zod validation (min 32 chars base64)
- [ ] T003 Enable PostGIS extension in local PostgreSQL: `CREATE EXTENSION IF NOT EXISTS postgis;` (add to Docker init script or Drizzle custom migration)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema, shared types, and utilities that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Add new enums to `packages/db/src/schema/enums.ts`: `missionStatusEnum` (open, claimed, in_progress, submitted, verified, expired, archived), `difficultyLevelEnum` (beginner, intermediate, advanced, expert), `claimStatusEnum` (active, submitted, verified, abandoned, released)
- [x] T005 Create missions table schema in `packages/db/src/schema/missions.ts` per data-model.md: 22 columns including solutionId FK, createdByAgentId FK, instructions JSONB, evidenceRequired JSONB, requiredSkills text[], requiredLatitude/Longitude decimal(10,7), tokenReward integer, maxClaims, currentClaimCount, guardrailStatus, expiresAt. Add all indexes (solution, agent, status, domain, difficulty, expiresAt, GIN on skills, composite marketplace index)
- [x] T006 Create missionClaims table schema in `packages/db/src/schema/missionClaims.ts` per data-model.md: missionId FK, humanId FK, claimStatusEnum, claimedAt, deadlineAt, progressPercent (0-100), completedAt, notes. Add indexes (mission, human, status, deadline)
- [x] T007 Create messages table schema in `packages/db/src/schema/messages.ts` per data-model.md: senderId FK, receiverId FK, threadId self-FK, encryptedContent text, encryptionKeyVersion integer, isRead boolean. Add CHECK (senderId != receiverId), indexes (sender, receiver+createdAt composite, thread)
- [x] T008 Export new schemas from `packages/db/src/schema/index.ts`: add missions, missionClaims, messages exports
- [ ] T009 Run Drizzle migration generation: `pnpm --filter @betterworld/db drizzle-kit generate` and apply with `pnpm --filter @betterworld/db drizzle-kit push`
- [ ] T010 Create raw SQL migration for PostGIS geography column + GIST index on missions table, and partial unique index on mission_claims (mission_id, human_id) WHERE status IN ('active', 'submitted') per data-model.md
- [x] T011 [P] Create mission Zod schemas in `packages/shared/src/schemas/missions.ts`: createMissionSchema, updateMissionSchema, missionListQuerySchema (with geo params: lat, lng, radiusKm, nearMe, domain, skills, difficulty, minReward, maxReward, maxDuration, sort, cursor, limit), claimMissionSchema, updateClaimSchema
- [x] T012 [P] Create message Zod schemas in `packages/shared/src/schemas/messages.ts`: sendMessageSchema (receiverId uuid, content 1-5000 chars, threadId optional uuid), messageListQuerySchema (cursor, limit, unreadOnly)
- [x] T013 [P] Create mission TypeScript types in `packages/shared/src/types/missions.ts`: Mission, MissionClaim, MissionListItem, MissionDetail, DecomposedMission, Message, MessageThread types
- [x] T014 Create geo-helpers library in `apps/api/src/lib/geo-helpers.ts`: `snapToGrid(lat, lng, precision)` for 1km grid snapping, `getDynamicRadius(lat, lng, redis)` using Nominatim place_rank (urban 10km, suburban 25km, rural 50km) with Redis cache (30-day TTL, 0.01° grid key), `buildGeoQuery(lat, lng, radiusKm)` returning raw SQL for ST_DWithin
- [x] T015 Create message encryption helpers in `apps/api/src/lib/encryption-helpers.ts`: `encryptMessage(plaintext)` → `iv:ciphertext:authTag` using AES-256-GCM with KEK from env, `decryptMessage(encrypted, keyVersion)` → plaintext. Use crypto.randomBytes(12) for IV
- [x] T016 Prepare route mount points in `apps/api/src/routes/v1.routes.ts`: add imports and `.route("/missions", missionRoutes)` and `.route("/messages", messageRoutes)` (routes created in later phases)

**Checkpoint**: Database migrated, schemas validated, shared types ready. User story implementation can now begin.

---

## Phase 3: User Story 1 — Agent Creates Missions from Solutions (Priority: P1) 🎯 MVP

**Goal**: Agents can manually create missions linked to approved solutions, with guardrail validation. AI decomposition generates 3-8 missions from a solution.

**Independent Test**: Agent creates a mission for an approved solution → mission passes guardrails → appears with status "open". Agent triggers decomposition → gets 3-8 suggested missions.

### Implementation for User Story 1

- [x] T017 [US1] Implement POST /api/v1/missions in `apps/api/src/routes/missions/index.ts`: validate with createMissionSchema, verify solutionId references an approved solution owned by the agent (IDOR check), insert mission with guardrailStatus "pending", call enqueueForEvaluation() per solutions.routes.ts pattern, return 201 with mission id and evaluationId. Use `new Hono<AppEnv>()`, requireAgent middleware
- [x] T018 [US1] Implement PATCH /api/v1/missions/:id in `apps/api/src/routes/missions/index.ts`: validate UUID param, verify agent owns mission, reject if mission has active claims (409 Conflict), reset guardrailStatus to "pending" and re-enqueue for evaluation. Zod partial validation
- [x] T019 [US1] Implement DELETE /api/v1/missions/:id (soft delete → status "archived") in `apps/api/src/routes/missions/index.ts`: verify agent owns mission, reject if active claims exist, set status to "archived"
- [x] T020 [US1] Implement GET /api/v1/missions/agent in `apps/api/src/routes/missions/index.ts`: list missions created by authenticated agent, cursor-based pagination, optional status filter. requireAgent middleware
- [x] T021 [US1] Implement Claude Sonnet decomposition in `apps/api/src/routes/missions/decompose.ts`: POST /api/v1/internal/solutions/:solutionId/decompose. Verify agent owns approved solution. Check Redis rate limit (10/day/agent via `ratelimit:decompose:{agentId}:{YYYY-MM-DD}`). Call Claude Sonnet with tool_use for structured output per research.md R4. Track cost in Redis `cost:daily:sonnet:decomposition:{date}`. Return 3-8 suggested missions (NOT auto-published). Handle API errors gracefully (503 if Claude unavailable)
- [ ] T022 [US1] Write integration tests in `apps/api/src/__tests__/missions/mission-crud.test.ts`: test mission creation with valid/invalid inputs, ownership check (agent can't create for other agent's solution), solution must be approved, guardrail enqueue verification, mission update re-triggers guardrail, archive with/without active claims, agent mission list with pagination

### Checkpoint: Agents can create and manage missions. Decomposition generates suggestions.

---

## Phase 4: User Story 2 — Human Browses and Discovers Missions (Priority: P1)

**Goal**: Humans browse the marketplace via list + map views with filtering and geo-search. Dynamic radius defaults based on population density.

**Independent Test**: Load marketplace page → missions appear in list and on map → filters narrow results → "Near Me" uses dynamic radius.

**Dependencies**: US1 (missions must exist to browse)

### Implementation for User Story 2

- [ ] T023 [US2] Implement GET /api/v1/missions in `apps/api/src/routes/missions/index.ts`: accept both humanAuth and optionalAuth (agents can browse too). Parse missionListQuerySchema. Only return approved + open missions. Apply filters: domain, skills (array containment), difficulty, minReward/maxReward, maxDuration. If lat+lng provided, use buildGeoQuery for ST_DWithin. If nearMe=true, fetch human's profile location and call getDynamicRadius. Cursor-based pagination. Return approximate lat/lng (snapToGrid 1km) for privacy. Include slotsAvailable (maxClaims - currentClaimCount), distance if geo-search
- [ ] T024 [P] [US2] Create reusable Leaflet map wrapper in `apps/web/src/components/ui/Map.tsx`: "use client" component, accepts center/zoom/markers/onMarkerClick props. Use OpenStreetMap tiles. Export as dynamic import with ssr: false. Include Leaflet CSS import
- [ ] T025 [P] [US2] Create MissionCard component in `apps/web/src/components/missions/MissionCard.tsx`: displays title, domain badge, skills tags, reward, difficulty, location name, slots available, distance (if geo), time remaining. Links to /missions/[id]
- [ ] T026 [P] [US2] Create MissionStatusBadge component in `apps/web/src/components/missions/MissionStatusBadge.tsx`: colored badges for open/claimed/in_progress/submitted/verified/expired status values
- [ ] T027 [US2] Create MissionMap component in `apps/web/src/components/missions/MissionMap.tsx`: "use client", wraps Map component, adds leaflet.markercluster for clustering. Accepts missions array, renders markers at approximate locations. Click marker → show popup with title + reward + claim CTA. Handle empty state (no missions in view)
- [ ] T028 [US2] Create MissionFilters component in `apps/web/src/components/missions/MissionFilters.tsx`: filter sidebar with domain dropdown (15 domains), skills multi-select, radius slider (1-200km), reward range (min/max), duration max, difficulty select. "Near Me" toggle. Emits filter changes via callback. Responsive (collapsible on mobile)
- [ ] T029 [US2] Create marketplace page in `apps/web/app/missions/page.tsx`: dual-view layout (list left, map right on desktop; toggle on mobile). Fetches missions from GET /api/v1/missions with React Query. Integrates MissionFilters, MissionCard (infinite scroll via cursor), MissionMap (clustered). Syncs filters between list and map views. Empty state when no missions match. humanAuth required
- [ ] T030 [US2] Write integration tests in `apps/api/src/__tests__/missions/mission-list.test.ts`: test mission list filtering (domain, skills, difficulty, reward range, duration), cursor pagination, geo-search with radius, nearMe with dynamic radius mock, only approved missions returned, approximate coordinates (not exact)

### Checkpoint: Humans can browse and discover missions with filtering and geo-search.

---

## Phase 5: User Story 3 — Human Claims and Tracks a Mission (Priority: P1)

**Goal**: Humans claim missions atomically (race-condition-safe, max 3 active), track status in dashboard.

**Independent Test**: Human claims mission → claim appears in dashboard → status transitions work → concurrent claims handled correctly → max 3 enforced.

**Dependencies**: US1 (missions must exist), US2 (browse to find missions)

### Implementation for User Story 3

- [ ] T031 [US3] Implement POST /api/v1/missions/:id/claim in `apps/api/src/routes/missions/index.ts`: humanAuth middleware. Atomic transaction: SELECT mission FOR UPDATE SKIP LOCKED → check currentClaimCount < maxClaims → check human active claims < 3 (SELECT COUNT from missionClaims WHERE humanId AND status='active') → check no duplicate (mission_id, human_id with active status) → INSERT missionClaims with deadlineAt = now + 7 days → UPDATE missions SET currentClaimCount = currentClaimCount + 1. Return 201 with claim details. Errors: 404 mission not found, 409 fully claimed, 409 duplicate, 403 max 3 active
- [ ] T032 [US3] Implement PATCH /api/v1/missions/:id/claims/:claimId in `apps/api/src/routes/missions/index.ts`: humanAuth, verify claim owner. Update progressPercent and/or notes. If abandon=true: set claim status to "abandoned", decrement mission currentClaimCount in transaction
- [ ] T033 [US3] Implement GET /api/v1/missions/mine in `apps/api/src/routes/missions/index.ts`: humanAuth. List claims for authenticated human with joined mission data. Cursor-based pagination. Optional status filter. Return exact location (claimed missions get full precision), deadline, progress
- [ ] T034 [US3] Create MissionClaimButton component in `apps/web/src/components/missions/MissionClaimButton.tsx`: "Claim Mission" CTA. Loading state during claim API call. Error handling (show toast for 409 fully claimed, 403 max active). Success → redirect to dashboard or show confirmation. Disabled if no slots available
- [ ] T035 [US3] Update dashboard page `apps/web/app/dashboard/page.tsx`: replace MissionsCard empty state with real data from GET /api/v1/missions/mine. Show active claims with status badge, progress bar, deadline countdown, link to mission detail. "View All" link to /missions/mine page
- [ ] T036 [US3] Write integration tests in `apps/api/src/__tests__/missions/mission-claims.test.ts`: test successful claim, duplicate claim prevention (409), max 3 active missions enforcement (403), concurrent claim race condition (10 simultaneous claims on max_claims=1, verify exactly 1 succeeds), claim abandonment decrements count, claim with full slots (409). Use Promise.all for concurrent test

### Checkpoint: Claiming is atomic and race-condition-safe. Dashboard shows active missions.

---

## Phase 6: User Story 4 — Mission Detail and Location Reveal (Priority: P2)

**Goal**: Mission detail page shows full info. Approximate location before claim, exact after claim.

**Independent Test**: View mission detail unclaimed → see approximate location → claim → see exact location on map.

**Dependencies**: US1 (missions exist), US3 (claiming for location reveal)

### Implementation for User Story 4

- [ ] T037 [US4] Implement GET /api/v1/missions/:id in `apps/api/src/routes/missions/index.ts`: accept humanAuth or optionalAuth (agent). Return full mission details including instructions, evidenceRequired, solution info, agent info. If requesting human has an active claim for this mission: return exact lat/lng + myClaim object. Otherwise: return snapped lat/lng (1km grid). Join solution title, agent name for display
- [ ] T038 [US4] Create mission detail page in `apps/web/app/missions/[id]/page.tsx`: fetch mission from GET /api/v1/missions/:id. Display title, description, instructions (numbered step list), evidence requirements (checklist), skills tags, difficulty badge, reward + bonus, time remaining countdown, slots available. Location section: approximate map (if unclaimed) or exact map with marker (if claimed). MissionClaimButton. myClaim status card if claimed. Responsive layout
- [ ] T039 [US4] Write integration test in `apps/api/src/__tests__/missions/mission-detail.test.ts`: test mission detail returns approximate coordinates for non-claimer, exact coordinates for claimer, myClaim object included when claimed, 404 for non-existent mission, agent can view own non-approved mission

### Checkpoint: Humans can make informed decisions from detailed mission pages.

---

## Phase 7: User Story 5 — Agent-to-Agent Messaging (Priority: P2)

**Goal**: Agents send encrypted threaded messages with rate limiting.

**Independent Test**: Agent sends message → recipient sees in inbox → reply creates thread → rate limit enforced at 20/hour.

**Dependencies**: None (independent of mission marketplace — uses only agents table)

### Implementation for User Story 5

- [ ] T040 [US5] Implement POST /api/v1/messages in `apps/api/src/routes/messages/index.ts`: requireAgent middleware. Validate with sendMessageSchema. Check receiverId exists and != senderId. Check Redis rate limit (20/hour sliding window: `ratelimit:msg:{agentId}:{hour}`). Encrypt content via encryptMessage(). If threadId provided, verify it's a valid root message where agent is sender or receiver. Insert message. Return 201 with decrypted content in response
- [ ] T041 [US5] Implement GET /api/v1/messages/inbox in `apps/api/src/routes/messages/index.ts`: requireAgent. Cursor-based pagination ordered by createdAt DESC. Optional unreadOnly filter. Decrypt messages on read. Join sender name. Return unreadCount in response metadata
- [ ] T042 [US5] Implement GET /api/v1/messages/threads/:threadId in `apps/api/src/routes/messages/index.ts`: requireAgent, verify agent is participant (sender or receiver in thread). Return all messages in thread ordered by createdAt ASC. Decrypt all. Include participants list
- [ ] T043 [US5] Implement PATCH /api/v1/messages/:id/read in `apps/api/src/routes/messages/index.ts`: requireAgent, verify agent is receiver. Set isRead = true
- [ ] T044 [US5] Write integration tests in `apps/api/src/__tests__/messages/messaging.test.ts`: test send message, receive in inbox, threading (reply appears in thread), rate limit enforcement (21st message in hour rejected), self-messaging prevented, non-existent receiver 404, mark as read, encryption round-trip (content stored encrypted, returned decrypted), thread access control (non-participant can't read)

### Checkpoint: Agents can coordinate via encrypted threaded messaging.

---

## Phase 8: User Story 6 — Mission Expiration and Cleanup (Priority: P3)

**Goal**: Daily BullMQ job expires unclaimed missions and refunds creation costs via double-entry transactions.

**Independent Test**: Create expired mission → trigger job → mission status "expired" → agent token balance refunded.

**Dependencies**: US1 (missions exist), token system from Sprint 6

### Implementation for User Story 6

- [ ] T045 [US6] Implement mission expiration worker in `apps/api/src/workers/mission-expiration.ts`: BullMQ repeatable job with cron `0 2 * * *` (2 AM UTC). Query missions WHERE status='open' AND expiresAt < NOW(). Batch 100 at a time. For each: check no active claims with deadline > NOW() (7-day grace). Update status to "expired". If mission had a creation cost (tokenReward > 0), create refund token transaction via double-entry (SELECT FOR UPDATE on agent's humans row — note: agents don't have token balances in current schema, so log refund for future implementation or skip refund for MVP). Use idempotency key `expiration:{missionId}`
- [ ] T046 [US6] Register expiration worker in worker entry point: add the repeatable job registration to the existing BullMQ worker setup (alongside guardrail worker). Ensure graceful shutdown handles both queues
- [ ] T047 [US6] Write integration tests in `apps/api/src/__tests__/missions/mission-expiration.test.ts`: test expired unclaimed mission gets status "expired", claimed mission with active claim NOT expired (7-day grace), expired mission with only abandoned claims IS expired, batch processing of multiple expired missions, idempotency (running twice doesn't create duplicate refunds)

### Checkpoint: Marketplace stays clean. Stale missions auto-expire daily.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Integration testing, navigation, and final verification

- [ ] T048 Add mission marketplace link to main navigation in `apps/web/src/components/layout/Navigation.tsx` (or equivalent nav component): add "/missions" link visible to authenticated humans
- [ ] T049 Add mission-related WebSocket events to activity feed: emit `mission:created`, `mission:claimed` events when missions are created/claimed, extending existing WebSocket event feed pattern
- [ ] T050 [P] Write end-to-end integration test in `apps/api/src/__tests__/missions/mission-e2e.test.ts`: full lifecycle test — agent creates solution → solution approved → agent decomposes into missions → missions approved → human browses marketplace → human claims mission → mission appears in dashboard → agent sees claim count updated
- [ ] T051 [P] Verify all 768 existing tests still pass: run `pnpm test` across full monorepo and confirm zero regressions
- [ ] T052 Run TypeScript strict check (`pnpm typecheck`) and ESLint (`pnpm lint`) across monorepo — zero errors required per constitution

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (Phase 1) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational (Phase 2)
- **US2 (Phase 4)**: Depends on Foundational (Phase 2) + US1 (needs missions to browse)
- **US3 (Phase 5)**: Depends on US1 (needs missions to claim) + US2 (browse to find)
- **US4 (Phase 6)**: Depends on US1 (needs missions) + US3 (claiming for location reveal)
- **US5 (Phase 7)**: Depends on Foundational (Phase 2) only — INDEPENDENT of US1-4
- **US6 (Phase 8)**: Depends on US1 (needs missions with expiration)
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Independence

```
Phase 2 (Foundation) ──┬──→ Phase 3 (US1: Create) ──→ Phase 4 (US2: Browse) ──→ Phase 5 (US3: Claim) ──→ Phase 6 (US4: Detail)
                       │                              ↗                           ↗
                       └──→ Phase 7 (US5: Messaging)   Phase 8 (US6: Expiration) ←── Phase 3 (US1)
```

- **US5 (Messaging)** can be implemented in parallel with US1-US4 since it only depends on the agents table
- **US6 (Expiration)** can start as soon as US1 is complete
- **US2 → US3 → US4** form a sequential chain (each builds on the previous)

### Within Each User Story

- Zod schemas and types before routes
- Routes before frontend components
- Frontend components before pages
- Tests alongside implementation (within same phase)

### Parallel Opportunities

**Phase 2 parallelism** (all different files):
```
T011 (mission Zod schemas) ║ T012 (message Zod schemas) ║ T013 (mission types)
```

**US2 frontend parallelism** (all different component files):
```
T024 (Map.tsx) ║ T025 (MissionCard.tsx) ║ T026 (MissionStatusBadge.tsx)
```

**US5 can run entirely in parallel with US2-US4** (different tables, routes, and components)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 — Agent Creates Missions
4. **STOP and VALIDATE**: Agent can create missions, decompose solutions, missions pass guardrails
5. Deploy/demo backend MVP

### Incremental Delivery

1. Setup + Foundational → Database and shared infra ready
2. US1 (Create) → Agents populate marketplace → **Backend MVP**
3. US2 (Browse) → Humans discover missions → **Marketplace visible**
4. US3 (Claim) → Humans commit to work → **Core loop complete**
5. US4 (Detail) → Informed decision-making → **UX polished**
6. US5 (Messaging) → Agent coordination → **Collaboration enabled**
7. US6 (Expiration) → Marketplace hygiene → **Production-ready**
8. Polish → E2E tests, navigation, regression verification → **Sprint 7 complete**

### Parallel Team Strategy

With 2 developers:
1. Both complete Setup + Foundational together
2. Dev A: US1 → US2 → US3 → US4 (mission marketplace chain)
3. Dev B: US5 (messaging, independent) → US6 (expiration) → Polish
4. Stories integrate at Phase 9

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- All routes MUST use `new Hono<AppEnv>()` for proper TypeScript inference
- Follow existing patterns: `solutions.routes.ts` for guardrails, `tokens/index.ts` for double-entry, cursor pagination everywhere
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Total: 52 tasks across 9 phases
