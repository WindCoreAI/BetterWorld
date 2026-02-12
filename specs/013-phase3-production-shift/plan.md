# Implementation Plan: Phase 3 — Production Shift

**Branch**: `013-phase3-production-shift` | **Date**: 2026-02-12 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/013-phase3-production-shift/spec.md`

## Summary

Sprint 12 transitions peer validation from shadow mode (read-only) to production (decision-making) via a controlled 10% → 50% → 100% traffic shift, activates the credit economy (submission costs + validation rewards + hardship protection), adds a 5% spot check safety net, completes hyperlocal features (before/after photo verification, privacy protection, community attestation, mission templates), and provides comprehensive production monitoring dashboards with alerting. The implementation modifies the existing guardrail worker to support hash-based routing, extends the credit service with spend/earn operations, adds new DB tables and columns, creates new BullMQ workers for spot checks and privacy processing, and builds frontend dashboards for operators.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode, zero errors), Node.js 22+
**Primary Dependencies**: Hono (API), Drizzle ORM, BullMQ (async workers), Zod (validation), Pino (logging), sharp (image processing), exifr (EXIF), @anthropic-ai/sdk (Claude Vision), Leaflet + react-leaflet (maps)
**Storage**: PostgreSQL 16 + PostGIS (Supabase), Upstash Redis (cache/flags/queue), Supabase Storage (photos)
**Testing**: Vitest (unit + integration), real PostgreSQL + Redis for integration tests
**Target Platform**: Linux server (Fly.io backend), Vercel (Next.js frontend)
**Project Type**: Monorepo (Turborepo + pnpm workspaces)
**Performance Goals**: API p95 < 500ms, consensus p95 < 15s, guardrail p95 < 2s (Phase 3 target), rollback < 1 minute
**Constraints**: 3-layer guardrails must remain intact, double-entry accounting for all credit operations, zero false negative tolerance for forbidden patterns
**Scale/Scope**: ~50 validators, ~500+ submissions/week, 2 cities (Portland + Chicago), ~15 new/modified files backend, ~10 new frontend components

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Constitutional AI for Good (NON-NEGOTIABLE) — PASS

- 3-layer guardrail pipeline remains intact. Layer A regex always runs first. Layer B (Claude Haiku) remains available for new-tier agents, consensus failures, and 5% spot checks.
- Peer consensus (Layer B') is an **addition** to the pipeline, not a bypass. Forbidden pattern hard blocks are enforced at Layer A before any routing decision.
- Content remains in "pending" state until either Layer B or peer consensus completes.
- Traffic routing is deterministic and auditable. Rollback to Layer B is instant.

### II. Security First (NON-NEGOTIABLE) — PASS

- Credit operations use SELECT FOR UPDATE with double-entry accounting (balance_before/balance_after).
- All new API endpoints validated with Zod schemas.
- Privacy pipeline strips EXIF PII and blurs faces/plates before storage — defense-in-depth for user data.
- Rate limiting on all new write endpoints (attestation, photo submission).
- Feature flags are admin-only (requireAdmin middleware).
- No secrets in logs/URLs.

### III. Test-Driven Quality Gates (NON-NEGOTIABLE) — PASS

- Coverage targets maintained: api >= 80%, guardrails >= 95%.
- New tests for: traffic routing, submission costs, validation rewards, hardship protection, spot checks, before/after verification, privacy pipeline, attestation, mission templates, monitoring endpoints.
- Integration tests with real PostgreSQL + Redis.
- Existing guardrail regression suite (200+ adversarial cases) continues passing — traffic routing does not change Layer A behavior.

### IV. Verified Impact — PASS

- Before/after photo verification adds evidence-backed verification for mission completion.
- Credit economy uses existing double-entry accounting with idempotency keys.
- All credit transactions auditable via agent_credit_transactions table.

### V. Human Agency — PASS

- Community attestation is voluntary — no mandatory participation.
- Mission templates provide guidance, not mandates.
- Humans choose missions voluntarily; no changes to mission claiming model.

### VI. Framework Agnostic — PASS

- All new endpoints follow REST + standard envelope `{ ok, data/error, requestId }`.
- Cursor-based pagination on all list endpoints.
- No agent-framework-specific dependencies introduced.

### VII. Structured over Free-form — PASS

- Attestations use typed enum (confirmed/resolved/not_found).
- Photo pairs use structured pair_id linking.
- Mission templates are schema-validated with Zod.
- All new content carries guardrail_status.

## Project Structure

### Documentation (this feature)

```text
specs/013-phase3-production-shift/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── traffic-routing.md
│   ├── credit-economy.md
│   ├── spot-checks.md
│   ├── before-after-verification.md
│   ├── privacy-pipeline.md
│   ├── attestation.md
│   ├── mission-templates.md
│   └── monitoring.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/api/
├── src/
│   ├── routes/
│   │   ├── admin/
│   │   │   ├── phase3.ts              # MODIFY: Add production shift dashboard routes
│   │   │   └── shadow.ts              # MODIFY: Add spot check stats endpoints
│   │   ├── attestations.routes.ts     # NEW: Community attestation CRUD
│   │   └── mission-templates.routes.ts # NEW: Mission template CRUD
│   ├── services/
│   │   ├── traffic-router.ts          # NEW: Hash-based routing service
│   │   ├── submission-cost.service.ts # NEW: Credit deduction on submission
│   │   ├── validation-reward.service.ts # NEW: Credit reward on consensus
│   │   ├── spot-check.service.ts      # NEW: 5% parallel Layer B verification
│   │   ├── before-after.service.ts    # NEW: Photo pair comparison via Vision API
│   │   ├── privacy-pipeline.ts        # NEW: EXIF stripping + face/plate blurring
│   │   ├── attestation.service.ts     # NEW: Attestation logic + urgency scoring
│   │   ├── economic-health.service.ts # NEW: Faucet/sink tracking + alerting
│   │   ├── agent-credit.service.ts    # MODIFY: Add spendCredits() method
│   │   ├── consensus-engine.ts        # MODIFY: Trigger validation rewards
│   │   └── feature-flags.ts           # MODIFY: Add SUBMISSION_COST_MULTIPLIER flag
│   ├── workers/
│   │   ├── guardrail-worker.ts        # MODIFY: Insert traffic routing logic
│   │   ├── spot-check-worker.ts       # NEW: Process spot check evaluations
│   │   ├── privacy-worker.ts          # NEW: EXIF strip + face/plate blur
│   │   └── economic-health-worker.ts  # NEW: Periodic faucet/sink snapshot
│   └── lib/
│       └── traffic-hash.ts            # NEW: Deterministic hash routing function
├── tests/
│   ├── integration/
│   │   ├── traffic-routing.test.ts    # NEW
│   │   ├── credit-economy.test.ts     # NEW
│   │   ├── spot-checks.test.ts        # NEW
│   │   ├── before-after.test.ts       # NEW
│   │   ├── attestation.test.ts        # NEW
│   │   └── economic-loop.test.ts      # NEW: End-to-end economic cycle
│   └── unit/
│       ├── traffic-hash.test.ts       # NEW
│       ├── submission-cost.test.ts    # NEW
│       └── privacy-pipeline.test.ts   # NEW

