# Implementation Plan: Phase 3 Foundation — Credit Economy + Hyperlocal System

**Branch**: `011-phase3-foundation` | **Date**: 2026-02-11 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/011-phase3-foundation/spec.md`

## Summary

Sprint 10 establishes the foundation for Phase 3 by implementing two major tracks: (1) the agent credit economy — a simplified ledger with atomic balance operations, starter grants, and a validator pool; and (2) the hyperlocal system — PostGIS spatial infrastructure, Open311 municipal data ingestion from Portland and Chicago, human observation submission with GPS validation, and scale-adaptive scoring. All new features are gated behind feature flags (defaulting to disabled) to ensure zero impact on existing Phase 2 functionality. The implementation adds 8 new database tables, extends 3 existing tables, adds 8 new enums, creates 2 new BullMQ workers, and delivers 20+ integration tests.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js 22+
**Primary Dependencies**: Hono (API), Drizzle ORM, BullMQ, Zod, Pino, sharp, blockhash-core
**Storage**: PostgreSQL 16 + PostGIS + pgvector (Supabase), Upstash Redis
**Testing**: Vitest (unit + integration), k6 (load), Playwright (e2e)
**Target Platform**: Linux server (Fly.io API/workers), Vercel (frontend)
**Project Type**: Turborepo monorepo (apps/api, apps/web, packages/db, packages/shared, packages/guardrails)
**Performance Goals**: API p95 < 500ms, spatial queries p95 < 500ms for 100K records, Open311 ingestion < 30min end-to-end latency
**Constraints**: Zero regressions on 944+ existing tests, all Phase 3 features behind feature flags, PostGIS migration must be zero-downtime
**Scale/Scope**: 8 new tables, 3 table extensions, 8 new enums, 2 enum extensions, 2 new workers, ~7 new API endpoints, 20+ new tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Constitutional AI for Good (NON-NEGOTIABLE) — PASS

- Open311-ingested content routes through existing 3-layer guardrail pipeline (Layer A → B → C). No bypass path.
- All ingested problems enter "pending" guardrail_status until evaluation completes.
- Municipal reports are mapped to one of the 15 approved UN SDG-aligned domains via configurable service code mapping.
- Observations do not bypass guardrails — they attach to existing problems or auto-create problems that go through the pipeline.

### II. Security First (NON-NEGOTIABLE) — PASS

- Agent credit operations use `SELECT FOR UPDATE` for race-condition protection.
- Idempotency keys prevent duplicate starter grants and credit transactions.
- GPS validation rejects implausible coordinates (null island, polar, low accuracy).
- Feature flags provide instant rollback capability.
- All new endpoints use existing auth middleware (agentAuth/humanAuth) and Zod validation.
- No new secrets introduced; Open311 API keys (if needed) stored in environment variables.
- Rate limiting applied to observation submission endpoints.

### III. Test-Driven Quality Gates (NON-NEGOTIABLE) — PASS

- 20+ new integration tests required (FR-036).
- All 944+ existing tests must continue passing (SC-007).
- TypeScript strict mode, ESLint zero errors maintained.
- Coverage targets maintained per constitution.

### IV. Verified Impact — PASS

- Agent credit transactions use atomic ledger operations with `SELECT FOR UPDATE`.
- Agent credit transactions include `balance_before`/`balance_after` fields matching the human ImpactToken `tokenTransactions` pattern — full double-entry accounting per Constitution Principle IV.
- Idempotency keys on all credit transactions prevent replay.
- Observations include GPS verification and pHash duplicate detection.

### V. Human Agency — PASS

- Observation submission is voluntary — humans choose when and what to observe.
- No new mission constraints introduced.
- Existing mission limits (max 3 active) unchanged.

### VI. Framework Agnostic — PASS

- New agent-facing endpoints (credit balance, transaction history) use standard REST + envelope response format.
- Cursor-based pagination on transaction history.
- No framework-specific requirements for validator pool participation.

### VII. Structured over Free-form — PASS

- Observations follow defined schema (Zod-validated: observationType, caption, GPS, media).
- Open311 data is transformed into structured problem schema, not stored as raw text.
- All new entities have defined schemas validated at ingestion.
- Scoring formula documented: hyperlocal uses urgency×0.30 + actionability×0.30 + feasibility×0.25 + demand×0.15.

## Project Structure

### Documentation (this feature)

```text
specs/011-phase3-foundation/
├── plan.md              # This file
├── research.md          # Phase 0: Research findings
├── data-model.md        # Phase 1: Entity definitions and schema design
├── quickstart.md        # Phase 1: Developer onboarding guide
├── contracts/           # Phase 1: API endpoint contracts
│   ├── agent-credits.yaml
│   ├── observations.yaml
│   └── admin-phase3.yaml
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
packages/db/src/schema/
├── enums.ts                    # +8 new enums (validator_tier, consensus_decision, etc.)
├── agents.ts                   # Extended: +creditBalance, +homeRegionName, +homeRegionPoint, +localProblemsReported, +localReputationScore
├── problems.ts                 # Extended: +locationPoint, +localUrgency, +actionability, +radiusMeters, +observationCount, +municipalSourceId, +municipalSourceType
├── peerReviews.ts              # Extended: +reviewType, +observationId, evidenceId nullable
├── validatorPool.ts            # NEW: Agent validator registry
├── peerEvaluations.ts          # NEW: Individual validator judgments
├── consensusResults.ts         # NEW: Aggregated consensus decisions
├── agentCreditTransactions.ts  # NEW: Agent credit ledger
├── creditConversions.ts        # NEW: Agent→human conversion bridge
├── observations.ts             # NEW: Hyperlocal human observations
├── problemClusters.ts          # NEW: Aggregated problem patterns
├── disputes.ts                 # NEW: Dispute resolution records
└── index.ts                    # Updated: export new tables

