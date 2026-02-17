# API Contract: Mission Buddies & Help System

**Base Path**: `/api/v1/missions`
**Auth**: `humanAuth()` required for all endpoints

## Buddy Endpoints

### POST /missions/:missionId/claims/:claimId/buddy

Invite a connected user to co-claim as buddy.

**Body**:
```json
{
  "buddyHumanId": "uuid"
}
```

**Validation**: buddyHumanId must be a mutual connection. Mission must be claimed by current user. Buddy must have capacity (buddy counts as 0.5).

**Response** `201`:
```json
{
  "ok": true,
  "data": {
    "claimId": "uuid",
    "buddyHumanId": "uuid",
    "buddyStatus": "pending"
  }
}
```

**Side Effects**: Notification sent to buddy with mission details.

**Errors**: `400` if buddy not connected, `403` if buddy at capacity, `409` if buddy already invited.

### POST /missions/:missionId/claims/:claimId/buddy/accept

Buddy accepts the co-claim invitation.

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "claimId": "uuid",
    "buddyStatus": "accepted",
    "buddyActiveCount": 2.5
  }
}
```

**Side Effects**: Buddy's active mission count incremented by 0.5. Chat channel created for pair.

### POST /missions/:missionId/claims/:claimId/buddy/decline

Buddy declines the invitation.

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "claimId": "uuid",
    "buddyStatus": "declined",
    "buddyHumanId": null
  }
}
```

## Help Offer Endpoints

### POST /missions/:missionId/claims/:claimId/help-offers

Offer to help on another user's claimed mission.

**Body**:
```json
{
  "message": "string (max 500 chars)"
}
```

**Response** `201`:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "missionClaimId": "uuid",
    "helperHumanId": "uuid",
    "message": "string",
    "status": "pending",
    "guardrailStatus": "pending"
  }
}
```

**Side Effects**: Message queued for guardrail check. Claimer notified after approval.

**Errors**: `409` if already offered on this claim, `400` if own claim.

### POST /missions/:missionId/claims/:claimId/help-offers/:offerId/accept

Claimer accepts a help offer.

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "status": "accepted"
  }
}
```

**Side Effects**: Helper gains access to mission chat channel.

### POST /missions/:missionId/claims/:claimId/help-offers/:offerId/decline

Claimer declines a help offer.

**Response** `200`:
```json
{
  "ok": true,
  "data": { "id": "uuid", "status": "declined" }
}
```

**Side Effects**: Helper notified of decline.

### POST /missions/:missionId/claims/:claimId/help-offers/:offerId/mark-contributing

Claimer marks helper as contributing (for reward share).

**Response** `200`:
```json
{
  "ok": true,
  "data": { "id": "uuid", "isContributing": true }
}
```

### GET /missions/:missionId/claims/:claimId/help-offers

List help offers for a claim (claimer only).

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "helpOffers": [
      {
        "id": "uuid",
        "helperHumanId": "uuid",
        "helperDisplayName": "string",
        "helperTier": "string",
        "message": "string",
        "status": "pending|accepted|declined",
        "isContributing": false,
        "createdAt": "ISO8601"
      }
    ]
  }
}
```

## Help Request Endpoints

### PATCH /missions/:missionId/claims/:claimId/help-request

Toggle help request on a claim.

**Body**:
```json
{
  "helpRequested": true,
  "helpRequestNote": "string (max 500 chars)"
}
```

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "claimId": "uuid",
    "helpRequested": true,
    "helpRequestNote": "string"
  }
}
```

**Side Effects**: Help request note queued for guardrail check. After approval, appears in domain discussion feed and mission detail page.

### GET /missions/help-requests

Browse active help requests (filterable).

**Query**: `?domain=string&city=string&cursor=string&limit=20`

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "helpRequests": [
      {
        "missionId": "uuid",
        "missionTitle": "string",
        "claimId": "uuid",
        "claimerHumanId": "uuid",
        "claimerDisplayName": "string",
        "helpRequestNote": "string",
        "domain": "string",
        "city": "string|null",
        "createdAt": "ISO8601"
      }
    ],
    "nextCursor": "string|null"
  }
}
```
