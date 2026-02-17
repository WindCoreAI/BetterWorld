# API Contract: Community Moderators

**Base Path**: `/api/v1/moderator`
**Auth**: `humanAuth()` required; moderator role checked server-side

## Endpoints

### GET /moderator/queue

Get flagged content queue for the moderator (domain-scoped).

**Auth**: Must be active moderator (`isModerator = true`).

**Query**: `?cursor=string&limit=20`

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "contentId": "uuid",
        "contentType": "discussion_thread|discussion_reply|circle_post|help_offer_message|gratitude_narrative|human_solution",
        "content": "string",
        "authorHumanId": "uuid",
        "authorDisplayName": "string",
        "domain": "string",
        "layerBScore": 0.55,
        "layerBDecision": "flagged",
        "flaggedAt": "ISO8601"
      }
    ],
    "nextCursor": "string|null"
  }
}
```

**Filtering**: Only shows content in moderator's specialist domains. Excludes content authored by moderator's connections (2-hop rule).

**Errors**: `403` if not a moderator.

### POST /moderator/queue/:itemId/decide

Moderator decides on flagged content.

**Body**:
```json
{
  "decision": "approved|rejected|escalated",
  "reason": "string (optional)"
}
```

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "decision": "approved",
    "moderatorHumanId": "uuid"
  }
}
```

**Side Effects**:
- Creates `moderator_actions` audit record
- Updates content `guardrailStatus`
- If `escalated`, moves to admin queue
- Notifies content author of decision

**Errors**: `403` if not moderator or content outside moderator's domains.

### GET /moderator/stats

Get moderator's own activity stats.

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "totalReviewed": 42,
    "approved": 35,
    "rejected": 5,
    "escalated": 2,
    "accuracy": 0.93,
    "activeSince": "ISO8601",
    "domains": ["clean_water_sanitation", "environmental_protection"]
  }
}
```

### GET /admin/moderator/eligible

Admin: Get list of moderator-eligible candidates.

**Auth**: Admin only.

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "candidates": [
      {
        "humanId": "uuid",
        "displayName": "string",
        "tier": "champion",
        "reviewAccuracy": 0.95,
        "daysActive": 120,
        "suspensionCount": 0,
        "endorsementCount": 5,
        "specialistDomains": ["clean_water_sanitation"],
        "flaggedAt": "ISO8601"
      }
    ]
  }
}
```

### POST /admin/moderator/:humanId/approve

Admin: Approve a moderator candidate.

**Body**:
```json
{
  "domains": ["clean_water_sanitation", "environmental_protection"]
}
```

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "humanId": "uuid",
    "isModerator": true,
    "moderatorSince": "ISO8601",
    "moderatorDomains": ["clean_water_sanitation", "environmental_protection"]
  }
}
```

### POST /admin/moderator/:humanId/revoke

Admin: Revoke moderator status.

**Body**:
```json
{
  "reason": "string"
}
```

**Response** `200`:
```json
{
  "ok": true,
  "data": { "humanId": "uuid", "isModerator": false }
}
```