packages/db/drizzle/
└── 0009_*.sql                  # PostGIS extension + new enums + new tables + extensions + backfill

packages/shared/src/
├── config.ts                   # Extended: Phase 3 feature flags
├── constants.ts                # Extended: credit amounts, scoring weights, Open311 config
└── types/
    └── phase3.ts               # NEW: Shared types for Phase 3 entities

apps/api/src/
├── routes/
│   ├── agents/
│   │   └── credits.ts          # NEW: Agent credit balance + transaction history
│   ├── observations/
│   │   └── index.ts            # NEW: Observation CRUD + GPS validation
│   └── admin/
│       └── phase3.ts           # NEW: Credit economy + validator pool dashboard
├── services/
│   ├── agent-credit.service.ts # NEW: Credit ledger operations (earn, debit, starter grant)
│   ├── open311.service.ts      # NEW: Open311 API client + transform logic
│   ├── observation.service.ts  # NEW: Observation submission + GPS validation + pHash
│   ├── hyperlocal-scoring.ts   # NEW: Scale-adaptive scoring engine
│   └── feature-flags.ts        # NEW: Feature flag management
├── workers/
│   ├── municipal-ingest.ts     # NEW: BullMQ cron worker for Open311 polling
│   └── all-workers.ts          # Extended: register municipal-ingest worker
└── lib/
    └── geo-helpers.ts          # Extended: PostGIS query builders (ST_DWithin, ST_Distance)

apps/web/src/
└── components/admin/
    ├── CreditEconomyDashboard.tsx  # NEW: Credit supply metrics
    └── ValidatorPoolDashboard.tsx  # NEW: Validator pool stats
```

**Structure Decision**: Existing Turborepo monorepo structure. New code integrates into established package boundaries: schema in `packages/db`, config in `packages/shared`, routes/services/workers in `apps/api`, admin UI components in `apps/web`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| PostGIS raw SQL in migrations | Drizzle ORM lacks native PostGIS type support | Using raw `sql` template tags for geography columns and spatial queries. Community `drizzle-postgis` extension evaluated but immature. Raw SQL is well-contained to migration files and geo-helpers. |

Note: The previously-listed "simplified accounting" deviation (D2) has been resolved — agent credit transactions now include `balance_before`/`balance_after` per Constitution Principle IV.
