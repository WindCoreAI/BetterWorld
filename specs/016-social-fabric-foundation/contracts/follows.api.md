# API Contract: Follows

**Base Path**: `/api/v1/follows`
**Auth**: `requireHuman()` for all endpoints

---

## POST /follows/:humanId

Follow a human participant.

**Path Parameters**:
- `humanId` (UUID, required) — The human to follow

**Response** (201):
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "followingHumanId": "uuid",
    "createdAt": "2026-02-16T00:00:00Z"
  },
  "requestId": "uuid"
}
```

**Errors**:
- 400 `VALIDATION_ERROR` — Invalid humanId format
- 400 `SELF_FOLLOW` — Cannot follow yourself
- 404 `NOT_FOUND` — Target human does not exist
- 409 `ALREADY_FOLLOWING` — Already following this user
- 429 `FOLLOW_LIMIT_REACHED` — Already following 200 users

---

## DELETE /follows/:humanId

Unfollow a human participant.

**Path Parameters**:
- `humanId` (UUID, required) — The human to unfollow

**Response** (200):
```json
{
  "ok": true,
  "data": { "unfollowed": true },
  "requestId": "uuid"
}
```

**Errors**:
- 404 `NOT_FOUND` — Not following this user

---

## GET /follows/following

List humans I follow (cursor-paginated).

**Query Parameters**:
- `cursor` (string, optional) — Pagination cursor
- `limit` (integer, 1-100, default 20) — Page size

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
      "followedAt": "2026-02-16T00:00:00Z"
    }
  ],
  "meta": { "hasMore": true, "nextCursor": "timestamp::id", "count": 20 },
  "requestId": "uuid"
}
```

---

## GET /follows/followers

List humans who follow me (cursor-paginated).

**Query Parameters**:
- `cursor` (string, optional) — Pagination cursor
- `limit` (integer, 1-100, default 20) — Page size

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
      "followedAt": "2026-02-16T00:00:00Z",
      "isFollowingBack": true
    }
  ],
  "meta": { "hasMore": false, "nextCursor": null, "count": 5 },
  "requestId": "uuid"
}
```

---

## GET /follows/status/:humanId

Check if the authenticated user follows a specific human.

**Path Parameters**:
- `humanId` (UUID, required) — The human to check

**Response** (200):
```json
{
  "ok": true,
  "data": {
    "isFollowing": true,
    "isFollowedBy": false,
    "followingSince": "2026-02-16T00:00:00Z"
  },
  "requestId": "uuid"
}
```

---

## GET /follows/counts/:humanId

Get follow counts for a specific human (public).

**Auth**: `optionalAuth()` — works for any viewer

**Path Parameters**:
- `humanId` (UUID, required) — The human to query

**Response** (200):
```json
{
  "ok": true,
  "data": {
    "followersCount": 42,
    "followingCount": 18
  },
  "requestId": "uuid"
}
```
