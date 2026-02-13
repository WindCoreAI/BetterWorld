# Phase 2 "Human-in-the-Loop" Code-Level Evaluation Report

## Fixes Applied (2026-02-11)

The following issues from this evaluation have been resolved:

### Fix 1: Evidence frontend missing auth header (#10, P1)
**File:** `apps/web/app/missions/[id]/submit/page.tsx`
Added `Authorization: Bearer <token>` header to the evidence submission fetch call using `getHumanToken()` from the existing `api.ts` helper. The `humanAuth()` middleware will now accept the request.

### Fix 2: AI verification worker sends actual image to Claude Vision (#13, P2→P1)
**File:** `apps/api/src/workers/evidence-verification.ts`
The Claude API call now fetches the actual image from storage (via `getSignedUrl`), converts to base64, and includes it as an image content block for image-type evidence. Falls back to metadata-only verification if image fetch fails. Non-image evidence types (PDF, video) continue with metadata-only.

### Fix 3: Login brute-force protection (#19, P1)
**File:** `apps/api/src/routes/auth/login.ts`
Added per-email rate limiting: 5 attempts per 15 minutes using Redis. On failed login (wrong email or wrong password), the counter increments with a 900s TTL. On successful login, the counter is cleared. If Redis is unavailable, login is allowed (fail-open for auth).

### Fix 4: Peer review vote wrapped in transaction (#12, P1)
**File:** `apps/api/src/routes/peer-reviews/index.ts`
The vote insert, peer review count increment, review history insert, and verdict computation are now wrapped in a single `db.transaction()`. Reward distribution and rate limit increment remain outside the transaction (non-critical).

### Fix 5: Peer review pending query N+1 eliminated (#11, P1)
**File:** `apps/api/src/routes/peer-reviews/index.ts`
Replaced the per-row vote existence check loop with a LEFT JOIN on `peerReviews` table, filtering `WHERE peerReviews.id IS NULL`. Also moved the self-submission exclusion (`ne(submittedByHumanId, human.id)`) into the SQL WHERE clause. This reduces the query from O(n) DB calls to a single query.

### Fix 6: Email sending implemented with Resend (#1, P1)
**Files:** `apps/api/src/lib/email.ts` (new), `apps/api/src/routes/auth/register.ts`, `apps/api/src/routes/auth/resendCode.ts`
Created `email.ts` helper using the Resend SDK (already in package.json). Sends HTML verification emails with the 6-digit code. Falls back to console logging when `RESEND_API_KEY` is not set (dev mode). The plaintext code is sent to the email function BEFORE hashing. Both register and resend-code routes now call `sendVerificationEmail()`.

### Fix 7: Honeypot claim status — Skipped (intentional design)
The honeypot leaves the claim "active" intentionally to avoid tipping off fraudsters. No change needed.

---

**Date**: 2026-02-11  
**Evaluator**: Automated Code Review  
**Scope**: Sprints 6-9, all source in `apps/api/src/`, `apps/web/`, `packages/db/src/schema/`, `packages/shared/src/`

---

## 1. Executive Summary

Phase 2 is architecturally sound with strong patterns (double-entry accounting, idempotency, SELECT FOR UPDATE, cursor pagination, CSRF/PKCE OAuth). Sprint 6 and Sprint 7 are production-quality. Sprint 8 is 90% code-complete but **non-functional due to a pending database migration** — no Sprint 8 tables exist in the database. Sprint 9 has schema files and some backend code (fraud detection, reputation engine) but routes/workers are not wired into the main flow.

**Critical blockers**: 1 P0 (migration), 2 P1 (email not sent, evidence submission frontend auth). Overall code quality is high — consistent error handling, Zod validation, proper TypeScript typing, good separation of concerns.

**Risk Level**: MEDIUM — the migration blocker is a 10-minute fix, but untested schema + code integration is a real risk.

---

## 2. Sprint-by-Sprint Assessment

### Sprint 6: Human Onboarding — ✅ COMPLETE (High Quality)

