# Implementation Plan: Sprint 4 — Web UI + Deployment

**Branch**: `005-web-ui-deployment` | **Date**: 2026-02-08 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/005-web-ui-deployment/spec.md`

## Summary

Build the frontend UI for BetterWorld's MVP (problem board, solution board, admin panel, landing page, activity feed), deploy to production (Fly.io + Vercel), harden security, and validate with E2E + load tests. All backend APIs and data are ready from Sprints 1-3.5. This sprint is primarily frontend work + DevOps, with no database changes.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js 22+
**Primary Dependencies**: Next.js 15 (App Router, RSC), React 19, Tailwind CSS 4, React Query v5, Zustand, Hono (API), Vitest (tests), k6 (load tests)
**Storage**: PostgreSQL 16 + pgvector (Supabase, existing), Upstash Redis (existing) — no new tables or migrations
**Testing**: Vitest (unit + integration), k6 (load), manual WCAG audit (accessibility)
**Target Platform**: Web (desktop + mobile responsive), Fly.io (API), Vercel (frontend)
**Project Type**: Web application (monorepo: apps/web + apps/api + packages/*)
**Performance Goals**: Page load < 2s, API p95 < 500ms, WebSocket event delivery < 2s
**Constraints**: WCAG 2.1 AA accessibility, 652 existing tests must not regress, zero TypeScript/ESLint errors
**Scale/Scope**: 7 pages (3 new, 4 enhanced), ~15 new/modified components, 2 Fly.io apps, 1 Vercel project

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Constitutional AI for Good | PASS | No guardrail bypass paths. Frontend only shows approved content to public; pending/flagged visible only to owning agent. Admin panel enforces review workflow. |
| II. Security First | PASS | Security headers (CSP, HSTS, X-Frame-Options) added. CORS strict origins. TLS 1.3 via Fly.io/Vercel edge. No secrets in frontend code. |
| III. Test-Driven Quality Gates | PASS | E2E pipeline tests added. Load test baseline established. 652 existing tests preserved. TypeScript strict + ESLint zero errors maintained. |
| IV. Verified Impact | N/A | Evidence verification is Phase 2 (Sprint 7). Not in scope. |
| V. Human Agency | N/A | Human onboarding is Phase 2 (Sprint 5). Not in scope. |
| VI. Framework Agnostic | PASS | Frontend consumes standard REST API with envelope format `{ ok, data, meta }`. No agent-framework-specific UI. Cursor-based pagination throughout. |
| VII. Structured over Free-form | PASS | All content rendered from Zod-validated schemas. No free-form content input (SolutionForm already validates structured fields). |

**Gate result**: PASS — No violations. Proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/005-web-ui-deployment/
├── plan.md              # This file
├── research.md          # Phase 0: 12 research decisions
├── data-model.md        # Phase 1: View models (no DB changes)
├── quickstart.md        # Phase 1: Dev setup + validation checklist
├── contracts/
│   ├── frontend-pages.md   # Page route map + API dependencies
│   └── deployment.md       # Fly.io/Vercel architecture + configs
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
apps/web/                           # Next.js 15 frontend
├── app/
│   ├── page.tsx                    # Landing page (ENHANCE)
│   ├── problems/
│   │   ├── page.tsx                # Problem board (ENHANCE)
│   │   └── [id]/page.tsx           # Problem detail (ENHANCE)
│   ├── solutions/
│   │   ├── page.tsx                # Solution board (BUILD — replace stub)
│   │   ├── [id]/page.tsx           # Solution detail + debates (BUILD)
│   │   └── submit/page.tsx         # Solution form (existing)
│   ├── activity/
│   │   └── page.tsx                # Activity feed (BUILD)
│   └── (admin)/admin/
│       ├── page.tsx                # Admin dashboard (BUILD — replace stub)
│       ├── flagged/
│       │   ├── page.tsx            # Flagged queue (ENHANCE)
│       │   └── [id]/page.tsx       # Flagged detail (ENHANCE)
│       └── layout.tsx              # Admin layout (BUILD — auth gate)
├── src/
│   ├── components/
│   │   ├── ui/                     # Existing: Button, Card, Badge, Input
│   │   ├── ProblemCard.tsx         # Existing (ENHANCE — status badge)
│   │   ├── ProblemFilters.tsx      # Existing
│   │   ├── SolutionForm.tsx        # Existing
│   │   ├── SolutionCard.tsx        # BUILD
│   │   ├── ScoreBreakdown.tsx      # BUILD
│   │   ├── DebateThread.tsx        # BUILD
│   │   ├── ActivityFeed.tsx        # BUILD
│   │   └── admin/
│   │       ├── FlaggedContentCard.tsx  # Existing (ENHANCE)
│   │       └── ReviewDecisionForm.tsx  # Existing
│   └── hooks/
│       └── useWebSocket.ts         # BUILD
└── next.config.ts                  # ENHANCE — security headers

apps/api/                           # Hono API server
├── src/
│   ├── middleware/
│   │   └── security-headers.ts     # BUILD
│   └── app.ts                      # ENHANCE — add security middleware
├── tests/
│   └── e2e/
│       └── full-pipeline.test.ts   # BUILD
└── tests/
    └── load/
        └── k6-baseline.js          # BUILD

# Deployment configs (repo root)
Dockerfile                          # BUILD — API container
Dockerfile.worker                   # BUILD — Worker container
fly.toml                            # BUILD — API Fly.io config
fly.worker.toml                     # BUILD — Worker Fly.io config
.github/workflows/deploy.yml        # BUILD — Deployment workflow
```

**Structure Decision**: Existing monorepo structure (Turborepo + pnpm workspaces). Sprint 4 adds files within `apps/web/` and `apps/api/` — no new packages or workspace changes.

## Complexity Tracking

> No violations — no entries needed.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Post-Design Constitution Re-Check

| Principle | Status | Changes from Pre-Design |
|-----------|--------|------------------------|
| I. Constitutional AI for Good | PASS | Confirmed: pending content hidden from public in all page contracts. Admin workflow preserves claim-before-review pattern. |
| II. Security First | PASS | Confirmed: security headers middleware designed. CORS tightened. No wildcard origins. Secrets in Fly.io/Vercel secret management only. |
| III. Test-Driven Quality Gates | PASS | Confirmed: E2E test covers full pipeline. Load test validates p95 target. Existing 652 tests preserved. |
| VI. Framework Agnostic | PASS | Confirmed: All pages consume standard REST envelope `{ ok, data, meta }`. Cursor-based pagination. No framework-specific rendering. |
| VII. Structured over Free-form | PASS | Confirmed: All content rendered from typed API responses. Score formula displayed as defined (impact×0.4 + feasibility×0.35 + cost×0.25). |

**Post-design gate result**: PASS — Design is constitution-compliant. Ready for `/speckit.tasks`.

## Artifacts Generated

| Artifact | Path | Status |
|----------|------|--------|
| Research | [research.md](research.md) | Complete (12 decisions) |
| Data Model | [data-model.md](data-model.md) | Complete (view models, no DB changes) |
| Frontend Pages | [contracts/frontend-pages.md](contracts/frontend-pages.md) | Complete (9 pages, API deps) |
| Deployment | [contracts/deployment.md](contracts/deployment.md) | Complete (Fly.io + Vercel + CI/CD) |
| Quickstart | [quickstart.md](quickstart.md) | Complete (dev setup, file list, validation) |
