# Research: Social Fabric Foundation

**Date**: 2026-02-16
**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

## Phase 0 Research Summary

No NEEDS CLARIFICATION markers existed in the spec. Research focused on confirming existing codebase patterns and making architectural decisions for the six new subsystems.

---

## Decision 1: Discussion Content Moderation Strategy

**Decision**: Route discussion threads and replies through the full 3-layer guardrail pipeline (regex-based rule engine synchronous + Layer B async + Layer C admin review), consistent with Constitution Principle I. Content is not visible to any user while pending. Authors receive a submission confirmation and a notification when evaluation completes. Content becomes publicly visible upon approval.

**Rationale**:
- Constitution Principle I (NON-NEGOTIABLE) states: "All platform activity MUST pass through the 3-layer constitutional guardrail system. There is no bypass path." and "Content MUST NOT be visible to end users while pending."
- The regex-based rule engine (the implementation of "Layer A" for all content types — problems, solutions, debates, and now discussions) runs synchronously (<10ms) and instantly rejects forbidden patterns before storage
- Layer B evaluation is queued via the existing BullMQ guardrail queue, reusing the established infrastructure
- The existing trust tier system minimizes perceived latency: verified users' content is auto-approved at score >= 0.70 (typical for normal discussion content), meaning the pending window is brief (~2-5 seconds)
- Authors receive their submitted content in the POST response (as a receipt) and a notification when evaluation completes
- Rate limits (10 threads/day, 50 replies/day) constrain abuse volume and evaluation queue pressure

**Alternatives Considered**:
- Regex rule engine only (no Layer B/C): Rejected — violates Constitution Principle I which states the rule engine is "NOT trusted for safety decisions" and "there is no bypass path"
- No moderation: Rejected — violates Constitution Principle I
- Optimistic display to author while pending: Rejected — violates Constitution Principle I ("Content MUST NOT be visible to end users while pending"). The author is an end user. Brief pending windows (~2-5s for verified users) make strict compliance acceptable UX.

---

## Decision 2: Notification Architecture

**Decision**: Store notifications in a PostgreSQL `notifications` table with WebSocket push for real-time delivery. No separate notification service or message queue for delivery.

**Rationale**:
- The existing WebSocket infrastructure (`apps/api/src/ws/feed.ts`) already supports `sendToAgent()` targeted delivery — extending to `sendToHuman()` is straightforward
- PostgreSQL provides durability (notifications persist if user is offline) + query capability (mark read, list, filter)
- Redis is used only for caching notification counts (unread badge number), not as primary storage
- BullMQ is used for async detection (streak-break, milestones, comeback) but notification creation itself is synchronous within the detection job

**Alternatives Considered**:
- Redis Streams for notification queue: Rejected — notifications need persistence for offline users, Redis is cache-only in this architecture
- Separate notification microservice: Rejected — over-engineering for current scale (~5K users), single-process Hono handles it fine
- Email/push notifications: Deferred to future spec — in-app only at launch per spec assumptions

---

## Decision 3: Connection Suggestion Algorithm

**Decision**: Score-based algorithm using three signals from existing data: shared domains (×3), same city (×2), mutual review history (×5). Computed on-demand with Redis caching (5-minute TTL).

**Rationale**:
- All three signals already exist in the database: `humanProfiles.skills` (domains), `humanProfiles.city`, `peerReviews` + `endorsements` (review history)
- Mutual review history gets highest weight (×5) because it represents actual positive interaction — the strongest friendship signal per Christakis
- On-demand computation (at dashboard load) avoids a background worker for a feature that's queried infrequently (once per dashboard visit)
- Redis cache (5-minute TTL) prevents repeated expensive joins on rapid page refreshes

**Alternatives Considered**:
- Pre-computed suggestions via nightly worker: Rejected — premature optimization, on-demand is fast enough for <5K users
- ML-based collaborative filtering: Rejected — insufficient interaction data at this stage, algorithmic scoring is interpretable and debuggable
- pgvector similarity search on profile embeddings: Rejected — embedding infrastructure exists but profile vectors aren't generated yet; overkill for initial suggestion feature

