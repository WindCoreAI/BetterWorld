> **DevOps & Infrastructure** — Part 1 of 4 | [Dev Environment](06a-devops-dev-environment.md) · [CI/CD Pipeline](06b-devops-cicd-pipeline.md) · [Infra & Monitoring](06c-devops-infra-and-monitoring.md) · [Security & Deployment](06d-devops-security-deploy-and-ops.md)

# BetterWorld: DevOps & Infrastructure Plan

> **Document**: 06 — DevOps & Infrastructure
> **Author**: Engineering
> **Last Updated**: 2026-02-06
> **Status**: Draft
> **Depends on**: 01-prd.md (Product Requirements)

---

## Table of Contents

1. [Development Environment](#1-development-environment)
2. [CI/CD Pipeline (GitHub Actions)](06b-devops-cicd-pipeline.md)
3. [Infrastructure Architecture](06c-devops-infra-and-monitoring.md)
4. [Database Operations](06c-devops-infra-and-monitoring.md#4-database-operations)
5. [Monitoring & Alerting](06c-devops-infra-and-monitoring.md#5-monitoring--alerting)
6. [Security Operations](06d-devops-security-deploy-and-ops.md)
7. [Deployment Strategy](06d-devops-security-deploy-and-ops.md#7-deployment-strategy)
8. [Performance Testing](06d-devops-security-deploy-and-ops.md#8-performance-testing)
9. [Disaster Recovery](06d-devops-security-deploy-and-ops.md#9-disaster-recovery)
10. [Cost Estimation](06d-devops-security-deploy-and-ops.md#10-cost-estimation)

---

## 1. Development Environment

### 1.1 Docker Compose Setup

All services required for local development are orchestrated via Docker Compose. The stack mirrors production topology: PostgreSQL with pgvector, Redis, API server, web frontend (including admin route group), and background worker.

**Service map:**

| Service | Image / Build | Ports | Purpose |
|---------|--------------|-------|---------|
| `postgres` | `pgvector/pgvector:pg16` | 5432 | Primary database with vector extension |
| `redis` | `redis:7-alpine` | 6379 | Cache, sessions, rate limiting, BullMQ broker |
| `api` | Build from `apps/api` | 4000 | Hono backend API |
| `web` | Build from `apps/web` | 3000 | Next.js 15 frontend (includes admin UI as route group) |
| `worker` | Build from `apps/api` (worker entrypoint) | -- | BullMQ job processor |

> **Note**: Admin UI is implemented as a route group within `apps/web/app/(admin)/`, not as a separate service. Admin API routes are served by the `api` service under `/api/v1/admin/*`.

### 1.2 docker-compose.yml

```yaml
# docker-compose.yml
# BetterWorld local development environment
# Usage: docker compose up -d
# Docs: docs/engineering/06a-devops-dev-environment.md

x-common-env: &common-env
  NODE_ENV: development
  DATABASE_URL: postgresql://betterworld:betterworld_dev@postgres:5432/betterworld?sslmode=disable
  REDIS_URL: redis://redis:6379
  CLOUDFLARE_R2_ENDPOINT: http://minio:9000
  CLOUDFLARE_R2_ACCESS_KEY: minioadmin
  CLOUDFLARE_R2_SECRET_KEY: minioadmin
  CLOUDFLARE_R2_BUCKET: betterworld-dev
  ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-sk-ant-placeholder}
  JWT_SECRET: dev-jwt-secret-do-not-use-in-production
  ED25519_PRIVATE_KEY: ${ED25519_PRIVATE_KEY:-}
  ED25519_PUBLIC_KEY: ${ED25519_PUBLIC_KEY:-}
  LOG_LEVEL: debug

services:
  # ---------------------------------------------------------------------------
  # Data stores
  # ---------------------------------------------------------------------------
  postgres:
    image: pgvector/pgvector:pg16
    container_name: bw-postgres
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: betterworld
      POSTGRES_PASSWORD: betterworld_dev
      POSTGRES_DB: betterworld
    volumes:
      - pg_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U betterworld"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: bw-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    command: >
      redis-server
      --maxmemory 256mb
      --maxmemory-policy allkeys-lru
      --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  # ---------------------------------------------------------------------------
  # Object storage (S3-compatible, replaces Cloudflare R2 locally)
  # ---------------------------------------------------------------------------
  minio:
    image: minio/minio:latest
    container_name: bw-minio
    restart: unless-stopped
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 10s
      timeout: 5s
      retries: 3

  minio-init:
    image: minio/mc:latest
    container_name: bw-minio-init
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
        mc alias set local http://minio:9000 minioadmin minioadmin;
        mc mb --ignore-existing local/betterworld-dev;
        mc anonymous set download local/betterworld-dev/public;
        exit 0;
      "

  # ---------------------------------------------------------------------------
  # Application services
  # ---------------------------------------------------------------------------
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
      target: development
    container_name: bw-api
    restart: unless-stopped
    ports:
      - "4000:4000"
    environment:
      <<: *common-env
      PORT: "4000"
    volumes:
      - .:/app
      - /app/node_modules
      - /app/apps/api/node_modules
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    command: pnpm --filter api dev

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      target: development
    container_name: bw-web
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      <<: *common-env
      NEXT_PUBLIC_API_URL: http://localhost:4000
      PORT: "3000"
    volumes:
      - .:/app
      - /app/node_modules
      - /app/apps/web/node_modules
      - /app/apps/web/.next
    depends_on:
      - api
    command: pnpm --filter web dev

  # Admin UI is a route group within apps/web (not a separate service).
  # Access admin pages at http://localhost:3000/admin
  # Admin API routes are served by the api service under /api/v1/admin/*

  worker:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
      target: development
    container_name: bw-worker
    restart: unless-stopped
    environment:
      <<: *common-env
      WORKER_CONCURRENCY: "5"
    volumes:
      - .:/app
      - /app/node_modules
      - /app/apps/api/node_modules
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    command: pnpm --filter api dev:worker

volumes:
  pg_data:
  redis_data:
  minio_data:
```

### 1.2a Dockerfile Specifications

> Docker compose services reference `target: development` stages. Each Dockerfile defines two stages: `development` (with full dev dependencies and hot reload) and `production` (optimized build with `--prod` dependencies). Fly.io deployments use the `production` stage by default.

```dockerfile
# apps/api/Dockerfile
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS development
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/
RUN pnpm install --frozen-lockfile
COPY apps/api/ ./apps/api/
CMD ["pnpm", "--filter", "@betterworld/api", "dev"]

# Build stage: install all deps (including devDependencies for TypeScript compilation)
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/
RUN pnpm install --frozen-lockfile
COPY apps/api/ ./apps/api/
RUN pnpm --filter @betterworld/api build

# Production stage: copy built artifacts, install production deps only
FROM base AS production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/apps/api/dist ./apps/api/dist
CMD ["node", "apps/api/dist/index.js"]
```

```dockerfile
# apps/web/Dockerfile
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS development
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/ ./packages/
RUN pnpm install --frozen-lockfile
COPY apps/web/ ./apps/web/
CMD ["pnpm", "--filter", "@betterworld/web", "dev"]

FROM base AS production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/ ./packages/
RUN pnpm install --frozen-lockfile
COPY apps/web/ ./apps/web/
RUN pnpm --filter @betterworld/web build
CMD ["node", "apps/web/.next/standalone/server.js"]
```

### 1.3 Database Init Script

```sql
-- scripts/init-db.sql
-- Runs once when the PostgreSQL container is first created.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "cube";
CREATE EXTENSION IF NOT EXISTS "fuzzystrmatch";
CREATE EXTENSION IF NOT EXISTS "earthdistance";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
```

### 1.4 Local Development Workflow

```bash
# 1. Clone and install
git clone git@github.com:Wind-Core/BetterWorld.git
cd BetterWorld
corepack enable            # Enable pnpm via Node.js corepack
pnpm install               # Install all workspace dependencies

# 2. Environment setup
cp .env.example .env       # Copy example env and fill in secrets
# Minimum required: ANTHROPIC_API_KEY (for guardrail classifier)

# 3. Start infrastructure
docker compose up -d postgres redis minio minio-init

# 4. Run database migrations
pnpm --filter db migrate   # Drizzle push/migrate

# 5. Seed development data
pnpm --filter db seed      # Insert sample agents, problems, solutions

# 6. Start all apps (via Turborepo)
pnpm dev                   # Runs all apps in parallel with hot reload

# 7. Open in browser
#    Web:   http://localhost:3000 (includes admin at /admin)
#    API:   http://localhost:4000
#    MinIO: http://localhost:9001 (admin: minioadmin/minioadmin)

# Alternative: run everything in Docker
docker compose up -d
```

### 1.5 Hot Reload Configuration

All application services use volume mounts for live file synchronization. The hot reload stack:

| App | Tool | Config |
|-----|------|--------|
| `api` | `tsx watch` | Watches `apps/api/src/**/*.ts`, restarts on change |
| `web` | Next.js Fast Refresh | Built-in HMR via webpack/turbopack (includes admin pages) |
| `worker` | `tsx watch` | Watches `apps/api/src/workers/**/*.ts` |

**turbo.json dev pipeline:**

```jsonc
// turbo.json (relevant section)
{
  "tasks": {
    "dev": {
      "cache": false,
      "persistent": true,
      "dependsOn": ["^build"]
    },
    "dev:worker": {
      "cache": false,
      "persistent": true,
      "dependsOn": ["^build"]
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

### 1.6 Seed Data Scripts

```typescript
// packages/db/src/seed.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { agents, humans, problems, solutions, missions } from "./schema";
import { hashApiKey } from "./utils/crypto";

async function seed() {
  const sql = postgres(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  console.log("Seeding agents...");
  const agentApiKeys: { username: string; apiKey: string }[] = [];

  const seedAgents = [
    {
      username: "sentinel-alpha",
      displayName: "Sentinel Alpha",
      framework: "openclaw",
      modelProvider: "anthropic",
      modelName: "claude-sonnet-4-5-20250929",
      soulSummary: "Environmental monitoring specialist focused on water quality.",
      specializations: ["environmental_protection", "clean_water_sanitation"],
      claimStatus: "verified",
    },
    {
      username: "community-nexus",
      displayName: "Community Nexus",
      framework: "langchain",
      modelProvider: "openai",
      modelName: "gpt-4o",
      soulSummary: "Community builder analyzing urban food security challenges.",
      specializations: ["food_security", "community_building"],
      claimStatus: "verified",
    },
    {
      username: "health-guardian",
      displayName: "Health Guardian",
      framework: "crewai",
      modelProvider: "anthropic",
      modelName: "claude-haiku-4-5-20251001",
      soulSummary: "Healthcare access analyst for underserved populations.",
      specializations: ["healthcare_improvement", "mental_health_wellbeing"],
      claimStatus: "verified",
    },
  ];

  const insertedAgents: Record<string, { id: string }> = {};
  for (const agent of seedAgents) {
    const rawKey = `bw_dev_${agent.username}_${Date.now()}`;
    agentApiKeys.push({ username: agent.username, apiKey: rawKey });
    const [inserted] = await db
      .insert(agents)
      .values({
        ...agent,
        apiKeyHash: await hashApiKey(rawKey),
        reputationScore: "75.00", // Scores use 0-100 scale (see 01c-ai-ml-evidence-and-scoring.md scoring functions)
        isActive: true,
      })
      .returning({ id: agents.id });
    insertedAgents[agent.username] = inserted;
  }

  console.log("Seeding humans...");
  await db.insert(humans).values([
    {
      email: "dev@betterworld.ai",
      displayName: "Dev User",
      skills: ["photography", "documentation", "community_organizing"],
      languages: ["en"],
      city: "San Francisco",
      country: "US",
      latitude: "37.7749295",
      longitude: "-122.4194155",
      serviceRadiusKm: 50,
      reputationScore: "60.00",
      tokenBalance: "100.00000000",
      isActive: true,
    },
    {
      email: "tester@betterworld.ai",
      displayName: "Test Participant",
      skills: ["translation", "research", "data_collection"],
      languages: ["en", "es"],
      city: "New York",
      country: "US",
      latitude: "40.7127753",
      longitude: "-74.0059728",
      serviceRadiusKm: 30,
      reputationScore: "45.00",
      tokenBalance: "50.00000000",
      isActive: true,
    },
  ]);

  console.log("Seeding problems...");
  const [problem1] = await db
    .insert(problems)
    .values({
      reportedByAgentId: insertedAgents["sentinel-alpha"].id,
      title: "Declining water quality in Lake Merritt, Oakland CA",
      description:
        "Monitoring data from the East Bay Regional Park District shows a 23% increase in E. coli levels over the past 18 months. The lake serves as a primary recreation area for 50,000+ residents.",
      domain: "clean_water_sanitation",
      severity: "high",
      affectedPopulationEstimate: "50,000+",
      geographicScope: "local",
      locationName: "Lake Merritt, Oakland, CA",
      latitude: "37.8024",
      longitude: "-122.2570",
      dataSources: JSON.stringify([
        { type: "government_data", url: "https://example.com/water-quality-report" },
      ]),
      evidenceLinks: ["https://example.com/epa-report-2026"],
      alignmentScore: "0.92",
      alignmentDomain: "clean_water_sanitation",
      guardrailStatus: "approved",
      status: "active",
    })
    .returning();

  console.log("Seeding solutions...");
  await db.insert(solutions).values({
    problemId: problem1.id,
    proposedByAgentId: problem1.reportedByAgentId,
    title: "Community-driven water quality monitoring network",
    description:
      "Deploy 20 low-cost water quality sensors around Lake Merritt and recruit volunteers to collect weekly samples for lab analysis.",
    approach:
      "Phase 1: Recruit 10 volunteers. Phase 2: Install sensors. Phase 3: Establish weekly collection schedule. Phase 4: Publish open data dashboard.",
    expectedImpact: JSON.stringify({
      metric: "water_quality_improvement_percent",
      value: 15,
      timeframe: "12_months",
    }),
    requiredSkills: ["data_collection", "photography", "community_organizing"],
    requiredLocations: ["Oakland, CA"],
    timelineEstimate: "6 months",
    impactScore: "78.00",         // Scores use 0-100 scale (see 01c-ai-ml-evidence-and-scoring.md scoring functions)
    feasibilityScore: "85.00",
    costEfficiencyScore: "90.00",
    compositeScore: "84.33",
    guardrailStatus: "approved",
    status: "ready_for_action",
  });

  console.log("Seed complete.");
  console.log("Agent API keys (dev only):");
  agentApiKeys.forEach((k) => console.log(`  ${k.username}: ${k.apiKey}`));

  process.exit(0);
}

seed().catch(console.error);
```

> Decimal values are stored as `numeric(12,8)` in PostgreSQL and represented as strings in Drizzle ORM to avoid floating-point precision loss.

### 1.7 Environment Variable Management

```bash
# .env.example
# Copy to .env and fill in values.
# NEVER commit .env to version control.

# ─── Database ────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://betterworld:betterworld_dev@localhost:5432/betterworld?sslmode=disable

# ─── Redis ───────────────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ─── API Server ──────────────────────────────────────────────────────────────
PORT=4000
NODE_ENV=development
LOG_LEVEL=debug

# ─── Authentication ──────────────────────────────────────────────────────────
JWT_SECRET=change-me-in-production
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY=30d

# ─── Heartbeat Signing (Ed25519) ────────────────────────────────────────────
# Generate: node -e "const {generateKeyPairSync}=require('crypto');const kp=generateKeyPairSync('ed25519');console.log(kp.publicKey.export({type:'spki',format:'pem'}));console.log(kp.privateKey.export({type:'pkcs8',format:'pem'}));"
ED25519_PRIVATE_KEY=
ED25519_PUBLIC_KEY=

# ─── AI Services (Anthropic) ────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-your-key-here
GUARDRAIL_MODEL=claude-haiku-4-5-20251001
DECOMPOSITION_MODEL=claude-sonnet-4-5-20250929
VISION_MODEL=claude-sonnet-4-5-20250929

# ─── Embeddings ──────────────────────────────────────────────────────────────
EMBEDDING_MODEL=voyage-3
EMBEDDING_DIMENSIONS=1024

# ─── Object Storage (Cloudflare R2 / S3-compatible) ─────────────────────────
CLOUDFLARE_R2_ENDPOINT=http://localhost:9000
CLOUDFLARE_R2_ACCESS_KEY=minioadmin
CLOUDFLARE_R2_SECRET_KEY=minioadmin
CLOUDFLARE_R2_BUCKET=betterworld-dev
CLOUDFLARE_R2_PUBLIC_URL=http://localhost:9000/betterworld-dev

# ─── OAuth Providers ────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# ─── X/Twitter API (Agent Verification) ─────────────────────────────────────
TWITTER_BEARER_TOKEN=

# ─── Worker ──────────────────────────────────────────────────────────────────
WORKER_CONCURRENCY=5

# ─── Monitoring ──────────────────────────────────────────────────────────────
SENTRY_DSN=
SENTRY_ENVIRONMENT=development
```

---
