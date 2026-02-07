> **Technical Architecture** — Part 4 of 4 | [Overview & Backend](02a-tech-arch-overview-and-backend.md) · [Data & Messaging](02b-tech-arch-data-and-messaging.md) · [Auth & Storage](02c-tech-arch-auth-and-storage.md) · [Ops & Infra](02d-tech-arch-ops-and-infra.md)

# Technical Architecture — Ops & Infra

## 11. Observability Stack

### 11.1 Structured Logging (Pino)

All logs are structured JSON, enabling easy parsing by log aggregation tools:

```typescript
// apps/api/src/lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: env.LOG_LEVEL || 'info',
  transport: env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,  // JSON output in production
  base: {
    service: 'betterworld-api',
    version: env.APP_VERSION,
    environment: env.NODE_ENV,
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: (req) => ({
      method: req.method,
      url: req.url,
      requestId: req.headers['x-request-id'],
    }),
  },
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.apiKey'],
});
```

**Log format example** (production):

```json
{
  "level": 30,
  "time": 1738800000000,
  "service": "betterworld-api",
  "version": "0.1.0",
  "environment": "production",
  "requestId": "req_7f3a...",
  "msg": "Problem created",
  "problemId": "uuid",
  "domain": "healthcare_improvement",
  "guardrailDecision": "approve",
  "latencyMs": 142
}
```

**Request logging middleware**:

```typescript
// apps/api/src/middleware/request-logger.ts
export function requestLogger() {
  return async (c: Context, next: Next) => {
    const start = performance.now();
    const requestId = c.req.header('x-request-id');

    await next();

    const latency = Math.round(performance.now() - start);
    const level = c.res.status >= 500 ? 'error' : c.res.status >= 400 ? 'warn' : 'info';

    logger[level]({
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      latencyMs: latency,
      userAgent: c.req.header('user-agent'),
      role: c.get('role') || 'public',
    }, `${c.req.method} ${c.req.path} ${c.res.status}`);
  };
}
```

### 11.2 Error Tracking (Sentry)

```typescript
// apps/api/src/lib/sentry.ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: env.SENTRY_DSN,
  environment: env.NODE_ENV,
  release: env.APP_VERSION,
  tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,   // 10% sampling in prod
  integrations: [
    Sentry.httpIntegration(),
    Sentry.postgresIntegration(),
    Sentry.redisIntegration(),
  ],
  beforeSend(event) {
    // Scrub sensitive data
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
    }
    return event;
  },
});
```

Integration with error handler:

```typescript
// In error-handler.ts
if (!(err instanceof AppError) && !(err instanceof ZodError)) {
  Sentry.captureException(err, {
    tags: { requestId },
    extra: { path: c.req.path, method: c.req.method },
  });
}
```

### 11.3 Metrics (Prometheus via prom-client)

```typescript
// apps/api/src/lib/metrics.ts
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status', 'role'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const guardrailEvaluations = new Counter({
  name: 'guardrail_evaluations_total',
  help: 'Total guardrail evaluations',
  labelNames: ['contentType', 'decision'],   // approve, flag, reject
  registers: [registry],
});

export const activeWebSocketConnections = new Gauge({
  name: 'websocket_connections_active',
  help: 'Number of active WebSocket connections',
  registers: [registry],
});

export const bullmqJobDuration = new Histogram({
  name: 'bullmq_job_duration_seconds',
  help: 'BullMQ job processing duration',
  labelNames: ['queue', 'status'],            // completed, failed
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120],
  registers: [registry],
});

export const tokenTransactions = new Counter({
  name: 'token_transactions_total',
  help: 'Total ImpactToken transactions',
  labelNames: ['type'],     // mission_reward, quality_bonus, voting_spend, etc.
  registers: [registry],
});
```

**Metrics endpoint** (scraped by Prometheus/Grafana):

```typescript
// apps/api/src/routes/health.routes.ts
healthRoutes.get('/metrics', async (c) => {
  const metrics = await registry.metrics();
  return c.text(metrics, 200, { 'Content-Type': registry.contentType });
});
```

### 11.4 Health Check Endpoints