---

## Decision 4: Impact Chain Traversal Strategy

**Decision**: Use recursive joins (not recursive CTE) for impact chain traversal: problem → solutions (FK) → missions (FK) → evidence (FK) → attestations (FK). Depth is bounded by schema design (max 5 levels).

**Rationale**:
- The chain is a DAG with fixed depth, not an arbitrary graph — each level is a different table with direct FK relationships
- A series of LEFT JOINs with aggregation is simpler, more predictable, and easier to index than a recursive CTE
- The existing codebase already uses recursive CTEs for debate depth (Sprint 15) but that's a self-referential tree; the impact chain is cross-table
- Performance is bounded: each problem has at most ~10 solutions, each solution ~8 missions, each mission ~3 evidence items — total rows per chain is small

**Alternatives Considered**:
- Recursive CTE on a materialized graph table: Rejected — adds schema complexity for a traversal that's naturally bounded
- Pre-computed impact summary table (materialized view): Considered for "my ripple" aggregate endpoint — may add later if performance requires it, but start with live query
- Graph database (e.g., Neo4j) for relationship traversal: Rejected — existing PostgreSQL handles this well, not worth adding a new dependency

---

## Decision 5: Care Moment Detection Architecture

**Decision**: Single BullMQ worker (`care-moment-worker`) with three repeatable job types: streak-break detection (hourly), milestone detection (event-driven via hooks in existing flows), comeback detection (daily).

**Rationale**:
- Streak-break detection: Must scan all users with active streaks to find those with `lastActiveDate` < 20 hours ago. Batch processing with the existing streak decay worker pattern (offset/limit batches of 100)
- Milestone detection: Triggered inline when mission completes, tier changes, or streak record is set — not a scheduled job but a service call from existing event handlers
- Comeback detection: Event-driven, triggered on login/activity when `lastActiveAt` was 7+ days ago. This ensures followers are notified within seconds of the participant's return, meeting the SC-009 30-second SLA
- All three create notifications via `notification.service.ts` which handles WebSocket push

**Alternatives Considered**:
- Event-driven architecture (emit events, workers consume): Rejected — adds infrastructure complexity (event bus) for three detection patterns that work fine as scheduled jobs + inline hooks
- Modify existing streak decay worker to add follow notification: Rejected — violates single-responsibility; streak decay handles reputation math, care moments handle social notifications
- Real-time streak monitoring via Redis TTL keys: Rejected — creative but fragile; database scan is more reliable and matches existing worker patterns

---

## Decision 6: Follow/Connection Separation

**Decision**: Follows and connections are completely independent systems with separate tables. A follow does not imply a connection request, and a connection does not auto-create follows.

**Rationale**:
- Follows are lightweight, one-way, low-commitment (like Twitter follows) — used for passive observation and notification routing
- Connections are heavyweight, mutual, high-commitment (like LinkedIn connections) — used for network dashboard, shared history, and future features (mentorship, buddy missions in Spec 3)
- Keeping them independent allows users to follow someone without the social pressure of a connection request
- The spec explicitly treats them as "complementary but independent" (Blueprint roadmap §1.2)

**Alternatives Considered**:
- Unified relationship table with type column (follow/connection): Rejected — different lifecycle (follows are instant, connections need accept/decline), different indexes, different access patterns
- Auto-follow on connection acceptance: Considered but rejected — follows are for notification routing, connections may not want all notification types
- Mutual follows = auto-connection: Rejected — changes the meaning of follow from "I want to watch" to "I want to connect"

---

## Decision 7: Discussion Thread Content Visibility

**Decision**: Discussion threads and replies pass through the full 3-layer guardrail pipeline. Content is stored with `guardrailStatus: 'pending'` and is not visible to any user (including the author) while pending. Content becomes publicly visible upon Layer B approval. Authors receive submission confirmation in the POST response and a notification when evaluation completes.

