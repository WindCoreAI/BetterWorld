# Quickstart: Social Fabric Foundation

**Branch**: `016-social-fabric-foundation`
**Date**: 2026-02-16

## Prerequisites

- Node.js 22+
- pnpm 9+
- Docker (for PostgreSQL 16 + Redis)
- Existing BetterWorld development environment set up

## Setup

```bash
# Switch to feature branch
git checkout 016-social-fabric-foundation

# Install dependencies
pnpm install --frozen-lockfile

# Start infrastructure (PostgreSQL + Redis)
docker compose up -d

# Run migration (includes new 0015_social_fabric.sql)
pnpm --filter @betterworld/db db:push

# Start API server
pnpm --filter @betterworld/api dev

# Start frontend (separate terminal)
pnpm --filter @betterworld/web dev
```

## Development Order

Follow this implementation sequence — matches `tasks.md` phase ordering. Each phase depends on the previous:

### Phase 1: Schema & Migration
1. Add new enums to `packages/db/src/schema/enums.ts`
2. Create schema files: `follows.ts`, `connections.ts`, `discussionThreads.ts`, `discussionReplies.ts`, `notifications.ts`
3. Export from `packages/db/src/schema/index.ts`
4. Generate and verify migration `0015_social_fabric.sql`
5. Run migration locally

### Phase 2: Notifications + WebSocket + API Client (Foundational — blocks all user stories)
1. `notification.service.ts` — create, aggregate, mark read, WebSocket push
2. `notifications.routes.ts` — 4 endpoints
3. Extend WebSocket server: add human client tracking + `sendToHuman()` function, create human WebSocket connection route
4. Extend `humanApi.ts` with social API functions (follows, connections, discussions, notifications, network, care, impact)
5. `useNotifications.ts` hook, `NotificationBell.tsx`, `NotificationList.tsx`, `NotificationItem.tsx`
6. Integrate notification bell into main navigation (`apps/web/src/components/Navigation.tsx`)
7. Create human WebSocket connection hook for frontend

### Phase 3: Follow System (US1 — P1)
1. `follow.service.ts` — follow/unfollow, counts, list queries
2. `follows.routes.ts` — 6 endpoints (POST, DELETE, GET following, GET followers, GET status, GET counts)
3. `FollowButton.tsx` frontend component
4. Integrate into portfolio page and leaderboard

### Phase 4: Connection Graph (US2 — P1)
1. `connection.service.ts` — request/accept/decline, suggestion algorithm, shared history
2. `connections.routes.ts` — 8 endpoints
3. `ConnectButton.tsx`, `ConnectionSuggestions.tsx`, `ConnectionsList.tsx`
4. "People you may know" dashboard card

### Phase 5: Discussion Spaces (US3 — P2)
1. `discussion.service.ts` — thread/reply CRUD with full 3-layer guardrail pipeline (regex rule engine sync + Layer B async + Layer C admin review), guardrailStatus tracking, no pending visibility
2. `discussions.routes.ts` — 5 endpoints (optionalAuth for reads, requireHuman for writes)
3. Discussion board pages (domain + city), thread detail page
4. `ThreadList.tsx`, `ThreadDetail.tsx`, `NewThreadForm.tsx`, `ReplyForm.tsx`

### Phase 6: Personal Network Dashboard (US4 — P2)
1. `network.service.ts` — aggregate from connections + reviews + endorsements + missions
2. `network.routes.ts` — 2 endpoints with Redis caching
3. `YourNetworkCard.tsx` dashboard card
4. Full network page with interaction history

### Phase 7: Care Moments (US5 — P2, depends on US1)
1. `care-moment.service.ts` — cheer/celebrate with token gift, milestone detection
2. `care-moments.routes.ts` — 2 endpoints
3. `care-moment-worker.ts` — BullMQ worker for streak-break (hourly) + milestone (event-driven) + comeback (event-driven on login)
4. Hook milestone detection into existing mission completion (`apps/api/src/routes/missions/index.ts`) and tier change flows (`apps/api/src/lib/reputation-engine.ts`)
5. `CheerButton.tsx`, `CelebrateButton.tsx`, `CareNotification.tsx`

### Phase 8: Contribution Ripple Effect (US6 — P3)
1. `impact-chain.service.ts` — chain traversal (depth-limited), ripple aggregation
2. `impact.routes.ts` — 2 endpoints (optionalAuth for chain, requireHuman for my-ripple)
3. `ImpactChain.tsx`, `RippleSummary.tsx`
4. `ImpactRippleCard.tsx` dashboard card
5. Impact chain visualization page

### Phase 9: Polish & Cross-Cutting
1. Dashboard integration, navigation links, discussion discovery page
2. Notification retention policy (BullMQ daily cron, 90-day archival)
3. Analytics hooks (Redis counters for success criteria measurement)
4. Verification checklist

### Phase 10: Testing (Constitution Principle III)
1. API integration tests for all new route files (~7 test files)
2. Unit tests for suggestion algorithm and care-moment worker
3. Frontend component tests for critical flows
4. Coverage verification (must not decrease from 1254 baseline)

## Key Files to Reference

| What | Where |
|------|-------|
| Schema pattern | `packages/db/src/schema/endorsements.ts` |
| Route pattern | `apps/api/src/routes/problems.routes.ts` |
| Service pattern | `apps/api/src/services/agent-credit.service.ts` |
| Worker pattern | `apps/api/src/workers/reputation-decay.ts` |
| Layer A guardrail | `packages/guardrails/src/layer-a/rule-engine.ts` |
| WebSocket feed | `apps/api/src/ws/feed.ts` |
| Token transactions | `packages/db/src/schema/tokenTransactions.ts` |
| Dashboard cards | `apps/web/src/components/dashboard/DashboardCards.tsx` |
| API client | `apps/web/src/lib/humanApi.ts` |
| Auth hook | `apps/web/src/hooks/useHumanAuth.ts` |

## Testing

```bash
# Run all tests
pnpm test

# Run API tests only
pnpm --filter @betterworld/api test

# Run frontend tests only
pnpm --filter @betterworld/web test

# Run with coverage
pnpm --filter @betterworld/api test -- --coverage
```

## Verification Checklist

After implementation, verify:

- [ ] Follow/unfollow works from portfolio page
- [ ] Connection request → accept → appears in connection list
- [ ] Connection suggestions show on dashboard
- [ ] Discussion thread creation passes full 3-layer guardrail (regex rule engine sync + Layer B async)
- [ ] Discussion content NOT visible to any user while pending; visible to all after approval
- [ ] Reply notifications reach thread participants via WebSocket (after approval)
- [ ] Personal network dashboard shows aggregated data
- [ ] Streak-break notification reaches followers
- [ ] Cheer with 1-token gift creates double-entry transaction
- [ ] Milestone celebration notification aggregates correctly
- [ ] Impact chain shows full problem→evidence traversal
- [ ] "My Ripple" shows aggregate downstream impact
- [ ] Notification bell shows unread count
- [ ] All cursor pagination works correctly
- [ ] Rate limits enforced (10 threads/day, 50 replies/day, 200 follows max)
