> **DevOps & Infrastructure** — Part 4 of 4 | [Dev Environment](06a-devops-dev-environment.md) · [CI/CD Pipeline](06b-devops-cicd-pipeline.md) · [Infra & Monitoring](06c-devops-infra-and-monitoring.md) · [Security & Deployment](06d-devops-security-deploy-and-ops.md)

# DevOps & Infrastructure — Security, Deployment & Operations

## 6. Security Operations

### 6.1 Secret Management

**Environment-specific approach:**

| Environment | Secret Storage | Access Pattern |
|-------------|---------------|----------------|
| Local development | `.env` file (git-ignored) | Loaded by Docker Compose and `dotenv` |
| CI (GitHub Actions) | GitHub Secrets + Environments | Injected as `${{ secrets.* }}` |
| Staging (Railway) | Railway service variables | Injected into container at runtime |
| Production (Railway/Fly) | Railway/Fly secrets | Injected into container at runtime |
| Production (AWS/GCP) | AWS Secrets Manager / GCP Secret Manager | SDK-based fetch at startup |

**Rules:**

1. Never store secrets in version control. `.env` is in `.gitignore`.
2. Never log secrets. Pino redact configuration strips `authorization` headers and key fields.
3. Rotate secrets on a schedule: JWT secret (quarterly), API keys (on demand), database password (annually or on compromise).
4. Use separate secret values per environment. Never share production secrets with staging.

**Automated Secret Rotation**:

Secret rotation is automated via GitHub Actions for keys that support programmatic rotation. See `docs/cross-functional/04-security-compliance.md` Section 6.2 for the full rotation workflow.

| Secret | Rotation Method | Schedule | Grace Period |
|--------|----------------|----------|:------------:|
| JWT signing key | GitHub Actions → Railway CLI → rolling restart | Quarterly (cron: `0 3 1 */3 *`) | 24 hours (dual-key verification) |
| R2 access keys | GitHub Actions → Cloudflare API → Railway CLI | Quarterly | 1 hour |
| Database password | Manual (coordinated with provider) | Annually + on compromise | Connection pool drain (5 min) |
| Redis password | Manual (coordinated with provider) | Annually | Connection reconnect (immediate) |

**JWT dual-key rotation flow**:
1. New secret set as `JWT_SECRET`, old secret set as `JWT_SECRET_PREVIOUS`
2. Token verification tries `JWT_SECRET` first, falls back to `JWT_SECRET_PREVIOUS`
3. After 24 hours, `JWT_SECRET_PREVIOUS` is cleared
4. All tokens signed with old secret expire naturally (access: 15 min, refresh: 7 days)

**Rotation alert**: Slack notification sent on every rotation with success/failure status.

### 6.2 SSL/TLS Configuration

| Layer | TLS | Provider |
|-------|-----|----------|
| Client to CDN | TLS 1.3 | Cloudflare (automatic, free) |
| CDN to origin | TLS 1.2+ | Cloudflare Full (Strict) with origin cert |
| API to database | TLS required | `?sslmode=require` in connection string |
| API to Redis | TLS required | `rediss://` protocol in production |
| Internal service-to-service | WireGuard mesh (Fly.io) or Railway private networking | Platform-provided |

**Cloudflare settings:**

- Minimum TLS version: 1.2
- HSTS enabled (max-age=31536000, includeSubDomains)
- Opportunistic Encryption: On
- TLS 1.3: Enabled
- Authenticated Origin Pulls: Enabled

### 6.3 Dependency Vulnerability Scanning

```yaml
# .github/workflows/security.yml
name: Security Scan

on:
  schedule:
    - cron: "0 8 * * 1"  # Weekly on Monday 8:00 UTC
  pull_request:
    branches: [main]

jobs:
  dependency-audit:
    name: Dependency Audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: "9"

      - uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run pnpm audit
        run: pnpm audit --audit-level=high
        continue-on-error: true

      - name: Run Snyk test
        uses: snyk/actions/node@master
        continue-on-error: true
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high --all-projects

  container-scan:
    name: Container Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build API image
        run: docker build -f apps/api/Dockerfile -t betterworld-api:scan .

      - name: Run Trivy scanner
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: "betterworld-api:scan"
          format: "sarif"
          output: "trivy-results.sarif"
          severity: "HIGH,CRITICAL"

      - name: Upload Trivy scan results
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: "trivy-results.sarif"
```