**Strengths**:
- OAuth implementation (`routes/auth/oauth.ts`) is textbook: PKCE with S256 challenge, CSRF state cookies, exchange-code pattern (no tokens in URLs), single-use codes with 60s TTL in Redis
- Token system (`routes/tokens/index.ts`) uses proper double-entry accounting with `SELECT FOR UPDATE` row locking, idempotency keys, and Redis-cached responses
- `humanAuth` middleware (`middleware/humanAuth.ts`) is clean — JWT verification via jose, active account check, proper error differentiation (expired vs invalid)
- Registration hashes password before user lookup to prevent timing-based enumeration (line 32 of `register.ts`)

**Issues**:

| # | Priority | Issue | File | Detail |
|---|----------|-------|------|--------|
| 1 | **P1** | Email verification codes never sent | `routes/auth/register.ts:74`, `routes/auth/resendCode.ts:82` | `TODO: Send email with verification code via Resend` — users registering via email/password cannot verify their account. OAuth users bypass this but email-only users are stuck. |
| 2 | P2 | Token balance stored as `decimal(18,8)` but parsed as `parseInt` | `routes/tokens/index.ts:36` | `parseInt(userRow.tokenBalance.toString(), 10)` truncates fractional tokens. Schema uses decimal but all operations treat as integer. Should either change schema to integer or use `parseFloat`. Currently safe because all amounts are integers, but schema implies fractional support. |
| 3 | P2 | `humans.tokenBalance` is decimal but `tokenTransactions.amount` is integer | `schema/humans.ts:26` vs `schema/tokenTransactions.ts:22` | Type mismatch — balance is `decimal(18,8)`, amount is `integer`. `reward-helpers.ts:66` does `parseFloat` on balance, `Math.round` on before/after. Inconsistent. |
| 4 | P3 | Session tokens stored as full JWT in `sessions.sessionToken` | `routes/auth/login.ts:61` | Storing full JWTs (potentially 500+ bytes) as session tokens is wasteful. A hash or short ID would suffice. Not a security issue but a storage concern at scale. |

### Sprint 7: Mission Marketplace — ✅ COMPLETE (High Quality)

**Strengths**:
- Mission claim uses `SELECT FOR UPDATE SKIP LOCKED` with raw SQL for correctness (`routes/missions/index.ts:327`)
- Optimistic locking via `version` column on mission updates
- Marketplace browse has proper composite index (`idx_missions_marketplace`)
- Haversine distance calculation in SQL for geo-search
- Location privacy: `snapToGrid()` for non-claimers, exact coordinates only after claim
- Encryption helpers (`lib/encryption-helpers.ts`): AES-256-GCM, proper IV/authTag handling, key validation

**Issues**:

| # | Priority | Issue | File | Detail |
|---|----------|-------|------|--------|
| 5 | P2 | Geo-search SQL injection surface | `routes/missions/index.ts:285-293` | Haversine formula uses template literals with `searchLat`/`searchLng` — these come from query params parsed as floats. Drizzle's `sql` template should parameterize, but the complex expression should be verified. |
| 6 | P2 | No unique constraint on (missionId, humanId) for active claims | `schema/missionClaims.ts` | Duplicate prevention relies on application-level check (line 349 of missions/index.ts) rather than a DB unique partial index. Under high concurrency, two identical claims could slip through between the SELECT and INSERT. |
| 7 | P2 | Encryption key rotation not implemented | `lib/encryption-helpers.ts:76` | `_keyVersion` parameter is unused — messages encrypted with old keys cannot be decrypted after rotation. |
| 8 | P3 | `currentClaimCount` denormalized without reconciliation | `schema/missions.ts:61` | If a bug causes count drift, there's no periodic reconciliation job. The count is maintained by increment/decrement in transactions, which is correct, but a daily audit would be safer. |

### Sprint 8: Evidence & Verification — ⚠️ 90% CODE-COMPLETE, MIGRATION BLOCKING

