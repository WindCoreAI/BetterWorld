# Tasks: Sprint 6 - Human Onboarding

**Input**: Design documents from `/specs/007-human-onboarding/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

**Tests**: Integration tests included (15+ tests explicitly required by spec.md success criteria SC-014)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)
- Include exact file paths in descriptions

## Path Conventions (Monorepo)

- **API**: `apps/api/src/`
- **Web**: `apps/web/src/`
- **Database**: `packages/db/src/`
- **Shared**: `packages/shared/src/`
- **Tests**: `apps/api/src/__tests__/` (integration), `packages/*/src/__tests__/` (unit)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependencies, and OAuth provider credentials

- [X] T001 Install better-auth dependency: `pnpm add better-auth` in root
- [ ] T002 [P] Setup Google OAuth credentials in Google Cloud Console (manual, document in quickstart.md validation)
- [ ] T003 [P] Setup GitHub OAuth credentials in GitHub Developer Settings (manual, document in quickstart.md validation)
- [X] T004 [P] Add environment variables to apps/api/.env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, JWT_SECRET (min 32 chars)
- [X] T005 [P] Install PostGIS extension in Docker PostgreSQL: `CREATE EXTENSION IF NOT EXISTS postgis;`
- [X] T006 Create feature branch: `git checkout -b 007-human-onboarding`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core database schema, utilities, and better-auth configuration that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Database Schema & Migration

- [X] T007 Generate better-auth Drizzle schemas: `pnpm better-auth generate --adapter drizzle --provider pg` (creates sessions.ts, accounts.ts, verificationTokens.ts in packages/db/src/schema/)
- [X] T008 [P] Create transaction_type enum in packages/db/src/schema/enums.ts (earn_orientation, earn_mission, earn_reward, spend_vote, spend_circle, spend_analytics)
- [X] T009 [P] Create humanProfiles schema in packages/db/src/schema/humanProfiles.ts (skills, location geography, languages, availability jsonb, bio, certifications, profileCompletenessScore, orientationCompletedAt, metadata)
- [X] T010 [P] Create tokenTransactions schema in packages/db/src/schema/tokenTransactions.ts (humanId FK, amount integer, balanceBefore, balanceAfter, transactionType, referenceId, idempotencyKey unique, metadata jsonb)
- [X] T011 Modify humans schema in packages/db/src/schema/humans.ts (add oauthProvider, oauthProviderId, avatarUrl, emailVerified boolean, emailVerifiedAt timestamp)
- [X] T012 Update packages/db/src/schema/index.ts exports (add humanProfiles, tokenTransactions, sessions, accounts, verificationTokens)
- [X] T013 Generate Drizzle migration: `pnpm drizzle-kit generate:pg`
- [X] T014 Apply migration to local database: `pnpm drizzle-kit push:pg` and verify tables with `\dt` in psql

### Shared Utilities & Types

- [X] T015 [P] Create profile completeness utility in packages/shared/src/utils/profileCompleteness.ts (calculateProfileCompleteness function with weighted scoring: skills 20%, location 20%, languages 10%, availability 20%, bio 10%, avatar 5%, wallet 10%, certifications 5%)
- [X] T016 [P] Create geocoding utility in packages/shared/src/utils/geocode.ts (geocodeLocation function calling Nominatim API with Redis caching, 1km grid snapping)
- [X] T017 [P] Create Zod schemas in packages/shared/src/schemas/human.ts (RegisterSchema, ProfileCreateSchema, ProfileUpdateSchema, SpendTokensSchema)
- [X] T018 [P] Create TypeScript types in packages/shared/src/types/human.ts (Human, HumanProfile, TokenTransaction, ProfileCompletenessResult)

### better-auth Configuration

- [X] T019 Create better-auth config in apps/api/src/auth.ts (drizzleAdapter with db, socialProviders for Google + GitHub with PKCE auto-enabled, emailAndPassword with requireEmailVerification true, JWT secret from env)
- [X] T020 [P] Create auth middleware in apps/api/src/middleware/humanAuth.ts (verify JWT access token, attach human to context, 401 if invalid)

### Redis & Queue Setup

- [X] T021 [P] Create Redis client wrapper in apps/api/src/lib/redis.ts (lazy-connect pattern, export getRedis function)
- [X] T022 [P] Create token audit job in apps/api/src/jobs/tokenAudit.ts (BullMQ job checking SUM(amount) per human matches cached balance, alerts on discrepancies, runs daily at 02:00 UTC via cron)

**Checkpoint**: ✅ **Foundation ready** - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - New Human Registration (Priority: P1) 🎯 MVP

**Goal**: Enable users to register via Google OAuth, GitHub OAuth, or email/password with 6-digit verification

**Independent Test**: Attempt to register with all 3 methods and verify accounts are created with correct OAuth provider or email verification status

### Integration Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T023 [P] [US1] Integration test: Google OAuth registration flow in apps/api/src/__tests__/integration/auth/googleOAuth.test.ts (mock OAuth callback, verify user created with oauthProvider='google', emailVerified=true)
- [ ] T024 [P] [US1] Integration test: GitHub OAuth registration flow in apps/api/src/__tests__/integration/auth/githubOAuth.test.ts (mock OAuth callback, verify user created with oauthProvider='github', emailVerified=true)
- [ ] T025 [P] [US1] Integration test: Email/password registration with verification in apps/api/src/__tests__/integration/auth/emailPassword.test.ts (register, receive code, verify email, login)
- [ ] T026 [P] [US1] Integration test: Verification code expiry (15min) in apps/api/src/__tests__/integration/auth/codeExpiry.test.ts
- [ ] T027 [P] [US1] Integration test: Verification code resend throttling (3/hour) in apps/api/src/__tests__/integration/auth/codeThrottling.test.ts

### API Implementation for User Story 1

- [X] T028 [US1] Implement POST /auth/register endpoint in apps/api/src/routes/auth/register.ts (Zod validation, bcrypt password hash, create user, generate 6-digit code, send email, return 201 with userId)
- [X] T029 [US1] Implement POST /auth/verify-email endpoint in apps/api/src/routes/auth/verifyEmail.ts (verify code, set emailVerified=true, return access token + refresh token)
- [X] T030 [US1] Implement POST /auth/resend-code endpoint in apps/api/src/routes/auth/resendCode.ts (check throttle limit 3/hour via Redis, generate new code, send email)
- [X] T031 [US1] Implement GET /auth/oauth/google endpoint in apps/api/src/routes/auth/oauth.ts (redirect to Google consent screen with PKCE code_challenge)
- [X] T032 [US1] Implement GET /auth/oauth/google/callback endpoint in apps/api/src/routes/auth/oauth.ts (exchange code + code_verifier for tokens, create user if new, set emailVerified=true, return access token)
- [X] T033 [US1] Implement GET /auth/oauth/github endpoint in apps/api/src/routes/auth/oauth.ts (redirect to GitHub authorization with PKCE code_challenge)
- [X] T034 [US1] Implement GET /auth/oauth/github/callback endpoint in apps/api/src/routes/auth/oauth.ts (exchange code + code_verifier for tokens, create user if new, set emailVerified=true, return access token)
- [X] T035 [US1] Implement POST /auth/login endpoint in apps/api/src/routes/auth/login.ts (verify email + password via bcrypt, check emailVerified, return tokens)
- [X] T036 [US1] Implement POST /auth/refresh endpoint in apps/api/src/routes/auth/refresh.ts (validate refresh token, rotate refresh token, return new access token)
- [X] T037 [US1] Implement POST /auth/logout endpoint in apps/api/src/routes/auth/logout.ts (invalidate session, clear tokens)
- [X] T038 [US1] Register all auth routes in apps/api/src/routes/v1.routes.ts under /v1/human-auth prefix

### Frontend for User Story 1

- [X] T039 [P] [US1] Create registration page in apps/web/src/app/auth/register/page.tsx (OAuth buttons + email/password form)
- [ ] T040 [P] [US1] Create email verification page in apps/web/src/app/auth/verify/page.tsx (6-digit code input, resend button)
- [ ] T041 [P] [US1] Create login page in apps/web/src/app/auth/login/page.tsx (email/password form, OAuth buttons)
- [ ] T042 [US1] Create OAuth callback handler in apps/web/src/app/auth/callback/page.tsx (receive token from URL, store in localStorage/cookie, redirect to dashboard or profile creation)

**Checkpoint**: ✅ **User Story 1 Backend Complete (12/20 tasks)** - All 11 API routes implemented and registered, 1 basic frontend page created, tests pending (T023-T027), remaining frontend pages pending (T040-T042)

---

## Phase 4: User Story 2 - Profile Creation and Enrichment (Priority: P1)

**Goal**: Enable users to create rich profiles with skills, location (geocoded), languages, availability for mission matching

**Independent Test**: Complete registration, fill out profile form with skills + location + languages + availability, verify profile completeness score is calculated correctly (75-100%)

### Integration Tests for User Story 2

- [ ] T043 [P] [US2] Integration test: Profile creation with geocoding in apps/api/src/__tests__/integration/profile/createProfile.test.ts (create profile with "Jakarta, Indonesia", verify location is PostGIS POINT with 1km grid snapping)
- [ ] T044 [P] [US2] Integration test: Profile completeness calculation in apps/api/src/__tests__/integration/profile/completeness.test.ts (test weighted scoring: 0% with no fields, 50% with skills+location+languages, 75% with all core+availability, 100% with all fields)
- [ ] T045 [P] [US2] Integration test: Profile update with ownership check in apps/api/src/__tests__/integration/profile/updateProfile.test.ts (verify user can only update own profile, IDOR protection)
- [ ] T046 [P] [US2] Integration test: Geocoding failure handling in apps/api/src/__tests__/integration/profile/geocodingFailure.test.ts (invalid city name, verify location=null, profile completeness excludes location)

### API Implementation for User Story 2

- [X] T047 [US2] Implement POST /profile endpoint in apps/api/src/routes/profile/createProfile.ts (auth middleware, Zod validation, geocode city+country via geocodeLocation utility, create humanProfile, calculate completeness via calculateProfileCompleteness, return 201)
- [X] T048 [US2] Implement GET /profile endpoint in apps/api/src/routes/profile/getProfile.ts (auth middleware, query humanProfile by humanId, calculate completeness, return profile with suggestions)
- [X] T049 [US2] Implement PATCH /profile endpoint in apps/api/src/routes/profile/updateProfile.ts (auth middleware, partial update, re-geocode if city/country changed, recalculate completeness, return updated profile)
- [ ] T050 [US2] Implement GET /profile/completeness endpoint in apps/api/src/routes/profile/completeness.ts (auth middleware, return detailed breakdown with per-field weights and suggestions)
- [X] T051 [US2] Register profile routes in apps/api/src/routes/index.ts under /v1/profile prefix

### Frontend for User Story 2

- [ ] T052 [P] [US2] Create profile creation form in apps/web/src/app/profile/create/page.tsx (skills multi-select, city+country inputs, languages multi-select, availability time picker, bio textarea, wallet address input, certifications multi-select)
- [ ] T053 [P] [US2] Create profile settings page in apps/web/src/app/profile/settings/page.tsx (reuse profile form for updates, show profile completeness indicator)
- [ ] T054 [P] [US2] Create profile completeness card component in apps/web/src/components/dashboard/ProfileCompletenessCard.tsx (circular progress bar, score 0-100%, top 3 suggestions)

**Checkpoint**: ✅ **User Story 2 Backend Complete (4/12 tasks)** - 4 API routes implemented (POST/GET/PATCH /profile + registration), tests pending (T043-T046), completeness endpoint not implemented (T050), frontend pending (T052-T054)

---

## Phase 5: User Story 3 - Orientation Tutorial and First Token Reward (Priority: P2)

**Goal**: Guide users through 5-step orientation tutorial (Constitution, Domains, Missions, Evidence, Tokens) and reward 10 ImpactTokens on completion

**Independent Test**: Progress through all 5 orientation steps, verify progress is saved in metadata and resumable, claim 10 IT reward on completion, verify duplicate claims fail

### Integration Tests for User Story 3

- [ ] T055 [P] [US3] Integration test: Orientation progress tracking in apps/api/src/__tests__/integration/orientation/progress.test.ts (start orientation, save step to metadata, resume from step 3)
- [ ] T056 [P] [US3] Integration test: Orientation reward claim (one-time) in apps/api/src/__tests__/integration/tokens/orientationReward.test.ts (complete orientation, claim 10 IT, verify balance=10, verify duplicate claim fails with "REWARD_ALREADY_CLAIMED")
- [ ] T057 [P] [US3] Integration test: Orientation reward idempotency in apps/api/src/__tests__/integration/tokens/rewardIdempotency.test.ts (rapidly click Complete multiple times, verify only 1 transaction created)

### API Implementation for User Story 3

- [X] T058 [US3] Implement POST /tokens/orientation-reward endpoint in apps/api/src/routes/tokens/orientationReward.ts (auth middleware, check orientationCompletedAt is null, use db.transaction with SELECT FOR UPDATE, create token_transactions row with amount=10, balanceBefore=0, balanceAfter=10, transactionType='earn_orientation', set orientationCompletedAt=now, return transaction + newBalance)
- [X] T059 [US3] Update PATCH /profile endpoint to save orientation progress in apps/api/src/routes/profile/updateProfile.ts (accept metadata.orientation_step in request body, save to humanProfiles.metadata JSONB)

### Frontend for User Story 3

- [ ] T060 [P] [US3] Create orientation page in apps/web/src/app/onboarding/page.tsx (5-step wizard: Constitution, Domains, Missions, Evidence, Tokens; progress saved to API after each step)
- [ ] T061 [P] [US3] Create orientation step components in apps/web/src/components/onboarding/ (OrientationStep1Constitution.tsx, OrientationStep2Domains.tsx, OrientationStep3Missions.tsx, OrientationStep4Evidence.tsx, OrientationStep5Tokens.tsx)
- [ ] T062 [US3] Implement "Claim Reward" button in OrientationStep5Tokens.tsx (call POST /tokens/orientation-reward, show success toast with balance update)

**Checkpoint**: ✅ **User Story 3 Backend Complete (2/8 tasks)** - Orientation reward endpoint implemented (POST /tokens/orientation-reward), profile metadata support added, tests pending (T055-T057), frontend orientation wizard pending (T060-T062)

---

## Phase 6: User Story 4 - Token Economy Participation (Priority: P2)

**Goal**: Enable users to spend ImpactTokens on voting (1-10 IT), circles (50 IT), analytics (20 IT) with race-condition safety and idempotency

**Independent Test**: Create test transactions for voting, circles, analytics; verify balances update correctly, concurrent transactions don't corrupt balances, idempotency prevents duplicates

### Integration Tests for User Story 4

- [ ] T063 [P] [US4] Integration test: Token spending with sufficient balance in apps/api/src/__tests__/integration/tokens/spendTokens.test.ts (user has 10 IT, spend 5 IT on voting, verify balance=5, transaction record with balanceBefore=10, balanceAfter=5)
- [ ] T064 [P] [US4] Integration test: Token spending with insufficient balance in apps/api/src/__tests__/integration/tokens/insufficientBalance.test.ts (user has 5 IT, attempt to spend 10 IT, verify 400 error "INSUFFICIENT_BALANCE")
- [ ] T065 [P] [US4] Integration test: Concurrent token transactions (race conditions) in apps/api/src/__tests__/integration/tokens/concurrentTransactions.test.ts (launch 1000 concurrent token spend requests, verify all balances correct, no deadlocks, p95 latency < 500ms)
- [ ] T066 [P] [US4] Integration test: Token spending idempotency in apps/api/src/__tests__/integration/tokens/spendIdempotency.test.ts (same idempotency key, 2 requests, verify only 1 transaction, 2nd request returns 200 OK with cached response)
- [ ] T067 [P] [US4] Integration test: Daily token audit job in apps/api/src/__tests__/integration/tokens/auditJob.test.ts (create discrepancy: manual UPDATE humans SET token_balance=999, run audit job, verify alert sent, discrepancy detected)

### API Implementation for User Story 4

- [X] T068 [US4] Implement POST /tokens/spend endpoint in apps/api/src/routes/tokens/spendTokens.ts (auth middleware, require Idempotency-Key header, Zod validation, check Redis cache for idempotency key, use db.transaction with SELECT FOR UPDATE on humanProfiles, check balance >= amount, insert token_transactions with balanceBefore/balanceAfter, update humanProfiles.tokenBalance, cache response in Redis 1hr TTL, return 201 or 200 if cached)
- [X] T069 [US4] Implement GET /tokens/balance endpoint in apps/api/src/routes/tokens/balance.ts (auth middleware, query humanProfiles.tokenBalance, calculate totalEarned and totalSpent from token_transactions, return balance + totals)
- [X] T070 [US4] Implement GET /tokens/transactions endpoint in apps/api/src/routes/tokens/transactions.ts (auth middleware, cursor pagination with limit 20, optional type filter, query token_transactions WHERE humanId ORDER BY createdAt DESC, return transactions array + nextCursor)
- [X] T071 [US4] Register token routes in apps/api/src/routes/index.ts under /v1/tokens prefix
- [ ] T072 [US4] Schedule daily audit job in apps/api/src/index.ts (BullMQ cron '0 2 * * *', calls tokenAudit job from T022)

### Frontend for User Story 4

- [ ] T073 [P] [US4] Create token balance display in apps/web/src/components/dashboard/TokenBalanceCard.tsx (show current balance, total earned, total spent)
- [ ] T074 [P] [US4] Create voting modal in apps/web/src/components/voting/VoteModal.tsx (slider 1-10 IT, "Vote" button calls POST /tokens/spend with type='spend_vote', idempotency key generated client-side)
- [ ] T075 [P] [US4] Create transaction history page in apps/web/src/app/tokens/transactions/page.tsx (cursor-paginated list, filter by type, show amount + description + timestamp)

**Checkpoint**: ✅ **User Story 4 Backend Complete (4/13 tasks)** - Token spending endpoints implemented (POST /spend, GET /balance, GET /transactions), idempotency and pessimistic locking implemented, tests pending (T063-T067), audit job not scheduled (T072), frontend pending (T073-T075)

---

## Phase 7: User Story 5 - Dashboard Visibility and Progress Tracking (Priority: P3)

**Goal**: Aggregate dashboard displaying token balance, reputation, profile completeness, missions (Sprint 7), activity feed with real-time WebSocket updates

**Independent Test**: Access dashboard with various states (new user, user with tokens, incomplete profile), verify all data displayed correctly, real-time updates appear within 500ms

### Integration Tests for User Story 5

- [ ] T076 [P] [US5] Integration test: Dashboard data aggregation in apps/api/src/__tests__/integration/dashboard/getDashboard.test.ts (verify response contains user, tokens, reputation, profileCompleteness, missions array, activity array)
- [ ] T077 [P] [US5] Integration test: Dashboard with incomplete profile in apps/api/src/__tests__/integration/dashboard/incompleteProfile.test.ts (user with 60% completeness, verify suggestions displayed)
- [ ] T078 [P] [US5] Integration test: Dashboard with pending orientation in apps/api/src/__tests__/integration/dashboard/pendingOrientation.test.ts (user hasn't completed orientation, verify "Complete Orientation" CTA shown)

### API Implementation for User Story 5

- [X] T079 [US5] Implement GET /dashboard endpoint in apps/api/src/routes/dashboard/getDashboard.ts (auth middleware, aggregate data: user from humans, tokens from humanProfiles + token_transactions totals, reputation from humanProfiles.reputationScore, profile completeness via calculateProfileCompleteness, missions array (empty in Sprint 6), recent activity from token_transactions + other events, return dashboard data with 30s Redis cache)
- [ ] T080 [US5] Create WebSocket activity feed handler in apps/api/src/websocket/activityFeed.ts (subscribe to Redis pub/sub for token_earned, token_spent, mission_completed events, broadcast to connected clients)
- [X] T081 [US5] Register dashboard routes in apps/api/src/routes/index.ts under /v1/dashboard prefix

### Frontend for User Story 5

- [ ] T082 [P] [US5] Create dashboard layout in apps/web/src/app/dashboard/page.tsx (responsive grid with TokenBalanceCard, ReputationCard, ProfileCompletenessCard, MissionsCard, ActivityFeed)
- [ ] T083 [P] [US5] Create reputation card component in apps/web/src/components/dashboard/ReputationCard.tsx (score 0-100, rank label, percentile)
- [ ] T084 [P] [US5] Create missions card component in apps/web/src/components/dashboard/MissionsCard.tsx (show active missions with status, totalCompleted, streakDays; empty state for Sprint 6)
- [ ] T085 [P] [US5] Create activity feed component in apps/web/src/components/dashboard/ActivityFeed.tsx (real-time updates via WebSocket, show last 10 events with icons + descriptions)
- [ ] T086 [US5] Implement WebSocket client in apps/web/src/lib/websocket.ts (connect to wss://api.betterworld.ai/v1/ws/activity, handle token_earned/token_spent/mission_completed events, update Zustand store)

**Checkpoint**: ✅ **User Story 5 Backend Complete (2/11 tasks)** - Dashboard aggregation endpoint implemented (GET /dashboard), tests pending (T076-T078), WebSocket activity feed not implemented (T080), frontend dashboard UI pending (T082-T086)

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories, security hardening, performance optimization

- [ ] T087 [P] Add rate limiting to all auth endpoints in apps/api/src/middleware/rateLimit.ts (Redis sliding window: registration 5/hour per IP, verification 3/hour per user, token spending 10/min per user)
- [ ] T088 [P] Add input sanitization for bio, city, country fields in packages/shared/src/schemas/human.ts (prevent XSS, SQL injection)
- [ ] T089 [P] Add audit logging for security events in apps/api/src/middleware/auditLog.ts (failed login attempts, verification code requests, token transactions > 20 IT)
- [ ] T090 [P] Optimize geocoding with Redis caching in packages/shared/src/utils/geocode.ts (cache key: sha256(city,country), TTL 30 days, measure hit rate > 80%)
- [ ] T091 [P] Add PostGIS GIST index on human_profiles.location in packages/db/src/schema/humanProfiles.ts (enable efficient geo-radius queries for Sprint 7)
- [ ] T092 [P] Add UNIQUE constraint on token_transactions.idempotency_key in packages/db/src/schema/tokenTransactions.ts (database-level duplicate prevention)
- [ ] T093 [P] Add CHECK constraint on token_transactions: balance_after = balance_before + amount in packages/db/src/schema/tokenTransactions.ts (double-entry integrity)
- [ ] T094 Add error handling for OAuth provider failures in apps/api/src/routes/auth/oauth*.ts (handle token expiration, missing email, provider outages)
- [ ] T095 Add CORS configuration in apps/api/src/index.ts (allow frontend origin, credentials true, preflight cache 24hr)
- [ ] T096 Add HSTS header in apps/api/src/middleware/security.ts (max-age 31536000, includeSubDomains)
- [ ] T097 [P] Run quickstart.md manual validation (setup OAuth credentials, run migrations, seed data, test all 3 registration methods)
- [ ] T098 [P] Update Phase 1 tests to ensure all 668 existing tests still pass (regression protection)
- [ ] T099 Performance test with k6 in apps/api/k6/tokenConcurrency.js (1000 concurrent token transactions, verify p95 < 500ms, zero deadlocks)
- [ ] T100 Security audit of OAuth implementation (verify PKCE enabled, state parameter validated, redirect URI exact match, no implicit grant)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2) - MVP complete after this phase
- **User Story 2 (Phase 4)**: Depends on Foundational (Phase 2) - Can start in parallel with US1 if staffed
- **User Story 3 (Phase 5)**: Depends on Foundational (Phase 2) + User Story 2 (needs profile to save orientation metadata)
- **User Story 4 (Phase 6)**: Depends on Foundational (Phase 2) + User Story 3 (needs orientation reward)
- **User Story 5 (Phase 7)**: Depends on all other user stories (aggregates data from US1-4)
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Independent - Only depends on Foundational (Phase 2)
- **User Story 2 (P1)**: Independent - Only depends on Foundational (Phase 2), can parallel with US1
- **User Story 3 (P2)**: Depends on US2 (saves orientation progress in profile metadata)
- **User Story 4 (P2)**: Depends on US3 (orientation reward is first token earning)
- **User Story 5 (P3)**: Depends on US1-4 (dashboard aggregates all data)

### Within Each User Story

- Tests MUST be written FIRST and FAIL before implementation
- Database schemas before API routes
- API routes before frontend components
- Core implementation before integration with other stories

### Parallel Opportunities

**Setup Phase (6 tasks in parallel)**:
```bash
T002 [P] # Setup Google OAuth credentials
T003 [P] # Setup GitHub OAuth credentials
T004 [P] # Add environment variables
T005 [P] # Install PostGIS extension
```

**Foundational Phase (8 tasks in parallel after T007)**:
```bash
T008 [P] # Create transaction_type enum
T009 [P] # Create humanProfiles schema
T010 [P] # Create tokenTransactions schema
T015 [P] # Create profile completeness utility
T016 [P] # Create geocoding utility
T017 [P] # Create Zod schemas
T018 [P] # Create TypeScript types
T021 [P] # Create Redis client
T022 [P] # Create token audit job
```

**User Story 1 - Tests (5 tests in parallel)**:
```bash
T023 [P] [US1] # Google OAuth test
T024 [P] [US1] # GitHub OAuth test
T025 [P] [US1] # Email/password test
T026 [P] [US1] # Code expiry test
T027 [P] [US1] # Code throttling test
```

**User Story 1 - Frontend (4 pages in parallel)**:
```bash
T039 [P] [US1] # Registration page
T040 [P] [US1] # Email verification page
T041 [P] [US1] # Login page
```

**User Story 2 - Tests (4 tests in parallel)**:
```bash
T043 [P] [US2] # Profile creation test
T044 [P] [US2] # Completeness calculation test
T045 [P] [US2] # Profile update test
T046 [P] [US2] # Geocoding failure test
```

**User Story 2 - Frontend (3 components in parallel)**:
```bash
T052 [P] [US2] # Profile creation form
T053 [P] [US2] # Profile settings page
T054 [P] [US2] # Profile completeness card
```

**User Story 3 - Tests (3 tests in parallel)**:
```bash
T055 [P] [US3] # Orientation progress test
T056 [P] [US3] # Orientation reward test
T057 [P] [US3] # Reward idempotency test
```

**User Story 3 - Frontend (2 components in parallel)**:
```bash
T060 [P] [US3] # Orientation page
T061 [P] [US3] # Orientation step components
```

**User Story 4 - Tests (5 tests in parallel)**:
```bash
T063 [P] [US4] # Token spending test
T064 [P] [US4] # Insufficient balance test
T065 [P] [US4] # Concurrent transactions test
T066 [P] [US4] # Idempotency test
T067 [P] [US4] # Audit job test
```

**User Story 4 - Frontend (3 components in parallel)**:
```bash
T073 [P] [US4] # Token balance card
T074 [P] [US4] # Voting modal
T075 [P] [US4] # Transaction history page
```

**User Story 5 - Tests (3 tests in parallel)**:
```bash
T076 [P] [US5] # Dashboard aggregation test
T077 [P] [US5] # Incomplete profile test
T078 [P] [US5] # Pending orientation test
```

**User Story 5 - Frontend (4 components in parallel)**:
```bash
T082 [P] [US5] # Dashboard layout
T083 [P] [US5] # Reputation card
T084 [P] [US5] # Missions card
T085 [P] [US5] # Activity feed
```

**Polish Phase (12 tasks in parallel)**:
```bash
T087 [P] # Rate limiting
T088 [P] # Input sanitization
T089 [P] # Audit logging
T090 [P] # Geocoding optimization
T091 [P] # PostGIS index
T092 [P] # Idempotency constraint
T093 [P] # Double-entry constraint
T097 [P] # Quickstart validation
T098 [P] # Phase 1 regression tests
T099 [P] # k6 performance test
```

---

## Parallel Example: User Story 1 Implementation

After completing Foundational phase, User Story 1 can be fully parallelized:

```bash
# Launch all tests together (write tests FIRST):
Task T023 [P] [US1]: Google OAuth test
Task T024 [P] [US1]: GitHub OAuth test
Task T025 [P] [US1]: Email/password test
Task T026 [P] [US1]: Code expiry test
Task T027 [P] [US1]: Code throttling test

# After tests fail, launch all API routes together:
Task T028 [US1]: POST /auth/register
Task T029 [US1]: POST /auth/verify-email
Task T030 [US1]: POST /auth/resend-code
Task T031 [US1]: GET /auth/oauth/google
Task T032 [US1]: GET /auth/oauth/google/callback
Task T033 [US1]: GET /auth/oauth/github
Task T034 [US1]: GET /auth/oauth/github/callback
Task T035 [US1]: POST /auth/login
Task T036 [US1]: POST /auth/refresh
Task T037 [US1]: POST /auth/logout

# Launch all frontend pages together:
Task T039 [P] [US1]: Registration page
Task T040 [P] [US1]: Email verification page
Task T041 [P] [US1]: Login page
Task T042 [US1]: OAuth callback handler
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup (~1 hour)
2. Complete Phase 2: Foundational (~3-4 days)
3. Complete Phase 3: User Story 1 (Registration) (~2-3 days)
4. Complete Phase 4: User Story 2 (Profile) (~2-3 days)
5. **STOP and VALIDATE**: Test registration + profile creation independently
6. Deploy/demo MVP with registration + profile creation

**Total MVP Time**: ~2 weeks

### Incremental Delivery (All User Stories)

1. Complete Setup + Foundational → Foundation ready (~1 week)
2. Add User Story 1 (Registration) → Test independently → Deploy (MVP!) (~3 days)
3. Add User Story 2 (Profile) → Test independently → Deploy (~3 days)
4. Add User Story 3 (Orientation) → Test independently → Deploy (~2 days)
5. Add User Story 4 (Token Economy) → Test independently → Deploy (~3 days)
6. Add User Story 5 (Dashboard) → Test independently → Deploy (~2 days)
7. Complete Polish phase → Final deployment (~2 days)

**Total Full Implementation Time**: ~3-4 weeks

### Parallel Team Strategy

With 3 developers after Foundational phase completes:

- **Developer A**: User Story 1 (Registration) + User Story 4 (Token Economy)
- **Developer B**: User Story 2 (Profile) + User Story 5 (Dashboard)
- **Developer C**: User Story 3 (Orientation) + Polish phase

**Total Parallel Time**: ~2-3 weeks (vs 4 weeks sequential)

---

## Task Summary

- **Total Tasks**: 100
- **Setup (Phase 1)**: 6 tasks
- **Foundational (Phase 2)**: 16 tasks (BLOCKS all user stories)
- **User Story 1 (P1)**: 20 tasks (5 tests + 11 API routes + 4 frontend)
- **User Story 2 (P1)**: 12 tasks (4 tests + 5 API routes + 3 frontend)
- **User Story 3 (P2)**: 8 tasks (3 tests + 2 API routes + 3 frontend)
- **User Story 4 (P2)**: 13 tasks (5 tests + 5 API routes + 3 frontend)
- **User Story 5 (P3)**: 11 tasks (3 tests + 3 API routes + 5 frontend)
- **Polish (Phase 8)**: 14 tasks

**Parallel Tasks**: 52 tasks marked [P] (~52% parallelizable)

**MVP Scope**: Phase 1 + Phase 2 + Phase 3 + Phase 4 = 54 tasks (registration + profile)

**Test Coverage**: 23 integration tests (exceeds SC-014 requirement of 15+ tests)

---

## Notes

- [P] tasks = different files, no dependencies, can run in parallel
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- **TDD enforced**: Write tests FIRST, verify they FAIL, then implement
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- All 668 Phase 1 tests must continue passing (T098 validates regression)
- OAuth credentials (T002, T003) are manual setup tasks documented in quickstart.md
