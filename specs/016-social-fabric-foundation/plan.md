# Implementation Plan: Social Fabric Foundation

**Branch**: `016-social-fabric-foundation` | **Date**: 2026-02-16 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/016-social-fabric-foundation/spec.md`

## Summary

Build the relational infrastructure that transforms BetterWorld from a transactional platform into a community. Six deliverables: follow system (one-way, max 200), connection graph (mutual with suggestion algorithm), low-stakes discussion spaces (domain + city scoped, Layer A moderated), personal network dashboard (aggregated from existing interaction data), care moments (streak cheers, milestone celebrations, comeback welcomes with optional 1-token gifts), and contribution ripple effect visualization (problem→solution→mission→evidence chain traversal). All features integrate with existing patterns: Drizzle ORM schema, Hono API routes with standard envelope, cursor-based pagination, BullMQ workers, WebSocket notifications, and Next.js 15 frontend.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode, zero errors), Node.js 22+
**Primary Dependencies**: Hono (API), Drizzle ORM, BullMQ, ioredis, jose (JWT), Next.js 15, React Query, Zustand, Tailwind CSS 4
**Storage**: PostgreSQL 16 (Supabase) + Upstash Redis (cache, rate limits, feature flags)
**Testing**: Vitest (unit + integration), Playwright (E2E), coverage thresholds per constitution
**Target Platform**: Linux server (Fly.io API/workers) + Vercel (Next.js frontend)
**Project Type**: Monorepo web application (Turborepo + pnpm workspaces)
**Performance Goals**: API p95 < 500ms, page load < 2s, network dashboard < 3s, notification delivery < 30s
**Constraints**: Cursor-based pagination everywhere, full 3-layer guardrail pipeline (regex rule engine + Layer B + Layer C) on all user-generated content, double-entry accounting for token gifts, 2-hop peer review exclusion unchanged
**Scale/Scope**: ~5K users, 5 new DB tables, ~29 API endpoints, 5 pages + ~17 components + 6 hooks, 1 BullMQ worker

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Constitutional AI for Good | PASS | Discussion threads + replies pass through the full 3-layer guardrail pipeline: regex-based rule engine synchronous reject on forbidden patterns, Layer B async classification via existing BullMQ guardrail queue, Layer C admin review for flagged content (FR-011). Content stored as 'pending' during evaluation, not visible to any user while pending per constitution mandate. Authors receive submission confirmation and notification on completion. Cheers/celebrations use pre-set structured messages, not free-form text requiring guardrail. |
| II. Security First | PASS | All new endpoints use existing auth middleware (requireHuman/optionalAuth). Zod validation on all inputs. Rate limits on write endpoints (FR-012: 10 threads/day, 50 replies/day). Token gifts use SELECT FOR UPDATE. No new secrets introduced. |
| III. Test-Driven Quality Gates | PASS | New API tests for all endpoints. Frontend component tests for key flows. Coverage must not decrease. Integration tests against real PostgreSQL + Redis. |
| IV. Verified Impact | PASS | Token gifts (1-token cheers/celebrations) use existing double-entry accounting with balanceBefore/balanceAfter (FR-030). Idempotency keys prevent duplicate gifts. |
| V. Human Agency | PASS | All social features are opt-in: following, connecting, discussions, cheering are voluntary actions. No participant is penalized for not using social features. |
| VI. Framework Agnostic | PASS | Social features are human-only (not agent API extensions). No changes to agent REST/WebSocket contracts. Standard envelope `{ ok, data/error, requestId }` on all new endpoints. |
| VII. Structured over Free-form | PASS | Discussion threads use structured schema (title varchar(200) + content text with 2000 char limit). Replies structured (content text with 1000 char limit). All validated by Zod schemas at ingestion. Connection suggestions use algorithmic scoring, not free-form. |

**Gate Result**: ALL PASS — no violations. Proceed to Phase 0.

### Post-Design Re-evaluation (Phase 1 Complete)

| Principle | Status | Post-Design Notes |
|-----------|--------|-------------------|
| I. Constitutional AI for Good | PASS | Confirmed: `discussions.api.md` specifies full 3-layer guardrail pipeline — regex-based rule engine synchronous reject on forbidden patterns (403 CONTENT_REJECTED), Layer B async classification via existing guardrail BullMQ queue, Layer C admin review for flagged content. Discussion content stored as 'pending', not visible to any user while pending per constitution mandate. Authors receive submission confirmation and notification on evaluation completion. Content publicly visible upon approval. Trust tier auto-approve/reject thresholds apply. Cheers/celebrations are action-based (no user-generated text to moderate). |
| II. Security First | PASS | Confirmed: All 7 contract files require `requireHuman()` auth. Zod schemas specified for all write endpoints. Rate limits enforced via Redis counters. Token gifts use idempotency keys + SELECT FOR UPDATE per `data-model.md`. CHECK constraints prevent self-follow/self-connection. |
| III. Test-Driven Quality Gates | PASS | Confirmed: `quickstart.md` specifies test commands. Each phase includes test writing. Coverage must not decrease per constitution. |
| IV. Verified Impact | PASS | Confirmed: `care-moments.api.md` specifies `spend_cheer` and `spend_celebrate` transaction types using existing double-entry accounting pattern from `tokenTransactions` table. Idempotency keys prevent duplicate gifts on retry. |
| V. Human Agency | PASS | Confirmed: All social actions in contracts are user-initiated (POST requests). No auto-follow, no forced connections, no mandatory discussions. Follow limit (200) prevents spam but doesn't restrict normal use. |
| VI. Framework Agnostic | PASS | Confirmed: No changes to agent API surface. All new endpoints are under human auth only. Standard `{ ok, data/error, requestId }` envelope used in all 7 contract files. Cursor-based pagination on all list endpoints. |
| VII. Structured over Free-form | PASS | Confirmed: `data-model.md` defines structured schemas with varchar/text length constraints. Zod schemas enforce min/max lengths at API boundary. Discussion content is validated structured text, not arbitrary free-form input. |

**Post-Design Gate Result**: ALL PASS — design is constitution-compliant. Ready for `/speckit.tasks`.

## Project Structure

### Documentation (this feature)

```text
specs/016-social-fabric-foundation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── follows.api.md
│   ├── connections.api.md
│   ├── discussions.api.md
│   ├── notifications.api.md
│   ├── network.api.md
│   ├── care-moments.api.md
│   └── impact.api.md
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
packages/db/src/schema/
├── follows.ts                    # follows table + relations
├── connections.ts                # connections table + relations
├── discussionThreads.ts          # discussion_threads table + relations
├── discussionReplies.ts          # discussion_replies table + relations
├── notifications.ts              # notifications table + relations
└── enums.ts                      # New enums: connectionStatus, notificationType, discussionScopeType

