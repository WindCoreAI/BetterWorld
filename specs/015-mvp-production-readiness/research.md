# Research: MVP Production Readiness

**Branch**: `015-mvp-production-readiness`
**Date**: 2026-02-13
**Purpose**: Resolve all unknowns from Technical Context before Phase 1 design

---

## R1: Guardrail Worker TSX Path Resolution

### Decision
Fix the dynamic import `.js` extension resolution in the guardrail worker by ensuring tsx properly resolves `.js` imports to `.ts` source files in development mode.

### Findings

**Root Cause**: `guardrail-worker.ts` (lines 227, 410) uses dynamic imports with `.js` extensions:
```typescript
const { routeSubmission } = await import("../services/traffic-router.js");
const { getFlag } = await import("../services/feature-flags.js");
```

In production (Docker), `tsc` compiles all `.ts` → `.js` and `node` runs compiled code — works fine. In development, `tsx watch` cannot resolve `.js` back to `.ts` for these dynamic imports, causing `ERR_MODULE_NOT_FOUND`.

**Fix Options**:
1. **Remove `.js` extension from dynamic imports** — tsx resolves bare specifiers to `.ts` files. Risk: may affect production build if `moduleResolution` is set to `nodenext`.
2. **Use `tsx --tsconfig` with path resolution** — configure tsx to use tsconfig-paths plugin. More complex but preserves ESM compliance.
3. **Convert dynamic imports to static imports** — eliminate the dynamic import pattern entirely. Simplest and most robust.

### Decision: Option 3 — Convert to static imports

The dynamic imports were used to lazily load `traffic-router` and `feature-flags`, but these are lightweight modules already in the worker's dependency graph. Converting to static imports eliminates the resolution problem entirely with zero performance impact.

### Alternatives Rejected
- Option 1: Fragile — may break under different `moduleResolution` settings
- Option 2: Over-engineered — adds configuration complexity for 2 imports

---

## R2: Privacy Pipeline — Face/Plate Detection Implementation

### Decision
Use `@vladmandic/face-api` for face detection and sharp-based contour analysis for license plate detection.

### Findings

**Current State**: `privacy-pipeline.ts` has a complete 3-stage architecture:
1. EXIF stripping (working via `sharp.rotate().withMetadata({})`)
2. Face detection (stub — returns `[]`, references `@vladmandic/face-api` in comments, task T066)
3. Plate detection (stub — returns `[]`, no library referenced)

**Blur implementation is complete** (`blurRegions()` at lines 99-143) — just needs detection results to blur.

**Feature flag**: `PRIVACY_BLUR_ENABLED` (default: `false`) controls stages 2-3.

**Face Detection Options**:

| Library | Accuracy | Speed | Size | Node.js Support |
|---------|----------|-------|------|-----------------|
| @vladmandic/face-api | High (MTCNN/SSD) | ~200ms/image | ~15MB models | Yes (tfjs-node) |
| face-api.js (original) | Medium | ~300ms/image | ~15MB models | Partial (unmaintained) |
| sharp + custom | Low | ~50ms | 0 extra | Yes but poor accuracy |
| Claude Vision API | Very high | ~1-2s | 0 local | Yes (already integrated) |

**Plate Detection Options**:

| Approach | Accuracy | Speed | Notes |
|----------|----------|-------|-------|
| sharp contour analysis | Medium (60-70%) | ~50ms | Detect rectangular regions with high contrast |
| OpenCV.js (WASM) | High (85%+) | ~300ms | Heavy WASM bundle, complex setup |
| Claude Vision API | Very high (95%+) | ~1-2s | Already in stack, costs per call |
| Tesseract.js + contour | Medium-high | ~500ms | OCR-based, complex pipeline |

### Decision: @vladmandic/face-api for faces, sharp contour + aspect ratio heuristics for plates

**Rationale**:
- face-api: Referenced in existing code (T066), mature TensorFlow.js-based library, works in Node.js, good accuracy
- Plates: sharp is already a dependency. Contour detection (find high-contrast rectangular regions with plate-like aspect ratios ~2:1-5:1) provides acceptable accuracy for MVP without adding heavy WASM dependencies. Route uncertain detections to manual review via the existing quarantine path.
- Both run locally — no additional API costs

