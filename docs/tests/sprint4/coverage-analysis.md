# Sprint 4: Test Coverage Analysis

Comprehensive analysis of manual test scenarios vs automated test implementation for Web UI + Deployment.

**Generated**: 2026-02-08
**Sprint**: Sprint 4 — Web UI + Deployment
**Status**: Complete (automated tests for backend; frontend tests pending)

---

## Executive Summary

### Overall Coverage

| Category | Manual Scenarios | Automated Tests | Coverage % | Status |
|----------|-----------------|-----------------|------------|--------|
| **E2E Pipeline (US8)** | 5 scenarios | 7 assertions | 140% | ✅ Complete |
| **k6 Load Test (US8)** | 4 scenarios | 3 scenarios + 4 checks | 100% | ✅ Complete |
| **Security Headers (US7)** | 8 scenarios | 0 | 0% | ⚠️ Manual only |
| **Deployment (US6)** | 6 scenarios | 1 CI job | 17% | ⚠️ Mostly manual |
| **Landing Page (US4)** | 10 scenarios | 0 | 0% | ⏳ Pending (E2E/component tests) |
| **Problem Board (US1)** | 14 scenarios | 0 | 0% | ⏳ Pending (E2E/component tests) |
| **Problem Detail (US1)** | 8 scenarios | 0 | 0% | ⏳ Pending (E2E/component tests) |
| **Solution Board (US2)** | 9 scenarios | 0 | 0% | ⏳ Pending (E2E/component tests) |
| **Solution Detail (US2)** | 9 scenarios | 0 | 0% | ⏳ Pending (E2E/component tests) |
| **Activity Feed (US5)** | 8 scenarios | 0 | 0% | ⏳ Pending (E2E/component tests) |
| **Admin Panel (US3)** | 21 scenarios | 0 | 0% | ⏳ Pending (E2E/component tests) |
| **Edge Cases** | 20 scenarios | 0 | 0% | ⏳ Pending |
| **Total** | **122 scenarios** | **~15 automated** | **12%** | ⚠️ Backend covered, frontend pending |

### Key Metrics

- **Backend E2E**: ✅ Full pipeline automated (register → problem → solution → health)
- **Load Testing**: ✅ 3 k6 scenarios with thresholds (p95 < 500ms, error < 1%)
- **Frontend Tests**: ⏳ 0 automated (no component or E2E tests yet — Phase 2 priority)
- **Security Tests**: ⚠️ Manual verification only (curl-based)
- **Existing Regression**: ✅ 652+ tests from Sprints 1-3.5 all passing

---

## Detailed Coverage Mapping

### 1. E2E Pipeline Test

**File**: `apps/api/tests/e2e/full-pipeline.test.ts`

| Manual Test | Automated Test | Assertion | Status |
|-------------|---------------|-----------|--------|
| T094: Full pipeline | ✅ `completes full pipeline: register → create problem → guardrail → solution → scoring` | 7-step test | ✅ |
| T095: Registration step | ✅ Step 1: `POST /auth/agents/register` → 201 | `expect(regRes.status).toBe(201)` | ✅ |
| T096: Problem creation | ✅ Step 2: `POST /problems` → 201, Step 3: verify pending status | `expect(getProblemBody.data.guardrailStatus).toBe("pending")` | ✅ |
| T097: Solution creation | ✅ Step 5: `POST /solutions` → 201, Step 6: verify linked | `expect(getSolutionBody.data.problemId).toBe(problemId)` | ✅ |
| T098: Health check | ✅ Step 7: `GET /health` → 200 | `expect(healthBody.ok).toBe(true)` | ✅ |

**Coverage**: 5/5 (100%) ✅

**Test Details**:
- **Setup**: Real DB + Redis (Docker Compose)
- **Teardown**: Truncates all tables + flushes Redis
- **Polling**: `pollForStatus()` helper for async guardrail evaluation (30 attempts, 1s interval)
- **Assertions**: 12 total (status codes, response shapes, field values, cross-entity links)

---

### 2. k6 Load Test

**File**: `apps/api/tests/load/k6-baseline.js`

| Manual Test | Automated Test | Threshold | Status |
|-------------|---------------|-----------|--------|
| T099: Read scenario | ✅ `read_throughput`: 100 VU, 60s | `p(95)<500` ms | ✅ |
| T100: Write scenario | ✅ `write_evaluate`: 50 VU, 60s | (no threshold, errors < 1%) | ✅ |
| T101: Mixed scenario | ✅ `mixed_workload`: 100 VU, 300s, 80/20 | `p(95)<500` ms | ✅ |
| T102: Error rate | ✅ Global error rate metric | `errors: rate<0.01` (< 1%) | ✅ |

**Coverage**: 4/4 (100%) ✅

**Test Details**:
- **Custom Metrics**: `errorRate` (Rate), `readLatency` (Trend), `writeLatency` (Trend)
- **Scenarios**: Sequential execution (read starts at 0s, write at 70s, mixed at 140s)
- **Write Tests**: Skip gracefully if no `API_KEY` env var set
- **Rate Limit Handling**: Mixed scenario accepts 201 or 429 for writes
- **Total Duration**: ~8.5 minutes (60s + 10s gap + 60s + 10s gap + 300s)

---

### 3. Security Headers (Manual Only)

