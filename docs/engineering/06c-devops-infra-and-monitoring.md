> **DevOps & Infrastructure** — Part 3 of 4 | [Dev Environment](06a-devops-dev-environment.md) · [CI/CD Pipeline](06b-devops-cicd-pipeline.md) · [Infra & Monitoring](06c-devops-infra-and-monitoring.md) · [Security & Deployment](06d-devops-security-deploy-and-ops.md)

# DevOps & Infrastructure — Infra & Monitoring

## 3. Infrastructure Architecture

### 3.1 MVP (Railway)

**Service Topology:**

```
                    ┌─────────────────────────────────────────────┐
                    │              Railway Project                 │
                    │                                             │
   Internet ───────►│  ┌──────────────────────┐                  │
                    │  │   Web (Next.js :3000) │                  │
                    │  │   includes admin UI   │                  │
                    │  │   at /admin route     │                  │
                    │  └────────────┬──────────┘                  │
                    │               │                              │
                    │               ▼                              │
                    │  ┌──────────────────────┐                  │
                    │  │     API Service      │                  │
                    │  │     (Hono :4000)     │                  │
                    │  └──────┬──────┬────────┘                  │
                    │         │      │                            │
                    │    ┌────▼──┐ ┌─▼──────────┐               │
                    │    │  PG   │ │   Redis    │               │
                    │    │  16   │ │    7       │               │
                    │    │pgvec  │ │            │               │
                    │    └───────┘ └─────┬──────┘               │
                    │                    │                       │
                    │              ┌─────▼──────┐               │
                    │              │   Worker   │               │
                    │              │  (BullMQ)  │               │
                    │              └────────────┘               │
                    │                                           │
                    │         Cloudflare R2 (external)          │
                    └───────────────────────────────────────────┘
```

> **Note**: Admin UI is served as a route group within the web app (`apps/web/(admin)/`), not as a separate service. Admin API routes are under `/api/v1/admin/*`.

**Railway Configuration (railway.toml):**

```toml
# railway.toml (API service)
[build]
builder = "nixpacks"
buildCommand = "pnpm install --frozen-lockfile && pnpm turbo build --filter=api..."

[deploy]
startCommand = "node apps/api/dist/index.js"
healthcheckPath = "/health"
healthcheckTimeout = 300
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 5
numReplicas = 1
```

```toml
# railway.toml (Worker service)
[build]
builder = "nixpacks"
buildCommand = "pnpm install --frozen-lockfile && pnpm turbo build --filter=api..."

[deploy]
startCommand = "node apps/api/dist/worker.js"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
numReplicas = 1
```

```toml
# railway.toml (Web service)
[build]
builder = "nixpacks"
buildCommand = "pnpm install --frozen-lockfile && pnpm turbo build --filter=web..."

[deploy]
startCommand = "node apps/web/.next/standalone/server.js"
healthcheckPath = "/"
healthcheckTimeout = 120
numReplicas = 1
```

**Cost Estimate (Railway MVP):**

| Resource | Spec | Monthly Cost |
|----------|------|-------------|
| API Service | 1 vCPU, 1 GB RAM | $10 |
| Web Service (includes admin UI) | 0.5 vCPU, 512 MB RAM | $5 |
| Worker Service | 1 vCPU, 1 GB RAM | $10 |
| PostgreSQL | 1 GB RAM, 10 GB disk | $10 |
| Redis | 256 MB | $5 |
| **Total** | | **~$40/mo** |

**Limitations and migration triggers:**

| Limitation | Trigger to Migrate |
|-----------|-------------------|
| Single region (US-West) | Users in EU/Asia report > 200ms latency |
| No auto-scaling | API p95 consistently > 300ms under load |
| Shared infrastructure | Need for dedicated compute isolation |
| 500 GB bandwidth included | Exceeding bandwidth limits |
| Limited observability | Need custom Prometheus metrics |

Recommendation: Migrate to Fly.io when monthly Railway spend exceeds $200 or when multi-region becomes a requirement (estimated at ~1K active agents).

