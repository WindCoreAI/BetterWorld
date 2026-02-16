# API Contract: Connections

**Base Path**: `/api/v1/connections`
**Auth**: `requireHuman()` for all endpoints

---

## POST /connections/:humanId

Send a connection request.

**Path Parameters**:
- `humanId` (UUID, required) — The human to connect with

**Response** (201):
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "recipientHumanId": "uuid",
    "status": "pending",
    "createdAt": "2026-02-16T00:00:00Z"
  },
  "requestId": "uuid"
}
```

**Special Case**: If the recipient already has a pending request TO the requester, auto-accept both → return status "accepted".

**Errors**:
- 400 `SELF_CONNECTION` — Cannot connect with yourself
- 409 `ALREADY_CONNECTED` — Connection already exists (pending or accepted)
- 429 `COOLDOWN_ACTIVE` — Previously declined, must wait 30 days

---

## POST /connections/:id/accept

Accept a pending connection request.

**Path Parameters**:
- `id` (UUID, required) — The connection request ID

**Response** (200):
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "status": "accepted",
    "sharedDomains": ["clean_water", "food_security"],
    "interactionCount": 3,
    "acceptedAt": "2026-02-16T00:00:00Z"
  },
  "requestId": "uuid"
}
```

**Errors**:
- 403 `NOT_RECIPIENT` — Only the recipient can accept
- 404 `NOT_FOUND` — Connection request not found
- 409 `NOT_PENDING` — Request is not in pending state

---

## POST /connections/:id/decline

Decline a pending connection request.

**Path Parameters**:
- `id` (UUID, required) — The connection request ID

**Response** (200):
```json
{
  "ok": true,
  "data": { "declined": true },
  "requestId": "uuid"
}
```

**Errors**:
- 403 `NOT_RECIPIENT` — Only the recipient can decline
- 404 `NOT_FOUND` — Connection request not found

---

## DELETE /connections/:id

Remove an accepted connection.

**Path Parameters**:
- `id` (UUID, required) — The connection ID

**Response** (200):
```json
{
  "ok": true,
  "data": { "removed": true },
  "requestId": "uuid"
}
```

**Errors**:
- 403 `NOT_PARTICIPANT` — Only a participant in the connection can remove it
- 404 `NOT_FOUND` — Connection not found

---

## GET /connections

List my accepted connections (cursor-paginated).

**Query Parameters**:
- `cursor` (string, optional) — Pagination cursor
- `limit` (integer, 1-100, default 20) — Page size
- `domain` (string, optional) — Filter by shared domain

**Response** (200):
```json
{
  "ok": true,
  "data": [
    {
      "connectionId": "uuid",
      "humanId": "uuid",
      "displayName": "string",
      "avatarUrl": "string | null",
      "tier": "advocate",
      "city": "Portland",
      "sharedDomains": ["clean_water"],
      "interactionCount": 7,
      "connectedSince": "2026-02-16T00:00:00Z"
    }
  ],
  "meta": { "hasMore": false, "nextCursor": null, "count": 12 },
  "requestId": "uuid"
}
```

---

## GET /connections/pending

List my pending connection requests (received).

**Query Parameters**:
- `cursor` (string, optional) — Pagination cursor
- `limit` (integer, 1-100, default 20) — Page size

**Response** (200):
```json
{
  "ok": true,
  "data": [
    {
      "connectionId": "uuid",
      "requesterHumanId": "uuid",
      "requesterDisplayName": "string",
      "requesterAvatarUrl": "string | null",
      "requesterTier": "contributor",
      "sharedDomains": ["education_access"],
      "requestedAt": "2026-02-16T00:00:00Z"
    }
  ],
  "meta": { "hasMore": false, "nextCursor": null, "count": 2 },
  "requestId": "uuid"
}
```

---

## GET /connections/suggestions

Get algorithmically suggested connections (max 5).

**Response** (200):
```json
{
  "ok": true,
  "data": [
    {
      "humanId": "uuid",
      "displayName": "string",
      "avatarUrl": "string | null",
      "tier": "contributor",
      "city": "Portland",
      "sharedDomains": ["clean_water", "food_security"],
      "mutualInteractions": 4,
      "suggestionScore": 19,
      "reason": "You share 2 domains and have reviewed each other's work"
    }
  ],
  "requestId": "uuid"
}
```

---

## GET /connections/status/:humanId

Check connection status with a specific human.

**Path Parameters**:
- `humanId` (UUID, required)

**Response** (200):
```json
{
  "ok": true,
  "data": {
    "status": "accepted",
    "connectionId": "uuid",
    "connectedSince": "2026-02-16T00:00:00Z"
  },
  "requestId": "uuid"
}
```

If no connection exists: `{ "status": "none", "connectionId": null }`
If pending: `{ "status": "pending", "connectionId": "uuid", "direction": "sent" | "received" }`
