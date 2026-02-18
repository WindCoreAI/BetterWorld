# Tasks: Security Hardening Sprint

**Input**: Design documents from `/specs/020-security-hardening/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/gdpr-endpoints.yaml, quickstart.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create Zod schemas and DB schema that multiple user stories depend on

- [ ] T001 [P] Create classifier response Zod schema with `.strict()` validation in `packages/shared/src/schemas/classifier-response.ts` — fields: aligned_domain (string), alignment_score (number 0-1), harm_risk (enum none/low/medium/high/critical), feasibility (enum none/low/medium/high), quality (string), decision (enum approve/reject/flag), reasoning (string), optional solution_scores (impact/feasibility/cost_efficiency 0-100)
- [ ] T002 [P] Create vision verification response Zod schema with `.strict()` in `packages/shared/src/schemas/vision-verification-response.ts` — fields: relevanceScore (0-1), gpsPlausibility (0-1), timestampPlausibility (0-1), authenticityScore (0-1), requirementChecklist (array of {requirement, met}), overallConfidence (0-1), reasoning (string)
- [ ] T003 [P] Create decomposition response Zod schema with `.strict()` in `packages/shared/src/schemas/decomposition-response.ts` — fields: missions array (1-10 items) with title, description, instructions, evidenceRequired, requiredSkills, estimatedDurationMinutes (15-10080), difficulty (enum), suggestedTokenReward (positive int)
- [ ] T004 [P] Create before/after comparison response Zod schema with `.strict()` in `packages/shared/src/schemas/before-after-response.ts` — fields: improvementScore (0-1), confidence (0-1), reasoning (string)
- [ ] T005 Export all new schemas from `packages/shared/src/schemas/index.ts` barrel file
- [ ] T006 [P] Add `deletionRequestStatusEnum` ('pending', 'cancelled', 'completed') to `packages/db/src/schema/enums.ts`
- [ ] T007 Create `account_deletion_requests` Drizzle table schema in `packages/db/src/schema/account-deletion-requests.ts` — columns: id (uuid PK), humanId (uuid FK→humans.id, unique), status (deletionRequestStatusEnum, default pending), requestedAt (timestamp, default now), coolingOffExpiresAt (timestamp), cancelledAt (nullable), completedAt (nullable), anonymizedIdentifier (varchar 12, nullable), deletionLog (jsonb, nullable), createdAt (timestamp). Add indexes: unique on humanId, partial on (status, coolingOffExpiresAt) WHERE status='pending'
- [ ] T008 Export account_deletion_requests from `packages/db/src/schema/index.ts`
- [ ] T009 Create migration `packages/db/drizzle/0020_security_hardening.sql` — CREATE ENUM deletion_request_status, CREATE TABLE account_deletion_requests with all columns, indexes, and FK constraint to humans.id

**Checkpoint**: Shared schemas and DB schema ready — user story implementation can begin

---

## Phase 2: User Story 1 — LLM Output Integrity (Priority: P1) 🎯 MVP

**Goal**: All Claude API responses validated against strict Zod schemas before storage — zero unvalidated LLM outputs reach the database

**Independent Test**: Submit content through the guardrail pipeline with a mocked Claude response containing invalid/missing fields — verify rejection and routing to human review

### Implementation for User Story 1

- [ ] T010 [US1] Wire classifier response Zod schema into `packages/guardrails/src/layer-b/classifier.ts` — replace manual `typeof` checks (lines 62-95) with `classifierResponseSchema.strict().safeParse()`. On parse failure: log the raw response + Zod error, return a rejection result that routes content to human review (Layer C). On success: use `.data` (stripped of extra fields). Keep the existing `Number.isFinite` + range checks as secondary belt-and-suspenders or remove if Zod covers them
- [ ] T011 [US1] Wire vision verification Zod schema into `apps/api/src/workers/evidence-verification.ts` — after extracting `toolUseBlock.input` (around line 308), add `visionVerificationResponseSchema.strict().safeParse()`. On failure: log anomaly, set evidence status to 'needs_review' instead of using unvalidated scores. On success: use parsed `.data`
- [ ] T012 [US1] Wire decomposition response Zod schema into `apps/api/src/routes/missions/decompose.ts` — after extracting `toolUseBlock.input` (around line 177), add `decompositionResponseSchema.strict().safeParse()`. On failure: log raw response + Zod error at warn level, return a user-friendly error (e.g., "Mission decomposition temporarily unavailable, please retry") — do NOT store unvalidated data. On success: use parsed `.data` instead of unsafe `as` cast
- [ ] T013 [US1] Wire before/after comparison Zod schema into `apps/api/src/services/before-after.service.ts` — after extracting tool_use input (around lines 102-106), add `beforeAfterResponseSchema.strict().safeParse()`. On failure: log raw response + Zod error at warn level, flag evidence for manual review (consistent with FR-004 — never store unvalidated scores). On success: use parsed `.data`
- [ ] T014 [US1] Update existing guardrail tests in `packages/guardrails/src/__tests__/` to verify that malformed classifier responses (missing alignment_score, out-of-range values, extra fields) are rejected by the new Zod validation and routed to human review

**Checkpoint**: All 4 Claude integration points validated — SC-001 met (100% validated before storage)

---

## Phase 3: User Story 2 — GDPR Data Export (Priority: P1)

**Goal**: Human users can export all personal data as a single JSON file within 30 seconds

**Independent Test**: Log in as a human user, call `GET /api/v1/me/data-export`, verify response contains all 11 data categories with correct data and excludes sensitive fields (passwordHash, apiKeyHash)

### Implementation for User Story 2

- [ ] T015 [US2] Create data export service in `apps/api/src/services/data-export.service.ts` — implement `exportUserData(humanId: string)` that queries 11 tables: humans (exclude passwordHash), humanProfiles, tokenTransactions, missionClaims, evidence (exclude exifData, include URLs), follows, connections, notifications, discussionThreads, discussionReplies, agents (exclude apiKeyHash). Return structured JSON with `exportedAt` timestamp and `categories` object matching the contract schema
- [ ] T016 [US2] Create GDPR routes in `apps/api/src/routes/gdpr.routes.ts` — implement `GET /me/data-export` behind `humanAuth()` middleware. Add Redis-based rate limiting (2 requests per 24h per humanId using `setex` with 86400 TTL). Return DataExportResponse on success, 429 on rate limit
- [ ] T017 [US2] Register GDPR routes in `apps/api/src/routes/v1.routes.ts` — import gdprRoutes and mount at `/me` (so endpoint is `/api/v1/me/data-export`)
- [ ] T018 [US2] Add integration tests for data export in `apps/api/src/__tests__/gdpr-export.test.ts` — test: authenticated export returns all categories, unauthenticated returns 401, rate limiting returns 429 after 2 requests, exported data excludes passwordHash and apiKeyHash

**Checkpoint**: GDPR Article 15 data export functional — SC-002 met (export within 30s for 10K records)

---

## Phase 4: User Story 3 — GDPR Account Deletion (Priority: P1)

**Goal**: Human users can initiate, cancel, and complete account deletion with 14-day cooling-off, full PII removal, and anonymized contributions

**Independent Test**: Create a user with activity across multiple tables, request deletion, verify cooling-off period, then process the deletion and verify all PII removed while anonymized contributions remain

### Implementation for User Story 3

- [ ] T019 [US3] Create account deletion service in `apps/api/src/services/account-deletion.service.ts` — implement: `requestDeletion(humanId)` — check for active mission claims (status='active') and unresolved disputes, reject with details if found; check for existing pending request (409 if exists); create account_deletion_requests row with coolingOffExpiresAt = now + 14 days. `cancelDeletion(humanId)` — find pending request, update status to 'cancelled', set cancelledAt. `getDeletionStatus(humanId)` — return current request or null. `processExpiredDeletion(requestId)` — the core anonymization logic (used by worker)
- [ ] T020 [US3] Implement the PII deletion logic in `apps/api/src/services/account-deletion.service.ts` method `processExpiredDeletion` — requires `DELETION_SALT` env var (add to `.env.example` and document in deployment config). Generate anonymized identifier: SHA-256(userId + DELETION_SALT) truncated to 12 hex chars. Generate per-user deterministic UUID: `uuidv5(DELETION_NAMESPACE, SHA-256(userId + DELETION_SALT))` for FK column anonymization (each deleted user gets a unique UUID so contributions from different deleted users remain distinguishable). Execute in order: (1) deactivate all owned agents (UPDATE agents SET isActive=false WHERE ownerHumanId=?), (2) anonymize RESTRICT FK tables using the per-user deterministic UUID: update evidence.submittedByHumanId, discussionThreads.authorHumanId, discussionReplies.authorHumanId, missionClaims.humanId, tokenTransactions.humanId (note: problems/solutions are authored by agents not humans directly — handled by agent deactivation in step 1), (3) delete CASCADE tables: follows, connections, notifications (these cascade automatically when humans row is updated), (4) anonymize humans record: set email to `deleted_{hash}@removed.betterworld.org`, displayName to `Former User {hash}` (12 hex chars), null out avatarUrl/oauthProvider/oauthProviderId, (5) delete humanProfiles, accounts, sessions, verificationTokens, (6) update request status to 'completed', set completedAt and anonymizedIdentifier and deletionLog. Wrap in a database transaction
- [ ] T021 [US3] Add deletion request endpoints to `apps/api/src/routes/gdpr.routes.ts` — implement: `POST /me/deletion-request` (initiate), `GET /me/deletion-request` (status), `DELETE /me/deletion-request` (cancel). All behind `humanAuth()`. Follow contract schema for responses (201 created, 409 already pending, 422 active obligations, 200 status/cancelled, 404 no pending)
- [ ] T022 [US3] Create account deletion worker in `apps/api/src/workers/account-deletion-worker.ts` — follow existing worker pattern (pure async function + BullMQ wrapper): daily cron at 3AM UTC, query account_deletion_requests WHERE status='pending' AND coolingOffExpiresAt <= now(), process each with `processExpiredDeletion()`, per-item error isolation, idempotency guard (skip if already completed), metrics tracking, graceful shutdown
- [ ] T023 [US3] Register account deletion worker in `apps/api/src/workers/all-workers.ts` — import `createAccountDeletionWorker` and add to workers array
- [ ] T024 [US3] Add integration tests for account deletion in `apps/api/src/__tests__/gdpr-deletion.test.ts` — test: initiate deletion creates pending request with 14-day expiry, cancel during cooling-off works, duplicate request returns 409, user with active claims gets 422, deletion worker processes expired requests correctly (PII removed, contributions anonymized to "Former User {hash}", agents deactivated, token transactions preserved with anonymized userId)

**Checkpoint**: GDPR Article 17 account deletion functional — SC-003 met (initiate, cancel, complete with anonymization)

---

## Phase 5: User Story 4 — CI/CD Supply Chain Protection (Priority: P2)

**Goal**: All GitHub Actions SHA-pinned, container images scanned, pnpm version verified, Dockerfiles hardened

**Independent Test**: Run the CI pipeline and verify SHA-pinned actions, Trivy scan step, pnpm version check, and non-root Docker containers

### Implementation for User Story 4

- [ ] T025 [P] [US4] SHA-pin all GitHub Actions in `.github/workflows/ci.yml` — replace every `actions/checkout@v4` with `actions/checkout@<latest-v4-SHA>`, every `pnpm/action-setup@v4` with SHA, every `actions/setup-node@v4` with SHA, every `actions/upload-artifact@v4` with SHA. Add comment with version tag next to each SHA for readability (e.g., `# v4.2.2`)
- [ ] T026 [P] [US4] SHA-pin all GitHub Actions in `.github/workflows/deploy.yml` — replace `actions/checkout@v4` and `superfly/flyctl-actions/setup-flyctl@master` with their respective SHAs. Add comment with version/branch next to each
- [ ] T027 [P] [US4] Add Trivy container image scan step to `.github/workflows/ci.yml` — add a new job `scan` that runs after the build job, uses `aquasecurity/trivy-action@<SHA>` to scan the built image, fail on HIGH/CRITICAL severity, allow unfixable vulnerabilities to warn (not fail). Pin Trivy action by SHA too
- [ ] T028 [P] [US4] Add pnpm version verification step to `.github/workflows/ci.yml` — add step in the lint job that checks `pnpm --version` output matches the expected version (>=9.15.4) and is patched for CVE-2025-69263 and CVE-2025-69264. Also verify `debug` is at v3.2.7/v4.4.3 and `chalk` at v4.1.2 (known-clean versions post Shai-Hulud)
- [ ] T029 [P] [US4] Harden `infra/Dockerfile` — add `RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 betterworld` after the runtime FROM stage, add `USER betterworld` before CMD, add `HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://localhost:4000/api/v1/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"]`
- [ ] T030 [P] [US4] Harden `infra/Dockerfile.worker` — add same non-root user (nodejs group + betterworld user), add `USER betterworld` before CMD. No HEALTHCHECK needed for worker (no HTTP server), but add a comment explaining why

