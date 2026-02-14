# Quickstart: MVP Production Readiness

**Branch**: `015-mvp-production-readiness`
**Date**: 2026-02-13

## Prerequisites

- Node.js 22+
- pnpm 9+
- Docker (for PostgreSQL + PostGIS + Redis)
- Supabase CLI or local PostgreSQL 16 with PostGIS extension

## Setup

```bash
# 1. Switch to feature branch
git checkout 015-mvp-production-readiness

# 2. Install dependencies (includes new packages)
pnpm install

# 3. Start local services
docker compose up -d  # PostgreSQL + Redis

# 4. Run migrations (includes new PostGIS migration)
pnpm --filter @betterworld/db migrate

# 5. Verify face detection models (new)
# Models ship with @vladmandic/face-api in node_modules
# Verify: node scripts/download-face-models.js
# For Docker builds, Dockerfile.worker runs: node scripts/download-face-models.js --copy
```

## New Dependencies

| Package | Where | Purpose |
|---------|-------|---------|
| `@vladmandic/face-api` | apps/api | Face detection in privacy pipeline |
| `@sentry/node` | apps/api | Error tracking (server-side) |
| `@sentry/nextjs` | apps/web | Error tracking (client-side) |
| `vitest` | apps/web | Frontend unit test runner |
| `@testing-library/react` | apps/web | React component testing |
| `@testing-library/user-event` | apps/web | User interaction simulation |
| `@testing-library/jest-dom` | apps/web | DOM assertion matchers |
| `jsdom` | apps/web | DOM environment for tests |
| `@playwright/test` | root | E2E testing |

## New Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `SENTRY_DSN` | Production only | — | Sentry error tracking DSN |
| `SENTRY_AUTH_TOKEN` | CI only | — | Sentry source map upload |
| `ALERT_WEBHOOK_URL` | Production only | — | Slack/Discord webhook for alerts |
| `CORS_ALLOWED_ORIGINS` | Production | — | Explicit origin whitelist (replaces CORS_ORIGINS) |

## Verification

```bash
# Run all backend tests (existing + new)
pnpm --filter @betterworld/api test

# Run frontend tests (new)
pnpm --filter @betterworld/web test

# Run E2E golden-path test
pnpm exec playwright test e2e/golden-path.test.ts

# Verify guardrail worker starts without tsx errors
pnpm --filter @betterworld/api dev:worker

# Verify privacy pipeline with test image
# The privacy pipeline test suite includes face/plate detection integration tests

# Check CI pipeline
# Coverage thresholds are now enforced — build fails if coverage drops
```

## Key Changes by Area

### Guardrail Worker (FR-001/002)
- Dynamic imports converted to static imports in `guardrail-worker.ts`
- Worker starts without tsx path errors in development mode
- Test: Submit content via agent API → verify automatic Layer B evaluation

### Performance (FR-003/004/005/006)
- Evaluations: batch fetch with `inArray()` instead of N+1
- Debates: recursive CTE for thread depth, filter in WHERE for pagination
- Missions: PostGIS `ST_DWithin()` with GIST index for geo-search
- Test: Load evaluations endpoint with 100+ pending → verify <500ms

### Worker Reliability (FR-007/008/009/010/011/012)
- BullMQ `jobId` for idempotent enqueues on guardrail/peer-consensus/fraud-scoring/rate-adjustment
- Privacy worker: quarantine on dead-letter
- Municipal ingest: uses `getDb()` singleton
- All queues: retention policies set
- Batch workers: per-item try-catch

### Frontend (FR-013/014/015/016/017/018/019/023)
- `humanApi.ts`: POST/PUT/PATCH/DELETE requests not auto-retried after token refresh
- Evidence form: uses `humanFetch()` wrapper
- Missions page: error state with retry button
- Disputes page: credentials included
- New: `error.tsx` (global error boundary), `not-found.tsx` (custom 404)
- Dispute form: balance check before display
- Dashboard: onboarding redirect if incomplete

### Privacy Pipeline (FR-020/021/022)
- Face detection: `@vladmandic/face-api` with SSD MobileNet v1 model
- Plate detection: sharp contour analysis with aspect ratio heuristics
- Model path: checks `assets/models/` (Docker), local `node_modules`, root `node_modules`
- Privacy worker uses `getFlag()` service for proper Zod-default fallback
- Feature flag `PRIVACY_BLUR_ENABLED` defaults to `true`. Rollback: `SET feature:PRIVACY_BLUR_ENABLED false` in Redis to bypass face/plate detection
- Dockerfile.worker bakes models via `node scripts/download-face-models.js --copy`

### Monitoring (FR-024/025/026)
- Sentry SDK initialized in API error handler and Next.js instrumentation
- Worker queue metrics added to Prometheus endpoint
- Alert receivers configured in `config/alerts.yml`

### Security (FR-027/028/029/030)
- `optionalAuth()`: rejects invalid tokens (returns 401)
- CORS: validates against explicit whitelist constant
- Admin rate routes: email replaced with admin ID in logs
- Admin routes: de-overlapped to `/admin`, `/admin/phase3`, `/admin/shadow`

### Testing (FR-031/032/033/034/035)
- Frontend: Vitest config + test setup + component tests for 4 critical flows
- E2E: Playwright golden-path test with CI job (Postgres + Redis services, Playwright browser install, artifact upload on failure)
- CI: coverage thresholds enforced, `pnpm audit` added, E2E job added
- Pino v8 → v9 aligned in guardrails package