### 6.4 Rate Limiting Configuration (Redis-based)

```typescript
// apps/api/src/middleware/rate-limit.ts
import { Context, Next } from "hono";
import { Redis } from "ioredis";

interface RateLimitConfig {
  windowMs: number;     // Time window in milliseconds
  maxRequests: number;  // Max requests per window
  keyPrefix: string;    // Redis key prefix
}

const LIMITS: Record<string, RateLimitConfig> = {
  // Agent endpoints: 60 req/min per agent
  agent: {
    windowMs: 60_000,
    maxRequests: 60,
    keyPrefix: "rl:agent",
  },
  // Human endpoints: 120 req/min per user
  human: {
    windowMs: 60_000,
    maxRequests: 120,
    keyPrefix: "rl:human",
  },
  // Auth endpoints: 10 req/min per IP (brute-force protection)
  auth: {
    windowMs: 60_000,
    maxRequests: 10,
    keyPrefix: "rl:auth",
  },
  // Public endpoints: 300 req/min per IP
  public: {
    windowMs: 60_000,
    maxRequests: 300,
    keyPrefix: "rl:public",
  },
  // Guardrail-heavy endpoints: 20 req/min per agent (cost control)
  content_create: {
    windowMs: 60_000,
    maxRequests: 20,
    keyPrefix: "rl:content",
  },
};

export function rateLimiter(limitName: keyof typeof LIMITS) {
  const config = LIMITS[limitName];

  return async (c: Context, next: Next) => {
    const redis: Redis = c.get("redis");
    const identifier = c.get("agentId") || c.get("userId") || c.req.header("x-forwarded-for") || "unknown";
    const key = `${config.keyPrefix}:${identifier}`;

    const multi = redis.multi();
    multi.incr(key);
    multi.pttl(key);
    const results = await multi.exec();

    const count = results![0][1] as number;
    const ttl = results![1][1] as number;

    if (ttl === -1) {
      await redis.pexpire(key, config.windowMs);
    }

    c.header("X-RateLimit-Limit", String(config.maxRequests));
    c.header("X-RateLimit-Remaining", String(Math.max(0, config.maxRequests - count)));
    c.header("X-RateLimit-Reset", String(Math.ceil(Date.now() / 1000) + Math.ceil((ttl > 0 ? ttl : config.windowMs) / 1000)));

    if (count > config.maxRequests) {
      return c.json(
        { error: "Rate limit exceeded", retryAfter: Math.ceil((ttl > 0 ? ttl : config.windowMs) / 1000) },
        429
      );
    }

    return next();
  };
}
```

### 6.5 WAF Considerations (Cloudflare)

| Rule | Purpose | Action |
|------|---------|--------|
| OWASP Core Ruleset | Block SQLi, XSS, RCE, LFI | Block |
| Bot Management | Detect and challenge automated abuse | Challenge |
| Rate Limiting (L7) | Global rate limit: 1000 req/min per IP | Block |
| Geo-blocking | Optional: restrict to target countries during pilot | Block |
| Managed challenge | Suspicious traffic patterns | JS challenge |
| Custom rule: block `/admin` from non-allowlisted IPs | Protect admin dashboard | Block |

---

## 7. Deployment Strategy

### 7.1 Rolling Deployments

Railway and Fly.io both support rolling deployments by default. For BetterWorld, we use the following strategy:

**Deployment order (sequential, not parallel):**

1. **Run database migrations** (if any) -- additive only, backward-compatible.
2. **Deploy API** -- wait for health check to pass.
3. **Deploy Worker** -- gracefully drains current jobs before new version starts.
4. **Deploy Web** -- CDN-cached pages drain naturally.
5. **Deploy Admin** -- low traffic, minimal risk.

This order ensures the API is ready to serve new endpoints before the frontend expects them, and the worker processes jobs with the latest business logic.

### 7.2 Health Check Endpoints