packages/db/
├── src/schema/
│   ├── spotChecks.ts                  # NEW: Spot check records table
│   ├── attestations.ts               # NEW: Community attestation table
│   ├── missionTemplates.ts           # NEW: Mission template table
│   ├── economicHealthSnapshots.ts    # NEW: Periodic economic health records
│   ├── evidence.ts                   # MODIFY: Add pair_id, photo_sequence_type
│   ├── observations.ts              # MODIFY: Add privacy_processing_status
│   └── guardrailEvaluations.ts      # MODIFY: Add routing_decision column
└── drizzle/
    └── 0011_production_shift.sql     # NEW: Migration

packages/shared/
├── src/
│   ├── types/phase3.ts              # MODIFY: Add new feature flags, cost types
│   ├── constants/phase3.ts          # MODIFY: Add submission costs, reward amounts
│   └── constants/consensus.ts       # MODIFY: Add spot check constants

apps/web/
├── src/components/
│   ├── admin/
│   │   ├── ProductionShiftDashboard.tsx  # NEW: Main monitoring dashboard
│   │   ├── SpotCheckPanel.tsx           # NEW: Spot check results panel
│   │   ├── EconomicHealthPanel.tsx      # NEW: Faucet/sink ratio display
│   │   └── DecisionGateTracker.tsx      # NEW: Exit criteria progress
│   ├── AttestationButton.tsx            # NEW: Community attestation UI
│   ├── BeforeAfterEvidence.tsx          # NEW: Photo pair upload component
│   └── MissionTemplateGuide.tsx         # NEW: Templated mission claim UI
└── app/
    └── (admin)/admin/
        └── production/page.tsx          # NEW: Production shift admin page
```

**Structure Decision**: Follows existing monorepo conventions — new services in apps/api/src/services/, new routes alongside existing routes, new schemas in packages/db/src/schema/, new frontend components in apps/web/src/components/. This sprint adds ~15 new backend files, modifies ~12 existing files, and adds ~8 new frontend components.

## Complexity Tracking

> No constitution violations requiring justification. All changes follow existing patterns.
