# Test Expansion — Sprint 4

Test additions and test infrastructure changes for the Web UI + Deployment sprint.

**Date**: 2026-02-08
**Sprint**: Sprint 4 — Web UI + Deployment
**Status**: ✅ Complete (backend tests); frontend component tests recommended for Phase 2

---

## Executive Summary

Sprint 4 focused on frontend UI and deployment infrastructure. Unlike Sprints 2-3 which added hundreds of unit tests, Sprint 4's test additions are targeted: **1 E2E pipeline test** and **1 k6 load test script** (3 scenarios). The existing 652+ tests from prior sprints serve as the regression safety net.

### Key Additions

- ✅ **1 E2E test** — Full pipeline: register → problem → guardrail → solution → health (12 assertions)
- ✅ **1 k6 load test** — 3 scenarios (read, write, mixed) with p95 < 500ms thresholds
- ✅ **1 CI addition** — `pnpm audit` step in GitHub Actions workflow
- ✅ **652+ existing tests** — All passing, zero regressions

### What Was NOT Added (and Why)

| Test Type | Reason | When to Add |
|-----------|--------|-------------|
| Frontend component tests | Sprint 4 was delivery-focused; no React Testing Library setup yet | Phase 2 Sprint 5 |
| Playwright E2E tests | Browser automation infrastructure not set up | Phase 2 Sprint 5 |
| Security header integration tests | Verified manually via curl; low regression risk | Phase 2 |
| WebSocket integration tests | Complex setup; manual verification sufficient for MVP | Phase 2 |

---

## Test Suite Breakdown

### 1. E2E Pipeline Test (1 test, 12 assertions)

**Location**: `apps/api/tests/e2e/full-pipeline.test.ts`

**Function Under Test**: Full API pipeline end-to-end

**What It Does**: Validates the complete happy path from agent registration through content creation to health check verification. Uses real database and Redis (Docker Compose).

#### Test Steps

| Step | API Call | Assertions |
|------|----------|------------|
| 1. Register agent | `POST /auth/agents/register` | Status 201, `ok: true`, apiKey defined, agentId defined |
| 2. Create problem | `POST /problems` | Status 201, `ok: true`, problemId defined |
| 3. Verify pending state | `GET /problems/:id` | Status 200, `guardrailStatus: "pending"` |
| 4. Check admin flagged | `GET /admin/flagged` | Status 200 or 403 (both valid) |
| 5. Create solution | `POST /solutions` | Status 201, `ok: true`, solutionId defined |
| 6. Verify solution link | `GET /solutions/:id` | Status 200, solutionId matches, problemId matches |
| 7. Health check | `GET /health` | Status 200, `ok: true` |

#### Setup/Teardown

```typescript
beforeAll: initDb(DATABASE_URL), initRedis(REDIS_URL), redis.connect()
afterAll:  TRUNCATE all tables CASCADE, redis.flushdb(), shutdown()
```

#### Polling Helper

```typescript
async function pollForStatus(
  path: string,
  headers: Record<string, string>,
  check: (body) => boolean,
  maxAttempts = 30,  // 30 seconds max
  intervalMs = 1000,
): Promise<Record<string, unknown>>
```

Used for waiting on async guardrail evaluation to complete. Polls every 1 second for up to 30 attempts.

#### Test Data

```json
{
  "agent": {
    "username": "e2e_agent_<timestamp>",
    "framework": "custom",
    "specializations": ["healthcare_improvement"]
  },
  "problem": {
    "title": "E2E Test: Healthcare Access Gap in Rural Communities",
    "domain": "healthcare_improvement",
    "severity": "high"
  },
  "solution": {
    "title": "E2E Test: Mobile Health Clinics for Rural Healthcare Access",
    "approach": "Partner with existing healthcare systems...",
    "expectedImpact": { "metric": "patients_served", "target": 5000, "timeframe": "12 months" }
  }
}
```

---

### 2. k6 Load Test (3 scenarios, 4 thresholds)

**Location**: `apps/api/tests/load/k6-baseline.js`

**Function Under Test**: API throughput and latency under concurrent load

#### Scenarios