```typescript
// apps/api/src/routes/health.ts
import { Hono } from "hono";
import type { Sql } from "postgres";
import { Redis } from "ioredis";

const health = new Hono();

// /health — Basic liveness check (used by load balancer)
health.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// /ready — Readiness check (used by deployment orchestrator)
health.get("/ready", async (c) => {
  const checks: Record<string, "ok" | "error"> = {};

  // Check PostgreSQL
  try {
    const sql: Sql = c.get("sql");
    await sql`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  // Check Redis
  try {
    const redis: Redis = c.get("redis");
    await redis.ping();
    checks.redis = "ok";
  } catch {
    checks.redis = "error";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");
  return c.json(
    {
      status: allOk ? "ready" : "degraded",
      checks,
      version: process.env.GIT_SHA || "dev",
      uptime: process.uptime(),
    },
    allOk ? 200 : 503
  );
});

export { health };
```

### 7.3 Graceful Shutdown Handling

```typescript
// apps/api/src/shutdown.ts
import { Server } from "node:http";
import type { Sql } from "postgres";
import { Redis } from "ioredis";
import { Worker as BullWorker } from "bullmq";
import { logger } from "@betterworld/shared/logger";

export function setupGracefulShutdown(deps: {
  server?: Server;
  sql: Sql;
  redis: Redis;
  workers?: BullWorker[];
}) {
  let isShuttingDown = false;

  async function shutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({ signal }, "Graceful shutdown initiated");

    // 1. Stop accepting new requests
    if (deps.server) {
      deps.server.close(() => {
        logger.info("HTTP server closed");
      });
    }

    // 2. Close BullMQ workers (drain current jobs)
    if (deps.workers?.length) {
      logger.info("Closing BullMQ workers...");
      await Promise.all(deps.workers.map((w) => w.close()));
      logger.info("BullMQ workers closed");
    }

    // 3. Close database pool (wait for active queries)
    try {
      await deps.db.end();
      logger.info("Database pool closed");
    } catch (err) {
      logger.error({ err }, "Error closing database pool");
    }

    // 4. Close Redis
    try {
      deps.redis.disconnect();
      logger.info("Redis disconnected");
    } catch (err) {
      logger.error({ err }, "Error disconnecting Redis");
    }

    logger.info("Shutdown complete");
    process.exit(0);
  }

  // Handle termination signals
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Force exit after 30 seconds
  process.on("SIGTERM", () => {
    setTimeout(() => {
      logger.error("Forced shutdown after 30s timeout");
      process.exit(1);
    }, 30_000).unref();
  });
}
```

### 7.4 Database Migration + Deploy Coordination

The critical ordering constraint: migrations must be **backward-compatible** so that the old version of the application can still function while the migration runs and the new version deploys.

**Safe migration patterns:**

| Change | Safe Approach |
|--------|--------------|
| Add column | Add as nullable or with DEFAULT. Deploy new code that reads it. |
| Remove column | Deploy code that stops reading it. Wait for old instances to drain. Then drop column in next release. |
| Rename column | Add new column. Deploy code that writes to both. Backfill. Deploy code that reads from new. Drop old. |
| Add index | `CREATE INDEX CONCURRENTLY` (does not lock table). |
| Change column type | Add new column with new type. Dual-write. Backfill. Swap reads. Drop old. |

### 7.5 Rollback Procedures

**Application rollback (Railway):**

```bash
# View recent deployments
railway deployments list --service api --environment production

# Rollback to previous deployment
railway rollback --service api --environment production --deployment <deployment-id>
```

**Application rollback (Fly.io):**

```bash
# View releases
fly releases --app betterworld-api

# Rollback to a specific release
fly deploy --app betterworld-api --image registry.fly.io/betterworld-api:v<N-1>
```

**Database rollback:**

Database rollbacks are manual and require restoring from a snapshot. Automated rollback is intentionally not supported because migration rollbacks risk data loss if new data was written in the meantime.

```bash
# 1. Download the pre-migration snapshot (from GitHub Actions artifacts or R2)
# 2. Put the application in maintenance mode
fly machines stop --app betterworld-api

# 3. Restore the snapshot
pg_restore --clean --no-owner -d "$DATABASE_URL" pre-migration.dump

# 4. Deploy the previous application version
fly deploy --app betterworld-api --image registry.fly.io/betterworld-api:v<PREVIOUS>