**Model Storage**: Face detection models (~15MB) stored in project assets directory, loaded once at worker startup.

**Threshold Requirements** (from spec):
- Detect faces >= 50x50 pixels
- Require >= 70% detection confidence
- Blur radius minimum 20px (existing `blurRegions()` uses `max(10, width/3)` — sufficient)

---

## R3: Monitoring Stack Integration

### Decision
Add Sentry for error tracking; configure AlertManager receivers for existing alerts; add worker queue depth metrics to Prometheus endpoint.

### Findings

**What Already Exists** (strong foundation):
- Prometheus `/metrics` endpoint with process + platform metrics
- 6 Grafana alert rules in `config/alerts.yml` (guardrail latency, queue backlog, failure rate, DLQ, LLM errors, cache miss)
- 2 Grafana dashboards (guardrail evaluations, Phase 2 reputation)
- Pino structured logging throughout
- Health checks (`/healthz`, `/readyz`) with DB + Redis probes
- Request ID propagation (middleware/request-id.ts)
- Metrics aggregation worker (hourly cron)

**What's Missing** (from research):
- No error tracking service (Sentry/Rollbar)
- Alert rules exist but no receivers configured (no Slack/email delivery)
- No worker queue depth in Prometheus metrics
- No frontend error tracking

**Sentry Integration Plan**:
1. `@sentry/node` for API server — init in middleware, capture exceptions in error handler
2. `@sentry/nextjs` for frontend — wraps Next.js, captures client-side errors + performance
3. Both share same Sentry project with environment tags (production/staging)
4. PII scrubbing: Configure `beforeSend` to strip emails, tokens from breadcrumbs

**AlertManager Receivers**:
- Add webhook receiver to `config/alerts.yml` pointing to a Slack/Discord webhook
- Alternatively, Grafana Cloud alerting (if using Grafana Cloud) supports direct channel notifications

**Worker Queue Metrics**:
- Add BullMQ `queue.getJobCounts()` to the existing `/metrics` endpoint
- Metrics: `betterworld_worker_queue_waiting`, `betterworld_worker_queue_active`, `betterworld_worker_queue_failed`
- Per-queue labels for all 17 worker queues

### Decision: Sentry (free tier) + AlertManager webhook + queue metrics in /metrics

**Rationale**: Sentry is the industry standard, has Node.js + Next.js SDKs, free tier covers initial launch. AlertManager webhook is the simplest receiver configuration. Adding queue metrics to the existing endpoint keeps the monitoring stack unified.

---

## R4: Frontend Testing Infrastructure

### Decision
Add Vitest + @testing-library/react to `apps/web`. Create component tests for 4 critical flows. Add E2E golden-path test with Playwright.

### Findings

**Current State**:
- 1 test file exists: `apps/web/src/lib/__tests__/offline-queue.test.ts` (344 lines, uses Vitest)
- `vitest` is NOT declared in `apps/web/package.json` (imports work via hoisted dependency)
- No `vitest.config.ts` in apps/web
- No `@testing-library/react` or `jsdom`
- No `error.tsx` or `not-found.tsx` at app root
- Backend has 628 tests with comprehensive Vitest patterns (chainable mock builders, setup files)

**Required Test Dependencies**:
```
vitest, @vitest/ui, @testing-library/react, @testing-library/user-event,
@testing-library/jest-dom, jsdom
```

**Critical Components to Test** (from research):
1. `RegisterForm.tsx` — agent registration (8 steps)
2. `OrientationSteps.tsx` — human onboarding (5 steps)
3. `MissionClaimButton.tsx` — claim with loading/error states
4. `EvidenceSubmitForm.tsx` — file upload, GPS, validation
5. `humanApi.ts` — token refresh, POST retry safety

**E2E Approach**: Playwright (already compatible with Next.js 15, can test the full flow including API calls). Single golden-path test covering agent→problem→guardrail→human→claim→evidence→verify→tokens.

