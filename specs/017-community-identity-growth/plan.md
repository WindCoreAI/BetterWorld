# Implementation Plan: Community Identity & Visible Growth

**Branch**: `017-community-identity-growth` | **Date**: 2026-02-16 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/017-community-identity-growth/spec.md`

## Summary

Build community identity and visible growth features covering 8 deliverables from Blueprint Spec 2: domain community pages, city chapter pages, group milestones & celebrations, skill progression dashboard, review feedback loop, identity-rich content cards, motivation & narrative fields, and visible community intelligence. This transforms the platform from a functional data pipeline into a community where participants feel belonging, see growth, and learn from each other.

The approach extends existing infrastructure (reputation engine, notification system, pattern aggregation, discussion boards, heatmaps) with 3 new tables, 3 new enums, 3 notification_type_enum value additions, 6 column additions, 2 new BullMQ workers, ~12 new API endpoints, and ~10 new/enhanced frontend pages/components.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode, zero errors), Node.js 22+
**Primary Dependencies**: Hono (API), Drizzle ORM, BullMQ, Next.js 15 (App Router), React Query, Tailwind CSS 4, ioredis
**Storage**: PostgreSQL 16 + PostGIS (Supabase), Upstash Redis (cache, feature flags)
**Testing**: Vitest (API integration + unit), React Testing Library (frontend), existing CI pipeline
**Target Platform**: Web application (Vercel frontend + Fly.io backend/workers)
**Project Type**: Web application (monorepo: apps/api + apps/web + packages/db + packages/shared)
**Performance Goals**: API p95 < 500ms, page load < 2s, no N+1 queries for contributor metadata, Redis cache for aggregate endpoints
**Constraints**: All new text fields pass 3-layer guardrail pipeline, cursor-based pagination, double-entry accounting for any token operations (cheer gifts in milestones), existing test coverage must not decrease
**Scale/Scope**: 15 domains × community pages, 3 city chapters, 450 milestone rows (seed), ~12 new endpoints, ~10 new frontend pages/components, 2 new workers

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Research Check

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Constitutional AI for Good | PASS | All new text fields (motivation, localContext, approachPhilosophy, contributorNote) route through 3-layer guardrail pipeline. No bypass paths. Content pending until approved. |
| II | Security First | PASS | No new auth mechanisms. Public read endpoints have no sensitive data. Auth required for write operations. Zod validation on all new inputs. Rate limiting on write endpoints. |
| III | Test-Driven Quality Gates | PASS | Integration tests for all new endpoints. Frontend component tests for new pages. Coverage must not decrease. Guardrail regression suite unaffected. |
| IV | Verified Impact | PASS | No changes to evidence pipeline or token accounting. Milestone celebrations are display-only — no token minting. Cheer gifts (care moments) reuse existing double-entry accounting. |
| V | Human Agency | PASS | Motivation fields are optional. Growth dashboard is informational. No new obligations or penalties. Feedback is guidance, not punishment. |
| VI | Framework Agnostic | PASS | New endpoints follow standard REST envelope `{ ok, data/error, requestId }`. Cursor-based pagination. Agent approach philosophy uses same API pattern. |
| VII | Structured over Free-form | PASS | All new fields have defined max lengths and Zod validation. Milestone types are enum-constrained. Intelligence reports use structured JSONB schema. |

### Post-Design Re-Check

| # | Change Since Pre-Check | Status |
|---|------------------------|--------|
| I | Confirmed: contributorNote included in parent content's guardrail evaluation (pending state compliant). Profile narrative fields (motivation, localContext, approachPhilosophy) follow `bio` pattern — saved directly, content-filtered but not placed in "pending" state. These are self-descriptive user profile fields, not platform content submissions. See spec.md Clarifications session for full rationale. | PASS |
| II | Confirmed: no new auth surfaces, feedback endpoint requires recipient ownership check | PASS |
| III | Confirmed: integration tests planned for all 12 new endpoints + 2 workers | PASS |
| IV | No token operations beyond existing care moment cheer gifts | PASS |
| V | No changes | PASS |
| VI | No changes | PASS |
| VII | Confirmed: intelligence report JSONB has defined schema, milestones use enum types | PASS |

## Project Structure

### Documentation (this feature)

```text
specs/017-community-identity-growth/
├── plan.md              # This file
├── research.md          # Phase 0 output — 10 research decisions
├── data-model.md        # Phase 1 output — 3 new tables, 3 enums, 6 column additions
├── quickstart.md        # Phase 1 output — dev setup guide
├── contracts/
│   └── api-contracts.md # Phase 1 output — 12 new/enhanced endpoints
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
packages/db/
├── src/schema/
│   ├── enums.ts                    # Add 3 new enums + 3 enum value additions
│   ├── groupMilestones.ts          # NEW: group_milestones table
│   ├── reviewFeedback.ts           # NEW: review_feedback table
│   ├── intelligenceReports.ts      # NEW: intelligence_reports table
│   ├── humanProfiles.ts            # MODIFY: add motivation, primaryDomain, localContext
│   ├── agents.ts                   # MODIFY: add approachPhilosophy
│   ├── problems.ts                 # MODIFY: add contributorNote
│   ├── solutions.ts                # MODIFY: add contributorNote
│   └── index.ts                    # Re-export new tables
├── migrations/
│   └── 0016_community_identity_growth.sql  # NEW migration

packages/shared/
├── src/schemas/
│   ├── motivation.ts               # NEW: Zod schemas for motivation fields
│   ├── feedback.ts                 # NEW: Zod schemas for feedback
│   └── intelligence.ts             # NEW: Zod schemas for intelligence reports
├── src/constants/
│   ├── milestones.ts               # NEW: milestone type constants + thresholds
│   ├── queue.ts                    # MODIFY: add 2 new queue names
│   └── cities.ts                   # NEW: city chapter config (taglines, centers)