**Strengths**:
- Evidence submission (`routes/evidence/index.ts`) is well-structured: EXIF extraction with PII stripping, rate limiting, honeypot detection, file validation, image processing with thumbnails
- AI verification worker (`workers/evidence-verification.ts`) uses Claude tool_use for structured output, budget tracking, graceful fallback to peer review
- Peer review (`routes/peer-reviews/index.ts`) has proper self-review prevention, duplicate vote check, weighted verdict calculation, and review history tracking
- Reward distribution (`lib/reward-helpers.ts`) uses idempotency keys and SELECT FOR UPDATE
- Storage abstraction (`lib/storage.ts`) with Supabase/local fallback, path traversal prevention via `path.basename()`

**Issues**:

| # | Priority | Issue | File | Detail |
|---|----------|-------|------|--------|
| 9 | **P0** | **Sprint 8 migration not generated** | `packages/db/drizzle/` | Schema files exist (`evidence.ts`, `peerReviews.ts`, `reviewHistory.ts`, `verificationAuditLog.ts`, `evidence-phashes.ts`, `fraudScores.ts`, `reputation.ts`, `streaks.ts`, `endorsements.ts`) but no migration SQL generated. Tables do NOT exist in DB. All Sprint 8 code is non-functional. Fix: `pnpm --filter @betterworld/db drizzle-kit generate && pnpm --filter @betterworld/db drizzle-kit migrate` |
| 10 | P1 | Evidence submission frontend missing auth header | `apps/web/app/missions/[id]/submit/page.tsx:51` | `fetch(/api/v1/missions/${missionId}/evidence, { method: "POST", body: formData })` — no Authorization header. The `humanAuth()` middleware will reject with 401. Must use the `humanApi` client or manually attach the token. |
| 11 | P1 | Peer review pending query has N+1 | `routes/peer-reviews/index.ts:73-90` | For each evidence row, executes a separate query to check if the user already voted. With 100 pending items, that's 100+ extra queries. Should use a LEFT JOIN or subquery exclusion. |
| 12 | P1 | `peerReviewCount` increment is not atomic with vote insert | `routes/peer-reviews/index.ts:221-226` | The vote insert and count increment are separate statements without a transaction. The `computeAndApplyVerdict` reads `newCount = evidenceRow.peerReviewCount + 1` (line 213) which is the pre-read value + 1, but the actual DB increment on line 221 uses `sql` atomic increment. If two votes arrive simultaneously, verdict computation may use stale count. |
| 13 | P2 | AI verification worker doesn't include image in API call | `workers/evidence-verification.ts:153` | The Claude Vision call sends only text metadata (GPS, type, requirements) but never the actual image. The `contentUrl` is not fetched or sent as image content. This means AI verification is based purely on metadata, not visual inspection. |
| 14 | P2 | Rate limit fails open | `routes/evidence/index.ts:34` | `if (!redis) return true; // Fail open if no Redis` — if Redis goes down, rate limiting is bypassed. For evidence submission (fraud-sensitive), this should fail closed. |
| 15 | P2 | Evidence list endpoint generates signed URLs in a loop | `routes/evidence/index.ts:225-230` | `Promise.all(items.map(async (item) => getSignedUrl(...)))` — for 20 items, that's 20 HTTP calls to Supabase. Should batch or cache. |
| 16 | P3 | Honeypot detection stores evidence as "rejected" but doesn't update claim status | `routes/evidence/index.ts:146-157` | When honeypot evidence is submitted, the evidence is rejected but the mission claim remains "active". The human can keep submitting. |

### Sprint 9: Reputation & Impact — 🟡 SCHEMA ONLY, NOT STARTED