### Decision: Vitest + @testing-library/react for components, Playwright for E2E

**Rationale**: Vitest is already the project's test runner (backend uses it). @testing-library/react is the standard for React component testing. Playwright provides reliable E2E testing with built-in Next.js support.

---

## R5: PostGIS Migration for Mission Geo-Search

### Decision
Add a PostGIS `geography(Point, 4326)` column to the missions table and use `ST_DWithin()` for radius queries.

### Findings

**Current State**: `missions/index.ts` (lines 434-443) uses inline Haversine formula:
```sql
6371 * acos(cos(radians(?)) * cos(radians(lat)) * cos(radians(lng) - radians(?)) + sin(radians(?)) * sin(radians(lat))) <= ?
```

**PostGIS Already Available**: Used by shadow mode (evaluation affinity 100km via `ST_DWithin`), pattern aggregation (PostGIS clustering), and observations (GPS validation). The `geography(Point, 4326)` custom Drizzle type already exists in the codebase.

**Migration Plan**:
1. Add `location geography(Point, 4326)` column to missions table
2. Backfill from existing `requiredLatitude`/`requiredLongitude` columns
3. Add GIST index on the new column
4. Replace Haversine SQL with `ST_DWithin(location, ST_MakePoint(lng, lat)::geography, radius_meters)`
5. Keep `requiredLatitude`/`requiredLongitude` for backward compatibility (read from PostGIS column for queries)

### Decision: Add PostGIS column + GIST index, migrate queries

**Rationale**: PostGIS is already in the stack, the custom Drizzle type exists, and `ST_DWithin` with a GIST index drops geo-query time from 10-50ms to 1-5ms.

---

## R6: Debate Thread Depth — Recursive CTE vs Denormalized Column

### Decision
Use PostgreSQL recursive CTE for thread depth calculation.

### Findings

**Current Implementation**: `debates.routes.ts` (lines 27-43) walks `parentDebateId` chain sequentially:
```typescript
while (currentId) {
  depth++;
  const rows = await db.select(...).where(eq(debates.id, currentId)).limit(1);
  currentId = rows[0]?.parentDebateId ?? null;
}
```

**Options**:
1. **Recursive CTE** — single SQL query, no schema changes, handles arbitrary depth
2. **Denormalized `threadDepth` column** — zero-cost reads, but requires maintaining on insert/reparent

**Max Depth**: Hard-capped at 5 (line 21: `const MAX_THREAD_DEPTH = 5`). With max 5 levels, recursive CTE is fast enough (<5ms).

### Decision: Recursive CTE

**Rationale**: No schema change needed, max depth is capped at 5, and recursive CTEs are well-optimized in PostgreSQL for small trees. Avoids the maintenance burden of keeping a denormalized column in sync.

---

## R7: Worker Idempotency Strategy

### Decision
Use BullMQ `jobId` parameter with deterministic keys derived from submission IDs.

### Findings

**BullMQ Idempotency**: The `queue.add(name, data, { jobId })` option ensures that if a job with the same ID already exists, the add is silently skipped. This is the built-in deduplication mechanism.

**Affected Workers**:
1. **Guardrail → peer-consensus enqueue** (lines 293-311, 414-431): Use `jobId: \`peer-${contentType}-${contentId}\``
2. **Peer-consensus → assignValidators** (lines 89-97): Check for existing evaluations before assigning
3. **Rate-adjustment weekly** (lines 113-128): Use `jobId: \`rate-adj-${yearWeek}\`` where yearWeek is ISO week number
4. **Reputation decay batch** (per-human processing): Wrap per-human logic in try-catch (FR-012)

**Municipal Ingest DB Connection**: Replace `postgres(DATABASE_URL, ...)` with `getDb()` singleton (line 85-90).

### Decision: BullMQ jobId for enqueue deduplication + pre-check for assignment + try-catch for batch isolation

**Rationale**: Uses BullMQ's built-in deduplication — minimal code change, battle-tested, no external dependencies.
