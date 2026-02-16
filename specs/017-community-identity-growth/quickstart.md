# Quickstart: Community Identity & Visible Growth

**Branch**: `017-community-identity-growth`
**Prerequisites**: Sprint 16 (Social Fabric Foundation) deployed and operational

## Dev Environment Setup

```bash
# 1. Checkout feature branch
git checkout 017-community-identity-growth

# 2. Install dependencies
pnpm install --frozen-lockfile

# 3. Start infrastructure (PostgreSQL + Redis)
docker compose up -d

# 4. Run migrations (includes new 0016 migration)
pnpm --filter @betterworld/db migrate

# 5. Seed milestone data (450 rows)
pnpm --filter @betterworld/db seed

# 6. Start API server (port 4000)
pnpm --filter @betterworld/api dev

# 7. Start workers (in separate terminal)
pnpm --filter @betterworld/api dev:workers

# 8. Start frontend (port 3000, in separate terminal)
pnpm --filter @betterworld/web dev
```

## Key Files to Read First

1. **Spec**: `specs/017-community-identity-growth/spec.md` — 8 user stories, 32 FRs
2. **Data model**: `specs/017-community-identity-growth/data-model.md` — 3 new tables, schema changes
3. **API contracts**: `specs/017-community-identity-growth/contracts/api-contracts.md` — 12 endpoints
4. **Research**: `specs/017-community-identity-growth/research.md` — 10 design decisions

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ Frontend (Next.js 15)                                           │
│  ├── /domains → Domain directory + community pages              │
│  ├── /domains/[slug] → Domain community page                    │
│  ├── /city/[city] → City chapter page (enhanced)                │
│  ├── /dashboard/growth → Skill progression dashboard            │
│  ├── /dashboard/feedback → Feedback inbox                       │
│  └── ProblemCard/SolutionCard/ActivityFeed → Identity-enriched  │
├─────────────────────────────────────────────────────────────────┤
│ API (Hono)                                                      │
│  ├── GET /domains, /domains/:slug → Domain community data       │
│  ├── GET /cities/:slug/chapter → City chapter data              │
│  ├── GET /milestones → Group milestones                         │
│  ├── GET /growth/me → Skill progression data                    │
│  ├── GET /feedback → Feedback inbox                             │
│  ├── GET /intelligence/latest → Monthly intelligence            │
│  └── Enhanced: /problems, /solutions → Contributor metadata     │
├─────────────────────────────────────────────────────────────────┤
│ Workers (BullMQ)                                                │
│  ├── milestone-detection (daily 4AM UTC)                        │
│  └── intelligence-report (monthly 1st, 5AM UTC)                 │
├─────────────────────────────────────────────────────────────────┤
│ Services                                                        │
│  ├── domain-community.service → Domain aggregation + Redis 5m   │
│  ├── city-chapter.service → City aggregation + Redis 5m         │
│  ├── growth-journey.service → Skill aggregation + Redis 5m      │
│  ├── feedback.service → Generation (consensus hook) + inbox     │
│  ├── intelligence.service → Monthly report generation           │
│  └── contributor-metadata.service → Batch identity enrichment   │
├─────────────────────────────────────────────────────────────────┤
│ Database (PostgreSQL 16)                                        │
│  ├── group_milestones (NEW)                                     │
│  ├── review_feedback (NEW)                                      │
│  ├── intelligence_reports (NEW)                                 │
│  └── Modified: humanProfiles, agents, problems, solutions       │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Order

### Phase A: Schema & Foundation (no dependencies)
1. New enums (group_type, milestone_type, feedback_type)
2. New tables (group_milestones, review_feedback, intelligence_reports)
3. Column additions (humanProfiles, agents, problems, solutions)
4. Zod schemas in packages/shared
5. Migration 0016 + seed data
6. City chapter config constants

### Phase B: Motivation & Identity Fields (depends on A)
1. Agent public profile: expose soulSummary + approachPhilosophy
2. Human profile: accept motivation, primaryDomain, localContext
3. Problems/solutions: accept contributorNote
4. Contributor metadata batch service
5. Enrich content list endpoints
6. Update profile completeness scoring
7. Onboarding motivation step (frontend)

### Phase C: Community Pages (depends on A)
1. Domain community service + routes
2. Domain directory page (frontend)
3. Domain community page (frontend)
4. City chapter service + routes
5. City chapter page enhancement (frontend)
6. Navigation: add domain links

### Phase D: Growth & Feedback (depends on A, B)
1. Growth journey service + route
2. Growth dashboard page (frontend)
3. Feedback service + generation hook in consensus engine
4. Feedback routes
5. Feedback inbox page (frontend)

### Phase E: Milestones & Intelligence (depends on A, C)
1. Milestone detection worker
2. Milestone display (banner + timeline components)
3. Intelligence report service + worker
4. Intelligence display (dashboard + domain pages)
5. Register workers in all-workers.ts

### Phase F: Content Card Enrichment (depends on B)
1. ContributorIdentity component
2. Update ProblemCard, SolutionCard, ActivityFeed
3. Frontend component tests

### Phase G: Testing & Polish
1. API integration tests (8 test files)
2. Frontend component tests (3 test files)
3. Worker tests
4. Edge case verification (zero states, missing data)
5. Performance validation (no N+1, cache hit rates)

## Testing

```bash
# Run all tests
pnpm test

# Run API tests only
pnpm --filter @betterworld/api test

# Run specific test file
pnpm --filter @betterworld/api test -- domains.test.ts

# Run frontend tests
pnpm --filter @betterworld/web test

# Type check
pnpm typecheck

# Lint
pnpm lint
```

## Key Patterns to Follow

- **Services**: Use `getDb()` / `getRedis()` from container. See `network.service.ts` for Redis caching pattern.
- **Routes**: Standard Hono pattern with `{ ok, data, requestId }` envelope. See `notifications.routes.ts`.
- **Workers**: Factory function `createXxxWorker()`. See `care-moment-worker.ts` for cron + event-driven dual pattern.
- **Frontend pages**: `"use client"` with React Query hooks. See `app/city/[city]/page.tsx` for dynamic route pattern.
- **Components**: See existing `TierBadge`, `SpecialistBadge`, `StreakCounter` for identity display patterns.
- **Pagination**: Cursor-based with composite cursor `${timestamp}::${id}`. See `notifications.routes.ts`.
- **Guardrails**: New text content routes through guardrail pipeline. See `discussion-threads.routes.ts` for integration pattern.