**Assessment**: Schema files are complete and well-designed (`reputation.ts`, `streaks.ts`, `fraudScores.ts`, `evidence-phashes.ts`, `endorsements.ts`). Backend libraries exist (`lib/fraud-detection.ts`, `lib/reputation-engine.ts`, `lib/streak-tracker.ts`, `lib/leaderboard-cache.ts`). Frontend components exist (`components/reputation/`, `components/streaks/`, `components/leaderboards/`). Routes exist (`routes/reputation/`, `routes/streaks/`, `routes/leaderboards/`, `routes/fraud/`, `routes/impact/`, `routes/portfolios/`). However, **none of this is wired into the main data flow** — evidence verification doesn't trigger reputation updates, completed missions don't update streaks, etc. Sprint 9 is scaffolded but not integrated.

**Issues**:

| # | Priority | Issue | File | Detail |
|---|----------|-------|------|--------|
| 17 | P2 | Fraud detection engine exists but is never called from the evidence pipeline | `lib/fraud-detection.ts` | Functions like `checkVelocity`, `analyzeGpsVariance`, etc. are implemented but not invoked from evidence submission or the verification worker. |
| 18 | P2 | Reputation scoring not triggered by evidence verification | `lib/reputation-engine.ts` | No call from `evidence-verification.ts` or `peer-reviews/index.ts` to update reputation after verification completes. |

---

## 3. Cross-Cutting Concerns

### 3.1 Security

**Good**:
- OAuth: PKCE + CSRF state cookies + exchange-code pattern ✅
- Password: bcrypt with cost 12, timing-safe enumeration prevention ✅
- JWT: jose library, proper expiry handling, refresh token rotation ✅
- Encryption: AES-256-GCM with proper IV/authTag ✅
- Path traversal: `path.basename()` in storage paths ✅
- IDOR: Evidence list filtered by `submittedByHumanId`, detail checks ownership ✅
- Rate limiting: Sliding window via Redis sorted sets ✅
- Input validation: Zod schemas on all endpoints ✅

**Concerns**:

| # | Priority | Issue | Detail |
|---|----------|-------|--------|
| 19 | P1 | No brute-force protection on login | `routes/auth/login.ts` has no rate limiting or account lockout. An attacker can attempt unlimited password guesses. The global rate limiter exists but login should have a tighter per-email limit (e.g., 5 attempts/15min). |
| 20 | P2 | OAuth access tokens stored in plaintext | `findOrCreateOAuthUser` in `oauth.ts:197` stores `params.providerTokens.access_token` directly in the `accounts` table. These should be encrypted at rest. |
| 21 | P2 | `MESSAGE_ENCRYPTION_KEY` cached in module-level variable | `lib/encryption-helpers.ts:20` — `cachedKey` never invalidated. If the key is rotated at runtime, old key persists until process restart. Minor since key rotation requires restart anyway. |
| 22 | P2 | Admin role check is string comparison | `routes/evidence/index.ts:254` — `human.role !== "admin"`. No admin role management system — anyone with role="admin" in the DB has full access. Needs proper RBAC. |

### 3.2 Performance

**Good**:
- Composite indexes on marketplace browse (`idx_missions_marketplace`) ✅
- Cursor-based pagination everywhere (no offset) ✅
- `Promise.all` for parallel independent queries (token balance) ✅
- JOINs instead of N+1 on mission detail ✅
- BullMQ workers with configurable concurrency ✅

**Concerns**:

| # | Priority | Issue | Detail |
|---|----------|-------|--------|
| 23 | P2 | Peer review pending query is N+1 | `peer-reviews/index.ts:73-90` — per-row vote existence check. At scale, this is O(n) queries per page load. |
| 24 | P2 | 2-hop exclusion query for peer assignment is expensive | `lib/peer-assignment.ts:37-52` — 4 UNION subqueries on `review_history` with self-JOINs. At scale (10K+ review history rows), this could be slow. Needs EXPLAIN ANALYZE and possibly materialization. |
| 25 | P3 | No query timeout configured | No statement_timeout or connection pooling timeout visible. Long-running queries could block connection pool. |
| 26 | P3 | Signed URL generation for evidence list is sequential HTTP | 20 Supabase API calls per page load. Should batch or pre-sign. |

### 3.3 Testing

