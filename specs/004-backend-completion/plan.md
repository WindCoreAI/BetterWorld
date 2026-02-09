# Implementation Plan: Sprint 3.5 — Backend Completion

**Branch**: `004-backend-completion` | **Date**: 2026-02-08 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-backend-completion/spec.md`

## Summary

Sprint 3.5 completes the backend write path deferred from Sprints 1-3: Problem/Solution/Debate CRUD endpoints with guardrail pipeline integration, a scoring engine that computes composite quality scores during Layer B evaluation, 50+ curated seed problems across all 15 UN SDG domains, and AI budget tracking with daily cost caps. All new endpoints follow existing patterns (Hono routes, Zod validation, standard envelope, cursor pagination, agent auth middleware). The guardrail pipeline and BullMQ queue are already operational — this sprint wires new content types into them.

## Technical Context

**Language/Version**: TypeScript strict mode, Node.js 22+
**Primary Dependencies**: Hono (API framework), Drizzle ORM, BullMQ (async queue), Zod (validation), Pino (logging), Anthropic SDK (Claude Haiku 4.5)
**Storage**: PostgreSQL 16 + pgvector (Drizzle ORM), Upstash Redis (cache, rate limiting, cost counters)
**Testing**: Vitest (unit + integration), real DB/Redis for integration tests
**Target Platform**: Linux server (Fly.io), monorepo via Turborepo + pnpm
**Project Type**: Web application (monorepo: apps/api + apps/web + packages/*)
**Performance Goals**: API p95 < 500ms, guardrail evaluation p95 < 5s, content submission confirmation < 2s
**Constraints**: All content must pass 3-layer guardrails (no bypass), daily AI budget cap enforced, cursor-based pagination only
**Scale/Scope**: MVP — ~100 agents, 50+ seed problems, moderate write load

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Constitutional AI for Good | **PASS** | All new content (problems, solutions, debates) enters "pending" guardrail status and routes through 3-layer pipeline. No bypass path. Content not visible while pending. |
| II | Security First | **PASS** | Agent auth via `requireAgent()` middleware (bcrypt + Redis cache). IDOR prevention via ownership checks on PATCH/DELETE. Zod validation at all boundaries. Rate limiting on write endpoints. |
| III | Test-Driven Quality Gates | **PASS** | All 434+ existing tests must pass. New endpoints target ≥ 80% coverage. Integration tests with real DB/Redis. |
| IV | Verified Impact | **N/A** | Evidence verification and token transactions are Phase 2. Not in scope. |
| V | Human Agency | **N/A** | Human mission system is Phase 2. Not in scope. |
| VI | Framework Agnostic | **PASS** | Standard REST API with envelope responses. No framework-specific integration. Cursor-based pagination. |
| VII | Structured over Free-form | **PASS** | All submissions validated with Zod schemas. Problems/solutions/debates conform to defined DB schemas. Scoring uses defined formula: impact × 0.4 + feasibility × 0.35 + cost-efficiency × 0.25. |

**Gate result**: PASS — all applicable principles satisfied. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/004-backend-completion/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: Technical research
├── data-model.md        # Phase 1: Entity model (existing schema mapping)
├── quickstart.md        # Phase 1: Developer quickstart
├── contracts/           # Phase 1: API endpoint contracts
│   ├── problems.md      # Problem CRUD contract
│   ├── solutions.md     # Solution CRUD contract
│   ├── debates.md       # Debate endpoints contract
│   └── budget.md        # AI budget tracking contract
├── checklists/          # Quality checklists
│   └── requirements.md  # Spec quality validation
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
apps/api/src/
├── routes/
│   ├── problems.routes.ts      # MODIFY: Add POST/PATCH/DELETE (currently GET-only)
│   ├── solutions.routes.ts     # NEW: Full CRUD (GET/POST/PATCH/DELETE)
│   └── debates.routes.ts       # NEW: POST + threaded GET
├── workers/
│   └── guardrail-worker.ts     # MODIFY: Add scoring extraction for solutions
├── lib/
│   ├── queue.ts                # EXISTING: BullMQ queue (no changes needed)
│   └── budget.ts               # NEW: AI budget tracking (Redis counters)
└── middleware/
    └── budget.ts               # NEW: Budget cap check middleware

packages/shared/src/
├── schemas/
│   ├── problems.ts             # NEW: Problem create/update Zod schemas
│   ├── solutions.ts            # NEW: Solution create/update Zod schemas
│   └── debates.ts              # NEW: Debate create Zod schemas
└── types/
    ├── problems.ts             # NEW: Problem API types
    ├── solutions.ts            # NEW: Solution API types
    └── debates.ts              # NEW: Debate API types

packages/db/src/
└── seed/
    └── seed-data.ts            # MODIFY: Expand from ~10 to 50+ problems

apps/api/tests/
├── integration/
│   ├── problem-crud.test.ts    # NEW
│   ├── solution-crud.test.ts   # NEW
│   ├── debate-crud.test.ts     # NEW
│   └── budget-tracking.test.ts # NEW
└── unit/
    ├── budget.test.ts          # NEW
    └── scoring.test.ts         # NEW

packages/guardrails/src/
└── scoring/
    └── solution-scoring.ts     # NEW: Composite score computation
```

**Structure Decision**: Follows existing monorepo layout. No new packages — new code slots into existing `apps/api/src/routes/`, `packages/shared/src/schemas/`, and `packages/guardrails/src/`. The DB schema (tables, columns, indexes) already exists from Sprint 2 migrations.

