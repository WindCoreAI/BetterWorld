# Tasks: Sprint 1 — Project Setup & Core Infrastructure

**Input**: Design documents from `/specs/001-sprint1-core-infra/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md

**Tests**: Tests are included alongside implementation tasks per the constitution's Test-Driven Quality Gates principle. Unit tests are co-located with implementation tasks where appropriate.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Exact file paths included in all descriptions

---

## Phase 1: Setup (Project Initialization) ✅

**Purpose**: Initialize the Turborepo monorepo, configure tooling, and establish the workspace structure that all subsequent work builds on.

- [x] T001 Initialize root package.json with pnpm workspaces, name `@betterworld/root`, and root scripts (`dev`, `build`, `lint`, `typecheck`, `test`) in `package.json`
- [x] T002 Create `pnpm-workspace.yaml` defining workspaces: `apps/*`, `packages/*`
- [x] T003 Create `turbo.json` with pipelines: `build` (depends on `^build`), `dev` (persistent, no cache), `lint`, `typecheck`, `test`, `test:integration` in `turbo.json`
- [x] T004 [P] Create root `tsconfig.json` with TypeScript strict mode, path aliases (`@betterworld/shared`, `@betterworld/db`, `@betterworld/guardrails`), and `target: ES2022`
- [x] T005 [P] Create `.eslintrc.cjs` with TypeScript ESLint config, Prettier integration, and import ordering rules
- [x] T006 [P] Create `.prettierrc` with consistent formatting rules (semi, singleQuote, trailingComma, printWidth)
- [x] T007 [P] Create `.gitignore` covering `node_modules/`, `.env*` (except `.env.example`), `dist/`, `.turbo/`, `.next/`, `drizzle/meta/`
- [x] T008 Run `pnpm install` to verify workspace resolution and generate `pnpm-lock.yaml`

**Checkpoint**: ✅ `pnpm install` succeeds (436 packages). Root scripts are defined. TypeScript strict mode is configured.

---

## Phase 2: Foundational (Blocking Prerequisites) ✅

**Purpose**: Create all workspace packages with their initial structure. These MUST be complete before any user story can be implemented.

**CRITICAL**: No user story work can begin until this phase is complete.

### Workspace Scaffolding

- [x] T009 [P] Create `packages/shared/package.json` with name `@betterworld/shared`, TypeScript config, and barrel export in `packages/shared/src/index.ts`
- [x] T010 [P] Create `packages/db/package.json` with name `@betterworld/db`, Drizzle ORM + drizzle-kit dependencies, and `packages/db/src/index.ts`
- [x] T011 [P] Create `packages/guardrails/package.json` with name `@betterworld/guardrails` and stub export in `packages/guardrails/src/index.ts`
- [x] T012 [P] Create `apps/api/package.json` with name `@betterworld/api`, Hono + `@hono/node-server` + tsx dependencies, dev script (`tsx watch src/index.ts`), and `apps/api/tsconfig.json`
- [x] T013 [P] Create `apps/web/package.json` with name `@betterworld/web`, Next.js 15 + Tailwind CSS 4 + React Query + Zustand dependencies, and `apps/web/tsconfig.json`

### Core Shared Types

- [x] T014 [P] Define error types: `AppError` class and `ErrorCode` type union in `packages/shared/src/types/errors.ts` (per contracts/errors.ts)
- [x] T015 [P] Define API envelope types: `ApiResponse<T>`, `ApiErrorResponse`, `PaginatedResponse<T>`, `PaginationMeta`, `PaginationQuery` in `packages/shared/src/types/api.ts` (per contracts/envelope.ts)
- [x] T016 [P] Define 15 UN SDG domain constants (`ALLOWED_DOMAINS`) and rate limit defaults (`RATE_LIMIT_DEFAULTS`) in `packages/shared/src/constants/domains.ts` and `packages/shared/src/constants/rate-limits.ts`
- [x] T017 Update `packages/shared/src/index.ts` barrel export to re-export all types, constants, and schemas

**Checkpoint**: ✅ All packages compile. `@betterworld/shared` imports work in both apps.

---

## Phase 3: User Story 1 — Developer Local Environment Setup (Priority: P1) ✅ COMPLETE

**Goal**: A developer can clone the repo, run setup commands, and have all services (API, web, DB, Redis) running locally within 10 minutes.

**Independent Test**: Clone repo from scratch → `pnpm install` → `docker compose up -d` → `pnpm dev` → verify API on port 4000 and web on port 3000.

### Implementation for User Story 1

- [x] T018 [US1] Create `.env.example` at project root with all required environment variables: `DATABASE_URL`, `REDIS_URL`, `API_PORT` (4000), `WEB_PORT` (3000), `JWT_SECRET`, `ANTHROPIC_API_KEY` (placeholder), `CORS_ORIGINS`, `LOG_LEVEL`, `NODE_ENV`, `STORAGE_PROVIDER`, `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_BUCKET`
- [x] T019 [US1] Implement environment config loader with Zod validation in `packages/shared/src/config.ts` — parse and validate all env vars, fail fast with descriptive errors on missing/invalid values
- [x] T020 [US1] Create `docker-compose.yml` at project root with PostgreSQL 16 (`pgvector/pgvector:pg16`) on port 5432, Redis 7 (`redis:7-alpine`) on port 6379, with health checks, persistent volumes, and init script enabling pgvector + earthdistance extensions
- [x] T021 [US1] Create `apps/api/src/index.ts` entry point that bootstraps the Hono server on configured port using `@hono/node-server`, importing from `app.ts`
- [x] T022 [US1] Create minimal `apps/api/src/app.ts` with Hono instance creation (detailed middleware/routes added in later stories)
- [x] T023 [US1] Create `apps/web/app/layout.tsx` root layout with Inter font, basic metadata, and `apps/web/app/page.tsx` with a minimal landing page
- [x] T024 [US1] Verify full setup flow: `pnpm install` → `docker compose up -d postgres redis` → `pnpm dev` starts both API (port 4000) and Web (port 3000) without errors — **verified: healthz returns 200, readyz shows all green, web returns 200**

**Checkpoint**: ✅ Full setup flow verified end-to-end. API + Web + DB + Redis all operational.

---

## Phase 4: User Story 2 — API Health and Request Handling (Priority: P1) ✅

**Goal**: The API returns properly structured JSON using the standard envelope format. Health checks confirm system status. Errors return structured responses with request tracking IDs.

**Independent Test**: `curl http://localhost:4000/healthz` returns `{ ok: true, requestId: "..." }`. `curl http://localhost:4000/nonexistent` returns structured 404.

### Implementation for User Story 2

- [x] T025 [P] [US2] Implement request-id middleware in `apps/api/src/middleware/request-id.ts` — inject UUID as `X-Request-ID` header, attach to Hono context
- [x] T026 [P] [US2] Implement CORS middleware in `apps/api/src/middleware/cors.ts` — read allowed origins from env config, set proper headers (no wildcard in production)
- [x] T027 [P] [US2] Implement Pino structured logger middleware in `apps/api/src/middleware/logger.ts` — log request ID, method, path, status code, and duration for every request
- [x] T028 [US2] Implement global error handler middleware in `apps/api/src/middleware/error-handler.ts` — catch `AppError` instances and unhandled errors, return standard `{ ok: false, error: { code, message, details }, requestId }` envelope, never leak stack traces in production
- [x] T029 [US2] Implement Zod validation middleware in `apps/api/src/middleware/validate.ts` — validate body, query, and param schemas, return 422 with field-level errors on failure
- [x] T030 [US2] Implement health routes in `apps/api/src/routes/health.routes.ts` — `GET /healthz` (liveness: returns 200 with `{ ok: true }`) and `GET /readyz` (readiness: checks DB + Redis connectivity, returns status per contracts/health.ts)
- [x] T031 [US2] Create DI container in `apps/api/src/lib/container.ts` — initialize DB client (Drizzle), Redis client (ioredis), expose via Hono context variables
- [x] T032 [US2] Wire all middleware and routes into `apps/api/src/app.ts` in correct order: request-id → cors → logger → optionalAuth → rateLimit → routes (health, 404 fallback)
- [x] T033 [US2] Write unit tests for error handler and request-id middleware in `apps/api/src/__tests__/middleware.test.ts` using Vitest + Hono test client — **5 tests passing**

**Checkpoint**: ✅ Middleware pipeline complete. Unit tests pass. 404 fallback returns structured envelope.

---

## Phase 5: User Story 3 — Database Schema and Data Foundation (Priority: P1) ✅

**Goal**: Core entity tables (agents, humans, problems, solutions, debates) exist in the database with correct types, constraints, indexes, and vector columns. Migrations are repeatable. Seed data is realistic.

**Independent Test**: `pnpm db:migrate` creates all tables. `pnpm db:seed` populates test data. `pnpm db:studio` shows all entities.

### Implementation for User Story 3

- [x] T034 [US3] Define all pgEnum types in `packages/db/src/schema/enums.ts`: `problemDomainEnum` (15 values), `severityLevelEnum`, `problemStatusEnum`, `solutionStatusEnum`, `guardrailStatusEnum`, `claimStatusEnum`, `entityTypeEnum`
- [x] T035 [P] [US3] Define `agents` table schema in `packages/db/src/schema/agents.ts` with all columns per data-model.md: id, username, display_name, framework, model_provider, model_name, api_key_hash, api_key_prefix, soul_summary, specializations (TEXT[]), reputation_score, claim_status, is_active, timestamps. Include all indexes (UNIQUE username, GIN specializations, B-tree framework/claim_status, partial active index)
- [x] T036 [P] [US3] Define `humans` table schema in `packages/db/src/schema/humans.ts` with forward-compat columns per data-model.md: id, email, password_hash, display_name, role, reputation_score, token_balance (decimal 18,8), is_active, timestamps. Include indexes
- [x] T037 [P] [US3] Define `problems` table schema in `packages/db/src/schema/problems.ts` with all columns per data-model.md including `embedding halfvec(1024)`, `guardrail_status` defaulting to 'pending', `domain` (problemDomainEnum), geographic fields (lat/lng), denormalized counters, CHECK constraint on alignment_score (0-1). Include composite indexes
- [x] T038 [P] [US3] Define `solutions` table schema in `packages/db/src/schema/solutions.ts` with all columns per data-model.md including scoring fields (impact, feasibility, cost_efficiency, composite), `embedding halfvec(1024)`, `guardrail_status`. Include composite indexes, CHECK constraints on scores
- [x] T039 [P] [US3] Define `debates` table schema in `packages/db/src/schema/debates.ts` with self-referential `parent_debate_id` FK, stance, content, guardrail_status. Include composite indexes on (solution_id, created_at)
- [x] T040 [US3] Create barrel export in `packages/db/src/schema/index.ts` re-exporting all tables, enums, and relations
- [x] T041 [US3] Create Drizzle DB client in `packages/db/src/index.ts` — initialize postgres connection via `DATABASE_URL`, create Drizzle instance with schema, export `db` and `schema`
- [x] T042 [US3] Create `packages/db/drizzle.config.ts` with connection string from env, schema path, and output directory for migrations
- [x] T043 [US3] Add db scripts to `packages/db/package.json`: `db:generate` (drizzle-kit generate), `db:migrate` (drizzle-kit migrate), `db:push` (drizzle-kit push), `db:studio` (drizzle-kit studio), `db:seed` (tsx src/seed.ts). Add root-level aliases in root `package.json`
- [x] T044 [US3] Run `pnpm db:generate` to create initial migration SQL, then `pnpm db:migrate` to apply it to the local PostgreSQL instance — **5 tables, 90 columns, 24 indexes, 5 FKs created successfully**
- [x] T045 [US3] Implement seed script in `packages/db/src/seed.ts` — insert 5 agents (varied frameworks), 2 humans (1 admin, 1 user), 10 problems (across 5+ domains, varied severity), 5 solutions (with scores), 10 debates (threaded). Use transaction, truncate tables before insert for idempotency
- [x] T046 [US3] Define entity TypeScript types inferred from Drizzle schema (`Agent`, `NewAgent`, `Problem`, `NewProblem`, etc.) in `packages/shared/src/types/entities.ts` and re-export from barrel

**Checkpoint**: ✅ All tables created, migration applied, seed data populated (5 agents, 2 humans, 10 problems, 5 solutions, 10 debates).

---

## Phase 6: User Story 4 — Authentication and Access Control (Priority: P1) ✅

**Goal**: API key auth (agents) and JWT auth (humans/admin) middleware protects endpoints. Unauthenticated requests are rejected. Agent/user identity is available in route handlers.

**Independent Test**: `curl -H "Authorization: Bearer invalid" localhost:4000/readyz` returns 401. Valid credentials attach identity to context.

### Implementation for User Story 4

- [x] T047 [US4] Implement auth middleware in `apps/api/src/middleware/auth.ts` with three helpers: `requireAgent()` — extract Bearer token, lookup by api_key_prefix, bcrypt verify, attach agent to context; `requireAdmin()` — verify JWT, check role='admin', attach user to context; `optionalAuth()` — try auth but don't reject if missing
- [x] T048 [US4] Add `bcrypt` and `jose` (JWT) dependencies to `apps/api/package.json`. Add `better-auth` for future OAuth integration (placeholder config only in Sprint 1)
- [x] T049 [US4] Wire auth middleware into `apps/api/src/app.ts` — apply `optionalAuth()` globally, use `requireAgent()` and `requireAdmin()` on specific route groups
- [x] T050 [US4] Write unit tests for auth middleware in `apps/api/src/__tests__/auth.test.ts` — test: missing header → 401, invalid key → 401, expired JWT → 401, valid JWT → user in context — **8 tests passing**

**Checkpoint**: ✅ Auth middleware complete. 8 unit tests pass (requireAdmin + optionalAuth).

---

## Phase 7: User Story 5 — Rate Limiting Protection (Priority: P2) ✅ COMPLETE

**Goal**: Redis-based sliding window rate limiter enforces per-role request quotas. Rate limit headers appear on every response. 429 returned when exceeded.

**Independent Test**: Send 61 requests in 60 seconds as an agent → 61st returns 429 with Retry-After header.

### Implementation for User Story 5

- [x] T051 [US5] Implement rate limit middleware in `apps/api/src/middleware/rate-limit.ts` — Redis sliding window using pipeline (ZREMRANGEBYSCORE + ZCARD + ZADD + EXPIRE), per-role defaults (public: 30/min, agent: 60/min, human: 120/min, admin: 300/min), per-endpoint overrides. Set `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` on every response. Return 429 with `Retry-After` when exceeded. Gracefully degrades if Redis unavailable.
- [x] T052 [US5] Wire rate limit middleware into `apps/api/src/app.ts` after auth middleware (needs identity to determine role)
- [x] T053 [US5] Write unit test for rate limit middleware in `apps/api/src/__tests__/rate-limit.test.ts` — test: under limit → passes with headers, at limit → 429, degraded mode (no Redis), different roles → different limits, key format verification — **6 tests passing**

**Checkpoint**: ✅ Rate limit middleware complete with 6 unit tests. Redis mock pattern established.

---

## Phase 8: User Story 6 — Continuous Integration Pipeline (Priority: P2) ✅ COMPLETE

**Goal**: GitHub Actions CI pipeline runs lint, typecheck, test, and build on every push/PR. Caching reduces pipeline time.

**Independent Test**: Push a commit → CI runs all checks → green status on PR.

### Implementation for User Story 6

- [x] T054 [US6] Create `.github/workflows/ci.yml` with: trigger on push to main + PRs, Node.js 22 + pnpm 9 setup, `pnpm install --frozen-lockfile`, parallel jobs (lint, typecheck, unit tests, integration tests, build). Integration tests use service containers (`pgvector/pgvector:pg16`, `redis:7-alpine`). Cache pnpm store and Turborepo cache
- [x] T055 [US6] Add Vitest configuration to `apps/api/package.json` and create `apps/api/vitest.config.ts` with TypeScript path resolution (`vite-tsconfig-paths`) and test environment settings
- [x] T056 [US6] Verify CI pipeline by confirming `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` all pass locally with zero errors — **all 4 commands pass (0 lint errors, 0 type errors, 19/19 tests, all 5 workspaces build)**

**Checkpoint**: ✅ CI pipeline verified locally. All checks pass.

---

## Phase 9: User Story 7 — Frontend Application Shell (Priority: P2) ✅

**Goal**: Next.js 15 web app with design system tokens, placeholder pages, and responsive layout.

**Independent Test**: `pnpm dev --filter web` → visit localhost:3000 → landing page with correct branding. Navigate to /problems, /solutions, /admin.

### Implementation for User Story 7

- [x] T057 [P] [US7] Configure Tailwind CSS 4 design tokens in `apps/web/app/globals.css` via `@theme` — colors (terracotta #C4704B, cream #FAF7F2, charcoal #2D2A26, semantic success/warning/error/info), typography (Inter, JetBrains Mono), neumorphic shadows
- [x] T058 [P] [US7] Set up `apps/web/app/globals.css` with Tailwind directives, CSS custom properties for design tokens, and base font configuration
- [x] T059 [US7] Update `apps/web/app/layout.tsx` with Inter + JetBrains Mono fonts (next/font), metadata (title, description), and global styles import
- [x] T060 [P] [US7] Create landing page in `apps/web/app/page.tsx` with hero section (BetterWorld mission), "How It Works" section (3-step: Agents Discover → Agents Propose → Humans Act), and CTA buttons
- [x] T061 [P] [US7] Create placeholder pages: `apps/web/app/problems/page.tsx`, `apps/web/app/solutions/page.tsx`, `apps/web/app/(admin)/admin/page.tsx` — each with title and "coming soon" content using design tokens
- [x] T062 [US7] Configure `apps/web/next.config.ts` for Turborepo (transpilePackages for `@betterworld/shared`)

**Checkpoint**: ✅ All frontend files created. Typechecks pass.

---

## Phase 10: User Story 8 — Shared Type Safety (Priority: P2) ✅

**Goal**: Shared types, enums, Zod schemas, and constants importable from both API and web apps. Types match Drizzle schema.

**Independent Test**: `import { Agent, ProblemDomain, ApiResponse, ALLOWED_DOMAINS } from '@betterworld/shared'` compiles in both apps.

### Implementation for User Story 8

- [x] T063 [P] [US8] Create Zod validation schemas in `packages/shared/src/schemas/` for: `createProblemSchema`, `createSolutionSchema`, `createDebateSchema`, `paginationQuerySchema`, `envSchema` (already in config.ts)
- [x] T064 [US8] Ensure `packages/shared/src/index.ts` barrel export includes all types (entities, api, errors), all constants (domains, rate-limits), all schemas, and config loader
- [x] T065 [US8] Verify cross-workspace imports: `pnpm typecheck` runs with zero errors across all 5 workspaces (shared, db, guardrails, api, web)
- [x] T066 [US8] Verify `ALLOWED_DOMAINS` constant contains all 15 UN SDG-aligned domains and matches `problemDomainEnum` values in `packages/db/src/schema/enums.ts`

**Checkpoint**: ✅ `pnpm typecheck` passes with zero errors across all workspaces. Shared types importable in both API and web.

---

## Phase 11: Polish & Cross-Cutting Concerns ✅ COMPLETE

**Purpose**: Final integration, validation, and cleanup across all user stories.

- [x] T067 Run full quickstart flow from scratch: clone → install → docker up → migrate → seed → dev → verify all endpoints and pages per `specs/001-sprint1-core-infra/quickstart.md` — **verified: healthz 200, readyz ready (DB+Redis ok), 404 structured, web 200**
- [x] T068 Run `pnpm lint` and fix any remaining ESLint violations across all workspaces — **fixed 20 errors (import ordering, duplicate imports, unused vars); 0 errors, 3 warnings remaining**
- [x] T069 Run `pnpm typecheck` and fix any remaining TypeScript errors (target: zero errors) — **all 5 workspaces pass**
- [x] T070 Run `pnpm test` and ensure all unit tests pass — **19/19 tests passing (5 middleware + 8 auth + 6 rate-limit)**
- [x] T071 Run `pnpm build` and ensure production builds succeed for all apps and packages — **all 5 workspaces build (Next.js production build: 4 static pages)**
- [x] T072 Verify `.env.example` has all required variables documented with comments
- [x] T073 Verify `docker compose down -v && docker compose up -d` cleanly resets state, followed by migrate + seed — **verified: volumes removed, fresh containers healthy, migration applied, seed data inserted**

---

## Phase 12: Gap Fixes (Sprint 1 DoD Completion) ✅ COMPLETE

**Purpose**: Address gaps identified during Sprint 1 review against the Definition of Done.

### Gap 3: API v1 Route Prefix

- [x] T074 [US2] Create `apps/api/src/routes/v1.routes.ts` with versioned API router — `GET /api/v1/health` returns `{ ok: true, requestId }`. Mount via `app.route("/api/v1", v1Routes)` in `apps/api/src/app.ts` alongside existing root health routes
- [x] T075 [US2] Verify `/healthz` and `/readyz` remain at root (k8s probes unchanged), `/api/v1/health` responds correctly — **verified: all three endpoints return expected responses**

### Gap 1: Integration Tests

- [x] T076 [US6] Create `apps/api/src/__tests__/health.integration.test.ts` with real DB + Redis connections (no mocks). Setup: `initDb()` + `initRedis()` from container.ts, teardown: `shutdown()`. Tests use `app.request()` pattern matching unit test conventions
- [x] T077 [US6] Integration test cases — **8 tests passing**: `GET /healthz` → 200, `GET /readyz` → ready with real DB+Redis checks, `GET /api/v1/health` → 200, 404 handler → structured error envelope, rate limit headers present with real Redis, JWT auth via optionalAuth (valid token, invalid token, no token)

### Gap 2: React Query Provider

- [x] T078 [US7] Create `apps/web/app/providers.tsx` with `"use client"` directive, `QueryClientProvider` wrapping children (defaults: staleTime 60s, retry 1, refetchOnWindowFocus false). Wire into `apps/web/app/layout.tsx` — layout remains Server Component
- [x] T079 [US7] Verify Next.js build succeeds with provider — **build passes, 7 static pages generated**

### Gap 4: UI Component Library

- [x] T080 [US7] Create `apps/web/src/components/ui/button.tsx` — 4 variants (primary, secondary, ghost, danger), 3 sizes (sm, md, lg), loading state with spinner, accessible focus ring, forwardRef
- [x] T081 [US7] Create `apps/web/src/components/ui/card.tsx` — compound components: `Card`, `CardHeader`, `CardBody`, `CardFooter`. Neumorphic shadows, hover lift effect
- [x] T082 [US7] Create `apps/web/src/components/ui/badge.tsx` — 4 variants (domain, difficulty, status, reputation), 3 sizes, semantic colors for guardrail status
- [x] T083 [US7] Create `apps/web/src/components/ui/input.tsx` — text + textarea via `multiline` prop, label, helperText, error state with `role="alert"`, accessible `aria-describedby`/`aria-invalid`
- [x] T084 [US7] Create barrel export `apps/web/src/components/ui/index.ts` — exports all 4 components

**Checkpoint**: ✅ All gap fixes complete. Typecheck zero errors, lint zero errors, 19 unit tests + 8 integration tests passing, build succeeds.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup) ─────────────────→ Phase 2 (Foundational)
                                         │
                                         ▼
                    ┌────────────────────┬┴───────────────────┐
                    │                    │                     │
                    ▼                    ▼                     ▼
          Phase 3 (US1:Env)    Phase 4 (US2:API)    Phase 5 (US3:DB)
                    │                    │                     │
                    └────────────────────┼─────────────────────┘
                                         │
                                         ▼
                              Phase 6 (US4:Auth)
                                         │
                              ┌──────────┼──────────┐
                              ▼          ▼          ▼
                      Phase 7     Phase 8     Phase 9      Phase 10
                      (US5:Rate)  (US6:CI)    (US7:FE)     (US8:Types)
                              └──────────┼──────────┘
                                         ▼
                              Phase 11 (Polish)
```

### User Story Dependencies

- **US1 (Local Env)**: Depends on Phase 2 only. No other story dependencies.
- **US2 (API Health)**: Depends on US1 (API server must exist). Can start in parallel with US1 if app.ts scaffolding is in place.
- **US3 (Database)**: Depends on US1 (Docker Compose for PG). Can start in parallel with US2.
- **US4 (Auth)**: Depends on US2 (middleware pipeline) and US3 (agents table for key lookup).
- **US5 (Rate Limit)**: Depends on US4 (needs auth context to determine role).
- **US6 (CI)**: Depends on US2 + US3 (needs something to lint/test/build). Can start once basic structure exists.
- **US7 (Frontend)**: Depends on Phase 2 only. Can run fully in parallel with US2-US5.
- **US8 (Shared Types)**: Depends on US3 (entity types inferred from schema). Can finalize once schema is defined.

### Within Each User Story

- Models/schemas before services
- Middleware before routes
- Core implementation before tests
- Tests validate acceptance criteria

### Parallel Opportunities

- **Phase 2**: All workspace scaffolding tasks (T009-T017) can run in parallel
- **US1 + US7**: Environment setup and frontend shell are independent
- **US2 middleware**: request-id, cors, logger can all be written in parallel (T025-T027)
- **US3 schema**: All table definitions can be written in parallel (T035-T039)
- **US6 + US7 + US8**: CI, frontend, and shared types can all proceed in parallel once US2/US3 are done
- **US7 components**: Tailwind config, CSS setup, and placeholder pages are parallel (T057-T061)

---

## Summary

| Metric | Count | Done |
|--------|-------|------|
| **Total tasks** | 84 | **84** ✅ |
| **Setup (Phase 1)** | 8 | 8 ✅ |
| **Foundational (Phase 2)** | 9 | 9 ✅ |
| **US1 — Local Env** | 7 | 7 ✅ |
| **US2 — API Health** | 9 | 9 ✅ |
| **US3 — Database** | 13 | 13 ✅ |
| **US4 — Auth** | 4 | 4 ✅ |
| **US5 — Rate Limit** | 3 | 3 ✅ |
| **US6 — CI/CD** | 3 | 3 ✅ |
| **US7 — Frontend** | 6 | 6 ✅ |
| **US8 — Shared Types** | 4 | 4 ✅ |
| **Polish** | 7 | 7 ✅ |
| **Gap Fixes (Phase 12)** | 11 | 11 ✅ |

### Validation Results (Final)

- **Typecheck**: All 5 workspaces pass with zero errors ✅
- **Lint**: 0 errors, 3 warnings (bcrypt/pino default import patterns) ✅
- **Unit Tests**: 19/19 passing (5 middleware + 8 auth + 6 rate-limit) ✅
- **Integration Tests**: 8/8 passing (health endpoints, 404, rate-limit headers, JWT auth — real DB+Redis) ✅
- **Build**: All 5 workspaces build successfully (Next.js 7 static pages) ✅
- **Database**: 5 tables, 90 columns, 24 indexes, 5 FKs, seed data populated ✅
- **Docker**: PostgreSQL + Redis containers healthy, reset cycle verified ✅
- **End-to-end**: healthz 200, readyz ready, /api/v1/health 200, structured 404, web 200 ✅
- **UI Components**: Button, Card, Badge, Input — all typecheck and build ✅
- **React Query**: Provider wired into layout, build succeeds ✅
- **Dependencies**: 436 packages installed cleanly ✅

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps each task to its user story for traceability
- Commit after each completed task or logical group
- Stop at any checkpoint to validate the story independently
- Constitution compliance: all content defaults to `guardrail_status: 'pending'`, API keys bcrypt-hashed, Zod at boundaries, TypeScript strict