**Checkpoint**: CI/CD hardened — SC-004 (100% SHA-pinned), SC-005 (Trivy scan), SC-009 (pnpm + Shai-Hulud verified)

---

## Phase 6: User Story 5 — WebSocket Connection Security (Priority: P2)

**Goal**: WebSocket connections validated against CSWSH — unauthorized Origins rejected at handshake, messages size-limited

**Independent Test**: Attempt WebSocket connection from unauthorized Origin — verify rejection before data exchange

### Implementation for User Story 5

- [ ] T031 [US5] Export the existing ALLOWED_ORIGINS constant from `apps/api/src/middleware/cors.ts` — add `export` keyword to the existing `const ALLOWED_ORIGINS` (already validated at startup) so it can be imported by the WebSocket server. Keep existing CORS middleware behavior unchanged
- [ ] T032 [US5] Add Origin header validation to both WebSocket endpoints in `apps/api/src/ws/server.ts` — before `upgradeWebSocket()` in `/ws/feed` (line 19) and `/ws/human` (line 95): extract `c.req.header("origin")`, reject with 403 if missing or not in ALLOWED_ORIGINS. Import ALLOWED_ORIGINS from cors.ts. For the rejection, return a plain HTTP 403 response before the upgrade happens (not a WS close). Log rejected origins at warn level
- [ ] T033 [US5] Add 64KB message size limit to WebSocket message handlers in `apps/api/src/ws/server.ts` — in both `onMessage` handlers (line 81 and line 135), check `Buffer.byteLength(data) > 65536` (64KB in bytes, not string length). If exceeded: log warning, send error frame `{"error":"Message too large"}`, do NOT close the connection (per spec acceptance scenario 4)
- [ ] T034 [US5] Add integration tests for WebSocket Origin validation in `apps/api/src/__tests__/ws-security.test.ts` — test: connection from allowed origin succeeds, connection from unauthorized origin rejected with 403, connection with no Origin header rejected, oversized message rejected but connection stays open

