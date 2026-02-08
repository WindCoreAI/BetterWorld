# Implementation Plan: Sprint 1 — Project Setup & Core Infrastructure

**Branch**: `001-sprint1-core-infra` | **Date**: 2026-02-07 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-sprint1-core-infra/spec.md`

## Summary

Establish the BetterWorld monorepo foundation: Turborepo with pnpm workspaces, Hono API server, Next.js 15 frontend, Drizzle ORM schema for core entities (agents, problems, solutions, debates), PostgreSQL 16 + pgvector + Redis 7 via Docker Compose, authentication middleware (API key + JWT via better-auth), Redis-based rate limiting, shared types package, CI/CD pipeline on GitHub Actions, and seed data. This sprint delivers the infrastructure that all subsequent sprints build upon.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 22+ (strict mode, zero errors)
**Primary Dependencies**: Hono (API framework), Next.js 15 (App Router, RSC), Drizzle ORM, better-auth, BullMQ, Zod, Pino, ioredis, bcrypt, jose (JWT)
**Storage**: PostgreSQL 16 + pgvector (`halfvec(1024)` via Voyage AI voyage-3) on Docker (dev) / Supabase (prod); Redis 7 on Docker (dev) / Upstash (prod)
**Testing**: Vitest (unit + integration), Hono test client or Supertest
**Target Platform**: Web (server: Node.js on Fly.io, client: Vercel)
**Project Type**: Monorepo (Turborepo + pnpm workspaces)
**Performance Goals**: API health check < 100ms, page load < 2s, CI pipeline < 5min with caching
**Constraints**: All API responses use `{ ok, data, meta, requestId }` envelope; cursor-based pagination; bcrypt API keys; TypeScript strict mode
**Scale/Scope**: Development environment for 3-engineer team; schema supports up to ~10K agents/problems in Phase 1

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Constitutional AI for Good | PASS | Guardrails package created as placeholder; `guardrail_status` enum on all content tables (pending/approved/rejected/flagged); all submissions default to "pending" state. Actual guardrail logic deferred to Sprint 3. |
| II. Security First | PASS | API keys bcrypt-hashed (cost 12); JWT via better-auth (15min access, 7-day refresh); Zod validation at all boundaries; CORS with configured origins (no wildcard); rate limiting on all endpoints; secrets in env vars only; `.env` in `.gitignore`. |
| III. Test-Driven Quality Gates | PASS | Vitest configured; CI pipeline with lint + typecheck + test + build; TypeScript strict mode; `pnpm install --frozen-lockfile` in CI; ESLint zero errors. Coverage targets enforced starting Sprint 2 when feature code exists. |
| IV. Verified Impact | N/A | Token and evidence tables are Phase 2 scope. Schema uses `decimal(18,8)` for future token amounts with `balance_before`/`balance_after` columns designed for double-entry accounting. |
| V. Human Agency | N/A | Human-facing features are Phase 2 scope. `humans` table included in schema for forward-compatibility. |
| VI. Framework Agnostic | PASS | API response envelope `{ ok, data, meta, requestId }` enforced; cursor-based pagination; no framework-specific agent requirements. |
| VII. Structured over Free-form | PASS | All content entities have Zod schemas; `problemDomainEnum` with 15 approved domains; `guardrailStatusEnum`; structured scoring fields (impact, feasibility, cost, composite). |

**Gate result: PASS** — No violations. Sprint 1 is infrastructure-focused; all constitutional principles are either satisfied or not yet applicable (Phase 2+ scope).

## Project Structure

### Documentation (this feature)

```text
specs/001-sprint1-core-infra/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── health.ts        # Health endpoint contracts
│   ├── envelope.ts      # Standard response envelope types
│   └── errors.ts        # Error code definitions
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
betterworld/
├── apps/
│   ├── api/                          # Hono API server (port 4000)
│   │   ├── src/
│   │   │   ├── index.ts              # Entry point (bootstrap)
│   │   │   ├── app.ts                # Hono app setup, route mounting
│   │   │   ├── routes/
│   │   │   │   └── health.routes.ts  # /healthz, /readyz
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts           # API key + JWT auth
│   │   │   │   ├── rate-limit.ts     # Redis sliding window
│   │   │   │   ├── cors.ts           # CORS config
│   │   │   │   ├── request-id.ts     # X-Request-ID injection
│   │   │   │   ├── logger.ts         # Pino structured logging
│   │   │   │   ├── error-handler.ts  # Global error → JSON envelope
│   │   │   │   └── validate.ts       # Zod body/query/param validation
│   │   │   └── lib/
│   │   │       └── container.ts      # Lightweight DI (db, redis, services)
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                          # Next.js 15 frontend (port 3000)
│       ├── app/
│       │   ├── layout.tsx            # Root layout, fonts, providers
│       │   ├── page.tsx              # Landing page
│       │   ├── problems/page.tsx     # Placeholder
│       │   ├── solutions/page.tsx    # Placeholder
│       │   └── (admin)/
│       │       └── admin/page.tsx    # Placeholder admin dashboard
│       ├── tailwind.config.ts        # Design tokens
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── db/                           # Drizzle ORM schema + migrations
│   │   ├── src/
│   │   │   ├── schema/
│   │   │   │   ├── enums.ts          # All pgEnum definitions
│   │   │   │   ├── agents.ts         # agents table
│   │   │   │   ├── humans.ts         # humans table (forward-compat)
│   │   │   │   ├── problems.ts       # problems table
│   │   │   │   ├── solutions.ts      # solutions table
│   │   │   │   ├── debates.ts        # debates table
│   │   │   │   └── index.ts          # Barrel export
│   │   │   ├── index.ts              # DB client export
│   │   │   └── seed.ts               # Seed data script
│   │   ├── drizzle/                  # Generated migration files
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   ├── shared/                       # Cross-package types & utilities
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── entities.ts       # Agent, Problem, Solution, Debate
│   │   │   │   ├── api.ts            # ApiResponse<T>, ApiError, Paginated<T>
│   │   │   │   └── errors.ts         # AppError class, ErrorCode enum
│   │   │   ├── schemas/              # Zod validation schemas
│   │   │   ├── constants/
│   │   │   │   ├── domains.ts        # 15 approved UN SDG domains
│   │   │   │   └── rate-limits.ts    # Rate limit defaults
│   │   │   ├── config.ts             # Env var loader with Zod validation
│   │   │   └── index.ts              # Barrel export
│   │   └── package.json
│   └── guardrails/                   # Placeholder (Sprint 3)
│       ├── src/
│       │   └── index.ts              # Stub exports
│       └── package.json
├── docker-compose.yml                # PG + Redis + MinIO
├── .env.example                      # All env vars documented
├── .github/
│   └── workflows/
│       └── ci.yml                    # Lint, typecheck, test, build
├── turbo.json                        # Pipeline config
├── pnpm-workspace.yaml               # Workspace definitions
├── tsconfig.json                     # Root TypeScript config (strict)
├── .eslintrc.cjs                     # Root ESLint config
├── .prettierrc                       # Prettier config
└── package.json                      # Root scripts
```

**Structure Decision**: Turborepo monorepo with `apps/` for deployable services and `packages/` for shared libraries. This matches the canonical structure from the tech architecture docs and supports independent builds/deploys per workspace.

## Complexity Tracking

No constitution violations to justify. Sprint 1 is straightforward infrastructure setup aligned with all documented architectural decisions.
