# Implementation Plan: MVP Production Readiness

**Branch**: `015-mvp-production-readiness` | **Date**: 2026-02-13 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/015-mvp-production-readiness/spec.md`

## Summary

Harden the BetterWorld MVP for real-user deployment by fixing 35 identified issues across 8 areas: guardrail worker (tsx path fix), performance bottlenecks (N+1 queries, debate depth, PostGIS geo-search), worker reliability (idempotency keys, dead-letter handling, connection pooling), frontend error handling (token refresh safety, auth wrappers, error boundaries), privacy pipeline (face/plate detection replacing stubs), monitoring (Sentry error tracking, Grafana alerting), security (optionalAuth audit, CORS whitelist, PII scrubbing), and testing infrastructure (frontend component tests, E2E golden path, CI coverage enforcement).

## Technical Context

**Language/Version**: TypeScript 5.x strict mode, Node.js 22+
**Primary Dependencies**: Hono (API), Drizzle ORM, BullMQ, Next.js 15, sharp, @sentry/node, @vladmandic/face-api (new)
**Storage**: PostgreSQL 16 + PostGIS + pgvector (Supabase), Upstash Redis, Supabase Storage
**Testing**: Vitest (backend + frontend), @testing-library/react + @testing-library/user-event + @testing-library/jest-dom (new), jsdom (DOM environment), Playwright (E2E)
**Target Platform**: Fly.io (API/workers), Vercel (frontend), Linux containers
**Project Type**: Monorepo web application (Turborepo + pnpm workspaces)
**Performance Goals**: Evaluations list <500ms (100 items), geo-search <200ms (1000 missions), guardrail pipeline <10s
**Constraints**: <1000 concurrent users initial launch, zero duplicate worker processing, zero PII in logs
**Scale/Scope**: 35 functional requirements, ~80 modified files across 5 packages, ~50 new test files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Constitutional AI for Good | **PASS** | FR-001/002 fix guardrail worker — restores automated 3-layer pipeline |
| II. Security First | **PASS** | FR-027 (optionalAuth audit), FR-028 (CORS whitelist), FR-029 (PII scrub), FR-030 (admin routes). CORS not wildcard in production. Rate limiting remains on write endpoints. |
| III. Test-Driven Quality Gates | **PASS** | FR-031-034 add frontend tests, E2E golden path, CI coverage enforcement, vulnerability scanning. Coverage must not decrease. |
| IV. Verified Impact | **PASS** | FR-020-022 implement real face/plate detection for evidence privacy. Double-entry accounting and SELECT FOR UPDATE unchanged. |
| V. Human Agency | **PASS** | FR-023 enforces onboarding completion. Mission claiming logic unchanged. |
| VI. Framework Agnostic | **PASS** | No changes to agent API contract. Standard envelope maintained. |
| VII. Structured over Free-form | **PASS** | No schema changes. Zod validation maintained at all boundaries. |

**Gate result: PASS — no violations.**

## Project Structure

### Documentation (this feature)

```text
specs/015-mvp-production-readiness/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (minimal — mostly existing schema changes)
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (no new endpoints — fixes to existing)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
apps/api/
├── src/
│   ├── middleware/
│   │   ├── auth.ts                    # FR-027: optionalAuth hardening
│   │   ├── cors.ts                    # FR-028: CORS whitelist validation
│   │   └── rate-limit.ts              # Already fixed (P0-S1)
│   ├── routes/
│   │   ├── v1.routes.ts               # FR-030: admin route de-overlap
│   │   ├── evaluations.routes.ts      # FR-003: N+1 batch fix
│   │   ├── debates.routes.ts          # FR-004: thread depth CTE, FR-006: pagination fix
│   │   ├── missions/index.ts          # FR-005: PostGIS ST_DWithin
│   │   └── admin-rate.routes.ts       # FR-029: PII scrub
│   ├── services/
│   │   ├── privacy-pipeline.ts        # FR-020/021: face + plate detection
│   │   └── evaluation-assignment.ts   # FR-007: idempotency check
│   ├── workers/
│   │   ├── guardrail-worker.ts        # FR-001: tsx fix, FR-007: idempotency keys
│   │   ├── peer-consensus.ts          # FR-007: assignment idempotency
│   │   ├── rate-adjustment-worker.ts  # FR-009: weekly idempotency
│   │   ├── municipal-ingest.ts        # FR-010: shared DB pool
│   │   ├── privacy-worker.ts          # FR-008: quarantine on dead-letter
│   │   ├── reputation-decay.ts        # FR-012: per-item error isolation
│   │   └── all-workers.ts             # FR-011: retention policies
│   ├── lib/
│   │   └── sentry.ts                  # FR-024: Sentry initialization (new)
│   └── __tests__/
│       ├── guardrail-worker-fix.test.ts     # New
│       ├── evaluation-batch.test.ts          # New
│       ├── worker-idempotency.test.ts        # New
│       └── security-hardening.test.ts        # New

apps/web/
├── app/
│   ├── error.tsx                      # FR-017: global error boundary (new)
│   ├── not-found.tsx                  # FR-018: custom 404 (new)
│   ├── dashboard/page.tsx             # FR-023: onboarding redirect
│   ├── missions/page.tsx              # FR-015: error handling
│   ├── missions/[id]/submit/page.tsx  # FR-014: humanFetch wrapper
│   └── disputes/page.tsx              # FR-016: credentials fix
├── src/
│   ├── components/
│   │   └── disputes/DisputeForm.tsx   # FR-019: balance check
│   ├── lib/
│   │   ├── humanApi.ts                # FR-013: POST retry safety
│   │   └── offline-queue.ts           # Edge case: cleanup after MAX_RETRIES
│   └── __tests__/                     # FR-031: frontend component tests (new)
│       ├── setup.ts
│       ├── components/
│       │   ├── RegisterForm.test.tsx
│       │   ├── MissionClaimButton.test.tsx
│       │   ├── EvidenceSubmitForm.test.tsx
│       │   └── OrientationSteps.test.tsx
│       └── lib/
│           └── humanApi.test.ts
├── vitest.config.ts                   # New
├── package.json                       # Updated: test deps

packages/guardrails/
└── package.json                       # FR-035: pino v8 → v9

config/
├── alerts.yml                         # FR-026: add receivers
└── grafana-dashboards.json            # FR-025: worker queue panels

.github/workflows/
└── ci.yml                             # FR-033: coverage gate, FR-034: pnpm audit

e2e/
└── golden-path.test.ts                # FR-032: E2E test (new)
```

**Structure Decision**: This feature modifies the existing monorepo structure. No new packages or projects. Changes span `apps/api` (backend fixes), `apps/web` (frontend fixes + tests), `packages/guardrails` (dependency alignment), `config/` (monitoring), `.github/` (CI), and a new `e2e/` directory for E2E tests.

## Complexity Tracking

> No constitution violations — this section is intentionally empty.