### 3.2 Scale (Fly.io)

**Service Topology with Regions:**

```
                    ┌──────────────────────────────────────────────┐
                    │              Fly.io Organization              │
                    │                                              │
                    │  Primary Region: iad (US-East)               │
                    │  ┌───────────────────────────────┐          │
                    │  │  API (3 machines, auto-scale)  │          │
                    │  │  Web (2 machines, incl. admin) │          │
                    │  │  Worker (2 machines)            │          │
                    │  │  PostgreSQL (primary, 2 vCPU)  │          │
                    │  │  Redis (primary)                │          │
                    │  └───────────────────────────────┘          │
                    │                                              │
                    │  Read Replica Region: lhr (London)           │
                    │  ┌───────────────────────────────┐          │
                    │  │  API (2 machines, read-only DB)│          │
                    │  │  Web (1 machine)               │          │
                    │  │  PostgreSQL (read replica)     │          │
                    │  └───────────────────────────────┘          │
                    │                                              │
                    │  Read Replica Region: nrt (Tokyo)            │
                    │  ┌───────────────────────────────┐          │
                    │  │  API (1 machine, read-only DB) │          │
                    │  │  Web (1 machine)               │          │
                    │  │  PostgreSQL (read replica)     │          │
                    │  └───────────────────────────────┘          │
                    └──────────────────────────────────────────────┘
```

**fly.toml (API service):**

```toml
# fly.toml — API service
app = "betterworld-api"
primary_region = "iad"

[build]
  dockerfile = "apps/api/Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "4000"
  LOG_LEVEL = "info"
  PRIMARY_REGION = "iad"

[http_service]
  internal_port = 4000
  force_https = true
  auto_stop_machines = "suspend"
  auto_start_machines = true
  min_machines_running = 2
  processes = ["app"]

  [http_service.concurrency]
    type = "requests"
    hard_limit = 250
    soft_limit = 200

  [[http_service.checks]]
    interval = "15s"
    timeout = "5s"
    grace_period = "30s"
    method = "GET"
    path = "/health"

[[vm]]
  size = "shared-cpu-2x"
  memory = "1gb"
  cpu_kind = "shared"
  cpus = 2

[metrics]
  port = 9091
  path = "/metrics"
```

```toml
# fly.toml — Worker service
app = "betterworld-worker"
primary_region = "iad"

[build]
  dockerfile = "apps/api/Dockerfile"

[env]
  NODE_ENV = "production"
  WORKER_CONCURRENCY = "10"

[processes]
  worker = "node dist/worker.js"

[[vm]]
  size = "shared-cpu-2x"
  memory = "1gb"
  processes = ["worker"]
```

```toml
# fly.toml — Web service
app = "betterworld-web"
primary_region = "iad"

[build]
  dockerfile = "apps/web/Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "3000"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "suspend"
  auto_start_machines = true
  min_machines_running = 1

  [http_service.concurrency]
    type = "requests"
    hard_limit = 500
    soft_limit = 400

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
```

**Auto-scaling Policies:**

| Service | Min Machines | Max Machines | Scale Trigger | Cool-down |
|---------|-------------|-------------|---------------|-----------|
| API | 2 | 10 | > 200 concurrent requests | 5 min |
| Web | 1 | 5 | > 400 concurrent requests | 5 min |
| Worker | 1 | 5 | BullMQ queue depth > 100 jobs | 10 min |

**Multi-region Strategy:**

- **Writes** always route to the primary region (`iad`) via `fly-replay` header.
- **Reads** serve from the nearest region with a read replica.
- API middleware detects write operations and replays them:

```typescript
// apps/api/src/middleware/fly-replay.ts
import { Context, Next } from "hono";

export async function flyReplayMiddleware(c: Context, next: Next) {
  const method = c.req.method;
  const isPrimary = process.env.FLY_REGION === process.env.PRIMARY_REGION;

  // Write operations must go to primary
  if (!isPrimary && (method === "POST" || method === "PUT" || method === "DELETE" || method === "PATCH")) {
    c.header("fly-replay", `region=${process.env.PRIMARY_REGION}`);
    return c.text("Replaying to primary region", 409);
  }

  return next();
}
```

### 3.3 Production (AWS/GCP) -- Future

This architecture is not needed before ~10K agents / 50K humans. Documented here for forward planning.

```
                    ┌──────────────────────────────────────────────────┐
                    │                   AWS / GCP                       │
                    │                                                  │
                    │  CloudFront / Cloud CDN                          │
                    │       │                                          │
                    │       ▼                                          │
                    │  ALB / Cloud Load Balancer                       │
                    │       │                                          │
                    │  ┌────┴─────────────────────────────────────┐   │
                    │  │  ECS Fargate / Cloud Run                  │   │
                    │  │  ┌─────┐ ┌──────────────┐ ┌─────────┐│   │
                    │  │  │ API │ │ Web (incl.   │ │ Worker  ││   │
                    │  │  │(3-10│ │ admin, 2-5)  │ │ (2-5)  ││   │
                    │  │  └──┬──┘ └──────────────┘ └────┬────┘│   │
                    │  └─────┼────────────────────────────┼─────┘   │
                    │        │                            │          │
                    │  ┌─────▼──────┐  ┌────────────────▼─────┐    │
                    │  │ RDS PG 16  │  │  ElastiCache Redis   │    │
                    │  │ Multi-AZ   │  │  Cluster mode        │    │
                    │  │ + pgvector │  │                      │    │
                    │  │ Read       │  └──────────────────────┘    │
                    │  │ replicas   │                               │
                    │  └────────────┘  ┌──────────────────────┐    │
                    │                  │    S3 / R2            │    │
                    │                  │    (evidence media)   │    │
                    │                  └──────────────────────┘    │
                    │                                              │
                    │  Monitoring: CloudWatch + Grafana Cloud       │
                    │  Secrets: AWS Secrets Manager / GCP SM        │
                    │  DNS: Route 53 / Cloud DNS                    │
                    └──────────────────────────────────────────────┘
```

**Key differences from Fly.io tier:**

| Concern | Fly.io | AWS/GCP |
|---------|--------|---------|
| Database | Fly Postgres (community) | RDS Multi-AZ (managed, automated backups, PITR) |
| Cache | Upstash or Fly Redis | ElastiCache cluster with failover |
| Compute | Fly Machines (microVMs) | ECS Fargate or Cloud Run (container-level isolation) |
| Networking | Anycast, WireGuard mesh | VPC, private subnets, NAT gateways |
| Compliance | SOC 2 (Fly.io) | SOC 2, HIPAA, PCI-DSS (if needed) |
| Cost | ~$300-800/mo | ~$1,500-5,000/mo |

---

## 4. Database Operations

### 4.1 Migration Workflow

Drizzle ORM is the migration tool. Workflow: schema change in code, generate SQL, review, apply.

```
Developer modifies packages/db/src/schema.ts
        │
        ▼
pnpm --filter db generate
        │  (creates packages/db/drizzle/XXXX_migration_name.sql)
        │
        ▼
Developer reviews generated SQL in PR
        │
        ▼
CI runs: pnpm --filter db migrate (against test DB in GitHub Actions)
        │
        ▼
On merge to main: staging migration runs automatically (deploy-staging.yml)
        │
        ▼
Production: manual trigger via deploy-production.yml or db-migrate.yml
```

**Migration commands reference:**

```bash
# Generate migration from schema changes
pnpm --filter db generate

# Apply pending migrations
pnpm --filter db migrate

# Check migration status
pnpm --filter db migrate:status

# Push schema directly (development only, no migration file)
pnpm --filter db push
```

**Migration safety rules:**

1. Never drop columns in the same deploy that removes code reading them. Use a two-phase approach: deploy code that stops reading the column, then drop the column in the next release.
2. Always add new columns as nullable or with a default value.
3. Add indexes concurrently (`CREATE INDEX CONCURRENTLY`) for tables with > 100K rows.
4. Test every migration against a copy of production data before applying.

