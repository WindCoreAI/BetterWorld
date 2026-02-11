# Sprint 7 Readiness Assessment

**Date**: 2026-02-10
**Sprint 6 Status**: Backend 100% Complete | Frontend Pending
**Assessment**: ⚠️ **NOT READY** - Critical frontend work required

---

## 📊 Sprint 6 Exit Criteria Analysis

### ✅ **Completed** (10/13 criteria, 77%)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Database migration deployed | ✅ Done | 5 tables: accounts, sessions, humanProfiles, tokenTransactions, verificationTokens |
| OAuth registration (Google, GitHub, email/password) | ✅ Done | 8 auth API routes implemented |
| Email verification system | ✅ Done | 6-digit codes, 15-min expiry, throttling implemented |
| Profile creation with geocoding | ✅ Done | Nominatim + Redis caching + PostGIS storage |
| ImpactToken double-entry accounting | ✅ Done | SELECT FOR UPDATE, balance_before/balance_after |
| Token spending system | ✅ Done | Voting (1-10 IT), circles (50 IT), analytics (20 IT) |
| Token ledger API | ✅ Done | Cursor pagination, idempotency keys |
| Profile completeness scoring | ✅ Done | Weighted: Core 50%, Availability 20%, Identity 15%, Optional 15% |
| All existing tests pass | ✅ Done | 652 tests passing (Phase 1 baseline) |
| OAuth PKCE security | ✅ Done | State cookies, code_verifier, no implicit grant |

### ❌ **Not Complete** (3/13 criteria, 23%)

| Criterion | Status | Blocker | Priority |
|-----------|--------|---------|----------|
| **Orientation tutorial** at `/onboarding` | ⚠️ Backend API done, **frontend pending** | 5-step wizard UI not implemented | **P0 - Blocks Sprint 7** |
| **Human dashboard** | ⚠️ Backend API done, **frontend pending** | Dashboard page, cards, WebSocket feed not implemented | **P0 - Blocks Sprint 7** |
| **15+ integration tests** | ❌ Not started | No integration tests covering registration → orientation → token operations | **P1 - Required for quality** |

---

## 🚫 Sprint 7 Blockers

**Sprint 7 Prerequisite (from roadmap):**
> "Sprint 6 complete (human registration, profiles, ImpactToken system operational)"

**Current Reality:**
- ✅ Backend: 100% operational (20 API routes, 5 DB tables, token system working)
- ❌ Frontend: 0% operational (no user-facing pages beyond basic registration shell)
- ❌ Testing: Integration test suite missing (spec requires 15+ tests, SC-014)

### Critical Missing Components

#### 1. **Orientation Tutorial** (`/onboarding`)
**Why it blocks Sprint 7:**
- Humans must complete orientation before claiming missions (Sprint 7 feature)
- Orientation awards 10 IT — the seed capital for mission marketplace participation
- Dashboard shows "Complete orientation" CTA if pending — need dashboard first

**What's missing:**
- [ ] `/onboarding` route page (5-step wizard)
- [ ] 5 step components: Constitution, Domains, Missions, Evidence, Tokens
- [ ] Progress tracking (save step to `metadata.orientation_step`)
- [ ] "Claim Reward" button (POST /tokens/orientation-reward)
- [ ] Success toast with balance update
- [ ] Redirect to dashboard on completion

