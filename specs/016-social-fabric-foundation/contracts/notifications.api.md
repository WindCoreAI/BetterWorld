# API Contract: Notifications

**Base Path**: `/api/v1/notifications`
**Auth**: `requireHuman()` for all endpoints

---

## GET /notifications

List my notifications (cursor-paginated, newest first).

**Query Parameters**:
- `cursor` (string, optional) — Pagination cursor
- `limit` (integer, 1-100, default 20) — Page size
- `unreadOnly` (boolean, optional, default false) — Filter to unread only
- `type` (string, optional) — Filter by notification type

**Response** (200):
```json
{
  "ok": true,
  "data": [
    {
      "id": "uuid",
      "type": "cheer",
      "message": "3 people are cheering for your streak!",
      "referenceId": "uuid",
      "referenceType": "streak",
      "actorHumanId": "uuid",
      "actorDisplayName": "Sarah Chen",
      "aggregationCount": 3,
      "isRead": false,
      "createdAt": "2026-02-16T12:00:00Z"
    },
    {
      "id": "uuid",
      "type": "reply",
      "message": "James Park replied to your thread: 'Best practices for water testing'",
      "referenceId": "uuid",
      "referenceType": "thread",
      "actorHumanId": "uuid",
      "actorDisplayName": "James Park",
      "aggregationCount": 1,
      "isRead": true,
      "readAt": "2026-02-16T11:00:00Z",
      "createdAt": "2026-02-16T10:00:00Z"
    }
  ],
  "meta": { "hasMore": true, "nextCursor": "timestamp::id", "count": 20 },
  "requestId": "uuid"
}
```

---

## GET /notifications/unread-count

Get the count of unread notifications (for badge display).

**Response** (200):
```json
{
  "ok": true,
  "data": {
    "unreadCount": 5
  },
  "requestId": "uuid"
}
```

**Caching**: Redis key `notifications:unread:{humanId}`, 60-second TTL. Invalidated on new notification creation.

---

## PATCH /notifications/:id/read

Mark a single notification as read.

**Path Parameters**:
- `id` (UUID, required) — The notification ID

**Response** (200):
```json
{
  "ok": true,
  "data": { "marked": true },
  "requestId": "uuid"
}
```

**Errors**:
- 403 `NOT_RECIPIENT` — Not your notification
- 404 `NOT_FOUND` — Notification not found

---

## POST /notifications/read-all

Mark all unread notifications as read.

**Response** (200):
```json
{
  "ok": true,
  "data": { "markedCount": 5 },
  "requestId": "uuid"
}
```