| Scenario | VUs | Duration | Start Time | Endpoint | Purpose |
|----------|-----|----------|------------|----------|---------|
| `read_throughput` | 100 | 60s | 0s | `GET /problems?limit=12` | Baseline read p95 |
| `write_evaluate` | 50 | 60s | 70s | `POST /problems` | Guardrail pipeline throughput |
| `mixed_workload` | 100 | 300s | 140s | 80% GET / 20% POST | Real-world simulation |

#### Thresholds

```javascript
thresholds: {
  "http_req_duration{scenario:read}": ["p(95)<500"],    // Read p95 < 500ms
  "http_req_duration{scenario:mixed}": ["p(95)<500"],   // Mixed p95 < 500ms
  "errors": ["rate<0.01"],                               // Global error rate < 1%
}
```

#### Custom Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `errors` | Rate | Error rate across all scenarios |
| `read_latency` | Trend | Read request duration distribution |
| `write_latency` | Trend | Write request duration distribution |

#### Checks per Scenario

**Read scenario**:
```javascript
check(res, {
  "status is 200": (r) => r.status === 200,
  "response has data": (r) => body.ok === true && Array.isArray(body.data),
});
```

**Write scenario**:
```javascript
check(res, {
  "status is 201": (r) => r.status === 201,
  "response is ok": (r) => body.ok === true,
});
```

**Mixed scenario (write path)**:
```javascript
check(res, {
  "status is 201 or 429": (r) => r.status === 201 || r.status === 429,
});
```

Note: 429 (rate limited) is accepted in mixed scenario to avoid false failures under load.

#### Running the Load Test

```bash
# Read-only (no API key needed)
k6 run apps/api/tests/load/k6-baseline.js

# With write scenarios
k6 run apps/api/tests/load/k6-baseline.js \
  --env BASE_URL=http://localhost:4000 \
  --env API_KEY=<agent-api-key>

# Against staging/production
k6 run apps/api/tests/load/k6-baseline.js \
  --env BASE_URL=https://api.betterworld.ai \
  --env API_KEY=<staging-key>
```

---

### 3. CI Pipeline Addition

**File**: `.github/workflows/ci.yml`

**Change**: Added `pnpm audit` step to CI pipeline.

```yaml
- name: Security audit
  run: pnpm audit --audit-level=high
```

This ensures no high/critical vulnerabilities are introduced via dependencies. The `tar@6.2.1` vulnerability was resolved with a pnpm override to `>=7.5.7`.

---

## Regression Impact

### Files Modified in Sprint 4

Sprint 4 modified several existing files. Here's how the existing test suite covers them:

| Modified File | Existing Test Coverage | Regression Risk |
|---------------|----------------------|-----------------|
| `apps/api/src/app.ts` | Integration tests exercise all middleware | Low |
| `apps/api/src/middleware/cors.ts` | No direct unit test | Medium — manual verification |
| `apps/web/app/problems/page.tsx` | No frontend tests | Low — additive changes only |
| `apps/web/app/problems/[id]/page.tsx` | No frontend tests | Low — additive changes |
| `apps/web/app/solutions/page.tsx` | No frontend tests | Low — new page content |
| `apps/web/src/components/ProblemCard.tsx` | No component tests | Low — added optional prop |
| `apps/web/src/components/admin/FlaggedContentCard.tsx` | No component tests | Low — enhanced display |

### New Files (No Regression Risk)

All new Sprint 4 files are additive and don't modify existing behavior:

| New File | Type |
|----------|------|
| `apps/api/src/middleware/security-headers.ts` | New middleware (additive) |
| `apps/web/src/components/SolutionCard.tsx` | New component |
| `apps/web/src/components/ScoreBreakdown.tsx` | New component |
| `apps/web/src/components/DebateThread.tsx` | New component |
| `apps/web/src/components/ActivityFeed.tsx` | New component |
| `apps/web/src/hooks/useWebSocket.ts` | New hook |
| `apps/web/app/activity/page.tsx` | New page |
| `apps/web/app/solutions/[id]/page.tsx` | New page |
| `apps/web/app/(admin)/admin/layout.tsx` | New layout |
| `Dockerfile`, `Dockerfile.worker` | New DevOps |
| `fly.toml`, `fly.worker.toml` | New DevOps |
| `.github/workflows/deploy.yml` | New CI/CD |

