# Data Model: Social Fabric Foundation

**Date**: 2026-02-16
**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

## New Enums

### connectionStatusEnum
```
Values: pending, accepted, declined
```
Tracks the lifecycle of a mutual connection request.

### notificationTypeEnum
```
Values: streak_warning, milestone, cheer, celebration, comeback, reply, connection_request, connection_accepted, follow
```
Discriminates notification delivery and rendering.

### discussionScopeTypeEnum
```
Values: domain, city
```
Scopes a discussion thread to a UN SDG domain or an operational city.

### careMomentTypeEnum
```
Values: cheer, celebrate
```
Discriminates the two care moment actions.

---

## New Tables

### follows

One-way follow relationship between human participants.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default random | Unique identifier |
| followerHumanId | UUID | FK → humans.id, NOT NULL, CASCADE | The human doing the following |
| followingHumanId | UUID | FK → humans.id, NOT NULL, CASCADE | The human being followed |
| createdAt | TIMESTAMPTZ | NOT NULL, default now | When the follow was created |

**Indexes**:
- `idx_follows_follower` on (followerHumanId) — query "who do I follow?"
- `idx_follows_following` on (followingHumanId) — query "who follows me?"
- `idx_follows_unique` UNIQUE on (followerHumanId, followingHumanId) — prevent duplicates

**CHECK constraints**:
- `no_self_follow`: followerHumanId != followingHumanId

**Relations**:
- `follower` → humans (many-to-one, relationName: "followsGiven")
- `following` → humans (many-to-one, relationName: "followsReceived")

---

### connections

Mutual connection relationship between human participants.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default random | Unique identifier |
| requesterHumanId | UUID | FK → humans.id, NOT NULL, CASCADE | Who sent the request |
| recipientHumanId | UUID | FK → humans.id, NOT NULL, CASCADE | Who received the request |
| status | connectionStatusEnum | NOT NULL, default 'pending' | Request lifecycle state |
| sharedDomains | TEXT[] | default empty array | Auto-computed overlapping domains |
| interactionCount | INTEGER | NOT NULL, default 0 | Auto-computed interaction count |
| firstInteractionAt | TIMESTAMPTZ | nullable | When first known interaction occurred |
| declinedAt | TIMESTAMPTZ | nullable | When request was declined (for cooldown) |
| acceptedAt | TIMESTAMPTZ | nullable | When request was accepted |
| createdAt | TIMESTAMPTZ | NOT NULL, default now | When request was created |
| updatedAt | TIMESTAMPTZ | NOT NULL, default now | Last modification timestamp |

**Indexes**:
- `idx_connections_requester_status` on (requesterHumanId) WHERE status = 'accepted' — my accepted connections
- `idx_connections_recipient_status` on (recipientHumanId) WHERE status = 'accepted' — connections where I'm recipient
- `idx_connections_recipient_pending` on (recipientHumanId) WHERE status = 'pending' — my pending requests
- `idx_connections_unique` UNIQUE on (requesterHumanId, recipientHumanId) — prevent duplicate requests

**CHECK constraints**:
- `no_self_connection`: requesterHumanId != recipientHumanId

**Relations**:
- `requester` → humans (many-to-one, relationName: "connectionsSent")
- `recipient` → humans (many-to-one, relationName: "connectionsReceived")

---

### discussion_threads

A conversation topic scoped to a domain or city.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default random | Unique identifier |
| scopeType | discussionScopeTypeEnum | NOT NULL | 'domain' or 'city' |
| scopeValue | VARCHAR(100) | NOT NULL | Domain name or city name |
| authorHumanId | UUID | FK → humans.id, NOT NULL, RESTRICT | Thread author |
| title | VARCHAR(200) | NOT NULL | Thread title |
| content | TEXT | NOT NULL | Thread body (max 2000 chars enforced by Zod) |
| guardrailStatus | guardrailStatusEnum | NOT NULL, default 'pending' | Guardrail evaluation status (reuses existing enum) |
| guardrailEvaluationId | UUID | FK → guardrail_evaluations.id, nullable | Link to guardrail evaluation record |
| replyCount | INTEGER | NOT NULL, default 0 | Denormalized reply count |
| lastActivityAt | TIMESTAMPTZ | NOT NULL, default now | Last reply or creation time |
| createdAt | TIMESTAMPTZ | NOT NULL, default now | Creation timestamp |
| updatedAt | TIMESTAMPTZ | NOT NULL, default now | Last modification timestamp |

