# Implementation Plan: Phase 3 Integration (Sprint 13)

**Branch**: `014-phase3-integration` | **Date**: 2026-02-13 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/014-phase3-integration/spec.md`

## Summary

Sprint 13 completes Phase 3 by deeply integrating the credit economy and hyperlocal features introduced in Sprints 10-12. Key deliverables: dispute resolution system (validators challenge consensus decisions via credit staking), dynamic rate adjustment (weekly auto-tuning of faucet/sink ratio), evidence review economy (validators earn credits for reviewing mission evidence), domain specialization (per-domain F1 tracking with specialist 1.5x weight), hybrid quorum assignment (2 local + 1 global for hyperlocal problems), pattern aggregation engine (cluster similar problems into systemic issues), Denver Open311 expansion, cross-city insights dashboard, and offline PWA support. The sprint extends existing patterns (double-entry credits, BullMQ workers, PostGIS affinity, feature flags) with minimal new infrastructure.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode, zero errors), Node.js 22+
**Primary Dependencies**: Hono (API), Drizzle ORM, BullMQ, Zod, Pino, sharp, @anthropic-ai/sdk, ioredis, jose
**Storage**: PostgreSQL 16 + PostGIS + pgvector (Supabase), Upstash Redis (cache/flags/queue), Supabase Storage (photos)
**Testing**: Vitest (unit + integration), k6 (load), 1096 existing tests
**Target Platform**: Linux server (Fly.io), Web (Next.js 15 on Vercel)
**Project Type**: Monorepo (Turborepo + pnpm workspaces)
**Performance Goals**: API p95 <500ms, consensus p95 <10s (down from <15s), guardrail p95 <2s
**Constraints**: Offline-capable PWA for observations, <200ms p95 for cached reads, PostGIS spatial indexes required for <50km validator lookups
**Scale/Scope**: 100+ validators, 3 cities (Portland, Chicago, Denver), 1000+ problems, 50+ agents

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Constitutional AI for Good | PASS | All new features (disputes, evidence reviews, pattern aggregation) operate within the 3-layer guardrail system. Denver ingestion routes through pending→guardrail pipeline. No bypass paths introduced. |
| II | Security First | PASS | Dispute stakes use SELECT FOR UPDATE (race protection). Credit adjustments use double-entry accounting. Offline queue uses secure local storage. Rate limits on dispute filing (3 failures → 60-day suspension). Admin RBAC for rate adjustment overrides and dispute resolution. |
| III | Test-Driven Quality Gates | PASS | 15+ new integration tests required per spec. Coverage targets maintained. All new services testable via existing mock patterns. |
| IV | Verified Impact | PASS | Evidence review by validators extends the multi-stage verification pipeline. Dispute resolution adds accountability. Pattern aggregation provides systemic impact visibility. |
| V | Human Agency | PASS | No changes to mission claiming or human participation model. Offline PWA enhances human agency by removing connectivity barriers. |
| VI | Framework Agnostic | PASS | All new endpoints follow REST + standard envelope `{ ok, data/error, requestId }`. Cursor-based pagination maintained. No framework-specific dependencies. |
| VII | Structured over Free-form | PASS | Dispute reasons are text but bounded. Pattern summaries are AI-generated structured text. All new entities validated by Zod schemas. Domain specialization uses existing enum domains. |

**Gate Result**: ALL PASS — no violations requiring complexity justification.

## Project Structure

### Documentation (this feature)

```text
specs/014-phase3-integration/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── disputes.md
│   ├── rate-adjustment.md
│   ├── evidence-review.md
│   ├── domain-specialization.md
│   ├── hybrid-quorum.md
│   ├── pattern-aggregation.md
│   ├── denver-expansion.md
│   └── cross-city.md
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
packages/db/src/schema/
├── disputes.ts              # NEW: disputes table
├── rateAdjustments.ts       # NEW: rate_adjustments table
├── evidenceReviews.ts       # NEW: evidence_review_assignments table
├── enums.ts                 # EXTEND: new enum values (dispute_status, dispute_verdict, rate_direction)
├── validatorPool.ts         # EXTEND: domain_scores JSONB, capabilities JSONB
├── problemClusters.ts       # EXTEND: systemic_issue flag, cluster management
└── economicHealthSnapshots.ts  # EXTEND: rate adjustment tracking

packages/db/src/migrations/
└── 0012_phase3_integration.sql  # NEW: Sprint 13 migration

apps/api/src/services/
├── dispute.service.ts           # NEW: dispute lifecycle (file, review, resolve)
├── rate-adjustment.service.ts   # NEW: faucet/sink calculation, auto-adjust logic
├── evidence-review.service.ts   # NEW: evidence review assignment + reward
├── domain-specialization.ts     # NEW: per-domain F1, specialist designation
├── hybrid-quorum.service.ts     # NEW: 2 local + 1 global assignment
├── pattern-aggregation.ts       # NEW: clustering + summary generation
├── open311.service.ts           # EXTEND: Denver city config
├── consensus-engine.ts          # EXTEND: specialist 1.5x weight
├── evaluation-assignment.ts     # EXTEND: hybrid quorum logic
├── validation-reward.service.ts # EXTEND: local 1.5x bonus
└── economic-health.service.ts   # EXTEND: rate adjustment history

