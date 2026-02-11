# API Contract: Peer Review

**Base Path**: `/api/v1/peer-reviews`
**Auth**: Human auth (humanAuth middleware)

All responses use standard envelope: `{ ok: boolean, data?: T, error?: { code: string, message: string, details?: unknown }, meta?: {...}, requestId: string }`

---

## GET /api/v1/peer-reviews/pending

List evidence items assigned to this reviewer that have not yet been voted on.

**Auth**: Human auth (humanAuth middleware)

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| cursor | uuid | -- | Cursor for pagination |
| limit | integer | 10 | Page size (1-100) |

### Reviewer Assignment Rules

Reviewers are assigned by the verification worker using these criteria:
- Reviewer must NOT be the evidence submitter (no self-review)
- Reviewer must NOT have an active claim on the same mission (no conflict of interest)
- Reviewer should have skills overlapping with the mission domain (preferred, not required)
- Reviewer must have `verified` trust tier or completed >= 5 missions
- Each evidence submission is assigned to 3 reviewers
- Assignments are distributed round-robin weighted by reviewer availability and past accuracy

### Response: 200 OK

```json
{
  "ok": true,
  "data": {
    "reviews": [
      {
        "evidenceId": "uuid",
        "missionTitle": "Plant 50 trees in Central Park restoration zone",
        "missionDescription": "string (truncated to 300 chars)",
        "evidenceType": "image",
        "contentUrl": "string (signed URL, 1hr expiry)",
        "thumbnailUrl": "string (signed URL, 1hr expiry)",
        "missionLatitude": 40.7829,
        "missionLongitude": -73.9654,
        "evidenceLatitude": 40.7831,
        "evidenceLongitude": -73.9650,
        "gpsDistanceMeters": 45,
        "submittedAt": "ISO 8601"
      }
    ],
    "nextCursor": "uuid | null"
  },
  "meta": {
    "hasMore": false,
    "count": 2
  },
  "requestId": "uuid"
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| evidenceId | uuid | Evidence submission to review |
| missionTitle | string | Title of the associated mission |
| missionDescription | string | Mission description (truncated to 300 chars) |
| evidenceType | enum | `image`, `document`, `video` |
| contentUrl | string | Signed URL to evidence file (1hr expiry) |
| thumbnailUrl | string \| null | Signed URL to thumbnail (images only) |
| missionLatitude | decimal \| null | Expected mission location latitude |
| missionLongitude | decimal \| null | Expected mission location longitude |
| evidenceLatitude | decimal \| null | GPS latitude from evidence submission |
| evidenceLongitude | decimal \| null | GPS longitude from evidence submission |
| gpsDistanceMeters | integer \| null | Haversine distance between mission and evidence locations (null if either location missing) |
| submittedAt | string | ISO 8601 timestamp of evidence submission |

### Errors

| Code | Status | Condition |
|------|--------|-----------|
| UNAUTHORIZED | 401 | Not authenticated |

---

## POST /api/v1/peer-reviews/:evidenceId/vote

Submit a peer review vote for an assigned evidence item.

**Auth**: Human auth (humanAuth middleware) -- must be an assigned reviewer
**Rate Limit**: 30 votes per hour per human (Redis sliding window)

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| evidenceId | uuid | Evidence submission to vote on |

### Request Body

```json
{
  "verdict": "approve",
  "confidence": 0.85,
  "reasoning": "Photo clearly shows newly planted saplings in the designated area. GPS coordinates match mission location within acceptable range."
}
```

### Request Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| verdict | enum | Yes | `approve` or `reject` |
| confidence | decimal | Yes | Reviewer confidence (0.00-1.00) |
| reasoning | string | Yes | Justification (20-2000 chars) |

### Validation Rules

- Human must be an assigned reviewer for this evidence
- Human must not have already voted on this evidence
- Evidence must be in `peer_review` verification stage
- `confidence` must be between 0.00 and 1.00 (inclusive)
- `reasoning` minimum 20 characters

### Response: 201 Created

```json
{
  "ok": true,
  "data": {
    "reviewId": "uuid",
    "evidenceId": "uuid",
    "verdict": "approve",
    "confidence": 0.85,
    "rewardAmount": 2
  },
  "requestId": "uuid"
}
```

### Side Effects

1. Peer review record created in `peerReviews` table
2. Token reward of 2 IT distributed to reviewer (double-entry transaction)
3. If this is the final required review (count >= `peerReviewsNeeded`):
   - Aggregate peer verdict computed (weighted by confidence)
   - `finalConfidence` calculated: `aiScore * 0.4 + peerConfidence * 0.6`
   - `finalVerdict` set to `verified` or `rejected` based on threshold (>= 0.60)
   - If `verified`: evidence reward distributed to submitter
   - WebSocket event: `evidence:verified` or `evidence:rejected`
4. Audit log entry created in `verificationAuditLog`

### Peer Verdict Aggregation

```
peerConfidence = sum(review.confidence * (review.verdict == "approve" ? 1 : 0)) / sum(review.confidence)
peerVerdict = peerConfidence >= 0.50 ? "approve" : "reject"
finalConfidence = aiScore * 0.4 + peerConfidence * 0.6
finalVerdict = finalConfidence >= 0.60 AND peerVerdict == "approve" ? "verified" : "rejected"
```

### Errors

| Code | Status | Condition |
|------|--------|-----------|
| UNAUTHORIZED | 401 | Not authenticated |
| FORBIDDEN | 403 | Not an assigned reviewer for this evidence |
| NOT_FOUND | 404 | Evidence not found |
| CONFLICT | 409 | Already voted on this evidence |
| VALIDATION_ERROR | 422 | Invalid verdict, confidence out of range, or reasoning too short |
| RATE_LIMITED | 429 | 30 votes/hour limit exceeded |

---

## GET /api/v1/peer-reviews/history

List the authenticated human's past peer review votes.

**Auth**: Human auth (humanAuth middleware)

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| cursor | uuid | -- | Cursor for pagination |
| limit | integer | 20 | Page size (1-100) |

### Response: 200 OK

```json
{
  "ok": true,
  "data": {
    "reviews": [
      {
        "id": "uuid",
        "evidenceId": "uuid",
        "verdict": "approve",
        "confidence": 0.85,
        "reasoning": "Photo clearly shows newly planted saplings...",
        "rewardAmount": 2,
        "createdAt": "ISO 8601"
      }
    ],
    "nextCursor": "uuid | null"
  },
  "meta": {
    "hasMore": true,
    "count": 15
  },
  "requestId": "uuid"
}
```

### Errors

| Code | Status | Condition |
|------|--------|-----------|
| UNAUTHORIZED | 401 | Not authenticated |
