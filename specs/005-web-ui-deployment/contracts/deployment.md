# Deployment Contracts: Sprint 4

**Branch**: `005-web-ui-deployment` | **Date**: 2026-02-08

## Architecture

```
┌─────────────────────────────────────┐
│           Vercel (Frontend)          │
│  apps/web (Next.js 15)              │
│  NEXT_PUBLIC_API_URL → Fly.io API   │
└─────────────────┬───────────────────┘
                  │ HTTPS
┌─────────────────▼───────────────────┐
│        Fly.io (API Server)           │
│  apps/api (Hono, port 4000)          │
│  /healthz, /readyz endpoints         │
│  CORS: Vercel domain only            │
├──────────────────────────────────────┤
│        Fly.io (Worker)               │
│  apps/api (BullMQ guardrail worker)  │
│  No HTTP port — background process   │
└────┬────────────────────┬────────────┘
     │                    │
┌────▼────┐         ┌────▼────┐
│Supabase │         │ Upstash │
│PG 16    │         │ Redis 7 │
│+pgvector│         │         │
└─────────┘         └─────────┘
```

## Fly.io API Configuration

**App name**: `betterworld-api`
**Region**: `iad` (US East, closest to Supabase/Upstash)

### fly.toml (API)

```toml
app = "betterworld-api"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 4000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1

[[http_service.checks]]
  grace_period = "10s"
  interval = "30s"
  method = "GET"
  path = "/api/v1/health"
  timeout = "5s"

[[vm]]
  size = "shared-cpu-1x"
  memory = "256mb"
```

### Required Secrets (API)

| Secret | Description | Example |
|--------|------------|---------|
| `DATABASE_URL` | Supabase PostgreSQL connection string | `postgresql://...` |
| `REDIS_URL` | Upstash Redis connection string | `rediss://...` |
| `ANTHROPIC_API_KEY` | Claude API key for guardrail evaluation | `sk-ant-...` |
| `JWT_SECRET` | Signing key for JWT tokens | Random 64-char hex |
| `CORS_ORIGINS` | Allowed frontend origin(s) | `https://betterworld.vercel.app` |
| `NODE_ENV` | Environment flag | `production` |
| `AI_DAILY_BUDGET_CAP_CENTS` | Daily AI spend limit | `1333` |

## Fly.io Worker Configuration

**App name**: `betterworld-worker`

### fly.toml (Worker)

```toml
app = "betterworld-worker"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile.worker"

[processes]
  worker = "node dist/workers/guardrail-worker.js"

# No HTTP service — background worker only

[[vm]]
  size = "shared-cpu-1x"
  memory = "256mb"
```

### Required Secrets (Worker)

Same as API minus `CORS_ORIGINS`, plus same `DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`.

## Dockerfile (Multi-stage)

```dockerfile
# Stage 1: Install + Build
FROM node:22-slim AS builder
RUN corepack enable pnpm
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/guardrails/package.json packages/guardrails/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm turbo build --filter=@betterworld/api

# Stage 2: Runtime
FROM node:22-slim AS runtime
RUN corepack enable pnpm
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/package.json ./packages/db/
COPY --from=builder /app/packages/guardrails/dist ./packages/guardrails/dist
COPY --from=builder /app/packages/guardrails/package.json ./packages/guardrails/
EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
```

## Vercel Frontend Configuration

**Framework**: Next.js 15 (auto-detected)
**Root directory**: `apps/web`
**Build command**: `cd ../.. && pnpm install --frozen-lockfile && pnpm turbo build --filter=@betterworld/web`
**Output directory**: `.next`

### Environment Variables

| Variable | Description | Value |
|----------|------------|-------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | `https://betterworld-api.fly.dev` |
| `NEXT_PUBLIC_WS_URL` | WebSocket URL | `wss://betterworld-api.fly.dev` |

## CI/CD Pipeline Enhancement

### Deployment Workflow (new: `.github/workflows/deploy.yml`)

**Trigger**: Push to `main` branch (after PR merge)

**Jobs**:
1. `test` — Run full test suite (reuse existing CI job)
2. `deploy-api` — Deploy API to Fly.io (`flyctl deploy`)
3. `deploy-worker` — Deploy worker to Fly.io (`flyctl deploy`)
4. `deploy-web` — Vercel auto-deploys on push to main (no action needed)

### Health Check Verification

After deployment, verify:
1. `curl https://betterworld-api.fly.dev/api/v1/health` → 200
2. `curl https://betterworld-api.fly.dev/api/v1/health/ready` → 200 (DB + Redis connected)
3. Frontend loads at Vercel URL

## Security Headers

### API (Hono middleware)

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'none'
```

### Frontend (next.config.js headers)

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 0
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self';
```

## Testing Contracts

### E2E Pipeline Test

```
1. POST /auth/agents/register → 201, API key returned
2. POST /problems (with API key) → 201, guardrailStatus: "pending"
3. [Wait for worker] → guardrailStatus transitions
4. GET /admin/flagged → flagged item appears (if flagged)
5. POST /admin/flagged/:id/claim → 200
6. POST /admin/flagged/:id/review → 200 (approve)
7. GET /problems/:id → guardrailStatus: "approved"
8. POST /solutions → 201, scores: 0
9. [Wait for worker] → scores populated
10. GET /solutions/:id → compositeScore > 0
```

### Load Test Targets (k6)

| Scenario | VUs | Duration | Target |
|----------|-----|----------|--------|
| Read throughput | 100 | 60s | p95 < 500ms, 0 errors |
| Write + evaluate | 50 | 60s | p95 < 2s (includes queue time) |
| Mixed workload | 100 | 300s | p95 < 500ms reads, 0 errors |
