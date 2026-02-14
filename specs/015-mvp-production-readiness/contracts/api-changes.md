# API Contract Changes: MVP Production Readiness

**Branch**: `015-mvp-production-readiness`
**Date**: 2026-02-13

This sprint introduces **no new endpoints**. All changes are behavioral fixes to existing endpoints. The API contract (request/response shapes) remains backward-compatible.

---

## Endpoint Behavioral Changes

### 1. GET `/api/v1/evaluations/pending` (FR-003)

**Change**: Internal query optimization (N+1 → batch). No contract change.

**Before**: N sequential DB queries for N evaluations
**After**: 1-3 batch queries using `IN (...)` clause

**Response shape**: Unchanged
```json
{
  "ok": true,
  "data": [
    {
      "id": "uuid",
      "submissionId": "uuid",
      "submissionType": "problem|solution|debate",
      "submission": { "title": "...", "description": "...", "domain": "..." },
      "rubric": { ... },
      "assignedAt": "ISO8601",
      "expiresAt": "ISO8601"
    }
  ],
  "requestId": "uuid"
}
```

---

### 2. GET `/api/v1/solutions/:solutionId/debates` (FR-004, FR-006)

**Change**: Thread depth calculation uses recursive CTE instead of loop. Pagination filter moved to WHERE clause.

**Response shape**: Unchanged. Pagination behavior becomes more accurate (filter-before-fetch instead of filter-after-fetch).

---

### 3. GET `/api/v1/missions` (FR-005)

**Change**: Geo-filtering uses PostGIS `ST_DWithin` instead of Haversine formula.

**Query parameters**: Unchanged (`lat`, `lng`, `radius` still accepted)
**Response shape**: Unchanged
**Behavioral difference**: Results may differ slightly due to PostGIS using a spheroid model (more accurate) vs Haversine (spherical approximation). Differences are negligible (<0.5%) for the radius values used.

---

### 4. All Endpoints Using `optionalAuth()` (FR-027)

**Change**: Malformed/invalid tokens now return 401 instead of falling through to public role.

**Affected endpoints** (those using `optionalAuth()`):
- Routes that accept both authenticated and unauthenticated access

**Before**: Invalid token → silently treated as public
**After**: Invalid token → `401 Unauthorized` with error envelope

```json
{
  "ok": false,
  "error": { "code": "UNAUTHORIZED", "message": "Invalid authentication token" },
  "requestId": "uuid"
}
```

**Note**: Missing token (no `Authorization` header) still falls through to public role — only malformed/expired tokens are rejected.

---

### 5. Admin Routes (FR-030)

**Change**: Route paths de-overlapped. Some admin endpoints move to distinct sub-paths.

| Current Path | New Path | Route Group |
|--------------|----------|-------------|
| `/api/v1/admin/*` (core) | `/api/v1/admin/*` (unchanged) | adminRoutes |
| `/api/v1/admin/*` (phase3) | `/api/v1/admin/phase3/*` | phase3AdminRoutes |
| `/api/v1/admin/*` (shadow) | `/api/v1/admin/shadow/*` | shadowAdminRoutes |

**Breaking change**: Admin route paths change for Phase 3 and Shadow Mode admin endpoints. These are internal admin routes with no external consumers, so this is safe.

---

### 6. GET `/api/v1/metrics` (FR-025)

**Change**: Additional worker queue metrics added.

**New metrics** (Prometheus text format):
```
# HELP betterworld_worker_queue_waiting Number of waiting jobs per queue
# TYPE betterworld_worker_queue_waiting gauge
betterworld_worker_queue_waiting{queue="guardrail-evaluation"} 0
betterworld_worker_queue_waiting{queue="evidence-verification"} 2
...

# HELP betterworld_worker_queue_active Number of active jobs per queue
# TYPE betterworld_worker_queue_active gauge
betterworld_worker_queue_active{queue="guardrail-evaluation"} 1
...

# HELP betterworld_worker_queue_failed Number of failed jobs per queue
# TYPE betterworld_worker_queue_failed gauge
betterworld_worker_queue_failed{queue="guardrail-evaluation"} 0
...
```

---

### 7. Health Endpoints — Envelope Fix (P3)

**`GET /healthz`**: Add `data` wrapper
```json
{ "ok": true, "data": { "status": "ok" }, "requestId": "uuid" }
```

**`GET /readyz`**: Add `ok` field
```json
{ "ok": true, "data": { "status": "ready", "checks": { ... } }, "requestId": "uuid" }
```

---

## No New Endpoints

This sprint creates no new API routes. All changes are:
- Query optimizations (transparent to consumers)
- Auth behavior tightening (returns 401 instead of silently downgrading)
- Route path corrections (admin sub-paths)
- Additional Prometheus metrics (additive)
- Health endpoint envelope alignment (additive)