**Rationale**:
- Constitution Principle I mandates full 3-layer pipeline for all platform content, with no bypass path — discussions are no exception
- Constitution Principle I explicitly states "Content MUST NOT be visible to end users while pending" — the author is an end user, so no exception can be made
- For verified users (trust tier), Layer B typically scores discussion content >= 0.70 → auto-approved within 2-5 seconds, making the pending window brief and acceptable
- Authors receive their content back in the POST response (as a receipt of what they submitted) and a notification when evaluation completes (approved/rejected)
- The regex-based rule engine still runs synchronously and instantly rejects forbidden patterns before storage

**Alternatives Considered**:
- Regex rule engine only with immediate publish: Rejected — violates Constitution Principle I (rule engine is "advisory telemetry only, NOT trusted for safety decisions")
- Optimistic display to author while pending: Rejected — violates Constitution Principle I ("Content MUST NOT be visible to end users while pending"). The author is an end user.
- Synchronous Layer B blocking: Rejected — 2-5 second blocking wait is poor UX; async submission with notification on completion is better
- No moderation: Rejected — violates Constitution Principle I

---

## Decision 8: Token Gift Transaction Type

**Decision**: Add two new values to `transactionTypeEnum`: `spend_cheer` and `spend_celebrate`. Token gifts are 1 token fixed amount, non-refundable.

**Rationale**:
- Existing enum pattern: `spend_vote`, `spend_circle` — new `spend_cheer` and `spend_celebrate` follow the same naming convention
- Fixed 1-token amount simplifies implementation — no amount selection UI, no balance threshold edge cases
- Non-refundable matches the "care at cost" philosophy — the cost is what makes the care meaningful (Christakis' principle)
- Uses existing `tokenTransactions` table with double-entry accounting, idempotency key, and referenceId pointing to the notification

**Alternatives Considered**:
- Variable gift amounts (1-5 tokens): Rejected — complicates UI, creates wealth-display dynamics counter to egalitarian platform ethos
- Gift as a separate "gift_transactions" table: Rejected — unnecessary when `tokenTransactions` already supports all needed fields
- Free cheers (no token cost): Rejected for celebrations — contradicts "care at cost" principle; but cheers ARE free by default with an optional gift add-on

---

## Existing Pattern Confirmations

### Schema Patterns (Confirmed)
- UUID primary keys: `uuid("id").primaryKey().defaultRandom()`
- Timestamps: `timestamp("field", { withTimezone: true }).notNull().defaultNow()`
- FK references: `.references(() => humans.id, { onDelete: "cascade" })` for user-owned data
- CHECK constraints: `check("no_self_follow", sql\`...\`)`
- Unique constraints: `uniqueIndex("idx_follows_unique").on(table.followerHumanId, table.followingHumanId)`
- camelCase TS / snake_case DB column naming

### API Patterns (Confirmed)
- Response envelope: `{ ok: boolean, data, meta: { hasMore, nextCursor, count }, requestId }`
- Cursor format: `{timestamp}::{id}` composite cursor for stable ordering
- Auth: `requireHuman()` middleware for protected endpoints, `optionalAuth()` for mixed
- Validation: Zod schemas parsed with `.safeParse()`, AppError on failure
- Rate limits: Redis-backed counter per user per action

### Frontend Patterns (Confirmed)
- React Query hooks: `useQuery({ queryKey, queryFn, staleTime, enabled })`
- Mutations: `useMutation({ mutationFn, onSuccess })`
- API client: `humanFetch<T>(path, options)` with auto-refresh on 401
- Dashboard cards: `Card > CardBody > h3 + content` pattern
- Color tokens: `text-charcoal`, `bg-terracotta`, `text-cream`
- Auth guard: `useHumanAuth()` + `useEffect` redirect pattern