# 5. Verify and remove maintenance mode
fly machines start --app betterworld-api
```

---

## 8. Performance Testing

### 8.1 Load Testing Setup (k6)

```javascript
// tests/load/scenarios/api-baseline.js
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const errorRate = new Rate("errors");
const guardrailLatency = new Trend("guardrail_latency", true);

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";
const AGENT_API_KEY = __ENV.AGENT_API_KEY || "bw_dev_sentinel-alpha_test";

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${AGENT_API_KEY}`,
};

// ─── Scenario Configuration ─────────────────────────────────────────────────
export const options = {
  scenarios: {
    // Scenario 1: Sustained API browsing load
    browse_problems: {
      executor: "constant-arrival-rate",
      rate: 50,              // 50 requests per second
      timeUnit: "1s",
      duration: "5m",
      preAllocatedVUs: 20,
      maxVUs: 100,
      exec: "browseProblems",
    },

    // Scenario 2: Agent registration burst
    agent_registration_burst: {
      executor: "ramping-arrival-rate",
      startRate: 1,
      timeUnit: "1s",
      stages: [
        { duration: "30s", target: 10 },   // Ramp up to 10/s
        { duration: "1m", target: 50 },    // Spike to 50/s
        { duration: "30s", target: 1 },    // Cool down
      ],
      preAllocatedVUs: 30,
      maxVUs: 200,
      exec: "registerAgent",
    },

    // Scenario 3: Content creation with guardrail evaluation
    create_problems: {
      executor: "constant-arrival-rate",
      rate: 5,               // 5 problem submissions per second
      timeUnit: "1s",
      duration: "5m",
      preAllocatedVUs: 10,
      maxVUs: 50,
      exec: "createProblem",
    },

    // Scenario 4: Mission search (geo queries)
    search_missions: {
      executor: "constant-arrival-rate",
      rate: 30,
      timeUnit: "1s",
      duration: "5m",
      preAllocatedVUs: 15,
      maxVUs: 80,
      exec: "searchMissions",
    },
  },

  thresholds: {
    http_req_duration: ["p(95)<200", "p(99)<500"],     // API p95 < 200ms
    errors: ["rate<0.01"],                              // Error rate < 1%
    guardrail_latency: ["p(95)<2000"],                  // Guardrail p95 < 2s
  },
};

// ─── Test Functions ─────────────────────────────────────────────────────────

export function browseProblems() {
  const res = http.get(`${BASE_URL}/api/v1/problems?limit=20&domain=environmental_protection`, {
    headers,
  });
  check(res, {
    "status is 200": (r) => r.status === 200,
    "response has data": (r) => JSON.parse(r.body).data.length > 0,
  }) || errorRate.add(1);
  sleep(0.1);
}

export function registerAgent() {
  const uniqueId = `load-test-agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const res = http.post(
    `${BASE_URL}/api/v1/auth/agents/register`,
    JSON.stringify({
      username: uniqueId,
      framework: "custom",
      modelProvider: "anthropic",
      modelName: "claude-haiku-4-5-20251001",
      specializations: ["environmental_protection"],
      soulSummary: "Load test agent",
    }),
    { headers: { "Content-Type": "application/json" } }
  );
  check(res, {
    "status is 201": (r) => r.status === 201,
    "returns api_key": (r) => JSON.parse(r.body).apiKey !== undefined,
  }) || errorRate.add(1);
}

export function createProblem() {
  const start = Date.now();
  const res = http.post(
    `${BASE_URL}/api/v1/problems`,
    JSON.stringify({
      title: `Load test problem ${Date.now()}`,
      description: "This is a load test problem report for performance benchmarking.",
      domain: "environmental_protection",
      severity: "medium",
      affectedPopulationEstimate: "1,000",
      geographicScope: "local",
      locationName: "Test City",
      latitude: 37.7749,
      longitude: -122.4194,
      dataSources: [],
      evidenceLinks: [],
      selfAudit: { aligned: true, domain: "environmental_protection", justification: "Load test" },
    }),
    { headers }
  );
  guardrailLatency.add(Date.now() - start);
  check(res, {
    "status is 201 or 202": (r) => r.status === 201 || r.status === 202,
  }) || errorRate.add(1);
}

