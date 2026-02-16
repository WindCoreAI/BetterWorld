# API Contract: Discussions

**Base Path**: `/api/v1/discussions`
**Auth**: `requireHuman()` for write, `optionalAuth()` for read

---

## POST /discussions/threads

Create a new discussion thread.

**Request Body**:
```json
{
  "scopeType": "domain",
  "scopeValue": "clean_water",
  "title": "Best practices for community water testing",
  "content": "I've been working on water quality missions and wanted to share..."
}
```

**Zod Schema**:
- `scopeType`: enum("domain", "city")
- `scopeValue`: string (validated against known domains/cities)
- `title`: string, min 5, max 200
- `content`: string, min 10, max 2000

**Processing** (Full 3-Layer Guardrail Pipeline):
1. Regex-based rule engine runs synchronously — if forbidden patterns detected, content is rejected immediately (403) and never stored
2. If rule engine passes, content is stored with `guardrailStatus: 'pending'`
3. Layer B async evaluation queued via existing BullMQ guardrail queue (content type: `discussion_thread`)
4. Content is NOT visible to any user while pending (per constitution). Author receives the content in the 201 response as a submission receipt.
5. On Layer B completion: status updated to 'approved' (publicly visible, author notified), 'rejected' (author notified with reason), or 'flagged' (Layer C admin review)

**Response** (201):
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "scopeType": "domain",
    "scopeValue": "clean_water",
    "title": "Best practices for community water testing",
    "content": "...",
    "authorHumanId": "uuid",
    "authorDisplayName": "string",
    "guardrailStatus": "pending",
    "replyCount": 0,
    "createdAt": "2026-02-16T00:00:00Z"
  },
  "requestId": "uuid"
}
```

**Errors**:
- 400 `VALIDATION_ERROR` — Invalid input
- 400 `INVALID_SCOPE` — scopeValue not in known domains or cities
- 403 `CONTENT_REJECTED` — Layer A guardrail rejected the content (returns which patterns matched, content not stored)
- 429 `THREAD_RATE_LIMIT` — Exceeded 10 threads per day

---

## GET /discussions/threads

List discussion threads by scope (cursor-paginated). Only returns threads with `guardrailStatus: 'approved'`. No exceptions — pending content is not visible per constitution.

**Auth**: Public endpoint (no auth required for reading approved content)

**Query Parameters**:
- `scopeType` (string, required) — "domain" or "city"
- `scopeValue` (string, required) — Domain or city name
- `cursor` (string, optional) — Pagination cursor
- `limit` (integer, 1-100, default 20) — Page size
- `sort` (string, optional, default "activity") — "activity" (lastActivityAt) or "recent" (createdAt)

**Response** (200):
```json
{
  "ok": true,
  "data": [
    {
      "id": "uuid",
      "title": "Best practices for community water testing",
      "authorHumanId": "uuid",
      "authorDisplayName": "string",
      "authorAvatarUrl": "string | null",
      "authorTier": "contributor",
      "replyCount": 12,
      "lastActivityAt": "2026-02-16T12:00:00Z",
      "createdAt": "2026-02-15T00:00:00Z"
    }
  ],
  "meta": { "hasMore": true, "nextCursor": "timestamp::id", "count": 20 },
  "requestId": "uuid"
}
```

---

## GET /discussions/threads/:threadId

Get a single thread with its content.

**Path Parameters**:
- `threadId` (UUID, required)

**Response** (200):
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "scopeType": "domain",
    "scopeValue": "clean_water",
    "title": "Best practices for community water testing",
    "content": "...",
    "authorHumanId": "uuid",
    "authorDisplayName": "string",
    "authorAvatarUrl": "string | null",
    "authorTier": "contributor",
    "replyCount": 12,
    "lastActivityAt": "2026-02-16T12:00:00Z",
    "createdAt": "2026-02-15T00:00:00Z"
  },
  "requestId": "uuid"
}
```

---

## POST /discussions/threads/:threadId/replies

Reply to a discussion thread.

**Path Parameters**:
- `threadId` (UUID, required)

**Request Body**:
```json
{
  "content": "Great point! I've found that using XYZ testing kits..."
}
```

**Zod Schema**:
- `content`: string, min 2, max 1000

**Processing** (Full 3-Layer Guardrail Pipeline):
1. Regex-based rule engine runs synchronously — rejected if forbidden patterns detected (403, not stored)
2. If rule engine passes, reply stored with `guardrailStatus: 'pending'`
3. Layer B async evaluation queued (content type: `discussion_reply`)
4. Reply NOT visible to any user while pending (per constitution). Author receives the content in the 201 response as a submission receipt. Reply count on parent thread incremented only upon approval.
5. Notifications sent to thread author and previous repliers only upon approval.

**Response** (201):
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "threadId": "uuid",
    "content": "...",
    "authorHumanId": "uuid",
    "authorDisplayName": "string",
    "guardrailStatus": "pending",
    "createdAt": "2026-02-16T00:00:00Z"
  },
  "requestId": "uuid"
}
```

**Errors**:
- 400 `VALIDATION_ERROR` — Invalid input
- 403 `CONTENT_REJECTED` — Layer A guardrail rejected the content (not stored)
- 404 `NOT_FOUND` — Thread not found
- 429 `REPLY_RATE_LIMIT` — Exceeded 50 replies per day

---

## GET /discussions/threads/:threadId/replies

List replies for a thread (cursor-paginated, chronological). Only returns replies with `guardrailStatus: 'approved'`. No exceptions — pending content is not visible per constitution.

**Auth**: Public endpoint (no auth required for reading approved content)

**Path Parameters**:
- `threadId` (UUID, required)

**Query Parameters**:
- `cursor` (string, optional) — Pagination cursor
- `limit` (integer, 1-100, default 50) — Page size

**Response** (200):
```json
{
  "ok": true,
  "data": [
    {
      "id": "uuid",
      "content": "...",
      "authorHumanId": "uuid",
      "authorDisplayName": "string",
      "authorAvatarUrl": "string | null",
      "authorTier": "advocate",
      "createdAt": "2026-02-16T00:00:00Z"
    }
  ],
  "meta": { "hasMore": false, "nextCursor": null, "count": 12 },
  "requestId": "uuid"
}
```
