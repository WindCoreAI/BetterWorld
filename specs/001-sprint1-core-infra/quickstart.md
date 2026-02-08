# Quickstart: Sprint 1 Local Development

**Branch**: `001-sprint1-core-infra` | **Date**: 2026-02-07

## Prerequisites

- **Node.js** 22+ (verify: `node -v`)
- **pnpm** 9+ (install: `corepack enable && corepack prepare pnpm@latest --activate`)
- **Docker** + Docker Compose (verify: `docker compose version`)
- **Git** 2.x+

## Setup (< 10 minutes)

### 1. Clone and Install

```bash
git clone <repo-url> betterworld
cd betterworld
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env — fill in any required values (most have sensible defaults for dev)
```

### 3. Start Infrastructure

```bash
docker compose up -d postgres redis
# Wait for health checks to pass:
docker compose ps  # Both should show "healthy"
```

### 4. Run Database Migrations

```bash
pnpm db:migrate
```

### 5. Seed Test Data

```bash
pnpm db:seed
```

### 6. Start Development Servers

```bash
pnpm dev
```

This starts all services via Turborepo:
- **API**: http://localhost:4000 (Hono + Node.js)
- **Web**: http://localhost:3000 (Next.js 15)

### 7. Verify

```bash
# API health check
curl http://localhost:4000/healthz

# Readiness check (verifies DB + Redis connectivity)
curl http://localhost:4000/readyz

# Web app
open http://localhost:3000
```

## Common Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in parallel (hot-reload) |
| `pnpm build` | Build all packages and apps |
| `pnpm lint` | Run ESLint across all workspaces |
| `pnpm typecheck` | Run TypeScript type checking (strict mode) |
| `pnpm test` | Run unit tests (Vitest) |
| `pnpm db:generate` | Generate migration SQL from schema changes |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:push` | Push schema directly (dev shortcut, no migration file) |
| `pnpm db:seed` | Populate database with test data |
| `pnpm db:studio` | Open Drizzle Studio (visual DB inspector) |

## Project Layout

```
apps/api/     → Hono backend (port 4000)
apps/web/     → Next.js frontend (port 3000)
packages/db/  → Drizzle schema, migrations, seed
packages/shared/ → Types, schemas, constants, config
packages/guardrails/ → Placeholder (Sprint 3)
```

## Resetting State

```bash
# Stop everything and remove volumes (fresh start)
docker compose down -v
docker compose up -d postgres redis
pnpm db:migrate
pnpm db:seed
```

## Troubleshooting

**Port conflict**: Change ports in `.env` (`API_PORT`, `WEB_PORT`) or stop conflicting services.

**Database connection refused**: Ensure Docker is running and postgres service is healthy (`docker compose ps`).

**Redis connection refused**: Same as above for redis service.

**Missing env vars**: The app fails fast with a descriptive error listing which variables are missing or invalid.

**Migration failure**: Check `pnpm db:generate` output for schema conflicts. Use `pnpm db:push` for development iteration, `db:migrate` for production-safe changes.