**Checkpoint**: WebSocket hardened — SC-006 met (100% unauthorized Origin rejection)

---

## Phase 7: User Story 6 — Redis Data Hygiene (Priority: P2)

**Goal**: All sensitive Redis keys have explicit TTLs — no indefinite retention of tokens, sessions, or PII

**Independent Test**: Audit all Redis SET/HSET operations, verify every key storing sensitive data has an explicit TTL

### Implementation for User Story 6

- [ ] T035 [US6] Add TTL to feature flags in `apps/api/src/services/feature-flags.ts` — change `redis.set(redisKey, JSON.stringify(value))` (line 84) to `redis.set(redisKey, JSON.stringify(value), "EX", 86400)` (24h TTL). The 60s in-memory cache already handles freshness; Redis TTL prevents orphaned keys on flag removal
- [ ] T036 [US6] Add TTL to Open311 sync timestamps in `apps/api/src/services/open311.service.ts` — change `redis.set(\`open311:last-sync:\${cityId}\`, timestamp)` (line 171) to `redis.set(\`open311:last-sync:\${cityId}\`, timestamp, "EX", 604800)` (7-day TTL). Sync timestamps are non-sensitive but should not persist indefinitely
- [ ] T037 [US6] Audit all remaining `redis.set()` calls without TTL across `apps/api/` and `packages/` — grep for `redis.set(` calls that don't use `setex`, `"EX"`, or `expire()`. Known targets include `decision-gate:*` keys in `apps/api/src/routes/admin/phase3.ts` (admin-controlled state, add 24h TTL). For any others found storing sensitive data (auth tokens, session data, PII), add appropriate TTL. Classification: sensitive = auth tokens, sessions, PII caches (max 24h); non-sensitive = feature flags, public metrics, sync timestamps (max 7d). Add summary comment at top of each modified file listing all audited Redis operations and their TTL status