**Indexes**:
- `idx_threads_scope_activity` on (scopeType, scopeValue, lastActivityAt DESC) — list threads by scope sorted by activity
- `idx_threads_author` on (authorHumanId) — user's threads
- `idx_threads_created` on (createdAt) — global thread ordering

**Relations**:
- `author` → humans (many-to-one, relationName: "discussionThreads")
- `replies` → discussionReplies (one-to-many)

---

### discussion_replies

A response within a discussion thread.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default random | Unique identifier |
| threadId | UUID | FK → discussion_threads.id, NOT NULL, CASCADE | Parent thread |
| authorHumanId | UUID | FK → humans.id, NOT NULL, RESTRICT | Reply author |
| content | TEXT | NOT NULL | Reply body (max 1000 chars enforced by Zod) |
| guardrailStatus | guardrailStatusEnum | NOT NULL, default 'pending' | Guardrail evaluation status (reuses existing enum) |
| guardrailEvaluationId | UUID | FK → guardrail_evaluations.id, nullable | Link to guardrail evaluation record |
| createdAt | TIMESTAMPTZ | NOT NULL, default now | Creation timestamp |

**Indexes**:
- `idx_replies_thread_created` on (threadId, createdAt) WHERE guardrailStatus = 'approved' — list approved replies in a thread chronologically
- `idx_replies_author` on (authorHumanId) — user's replies

**Relations**:
- `thread` → discussionThreads (many-to-one)
- `author` → humans (many-to-one, relationName: "discussionReplies")

---

### notifications

In-app notification store for all notification types.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default random | Unique identifier |
| recipientHumanId | UUID | FK → humans.id, NOT NULL, CASCADE | Who receives this notification |
| type | notificationTypeEnum | NOT NULL | Notification category |
| referenceId | UUID | nullable | Polymorphic reference to source entity |
| referenceType | VARCHAR(50) | nullable | Entity type: 'thread', 'connection', 'streak', 'milestone', etc. |
| actorHumanId | UUID | FK → humans.id, nullable, SET NULL | Who triggered this notification (null for system notifications) |
| message | TEXT | NOT NULL | Human-readable notification text |
| aggregationKey | VARCHAR(100) | nullable | Key for grouping similar notifications (e.g., 'streak:{humanId}:{date}') |
| aggregationCount | INTEGER | NOT NULL, default 1 | How many events this notification represents |
| isRead | BOOLEAN | NOT NULL, default false | Read/unread status |
| readAt | TIMESTAMPTZ | nullable | When marked as read |
| createdAt | TIMESTAMPTZ | NOT NULL, default now | Creation timestamp |

**Indexes**:
- `idx_notifications_recipient_unread` on (recipientHumanId, isRead) WHERE isRead = false — unread count badge
- `idx_notifications_recipient_created` on (recipientHumanId, createdAt DESC) — notification list
- `idx_notifications_aggregation` on (aggregationKey) WHERE aggregationKey IS NOT NULL — find notifications to aggregate

**Relations**:
- `recipient` → humans (many-to-one, relationName: "notificationsReceived")
- `actor` → humans (many-to-one, relationName: "notificationsSent")

---

## Design Notes

### Care Moments Storage

Care moments (cheers and celebrations) are stored as **notifications**, not as a separate table. The `careMomentTypeEnum` is used as metadata within the notification record (stored in `referenceType` or via the `type` enum values `cheer` and `celebration`). The notification ID serves as the `cheerId` or `celebrationId` in API responses. This avoids a redundant table since care moments are fundamentally notifications with an optional token gift side-effect.

---

## Schema Modifications to Existing Tables

### transactionTypeEnum (enums.ts)

