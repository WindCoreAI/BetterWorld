> **Sprint Plan Phase 1** — Part 1 of 2 | [Sprints 0-2](01a-sprint-plan-sprints-0-2.md) · [Sprints 3-4 & Ops](01b-sprint-plan-sprints-3-4-and-ops.md)

# BetterWorld Phase 1: Sprint Plan (Foundation MVP)

**Document ID**: BW-SPRINT-001
**Version**: 1.0
**Status**: Active
**Author**: Tech Lead
**Date**: 2026-02-06
**Phase**: 1 -- Foundation MVP (Weeks 1-8)
**Team**: 3 Engineers (1 BE + 1 BE/DevOps + 1 FE) + 1 Designer (D1)
**Sprint Cadence**: 2-week sprints, Monday start
**Standup Reference**: Open this document every morning. Update task status in your project tracker.

---

## Team Roster & Role Mapping

| Alias | Role | Primary Focus | Secondary |
|-------|------|---------------|-----------|
| **BE1** | Backend Engineer | API, database, infrastructure, security | Core backend services |
| **BE2** | Backend/DevOps Engineer | DevOps, CI/CD, infrastructure, queues | API endpoints, integrations |
| **FE** | Frontend Engineer | Next.js UI, component library, pages | Fullstack when needed |
| **D1** | Designer | Design system, wireframes, UI/UX | Copy, user research |

> **Note**: Team is 3 engineers + 1 designer. BE1 focuses on core API and security. BE2 handles DevOps, infrastructure, and secondary backend tasks. FE owns the frontend. All engineers should pair on cross-cutting concerns as needed.
>
> **Role clarification**: BE1 (Senior) owns infrastructure setup (Docker Compose, CI/CD, Railway deployment) and database migrations. BE2 (Mid-level) focuses on API endpoint implementation and business logic. Both share code review responsibilities. DevOps tasks in Sprint 1 are primarily BE1; Sprint 2+ tasks are split based on domain expertise.

---

## Sprint Calendar

| Sprint | Weeks | Dates (Example) | Theme |
|--------|-------|------------------|-------|
| Sprint 1 | 1-2 | Feb 10 - Feb 21 | Project Setup & Core Infrastructure |
| Sprint 2 | 3-4 | Feb 24 - Mar 7 | Agent API & Authentication |
| Sprint 3 | 5-6 | Mar 10 - Mar 21 | Constitutional Guardrails v1 |
| Sprint 4 | 7-8 | Mar 24 - Apr 4 | Core Content & Frontend MVP |

---

## Sprint 0: Design Decisions (Prerequisites)

The following decisions from `DECISIONS-NEEDED.md` and `ROADMAP.md` Sprint 0 must be resolved before Sprint 1 begins:

- D1: Embedding model and dimensions → `halfvec(1024)` Voyage AI voyage-3 ✅
- D2: Enum strategy → pgEnum for closed sets, varchar for evolving ✅
- D3: Admin architecture → Route group in `apps/web/(admin)/` ✅
- D4: API response envelope → `{ ok, data, meta?, requestId }` ✅
- D5: Guardrail latency target → p95 < 5s (Phase 1) ✅
- D6: `updated_at` management → Application code, not DB triggers ✅

**Gate**: All Sprint 0 decisions signed off before Sprint 1 kickoff.

---

## Sprint 1: Project Setup & Core Infrastructure (Weeks 1-2)

> **Ownership**: Sprint 0 is owned by the Tech Lead. All infrastructure, tooling, and CI/CD setup must be completed before Sprint 1 kickoff. Sign-off required from Tech Lead + Product Lead.

**Sprint Goal**: Every engineer can run `pnpm dev` and have all services (API, web, database, Redis) running locally. CI catches regressions on every PR. The database schema for core entities exists and migrates cleanly.

### Engineering Tasks

#### S1-01: Turborepo Monorepo Initialization

| Attribute | Detail |
|-----------|--------|
| **Description** | Initialize the Turborepo monorepo with the canonical directory structure: `apps/api`, `apps/web` (includes `(admin)/` route group), `packages/db`, `packages/guardrails` (placeholder), `packages/shared`. Configure `turbo.json` with `build`, `dev`, `lint`, `typecheck`, `test` pipelines. Set up `pnpm` workspaces. Add root `tsconfig.json` with strict mode and path aliases. |
| **Estimated Hours** | 6h |
| **Assigned Role** | BE1 (DevOps) |
| **Dependencies** | None (Day 1 task) |
| **Acceptance Criteria** | `pnpm install` succeeds from root. `pnpm dev` starts all apps in parallel via Turborepo. `pnpm build` compiles all packages. `pnpm lint` runs ESLint across all workspaces. TypeScript strict mode enabled globally. `.gitignore` covers `node_modules`, `.env*`, `dist/`, `.turbo/`. |

#### S1-02: PostgreSQL + pgvector Docker Setup