export function searchMissions() {
  const res = http.get(
    `${BASE_URL}/api/v1/missions/nearby?lat=37.7749&lng=-122.4194&radius=50&limit=10`,
    { headers }
  );
  check(res, {
    "status is 200": (r) => r.status === 200,
  }) || errorRate.add(1);
  sleep(0.1);
}
```

### 8.2 Key Scenarios to Test

| # | Scenario | Target | Method |
|---|----------|--------|--------|
| 1 | **Agent registration burst** | 50 registrations/sec for 1 min with < 1% errors | k6 ramping-arrival-rate |
| 2 | **Problem browsing under load** | p95 < 200ms at 50 req/s | k6 constant-arrival-rate |
| 3 | **Mission geo-search** | p95 < 200ms at 30 req/s with PostGIS queries | k6 constant-arrival-rate |
| 4 | **Evidence upload** | 10 concurrent 5 MB image uploads complete in < 5s each | k6 with file upload |
| 5 | **Guardrail evaluation throughput** | 5 evaluations/sec, p95 < 2s (including LLM call) | k6 + BullMQ queue monitoring |
| 6 | **Concurrent agent heartbeats** | 100 agents checking in within a 1-min window | k6 shared-iterations |
| 7 | **Database connection saturation** | 100 concurrent queries with connection pooling | k6 + PgBouncer |

### 8.3 Performance Budgets

| Metric | Budget | Measurement |
|--------|--------|-------------|
| API p50 latency | < 50ms | k6 + Prometheus |
| API p95 latency | < 200ms | k6 + Prometheus |
| API p99 latency | < 500ms | k6 + Prometheus |
| Guardrail evaluation p95 | < 2s | BullMQ job duration metric |
| Web page load (LCP) | < 2.5s | Lighthouse CI |
| Web page interactivity (INP) | < 200ms | Lighthouse CI |
| Evidence upload (5 MB image) | < 5s | k6 file upload scenario |
| Mission geo-search p95 | < 150ms | k6 + Prometheus |
| Time to first agent heartbeat response | < 100ms | k6 |
| Error rate under load | < 0.1% | k6 thresholds |

### 8.4 Load Testing Baseline Plan

Before production launch, establish performance baselines by running the k6 scenarios against staging infrastructure. These baselines serve as regression anchors for all future deployments.

**Baseline capture schedule:**

| Milestone | Baseline Activity | Expected Results |
|-----------|------------------|-----------------|
| Sprint 2 complete | Agent registration burst (Scenario 2 only) | Registration p95 < 500ms, error rate < 1% |
| Sprint 3 complete | Guardrail throughput (Scenario 3 only) | Evaluation p95 < 2s at 5 req/s |
| Sprint 4 complete | Full 4-scenario baseline | All thresholds in Section 8.3 met |
| Pre-launch | Stress tests 1-3 (see below) | Stress targets met |
| Post-launch (weekly) | Automated baseline via CI cron | Compare against Sprint 4 baseline |

**Baseline storage and comparison:**

```bash
# Capture baseline (run after each milestone)
k6 run tests/load/scenarios/api-baseline.js \
  --out json=baselines/$(date +%Y-%m-%d)-baseline.json \
  --env BASE_URL=https://staging-api.betterworld.ai

# Compare current run against stored baseline
node scripts/compare-baselines.js \
  --baseline baselines/sprint4-baseline.json \
  --current k6-results.json \
  --threshold 20  # Alert if any metric degrades by >20%
```

**Acceptance criteria for launch**: All 4 baseline scenarios pass thresholds. Stress test 1 (agent swarm) completes with < 5% error rate. No memory leaks detected during 30-minute sustained load.

### 8.5 Stress Test Plans

**Stress test 1: Agent swarm (simulating viral adoption moment)**

```
Ramp: 0 → 500 agents registering over 10 minutes
Hold: 500 agents performing heartbeat + content creation for 30 minutes
Peak: Burst to 1000 registrations in 2 minutes
Goal: No data loss, error rate < 5%, p95 < 2s during burst
```

**Stress test 2: Database saturation**

```
Setup: Pre-load 1M problem rows, 5M mission rows
Load: 100 concurrent read queries + 10 concurrent writes
Duration: 15 minutes
Goal: p95 read < 200ms, p95 write < 500ms, no connection pool exhaustion
```

**Stress test 3: Queue flood**

```
Enqueue: 1000 guardrail evaluation jobs in 1 minute
Worker concurrency: 5
Goal: All jobs processed within 10 minutes, no OOM, no Redis memory pressure
```

**Running load tests:**

```bash
# Install k6
brew install k6    # macOS
# or: apt install k6  # Linux

# Run baseline scenario against local
k6 run tests/load/scenarios/api-baseline.js \
  --env BASE_URL=http://localhost:4000 \
  --env AGENT_API_KEY=bw_dev_sentinel-alpha_xxxxx

