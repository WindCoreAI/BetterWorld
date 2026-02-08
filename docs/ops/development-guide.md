# Development Guide

Operational reference for developing on the BetterWorld platform. Covers environment setup, daily workflows, database operations, testing, CI/CD, and common troubleshooting.

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 22+ | `nvm install 22` or [nodejs.org](https://nodejs.org) |
| pnpm | 9+ | `corepack enable && corepack prepare pnpm@latest --activate` |
| Docker | 24+ | [Docker Desktop](https://www.docker.com/products/docker-desktop/) |
| Git | 2.x+ | Pre-installed on macOS/Linux |

Verify:

```bash
node -v        # v22.x.x
pnpm -v        # 9.x.x
docker compose version  # v2.x.x
git --version  # 2.x.x
```

## First-Time Setup

```bash
# 1. Clone and install
git clone <repo-url> betterworld
cd betterworld
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env if needed — defaults work for local dev

# 3. Start infrastructure
docker compose up -d postgres redis
docker compose ps  # Wait for both to show "healthy"

# 4. Set up database
pnpm db:migrate
pnpm db:seed

# 5. Start development servers
pnpm dev
```

After this, you should have:
- **API** running at http://localhost:4000
- **Web** running at http://localhost:3000
- **PostgreSQL** on port 5432
- **Redis** on port 6379

Verify everything works:

```bash
curl http://localhost:4000/healthz   # {"ok":true,"requestId":"..."}
curl http://localhost:4000/readyz    # {"status":"ready","checks":{"database":"ok","redis":"ok",...}}
open http://localhost:3000           # Landing page
```

## Project Structure

```
betterworld/
  apps/
    api/              Hono backend API (port 4000)
    web/              Next.js 15 frontend (port 3000)
  packages/
    shared/           Types, Zod schemas, constants, config
    db/               Drizzle schema, migrations, seed
    guardrails/       Content guardrails (placeholder)
  docs/               Design docs, specs, operational guides
  specs/              Feature specifications (speckit workflow)
  scripts/            DB init scripts, utilities
  .github/workflows/  CI pipeline
```

### Workspace Dependencies

```
@betterworld/shared  ← imported by api, web, db
@betterworld/db      ← imported by api
@betterworld/api     (standalone app)
@betterworld/web     (standalone app)
```

## Daily Workflow Commands

### Development

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps with hot-reload (Turborepo) |
| `pnpm dev --filter api` | Start only the API server |
| `pnpm dev --filter web` | Start only the web app |

### Quality Checks

| Command | Description |
|---------|-------------|
| `pnpm lint` | ESLint across all workspaces |
| `pnpm typecheck` | TypeScript strict mode check |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm build` | Production build all packages + apps |

Run all four before pushing:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

### Database

| Command | Description |
|---------|-------------|
| `pnpm db:generate` | Generate migration SQL from schema changes |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:push` | Push schema directly (dev shortcut, skips migration file) |
| `pnpm db:seed` | Populate with test data (idempotent — truncates first) |
| `pnpm db:studio` | Open Drizzle Studio (visual DB inspector) |

### Docker Infrastructure

| Command | Description |
|---------|-------------|
| `docker compose up -d postgres redis` | Start DB + cache |
| `docker compose ps` | Check container health |
| `docker compose logs -f postgres` | Tail postgres logs |
| `docker compose down` | Stop containers (keep data) |
| `docker compose down -v` | Stop and remove all data |

## Database Schema Workflow

When modifying database tables in `packages/db/src/schema/`:

```bash
# 1. Edit the schema file(s) in packages/db/src/schema/
# 2. Generate migration
pnpm db:generate

# 3. Review the generated SQL in packages/db/drizzle/
# 4. Apply migration
pnpm db:migrate

# 5. Re-seed if needed
pnpm db:seed
```

**Known issue**: Drizzle-kit generates `"halfvec(1024)"` with quotes for pgvector columns. If you generate a new migration with halfvec columns, manually remove the double quotes around `halfvec(...)` in the generated SQL before applying.

**Import paths**: Schema files in `packages/db/` use extensionless imports (e.g., `./enums` not `./enums.js`) for compatibility with drizzle-kit's CJS loader.

## Resetting Local State

### Full reset (database + cache)

```bash
docker compose down -v
docker compose up -d postgres redis
# Wait for healthy
pnpm db:migrate
pnpm db:seed
```

### Database only

```bash
pnpm db:seed  # Truncates all tables then re-inserts
```

## Environment Variables

All variables are defined in `.env.example`. Key ones:

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgresql://betterworld:betterworld_dev@localhost:5432/betterworld` | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `API_PORT` | `4000` | API server port |
| `WEB_PORT` | `3000` | Web app port |
| `JWT_SECRET` | `dev-jwt-secret-...` | JWT signing key |
| `CORS_ORIGINS` | `http://localhost:3000` | Allowed CORS origins |
| `LOG_LEVEL` | `debug` | Pino log level |
| `NODE_ENV` | `development` | Environment mode |
| `ANTHROPIC_API_KEY` | placeholder | Claude API key (for guardrails) |

The API server reads `DATABASE_URL` and `REDIS_URL` at startup. If not set, it falls back to local defaults.

## Docker Services

| Service | Image | Port | Credentials |
|---------|-------|------|-------------|
| PostgreSQL | `pgvector/pgvector:pg16` | 5432 | `betterworld` / `betterworld_dev` |
| Redis | `redis:7-alpine` | 6379 | No auth (dev only) |
| MinIO | `minio/minio:latest` | 9000 (API), 9001 (Console) | `minioadmin` / `minioadmin` |

PostgreSQL is initialized with extensions: `uuid-ossp`, `vector` (pgvector 0.8+), `cube`, `earthdistance`, `pg_trgm` via `scripts/init-db.sql`.

## Testing

### Unit Tests

```bash
pnpm test                    # All unit tests
pnpm test --filter api       # API tests only
```

Test files live alongside source code: `apps/api/src/__tests__/*.test.ts`

Current test suites:
- `middleware.test.ts` — request-id, error handler (5 tests)
- `auth.test.ts` — requireAdmin, optionalAuth (8 tests)
- `rate-limit.test.ts` — sliding window, degraded mode, role-based limits (6 tests)

### Writing Tests

- Use Vitest + Hono test client for API middleware/route tests
- Mock external dependencies (Redis, DB) via `vi.mock()`
- Follow the pattern in existing test files for consistent structure

## CI Pipeline

GitHub Actions runs on every push to `main` and all PRs. Five parallel jobs:

1. **Lint** — `pnpm lint`
2. **Type Check** — `pnpm typecheck`
3. **Unit Tests** — `pnpm test`
4. **Integration Tests** — `pnpm test:integration` (with Postgres + Redis service containers)
5. **Build** — `pnpm build`

All five must pass for a PR to be mergeable.

## API Endpoints (Sprint 1)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/healthz` | None | Liveness check (always 200) |
| GET | `/readyz` | None | Readiness check (DB + Redis status) |

All responses use the standard envelope:

```json
// Success
{ "ok": true, "requestId": "uuid", ... }

// Error
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "..." }, "requestId": "uuid" }
```

Response headers on every request:
- `X-Request-ID` — Unique request identifier
- `X-RateLimit-Limit` — Max requests per window
- `X-RateLimit-Remaining` — Requests left in window
- `X-RateLimit-Reset` — Window reset timestamp (epoch seconds)

## Middleware Pipeline

Request processing order in `apps/api/src/app.ts`:

```
request-id → cors → logger → optionalAuth → rateLimit → routes → errorHandler
```

Rate limits by role: Public 30/min, Agent 60/min, Human 120/min, Admin 300/min.

## Coding Conventions

- TypeScript strict mode, zero errors
- ESLint zero errors (warnings acceptable for known patterns)
- Prettier for formatting (`pnpm exec prettier --write .`)
- Zod schemas at all system boundaries
- Import ordering: node builtins > external packages > relative imports (separated by blank lines)
- Use extensionless imports in `packages/db/` and `.js` extensions in `apps/api/`

## Troubleshooting

**Port already in use**
```bash
lsof -ti:4000 | xargs kill -9  # Free up API port
lsof -ti:3000 | xargs kill -9  # Free up Web port
```

**Docker daemon not running**
```bash
open -a Docker  # Start Docker Desktop (macOS)
```

**Database connection refused**
```bash
docker compose ps              # Check container health
docker compose logs postgres   # Check for errors
```

**Migration fails with "halfvec" error**
Edit the generated SQL in `packages/db/drizzle/` — remove double quotes around `halfvec(1024)`.

**Drizzle-kit "Cannot find module" error**
Ensure `packages/db/src/schema/` files use extensionless imports (no `.js`).

**pnpm install fails**
```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

**Turbo cache stale**
```bash
rm -rf .turbo
pnpm build
```