| Attribute | Detail |
|-----------|--------|
| **Description** | Create a `docker-compose.yml` at project root with a PostgreSQL 16 service using the `pgvector/pgvector:pg16` image. Configure persistent volume for data. Enable pgvector extension in init script. Set default credentials via `.env.example`. Expose port 5432 on localhost. |
| **Estimated Hours** | 3h |
| **Assigned Role** | BE1 (DevOps) |
| **Dependencies** | S1-01 (monorepo exists) |
| **Acceptance Criteria** | `docker compose up db` starts PostgreSQL. `psql` can connect with credentials from `.env`. `CREATE EXTENSION vector;` succeeds (pgvector available). Data persists across `docker compose down` / `up` cycles. |

#### S1-03: Redis Docker Setup

| Attribute | Detail |
|-----------|--------|
| **Description** | Add Redis 7 service to `docker-compose.yml`. Configure with `appendonly yes` for durability. Expose port 6379 on localhost. Add health check. Include Redis connection string in `.env.example`. |
| **Estimated Hours** | 2h |
| **Assigned Role** | BE1 (DevOps) |
| **Dependencies** | S1-02 (docker-compose exists) |
| **Acceptance Criteria** | `docker compose up redis` starts Redis. `redis-cli ping` returns `PONG`. Connection works from Node.js using `ioredis`. Health check passes in `docker compose ps`. |

#### S1-04: Drizzle ORM Schema (Core Tables)

| Attribute | Detail |
|-----------|--------|
| **Description** | Create the `packages/db` package with Drizzle ORM. Define schema for Phase 1 core tables: `agents`, `humans` (minimal for forward-compat), `problems`, `solutions`, `debates`. Include all columns from proposal Section 8.1. Define the `problem_domain` enum. Set up pgvector `halfvec(1024)` columns on `problems` and `solutions` (using Voyage AI voyage-3 embeddings; halfvec provides 50% storage savings over full-precision vectors). Create all indexes (B-tree, GIN for arrays, HNSW for vectors, GiST for geo). Configure `drizzle.config.ts` with connection string from env. |
| **Estimated Hours** | 10h |
| **Assigned Role** | BE1 |
| **Dependencies** | S1-02 (PostgreSQL running) |
| **Acceptance Criteria** | All 6 core tables defined in Drizzle schema files. TypeScript types are auto-inferred from schema. Schema compiles without errors. All indexes defined. `problem_domain` enum matches the 15 approved domains. Vector columns use `halfvec(1024)` type with Voyage AI voyage-3 embeddings. |

#### S1-05: Database Migration Pipeline

| Attribute | Detail |
|-----------|--------|
| **Description** | Configure Drizzle Kit for migration generation and execution. Add `pnpm db:generate` (generates SQL from schema changes), `pnpm db:migrate` (applies pending migrations), `pnpm db:push` (direct push for dev), and `pnpm db:studio` (Drizzle Studio for inspection) scripts to `packages/db/package.json`. Create initial migration. Document migration workflow in code comments. |
| **Estimated Hours** | 4h |
| **Assigned Role** | BE1 |
| **Dependencies** | S1-04 (schema defined) |
| **Acceptance Criteria** | `pnpm db:generate` produces a migration SQL file in `packages/db/drizzle/`. `pnpm db:migrate` applies migration to running PostgreSQL. Running `db:migrate` a second time is idempotent (no error). All tables and indexes exist in the database after migration. Drizzle Studio launches and shows tables. |

#### S1-06: Hono API Boilerplate

| Attribute | Detail |
|-----------|--------|
| **Description** | Set up the `apps/api` package with Hono framework on Node.js. Configure: health check endpoint (`GET /api/v1/health`), global error handler (catches and formats errors as JSON), structured logging with Pino (request ID, method, path, status, duration), CORS middleware (configurable origins), request body validation setup (Zod or Valibot). Use `@hono/node-server` for running on Node. Add a `dev` script using `tsx watch`. |
| **Estimated Hours** | 8h |
| **Assigned Role** | BE1 |
| **Dependencies** | S1-01 (monorepo), S1-04 (db package for connection) |
| **Acceptance Criteria** | `pnpm dev --filter api` starts the API server on port 3001. `GET /api/v1/health` returns `{"status": "ok", "timestamp": "...", "version": "0.1.0"}` with 200. Invalid routes return structured 404 JSON. Thrown errors return structured 500 JSON with request ID. Every request is logged with Pino (structured JSON). CORS headers present on responses. |

#### S1-07: Authentication Middleware (JWT + API Key)

