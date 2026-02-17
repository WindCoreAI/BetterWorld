# API Contract: Cross-Group Challenges & Circle Enrichment

**Base Path**: `/api/v1`
**Auth**: `humanAuth()` for mutations; public read for challenges

## Challenge Endpoints

### GET /challenges

List active and upcoming challenges.

**Auth**: Public.

**Query**: `?status=active|upcoming|completed&type=city_vs_city|domain_sprint|cross_pollination&cursor=string&limit=20`

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "challenges": [
      {
        "id": "uuid",
        "challengeType": "city_vs_city",
        "title": "February City Showdown",
        "description": "string",
        "groups": [
          { "type": "city", "value": "portland" },
          { "type": "city", "value": "chicago" }
        ],
        "metric": "missions_completed",
        "targetValue": null,
        "startDate": "2026-02-01",
        "endDate": "2026-02-28",
        "status": "active",
        "participantCount": 45
      }
    ],
    "nextCursor": "string|null"
  }
}
```

### GET /challenges/:id

Get challenge details with live scores.

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "challengeType": "city_vs_city",
    "title": "string",
    "description": "string",
    "groups": [...],
    "metric": "missions_completed",
    "targetValue": null,
    "startDate": "2026-02-01",
    "endDate": "2026-02-28",
    "status": "active",
    "leaderboard": [
      {
        "groupType": "city",
        "groupValue": "portland",
        "rawScore": 89,
        "activeParticipants": 42,
        "perCapitaScore": 2119,
        "rank": 1
      },
      {
        "groupType": "city",
        "groupValue": "chicago",
        "rawScore": 120,
        "activeParticipants": 65,
        "perCapitaScore": 1846,
        "rank": 2
      }
    ],
    "results": null
  }
}
```

### POST /challenges/:id/join

Join a challenge (auto-assigned to user's city/domain group).

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "challengeId": "uuid",
    "humanId": "uuid",
    "groupType": "city",
    "groupValue": "portland",
    "score": 0
  }
}
```

### GET /challenges/:id/my-progress

Get current user's contribution to the challenge.

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "challengeId": "uuid",
    "score": 5,
    "groupRank": 3,
    "groupTotal": 42,
    "contributions": [
      { "type": "mission_completed", "missionId": "uuid", "points": 1, "date": "2026-02-15" }
    ]
  }
}
```

### POST /admin/challenges

Admin: Create a new challenge.

**Auth**: Admin only.

**Body**:
```json
{
  "challengeType": "city_vs_city|domain_sprint|cross_pollination",
  "title": "string",
  "description": "string",
  "groups": [{ "type": "city", "value": "portland" }, { "type": "city", "value": "chicago" }],
  "metric": "missions_completed",
  "targetValue": 50,
  "startDate": "2026-03-01",
  "endDate": "2026-03-15"
}
```

**Response** `201`: Created challenge object.

## Circle Enrichment Endpoints

### GET /circles

List circles (with membership info).

**Query**: `?domain=string&status=active&cursor=string&limit=20`

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "circles": [
      {
        "id": "uuid",
        "name": "Portland Water Warriors",
        "description": "string",
        "domain": "clean_water_sanitation",
        "memberCount": 12,
        "myRole": "member|founder|moderator|null",
        "createdAt": "ISO8601"
      }
    ],
    "nextCursor": "string|null"
  }
}
```

### POST /circles

Create a new circle (costs 25 ImpactTokens).

**Body**:
```json
{
  "name": "string (max 100 chars)",
  "description": "string (optional)",
  "domain": "clean_water_sanitation"
}
```

**Response** `201`:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "name": "string",
    "domain": "string",
    "memberCount": 1,
    "myRole": "founder"
  }
}
```

**Side Effects**: 25 tokens deducted via double-entry. Creator auto-added as founder.

**Errors**: `400` if user already in 3 circles, `402` if insufficient tokens.

### GET /circles/:id

Get circle details with metrics and members.

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "name": "string",
    "description": "string",
    "domain": "string",
    "memberCount": 12,
    "metrics": {
      "missionsCompleted": 47,
      "activeSince": "ISO8601"
    },
    "members": [
      {
        "humanId": "uuid",
        "displayName": "string",
        "tier": "string",
        "role": "founder|moderator|member",
        "joinedAt": "ISO8601"
      }
    ],
    "myRole": "member"
  }
}
```

### POST /circles/:id/join

Join a circle.

**Response** `200`:
```json
{
  "ok": true,
  "data": { "circleId": "uuid", "role": "member" }
}
```

**Errors**: `400` if circle at 50 members, `400` if user already in 3 circles.

### POST /circles/:id/leave

Leave a circle.

**Response** `200`:
```json
{ "ok": true, "data": { "left": true } }
```

**Side Effects**: If founder leaves, ownership transfers to longest-standing moderator or member.

### GET /circles/:id/posts

Get circle discussion posts.

**Query**: `?cursor=string&limit=20`

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "posts": [
      {
        "id": "uuid",
        "authorHumanId": "uuid",
        "authorDisplayName": "string",
        "content": "string",
        "postType": "discussion|mission_share|celebration",
        "createdAt": "ISO8601"
      }
    ],
    "nextCursor": "string|null"
  }
}
```

**Note**: Only `guardrailStatus = 'approved'` posts returned.

### POST /circles/:id/posts

Create a circle discussion post.

**Body**:
```json
{
  "content": "string (max 2000 chars)",
  "postType": "discussion|celebration"
}
```

**Response** `201`: Post object with `guardrailStatus: "pending"`.

**Side Effects**: Queued for 3-layer guardrail pipeline. Not visible until approved.

### POST /circles/:id/missions

Share a mission with the circle.

**Body**:
```json
{
  "missionId": "uuid"
}
```

**Response** `201`:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "circleId": "uuid",
    "missionId": "uuid",
    "missionTitle": "string"
  }
}
```

**Errors**: `409` if mission already shared to this circle.

### GET /circles/:id/missions

Get missions shared to circle.

**Query**: `?cursor=string&limit=20`

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "missions": [
      {
        "id": "uuid",
        "missionId": "uuid",
        "missionTitle": "string",
        "missionDomain": "string",
        "missionStatus": "open|claimed",
        "sharedByDisplayName": "string",
        "createdAt": "ISO8601"
      }
    ],
    "nextCursor": "string|null"
  }
}
```