apps/api/src/routes/
├── disputes.routes.ts           # NEW: 5 endpoints
├── evidence-reviews.routes.ts   # NEW: 3 endpoints
├── admin-rate.routes.ts         # NEW: 2 endpoints
├── pattern.routes.ts            # NEW: 3 endpoints
├── cross-city.routes.ts         # NEW: 2 endpoints
├── validator.routes.ts          # EXTEND: specialist info
└── evaluations.routes.ts        # EXTEND: evidence review type

apps/api/src/workers/
├── rate-adjustment-worker.ts    # NEW: weekly cron
├── pattern-aggregation-worker.ts # NEW: daily cron
└── municipal-ingest.ts          # EXTEND: Denver config

apps/web/app/
├── disputes/page.tsx             # NEW: dispute filing UI
├── admin/disputes/page.tsx       # NEW: admin dispute queue
├── admin/cross-city/page.tsx     # NEW: cross-city dashboard
├── admin/patterns/page.tsx       # NEW: systemic issues view
└── evidence-reviews/page.tsx     # NEW: evidence review queue

apps/web/src/components/
├── disputes/DisputeForm.tsx      # NEW
├── disputes/DisputeCard.tsx      # NEW
├── admin/CrossCityDashboard.tsx  # NEW
├── admin/PatternClusterView.tsx  # NEW
├── admin/DisputeReviewPanel.tsx  # NEW
└── admin/RateAdjustmentPanel.tsx # NEW

apps/web/public/
├── manifest.json                 # NEW: PWA manifest
├── sw.js                         # NEW: Service Worker
└── icons/                        # NEW: PWA icons
```

**Structure Decision**: Extends existing monorepo structure. New services follow established patterns (service → route → test). New DB tables follow Drizzle schema conventions. PWA adds manifest + service worker to existing Next.js frontend.

## Complexity Tracking

> No constitution violations detected — table not needed.

## Implementation Phases

### Phase A: Credit Economy Deep Integration (Weeks 1-1.5)

**Track**: Dispute Resolution + Dynamic Rate Adjustment

1. DB migration: `disputes` table, `rate_adjustments` table, new enums
2. Dispute service: file (stake deduction), admin review, resolve (refund+bonus or forfeit), suspension logic
3. Rate adjustment service: faucet/sink ratio calculation, weekly auto-adjust, circuit breaker
4. Dispute routes (5 endpoints) + admin rate routes (2 endpoints)
5. Rate adjustment worker (weekly BullMQ cron)
6. Frontend: dispute filing page, admin dispute queue, rate adjustment panel
7. Tests: dispute lifecycle, rate adjustment triggers, circuit breaker, suspension

### Phase B: Validator Enhancements (Week 1.5-2)

**Track**: Evidence Review Economy + Domain Specialization + Hybrid Quorum

1. DB extensions: `evidence_review_assignments` table, `validator_pool.capabilities` JSONB, `validator_pool.domain_scores` enhancement
2. Evidence review service: assignment (vision-capable priority), review submission, reward distribution
3. Domain specialization service: per-domain F1 tracking, specialist designation/revocation
4. Hybrid quorum service: 2 local + 1 global assignment, graceful degradation
5. Modify consensus engine: specialist 1.5x weight multiplier
6. Modify validation reward: local 1.5x bonus
7. Evidence review routes (3 endpoints), extend validator routes
8. Frontend: evidence review queue page, specialist badges on profiles
9. Tests: evidence review lifecycle, specialist threshold, hybrid quorum composition, local bonus

### Phase C: Hyperlocal Intelligence (Week 2-2.5)

**Track**: Pattern Aggregation + Denver + Cross-City

1. Pattern aggregation service: clustering algorithm (proximity + category + embedding similarity), summary generation (Claude Sonnet)
2. Pattern aggregation worker (daily BullMQ cron)
3. Denver Open311 config: endpoint, category mapping, add to city configs
4. Cross-city insights service: per-capita normalization, comparative metrics
5. Pattern routes (3 endpoints), cross-city routes (2 endpoints)
6. Frontend: pattern cluster view, cross-city dashboard, Denver in city selector
7. Tests: clustering logic, Denver ingestion, cross-city metrics

### Phase D: Offline PWA + Performance (Week 2.5-3)

**Track**: Offline Support + Performance Optimization

1. PWA manifest + service worker registration in Next.js
2. Offline observation queue: IndexedDB storage, background sync, retry logic
3. Cache strategy: problem list caching for offline read
4. PostGIS spatial indexes for validator lookups
5. Redis cache for validator locations (1hr TTL)
6. Performance benchmarks: consensus p95 <10s target
7. Frontend: install prompt, offline indicator, queue status
8. Tests: offline queue/sync, spatial index performance

### Phase E: Integration Testing + Polish (Week 3)

1. 15+ integration tests covering all major features
2. End-to-end flow: dispute → resolution → credit movement
3. End-to-end flow: evidence submission → peer review → reward
4. End-to-end flow: Denver ingestion → pattern detection → cluster
5. Offline observation → sync → privacy pipeline
6. TypeScript zero errors, ESLint zero errors
7. Performance validation against targets