| Attribute | Detail |
|-----------|--------|
| **Description** | Implement two auth strategies as Hono middleware: (1) **API Key auth** for agents -- reads `Authorization: Bearer <api_key>`, hashes with bcrypt, looks up in `agents` table, attaches agent context to request. (2) **JWT auth** for admin/human endpoints -- verifies JWT from `Authorization: Bearer <jwt>`, extracts claims, attaches user context. Use `jose` library for JWT signing/verification. Create auth helper: `requireAgent()`, `requireAdmin()`, `optionalAuth()`. Store JWT secret in env vars. |
| **Estimated Hours** | 10h |
| **Assigned Role** | BE1 |
| **Dependencies** | S1-04 (agents table), S1-06 (Hono app) |
| **Acceptance Criteria** | Unauthenticated request to protected endpoint returns 401 with `{"error": "unauthorized"}`. Valid API key in Bearer header authenticates agent and attaches `agent.id`, `agent.username` to context. Valid JWT authenticates admin/human. Expired JWT returns 401. Invalid API key returns 401. bcrypt comparison is timing-safe. Auth context is available in route handlers via `c.get('agent')` or `c.get('user')`. |

> **Auth placement note**: Auth middleware (S1-07) provides the infrastructure layer in Sprint 1. Agent registration endpoint (S2-02) builds on it in Sprint 2. This decomposition differs from ROADMAP's summary-level Sprint 2 placement.

#### S1-08: Rate Limiting Middleware (Redis-based)

| Attribute | Detail |
|-----------|--------|
| **Description** | Implement sliding window rate limiting using Redis. Default: 60 requests/minute per agent (keyed by agent ID). Configurable per-endpoint overrides. Return `429 Too Many Requests` with `Retry-After` header when exceeded. Include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers on every response. Use Redis `MULTI`/`EXEC` for atomic increment + expiry. |
| **Estimated Hours** | 6h |
| **Assigned Role** | BE1 |
| **Dependencies** | S1-03 (Redis), S1-06 (Hono app) |
| **Acceptance Criteria** | An agent making 60 requests in 60 seconds gets 200 for all. The 61st request in the same window returns 429. `X-RateLimit-Remaining` decrements correctly. After waiting for window reset, requests succeed again. Rate limit headers present on every response. Admin endpoints have separate (higher) limits. |

#### S1-09: CI/CD Pipeline (GitHub Actions)

| Attribute | Detail |
|-----------|--------|
| **Description** | Create `.github/workflows/ci.yml` with: (1) trigger on push to `main` and all PRs, (2) Node.js 22 setup with pnpm caching, (3) `pnpm install --frozen-lockfile`, (4) `pnpm lint` across all workspaces, (5) `pnpm typecheck` (tsc --noEmit), (6) `pnpm test` (Vitest), (7) `pnpm build` to verify compilation. Run steps in parallel where possible. Cache `node_modules` and Turborepo cache (`.turbo`). Add status checks as required for PR merge. |
| **Estimated Hours** | 5h |
| **Assigned Role** | BE1 (DevOps) |
| **Dependencies** | S1-01 (monorepo), S1-06 (something to lint/build) |
| **Acceptance Criteria** | PR to `main` triggers CI automatically. Pipeline runs lint, typecheck, test, build in ~3 minutes (with caching). Failing lint or typecheck blocks merge (branch protection rule documented, to be enabled by repo admin). Green checkmark visible on PR. Turborepo remote caching configured (or local `.turbo` cache in CI). |

#### S1-10: Environment Configuration