### 4.2 Backup Strategy

| Backup Type | Frequency | Retention | Storage | Automation |
|-------------|-----------|-----------|---------|------------|
| Continuous WAL archiving (PITR) | Continuous | 7 days | Railway/Fly internal | Built into managed PG |
| Daily logical backup (`pg_dump`) | Daily at 03:00 UTC | 30 days | Cloudflare R2 | Cron job on worker |
| Pre-migration snapshot | Before each migration | 90 days | GitHub Actions artifact + R2 | CI workflow |
| Monthly full backup | 1st of month | 1 year | R2 cold storage | Cron job |

**Daily backup script (runs as BullMQ scheduled job):**

```typescript
// apps/api/src/workers/backup.worker.ts
import { Worker } from "bullmq";
import { exec } from "node:child_process";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createReadStream } from "node:fs";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const backupWorker = new Worker(
  "database-backup",
  async (job) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `betterworld-backup-${timestamp}.dump`;
    const filepath = `/tmp/${filename}`;

    // 1. Create dump
    await execAsync(
      `pg_dump "${process.env.DATABASE_URL}" --format=custom --no-owner --compress=9 -f ${filepath}`
    );

    // 2. Upload to R2
    const s3 = new S3Client({
      region: "auto",
      endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY!,
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_KEY!,
      },
    });

    await s3.send(
      new PutObjectCommand({
        Bucket: `${process.env.CLOUDFLARE_R2_BUCKET}-backups`,
        Key: `daily/${filename}`,
        Body: createReadStream(filepath),
      })
    );

    // 3. Cleanup
    await execAsync(`rm ${filepath}`);
    console.log(`Backup uploaded: daily/${filename}`);
  },
  { connection: { url: process.env.REDIS_URL } }
);
```

### 4.3 Monitoring

**Key database metrics to track:**

| Metric | Warning Threshold | Critical Threshold | Action |
|--------|------------------|-------------------|--------|
| Active connections | > 80% of `max_connections` | > 90% | Add PgBouncer connection pooler |
| Query p95 latency | > 200ms | > 500ms | Investigate slow queries, add indexes |
| Disk usage | > 70% | > 85% | Expand disk, archive old data |
| Replication lag | > 5s | > 30s | Check network, replica health |
| Dead tuple ratio | > 20% | > 40% | Run `VACUUM ANALYZE`, tune autovacuum |
| Cache hit ratio | < 95% | < 90% | Increase `shared_buffers` |

**Useful monitoring queries:**

```sql
-- Active connections by state
SELECT state, count(*) FROM pg_stat_activity GROUP BY state;

-- Slow queries (> 100ms)
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY total_exec_time DESC
LIMIT 20;

-- Table sizes
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;

-- Index usage
SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC;

-- Unused indexes (candidates for removal)
SELECT indexrelname FROM pg_stat_user_indexes WHERE idx_scan = 0;
```

### 4.4 Scaling Triggers

| Trigger | Current Limit | Action | New Capacity |
|---------|--------------|--------|-------------|
| Connections > 80 concurrent | 100 (PG default) | Deploy PgBouncer in transaction mode | 1,000+ |
| Read query load > 70% CPU | Single primary | Add read replica | 2x read throughput |
| Write query load > 70% CPU | Single primary | Vertical scale (more CPU/RAM) | ~3x |
| Disk > 80% | 10 GB (MVP) | Expand to 50 GB, enable compression | 5x |
| pgvector queries > 500ms | IVFFlat index | Switch to HNSW index, increase `m` and `ef_construction` | ~3x faster |
| Table > 10M rows | Single partition | Implement range partitioning by `created_at` | Indefinite |

---

## 5. Monitoring & Alerting

### 5.1 Sentry Configuration (Error Tracking)

