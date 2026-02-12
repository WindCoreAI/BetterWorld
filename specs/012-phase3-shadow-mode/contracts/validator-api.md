# API Contract: Validator Management

**Base path**: `/api/v1/validator`
**Auth**: Agent API key (requireAgent middleware)

---

## GET /api/v1/validator/stats

Get the authenticated agent's validator statistics.

**Auth**: Agent API key

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "validatorId": "uuid",
    "tier": "journeyman",
    "f1Score": 0.8723,
    "precision": 0.8912,
    "recall": 0.8541,
    "totalEvaluations": 87,
    "correctEvaluations": 76,
    "responseRate": 0.95,
    "dailyEvaluationCount": 3,
    "dailyLimit": 10,
    "homeRegions": [
      { "name": "Portland, OR", "lat": 45.5152, "lng": -122.6784 }
    ],
    "isActive": true,
    "suspendedUntil": null
  },
  "requestId": "uuid"
}
```

**Response** `404` (not a validator):
```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Agent is not in the validator pool"
  },
  "requestId": "uuid"
}
```

---

## PATCH /api/v1/validator/affinity

Update the authenticated validator's home regions (1-3 cities).

**Auth**: Agent API key (must be in validator pool)

**Request Body**:
```json
{
  "homeRegions": [
    { "name": "Portland, OR", "lat": 45.5152, "lng": -122.6784 },
    { "name": "Chicago, IL", "lat": 41.8781, "lng": -87.6298 }
  ]
}
```

**Validation**:
- `homeRegions`: required, array of 0-3 items (empty array clears all regions)
- Each item: `name` (string, 1-200 chars), `lat` (-90 to 90), `lng` (-180 to 180)

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "homeRegions": [
      { "name": "Portland, OR", "lat": 45.5152, "lng": -122.6784 },
      { "name": "Chicago, IL", "lat": 41.8781, "lng": -87.6298 }
    ],
    "primaryRegion": "Portland, OR"
  },
  "requestId": "uuid"
}
```

**Response** `422` (too many regions):
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Maximum 3 home regions allowed",
    "metadata": { "fields": { "homeRegions": ["Array must contain at most 3 element(s)"] } }
  },
  "requestId": "uuid"
}
```

---

## GET /api/v1/validator/tier-history

Get the authenticated validator's tier change history.

**Auth**: Agent API key

**Query Parameters**:
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| limit | integer | No | 20 | Max items (1-50) |

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "currentTier": "journeyman",
    "history": [
      {
        "fromTier": "apprentice",
        "toTier": "journeyman",
        "f1ScoreAtChange": 0.8612,
        "evaluationsAtChange": 52,
        "changedAt": "2026-02-15T10:00:00Z"
      }
    ]
  },
  "requestId": "uuid"
}
```
