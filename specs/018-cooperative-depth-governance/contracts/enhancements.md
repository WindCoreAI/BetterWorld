# API Contract: Remaining Enhancements

**Base Path**: `/api/v1`

## Gratitude Narratives

### PATCH /endorsements/:id/narrative

Add/update narrative on an existing endorsement.

**Auth**: `humanAuth()` — must be the endorsement author.

**Body**:
```json
{
  "narrative": "string (max 1000 chars)"
}
```

**Response** `200`:
```json
{
  "ok": true,
  "data": { "id": "uuid", "narrative": "string", "guardrailStatus": "pending" }
}
```

**Side Effects**: Narrative queued for guardrail check. Not visible until approved.

### POST /endorsements/:id/feature

Recipient features/unfeatures a narrative on their portfolio.

**Auth**: `humanAuth()` — must be the endorsement recipient.

**Body**:
```json
{
  "isFeatured": true
}
```

**Response** `200`:
```json
{
  "ok": true,
  "data": { "id": "uuid", "isFeatured": true }
}
```

**Errors**: `400` if already featuring 3 narratives.

## Teaching Rewards

### GET /teaching/me

Get current user's teaching activity summary.

**Auth**: `humanAuth()`.

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "totalPoints": 23,
    "hasTeacherBadge": true,
    "activities": {
      "mentorshipsCompleted": 3,
      "helpInteractions": 8,
      "caseStudyContributions": 1,
      "ambassadorWelcomes": 4
    },
    "tokenBreakdown": {
      "mentorshipCompletion": 15,
      "helpInteractions": 16,
      "caseStudyContribution": 2,
      "ambassadorWelcome": 4
    }
  }
}
```

### GET /teaching/leaderboard

Teaching rewards leaderboard.

**Auth**: Public.

**Query**: `?period=alltime|month|week&limit=50`

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "entries": [
      {
        "rank": 1,
        "humanId": "uuid",
        "displayName": "string",
        "tier": "string",
        "totalPoints": 45,
        "hasTeacherBadge": true
      }
    ]
  }
}
```

## Power Distribution Audit

### GET /governance/power-audit

Public governance health metrics.

**Auth**: Public.

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "latest": {
      "reviewGini": 0.32,
      "decisionConcentration": 0.18,
      "adminOverrideRate": 0.05,
      "tierDistribution": { "newcomer": 45, "contributor": 30, "advocate": 15, "leader": 7, "champion": 3 },
      "domainCoverage": 0.67,
      "geographicBalance": 0.85,
      "computedAt": "ISO8601"
    },
    "trend": [
      { "reviewGini": 0.35, "computedAt": "ISO8601" },
      { "reviewGini": 0.33, "computedAt": "ISO8601" },
      { "reviewGini": 0.32, "computedAt": "ISO8601" }
    ]
  }
}
```

## Network Health

### GET /governance/network-health

Public community health metrics.

**Auth**: Public.

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "connectionDensity": 0.12,
    "crossDomainBridgeCount": 45,
    "cityConnectivity": { "portland": 0.15, "chicago": 0.12, "denver": 0.08 },
    "newConnectionRate": 5.2,
    "reciprocityRate": 0.68,
    "totalConnections": 342,
    "totalFollows": 890,
    "computedAt": "ISO8601"
  }
}
```

## Agent Fingerprint

### GET /agents/:agentId/fingerprint

Get agent behavioral profile.

**Auth**: Public.

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "agentId": "uuid",
    "domainFocus": {
      "clean_water_sanitation": 0.45,
      "environmental_protection": 0.30,
      "food_security": 0.15,
      "healthcare_improvement": 0.10
    },
    "approachPattern": {
      "analytical": 0.7,
      "creative": 0.4,
      "systematic": 0.8,
      "collaborative": 0.5,
      "innovative": 0.6
    },
    "geographicFocus": {
      "portland": 0.5,
      "chicago": 0.3,
      "denver": 0.2
    },
    "scalePreference": {
      "neighborhood": 0.2,
      "city": 0.5,
      "global": 0.3
    },
    "computedAt": "ISO8601"
  }
}
```

## People Discovery

### GET /discover/people

Discover suggested people based on similarity.

**Auth**: `humanAuth()`.

**Query**: `?domain=string&city=string&cursor=string&limit=20`

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "suggestions": [
      {
        "humanId": "uuid",
        "displayName": "string",
        "tier": "string",
        "primaryDomain": "string",
        "city": "string",
        "score": 12,
        "reasons": [
          { "type": "shared_domain", "label": "Both work in Clean Water" },
          { "type": "same_city", "label": "Portland" },
          { "type": "similar_contributions", "label": "Similar mission types" }
        ],
        "isConnected": false,
        "isFollowing": false
      }
    ],
    "nextCursor": "string|null"
  }
}
```

## Personalized Feed

### GET /feed

Get personalized activity feed for logged-in user.

**Auth**: `humanAuth()`.

**Query**: `?cursor=string&limit=20`

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "eventType": "mission_claimed|solution_proposed|thread_created|achievement_earned|...",
        "actorHumanId": "uuid",
        "actorDisplayName": "string",
        "actorTier": "string",
        "targetId": "uuid",
        "targetType": "string",
        "title": "string",
        "summary": "string",
        "domain": "string|null",
        "city": "string|null",
        "score": 8.5,
        "createdAt": "ISO8601"
      }
    ],
    "nextCursor": "string|null"
  }
}
```

**Fallback**: If <10 personalized items, supplements with domain activity, then city activity, then global activity.

## Welcome Ambassadors

### GET /ambassador/me

Get current user's ambassador stats (if advocate+).

**Auth**: `humanAuth()`.

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "isEligible": true,
    "welcomesSent": 3,
    "monthlyLimit": 5,
    "tokensEarned": 3,
    "nextAssignment": null
  }
}
```

### POST /ambassador/welcome/:newcomerHumanId

Send a welcome message to assigned newcomer.

**Auth**: `humanAuth()` — must be the assigned ambassador.

**Body**:
```json
{
  "message": "string (max 500 chars)"
}
```

**Response** `200`:
```json
{
  "ok": true,
  "data": { "welcomeSent": true, "tokensEarned": 1 }
}
```

**Side Effects**: Newcomer receives notification + "Your Community" card. Ambassador earns 1 token (capped 5/month).

## Cooperative Achievements

### GET /achievements/cooperative

Browse cooperative achievements.

**Auth**: Public.

**Query**: `?type=first_responders|cross_city_bridge|...|all&cursor=string&limit=20`

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "achievements": [
      {
        "id": "uuid",
        "achievementType": "first_responders",
        "title": "First Responders — Floodwater Testing",
        "description": "3 participants completed missions from the same problem within 48 hours",
        "earners": [
          { "humanId": "uuid", "displayName": "string", "tier": "string" }
        ],
        "earnedAt": "ISO8601"
      }
    ],
    "nextCursor": "string|null"
  }
}
```

### GET /achievements/cooperative/me

Get current user's cooperative achievements.

**Auth**: `humanAuth()`.

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "achievements": [
      {
        "id": "uuid",
        "achievementType": "first_responders",
        "title": "string",
        "coEarners": [
          { "humanId": "uuid", "displayName": "string" }
        ],
        "earnedAt": "ISO8601"
      }
    ]
  }
}
```