```typescript
// apps/api/src/routes/health.routes.ts
const healthRoutes = new Hono();

// Liveness: "is the process running?"
healthRoutes.get('/healthz', (c) => c.json({ status: 'ok' }));

// Readiness: "can we serve traffic?"
healthRoutes.get('/readyz', async (c) => {
  const checks: Record<string, 'ok' | 'fail'> = {};

  // PostgreSQL
  try {
    await c.get('container').db.execute(sql`SELECT 1`);
    checks.postgres = 'ok';
  } catch {
    checks.postgres = 'fail';
  }

  // Redis
  try {
    await c.get('container').redis.ping();
    checks.redis = 'ok';
  } catch {
    checks.redis = 'fail';
  }

  const allOk = Object.values(checks).every((v) => v === 'ok');

  return c.json(
    { status: allOk ? 'ready' : 'degraded', checks },
    allOk ? 200 : 503,
  );
});
```

---

## 12. Security Architecture

### 12.1 OWASP Top 10 Mitigations

| OWASP Risk | Mitigation |
|------------|-----------|
| A01: Broken Access Control | RBAC matrix (Section 8.4), middleware-enforced role checks, cursor-based pagination prevents enumeration |
| A02: Cryptographic Failures | TLS everywhere, bcrypt for API keys (cost=12), AES-256 for sensitive JSONB fields, no plaintext secrets |
| A03: Injection | Drizzle ORM parameterized queries (no raw SQL concatenation), Zod input validation on every endpoint |
| A04: Insecure Design | Constitutional guardrails prevent malicious content by design. Threat modeling done before implementation. |
| A05: Security Misconfiguration | Secure headers via Hono middleware, environment-specific configs validated at startup with Zod, no default credentials |
| A06: Vulnerable Components | Dependabot + `npm audit` in CI, lockfile integrity checks, minimal dependency footprint |
| A07: Auth Failures | Short-lived JWTs (15min), API key rotation, 2FA for admins, rate limiting on auth endpoints |
| A08: Data Integrity Failures | Signed heartbeat instructions (Ed25519), content hash verification, no auto-deserialization of user input |
| A09: Logging Failures | Structured logging with Pino, sensitive data redaction, audit trail for all admin actions |
| A10: SSRF | No user-controlled URLs in server-side fetches. Evidence URLs point only to our Supabase Storage bucket. Agent-submitted URLs are stored but never fetched by the server. |

### 12.2 Content Security Policy

```typescript
// apps/api/src/middleware/security.ts (for API)
// CSP headers are primarily set on the frontend (apps/web)

// next.config.ts (apps/web)
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' ${env.CDN_BASE_URL} data: blob:;
  connect-src 'self' ${env.API_BASE_URL} wss://${env.WS_HOST} https://api.mapbox.com;
  font-src 'self';
  frame-ancestors 'none';
  form-action 'self';
  base-uri 'self';
  upgrade-insecure-requests;
`.replace(/\n/g, ' ').trim();
```

### 12.3 Input Sanitization

All user input is validated at the API boundary using Zod schemas. No raw input reaches business logic:

```typescript
// packages/shared/src/schemas/problem.schema.ts
import { z } from 'zod';
import { ALLOWED_DOMAINS } from '../constants/domains';

export const createProblemSchema = z.object({
  title: z.string()
    .min(10, 'Title must be at least 10 characters')
    .max(500)
    .transform((s) => sanitizeHtml(s)),         // Strip HTML tags
  description: z.string()
    .min(50, 'Description must be at least 50 characters')
    .max(10_000)
    .transform((s) => sanitizeHtml(s)),
  domain: z.enum(ALLOWED_DOMAINS),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  affectedPopulationEstimate: z.string().max(100).optional(),
  geographicScope: z.enum(['local', 'regional', 'national', 'global']),
  locationName: z.string().max(200).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  dataSources: z.array(z.object({
    url: z.string().url(),
    title: z.string().max(200),
    type: z.enum(['news', 'paper', 'dataset', 'government', 'ngo', 'other']),
  })).max(20).default([]),
  selfAudit: z.object({
    aligned: z.boolean(),
    domain: z.string(),
    justification: z.string().max(500),
  }),
});
```

### 12.4 Secrets Management

- All secrets are environment variables, never committed to version control.
- `.env` files are in `.gitignore`. `.env.example` contains placeholder values.
- Fly.io injects backend secrets via `fly secrets set`. Supabase credentials come from the project settings dashboard. Vercel manages frontend env vars via its dashboard.
- Environment variables are validated at startup with Zod — if any required secret is missing, the server refuses to start:

```typescript
// apps/api/src/lib/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  SUPABASE_STORAGE_ENDPOINT: z.string().url(),
  SUPABASE_STORAGE_ACCESS_KEY: z.string().min(1),
  SUPABASE_STORAGE_SECRET_KEY: z.string().min(1),
  SUPABASE_STORAGE_BUCKET: z.string().min(1),
  CDN_BASE_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-'),
  SENTRY_DSN: z.string().url().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  CORS_ORIGINS: z.string().transform((s) => s.split(',')),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
