# Implementation Plan: Mission Marketplace

**Branch**: `008-mission-marketplace` | **Date**: 2026-02-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-mission-marketplace/spec.md`

## Summary

Build the Mission Marketplace — the core bridge between agent-generated solutions and human action. Agents decompose approved solutions into 3-8 actionable missions (manually or via Claude Sonnet), which humans browse via a dual-view marketplace (list + OpenStreetMap map with clustering), filter by location/skills/domain, and claim atomically (max 3 active, race-condition-safe). Includes agent-to-agent encrypted messaging, mission expiration with token refunds, and geo-based "Near Me" search with dynamic radius. Extends existing Hono API, Drizzle ORM schema, and Next.js 15 frontend.

## Technical Context

**Language/Version**: TypeScript 5.x strict mode, Node.js 22+
**Primary Dependencies**: Hono (API), Drizzle ORM, @anthropic-ai/sdk (Claude Sonnet decomposition), Leaflet + react-leaflet (maps), Leaflet.markercluster (clustering), BullMQ (async jobs)
**Storage**: PostgreSQL 16 + PostGIS (geo-queries, GIST index), Upstash Redis (cache, rate limits, decomposition cost tracking)
**Testing**: Vitest (unit + integration), 20+ new tests targeting mission lifecycle
**Target Platform**: Web (Vercel frontend + Fly.io backend)
**Project Type**: Web application (monorepo: apps/api + apps/web + packages/db + packages/shared)
**Performance Goals**: Geo-search < 2s for 10K missions, map clustering 100+ markers without lag, mission claim atomic under concurrent load
**Constraints**: API p95 < 500ms, guardrail evaluation p95 < 5s, Claude Sonnet decomposition < 30s, max 10 decompositions/day/agent
**Scale/Scope**: 3 new DB tables (missions, missionClaims, messages), ~10 new API routes, ~5 new frontend pages, 20+ integration tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Evidence |
|---|-----------|--------|----------|
| I | Constitutional AI for Good (NON-NEGOTIABLE) | ✅ PASS | Mission descriptions pass through 3-layer guardrail pipeline (Layer A regex → Layer B Claude Haiku → Layer C admin review). Missions created with `guardrailStatus: "pending"`, not visible until approved. Missions must align with one of 15 approved domains (inherited from parent solution). |
| II | Security First (NON-NEGOTIABLE) | ✅ PASS | Zod validation on all mission inputs. Rate limiting: 10 decompositions/day/agent, 20 messages/hour/agent. Agent ownership check (cannot create missions for other agents' solutions). Message content encrypted (AES-256-GCM). IDOR prevention on claim/mission access. |
| III | Test-Driven Quality Gates (NON-NEGOTIABLE) | ✅ PASS | 20+ new integration tests (mission lifecycle, concurrent claims, max 3 active, messaging, expiration). All 768 existing tests must continue passing. TypeScript strict, ESLint zero errors. Coverage targets maintained. |
| IV | Verified Impact | ✅ PASS | Mission expiration refunds use double-entry accounting (balance_before/balance_after). Token operations use SELECT FOR UPDATE. Idempotency keys for refund transactions. |
| V | Human Agency | ✅ PASS | Humans browse/filter/claim missions voluntarily. Max 3 active missions prevents overcommitment. Atomic claiming (SELECT FOR UPDATE SKIP LOCKED). No penalty for abandoning — claim slot released. 7-day grace period on claimed missions. |
| VI | Framework Agnostic | ✅ PASS | Standard REST API with `{ ok, data/error, requestId }` envelope. Cursor-based pagination. No agent framework dependency. |
| VII | Structured over Free-form | ✅ PASS | Mission instructions and evidence requirements stored as structured JSONB. Zod schemas validate all inputs. Missions carry guardrailStatus enum. |

**Gate Result**: ✅ ALL PASS — No violations. Proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/008-mission-marketplace/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── missions.api.md
│   ├── messaging.api.md
│   └── decomposition.api.md
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/db/src/schema/
├── missions.ts          # NEW: missions table
├── missionClaims.ts     # NEW: mission_claims junction table
├── messages.ts          # NEW: agent messages table
├── enums.ts             # MODIFY: add missionStatusEnum, difficultyLevelEnum, messageStatusEnum
└── index.ts             # MODIFY: export new schemas

apps/api/src/routes/
├── missions/
│   ├── index.ts         # NEW: mission CRUD + list + claim routes
│   └── decompose.ts     # NEW: Claude Sonnet decomposition route
├── messages/
│   └── index.ts         # NEW: agent messaging routes
└── v1.routes.ts         # MODIFY: mount new route groups

apps/api/src/workers/
└── mission-expiration.ts # NEW: BullMQ daily expiration job

apps/api/src/lib/
└── geo-helpers.ts       # NEW: dynamic radius, coordinate grid snapping, PostGIS query builders

apps/web/app/
├── missions/
│   ├── page.tsx         # NEW: marketplace (list + map dual view)
│   └── [id]/page.tsx    # NEW: mission detail page
└── dashboard/page.tsx   # MODIFY: integrate real mission claims

apps/web/src/components/
├── missions/
│   ├── MissionCard.tsx       # NEW: mission list item card
│   ├── MissionMap.tsx        # NEW: Leaflet map with clustering
│   ├── MissionFilters.tsx    # NEW: filter sidebar (domain, skills, radius, reward, time)
│   ├── MissionClaimButton.tsx # NEW: claim CTA with loading/error states
│   └── MissionStatusBadge.tsx # NEW: status badge component
└── ui/
    └── Map.tsx               # NEW: reusable Leaflet map wrapper (lazy-loaded)

packages/shared/src/
├── schemas/missions.ts  # NEW: Zod schemas for mission CRUD
├── schemas/messages.ts  # NEW: Zod schemas for messaging
└── types/missions.ts    # NEW: TypeScript types for missions
```

**Structure Decision**: Extends the existing monorepo structure. New routes follow established pattern (`apps/api/src/routes/<feature>/index.ts`). Frontend pages follow Next.js App Router conventions (`apps/web/app/<feature>/page.tsx`). DB schema follows existing pattern (`packages/db/src/schema/<entity>.ts`).

## Complexity Tracking

> No constitution violations to justify. All design choices align with established principles.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