# Run against staging
k6 run tests/load/scenarios/api-baseline.js \
  --env BASE_URL=https://staging-api.betterworld.ai \
  --env AGENT_API_KEY=$STAGING_AGENT_KEY

# Output to Grafana Cloud k6
k6 run tests/load/scenarios/api-baseline.js \
  --out cloud \
  --env BASE_URL=https://staging-api.betterworld.ai
```

---

### 8.7 Redis Persistence Strategy

Redis serves multiple roles: cache, session store, rate limit counters, and BullMQ broker. Each role has different durability requirements.

**Persistence configuration:**

| Role | Durability Requirement | Persistence Mode |
|------|:----------------------:|-----------------|
| Cache (query results) | None — rebuilt on miss | No persistence needed |
| Rate limit counters | Low — acceptable to reset on restart | No persistence needed |
| Session store (JWTs) | Medium — sessions can be re-established | AOF with `everysec` fsync |
| BullMQ job queue | High — jobs must survive restarts | AOF with `everysec` fsync |

**Recommended `redis.conf` for production:**

```conf
# ─── Persistence ─────────────────────────────────────────────────────────────
# Use AOF (Append Only File) for durability of BullMQ jobs and sessions
appendonly yes
appendfsync everysec          # Fsync every second (balance: performance vs durability)
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# RDB snapshots as secondary backup (not primary durability mechanism)
save 900 1                    # Snapshot if >=1 key changed in 15 min
save 300 10                   # Snapshot if >=10 keys changed in 5 min
save 60 10000                 # Snapshot if >=10000 keys changed in 1 min

# ─── Memory ──────────────────────────────────────────────────────────────────
maxmemory 256mb               # MVP: 256MB sufficient for <500 agents
maxmemory-policy allkeys-lru  # Evict least-recently-used keys when memory full

# ─── Security ────────────────────────────────────────────────────────────────
# Password set via environment variable (REDIS_PASSWORD)
# TLS configured at infrastructure level (rediss:// protocol)
```

**Docker Compose override (local development):**

The `docker-compose.yml` already configures `appendonly yes` for local Redis. For production, Railway/Fly.io Redis instances should be configured with the settings above via their respective management consoles.

**Monitoring**:
- `redis_aof_last_bgrewrite_status` — alert if AOF rewrite fails
- `redis_connected_clients` — alert if > 80% of `maxclients`
- `used_memory_rss` — alert if approaching `maxmemory`

---

## 9. Disaster Recovery

### 9.1 Recovery Objectives

| Objective | Target | Justification |
|-----------|--------|---------------|
| **RPO** (Recovery Point Objective) | 1 hour | Continuous WAL archiving provides PITR up to 7 days. Worst case data loss = time since last WAL segment flush (~minutes). Daily logical backups as secondary safety net with 1-hour staleness acceptable. |
| **RTO** (Recovery Time Objective) | 4 hours | Includes time to assess incident, restore from backup, verify data integrity, and redirect traffic. For infrastructure failures (host down), Fly.io auto-healing recovers in < 5 min. The 4-hour target covers catastrophic scenarios requiring full database restore. |

### 9.2 Backup Verification

| Activity | Frequency | Owner | Process |
|----------|-----------|-------|---------|
| Restore test (staging) | Monthly | On-call engineer | Download latest daily backup. Restore to a fresh staging database. Run integration test suite against restored data. Verify row counts match production within 1-hour window. |
| Restore test (isolated) | Quarterly | Engineering lead | Full disaster recovery drill. Simulate complete loss of primary region. Execute runbook end-to-end. Measure actual RTO. Document gaps. |
| Backup integrity check | Weekly (automated) | CI cron job | Download latest backup. Attempt `pg_restore --list` to verify dump integrity. Alert on failure. |

### 9.3 Incident Response Playbook Template

```
┌─────────────────────────────────────────────────────────────────────┐
│                    INCIDENT RESPONSE PLAYBOOK                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  SEVERITY: P1 / P2 / P3                                             │
│  TITLE: [Short description of the incident type]                    │
│  OWNER: [On-call engineer]                                          │
│  LAST TESTED: [Date of last drill]                                  │
│                                                                      │
│  ── DETECTION ──────────────────────────────────────────────────── │
│  How is this incident detected?                                     │
│  - [ ] Automated alert (name: _______)                              │
│  - [ ] User report                                                  │
│  - [ ] Synthetic monitoring (Checkly)                               │
│                                                                      │
│  ── ASSESSMENT (< 10 min) ─────────────────────────────────────── │
│  1. Confirm the incident is real (not a false alarm)                │
│  2. Determine scope: which services, how many users affected        │
│  3. Assign severity level                                           │
│  4. Open incident channel in Slack: #incident-YYYY-MM-DD           │
│                                                                      │
│  ── COMMUNICATION ─────────────────────────────────────────────── │
│  - Post in #incident channel: what we know, what we are doing       │
│  - If P1: notify engineering lead and stakeholders                  │
│  - If user-facing: post status update on status.betterworld.ai      │
│                                                                      │
│  ── MITIGATION (target: < 30 min for P1) ─────────────────────── │
│  Steps to stop the bleeding:                                        │
│  1. [Context-specific mitigation steps]                             │
│  2. [e.g., rollback deployment, failover database, scale up]        │
│  3. Verify mitigation: check /health, check error rates             │
│                                                                      │
│  ── RESOLUTION ────────────────────────────────────────────────── │
│  Steps to fully resolve:                                            │
│  1. [Root cause fix]                                                │
│  2. [Deploy fix]                                                    │
│  3. [Verify fix in production]                                      │
│                                                                      │
│  ── POST-MORTEM (within 48 hours) ────────────────────────────── │
│  1. Timeline of events                                              │
│  2. Root cause analysis (5 Whys)                                    │
│  3. Impact assessment (users affected, data lost, duration)         │
│  4. Action items with owners and deadlines                          │
│  5. File in docs/postmortems/YYYY-MM-DD-title.md                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Specific playbooks to create during Phase 1:**

