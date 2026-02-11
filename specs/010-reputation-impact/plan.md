# Implementation Plan: Reputation & Impact System

**Branch**: `010-reputation-impact` | **Date**: 2026-02-11 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/010-reputation-impact/spec.md`

## Summary

Sprint 9 implements the Reputation & Impact system — the gamification and trust layer for BetterWorld. Core deliverables:

1. **Reputation scoring engine** — 4-factor algorithm (mission quality, peer accuracy, streak, endorsements) with weekly decay and 5 tiers (Newcomer→Champion) that unlock privileges (peer review, mission creation, governance, token multipliers).
2. **Leaderboards** — 4 ranking types (reputation, impact, tokens, missions) with domain/time/location filters, Redis-cached with 1hr TTL, cursor-paginated top 100.
3. **Public Impact Dashboard** — Aggregated metrics + Leaflet heatmap showing global mission density, accessible without auth.
4. **Per-user Impact Portfolio** — Shareable profile with OG tags, public/private toggle, mission timeline.
5. **Streak system** — Consecutive-day tracking with reward multipliers (1.1x–2.0x) and streak freeze (1/30 days).
6. **Fraud scoring pipeline** — pHash duplicate detection, velocity checks, statistical profiling with tiered thresholds (50=flag, 150=suspend).
7. **Admin fraud review queue** — Flagged accounts with score breakdown, suspend/clear/reset actions, audit trail.
8. **Hourly aggregation worker** — BullMQ job computing cached metrics for dashboards and leaderboards.
9. **Grafana dashboards** — Phase 2 operational metrics (reputation distribution, fraud stats, verification latency).
10. **k6 load test** — 5K concurrent users, p95 <3s.
11. **Security audit** — OWASP Top 10 + ZAP scan, zero P0/P1.

## Technical Context

**Language/Version**: TypeScript 5.x strict mode, Node.js 22+
**Primary Dependencies**: Hono (API), Drizzle ORM, BullMQ (workers), Redis (cache), sharp-phash (pHash), Leaflet + leaflet.heat (heatmap), Next.js 15 (frontend)
**Storage**: PostgreSQL 16 (Supabase) + Upstash Redis
**Testing**: Vitest (unit + integration), k6 (load), OWASP ZAP (security)
**Target Platform**: Fly.io (backend), Vercel (frontend)
**Project Type**: Web (monorepo — apps/api + apps/web + packages/db + packages/shared)
**Performance Goals**: Leaderboard p95 <2s, Dashboard p95 <3s, reputation calc <5s, fraud pipeline async <30s, aggregation job <5min for 100K records
**Constraints**: API p95 <500ms (constitution), guardrail p95 <3s (Phase 2 target), SELECT FOR UPDATE for token ops, double-entry accounting, cursor-based pagination everywhere
**Scale/Scope**: 5K concurrent users (k6 target), ~18K leaderboard cache entries, 810+ existing tests + 40+ new tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Constitutional AI for Good (NON-NEGOTIABLE) — PASS
- Reputation system does not bypass guardrails — all underlying content (problems, solutions, missions, evidence) already passes 3-layer guardrails.
- Fraud detection adds an additional protection layer, strengthening the guardrail system.
- Leaderboards and portfolios only expose approved/verified content.

### II. Security First (NON-NEGOTIABLE) — PASS
- Fraud scores use server-side computation, never client-side.
- Admin fraud actions logged to immutable audit trail.
- No new API keys or secrets introduced; existing auth patterns reused.
- Zod validation on all new endpoints.
- Rate limiting on all new write endpoints.
- OWASP audit explicitly scoped in this sprint.
- OG tags do not expose sensitive data (email, location coordinates).

### III. Test-Driven Quality Gates (NON-NEGOTIABLE) — PASS
- 40+ new tests for reputation, leaderboards, fraud, aggregation.
- Coverage must not decrease (810+ existing tests continue passing).
- k6 load test validates performance under 5K concurrent users.
- All new DB operations covered by integration tests.

### IV. Verified Impact — PASS
- Reputation scores derived from verified evidence (AI confidence scores, peer review consensus).
- Token multipliers applied to base rewards computed from verified evidence.
- Double-entry accounting preserved for all token operations with multipliers.
- SELECT FOR UPDATE for all token balance modifications.
- Idempotency keys for reward distribution with multipliers.

### V. Human Agency — PASS
- Reputation is passive/automatic — no additional burden on humans.
- Portfolio visibility toggle gives humans control over their public profile.
- Streak system includes freeze feature to avoid punishing unavoidable absences.
- Tier demotion has 7-day grace period.

### VI. Framework Agnostic — PASS
- All new endpoints use standard REST API with `{ ok, data/error, requestId }` envelope.
- Cursor-based pagination on all list endpoints.
- No agent-framework-specific code.

### VII. Structured over Free-form — PASS
- All new entities use Zod-validated schemas.
- Reputation algorithm uses defined formula (not free-form scoring).
- Fraud scoring uses structured thresholds, not subjective evaluation.
- Leaderboard filters use enum values (domain, time period).

## Project Structure

### Documentation (this feature)

```text
specs/010-reputation-impact/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── reputation.yaml  # Reputation API contracts
│   ├── leaderboards.yaml # Leaderboard API contracts
│   ├── portfolios.yaml  # Portfolio API contracts
│   ├── fraud.yaml       # Fraud detection API contracts
│   └── impact.yaml      # Impact Dashboard API contracts
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/db/src/schema/
├── reputation.ts           # NEW: reputationScores, reputationHistory, reputationTiers tables
├── streaks.ts              # NEW: streaks table
├── fraudScores.ts          # NEW: fraudScores, fraudEvents tables
├── endorsements.ts         # NEW: endorsements table
└── enums.ts                # MODIFY: add reputationTierEnum, fraudActionEnum, endorsementStatusEnum