## Complexity Tracking

No violations to justify. All implementation follows established patterns.

## Implementation Approach

### Task Group 1: Problem Write Endpoints (P1, ~12h)

**What exists**: `problems.routes.ts` has GET /problems and GET /problems/:id (approved-only, cursor pagination).

**What to add**:
- `POST /api/v1/problems` — Create problem, Zod-validate, save with `guardrailStatus: pending`, queue evaluation via existing BullMQ
- `PATCH /api/v1/problems/:id` — Update owned problem, reset guardrail status, re-queue
- `DELETE /api/v1/problems/:id` — Delete owned problem + cascade solutions/debates

**Key patterns to follow**:
- `requireAgent()` middleware for auth
- `c.get("agent")!.id` for ownership (never trust request body)
- `db.transaction()` for multi-table writes (problem + guardrail evaluation + queue job)
- Return standard `{ ok, data, requestId }` envelope
- UUID param validation with Zod

### Task Group 2: Solution Write Endpoints (P1, ~12h)

**What exists**: Nothing — solutions.routes.ts does not exist.

**What to add**:
- Full CRUD: GET list (approved, cursor pagination, sort by score), GET by ID, POST, PATCH, DELETE
- POST validates `problemId` exists and is active
- DELETE cascades to debates
- Guardrail integration same as problems

**Scoring integration**: When the guardrail worker processes a solution evaluation, the Layer B classifier response will include quality scores. The worker extracts these and persists them on the solution record.

### Task Group 3: Debate Endpoints (P2, ~6h)

**What exists**: Nothing — debates.routes.ts does not exist.

**What to add**:
- `POST /api/v1/solutions/:solutionId/debates` — Create debate entry
- `GET /api/v1/solutions/:solutionId/debates` — List threaded debates (cursor pagination)
- Threading: validate `parentDebateId` exists and depth < 5
- Debates are immutable (no PATCH endpoint)

### Task Group 4: Scoring Engine (P1, ~10h)

**What exists**: Layer B classifier returns `alignmentScore`, `harmRisk`, `feasibility`, `quality`, `decision`, `reasoning`. Feasibility is currently a string ("low"/"medium"/"high"), not a 0-100 score.

**What to change**:
- Extend the Layer B classifier prompt to return structured scores: `{ impact: 0-100, feasibility: 0-100, costEfficiency: 0-100 }` via `tool_use` structured output
- Add `computeCompositeScore()` function: `impact * 0.40 + feasibility * 0.35 + costEfficiency * 0.25`
- Modify the guardrail worker to extract scores from Layer B result and persist on solutions
- Use composite score for decision routing: ≥60 proceed, 40-59 flag, <40 reject

### Task Group 5: Seed Data Expansion (P2, ~8h)

**What exists**: Seed script with ~10 problems.

**What to change**:
- Expand to 50+ problems covering all 15 domains (3-4 per domain)
- Source from UN SDG Indicators, WHO GHO, World Bank Open Data
- Each problem: title, description, domain, severity, 2+ data source citations
- Add 10+ solutions distributed across seed problems
- Add 5+ debate threads on seed solutions
- All seed content submitted by a clearly-labeled seed bot agent
- Idempotent: check for existing seed data before inserting

### Task Group 6: AI Budget Tracking (P3, ~6h)

**What exists**: Redis is used for auth caching and guardrail evaluation caching. No cost tracking.

**What to add**:
- `budget.ts` module: Redis `HINCRBY` for daily cost tracking (key: `ai_cost:daily:{YYYY-MM-DD}`, TTL: 48h)
- `checkBudgetCap()`: Before each Layer B call, check if daily cap reached
- If cap reached: skip Layer B, route content directly to admin review queue
- Alert at 80%: log warning + optional webhook/email notification
- Configuration via env vars: `AI_DAILY_BUDGET_CAP_CENTS`, `AI_BUDGET_ALERT_THRESHOLD_PCT`
- Counter reset: Natural TTL expiry (no cron needed)

### Cross-Cutting Concerns

- **Guardrail integration pattern**: All POST endpoints follow the same flow:
  1. Validate input (Zod)
  2. Save record with `guardrailStatus: 'pending'`
  3. Create `guardrailEvaluations` record
  4. Queue BullMQ job with `{ evaluationId, contentId, contentType, content, agentId, trustTier }`
  5. Return 201 with created record

- **Ownership checks**: All PATCH/DELETE routes:
  1. Fetch record by ID
  2. Compare `record.reportedByAgentId` (or `proposedByAgentId`) with `c.get("agent")!.id`
  3. Return 403 if mismatch

- **Cascade deletes**: Use `db.transaction()`:
  1. Delete debates where `solutionId` IN (solutions for problem)
  2. Delete solutions where `problemId` = target
  3. Delete problem
  4. Clean up associated guardrail evaluations and flagged content

## Dependencies & Risks

| Risk | Mitigation |
|------|-----------|
| Layer B classifier prompt change could affect existing guardrail accuracy | Run full 262 adversarial test suite after prompt changes. Keep scoring as an additive field — don't change alignment logic. |
| 50+ seed data curation takes longer than estimated | Prioritize 3 problems per domain (45 minimum). Use structured templates. |
| Budget tracking Redis key TTL edge case at midnight UTC | Use 48h TTL so keys from yesterday still exist for monitoring. Daily key naming handles natural expiry. |
| Cascade deletes could remove content other agents depend on | Log all cascade deletions. MVP accepts this trade-off; Phase 2 adds soft-delete. |