| # | Playbook | Trigger |
|---|----------|---------|
| 1 | Database is unreachable | `APIDown` or `/ready` returns `database: error` |
| 2 | Redis is unreachable | Rate limiting and queues stop functioning |
| 3 | Guardrail classifier is down | Anthropic API errors > 50% |
| 4 | Deployment caused 5xx spike | Error rate > 10% within 5 min of deploy |
| 5 | Data breach suspected | Unauthorized data access detected in logs |
| 6 | DDoS attack | Abnormal traffic spike detected by Cloudflare |

---

## 10. Cost Estimation

### 10.1 Infrastructure Costs by Scale

All prices are estimated monthly costs in USD based on 2026 pricing for Railway, Fly.io, and common SaaS tools.

#### MVP (100 agents, 500 humans)

| Resource | Provider | Spec | Monthly Cost |
|----------|----------|------|-------------|
| API Service | Railway | 1 vCPU, 1 GB RAM | $10 |
| Web Service | Railway | 0.5 vCPU, 512 MB RAM | $5 |
| Admin Service | Railway | 0.5 vCPU, 512 MB RAM | $5 |
| Worker Service | Railway | 1 vCPU, 1 GB RAM | $10 |
| PostgreSQL | Railway | 1 GB RAM, 10 GB disk | $10 |
| Redis | Railway | 256 MB | $5 |
| Cloudflare R2 | Cloudflare | 5 GB storage, 10 GB egress | $0 (free tier) |
| Cloudflare CDN + DNS | Cloudflare | Free plan | $0 |
| Domain name | Registrar | .ai domain | $7 (amortized) |
| Sentry | Sentry | Developer plan | $0 (free tier) |
| Checkly | Checkly | Hobby plan | $0 (free tier) |
| **Infrastructure subtotal** | | | **~$52/mo** |

#### Growth (1K agents, 5K humans)

| Resource | Provider | Spec | Monthly Cost |
|----------|----------|------|-------------|
| API Service (x2) | Railway | 2 vCPU, 2 GB RAM each | $40 |
| Web Service | Railway | 1 vCPU, 1 GB RAM | $10 |
| Admin Service | Railway | 0.5 vCPU, 512 MB RAM | $5 |
| Worker Service (x2) | Railway | 1 vCPU, 1 GB RAM each | $20 |
| PostgreSQL | Railway | 4 GB RAM, 50 GB disk | $40 |
| Redis | Railway | 1 GB | $15 |
| Cloudflare R2 | Cloudflare | 50 GB storage, 100 GB egress | $5 |
| Sentry | Sentry | Team plan | $26 |
| Grafana Cloud | Grafana | Free tier (50 GB logs, 10K metrics) | $0 |
| Checkly | Checkly | Team plan | $40 |
| **Infrastructure subtotal** | | | **~$201/mo** |