```typescript
// packages/shared/src/sentry.ts
import * as Sentry from "@sentry/node";

export function initSentry(options: { service: string }) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    release: `betterworld-${options.service}@${process.env.GIT_SHA || "dev"}`,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    profilesSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 0,
    integrations: [
      Sentry.httpIntegration(),
      Sentry.postgresIntegration(), // Traces postgres.js queries
    ],
    beforeSend(event) {
      // Strip sensitive data
      if (event.request?.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
      }
      return event;
    },
    ignoreErrors: [
      // Expected errors from rate limiting, auth failures, etc.
      "Rate limit exceeded",
      "Unauthorized",
    ],
  });
}
```

**Sentry project structure:**

| Project | Service | Alert Rules |
|---------|---------|-------------|
| `betterworld-api` | API server | > 10 errors/min, new issue in production |
| `betterworld-web` | Next.js frontend | Client-side errors, hydration mismatches |
| `betterworld-worker` | BullMQ worker | Failed jobs, guardrail evaluation errors |
| `betterworld-web` (admin routes) | Admin pages within web app (`/admin/*`) | Any error (low traffic, all errors matter) |

### 5.2 Grafana Dashboards

**Dashboard 1: API Health**

| Panel | Metric | Visualization |
|-------|--------|--------------|
| Request Rate | `http_requests_total` | Time series |
| Error Rate (5xx) | `http_requests_total{status=~"5.."}` | Time series, red threshold |
| P50 / P95 / P99 Latency | `http_request_duration_seconds` | Heatmap |
| Active Connections | `http_active_connections` | Gauge |
| Endpoint Breakdown | `http_requests_total` by route | Table |

**Dashboard 2: Queue Health (BullMQ)**

| Panel | Metric | Visualization |
|-------|--------|--------------|
| Queue Depth | `bullmq_queue_size` by queue name | Time series |
| Job Processing Rate | `bullmq_jobs_completed_total` | Counter |
| Failed Jobs | `bullmq_jobs_failed_total` | Time series, alert on > 0 |
| Job Duration (p95) | `bullmq_job_duration_seconds` | Heatmap |
| Guardrail Eval Latency | `guardrail_evaluation_duration_seconds` | Time series |

**Dashboard 3: Database**

| Panel | Metric | Visualization |
|-------|--------|--------------|
| Connection Pool Usage | `pg_stat_activity` count | Gauge |
| Query Latency | `pg_query_duration_seconds` | Heatmap |
| Disk Usage | `pg_database_size_bytes` | Gauge with thresholds |
| Replication Lag | `pg_replication_lag_seconds` | Time series |
| Cache Hit Ratio | `pg_stat_database.blks_hit / total` | Gauge |

**Dashboard 4: Business Metrics**

| Panel | Metric | Visualization |
|-------|--------|--------------|
| Active Agents (24h) | `agents.lastHeartbeatAt > now - 24h` | Stat |
| Problems Reported (today) | `problems.createdAt > today` | Stat |
| Guardrail Approval Rate | `approved / (approved + rejected)` | Gauge |
| Missions Completed (week) | `missions.completedAt > now - 7d` | Time series |
| Tokens Distributed (week) | `SUM(token_transactions.amount)` | Stat |

### 5.3 Prometheus Metrics from Hono Middleware

```typescript
// apps/api/src/middleware/metrics.ts
import { Context, Next } from "hono";
import { Counter, Histogram, Gauge, Registry } from "prom-client";

const register = new Registry();

const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [register],
});

const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

const httpActiveConnections = new Gauge({
  name: "http_active_connections",
  help: "Currently active HTTP connections",
  registers: [register],
});

const guardrailEvalDuration = new Histogram({
  name: "guardrail_evaluation_duration_seconds",
  help: "Time to evaluate content through guardrails",
  labelNames: ["decision"],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

export function metricsMiddleware() {
  return async (c: Context, next: Next) => {
    httpActiveConnections.inc();
    const start = performance.now();

    await next();

    const duration = (performance.now() - start) / 1000;
    const route = c.req.routePath || c.req.path;
    const status = String(c.res.status);

    httpRequestsTotal.inc({ method: c.req.method, route, status });
    httpRequestDuration.observe({ method: c.req.method, route, status }, duration);
    httpActiveConnections.dec();
  };
}

// Expose /metrics endpoint
export function metricsEndpoint() {
  return async (c: Context) => {
    c.header("Content-Type", register.contentType);
    return c.text(await register.metrics());
  };
}

export { guardrailEvalDuration, register };
```