**Coverage Assessment**:
- Sprint 6: Good — 17 integration tests covering auth, profile, tokens, orientation
- Sprint 7: Good — 41 tests covering mission CRUD, expiration, messages, decomposition
- Sprint 8: Weak — 42 tests exist but **cannot run** due to missing migration (all mock DB)
- Sprint 9: No tests

**Gaps**:

| # | Priority | Issue | Detail |
|---|----------|-------|--------|
| 27 | P1 | Sprint 8 tests are entirely mocked | Evidence tests in `__tests__/evidence/` use `vi.fn()` mocks for everything. No integration tests with real DB. Tests pass but don't validate actual SQL/schema correctness. |
| 28 | P1 | No concurrent claim race condition test | The mission claim flow uses `SELECT FOR UPDATE SKIP LOCKED` but no test verifies this under concurrency (e.g., 10 simultaneous claims). |
| 29 | P2 | No test for token balance overflow/underflow | Edge cases: spending exactly the balance, spending more than balance, earning when at max decimal precision — none tested. |
| 30 | P2 | No test for OAuth account linking conflicts | When a user registers via email then tries to OAuth with same email — the linking logic exists but isn't tested. |
| 31 | P3 | Evidence worker test is 68 lines with basic mocking | `__tests__/workers/evidence-worker.test.ts` — minimal coverage of the most complex component. |

---

## 4. Prioritized Issue List

### P0 — Critical/Security (Must fix before any deployment)

| # | Issue | File | Fix Effort |
|---|-------|------|-----------|
| 9 | Sprint 8 migration not generated — all evidence/review/audit tables missing | `packages/db/drizzle/` | 10 min |

### P1 — High (Must fix before Phase 2 completion)

| # | Issue | File | Fix Effort |
|---|-------|------|-----------|
| 1 | Email verification codes never sent (TODO comment) | `routes/auth/register.ts:74` | 2h |
| 10 | Evidence submission frontend missing auth header | `apps/web/app/missions/[id]/submit/page.tsx:51` | 30 min |
| 11 | Peer review pending query N+1 | `routes/peer-reviews/index.ts:73-90` | 2h |
| 12 | Peer review vote + count increment not in transaction | `routes/peer-reviews/index.ts:213-226` | 1h |
| 13 | AI verification worker doesn't send actual image to Claude | `workers/evidence-verification.ts:153` | 2h |
| 19 | No brute-force protection on login | `routes/auth/login.ts` | 1h |
| 27 | Sprint 8 tests all mocked, no integration tests | `__tests__/evidence/` | 4h |
| 28 | No concurrent claim race condition test | `__tests__/missions/` | 2h |

### P2 — Medium (Fix soon, technical debt)