**Checkpoint**: Redis hygiene enforced — SC-007 met (100% sensitive keys have TTL)

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Validation, cost verification, and ensure no regressions

- [ ] T038 Run full existing test suite (`pnpm test`) to verify zero regressions from all security changes — fix any failures introduced by Zod validation changes, route additions, or WebSocket modifications
- [ ] T039 Verify cost constraints: zero new npm dependencies added (Zod already exists), zero new Claude API calls, zero new paid services. Check `package.json` files for any unintended additions
- [ ] T040 Run `pnpm turbo build` to verify TypeScript compilation succeeds across all packages with strict mode — fix any type errors from new schemas, services, or route changes
- [ ] T041 Run quickstart.md cost verification checklist — confirm all items pass before considering sprint complete

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **US1 LLM Validation (Phase 2)**: Depends on T001-T005 (shared schemas)
- **US2 Data Export (Phase 3)**: Depends on T009 (migration for any shared changes) — otherwise independent
- **US3 Account Deletion (Phase 4)**: Depends on T006-T009 (DB schema + migration)
- **US4 CI/CD (Phase 5)**: No code dependencies — can run in parallel with any phase
- **US5 WebSocket (Phase 6)**: No dependencies on other user stories
- **US6 Redis (Phase 7)**: No dependencies on other user stories
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (LLM Validation)**: Requires Phase 1 schemas (T001-T005) — no dependency on other stories
- **US2 (Data Export)**: Independent — no new DB tables needed
- **US3 (Account Deletion)**: Requires Phase 1 DB schema (T006-T009) — no dependency on other stories
- **US4 (CI/CD)**: Fully independent — config file changes only
- **US5 (WebSocket)**: Fully independent — server.ts + cors.ts changes only
- **US6 (Redis)**: Fully independent — service file TTL additions only