packages/shared/src/
├── schemas/reputation.ts   # NEW: Zod schemas for reputation, leaderboard, fraud
├── types/reputation.ts     # NEW: TypeScript types for reputation entities
└── constants/queue.ts      # MODIFY: add REPUTATION_DECAY, METRICS_AGGREGATION, FRAUD_SCORING queue names
└── constants/reputation.ts # NEW: tier thresholds, multipliers, decay rates

apps/api/src/
├── routes/
│   ├── reputation/index.ts      # NEW: GET /reputation/:humanId, GET /reputation/me
│   ├── leaderboards/index.ts    # NEW: GET /leaderboards/:type, GET /leaderboards/:type/me
│   ├── portfolios/index.ts      # NEW: GET /portfolios/:humanId, PATCH /portfolios/me/visibility
│   ├── fraud/index.ts           # NEW: admin fraud review queue routes
│   ├── impact/index.ts          # NEW: public Impact Dashboard endpoint
│   └── streaks/index.ts         # NEW: GET /streaks/me
├── workers/
│   ├── reputation-calculation.ts  # NEW: reputation scoring after events
│   ├── reputation-decay.ts       # NEW: daily decay job (BullMQ cron)
│   ├── metrics-aggregation.ts    # NEW: hourly aggregation job
│   └── fraud-scoring.ts          # NEW: fraud scoring pipeline
├── lib/
│   ├── reputation-engine.ts      # NEW: 4-factor algorithm + tier logic
│   ├── fraud-detection.ts        # NEW: pHash, velocity, statistical profiling
│   └── phash.ts                  # NEW: perceptual hashing with sharp-phash
└── v1.routes.ts                  # MODIFY: mount new route groups

apps/web/
├── app/
│   ├── impact/page.tsx           # NEW: public Impact Dashboard
│   ├── leaderboards/page.tsx     # NEW: leaderboard page
│   ├── portfolio/[humanId]/page.tsx  # NEW: public Impact Portfolio
│   └── portfolio/[humanId]/opengraph-image.tsx  # NEW: OG image route
├── src/components/
│   ├── reputation/               # NEW: ReputationScore, TierBadge, TierProgress
│   ├── leaderboards/             # NEW: LeaderboardTable, LeaderboardFilters
│   ├── impact/                   # NEW: ImpactMetrics, ImpactHeatmap, DomainChart
│   ├── portfolio/                # NEW: PortfolioHeader, MissionTimeline, ShareButton
│   └── streaks/                  # NEW: StreakCounter, StreakFreezeButton
└── src/types/reputation.ts       # NEW: frontend type definitions