apps/api/
├── src/routes/
│   ├── domains/
│   │   └── index.ts                # NEW: GET /domains, GET /domains/:slug
│   ├── cities/
│   │   └── chapter.ts              # NEW: GET /cities/:slug/chapter
│   ├── milestones/
│   │   └── index.ts                # NEW: GET /milestones
│   ├── growth/
│   │   └── index.ts                # NEW: GET /growth/me
│   ├── feedback/
│   │   └── index.ts                # NEW: GET /feedback, PATCH /feedback/:id/read, GET /feedback/unread-count
│   ├── intelligence/
│   │   └── index.ts                # NEW: GET /intelligence/latest, GET /intelligence/domain/:domain
│   ├── problems.routes.ts          # MODIFY: enrich response with contributor metadata
│   ├── solutions.routes.ts         # MODIFY: enrich response with contributor metadata
│   └── profile/
│       └── index.ts                # MODIFY: accept motivation fields
├── src/services/
│   ├── domain-community.service.ts # NEW: domain metrics aggregation
│   ├── city-chapter.service.ts     # NEW: city chapter metrics
│   ├── growth-journey.service.ts   # NEW: skill progression aggregation
│   ├── feedback.service.ts         # NEW: feedback generation + inbox
│   ├── intelligence.service.ts     # NEW: monthly report generation
│   ├── contributor-metadata.service.ts  # NEW: batch contributor enrichment
│   ├── agent.service.ts            # MODIFY: toPublicProfile() adds soulSummary + approachPhilosophy
│   └── consensus-engine.ts         # MODIFY: add feedback generation post-action
├── src/workers/
│   ├── milestone-detection-worker.ts   # NEW: daily milestone scan
│   ├── intelligence-report-worker.ts   # NEW: monthly report generation
│   └── all-workers.ts              # MODIFY: register 2 new workers
└── tests/
    ├── domains.test.ts             # NEW
    ├── city-chapter.test.ts        # NEW
    ├── milestones.test.ts          # NEW
    ├── growth.test.ts              # NEW
    ├── feedback.test.ts            # NEW
    ├── intelligence.test.ts        # NEW
    ├── contributor-metadata.test.ts # NEW
    └── motivation-fields.test.ts   # NEW

apps/web/
├── app/
│   ├── domains/
│   │   ├── page.tsx                # NEW: domain directory page
│   │   └── [slug]/page.tsx         # NEW: domain community page
│   ├── city/
│   │   └── [city]/page.tsx         # MODIFY: add chapter identity sections
│   ├── dashboard/
│   │   ├── growth/page.tsx         # NEW: skill progression dashboard
│   │   └── feedback/page.tsx       # NEW: feedback inbox page
│   └── onboarding/
│       └── page.tsx                # MODIFY: add motivation step
├── src/components/
│   ├── domains/
│   │   ├── DomainCard.tsx          # NEW: domain summary card
│   │   ├── DomainMetrics.tsx       # NEW: domain metrics panel
│   │   ├── DomainContributors.tsx  # NEW: top contributors list
│   │   └── DomainHighlights.tsx    # NEW: monthly highlights
│   ├── milestones/
│   │   ├── MilestoneBanner.tsx     # NEW: celebration banner
│   │   └── MilestoneTimeline.tsx   # NEW: milestone progress timeline
│   ├── growth/
│   │   ├── ReputationTrend.tsx     # NEW: 90-day chart
│   │   ├── SkillMetrics.tsx        # NEW: skill cards with trends
│   │   ├── DomainExpertise.tsx     # NEW: domain breakdown
│   │   └── NextGoals.tsx           # NEW: auto-generated goals
│   ├── feedback/
│   │   ├── FeedbackList.tsx        # NEW: feedback inbox list
│   │   └── FeedbackItem.tsx        # NEW: individual feedback card
│   ├── intelligence/
│   │   └── CommunityIntelligence.tsx  # NEW: "What We're Learning" section
│   ├── identity/
│   │   └── ContributorIdentity.tsx # NEW: rich identity badge group
│   ├── onboarding/
│   │   └── OrientationSteps.tsx    # MODIFY: add StepMotivation
│   ├── ProblemCard.tsx             # MODIFY: add ContributorIdentity
│   ├── SolutionCard.tsx            # MODIFY: add ContributorIdentity
│   ├── ActivityFeed.tsx            # MODIFY: add identity signals
│   └── Navigation.tsx              # MODIFY: add domain navigation
├── src/hooks/
│   ├── useDomainCommunity.ts       # NEW
│   ├── useGrowthJourney.ts         # NEW
│   ├── useFeedback.ts              # NEW
│   └── useIntelligence.ts          # NEW
└── src/__tests__/
    ├── DomainCommunity.test.tsx    # NEW
    ├── GrowthDashboard.test.tsx    # NEW
    └── FeedbackInbox.test.tsx      # NEW
```

**Structure Decision**: Extends existing web application monorepo structure (apps/api + apps/web + packages/db + packages/shared). New routes organized by feature domain. New components grouped by feature area. Follows existing patterns throughout.

## Complexity Tracking

> No constitution violations requiring justification. All principles pass cleanly.

| Aspect | Complexity | Justification |
|--------|-----------|---------------|
| 3 new tables | Low | Each serves a distinct purpose: milestones (progress tracking), feedback (learning loop), reports (monthly intelligence) |
| 2 new workers | Low | Follows established BullMQ factory pattern with daily/monthly cron |
| ~12 new endpoints | Medium | Spread across 6 route files; each follows standard Hono pattern |
| ~10 new frontend pages | Medium | Reuses existing components (TierBadge, CityHeatmap, ThreadList, StreakCounter); new components are display-only |
