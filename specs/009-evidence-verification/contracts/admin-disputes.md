# API Contract: Admin Disputes

**Base Path**: `/api/v1/admin/disputes`
**Auth**: Admin role required (JWT with admin role check)

All responses use standard envelope: `{ ok: boolean, data?: T, error?: { code: string, message: string, details?: unknown }, meta?: {...}, requestId: string }`

---

## GET /api/v1/admin/disputes

List evidence submissions that have been appealed and require admin resolution.

**Auth**: Admin JWT (role = "admin")

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| cursor | uuid | -- | Cursor for pagination |
| limit | integer | 20 | Page size (1-100) |
| status | enum | "pending" | Filter: `pending` (unresolved appeals) or `resolved` |

### Response: 200 OK

```json
{
  "ok": true,
  "data": {
    "disputes": [
      {
        "evidenceId": "uuid",
        "missionTitle": "Plant 50 trees in Central Park restoration zone",
        "submitterName": "Jane Doe",
        "submitterId": "uuid",
        "appealReason": "The peer reviewers incorrectly rejected my submission. The photo clearly shows the planted trees matching the mission requirements. The GPS offset is because I was standing across the street when taking the photo.",
        "aiScore": 0.72,
        "aiReasoning": "Image shows tree planting activity. GPS coordinates 150m from mission target. High confidence in authenticity.",
        "peerReviews": [
          {
            "reviewerId": "uuid",
            "reviewerName": "John Smith",
            "verdict": "reject",
            "confidence": 0.60,
            "reasoning": "GPS location seems too far from the mission site."
          },
          {
            "reviewerId": "uuid",
            "reviewerName": "Alice Chen",
            "verdict": "approve",
            "confidence": 0.80,
            "reasoning": "Trees visible in photo match species described in mission."
          },
          {
            "reviewerId": "uuid",
            "reviewerName": "Bob Wilson",
            "verdict": "reject",
            "confidence": 0.55,
            "reasoning": "Cannot confirm location from image alone."
          }
        ],
        "evidenceType": "image",
        "contentUrl": "string (signed URL, 1hr expiry)",
        "thumbnailUrl": "string (signed URL, 1hr expiry)",
        "evidenceLatitude": 40.7831,
        "evidenceLongitude": -73.9650,
        "missionLatitude": 40.7829,
        "missionLongitude": -73.9654,
        "gpsDistanceMeters": 45,
        "submittedAt": "ISO 8601",
        "appealedAt": "ISO 8601"
      }
    ],
    "nextCursor": "uuid | null"
  },
  "meta": {
    "hasMore": false,
    "count": 1
  },
  "requestId": "uuid"
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| evidenceId | uuid | The appealed evidence submission |
| missionTitle | string | Title of the associated mission |
| submitterName | string | Display name of the evidence submitter |
| submitterId | uuid | Human ID of the evidence submitter |
| appealReason | string | Submitter's appeal justification (20-2000 chars) |
| aiScore | decimal | AI verification score (0.00-1.00) |
| aiReasoning | string | AI explanation of its score |
| peerReviews | array | All peer reviews for this evidence |
| evidenceType | enum | `image`, `document`, `video` |
| contentUrl | string | Signed URL to evidence file (1hr expiry) |
| thumbnailUrl | string \| null | Signed thumbnail URL (images only) |
| evidenceLatitude | decimal \| null | GPS latitude from evidence |
| evidenceLongitude | decimal \| null | GPS longitude from evidence |
| missionLatitude | decimal \| null | Expected mission location latitude |
| missionLongitude | decimal \| null | Expected mission location longitude |
| gpsDistanceMeters | integer \| null | Distance between evidence and mission locations |
| submittedAt | string | When evidence was originally submitted |
| appealedAt | string | When the appeal was filed |

### Errors

| Code | Status | Condition |
|------|--------|-----------|
| UNAUTHORIZED | 401 | Not authenticated |
| FORBIDDEN | 403 | Not an admin |

---

## POST /api/v1/admin/disputes/:evidenceId/resolve

Resolve an appealed evidence dispute. This is a final decision -- no further appeals allowed.

**Auth**: Admin JWT (role = "admin")

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| evidenceId | uuid | Evidence submission to resolve |

### Request Body

```json
{
  "decision": "approve",
  "reasoning": "GPS offset is within acceptable range for urban environments. Photo evidence clearly shows mission completion."
}
```

### Request Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| decision | enum | Yes | `approve` or `reject` |
| reasoning | string | Yes | Admin justification (10-5000 chars) |

### Validation Rules

- Evidence must be in `appealed` or `admin_review` verification stage
- Evidence must not already be resolved by an admin
- `reasoning` minimum 10 characters

### Response: 200 OK

```json
{
  "ok": true,
  "data": {
    "evidenceId": "uuid",
    "decision": "approve",
    "rewardDistributed": true,
    "rewardAmount": 46
  },
  "requestId": "uuid"
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| evidenceId | uuid | Resolved evidence ID |
| decision | enum | `approve` or `reject` |
| rewardDistributed | boolean | Whether token reward was distributed (true only if `approve`) |
| rewardAmount | integer \| null | Reward amount in IT (null if rejected) |

### Side Effects

**If decision = "approve":**
1. `verificationStage` updated to `verified`
2. `finalVerdict` set to `verified`
3. `finalConfidence` set to 1.00 (admin override)
4. Token reward distributed: `mission.tokenReward * 1.00` (full reward on admin approval)
5. Double-entry transaction with idempotency key `evidence-reward:{evidenceId}`
6. WebSocket event: `evidence:verified` with `{ missionId, evidenceId, humanId, rewardAmount }`
7. Audit log entry in `verificationAuditLog` with admin ID, decision, reasoning

**If decision = "reject":**
1. `verificationStage` updated to `rejected`
2. `finalVerdict` set to `rejected` (final, no further appeal)
3. No token reward distributed
4. WebSocket event: `evidence:rejected` with `{ missionId, evidenceId, humanId }`
5. Audit log entry in `verificationAuditLog` with admin ID, decision, reasoning

### Audit Log Entry

```json
{
  "evidenceId": "uuid",
  "action": "admin_resolve",
  "adminId": "uuid",
  "decision": "approve",
  "reasoning": "GPS offset is within acceptable range...",
  "previousStage": "appealed",
  "newStage": "verified",
  "rewardAmount": 46,
  "createdAt": "ISO 8601"
}
```

### Errors

| Code | Status | Condition |
|------|--------|-----------|
| UNAUTHORIZED | 401 | Not authenticated |
| FORBIDDEN | 403 | Not an admin |
| NOT_FOUND | 404 | Evidence not found |
| CONFLICT | 409 | Evidence not in appealed/admin_review stage, or already resolved |
| VALIDATION_ERROR | 422 | Invalid decision or reasoning too short |