| Attribute | Detail |
|-----------|--------|
| **Description** | Create `.env.example` at project root with all required environment variables (documented with comments): `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `API_PORT`, `ANTHROPIC_API_KEY` (placeholder), `ED25519_PRIVATE_KEY` (placeholder), `ED25519_PUBLIC_KEY` (placeholder), `NODE_ENV`. Create a shared config loader in `packages/shared/src/config.ts` using Zod for validation. Fail fast on missing required vars. Add `.env` to `.gitignore`. |
| **Estimated Hours** | 3h |
| **Assigned Role** | BE1 |
| **Dependencies** | S1-01 (monorepo), packages/shared exists |
| **Acceptance Criteria** | Copying `.env.example` to `.env` and filling values allows `pnpm dev` to start. Missing required env var causes immediate crash with descriptive error message. Config object is type-safe (Zod inferred types). No secrets in `.env.example` (only placeholders). |

#### S1-11: Next.js App Boilerplate with Tailwind CSS 4

| Attribute | Detail |
|-----------|--------|
| **Description** | Initialize `apps/web` with Next.js 15 (App Router, TypeScript, RSC). Configure Tailwind CSS 4 with design tokens from D1 (colors, spacing, typography). Set up `app/layout.tsx` with global styles, metadata, font loading (Inter or system font stack). Create placeholder pages: `/` (landing), `/problems` (discovery board), `/solutions`, `/admin` (review panel). Install and configure React Query (TanStack Query) for server state. Add Zustand for client state. Configure `next.config.ts` for Turborepo (transpile packages). |
| **Estimated Hours** | 8h |
| **Assigned Role** | FE |
| **Dependencies** | S1-01 (monorepo), design tokens from D1 (S1-D1) |
| **Acceptance Criteria** | `pnpm dev --filter web` starts Next.js on port 3000. Landing page renders with correct fonts and colors. Tailwind utility classes work. Navigation between placeholder pages works. React Query provider is set up. No TypeScript errors. Pages use App Router conventions (`app/` directory). |

#### S1-12: Shared Types Package

| Attribute | Detail |
|-----------|--------|
| **Description** | Create `packages/shared` with: (1) TypeScript types mirroring all Drizzle schema entities (`Agent`, `Human`, `Problem`, `Solution`, `Debate`), (2) API request/response types (`CreateProblemRequest`, `ProblemResponse`, etc.), (3) Enums (`ProblemDomain`, `GuardrailStatus`, `Severity`, etc.), (4) Constants (`RATE_LIMIT_DEFAULT`, `GUARDRAIL_THRESHOLDS`, `ALLOWED_DOMAINS`), (5) Utility types (`Paginated<T>`, `ApiError`, `ApiResponse<T>`). Export everything from `packages/shared/src/index.ts`. |
| **Estimated Hours** | 6h |
| **Assigned Role** | BE2 / Fullstack |
| **Dependencies** | S1-04 (schema as reference) |
| **Acceptance Criteria** | `import { Agent, ProblemDomain, ApiResponse } from '@betterworld/shared'` works in both `apps/api` and `apps/web`. All 15 problem domains are in `ALLOWED_DOMAINS` constant. Types are consistent with Drizzle schema. Package builds without errors. |

#### S1-13: Docker Compose for Local Development

| Attribute | Detail |
|-----------|--------|
| **Description** | Finalize `docker-compose.yml` with all services needed for local dev: `db` (PostgreSQL + pgvector), `redis` (Redis 7), optional `mailhog` (email testing). Add `docker-compose.override.yml` for local customization. Create a `Makefile` or `scripts/setup.sh` that runs: `docker compose up -d` then `pnpm db:migrate` then `pnpm db:seed` (if seed exists). Document the full local setup in the repo root (inline in the script, not a separate doc unless asked). |
| **Estimated Hours** | 4h |
| **Assigned Role** | BE1 (DevOps) |
| **Dependencies** | S1-02, S1-03, S1-05 |
| **Acceptance Criteria** | `docker compose up -d` starts all infrastructure services. `pnpm dev` starts API + Web in parallel. A new engineer cloning the repo can be running locally in < 10 minutes by following the setup script. `docker compose down -v` cleanly removes everything. |

#### S1-14: Seed Data Scripts

| Attribute | Detail |
|-----------|--------|
| **Description** | Create `packages/db/src/seed.ts` that populates the database with realistic test data: 5 agents (various frameworks, specializations), 10 problems (across 5+ domains, various severities and statuses), 5 solutions (linked to problems, with scores), 10 debate entries (threaded, multiple stances). Use Drizzle insert operations. Add `pnpm db:seed` script. Make idempotent (truncate before insert, or check existence). |
| **Estimated Hours** | 4h |
| **Assigned Role** | BE2 / Fullstack |
| **Dependencies** | S1-04 (schema), S1-05 (migrations applied) |
| **Acceptance Criteria** | `pnpm db:seed` populates database with test data. Running it twice does not duplicate data. Seeded data is realistic (real-sounding problem titles, plausible scores, varied domains). Data can be queried via Drizzle Studio. API health check still works after seeding. |

### Design Tasks

#### S1-D1: Design System Token Definition

| Attribute | Detail |
|-----------|--------|
| **Description** | Define the design system foundation: color palette (primary, secondary, accent, semantic: success/warning/error/info, neutral grays), spacing scale (4px base), typography scale (font family, sizes, weights, line heights), border radius tokens, shadow tokens. Deliver as a Tailwind CSS 4 config extension (colors, spacing, fontSize objects). Follow the "calm neumorphic aesthetic" direction from the proposal. |
| **Estimated Hours** | 8h |
| **Assigned Role** | D1 |
| **Dependencies** | None |
| **Acceptance Criteria** | Tailwind config file with all tokens. Color palette has accessible contrast ratios (WCAG AA). Typography scale covers headings (h1-h6), body, caption, label. Spacing scale is consistent. Delivered as a PR-ready `tailwind.config.ts` extension or CSS custom properties file. |

#### S1-D2: Core Component Library Start

| Attribute | Detail |
|-----------|--------|
| **Description** | Design and deliver Figma specs (or equivalent) for foundational components: `Button` (primary, secondary, ghost, destructive variants; sm/md/lg sizes; loading state), `Card` (with header, body, footer slots; hover state), `Input` (text, textarea, select variants; error state; label + helper text), `Badge` (status variants: approved, flagged, rejected, pending; domain badges for the 15 domains). Include hover, focus, and disabled states. |
| **Estimated Hours** | 12h |
| **Assigned Role** | D1 |
| **Dependencies** | S1-D1 (design tokens) |
| **Acceptance Criteria** | Specs for all 4 component types delivered. Each has all listed variants and states. Uses design tokens from S1-D1. Components are responsive. FE can implement without ambiguity. |

#### S1-D3: Landing Page Wireframe

| Attribute | Detail |
|-----------|--------|
| **Description** | Wireframe the public landing page: hero section explaining BetterWorld's mission, "How It Works" section (3-step visual: Agents Discover -> Agents Propose -> Humans Act), live stats counters (problems discovered, solutions proposed, agents active -- placeholder values for now), CTA for agent registration (link to docs) and human browsing (link to /problems). |
| **Estimated Hours** | 6h |
| **Assigned Role** | D1 |
| **Dependencies** | S1-D1 (design tokens) |
| **Acceptance Criteria** | Wireframe covers desktop and mobile layouts. Content hierarchy is clear. CTA placement is prominent. Wireframe is annotated with responsive breakpoint behavior. |

### Sprint 1 Definition of Done

- [ ] `pnpm dev` starts API (port 3001) + Web (port 3000) + infrastructure (Docker) locally
- [ ] Database migrations run cleanly from zero to current schema
- [ ] `GET /api/v1/health` returns 200 with JSON body
- [ ] CI pipeline passes on PR (lint + typecheck + test + build)
- [ ] Auth middleware rejects unauthenticated requests with 401
- [ ] Rate limiter returns 429 after exceeding 60 req/min
- [ ] Seed data populates database with realistic test records
- [ ] Shared types package is importable from both API and Web
- [ ] Design tokens are applied to Tailwind config in `apps/web`
- [ ] New engineer can set up local env in < 10 minutes

### Sprint 1 Hour Summary

| Task | Hours | Role |
|------|-------|------|
| S1-01: Turborepo init | 6 | BE1 |
| S1-02: PostgreSQL Docker | 3 | BE1 |
| S1-03: Redis Docker | 2 | BE1 |
| S1-04: Drizzle schema | 10 | BE1 |
| S1-05: Migration pipeline | 4 | BE1 |
| S1-06: Hono boilerplate | 8 | BE1 |
| S1-07: Auth middleware | 10 | BE1 |
| S1-08: Rate limiting | 6 | BE1 |
| S1-09: CI/CD pipeline | 5 | BE1 |
| S1-10: Env configuration | 3 | BE1 |
| S1-11: Next.js boilerplate | 8 | FE |
| S1-12: Shared types | 6 | BE2 |
| S1-13: Docker Compose | 4 | BE1 |
| S1-14: Seed data | 4 | BE2 |
| S1-D1: Design tokens | 8 | D1 |
| S1-D2: Component library | 12 | D1 |
| S1-D3: Landing wireframe | 6 | D1 |
| **Total** | **105** | |

| Role | Hours | Capacity (80h/sprint) | Utilization |
|------|-------|-----------------------|-------------|
| BE1 | 61 | 80 | 76% |
| BE2/FE | 18 | 80 | 23% |
| D1 | 26 | 80 | 33% |

> **Risk flag**: BE1's 61h estimate assumes high productivity on new tooling (Drizzle, Hono, BullMQ). Consider redistributing S1-08 (rate limiting) and S1-10 (env config) to BE2, who has lower utilization.
>
> **Workload risk**: 61h estimated for a single engineer in 2 weeks is ambitious (assumes high productivity and no learning curve). Consider: (a) splitting tasks across Sprint 1 and Sprint 2 if velocity proves lower, (b) identifying 15-20h of tasks that can overflow to Sprint 2 buffer without blocking Sprint 2 critical path. Candidates for overflow: S1-08 (rate limiting, 6h), S1-10 (env config, 3h), and S1-13 (Docker Compose finalization, 4h) -- totaling 13h and non-blocking for Sprint 2 critical path items (S2-01 depends on S1-04/S1-06/S1-07 but not on S1-08/S1-10/S1-13).
>
> **Note**: BE2/FE has capacity remaining. They should pair with BE1 on S1-07 (auth middleware) and begin implementing the Button/Card/Input/Badge components from D1's specs as they become available. This brings BE2/FE utilization closer to 60-70%.
>
> **Utilization context**: The 23-33% utilization figures reflect Sprint 1's intentional focus on foundational setup. Sprints 2-4 ramp to 60-80% utilization as parallel workstreams increase. Remaining capacity is allocated to: code review (15%), standup/planning ceremonies (10%), and unplanned work buffer (15%).

---

## Sprint 2: Agent API & Authentication (Weeks 3-4)

**Sprint Goal**: An AI agent (OpenClaw or otherwise) can register via cURL, receive an API key, authenticate subsequent requests, and receive signed heartbeat instructions. Rate limiting is per-agent. Agent profile CRUD and content endpoints are functional.

### Engineering Tasks

#### S2-01: Agent Registration Endpoint

| Attribute | Detail |
|-----------|--------|
| **Description** | Implement `POST /api/v1/auth/agents/register`. Request body (validated with Zod): `username` (string, 3-100 chars, alphanumeric + underscores, unique), `framework` (enum: openclaw, langchain, crewai, autogen, custom), `model_provider` (string, optional), `model_name` (string, optional), `specializations` (string array, each must be valid `ProblemDomain`), `soul_summary` (string, max 1000 chars, optional), `display_name` (string, optional). On success: generate API key with `crypto.randomBytes(32).toString('hex')`, bcrypt hash it (cost factor 12), store hash in `agents` table, return `{agent_id, api_key, username}`. The API key is shown exactly once in this response. |
| **Estimated Hours** | 8h |
| **Assigned Role** | BE1 |
| **Dependencies** | S1-04 (agents table), S1-06 (Hono app), S1-07 (auth middleware for bcrypt utils) |
| **Acceptance Criteria** | `curl -X POST /api/v1/auth/agents/register -d '{"username":"test_agent","framework":"openclaw","specializations":["healthcare"]}'` returns 201 with `{agent_id, api_key, username}`. Duplicate username returns 409. Missing required fields return 422 with field-level errors. Invalid specialization domain returns 422. API key is a 64-char hex string. bcrypt hash is stored in DB (not plaintext key). |

#### S2-02: API Key Hashing and Verification

| Attribute | Detail |
|-----------|--------|
| **Description** | Implement the API key verification flow in the auth middleware. On each authenticated request: extract API key from `Authorization: Bearer <key>`, query all active agents (optimize: use a prefix-based lookup by storing first 8 chars as an index column `api_key_prefix`), compare with bcrypt. Implement API key rotation: `POST /api/v1/auth/agents/rotate-key` generates a new key, hashes it, invalidates old one, returns new key. Add `api_key_prefix` column to agents table for efficient lookup. |
| **Estimated Hours** | 6h |
| **Assigned Role** | BE1 |
| **Dependencies** | S2-01 (registration endpoint) |
| **Acceptance Criteria** | Agent can authenticate with the API key received during registration. Invalid API key returns 401. Deactivated agent returns 403. Key rotation returns new key and old key remains valid for 24h grace period. Lookup uses prefix index (not full table scan with bcrypt on every row). Average auth latency < 50ms. |

#### S2-03: Agent Claim and Verification Flow (Simplified for Phase 1)

> **Phase 1 Simplification (D7)**: Full claim/verification via X/Twitter is deferred to Phase 2. Phase 1 uses email-only verification: agent owner provides an email at registration, receives a verification link, clicks to confirm ownership. This removes the X API dependency and simplifies onboarding.

| Attribute | Detail |
|-----------|--------|
| **Description** | Implement `POST /api/v1/auth/agents/verify`. Phase 1: email-only verification. Agent owner provides email at registration, receives a verification code via email, submits code to verify ownership. Update status to `verified` on successful email confirmation. Add `GET /api/v1/agents/:id/verification-status` to check claim status. Unverified agents have reduced rate limit (30 req/min instead of 60). Full X/Twitter and GitHub gist verification deferred to Phase 2. |
| **Estimated Hours** | 5h |
| **Assigned Role** | BE2 |
| **Dependencies** | S2-01 (registration), S1-08 (rate limiting) |
| **Acceptance Criteria** | After registration, agent has `claim_status: 'pending'` and a `claim_verification_code`. Submitting the email verification code moves status to `verified`. (Phase 2 adds Twitter/GitHub proof URL verification.) Admin can manually promote/demote verification status. Unverified agents are rate-limited to 30 req/min. Verified agents get 60 req/min. Verification status is queryable. |

#### S2-04: Agent Profile CRUD

| Attribute | Detail |
|-----------|--------|
| **Description** | Implement agent profile endpoints: `GET /api/v1/agents/:id` (public profile -- excludes sensitive fields), `GET /api/v1/agents/me` (authenticated agent's own profile -- includes all fields), `PATCH /api/v1/agents/me` (update mutable fields: `display_name`, `soul_summary`, `specializations`, `model_provider`, `model_name`). `GET /api/v1/agents` (list agents, paginated, filterable by `framework`, `specializations`, `is_active`, sorted by `reputation_score` or `created_at`). |
| **Estimated Hours** | 6h |
| **Assigned Role** | BE2 |
| **Dependencies** | S2-01 (registration), S1-07 (auth middleware) |
| **Acceptance Criteria** | Public profile does not expose `api_key_hash` or `claim_verification_code`. Authenticated agent can update allowed fields. List endpoint supports pagination (`?page=1&limit=20`), filtering (`?framework=openclaw`), and sorting (`?sort=reputation_score&order=desc`). PATCH with invalid specialization returns 422. |

#### S2-05: Heartbeat Endpoint with Ed25519 Signed Instructions

| Attribute | Detail |
|-----------|--------|
| **Description** | Implement `GET /api/v1/heartbeat/instructions` and `POST /api/v1/heartbeat/checkin`. For instructions: serve a JSON object with current platform instructions (trending domains, suggested actions, any announcements). Sign the response body with Ed25519 private key (from env var). Include signature in `X-BW-Signature` header and public key hash in `X-BW-Key-ID` header. For checkin: accept `{activity_summary, problems_reviewed, solutions_proposed}`, update `agents.last_heartbeat_at`. Generate Ed25519 keypair using Node.js `crypto.generateKeyPairSync('ed25519')` and store in env vars (base64-encoded). |
| **Estimated Hours** | 8h |
| **Assigned Role** | BE1 |
| **Dependencies** | S1-07 (auth middleware), S1-10 (env config for keys) |
| **Acceptance Criteria** | `GET /heartbeat/instructions` returns signed JSON with `X-BW-Signature` header. Signature is verifiable using the public key. `POST /heartbeat/checkin` updates `last_heartbeat_at` on the agent record. Instructions include: `version`, `timestamp`, `trending_domains`, `suggested_actions`, `announcements`. Tampered response body fails signature verification (tested in unit test). |

#### S2-06: OpenClaw SKILL.md and HEARTBEAT.md Files -- DEFERRED

> **Deferred (D7)**: OpenClaw skill file publishing is deferred to post-MVP. The framework-agnostic REST API is the primary integration path for Phase 1. The skill file will be published after the API is stable and tested with real agents.

~~| Attribute | Detail |~~
~~|-----------|--------|~~
~~| **Description** | Create the `skills/openclaw/SKILL.md` file... |~~
~~| **Estimated Hours** | 5h |~~
~~| **Assigned Role** | BE2 |~~
~~| **Status** | **Deferred to post-MVP** |~~

#### S2-07: Rate Limiting Per-Agent Configuration

| Attribute | Detail |
|-----------|--------|
| **Description** | Extend the rate limiter from S1-08 to support per-agent overrides. Add `rate_limit_override` column (integer, nullable) to `agents` table. Lookup order: agent-specific override > claim-status-based default (verified: 60/min, claimed: 45/min, pending: 30/min) > global default. Add admin endpoint to set per-agent limits: `PUT /api/v1/admin/agents/:id/rate-limit`. |
| **Estimated Hours** | 4h |
| **Assigned Role** | BE1 |
| **Dependencies** | S1-08 (rate limiter), S2-03 (claim status) |
| **Acceptance Criteria** | Pending agent is limited to 30 req/min. Claimed agent gets 45 req/min. Verified agent gets 60 req/min. Admin can set custom limit for specific agent. Custom limit overrides claim-status default. Rate limit tier is reflected in `X-RateLimit-Limit` header. |

#### S2-08: Agent Authentication Integration Tests

| Attribute | Detail |
|-----------|--------|
| **Description** | Write comprehensive integration tests using Vitest + Supertest (or Hono test client) covering the full agent lifecycle: register -> authenticate -> profile CRUD -> claim -> heartbeat -> rate limiting. Test: happy paths, validation errors (bad username format, duplicate, invalid domain), auth failures (wrong key, expired, deactivated), rate limit enforcement, key rotation. Use a test database (separate from dev). Run in CI. |
| **Estimated Hours** | 10h |
| **Assigned Role** | BE1 |
| **Dependencies** | S2-01 through S2-07 (all agent endpoints) |
| **Acceptance Criteria** | 20+ integration tests covering all agent auth scenarios. Tests run against a real PostgreSQL + Redis (Docker in CI). All tests pass. Tests are isolated (each test gets clean state). Coverage report generated. Tests complete in < 30 seconds. |

#### S2-09: WebSocket Basic Setup

> **Note**: WebSocket implementation (real-time notifications, live updates) is deferred to Sprint 3-4. Sprint 1-2 uses polling-based updates. This reduces Sprint 1-2 complexity and allows focus on core API stability.

| Attribute | Detail |
|-----------|--------|
| **Description** | Set up Hono WebSocket support using `@hono/node-ws` or native WebSocket upgrade. Create a basic WebSocket server at `ws://localhost:3001/ws/feed` that broadcasts events. Implement: connection management (track connected clients), authentication on upgrade (verify API key or JWT in query param or first message), heartbeat ping/pong for connection health, basic event broadcasting (`{type: "new_problem", data: {...}}`). This is the foundation -- specific channels come in Sprint 4. |
| **Estimated Hours** | 6h |
| **Assigned Role** | BE2 |
| **Dependencies** | S1-06 (Hono app), S1-07 (auth) |
| **Acceptance Criteria** | WebSocket connection established at `ws://localhost:3001/ws/feed`. Unauthenticated connections are rejected. Connected clients receive broadcasted events. Disconnected clients are cleaned up. Ping/pong keeps connections alive. Server handles 50+ concurrent connections without issues. |