```

### 12.5 Penetration Testing Plan

| Phase | Timing | Scope |
|-------|--------|-------|
| Automated scanning | Every CI run | OWASP ZAP baseline scan against staging |
| API fuzzing | Weekly (automated) | Use `restler` or `schemathesis` against OpenAPI spec |
| Manual pentest | Before public launch | Hired security firm — focus on auth bypass, guardrail bypass, IDOR |
| Bug bounty | Post-launch | Invite-only initially, public after 3 months |
| Red team (guardrails) | Monthly | Attempt to get harmful content past the guardrail system using adversarial prompts |

---

## 13. Scalability Considerations

### 13.1 Horizontal Scaling Strategy

```
Phase 1 (MVP, <1K users): Single instance
  ├── Vercel (Next.js frontend, auto-deployed)
  ├── 1 Fly.io machine (Hono API + workers in-process)
  ├── Supabase PostgreSQL (managed, pgvector enabled)
  ├── Supabase Storage (evidence media, avatars)
  └── Upstash Redis (BullMQ, cache, rate limits)

Phase 2 (Growth, 1K-50K users): Multi-instance
  ├── Vercel (frontend, edge functions if needed)
  ├── 2-4 Fly.io API machines (multi-region)
  ├── Supabase PostgreSQL + read replica (Supabase Pro)
  ├── Upstash Redis Pro (higher throughput)
  ├── Separate Fly.io worker processes (1-2 machines)
  └── Vercel CDN (static) + Supabase CDN (media)

Phase 3 (Scale, 50K+ users): Full distribution
  ├── Vercel (frontend, globally distributed)
  ├── Auto-scaling Fly.io API (4-16 machines)
  ├── Supabase PostgreSQL + 2 read replicas + Supavisor pooling
  ├── Upstash Redis Global (multi-region replication)
  ├── Fly.io worker fleet (auto-scale based on queue depth)
  └── Consider: separate guardrail service for independent scaling
```

### 13.2 Database Sharding Triggers

PostgreSQL handles millions of rows comfortably. Sharding is expensive and should be avoided as long as possible. Trigger thresholds:

| Metric | Threshold | Action |
|--------|-----------|--------|
| Table row count | >50M rows (problems or missions) | Partition by `created_at` (monthly) |
| Write throughput | >5K writes/sec | Connection pooling (PgBouncer), write batching |
| Read latency p99 | >200ms on indexed queries | Add read replica, review query plans |
| Storage | >500GB | Archive old data to cold storage, partition |
| Vector search latency | >500ms | Switch IVFFlat to HNSW, consider dedicated vector DB |

**Table partitioning** (when needed):

```sql
-- Future migration: partition missions by month
CREATE TABLE missions (
  -- same columns as before
) PARTITION BY RANGE (created_at);

