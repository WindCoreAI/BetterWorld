# Implementation Plan: Phase 3 Sprint 11 — Shadow Mode

**Branch**: `012-phase3-shadow-mode` | **Date**: 2026-02-11 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/012-phase3-shadow-mode/spec.md`

## Summary

Sprint 11 introduces shadow peer validation — running peer consensus in parallel with the existing Layer B (Claude Haiku) classifier for 100% of submissions, with zero production impact. The peer consensus result is logged for comparison analysis only (Layer B remains the sole decision-maker). Key deliverables: evaluation assignment service, validator response APIs, weighted consensus engine, F1 score tracking with automatic tier promotion/demotion, admin agreement dashboard, agent affinity system, and local city dashboards for Portland and Chicago.

## Technical Context

**Language/Version**: TypeScript 5.x strict mode, Node.js 22+
**Primary Dependencies**: Hono (API), Drizzle ORM, BullMQ (workers), ioredis, Zod, Pino, Leaflet + leaflet.heat (frontend maps)
**Storage**: PostgreSQL 16 + PostGIS (Supabase), Upstash Redis
**Testing**: Vitest (unit + integration), 944+ existing tests
**Target Platform**: Fly.io (API + workers), Vercel (Next.js frontend)
**Project Type**: Monorepo (Turborepo + pnpm workspaces)
**Performance Goals**: P95 consensus_latency_ms < 15s (peer consensus only, not API response time), API endpoint p95 < 500ms, guardrail p95 < 2s (Phase 3 target)
**Constraints**: Shadow mode must not affect production routing, feature flag gated, zero downtime deployment
**Scale/Scope**: 20+ validators, 500+ submissions over 2-week shadow period, 2 cities

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### Pre-Design Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Constitutional AI for Good | PASS | Shadow mode runs peer consensus **in parallel** with existing 3-layer pipeline. Layer B remains sole decision-maker. No bypass path introduced. Content still enters "pending" until Layer B completes. |
| II. Security First | PASS | Evaluation API uses existing agent auth (bcrypt API keys). Self-review prevention enforced. Validator identity not disclosed in broadcast events. Admin dashboard behind requireAdmin. Rate limiting on evaluation response endpoint. |
| III. Test-Driven Quality Gates | PASS | 15+ new integration tests required. All 944+ existing tests must pass. Coverage targets maintained. |
| IV. Verified Impact | PASS | Not directly applicable to shadow mode. Token transactions not involved (credit rewards deferred to Sprint 12). |
| V. Human Agency | PASS | Not directly applicable — validators are agents, not humans. |
| VI. Framework Agnostic | PASS | Evaluation APIs follow standard REST envelope `{ ok, data/error, requestId }`. Cursor-based pagination. No framework-specific requirements for validator agents. |
| VII. Structured over Free-form | PASS | Evaluation responses validated by Zod schemas (recommendation enum, confidence range, score ranges, reasoning length). |

**GATE RESULT: ALL PASS — No violations. Proceeding to Phase 0.**

### Post-Design Re-Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Constitutional AI for Good | PASS | Verified: guardrail-worker.ts modification only adds a non-blocking enqueue after Layer B decision. Layer B result is final. Peer consensus writes to separate table (`consensus_results`). |
| II. Security First | PASS | Advisory locks prevent consensus race conditions. Evaluation ownership enforced (validator_agent_id check). WebSocket notifications don't expose submission author identity. All inputs Zod-validated. |
| III. Test-Driven Quality Gates | PASS | Test plan covers: full shadow pipeline flow, consensus edge cases (quorum timeout, safety flag, split votes), F1 tracking, tier changes, timeout handler. 15+ integration tests. |
| IV. Verified Impact | PASS | No token operations in Sprint 11. |
| V. Human Agency | PASS | Not applicable. |
| VI. Framework Agnostic | PASS | All new endpoints use standard envelope. Cursor pagination on GET /evaluations/pending. WebSocket events follow existing format. |
| VII. Structured over Free-form | PASS | Evaluation response schema: recommendation (enum), confidence (0-1), scores (1-5 each), reasoning (50-2000 chars). All Zod-validated at boundary. |

**POST-DESIGN GATE: ALL PASS.**

## Project Structure

### Documentation (this feature)

```text
specs/012-phase3-shadow-mode/
├── spec.md                     # Feature specification
├── plan.md                     # This file
├── research.md                 # Phase 0: Research decisions (10 items)
├── data-model.md               # Phase 1: Schema changes + state machines
├── quickstart.md               # Phase 1: Dev setup + implementation order
├── checklists/
│   └── requirements.md         # Spec quality checklist
├── contracts/
│   ├── evaluations-api.md      # Evaluation CRUD endpoints
│   ├── validator-api.md        # Validator stats + affinity
│   ├── admin-shadow-api.md     # Agreement dashboard + validator overview
│   ├── city-api.md             # City dashboard endpoints (public)
│   └── websocket-events.md     # New WebSocket event types
└── tasks.md                    # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
apps/api/src/
├── routes/
│   ├── evaluations.routes.ts       # GET /pending, POST /:id/respond, GET /:id
│   ├── validator.routes.ts         # GET /stats, PATCH /affinity, GET /tier-history
│   ├── city.routes.ts              # GET /city/list, GET /city/:city/metrics (public)
│   └── admin/
│       └── shadow.ts               # GET /agreement, /latency, /validators
├── services/
│   ├── evaluation-assignment.ts    # Validator selection (filter → exclude → boost → stratify)
│   ├── consensus-engine.ts         # Weighted voting + shadow comparison logging
│   ├── f1-tracker.ts               # Rolling F1 window + tier promotion/demotion
│   └── agreement-stats.ts          # Agreement stats, latency stats, pipeline health
├── workers/
│   ├── peer-consensus.ts           # Per-submission orchestration worker
│   ├── evaluation-timeout.ts       # 60s repeating expiry handler + daily evaluation count reset
│   └── city-metrics.ts             # Daily city aggregation worker

apps/web/src/
├── app/
│   ├── admin/shadow/page.tsx       # Agreement dashboard
│   ├── validator/affinity/page.tsx # Home region settings
│   └── city/
│       ├── page.tsx                # City selector page
│       └── [city]/page.tsx         # City dashboard with heatmap
├── components/
│   ├── AgreementChart.tsx          # Agreement rate visualization
│   ├── LatencyHistogram.tsx        # Consensus latency distribution
│   ├── ValidatorTierBadge.tsx      # Tier display component
│   └── CityHeatmap.tsx             # Leaflet heatmap for city dashboard

packages/shared/src/
├── constants/queue.ts              # +3 queue names
├── constants/consensus.ts          # Tier weights, quorum config, thresholds
├── constants/cities.ts             # Supported cities configuration
├── types/shadow.ts                 # Evaluation, consensus, validator types
└── schemas/evaluation.ts           # Zod schemas for evaluation API

packages/db/
├── src/schema/validatorPool.ts     # +home_regions JSONB column
├── src/schema/validatorTierChanges.ts  # Tier change history log
└── drizzle/0010_shadow_mode.sql    # Migration: home_regions + tier_changes table
```

**Structure Decision**: Follows existing monorepo layout. New routes, services, and workers placed alongside existing Sprint 10 code. No new packages or workspaces needed. Frontend pages follow the App Router convention with dynamic `[city]` segment for city dashboards.

## Complexity Tracking

> No constitution violations to justify. All principles pass.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | — | — |
