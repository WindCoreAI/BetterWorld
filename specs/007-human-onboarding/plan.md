# Implementation Plan: Sprint 6 - Human Onboarding

**Branch**: `007-human-onboarding` | **Date**: 2026-02-10 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/007-human-onboarding/spec.md`

## Summary

Sprint 6 establishes the foundation for human participation in the BetterWorld platform. This feature enables humans to register (via OAuth 2.0 + PKCE or email/password), create rich profiles with skills and location data, complete an educational orientation tutorial earning their first 10 ImpactTokens, and access a dashboard displaying their balance, reputation, and missions. The token economy implements double-entry accounting with race-condition protection, supporting voting (1-10 IT), circle membership (50 IT), and analytics placeholder (20 IT). All token operations are idempotent with daily audit jobs ensuring balance integrity.

**Technical Approach**: Extend existing better-auth infrastructure with OAuth providers (Google, GitHub), reuse agent verification flow for email codes, implement token_transactions table with balance_before/balance_after columns and SELECT FOR UPDATE locking, create orientation flow with resumable progress in JSONB metadata, build human dashboard UI with real-time WebSocket updates, and add profile geocoding via PostGIS ST_MakePoint. Integration with Phase 1 guardrail system, Redis cache, and BullMQ queue for audit jobs.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js 22+
**Primary Dependencies**:
- Backend: Hono (API framework), better-auth (OAuth 2.0 + PKCE), Drizzle ORM, BullMQ (audit jobs), Zod (validation), Pino (logging)
- Frontend: Next.js 15 (App Router, RSC), React 19, Tailwind CSS 4, Zustand (client state), React Query v5 (server state)
- Database: PostgreSQL 16 + pgvector, Upstash Redis 7

**Storage**:
- PostgreSQL (Supabase): humans, human_profiles (or extended humans table), token_transactions, token_ledger, verification_codes (existing, add user_type column)
- Redis: token operation locks, verification code throttling, orientation reward idempotency cache, session storage
- PostGIS: Location geocoding and storage as geometry(Point, 4326)

**Testing**: Vitest (unit tests), Playwright (E2E), k6 (load tests)
**Target Platform**:
- Backend: Fly.io (Hono API + BullMQ workers in Docker containers)
- Frontend: Vercel (Next.js SSR + static optimization)
- Database: Supabase (PostgreSQL + PostGIS), Upstash Redis

**Project Type**: Monorepo web application (Turborepo + pnpm workspaces)

**Performance Goals**:
- OAuth flows complete in < 5 seconds
- Email verification codes delivered within 30 seconds (95% of cases)
- Profile geocoding completes in < 2 seconds
- Dashboard loads in < 1 second
- Token operations handle 1000 concurrent transactions without deadlocks
- Orientation reward issued within 100ms

**Constraints**:
- All 668 existing Phase 1 tests must continue passing
- Token balance operations must be race-condition safe (SELECT FOR UPDATE)
- Email verification must reuse existing agent verification infrastructure
- OAuth must use PKCE (RFC 7636) for security
- Token transactions must be idempotent (1-hour cached response window)
- Daily audit job must detect 100% of balance discrepancies
- Zero high/critical OAuth security vulnerabilities
- Profile completeness score must be accurate (0-100%)

**Scale/Scope**:
- 15+ new integration tests covering registration → profile → orientation → tokens → spending
- 4 database tables (humans extended or human_profiles + token_transactions + token_ledger + verification_codes.user_type column)
- 9 new API endpoints (auth, profile, tokens, dashboard)
- 5-step orientation tutorial at /onboarding route
- 3 OAuth providers (Google, GitHub, email/password)
- 3 token spending categories (voting 1-10 IT, circles 50 IT, analytics 20 IT)
- Daily BullMQ cron job for double-entry audit

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Constitutional AI for Good (NON-NEGOTIABLE)

**Status**: ✅ **PASS** - Not Applicable to This Feature

**Rationale**: Sprint 6 focuses on human registration, authentication, and token economy infrastructure. Human profile data (skills, location, bio) does not pass through the 3-layer guardrail system as it is self-describing metadata, not platform content submitted for social good alignment. The guardrails apply to agent-submitted problems, solutions, and mission descriptions, not to human identity and profile information.

**Future Consideration**: In Sprint 7+ when humans submit evidence or create missions, that content will pass through the guardrail pipeline. This sprint establishes the authentication and economic foundation, but does not introduce new content types requiring constitutional alignment.

---

### II. Security First (NON-NEGOTIABLE)

**Status**: ✅ **PASS** - Fully Compliant

**Compliance Measures**:

1. **OAuth Security**:
   - ✅ OAuth 2.0 + PKCE (RFC 7636) prevents authorization code interception
   - ✅ Never use implicit grant flow
   - ✅ State parameter validation to prevent CSRF
   - ✅ Redirect URI validation (exact match, no wildcards)

2. **Password Security**:
   - ✅ Email/password hashed with bcrypt cost factor 12 (same as agent API keys)
   - ✅ Never stored or logged in plaintext
   - ✅ Password reset uses same 6-digit verification code flow (15-min expiry)

3. **Token Security**:
   - ✅ JWT access tokens (15min expiry) + refresh tokens (7-day expiry)
   - ✅ Refresh token rotation on use
   - ✅ better-auth handles secure cookie flags (httpOnly, secure, sameSite)

4. **Input Validation**:
   - ✅ All API inputs validated with Zod schemas at boundaries
   - ✅ Profile fields: email (email format), skills (array of strings), location (geocoding validation), languages (ISO 639-1)

5. **Rate Limiting**:
   - ✅ Registration: 5 attempts per IP per hour (Redis sliding window)
   - ✅ Email verification: 3 code resend requests per hour per user
   - ✅ Token spending: 10 transactions per minute per user
   - ✅ Orientation reward: idempotency via timestamp check

6. **Audit Trail**:
   - ✅ All token transactions logged to token_transactions table
   - ✅ Email verification attempts logged (timestamp, IP, success/failure)
   - ✅ OAuth provider, provider ID stored for account recovery
   - ✅ Profile updates logged with timestamps

7. **Secrets Management**:
   - ✅ OAuth client secrets in environment variables (never in code/logs)
   - ✅ JWT signing key (JWT_SECRET) minimum 32 characters
   - ✅ Verification codes generated with crypto.randomInt (not Math.random)

**No Violations**: All security requirements met.

---

### III. Test-Driven Quality Gates (NON-NEGOTIABLE)

**Status**: ✅ **PASS** - Fully Compliant

**Coverage Targets**:
- ✅ api package: ≥80% (target met with 15+ integration tests + unit tests for token logic)
- ✅ db package: ≥85% (migrations + seed data + schema validation tests)
- ✅ shared package: ≥75% (Zod schemas, profile completeness calculation)
- ✅ Global: ≥75% (overall monorepo coverage maintained)

**Quality Gates**:
- ✅ TypeScript strict mode: 0 errors (enforced in tsconfig.json)
- ✅ ESLint: 0 errors (existing .eslintrc.cjs rules apply)
- ✅ All 668 Phase 1 tests continue passing (regression protection)
- ✅ 15+ new integration tests:
  - Registration via Google OAuth
  - Registration via GitHub OAuth
  - Registration via email/password with verification
  - Profile creation with geocoding
  - Orientation tutorial progress (resumable)
  - Orientation reward (one-time, idempotent)
  - Token spending (voting, circles, analytics)
  - Concurrent token transactions (race condition test)
  - Dashboard data aggregation
  - Daily audit job (discrepancy detection)
  - Profile update with ownership check
  - Token balance calculation accuracy
  - Email verification throttling
  - OAuth state parameter validation
  - Profile completeness score calculation

**No Violations**: All testing requirements met.

---

### IV. Verified Impact

**Status**: ✅ **PASS** - Fully Compliant

**Double-Entry Accounting**:
- ✅ Every token transaction creates entry with balance_before + balance_after
- ✅ Database check constraint: `balance_after = balance_before + amount`
- ✅ Database check constraint: `balance_after >= 0` (non-negative balance)
- ✅ SELECT FOR UPDATE used for all token operations (race-condition protection)
- ✅ Daily BullMQ cron job verifies: `sum(all amounts) = 0` (debits + credits balance)
- ✅ Audit job alerts on discrepancies via Pino error logs (monitored by Sentry)

**Idempotency**:
- ✅ Orientation reward: checks orientation_completed_at timestamp, returns cached response if already awarded
- ✅ Token spending: idempotency_key parameter (1-hour Redis cache window)
- ✅ Transaction IDs: UUID v4 generated for each transaction, prevents replays

**ImpactTokens as Soulbound**:
- ✅ No transfer endpoint implemented (only earn via missions, spend via platform actions)
- ✅ Future: Phase 3 may add peer-to-peer tipping, but base tokens remain non-transferable

**No Violations**: All verified impact requirements met.

---

### V. Human Agency

**Status**: ✅ **PASS** - Fully Compliant (Sprint 7 Dependency)

**Compliance in Sprint 6**:
- ✅ Humans can skip orientation from dashboard (voluntary, not forced)
- ✅ Orientation required before first mission claim (Sprint 7) but not for platform access
- ✅ Token spending is voluntary (users choose when to vote, join circles, unlock analytics)
- ✅ No penalties for not completing orientation (just can't claim missions in Sprint 7)

**Sprint 7 Dependencies** (out of scope for Sprint 6):
- Mission claiming with SELECT FOR UPDATE SKIP LOCKED (Sprint 7)
- Maximum 3 active missions per human (Sprint 7)
- Auto-expiration of claimed missions without evidence (Sprint 7)

**No Violations**: Human agency preserved. Orientation is educational, not coercive.

---

### VI. Framework Agnostic

**Status**: ✅ **PASS** - Not Applicable to Human-Facing Features

**Rationale**: Sprint 6 introduces human registration and authentication, not agent integration features. The framework-agnostic principle applies to agent API contracts (REST + WebSocket), not to human authentication flows which are standard OAuth 2.0.

**Future Consideration**: Sprint 7+ when humans interact with agent-created missions, the API contracts remain framework-agnostic. OAuth and human endpoints do not affect agent integration surface.

**No Violations**: Human authentication uses industry-standard OAuth 2.0, which is provider-agnostic (Google, GitHub, etc.).

---

### VII. Structured over Free-form

**Status**: ✅ **PASS** - Fully Compliant

**Structured Data**:
- ✅ Profile schema validated by Zod: skills (string[]), languages (string[]), location (PostGIS point), availability (structured JSON), bio (max 500 chars)
- ✅ Orientation progress stored in JSONB: `{ orientation_step: 1-5, completed_at: timestamp | null }`
- ✅ Token transactions schema: amount (decimal), transaction_type (enum), reference_type (enum), balance_before, balance_after
- ✅ Verification codes schema: code (6 digits), user_type (enum: agent/human), expiry_at, verified (boolean)

**No Free-form Fields**:
- ✅ Bio is limited to 500 characters (prevents slop)
- ✅ Skills and languages are arrays (structured, filterable)
- ✅ Availability is JSONB (structured hours, not free text)

**No Violations**: All data follows defined schemas.

---

### Summary

**Overall Status**: ✅ **ALL GATES PASS**

- **Applicable Principles**: 6 of 7 (Constitutional AI not applicable to human profiles)
- **Pass Rate**: 100% (6/6)
- **Violations**: 0
- **Complexity Justifications Required**: 0

Sprint 6 fully complies with the BetterWorld constitution. No waivers or exceptions needed.

## Project Structure

### Documentation (this feature)

```text
specs/007-human-onboarding/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (OAuth providers, geocoding APIs, double-entry patterns)
├── data-model.md        # Phase 1 output (humans/profiles, token_transactions, verification_codes updates)
├── quickstart.md        # Phase 1 output (setup OAuth credentials, test registration flow)
├── contracts/           # Phase 1 output (API endpoint contracts in OpenAPI format)
│   ├── auth.openapi.yaml
│   ├── profile.openapi.yaml
│   ├── tokens.openapi.yaml
│   └── dashboard.openapi.yaml
├── checklists/
│   └── requirements.md  # Spec quality validation (already created)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
BetterWorld/ (monorepo root)
├── apps/
│   ├── api/ (Hono backend)
│   │   ├── src/
│   │   │   ├── middleware/
│   │   │   │   └── auth-human.ts           # NEW: Human JWT authentication middleware
│   │   │   ├── routes/
│   │   │   │   ├── auth/
│   │   │   │   │   ├── register.ts         # NEW: Email/password registration
│   │   │   │   │   ├── oauth.ts            # NEW: OAuth Google/GitHub flows
│   │   │   │   │   └── verify-email.ts     # NEW: Email verification endpoint
│   │   │   │   ├── profile/
│   │   │   │   │   ├── create.ts           # NEW: Profile creation with geocoding
│   │   │   │   │   └── update.ts           # NEW: Profile update (PATCH)
│   │   │   │   ├── tokens/
│   │   │   │   │   ├── balance.ts          # NEW: GET /tokens/balance
│   │   │   │   │   ├── transactions.ts     # NEW: GET /tokens/transactions (cursor pagination)
│   │   │   │   │   ├── spend.ts            # NEW: POST /tokens/spend (idempotent)
│   │   │   │   │   └── orientation-reward.ts # NEW: POST /tokens/orientation-reward (one-time)
│   │   │   │   ├── onboarding/
│   │   │   │   │   ├── progress.ts         # NEW: GET/POST orientation progress
│   │   │   │   │   └── complete.ts         # NEW: POST complete orientation (triggers reward)
│   │   │   │   └── dashboard/
│   │   │   │       └── index.ts            # NEW: GET /dashboard (aggregate data)
│   │   │   ├── services/
│   │   │   │   ├── auth-service.ts         # EXTEND: Add OAuth + human registration logic
│   │   │   │   ├── geocoding-service.ts    # NEW: PostGIS location geocoding
│   │   │   │   ├── token-service.ts        # NEW: Token operations with locking
│   │   │   │   └── profile-service.ts      # NEW: Profile completeness calculation
│   │   │   ├── workers/
│   │   │   │   └── token-audit.ts          # NEW: BullMQ daily audit job
│   │   │   └── index.ts                    # EXTEND: Register new routes
│   │   └── tests/
│   │       └── integration/
│   │           ├── auth.test.ts            # NEW: OAuth + email/password tests
│   │           ├── profile.test.ts         # NEW: Profile CRUD tests
│   │           ├── tokens.test.ts          # NEW: Token operations + concurrency tests
│   │           ├── onboarding.test.ts      # NEW: Orientation flow tests
│   │           └── dashboard.test.ts       # NEW: Dashboard aggregation tests
│   │
│   └── web/ (Next.js frontend)
│       ├── src/
│       │   ├── app/
│       │   │   ├── auth/
│       │   │   │   ├── register/
│       │   │   │   │   └── page.tsx        # NEW: Registration page (OAuth + email/password)
│       │   │   │   ├── verify/
│       │   │   │   │   └── page.tsx        # NEW: Email verification page
│       │   │   │   └── callback/
│       │   │   │       └── page.tsx        # NEW: OAuth callback handler
│       │   │   ├── profile/
│       │   │   │   ├── create/
│       │   │   │   │   └── page.tsx        # NEW: Profile creation form
│       │   │   │   └── edit/
│       │   │   │       └── page.tsx        # NEW: Profile edit form
│       │   │   ├── onboarding/
│       │   │   │   └── page.tsx            # NEW: 5-step orientation tutorial
│       │   │   └── dashboard/
│       │   │       └── page.tsx            # NEW: Human dashboard
│       │   ├── components/
│       │   │   ├── auth/
│       │   │   │   ├── OAuthButtons.tsx    # NEW: Google/GitHub login buttons
│       │   │   │   ├── RegistrationForm.tsx # NEW: Email/password form
│       │   │   │   └── VerificationInput.tsx # NEW: 6-digit code input
│       │   │   ├── profile/
│       │   │   │   ├── ProfileForm.tsx     # NEW: Skills, location, languages, availability
│       │   │   │   ├── SkillSelector.tsx   # NEW: Multi-select skills
│       │   │   │   ├── LocationInput.tsx   # NEW: City/country autocomplete
│       │   │   │   └── CompletenessIndicator.tsx # NEW: Profile completeness badge
│       │   │   ├── onboarding/
│       │   │   │   ├── StepProgress.tsx    # NEW: Step indicator (1-5)
│       │   │   │   ├── ConstitutionStep.tsx # NEW: Step 1 content
│       │   │   │   ├── DomainsStep.tsx     # NEW: Step 2 content
│       │   │   │   ├── MissionsStep.tsx    # NEW: Step 3 content
│       │   │   │   ├── EvidenceStep.tsx    # NEW: Step 4 content
│       │   │   │   └── TokensStep.tsx      # NEW: Step 5 content
│       │   │   ├── dashboard/
│       │   │   │   ├── TokenBalanceCard.tsx # NEW: Display balance + recent transactions
│       │   │   │   ├── ReputationCard.tsx  # NEW: Reputation score + tooltip
│       │   │   │   ├── MissionsList.tsx    # NEW: Active missions (Sprint 7 data)
│       │   │   │   ├── ActivityFeed.tsx    # NEW: WebSocket real-time events
│       │   │   │   └── ProfileCompleteness.tsx # NEW: Completeness % + CTA
│       │   │   └── tokens/
│       │   │       ├── SpendModal.tsx      # NEW: Voting/circles/analytics spending UI
│       │   │       └── TransactionHistory.tsx # NEW: Paginated transaction list
│       │   ├── lib/
│       │   │   ├── auth-client.ts          # EXTEND: Add OAuth client-side helpers
│       │   │   └── api/
│       │   │       ├── auth.ts             # NEW: Registration, OAuth, verification API calls
│       │   │       ├── profile.ts          # NEW: Profile CRUD API calls
│       │   │       ├── tokens.ts           # NEW: Token operations API calls
│       │   │       └── dashboard.ts        # NEW: Dashboard data fetching
│       │   └── store/
│       │       ├── auth-store.ts           # EXTEND: Add OAuth state + human auth
│       │       ├── profile-store.ts        # NEW: Profile data + completeness
│       │       └── tokens-store.ts         # NEW: Token balance + transaction history
│       └── tests/
│           └── e2e/
│               ├── registration.spec.ts    # NEW: E2E registration flow
│               ├── orientation.spec.ts     # NEW: E2E orientation completion
│               └── dashboard.spec.ts       # NEW: E2E dashboard interaction
│
├── packages/
│   ├── db/ (Drizzle ORM)
│   │   ├── src/
│   │   │   ├── schema/
│   │   │   │   ├── humans.ts               # EXTEND: Add OAuth fields, orientation_completed_at
│   │   │   │   ├── human-profiles.ts       # NEW OR EXTEND: Skills, location, availability, metadata
│   │   │   │   ├── token-transactions.ts   # NEW: Transaction log with balance tracking
│   │   │   │   ├── token-ledger.ts         # NEW OR DEFERRED: Separate ledger for double-entry (research needed)
│   │   │   │   ├── verification-codes.ts   # EXTEND: Add user_type enum column
│   │   │   │   └── enums.ts                # EXTEND: Add transactionTypeEnum, userTypeEnum
│   │   │   ├── migrations/
│   │   │   │   └── NNNN_sprint6_human_onboarding.sql # NEW: Migration for Sprint 6 tables
│   │   │   └── seed/
│   │   │       └── humans.ts               # NEW: Seed test humans for development
│   │   └── tests/
│   │       ├── schema.test.ts              # EXTEND: Test new schemas
│   │       └── migrations.test.ts          # NEW: Test Sprint 6 migration
│   │
│   ├── shared/ (Shared types, Zod schemas, constants)
│   │   ├── src/
│   │   │   ├── schemas/
│   │   │   │   ├── auth.ts                 # NEW: Registration, OAuth, verification schemas
│   │   │   │   ├── profile.ts              # NEW: Profile creation/update schemas
│   │   │   │   ├── tokens.ts               # NEW: Token spend, reward schemas
│   │   │   │   └── onboarding.ts           # NEW: Orientation progress schema
│   │   │   ├── types/
│   │   │   │   ├── auth.ts                 # NEW: OAuth types, human auth types
│   │   │   │   ├── profile.ts              # NEW: Profile types, completeness types
│   │   │   │   └── tokens.ts               # NEW: Transaction types, spending types
│   │   │   ├── constants/
│   │   │   │   ├── orientation.ts          # NEW: 5 steps, step content metadata
│   │   │   │   └── tokens.ts               # NEW: Spending costs (voting 1-10, circles 50, analytics 20)
│   │   │   └── utils/
│   │   │       ├── profile-completeness.ts # NEW: Calculate profile completeness (0-100%)
│   │   │       └── geocoding.ts            # NEW: PostGIS helper functions
│   │   └── tests/
│   │       ├── schemas.test.ts             # NEW: Test Zod schemas
│   │       └── profile-completeness.test.ts # NEW: Test completeness calculation
│   │
│   └── guardrails/ (Constitutional guardrails - no changes for Sprint 6)
│       └── (No changes: Human profiles don't pass through guardrails)
│
└── docs/ (Documentation)
    ├── engineering/
    │   ├── 03a-db-overview-and-schema-core.md # EXTEND: Document humans table OAuth fields
    │   ├── 03b-db-schema-missions-and-content.md # EXTEND: Document token_transactions, token_ledger
    │   └── 06-api-design.md                # EXTEND: Document auth, profile, tokens, dashboard endpoints
    └── roadmap/
        └── phase2-human-in-the-loop.md     # REFERENCE: Sprint 6 details (already documented)
```

**Structure Decision**: Monorepo web application (Option 2 in template). BetterWorld uses Turborepo with apps/ (api, web) and packages/ (db, shared, guardrails). Sprint 6 extends existing packages with human authentication, profile management, and token economy features. No new packages created; all work contained within existing structure.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**Status**: No violations detected. All constitutional principles are followed without exceptions.

This section is intentionally empty as Sprint 6 fully complies with the BetterWorld constitution.

## Phase 0: Research Artifacts

**See**: [research.md](research.md) (generated next)

Key research areas for Sprint 6:
1. **OAuth 2.0 + PKCE Implementation**: better-auth provider configuration for Google + GitHub
2. **PostGIS Geocoding**: ST_MakePoint vs external geocoding APIs (Nominatim, Google Maps)
3. **Double-Entry Accounting**: Single table (token_transactions) vs separate ledger (token_ledger)
4. **Token Race Conditions**: SELECT FOR UPDATE vs optimistic locking patterns
5. **Profile Completeness Algorithm**: Weighted vs binary field scoring
6. **Orientation Progress Storage**: JSONB metadata vs separate table

## Phase 1: Design Artifacts

**See**:
- [data-model.md](data-model.md) - Database schema for humans, profiles, tokens, verification codes
- [contracts/](contracts/) - OpenAPI contracts for auth, profile, tokens, dashboard endpoints
- [quickstart.md](quickstart.md) - Setup guide for OAuth credentials, test data, development environment

Key design decisions:
1. **Humans Table Extension**: Add oauth_provider, oauth_provider_id, orientation_completed_at columns to existing humans table (vs separate human_profiles table - research will determine)
2. **Token Transactions Schema**: Single table with balance_before/balance_after columns (double-entry via amount sign) or separate token_ledger table
3. **Verification Codes Reuse**: Add user_type enum column to existing verification_codes table (agent/human)
4. **Orientation Progress**: Store in humans.metadata JSONB column (vs separate onboarding_progress table)
5. **API Routes**: RESTful structure under /v1/auth, /v1/profile, /v1/tokens, /v1/onboarding, /v1/dashboard

## Next Steps

After `/speckit.plan` completes Phase 0 (research) and Phase 1 (design), run:

```bash
/speckit.tasks
```

This will generate `tasks.md` with Phase 2 implementation tasks, breaking down the work into atomic units for development.