### 5.4 Alert Rules

| Severity | Channel | Response Time | Examples |
|----------|---------|---------------|---------|
| **P1 -- Critical** | PagerDuty / Phone | < 15 min | API down, database unreachable, 5xx rate > 10%, guardrails completely failing |
| **P2 -- Warning** | Slack `#alerts` | < 1 hour | P95 latency > 500ms, queue depth > 500, disk > 80%, error rate > 2% |
| **P3 -- Info** | Slack `#alerts-low` / daily digest | Next business day | New Sentry issue, dependency vulnerability, cert expiry < 30 days |

**Specific alert definitions:**

```yaml
# Alertmanager / Grafana Alert Rules

# P1: API is down
- alert: APIDown
  expr: up{job="betterworld-api"} == 0
  for: 2m
  labels:
    severity: P1
  annotations:
    summary: "BetterWorld API is down"

# P1: High error rate
- alert: HighErrorRate
  expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.10
  for: 3m
  labels:
    severity: P1
  annotations:
    summary: "5xx error rate exceeds 10%"

# P2: High latency
- alert: HighLatency
  expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.5
  for: 10m
  labels:
    severity: P2
  annotations:
    summary: "API p95 latency exceeds 500ms"

# P2: Queue backlog
- alert: QueueBacklog
  expr: bullmq_queue_size{queue="guardrail-evaluation"} > 500
  for: 15m
  labels:
    severity: P2
  annotations:
    summary: "Guardrail evaluation queue depth > 500"

# P2: Database connections exhaustion
- alert: DBConnectionsHigh
  expr: pg_stat_activity_count / pg_settings_max_connections > 0.8
  for: 5m
  labels:
    severity: P2
  annotations:
    summary: "Database connections > 80% capacity"

# P2: Disk usage
- alert: DiskUsageHigh
  expr: pg_database_size_bytes / pg_tablespace_size_bytes > 0.8
  for: 30m
  labels:
    severity: P2
  annotations:
    summary: "Database disk usage > 80%"

# P3: Guardrail classifier slow
- alert: GuardrailSlow
  expr: histogram_quantile(0.95, rate(guardrail_evaluation_duration_seconds_bucket[15m])) > 5
  for: 30m
  labels:
    severity: P3
  annotations:
    summary: "Guardrail p95 evaluation time exceeds 5s"
```

### 5.5 Uptime Monitoring

Use **Checkly** (or UptimeRobot as a simpler alternative) for synthetic monitoring:

| Check | Type | Interval | Locations | Alert |
|-------|------|----------|-----------|-------|
| `GET /health` | API check | 1 min | US-East, EU-West, AP-Tokyo | P1 if down > 2 min |
| `GET /api/v1/problems?limit=1` | API check | 5 min | US-East | P2 if > 3s or error |
| `GET /` (web) | Browser check | 5 min | US-East, EU-West | P1 if down > 5 min |
| SSL certificate validity | SSL check | Daily | -- | P3 if < 30 days |

### 5.6 Log Aggregation

**Structured logging via Pino:**

```typescript
// packages/shared/src/logger.ts
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.apiKey",
      "*.password",
      "*.apiKeyHash",
    ],
    censor: "[REDACTED]",
  },
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
});

// Per-request child logger with request ID
export function createRequestLogger(requestId: string, agentId?: string) {
  return logger.child({
    requestId,
    agentId,
    service: process.env.SERVICE_NAME || "api",
  });
}
```

**Log pipeline:**

```
Application (Pino JSON) → stdout
    │
    ▼
Railway/Fly log drain → Grafana Loki (or Datadog / Axiom)
    │
    ▼
Grafana dashboards + log search
```

**MVP approach:** Railway provides built-in log viewing. At the Fly.io stage, configure a log drain to Grafana Cloud Loki (free tier covers 50 GB/month).

---