### Within Each User Story

- Schemas/models before services
- Services before routes
- Routes before worker registration
- Core implementation before integration tests

### Parallel Opportunities

**Maximum parallelism after Phase 1 completes:**
- US1 (LLM validation) can run in parallel with US2 (data export)
- US4 (CI/CD), US5 (WebSocket), and US6 (Redis) can ALL run in parallel with each other AND with US1-US3
- Within Phase 1: T001-T004 are all parallel (different files), T006-T007 are parallel with T001-T004
- Within US4: T025-T030 are ALL parallel (different files)

---

## Parallel Example: Phase 1 Setup

```bash
# Launch all Zod schema tasks in parallel:
Task: "T001 — classifier-response.ts"
Task: "T002 — vision-verification-response.ts"
Task: "T003 — decomposition-response.ts"
Task: "T004 — before-after-response.ts"
Task: "T006 — enums.ts (new enum)"
Task: "T007 — account-deletion-requests.ts (new table)"

# Then sequentially:
Task: "T005 — update index.ts exports"
Task: "T008 — update db schema index.ts"
Task: "T009 — create migration SQL"
```

## Parallel Example: After Phase 1

```bash
# US4 CI/CD tasks (all parallel, independent files):
Task: "T025 — ci.yml SHA pins"
Task: "T026 — deploy.yml SHA pins"
Task: "T027 — Trivy scan step"
Task: "T028 — pnpm version check"
Task: "T029 — Dockerfile hardening"
Task: "T030 — Dockerfile.worker hardening"

# Simultaneously, US5 + US6 (parallel, different files):
Task: "T031 — Extract ALLOWED_ORIGINS"
Task: "T035 — feature-flags.ts TTL"
Task: "T036 — open311.service.ts TTL"
```

---

## Implementation Strategy

### MVP First (US1 — LLM Output Validation)

1. Complete Phase 1: Setup (T001-T009)
2. Complete Phase 2: US1 LLM Validation (T010-T014)
3. **STOP and VALIDATE**: Run guardrail tests, verify malformed responses rejected
4. This alone addresses OWASP LLM05:2025 — highest-impact security improvement

### Incremental Delivery

1. Phase 1 Setup → Schemas + DB ready
2. US1 (LLM) → Core safety improvement (**MVP**)
3. US2 + US3 (GDPR) → Legal compliance
4. US4 + US5 + US6 (CI/CD + WS + Redis) → Defense-in-depth hardening
5. Phase 8 Polish → Regression check + cost verification

### Parallel Strategy

With subagent-driven development:
1. Complete Phase 1 (9 tasks, 6 parallelizable)
2. Launch US1 + US4 + US5 + US6 in parallel (different files, no conflicts)
3. After US1 completes, launch US2 + US3
4. Phase 8 Polish after all stories done

---

## Summary

| Phase | Story | Tasks | Parallelizable |
|-------|-------|-------|----------------|
| 1 Setup | — | 9 | 6 |
| 2 US1 LLM Validation | P1 | 5 | 0 (sequential chain) |
| 3 US2 Data Export | P1 | 4 | 0 (sequential chain) |
| 4 US3 Account Deletion | P1 | 6 | 0 (sequential chain) |
| 5 US4 CI/CD Hardening | P2 | 6 | 6 |
| 6 US5 WebSocket Security | P2 | 4 | 0 (sequential chain) |
| 7 US6 Redis Hygiene | P2 | 3 | 2 |
| 8 Polish | — | 4 | 0 |
| **Total** | | **41** | **14** |

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- FR-024/025/026 cost constraints verified in Phase 8 (T039)