Add two new values:
- `spend_cheer` — 1-token gift with a streak cheer
- `spend_celebrate` — 1-token gift with a milestone celebration

### contentTypeEnum (enums.ts)

Add two new values for guardrail pipeline routing:
- `discussion_thread` — routes guardrail completion callbacks to discussion.service.ts
- `discussion_reply` — routes guardrail completion callbacks to discussion.service.ts

---

## State Transitions

### Connection Lifecycle

```
                    ┌─── declined ──→ (30-day cooldown) ──→ can re-request
                    │
pending ────────────┤
                    │
                    └─── accepted ──→ active connection
                                      │
                                      └─── (either party can remove) ──→ deleted
```

### Notification Lifecycle

```
created (isRead=false) ──→ read (isRead=true, readAt set)
    │
    └─── aggregation: if aggregationKey matches existing unread notification,
         increment aggregationCount instead of creating new row
```

### Discussion Thread Lifecycle

```
Regex rule engine check ──→ FAIL ──→ rejected (not stored, 403 CONTENT_REJECTED returned to user)
                          │
                          └─→ PASS ──→ stored with guardrailStatus='pending'
                                        │
                                        ├─→ NOT visible to any user while pending (per constitution)
                                        ├─→ author receives submission confirmation (POST response)
                                        │
                                        └─→ Layer B async evaluation (via existing guardrail BullMQ queue)
                                             │
                                             ├─→ score >= 0.70 (verified tier) ──→ guardrailStatus='approved'
                                             │   ──→ publicly visible, author notified
                                             ├─→ score 0.40-0.70 ──→ guardrailStatus='flagged' ──→ Layer C admin review
                                             └─→ score < 0.40 ──→ guardrailStatus='rejected' ──→ author notified
```

---

## Computed Views (No New Tables)

### Network Aggregation (network.service.ts)

Aggregates across existing tables to build the personal network view:

**Data Sources**:
- `connections` (new) — accepted connections
- `peer_reviews` — who reviewed my evidence
- `endorsements` — who endorsed me / I endorsed
- `mission_claims` + `missions` — shared mission participation by domain/city

**Output**: `{ connections: [...], interactionPartners: [...], domains: string[], cities: string[] }`

**Caching**: Redis key `network:me:{humanId}`, 5-minute TTL

### Impact Chain (impact-chain.service.ts)

Traverses existing tables to build the ripple effect view:

**Traversal Path**:
```
problems (by domain/city/agent)
  └→ solutions (FK: problemId)
       └→ missions (FK: solutionId)
            └→ mission_claims (FK: missionId, status: completed)
                 └→ evidence (FK: missionId)
                      └→ attestations (FK: observationId — via evidence link)
```

**Output per chain**: `{ problem, solutions[], missions[], evidence[], attestations, totalParticipants, totalCities }`

**My Ripple Output**: `{ contributionsCount, downstreamMissions, peopleInvolved, citiesReached, topChain }`

### Connection Suggestions (connection.service.ts)

Computes suggestions on-demand from existing data:

**Algorithm**:
1. Query `humanProfiles.skills` overlap with requester's skills → shared domains score (×3)
2. Query `humanProfiles.city` match → same city score (×2)
3. Query `peer_reviews` + `endorsements` for mutual interactions → review history score (×5)
4. Sum scores, exclude existing connections and recently declined
5. Return top 5 by score

**Caching**: Redis key `suggestions:{humanId}`, 5-minute TTL

---

## Migration Plan

**Migration file**: `0015_social_fabric.sql`

**Order**:
1. Create new enums (connectionStatusEnum, notificationTypeEnum, discussionScopeTypeEnum, careMomentTypeEnum)
2. Add new values to existing transactionTypeEnum (spend_cheer, spend_celebrate)
3. Create `follows` table with indexes and CHECK constraint
4. Create `connections` table with indexes and CHECK constraint
5. Create `discussion_threads` table with indexes
6. Create `discussion_replies` table with indexes
7. Create `notifications` table with indexes

**Rollback**: Standard DROP TABLE IF EXISTS in reverse order, then DROP TYPE IF EXISTS for new enums. No data migration needed (all new tables start empty).