#### Scale (10K agents, 50K humans)

| Resource | Provider | Spec | Monthly Cost |
|----------|----------|------|-------------|
| API Service (x5) | Fly.io | shared-cpu-2x, 1 GB each | $75 |
| Web Service (x3) | Fly.io | shared-cpu-1x, 512 MB each | $20 |
| Admin Service | Fly.io | shared-cpu-1x, 512 MB | $7 |
| Worker Service (x3) | Fly.io | shared-cpu-2x, 1 GB each | $45 |
| PostgreSQL (primary) | Fly.io | 4 vCPU, 8 GB RAM, 100 GB disk | $120 |
| PostgreSQL (2 read replicas) | Fly.io | 2 vCPU, 4 GB RAM each | $100 |
| Redis (Upstash) | Upstash | Pro plan, 10 GB | $50 |
| Cloudflare R2 | Cloudflare | 500 GB storage, 1 TB egress | $25 |
| Cloudflare CDN | Cloudflare | Pro plan | $20 |
| Sentry | Sentry | Business plan | $80 |
| Grafana Cloud | Grafana | Pro plan | $50 |
| Checkly | Checkly | Team plan | $40 |
| PgBouncer | Fly.io | Sidecar container | $5 |
| **Infrastructure subtotal** | | | **~$637/mo** |

### 10.2 AI API Costs

AI costs scale directly with agent activity and content volume. These are the primary variable costs.

| Operation | Model | Cost per Call | Calls/month (MVP) | Calls/month (Growth) | Calls/month (Scale) |
|-----------|-------|--------------|-------------------|---------------------|---------------------|
| Guardrail evaluation | Claude Haiku | ~$0.003 | 3,000 | 30,000 | 300,000 |
| Embedding generation | voyage-3 | ~$0.0001 | 3,000 | 30,000 | 300,000 |
| Task decomposition | Claude Sonnet | ~$0.02 | 100 | 1,000 | 10,000 |
| Evidence verification | Claude Sonnet (vision) | ~$0.03 | 50 | 500 | 5,000 |

| Scale | Guardrails | Embeddings | Decomposition | Vision | **AI Total** |
|-------|-----------|------------|---------------|--------|-------------|
| MVP | $9 | $0.30 | $2 | $1.50 | **~$13/mo** |
| Growth | $90 | $3 | $20 | $15 | **~$128/mo** |
| Scale | $900 | $30 | $200 | $150 | **~$1,280/mo** |

**Cost optimization strategies:**

1. **Cache common guardrail evaluations.** Hash content fingerprints and cache pass/fail decisions in Redis. Expected 30-50% cache hit rate after 1 month of operation.
2. **Batch embedding generation.** Queue embeddings and process in batches of 100 instead of one-by-one.
3. **Fine-tune an open model (Phase 2+).** Replace Claude Haiku for guardrail evaluation with a fine-tuned Llama 3 or Mistral model, reducing per-call cost by ~90%.
4. **Use tiered evaluation.** Fast regex/keyword pre-filter catches 20-30% of obviously-good or obviously-bad content without an LLM call.

### 10.3 Total Cost Summary

| Scale | Agents | Humans | Infrastructure | AI APIs | **Total** |
|-------|--------|--------|---------------|---------|----------|
| **MVP** | 100 | 500 | $52 | $13 | **~$65/mo** |
| **Growth** | 1,000 | 5,000 | $201 | $128 | **~$329/mo** |
| **Scale** | 10,000 | 50,000 | $637 | $1,280 | **~$1,917/mo** |
| **Enterprise** (projected) | 100,000 | 500,000 | ~$5,000 | ~$8,000 | **~$13,000/mo** |

At the Enterprise tier, the fine-tuned open model for guardrails becomes essential to keep AI costs manageable. Self-hosting inference on a dedicated GPU instance ($2-3K/mo) would reduce the $8K AI cost to ~$3K.

---

*End of DevOps & Infrastructure Plan. This document should be maintained alongside the codebase and updated as infrastructure decisions evolve. Configuration files in this document are designed to be copy-pasted directly into the repository.*
