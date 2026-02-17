# API Contract: Mentorships

**Base Path**: `/api/v1/mentorships`
**Auth**: `humanAuth()` required for all endpoints

## Endpoints

### GET /mentorships/suggestions

Get mentor suggestions for the current user (mentee).

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "suggestions": [
      {
        "humanId": "uuid",
        "displayName": "string",
        "tier": "advocate|leader|champion",
        "primaryDomain": "string",
        "city": "string|null",
        "activeMenteeCount": 0,
        "sharedDomain": true,
        "sameCity": true,
        "score": 8
      }
    ]
  }
}
```

**Errors**: `403` if user already has active mentorship, `404` if no suggestions found.

### POST /mentorships

Create a mentorship request (mentee → mentor).

**Body**:
```json
{
  "mentorHumanId": "uuid"
}
```

**Response** `201`:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "mentorHumanId": "uuid",
    "menteeHumanId": "uuid",
    "domain": "string",
    "status": "pending",
    "menteeAccepted": true,
    "mentorAccepted": false,
    "expiresAt": "ISO8601"
  }
}
```

**Errors**: `400` if mentee already has active mentor, `403` if mentor at capacity (3 mentees).

### POST /mentorships/:id/accept

Accept a mentorship match (either party).

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "status": "active",
    "mentorAccepted": true,
    "menteeAccepted": true
  }
}
```

**Side Effects**: If both accepted → status becomes 'active', notification sent to both parties.

### POST /mentorships/:id/decline

Decline a mentorship match (either party).

**Response** `200`:
```json
{
  "ok": true,
  "data": { "id": "uuid", "status": "terminated" }
}
```

### POST /mentorships/:id/end

End an active mentorship early (either party).

**Response** `200`:
```json
{
  "ok": true,
  "data": { "id": "uuid", "status": "terminated", "completedAt": "ISO8601" }
}
```

### POST /mentorships/:id/rate

Rate the other party (1-5 scale).

**Body**:
```json
{
  "rating": 4
}
```

**Validation**: rating 1-5 integer. Can only rate once. Only after status = 'completed' or 'terminated'.

**Response** `200`:
```json
{
  "ok": true,
  "data": { "id": "uuid", "mentorRating": 4, "menteeRating": null }
}
```

### GET /mentorships/me

Get current user's active and recent mentorships.

**Query**: `?status=active|completed|terminated&role=mentor|mentee&cursor=string&limit=20`

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "mentorships": [
      {
        "id": "uuid",
        "mentorHumanId": "uuid",
        "mentorDisplayName": "string",
        "menteeHumanId": "uuid",
        "menteeDisplayName": "string",
        "domain": "string",
        "status": "active",
        "missionsGuided": 3,
        "tokensEarnedByMentor": 6,
        "expiresAt": "ISO8601",
        "createdAt": "ISO8601"
      }
    ],
    "nextCursor": "string|null"
  }
}
```

### GET /mentorships/:id

Get mentorship details.

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "mentorHumanId": "uuid",
    "mentorDisplayName": "string",
    "mentorTier": "string",
    "menteeHumanId": "uuid",
    "menteeDisplayName": "string",
    "menteeTier": "string",
    "domain": "string",
    "status": "active",
    "missionsGuided": 3,
    "tokensEarnedByMentor": 6,
    "mentorRating": null,
    "menteeRating": null,
    "expiresAt": "ISO8601",
    "createdAt": "ISO8601",
    "completedAt": null
  }
}
```