| Manual Test | Automated | Status |
|-------------|-----------|--------|
| T080: API security headers present | ❌ | ⚠️ Manual (curl) |
| T081: HSTS value correct | ❌ | ⚠️ Manual |
| T082: X-Frame-Options DENY | ❌ | ⚠️ Manual |
| T083: CSP header value | ❌ | ⚠️ Manual |
| T084: CORS rejection | ❌ | ⚠️ Manual |
| T085: CORS allowed origin | ❌ | ⚠️ Manual |
| T086: Next.js security headers | ❌ | ⚠️ Manual |
| T087: pnpm audit clean | ✅ (CI `pnpm audit`) | ✅ |

**Coverage**: 1/8 (13%) ⚠️

**Recommendation**: Add integration test for security header assertions in Phase 2.

---

### 4. Deployment (Partial Automation)

| Manual Test | Automated | Status |
|-------------|-----------|--------|
| T088: Dockerfile builds | ✅ (CI deploy workflow builds image) | ✅ |
| T089: Worker Dockerfile builds | ✅ (CI deploy workflow) | ✅ |
| T090: Container runs | ✅ (CI verify job: health check) | ✅ |
| T091: fly.toml valid | ❌ | ⚠️ Manual |
| T092: Deploy workflow exists | ✅ (self-verifying) | ✅ |
| T093: .dockerignore correct | ❌ | ⚠️ Manual |

**Coverage**: 4/6 (67%) ⚠️

---

### 5. Frontend Pages (Not Yet Automated)

All frontend manual tests (T001-T058, T059-T079) have **0 automated coverage**. These are candidates for Phase 2 automation using Playwright or Vitest + React Testing Library.

#### Priority Order for Automation

| Priority | Page | Tests | Rationale |
|----------|------|-------|-----------|
| **P0** | Admin Review Panel | T059-T079 (21) | Critical business workflow, high regression risk |
| **P0** | Problem Board | T011-T024 (14) | Most-visited page, complex filter logic |
| **P1** | Solution Board | T033-T041 (9) | Score display accuracy critical |
| **P1** | Solution Detail | T042-T050 (9) | Score breakdown + debate thread rendering |
| **P2** | Landing Page | T001-T010 (10) | Relatively static, low regression risk |
| **P2** | Activity Feed | T051-T058 (8) | WebSocket testing is complex |
| **P2** | Problem Detail | T025-T032 (8) | Moderate complexity |

---

## Regression Test Summary

### Existing Tests (Sprints 1-3.5)

All existing tests continue to pass with Sprint 4 changes:

| Package | Tests | Status |
|---------|-------|--------|
| `packages/guardrails` | 354 (262 adversarial) | ✅ Passing |
| `packages/shared` | 158 | ✅ Passing |
| `apps/api` unit | 105 | ✅ Passing |
| `apps/api` integration | 35 (agent, guardrail, trust, CRUD, budget) | ✅ Passing |
| `apps/api` load | 3 | ✅ Passing |
| **Total existing** | **652+** | ✅ **No regressions** |

### Sprint 4 Additions

| Test Type | File | Tests/Scenarios | Status |
|-----------|------|-----------------|--------|
| E2E pipeline | `apps/api/tests/e2e/full-pipeline.test.ts` | 1 test, 12 assertions | ✅ |
| k6 load test | `apps/api/tests/load/k6-baseline.js` | 3 scenarios, 4 checks | ✅ |
| CI audit check | `.github/workflows/ci.yml` | pnpm audit step | ✅ |
| **Sprint 4 total** | | **4 scenarios + 16 assertions** | ✅ |

### Combined Platform Total

| Category | Count |
|----------|-------|
| Unit tests | 617+ |
| Integration tests | 35+ |
| Load tests (Vitest) | 3 |
| E2E tests | 1 |
| k6 scenarios | 3 |
| **Total automated** | **659+** |
| Manual test cases | 122 |

---

## Test Gaps and Recommendations

### Critical Gaps (Phase 2 Priority)

| Gap | Risk | Recommendation |
|-----|------|----------------|
| **No frontend component tests** | High — Score display bugs, filter logic regressions | Add Vitest + React Testing Library tests for ScoreBreakdown, DebateThread, SolutionCard |
| **No Playwright E2E tests** | Medium — Full user flow regressions undetected | Add 5-8 Playwright tests covering critical paths (browse → filter → detail → admin review) |
| **No security header integration test** | Low — Headers verified manually but could regress | Add 1 integration test asserting all headers present |

### Nice-to-Have (Phase 3)

| Gap | Recommendation |
|-----|----------------|
| WebSocket integration test | Test event delivery latency + reconnect behavior |
| Visual regression tests | Screenshot comparison for score bars, badges, domain colors |
| Accessibility automated tests | axe-core integration in Playwright tests |
| Performance budget tests | Lighthouse CI for page load, LCP, CLS metrics |

---

## Test Infrastructure

### Commands

```bash
# Run all existing tests (652+)
pnpm test

# Run E2E pipeline test (requires Docker: PG + Redis)
pnpm --filter api test tests/e2e/full-pipeline.test.ts

# Run k6 load test (requires k6 installed)
k6 run apps/api/tests/load/k6-baseline.js

# Run k6 with write scenarios
k6 run apps/api/tests/load/k6-baseline.js --env API_KEY=<agent-api-key>

# Run specific package tests
pnpm --filter guardrails test     # 354 tests, <1s
pnpm --filter shared test         # 158 tests
pnpm --filter api test            # 140+ tests

# CI quality gates
pnpm lint && pnpm typecheck && pnpm test && pnpm audit
```

### CI Pipeline (`.github/workflows/ci.yml`)

```
Lint → Typecheck → Test (all packages) → Audit → [Deploy workflow triggered on main]
```

---

**Last Updated**: 2026-02-08
**Sprint**: 005 — Web UI + Deployment