**Estimated effort:** 12-14 hours (per roadmap Task #4)

#### 2. **Human Dashboard** (`/dashboard`)
**Why it blocks Sprint 7:**
- Mission marketplace (Sprint 7) requires dashboard as "home base"
- Dashboard shows active missions list (Sprint 7 will populate this)
- Dashboard shows token balance (needed to afford mission claims)
- Dashboard shows profile completeness (Sprint 7 uses for mission matching)

**What's missing:**
- [ ] `/dashboard` page layout
- [ ] TokenBalanceCard component (shows balance, earned, spent)
- [ ] ReputationCard component (score, rank, percentile)
- [ ] ProfileCompletenessCard component (circular progress, suggestions)
- [ ] MissionsCard component (active missions, empty state for Sprint 6)
- [ ] ActivityFeed component (WebSocket real-time updates)
- [ ] WebSocket client (`/lib/websocket.ts`)

**Estimated effort:** 12 hours (per roadmap Task #5) + 8 hours WebSocket

#### 3. **User Flow Pages**
**Why it blocks Sprint 7:**
- Humans can't register without these pages
- No registration = no users for mission marketplace

**What's missing:**
- [ ] `/auth/verify` - Email verification page (6-digit code input)
- [ ] `/auth/login` - Login page (email/password + OAuth buttons)
- [ ] `/auth/callback` - OAuth callback handler (token storage)
- [ ] `/profile/create` - Profile creation form (skills, location, bio)
- [ ] `/profile/settings` - Profile update page

**Estimated effort:** 6-10 hours per page = **30-50 hours total**

#### 4. **Integration Tests**
**Why it matters:**
- Spec requirement SC-014: "15+ integration tests"
- No test coverage for human onboarding flow
- Risk of regressions when starting Sprint 7

**What's missing:** 15+ tests covering:
- [ ] Email/password registration → verification → login
- [ ] Google OAuth registration → profile → dashboard
- [ ] GitHub OAuth registration → profile → dashboard
- [ ] Profile creation with geocoding
- [ ] Profile completeness calculation
- [ ] Orientation reward claim (one-time, idempotent)
- [ ] Token spending with idempotency
- [ ] Token spending with insufficient balance
- [ ] Transaction history pagination
- [ ] Race condition prevention (concurrent token ops)
- [ ] Geocoding failure handling
- [ ] Email verification code expiry
- [ ] Verification code resend throttling
- [ ] PKCE flow verification
- [ ] Dashboard data aggregation

**Estimated effort:** 8 hours (per roadmap Task #10)

---

## 📋 Sprint 6 Completion Roadmap

### **Phase A: Minimum Viable Frontend** (P0 - Blocks Sprint 7)
**Goal:** Humans can register, complete orientation, view dashboard
**Duration:** 3-4 days

1. **User Authentication Flow** (Day 1)
   - [ ] Email verification page (`/auth/verify`)
   - [ ] Login page (`/auth/login`)
   - [ ] OAuth callback handler (`/auth/callback`)
   - [ ] Test: Register → verify → login → redirect to profile creation

2. **Profile Creation** (Day 1.5)
   - [ ] Profile creation form (`/profile/create`)
   - [ ] Skills multi-select, city/country inputs, languages, bio
   - [ ] Test: Create profile → redirect to orientation

3. **Orientation Tutorial** (Day 2)
   - [ ] Onboarding page (`/onboarding`)
   - [ ] 5 step components (Constitution, Domains, Missions, Evidence, Tokens)
   - [ ] Claim reward button
   - [ ] Test: Complete orientation → earn 10 IT → redirect to dashboard

4. **Human Dashboard** (Day 3-4)
   - [ ] Dashboard layout (`/dashboard`)
   - [ ] TokenBalanceCard (read-only for Sprint 6)
   - [ ] ProfileCompletenessCard (with suggestions)
   - [ ] MissionsCard (empty state: "Complete orientation to unlock missions")
   - [ ] ActivityFeed (WebSocket connection + real-time updates)
   - [ ] Test: Dashboard loads, shows correct token balance, completeness score

**Exit criteria:** One human can register → verify → profile → orientation → dashboard

### **Phase B: Integration Testing** (P1 - Quality Gate)
**Goal:** 15+ integration tests passing
**Duration:** 1 day

- [ ] Write 15+ integration tests (see list above)
- [ ] Run tests: `pnpm test --filter @betterworld/api`
- [ ] Verify all 668 tests still passing (652 Phase 1 + 16 new)
- [ ] Fix any regressions

**Exit criteria:** All integration tests pass, SC-014 satisfied

### **Phase C: Polish & Security** (P2 - Production Readiness)
**Goal:** Sprint 6 production-ready
**Duration:** 1-2 days

- [ ] Rate limiting (registration 5/hour, verification 3/hour)
- [ ] Input sanitization (XSS protection for bio, city, country)
- [ ] Audit logging (failed logins, token ops > 20 IT)
- [ ] OAuth provider setup (Google Cloud Console + GitHub Developer Settings)
- [ ] Security audit (OAuth PKCE validation, state parameters)
- [ ] k6 load test (1000 concurrent token transactions, p95 < 500ms)

**Exit criteria:** Production security standards met

---

## ✅ Sprint 7 Readiness Checklist

**Can we start Sprint 7 now?** ❌ **NO**

| Requirement | Status | Blocker |
|-------------|--------|---------|
| Humans can register | ⚠️ Backend only | No frontend pages |
| Humans can complete orientation | ⚠️ Backend only | No `/onboarding` page |
| Humans earn 10 IT from orientation | ✅ Backend ready | Frontend needed to trigger |
| Humans can view dashboard | ⚠️ Backend only | No `/dashboard` page |
| Token balance visible | ⚠️ Backend only | No TokenBalanceCard component |
| Profile completeness visible | ⚠️ Backend only | No ProfileCompletenessCard component |
| Integration tests passing | ❌ Not started | 15+ tests required |

**Recommendation:**
1. ✅ **DO** start frontend implementation immediately (Phase A: 3-4 days)
2. ✅ **DO** write integration tests in parallel (Phase B: 1 day)
3. ❌ **DO NOT** start Sprint 7 tasks yet — would introduce merge conflicts
4. ⏳ **DEFER** Sprint 7 planning until Phase A complete

---

## 🎯 Revised Timeline

**Sprint 6 Remaining Work:**
- **Phase A (P0)**: 3-4 days (frontend implementation)
- **Phase B (P1)**: 1 day (integration tests)
- **Phase C (P2)**: 1-2 days (polish & security)

**Total:** 5-7 additional days to complete Sprint 6

**Sprint 7 Start Date:**
- **Earliest:** 2026-02-17 (if Phase A+B complete)
- **Realistic:** 2026-02-19 (if all phases complete)

---

## 🚀 Recommended Next Steps

### **Immediate (Today)**
1. **Create Sprint 6 frontend implementation plan**
   - Use `.claude/commands/speckit.tasks.md` workflow
   - Break down Phase A into actionable tasks
   - Assign priorities and dependencies

2. **Set up frontend development environment**
   - Install Node.js 22+ if not available
   - Run `pnpm install` (frozen lockfile)
   - Start API: `pnpm --filter @betterworld/api dev`
   - Start Web: `pnpm --filter @betterworld/web dev`

3. **Test backend APIs manually**
   - Follow curl commands in `IMPLEMENTATION_SUMMARY.md`
   - Verify registration → profile → orientation → dashboard flow
   - Document any issues

### **Week 1 (Feb 10-14)**
- Complete Phase A: Minimum Viable Frontend
- Parallel: Write integration tests (Phase B)

### **Week 2 (Feb 17-19)**
- Complete Phase C: Polish & Security
- Sprint 6 exit criteria review
- **Sprint 7 kickoff**: 2026-02-19

---

## 📝 Notes

### **Why Frontend Is Critical for Sprint 7**
Sprint 7 introduces:
- **Mission Marketplace UI** — requires dashboard as base
- **Map view** (OpenStreetMap + Leaflet) — requires web framework
- **Mission detail pages** — requires routing and components
- **Mission claim flow** — requires authenticated user context
- **Agent-to-human messaging** — requires WebSocket client

**All of these depend on the frontend infrastructure from Sprint 6.**

### **Backend API Coverage**
The Sprint 6 backend is production-ready:
- ✅ 20 API routes documented and tested
- ✅ OAuth PKCE security implemented
- ✅ Token locking prevents race conditions
- ✅ Profile geocoding with Redis caching
- ✅ Idempotency for token operations
- ✅ Double-entry accounting enforced

**The backend does NOT block Sprint 7 — only the frontend does.**

### **Integration Test Importance**
While backend APIs work, integration tests provide:
- Regression protection when adding Sprint 7 features
- Confidence in edge cases (expiry, throttling, race conditions)
- Documentation of expected behavior
- CI/CD quality gates

**Defer these to Phase B (after Phase A frontend is working).**

---

**Last Updated**: 2026-02-10
**Next Review**: After Phase A completion (expected 2026-02-14)