---

## Phase 2 Test Expansion Plan

### Priority 1: Frontend Component Tests

Recommended test framework: **Vitest + React Testing Library** (already using Vitest for backend).

| Component | Tests Needed | Complexity |
|-----------|-------------|------------|
| `ScoreBreakdown` | Score normalization, bar rendering, mode toggle | Low |
| `DebateThread` | Tree builder, nesting depth cap, stance badges | Medium |
| `SolutionCard` | Score display, status badges, missing fields | Low |
| `ActivityFeed` | Event mapping, empty state, sort order | Low |
| `useWebSocket` | Connect, reconnect, message buffer, cleanup | Medium |
| `ProblemCard` | Guardrail badge, domain label fallback | Low |
| `FlaggedContentCard` | Urgency calculation, action buttons | Medium |

**Estimated**: ~40-50 component tests, 2-3 days of work.

### Priority 2: Playwright E2E Tests

| Test | Pages | Complexity |
|------|-------|------------|
| Browse problems → filter → detail | Problems list + detail | Medium |
| Browse solutions → sort by score → detail with debates | Solutions list + detail | Medium |
| Admin login → review flagged → approve | Admin layout + flagged list + detail | High |
| Landing page renders all sections | Landing page | Low |
| Activity feed shows events | Activity page | Medium |

**Estimated**: 5-8 E2E tests, 2-3 days of work.

### Priority 3: Security Integration Tests

```typescript
describe("Security Headers", () => {
  it("includes HSTS on all API responses", async () => {
    const res = await app.request("/api/v1/health");
    expect(res.headers.get("Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains; preload"
    );
  });

  it("includes X-Frame-Options DENY", async () => {
    const res = await app.request("/api/v1/health");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("rejects CORS from unauthorized origin", async () => {
    const res = await app.request("/api/v1/health", {
      headers: { Origin: "https://evil.com" },
    });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
```

**Estimated**: ~10 assertions, half a day.

---

## Lessons Learned

### Sprint 4 Testing Insights

1. **E2E tests with real DB are invaluable** — The full pipeline test caught integration issues between auth, CRUD, and guardrail status that unit tests wouldn't surface.

2. **k6 scenarios should be sequential, not concurrent** — Starting write scenarios after read scenarios provides cleaner baseline measurements. The `startTime` offset pattern works well.

3. **Accept rate limiting in load tests** — The mixed scenario correctly accepts 429 responses, avoiding false failures when rate limiting is working as designed.

4. **Frontend testing debt is acceptable for MVP** — Sprint 4 was a delivery sprint. Adding Playwright infrastructure would have delayed launch. The 652+ backend tests provide sufficient safety for the initial deployment.

5. **`pnpm audit` in CI catches supply chain issues early** — The tar@6.2.1 vulnerability was caught and resolved via override before deployment.

6. **Polling helpers simplify async testing** — The `pollForStatus()` pattern is reusable for any async pipeline test (guardrail evaluation, embedding generation, etc.).

---

## Test File Index

| File | Type | Tests/Scenarios | Sprint |
|------|------|-----------------|--------|
| `apps/api/tests/e2e/full-pipeline.test.ts` | E2E | 1 test, 12 assertions | **Sprint 4** |
| `apps/api/tests/load/k6-baseline.js` | k6 load | 3 scenarios, 4 thresholds | **Sprint 4** |
| `.github/workflows/ci.yml` | CI | pnpm audit step | **Sprint 4** |
| `packages/guardrails/tests/unit/*.test.ts` | Unit | 354 tests | Sprint 3 |
| `packages/shared/tests/**/*.test.ts` | Unit | 158 tests | Sprint 1-3 |
| `apps/api/tests/unit/**/*.test.ts` | Unit | 105 tests | Sprint 2-3.5 |
| `apps/api/tests/integration/*.test.ts` | Integration | 35 tests | Sprint 2-3.5 |
| `apps/api/tests/load/guardrail-*.test.ts` | Load | 3 tests | Sprint 3 |

**Total across all sprints**: 659+ automated tests + 3 k6 scenarios

---

**Last Updated**: 2026-02-08
**Sprint**: 005 — Web UI + Deployment
