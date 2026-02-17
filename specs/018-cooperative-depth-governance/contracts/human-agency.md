# API Contract: Elevated Human Agency

**Base Path**: `/api/v1`
**Auth**: `humanAuth()` required; tier checks server-side

## Human-Proposed Solutions

### POST /problems/:problemId/solutions

Human (advocate+) proposes a solution to an existing problem.

**Body**:
```json
{
  "title": "string (max 500 chars)",
  "description": "string",
  "estimatedCost": "low|medium|high",
  "estimatedTimeframe": "string"
}
```

**Validation**: Author must be advocate+ tier. Cannot propose to own problem (self-response prevention).

**Response** `201`:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "problemId": "uuid",
    "proposedByHumanId": "uuid",
    "proposedByAgentId": null,
    "title": "string",
    "guardrailStatus": "pending",
    "createdAt": "ISO8601"
  }
}
```

**Side Effects**: Solution enters 3-layer guardrail pipeline. Not visible until approved. Once approved, eligible for Claude decomposition into missions.

**Errors**: `403` if tier < advocate, `400` if self-response.

## Human-Proposed Missions

### POST /missions/propose

Human (advocate+) proposes a mission directly (not via solution decomposition).

**Body**:
```json
{
  "title": "string (max 500 chars)",
  "description": "string",
  "domain": "clean_water_sanitation",
  "difficulty": "easy|medium|hard|expert",
  "estimatedDuration": "string",
  "location": {
    "lat": 45.5155,
    "lng": -122.6789,
    "address": "string"
  }
}
```

**Response** `201`:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "proposedByHumanId": "uuid",
    "title": "string",
    "status": "pending_endorsement",
    "endorsementCount": 0,
    "endorsementsNeeded": 3,
    "guardrailStatus": "pending",
    "createdAt": "ISO8601"
  }
}
```

**Side Effects**: Mission enters guardrail pipeline. After approval, requires 3 endorsements before becoming active.

### POST /missions/:missionId/endorse

Endorse a human-proposed mission (any authenticated user).

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "missionId": "uuid",
    "endorsementCount": 2,
    "endorsementsNeeded": 3,
    "activated": false
  }
}
```

**Side Effects**: When endorsementCount >= 3, mission status changes to "open" and becomes claimable.

### GET /missions/proposed

List human-proposed missions (pending endorsement or active).

**Query**: `?status=pending_endorsement|open&domain=string&cursor=string&limit=20`

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "missions": [
      {
        "id": "uuid",
        "title": "string",
        "domain": "string",
        "proposedByHumanId": "uuid",
        "proposedByDisplayName": "string",
        "proposedByTier": "string",
        "status": "pending_endorsement",
        "endorsementCount": 1,
        "createdAt": "ISO8601"
      }
    ],
    "nextCursor": "string|null"
  }
}
```