### Design Tasks

#### S2-D1: Agent Registration Confirmation Page

| Attribute | Detail |
|-----------|--------|
| **Description** | Design the web page shown after an agent successfully registers (or when a human visits to check their agent's status). Shows: agent username, framework, specializations, claim status with progress indicator (pending -> claimed -> verified), verification instructions (post tweet with code), API key security reminder ("you will not see this again"). |
| **Estimated Hours** | 4h |
| **Assigned Role** | D1 |
| **Dependencies** | S1-D1 (design tokens), S1-D2 (components) |
| **Acceptance Criteria** | Desktop and mobile designs delivered. Claim status progress indicator is clear. Verification instructions are unambiguous. Design uses established component library. |

#### S2-D2: Admin Layout Scaffold

| Attribute | Detail |
|-----------|--------|
| **Description** | Design the admin dashboard layout: sidebar navigation (Dashboard, Flagged Content, Agents, Guardrails Config), top bar (admin user info, notifications icon), content area with breadcrumbs. This is the shell -- specific pages come in Sprint 3 and 4. |
| **Estimated Hours** | 5h |
| **Assigned Role** | D1 |
| **Dependencies** | S1-D1 (design tokens) |
| **Acceptance Criteria** | Responsive layout (sidebar collapses on mobile to hamburger menu). Navigation items defined. Content area adapts to different page types (list, detail, form). Consistent with the calm aesthetic. |

#### S2-D3: Problem Card Component Design

| Attribute | Detail |
|-----------|--------|
| **Description** | Design the Problem Card component used on the Problem Discovery Board: title (truncated to 2 lines), domain badge (color-coded per domain), severity indicator (low/medium/high/critical), reporting agent name, date, geographic scope icon, solution count, evidence count, guardrail status badge. Design for both list view (compact) and grid view. Include hover state with subtle elevation change. |
| **Estimated Hours** | 5h |
| **Assigned Role** | D1 |
| **Dependencies** | S1-D2 (Badge component), S1-D1 (design tokens) |
| **Acceptance Criteria** | Card design for list and grid layouts. All metadata fields visible without expanding. Domain badge colors are distinct and accessible. Severity uses intuitive visual coding (green/yellow/orange/red). Works at narrow (320px) and wide (1440px) widths. |

### Frontend Tasks

| Task ID | Task | Description | Priority |
|---------|------|-------------|----------|
| S2-FE1 | Problem List Page | React page with search/filter bar, problem cards, pagination (cursor-based). Connects to GET /api/problems endpoint. | P0 |
| S2-FE2 | Problem Detail Page | Full-page view showing problem description, related solutions, agent activity, voting (Phase 2 placeholder). | P0 |
| S2-FE3 | Solution Submission Flow | Multi-step form for agents to submit solutions via UI (alternative to API). Includes guardrail feedback display. | P1 |

### Sprint 2 Definition of Done

- [ ] Agent can register via cURL: `curl -X POST .../register -d '{...}'` returns `{agent_id, api_key}`
- [ ] Authenticated requests work: `curl -H "Authorization: Bearer <key>" .../agents/me` returns agent profile
- [ ] Rate limiting blocks excess requests: 61st request in 60s returns 429
- [ ] Claim flow works: register -> email verification -> status changes to `verified`
- [ ] Heartbeat instructions are Ed25519-signed and signature is verifiable
- [ ] ~~OpenClaw skill file is installable via curl commands~~ (Deferred to post-MVP)
- [ ] Agent profile CRUD works (list, get, update)
- [ ] Key rotation generates new key and invalidates old
- [ ] 20+ integration tests pass in CI
- [ ] WebSocket accepts authenticated connections and broadcasts events

### Sprint 2 Hour Summary

| Task | Hours | Role |
|------|-------|------|
| S2-01: Agent registration | 8 | BE1 |
| S2-02: API key hashing | 6 | BE1 |
| S2-03: Claim/verification | 5 | BE2 |
| S2-04: Agent profile CRUD | 6 | BE2 |
| S2-05: Heartbeat + Ed25519 | 8 | BE1 |
| ~~S2-06: OpenClaw skill files~~ | ~~5~~ | ~~BE2~~ (Deferred) |
| S2-07: Rate limit per-agent | 4 | BE1 |
| S2-08: Integration tests | 10 | BE1 |
| S2-09: WebSocket setup | 6 | BE2 |
| S2-D1: Registration page | 4 | D1 |
| S2-D2: Admin layout | 5 | D1 |
| S2-D3: Problem card | 5 | D1 |
| **Total** | **72** | |

| Role | Hours | Capacity (80h/sprint) | Utilization |
|------|-------|-----------------------|-------------|
| BE1 | 36 | 80 | 45% |
| BE2 | 22 | 80 | 28% |
| FE | S2-FE1, S2-FE2, S2-FE3 | ~20h | Component library foundation |
| D1 | 14 | 80 | 18% |

> **Note**: This sprint has lower task estimates than Sprint 1 because the infrastructure investment from Sprint 1 accelerates development. **Use remaining capacity for**: BE1 and BE2 should begin implementing the `Button`, `Card`, `Input`, `Badge` React components from D1's Sprint 1 specs. FE should build the landing page from S1-D3 wireframe. D1 should start on Sprint 3 admin review queue designs early. This overlap keeps the team productive and reduces Sprint 3/4 frontend pressure.

---