tests/ (within each package)
├── apps/api/src/__tests__/
│   ├── reputation.test.ts        # NEW: reputation scoring integration tests
│   ├── leaderboards.test.ts      # NEW: leaderboard endpoint tests
│   ├── fraud-scoring.test.ts     # NEW: fraud pipeline tests
│   └── metrics-aggregation.test.ts # NEW: aggregation worker tests
├── k6/
│   └── phase2-load-test.js       # NEW: 5K concurrent user load test
└── security/
    └── owasp-zap-config.yaml     # NEW: ZAP scan configuration
```

**Structure Decision**: Follows existing monorepo pattern (apps/api + apps/web + packages/db + packages/shared). New tables in packages/db/src/schema/, new API routes in apps/api/src/routes/, new frontend pages in apps/web/app/, new workers in apps/api/src/workers/. Consistent with Sprint 6-8 conventions.

## Constitution Check — Post-Design Re-Evaluation

*Re-checked after Phase 1 design completion (data-model.md, contracts/, quickstart.md).*

### I. Constitutional AI for Good — PASS (confirmed)
- No new content types bypass guardrails. Reputation is derived from already-guardrailed content.
- Fraud detection (pHash, velocity, statistical) only flags/suspends — does not auto-delete content.
- Public Impact Dashboard and portfolios only display verified/approved data.

### II. Security First — PASS (confirmed)
- `fraud_admin_actions` table provides immutable audit trail for all admin fraud actions.
- Endorsement endpoint rate-limited (5/day). Streak freeze rate-limited (1/30 days).
- Portfolio endpoint sanitizes output — no email, precise GPS, or internal IDs exposed.
- All new Zod schemas defined in contracts. No unvalidated inputs.
- pHash comparison is server-side only. No hash values exposed to clients.
- Admin fraud routes require admin auth. No privilege escalation paths.

### III. Test-Driven Quality Gates — PASS (confirmed)
- 40+ new integration tests scoped: reputation (10+), leaderboards (10+), fraud (10+), aggregation (5+), streaks (5+).
- k6 load test covers all new endpoints (leaderboards, dashboard, evidence, reputation).
- OWASP ZAP scan targets all new API routes.
- Existing 810+ tests unaffected (no schema modifications to existing tables).

### IV. Verified Impact — PASS (confirmed)
- Token multipliers (tier × streak) applied in `distributeEvidenceReward()` using double-entry accounting.
- `balanceBefore`/`balanceAfter` preserved. `SELECT FOR UPDATE` used for balance operations.
- Idempotency key format: `evidence-reward:{evidenceId}` (unchanged, multiplier applied before insert).
- Reputation algorithm uses `finalConfidence` from verified evidence — not self-reported.

### V. Human Agency — PASS (confirmed)
- Portfolio visibility toggle (public/private) gives humans control.
- Streak freeze prevents punishment for unavoidable absences.
- Grace period (7 days) before tier demotion.
- Humans are never penalized for low reputation — only lose privilege access.
- No forced participation: reputation is passive/automatic.

### VI. Framework Agnostic — PASS (confirmed)
- All new endpoints return `{ ok, data/error, requestId }` envelope.
- Leaderboard pagination uses cursor (base64-encoded offset), not traditional offset.
- No framework-specific agent code. Agents interact via existing API.

### VII. Structured over Free-form — PASS (confirmed)
- All 8 new database tables use strict schemas with CHECK constraints and enums.
- Reputation formula is deterministic: `(quality×0.4 + accuracy×0.3 + streak×0.2 + endorsements×0.1) × tier_multiplier`.
- Fraud scoring uses quantitative thresholds (50/150), not subjective judgment.
- Leaderboard filters use enum values validated by Zod.

**Result: All 7 constitution principles PASS post-design. No violations to justify.**

## Complexity Tracking

> No constitution violations. All principles satisfied.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Leaderboard pagination uses base64-encoded offset (not true cursor) | Redis Sorted Sets do not support cursor-based enumeration; ZREVRANGE requires numeric offset. | True cursor-based pagination (keyset) is impossible with sorted sets. The base64-encoded offset is a pragmatic necessity — the underlying data is a cached snapshot rebuilt hourly, so offset stability is acceptable. This is NOT traditional offset-based DB pagination. |
