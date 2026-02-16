# API Contract: Personal Network

**Base Path**: `/api/v1/network`
**Auth**: `requireHuman()` for all endpoints

---

## GET /network/me

Get aggregated personal network summary.

**Response** (200):
```json
{
  "ok": true,
  "data": {
    "followersCount": 42,
    "followingCount": 18,
    "connectionsCount": 12,
    "sharedDomains": ["clean_water", "food_security", "education_access"],
    "activeCities": ["Portland", "Chicago"],
    "recentConnections": [
      {
        "humanId": "uuid",
        "displayName": "Sarah Chen",
        "avatarUrl": "string | null",
        "tier": "contributor",
        "city": "Portland",
        "sharedDomains": ["clean_water"],
        "interactionCount": 7,
        "connectedSince": "2026-02-10T00:00:00Z"
      }
    ],
    "topInteractionPartners": [
      {
        "humanId": "uuid",
        "displayName": "James Park",
        "avatarUrl": "string | null",
        "tier": "advocate",
        "interactionCount": 15,
        "interactionTypes": ["peer_review", "endorsement"]
      }
    ]
  },
  "requestId": "uuid"
}
```

**Caching**: Redis key `network:me:{humanId}`, 5-minute TTL.

---

## GET /network/me/interactions

Get shared interaction history with a specific person.

**Query Parameters**:
- `partnerId` (UUID, required) — The other human

**Response** (200):
```json
{
  "ok": true,
  "data": {
    "partner": {
      "humanId": "uuid",
      "displayName": "Sarah Chen",
      "avatarUrl": "string | null",
      "tier": "contributor",
      "city": "Portland"
    },
    "sharedDomains": ["clean_water"],
    "totalInteractions": 7,
    "interactions": [
      {
        "type": "peer_review",
        "direction": "you_reviewed_them",
        "referenceId": "uuid",
        "date": "2026-02-14T00:00:00Z"
      },
      {
        "type": "endorsement",
        "direction": "they_endorsed_you",
        "referenceId": "uuid",
        "date": "2026-02-12T00:00:00Z"
      },
      {
        "type": "shared_domain_mission",
        "domain": "clean_water",
        "missionTitle": "Install water filters at Oak Street",
        "date": "2026-02-10T00:00:00Z"
      }
    ],
    "connectionStatus": "accepted",
    "isFollowing": true,
    "isFollowedBy": false
  },
  "requestId": "uuid"
}
```