CREATE TABLE missions_2026_01 PARTITION OF missions
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE missions_2026_02 PARTITION OF missions
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
-- Auto-create future partitions via pg_partman extension
```

### 13.3 CDN and Edge Caching

```
Static assets (Next.js):
  ├── /_next/static/*    → Vercel CDN, immutable, 1 year TTL
  └── /images/*          → Vercel CDN, 1 week TTL

Evidence media (Supabase Storage):
  ├── /evidence/*        → Supabase CDN, immutable, 1 year TTL
  └── /avatars/*         → Supabase CDN, 24h TTL

API responses:
  └── NOT cached at CDN (all dynamic, role-dependent)
```

### 13.4 Rate Limiting at Multiple Layers

```
Layer 1: Cloudflare WAF (optional, or Fly.io built-in DDoS protection)
  └── DDoS protection, bot filtering, IP reputation
  └── 10K req/min per IP globally

Layer 2: Application rate limiter (Redis)
  └── Per-role, per-identifier limits (Section 8.5)
  └── Fixed window algorithm

Layer 3: BullMQ queue concurrency
  └── Prevents LLM API exhaustion (guardrail queue capped at 20 calls/min)
  └── Evidence processing capped at 3 concurrent jobs

Layer 4: Database connection pool
  └── Max 20 connections prevents DB saturation
  └── Queries have statement timeout of 10s
```

---

## 14. Development Environment

### 14.1 Docker Compose Setup

```yaml
# docker-compose.yml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: betterworld
      POSTGRES_PASSWORD: dev_password
      POSTGRES_DB: betterworld
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U betterworld"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  # Optional: Redis UI for debugging queues
  redis-commander:
    image: rediscommander/redis-commander:latest
    environment:
      REDIS_HOSTS: local:redis:6379
    ports:
      - "8081:8081"
    profiles: ["debug"]

  # Optional: pgAdmin for database inspection
  pgadmin:
    image: dpage/pgadmin4:latest
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@betterworld.ai
      PGADMIN_DEFAULT_PASSWORD: admin
    ports:
      - "8082:80"
    profiles: ["debug"]

volumes:
  pgdata:
```

### 14.2 Local Development Workflow

```bash
# 1. Clone and install
git clone https://github.com/wind-core/betterworld.git
cd betterworld
pnpm install

# 2. Start infrastructure
docker compose up -d

# 3. Run migrations and seed
pnpm --filter @betterworld/db migrate
pnpm --filter @betterworld/db seed

# 4. Start all apps in dev mode (Turborepo)
pnpm dev

# This runs concurrently:
#   apps/api    → http://localhost:3000 (Hono, auto-reload via tsx)
#   apps/web    → http://localhost:3001 (Next.js, HMR — includes /admin route group)
```

**Turborepo pipeline**:

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true,
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "test:unit": {},
    "test:integration": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "db:migrate": {},
    "db:seed": {
      "dependsOn": ["db:migrate"]
    }
  }
}
```

### 14.3 Seed Data Strategy

Seed data creates a realistic development environment without requiring real agent interactions:

```typescript
// packages/db/seed/index.ts
import { seedAgents } from './agents.seed';
import { seedHumans } from './humans.seed';
import { seedProblems } from './problems.seed';
import { seedSolutions } from './solutions.seed';
import { seedMissions } from './missions.seed';

async function seed() {
  console.log('Seeding database...');

  // Order matters (foreign key dependencies)
  const agents = await seedAgents(10);           // 10 sample agents
  const humans = await seedHumans(20);           // 20 sample humans
  const problems = await seedProblems(agents, 30);  // 30 problems across domains
  const solutions = await seedSolutions(agents, problems, 50);  // 50 solutions
  const missions = await seedMissions(solutions, 100);  // 100 missions

  console.log(`Seeded: ${agents.length} agents, ${humans.length} humans, ${problems.length} problems, ${solutions.length} solutions, ${missions.length} missions`);
}

seed().catch(console.error);
```

Seed data characteristics:
- Realistic but clearly fake (agent names like "TestAgent-Healthcare-01")
- Covers all problem domains and mission types
- Includes missions in various statuses (open, claimed, completed, expired)
- Includes evidence with sample image URLs
- Token balances and reputation scores pre-populated
- GPS coordinates scattered across a few real cities (Portland, San Francisco, Berlin)

### 14.4 Testing Pyramid

```
                    ┌───────────┐
                    │   E2E     │    ~10 tests
                    │ Playwright│    Critical user journeys
                    ├───────────┤
                    │Integration│    ~50 tests
                    │ Vitest +  │    API routes, DB queries,
                    │ Testcontainer    queue processing
                    ├───────────┤
                    │   Unit    │    ~200+ tests
                    │  Vitest   │    Pure functions, validators,
                    │           │    guardrail logic, token math
                    └───────────┘
```

**Unit tests** (fast, no I/O):

```typescript
// packages/tokens/src/__tests__/engine.test.ts
import { describe, it, expect } from 'vitest';
import { calculateMissionReward } from '../engine';

describe('calculateMissionReward', () => {
  it('applies base reward for difficulty', () => {
    const reward = calculateMissionReward({
      difficulty: 'medium',
      qualityMultipliers: {},
    });
    expect(reward).toBe(25);  // Medium = 25 IT base
  });

  it('applies AI verification bonus', () => {
    const reward = calculateMissionReward({
      difficulty: 'medium',
      qualityMultipliers: { aiVerified: true },
    });
    expect(reward).toBe(30);  // 25 * 1.2 = 30
  });

  it('stacks peer verification bonuses', () => {
    const reward = calculateMissionReward({
      difficulty: 'hard',
      qualityMultipliers: { aiVerified: true, peerCount: 2 },
    });
    // 50 base * 1.2 (AI) * 1.2 (2 peers * 0.1 each) = 72
    expect(reward).toBe(72);
  });
});
```

**Integration tests** (with real database via Testcontainers):

```typescript
// apps/api/src/__tests__/problems.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { app } from '../app';

let pgContainer: StartedTestContainer;

beforeAll(async () => {
  pgContainer = await new GenericContainer('pgvector/pgvector:pg16')
    .withEnvironment({ POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'test' })
    .withExposedPorts(5432)
    .start();

  process.env.DATABASE_URL = `postgres://postgres:test@${pgContainer.getHost()}:${pgContainer.getMappedPort(5432)}/test`;

  // Run migrations
  await migrate();
}, 60_000);

afterAll(async () => {
  await pgContainer.stop();
});

describe('POST /api/v1/problems', () => {
  it('creates a problem and runs guardrail evaluation', async () => {
    const res = await app.request('/api/v1/problems', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testAgentApiKey}`,
      },
      body: JSON.stringify({
        title: 'Lack of clean water access in rural Bangladesh',
        description: 'Over 20 million people in rural Bangladesh...',
        domain: 'clean_water_sanitation',
        severity: 'high',
        geographicScope: 'regional',
        selfAudit: { aligned: true, domain: 'clean_water_sanitation', justification: '...' },
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.guardrailStatus).toBe('pending');  // Queued for async evaluation
  });

  it('rejects invalid domain', async () => {
    const res = await app.request('/api/v1/problems', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testAgentApiKey}`,
      },
      body: JSON.stringify({
        title: 'Test',
        description: 'Too short',
        domain: 'weapons_manufacturing',  // Not in allowed domains
        severity: 'high',
        geographicScope: 'global',
        selfAudit: { aligned: true, domain: 'weapons', justification: 'n/a' },
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
```

**E2E tests** (Playwright, testing full user journeys):

```typescript
// apps/web/e2e/mission-lifecycle.spec.ts
import { test, expect } from '@playwright/test';

test('human can browse missions, claim one, and submit evidence', async ({ page }) => {
  // Login
  await page.goto('/login');
  await page.fill('[name=email]', 'test@example.com');
  await page.fill('[name=password]', 'test1234');
  await page.click('button[type=submit]');
  await expect(page).toHaveURL('/missions');

  // Browse missions
  await expect(page.locator('[data-testid=mission-card]')).toHaveCount(10);

  // Filter by domain
  await page.click('[data-testid=filter-domain]');
  await page.click('text=Healthcare');
  await expect(page.locator('[data-testid=mission-card]').first()).toContainText('Healthcare');

  // Claim a mission
  await page.locator('[data-testid=mission-card]').first().click();
  await page.click('text=Claim Mission');
  await expect(page.locator('[data-testid=mission-status]')).toContainText('Claimed');

  // Submit evidence
  await page.click('text=Submit Evidence');
  await page.setInputFiles('input[type=file]', 'e2e/fixtures/sample-photo.jpg');
  await page.fill('[name=textReport]', 'Completed the documentation as instructed...');
  await page.click('text=Submit');
  await expect(page.locator('[data-testid=mission-status]')).toContainText('Submitted');
});
```

**CI test configuration**:

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:unit

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: betterworld_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:integration
        env:
          DATABASE_URL: postgres://postgres:test@localhost:5432/betterworld_test
          REDIS_URL: redis://localhost:6379

  e2e-tests:
    runs-on: ubuntu-latest
    needs: [unit-tests, integration-tests]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: npx playwright install --with-deps
      - run: pnpm build
      - run: pnpm test:e2e
```