packages/db/drizzle/
└── 0015_social_fabric.sql        # Migration: 5 tables, enums, indexes

apps/api/src/
├── routes/
│   ├── follows.routes.ts         # POST/DELETE /follows/:humanId, GET /follows/following, GET /follows/followers
│   ├── connections.routes.ts     # POST/POST accept/POST decline/GET /connections, GET /connections/suggestions
│   ├── discussions.routes.ts     # Thread + reply CRUD, GET by domain/city
│   ├── network.routes.ts         # GET /network/me, GET /network/me/interactions
│   ├── care-moments.routes.ts    # POST /care/cheer, POST /care/celebrate
│   ├── notifications.routes.ts   # GET /notifications, PATCH /notifications/:id/read, POST /notifications/read-all
│   └── impact.routes.ts          # GET /impact/chain/:problemId, GET /impact/my-ripple
├── services/
│   ├── follow.service.ts         # Follow/unfollow logic, count queries
│   ├── connection.service.ts     # Request/accept/decline, suggestion algorithm
│   ├── discussion.service.ts     # Thread/reply CRUD with Layer A guardrail
│   ├── network.service.ts        # Network aggregation from existing tables
│   ├── care-moment.service.ts    # Milestone detection, cheer/celebrate with token gift
│   ├── notification.service.ts   # Create, aggregate, mark read, WebSocket delivery
│   └── impact-chain.service.ts   # Recursive chain traversal, ripple aggregation
└── workers/
    └── care-moment-worker.ts     # BullMQ: streak-break detection, milestone detection, comeback detection

apps/web/
├── app/
│   ├── dashboard/
│   │   └── network/
│   │       └── page.tsx          # Personal network dashboard page
│   ├── discussions/
│   │   ├── [scopeType]/
│   │   │   └── [scopeValue]/
│   │   │       └── page.tsx      # Domain/city discussion board
│   │   └── thread/
│   │       └── [threadId]/
│   │           └── page.tsx      # Thread detail page
│   ├── impact/
│   │   └── [problemId]/
│   │       └── page.tsx          # Impact chain visualization page
│   └── notifications/
│       └── page.tsx              # Notification center page
└── src/
    ├── components/
    │   ├── social/
    │   │   ├── FollowButton.tsx
    │   │   ├── ConnectButton.tsx
    │   │   ├── ConnectionSuggestions.tsx
    │   │   ├── FollowersList.tsx
    │   │   └── ConnectionsList.tsx
    │   ├── discussions/
    │   │   ├── ThreadList.tsx
    │   │   ├── ThreadDetail.tsx
    │   │   ├── NewThreadForm.tsx
    │   │   └── ReplyForm.tsx
    │   ├── dashboard/
    │   │   ├── YourNetworkCard.tsx
    │   │   └── ImpactRippleCard.tsx
    │   ├── care/
    │   │   ├── CheerButton.tsx
    │   │   ├── CelebrateButton.tsx
    │   │   └── CareNotification.tsx
    │   ├── notifications/
    │   │   ├── NotificationBell.tsx
    │   │   ├── NotificationList.tsx
    │   │   └── NotificationItem.tsx
    │   └── impact/
    │       ├── ImpactChain.tsx
    │       └── RippleSummary.tsx
    ├── hooks/
    │   ├── useFollows.ts
    │   ├── useConnections.ts
    │   ├── useDiscussions.ts
    │   ├── useNotifications.ts
    │   ├── useNetwork.ts
    │   └── useImpact.ts
    └── lib/
        └── humanApi.ts           # Extend existing API client with social feature functions
```

**Structure Decision**: Follows existing monorepo structure — new schema files in `packages/db/src/schema/`, new route/service/worker files in `apps/api/src/`, new components/hooks/pages in `apps/web/`. No new packages or workspaces needed.

## Complexity Tracking

| Decision | Justification |
|----------|---------------|
| Discussion content uses full 3-layer guardrail with no pending visibility | Constitution Principle I mandates "Content MUST NOT be visible to end users while pending." Discussion content follows the same pattern as problems/solutions/debates: stored as 'pending', not visible to any user (including author) while pending. Authors receive a submission confirmation from the POST response and a notification when evaluation completes. For verified users, auto-approval at >= 0.70 means the pending window is brief (~2-5s), so content appears quickly. This maintains strict constitution compliance at the cost of a brief delay before the author can see their post on the board. |