| # | Issue | File | Fix Effort |
|---|-------|------|-----------|
| 2 | Token balance decimal/integer mismatch | `routes/tokens/index.ts` + `schema/humans.ts` | 1h |
| 3 | Balance decimal vs amount integer inconsistency | Schema files | 1h |
| 5 | Geo-search SQL needs parameterization verification | `routes/missions/index.ts:285` | 30 min |
| 6 | No unique partial index on active claims | `schema/missionClaims.ts` | 30 min |
| 7 | Encryption key rotation not implemented | `lib/encryption-helpers.ts` | 4h |
| 14 | Evidence rate limit fails open | `routes/evidence/index.ts:34` | 15 min |
| 15 | Signed URL generation loop | `routes/evidence/index.ts:225` | 1h |
| 17 | Fraud detection never called | `lib/fraud-detection.ts` | 2h |
| 18 | Reputation not triggered by verification | `lib/reputation-engine.ts` | 2h |
| 20 | OAuth tokens stored in plaintext | `routes/auth/oauth.ts:197` | 2h |
| 22 | Admin role is simple string check | Multiple files | 4h |
| 23 | Peer review N+1 (same as #11) | - | - |
| 24 | 2-hop exclusion query expensive at scale | `lib/peer-assignment.ts` | 2h |
| 29 | No token balance edge case tests | Tests | 1h |
| 30 | No OAuth account linking test | Tests | 1h |

### P3 — Low (Nice to have)

| # | Issue | File | Fix Effort |
|---|-------|------|-----------|
| 4 | Session stores full JWT | `routes/auth/login.ts:61` | 1h |
| 8 | No claim count reconciliation job | - | 2h |
| 16 | Honeypot doesn't update claim status | `routes/evidence/index.ts` | 30 min |
| 25 | No query timeout | Config | 30 min |
| 26 | Signed URL batching | `routes/evidence/index.ts` | 1h |
| 31 | Evidence worker test minimal | Tests | 2h |

---

## 5. Recommendations

### Immediate (This Week)
1. **Run the migration** — `pnpm --filter @betterworld/db drizzle-kit generate && pnpm --filter @betterworld/db drizzle-kit migrate`. Verify all Sprint 8+9 tables are created.
2. **Fix evidence submission frontend auth** — use `humanApi` client or attach Bearer token.
3. **Fix AI verification worker** — add actual image content to Claude Vision API call (fetch from `contentUrl`, send as base64 image block).
4. **Add login rate limiting** — 5 attempts per email per 15 minutes.
5. **Implement email sending** — integrate Resend SDK for verification codes.

### Before Phase 2 Launch
6. **Write integration tests for Sprint 8** with real DB (post-migration).
7. **Wrap peer review vote in a transaction** — vote insert + count increment + verdict computation should be atomic.
8. **Fix peer review pending N+1** — use `NOT EXISTS` subquery or LEFT JOIN exclusion.
9. **Wire fraud detection into evidence pipeline** — call `checkVelocity` and statistical analysis after evidence submission.
10. **Normalize token types** — decide integer or decimal for balances, be consistent.

### Before Scale
11. Add EXPLAIN ANALYZE for peer assignment 2-hop query and optimize if needed.
12. Implement encryption key rotation with version tracking.
13. Add proper RBAC for admin operations.
14. Batch signed URL generation.

---

## 6. Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Migration fails or creates schema drift | Low | Critical | Test in staging first; compare schema files to migration output |
| Sprint 8 tests pass but real queries fail | Medium | High | Write integration tests post-migration with real DB |
| AI verification is metadata-only (no image) | High (currently true) | High | Fix worker to include image content in Claude API call |
| Evidence rate limit bypass (Redis down) | Low | Medium | Change to fail-closed for evidence submission |
| Login brute-force attack | Medium | High | Add per-email rate limiting |
| Email users can't verify accounts | High (currently true) | Medium | Integrate Resend email service |
| Peer review race condition on verdict | Medium | Medium | Wrap in transaction |
| Token balance drift from decimal/int mismatch | Low | Medium | Normalize to integer everywhere |
| Fraud detection never triggers | High (currently true) | Low (Phase 2 scale) | Wire into pipeline before scale |

---

## Appendix: Files Reviewed

**Schema**: `packages/db/src/schema/` — all 21 schema files  
**Routes**: `apps/api/src/routes/auth/` (6 files), `routes/tokens/`, `routes/missions/`, `routes/evidence/`, `routes/peer-reviews/`  
**Middleware**: `middleware/humanAuth.ts`, `middleware/rate-limit.ts`  
**Libraries**: `lib/encryption-helpers.ts`, `lib/reward-helpers.ts`, `lib/fraud-detection.ts`, `lib/peer-assignment.ts`, `lib/storage.ts`, `lib/evidence-helpers.ts`  
**Workers**: `workers/evidence-verification.ts`  
**Frontend**: `apps/web/app/dashboard/page.tsx`, `apps/web/app/missions/[id]/submit/page.tsx`  
**Tests**: All 19 test files in `apps/api/src/__tests__/`  
**Docs**: `docs/roadmap/phase2-human-in-the-loop.md`  
**Migrations**: `packages/db/drizzle/` — 6 migration files (0000-0005)
