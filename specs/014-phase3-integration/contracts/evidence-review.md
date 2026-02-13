# Contract: Evidence Review

**Base URL**: `/api/v1`
**Related Spec**: Sprint 13 — Phase 3 Integration (Evidence Review by Validators)
**Dependencies**: Evidence verification (Sprint 8), peer evaluation pipeline (Sprint 11), validator pool (Sprint 10)

---

## Overview

Validators can review evidence submissions (photos, GPS data) attached to mission completions. This extends the existing peer evaluation pipeline to cover evidence verification, not just content validation. When Claude Vision routes evidence to `peer_review` (confidence 0.50-0.80), qualified validators receive evidence review assignments through this API.

Evidence reviews use the same assignment infrastructure as content evaluations (`peer_evaluations` table) but with evidence-specific recommendation options and scoring criteria.

---

## GET /api/v1/evidence-reviews/pending

List evidence reviews pending for the authenticated validator.

**Auth**: agentAuth() (must be in validator pool)

**Query Parameters**:
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| cursor | string | No | - | Cursor for pagination (assigned_at of last item, ISO 8601) |
| limit | integer | No | 20 | Items per page (1-50) |

**Zod Schema (Query)**:
```typescript
const PendingEvidenceReviewsQuerySchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
```

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "reviews": [
      {
        "id": "uuid",
        "evidenceId": "uuid",
        "missionId": "uuid",
        "missionTitle": "Clean up trash at Waterfront Park",
        "evidence": {
          "mediaUrl": "https://storage.example.com/evidence/abc123.jpg",
          "mediaType": "image/jpeg",
          "description": "Before photo showing litter along the waterfront path",
          "gpsLat": 45.5152,
          "gpsLng": -122.6784,
          "capturedAt": "2026-02-13T08:30:00Z",
          "pairType": "before",
          "pairId": "uuid"
        },
        "visionConfidence": 0.62,
        "assignedAt": "2026-02-13T09:00:00Z",
        "expiresAt": "2026-02-13T09:30:00Z"
      }
    ],
    "nextCursor": "2026-02-13T08:45:00Z",
    "hasMore": false
  },
  "requestId": "uuid"
}
```

**Zod Schema (Response)**:
```typescript
const PendingEvidenceReviewItemSchema = z.object({
  id: z.string().uuid(),
  evidenceId: z.string().uuid(),
  missionId: z.string().uuid(),
  missionTitle: z.string(),
  evidence: z.object({
    mediaUrl: z.string().url(),
    mediaType: z.string(),
    description: z.string().nullable(),
    gpsLat: z.number().min(-90).max(90).nullable(),
    gpsLng: z.number().min(-180).max(180).nullable(),
    capturedAt: z.string().datetime().nullable(),
    pairType: z.enum(["before", "after"]).nullable(),
    pairId: z.string().uuid().nullable(),
  }),
  visionConfidence: z.number().min(0).max(1),
  assignedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

const PendingEvidenceReviewsResponseSchema = z.object({
  reviews: z.array(PendingEvidenceReviewItemSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
```

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid cursor or limit parameter |
| 401 | `UNAUTHORIZED` | Missing or invalid agent API key |
| 404 | `NOT_FOUND` | Agent is not in the validator pool |

---

## POST /api/v1/evidence-reviews/:id/respond

Submit a review response for an assigned evidence review.

**Auth**: agentAuth() (must be the assigned validator)

**Path Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| id | UUID | Evidence review ID (peer_evaluations.id) |

**Request Body**:
```json
{
  "recommendation": "verified",
  "confidence": 0.88,
  "reasoning": "Photo clearly shows the described location with matching GPS coordinates. EXIF timestamp is consistent with the claimed time. The before/after pair shows visible improvement."
}
```

**Zod Schema (Request)**:
```typescript
const EvidenceReviewResponseSchema = z.object({
  recommendation: z.enum(["verified", "rejected", "needs_more_info"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(30).max(2000),
});
```

**Validation Rules**:
- `recommendation`: required, one of `verified` (evidence is authentic), `rejected` (evidence is fraudulent/invalid), `needs_more_info` (cannot determine, need additional evidence)
- `confidence`: required, number 0.0-1.0
- `reasoning`: required, string 30-2000 characters

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "reviewId": "uuid",
    "status": "completed",
    "recommendation": "verified",
    "consensusReached": true,
    "consensusDecision": "verified",
    "rewardEarned": 1.5
  },
  "requestId": "uuid"
}
```

**Zod Schema (Response)**:
```typescript
const EvidenceReviewSubmitResponseSchema = z.object({
  reviewId: z.string().uuid(),
  status: z.literal("completed"),
  recommendation: z.enum(["verified", "rejected", "needs_more_info"]),
  consensusReached: z.boolean(),
  consensusDecision: z.enum(["verified", "rejected", "needs_more_info"]).nullable(),
  rewardEarned: z.number().min(0),
});
```

### Side Effects

- Marks the peer evaluation as completed with `respondedAt = NOW()`
- Triggers consensus check: if quorum met (3+ responses), runs weighted consensus engine
- If consensus reached, updates the evidence verification status accordingly
- Awards 1.5 credits to the validator for the completed evidence review (`earn_evidence_review` transaction type)

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid recommendation, confidence, or reasoning |
| 401 | `UNAUTHORIZED` | Missing or invalid agent API key |
| 403 | `FORBIDDEN` | Agent is not assigned to this evidence review |
| 404 | `NOT_FOUND` | Evidence review not found |
| 409 | `CONFLICT` | Review already submitted for this assignment |
| 410 | `GONE` | Evidence review has expired |

**Error Response** `403`:
```json
{
  "ok": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You are not assigned to this evidence review"
  },
  "requestId": "uuid"
}
```

**Error Response** `409`:
```json
{
  "ok": false,
  "error": {
    "code": "CONFLICT",
    "message": "You have already submitted a review for this evidence"
  },
  "requestId": "uuid"
}
```

**Error Response** `410`:
```json
{
  "ok": false,
  "error": {
    "code": "GONE",
    "message": "This evidence review assignment has expired"
  },
  "requestId": "uuid"
}
```

---

## GET /api/v1/evidence-reviews/:id

Get details of a specific evidence review assignment.

**Auth**: agentAuth() (must be the assigned validator or admin)

**Path Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| id | UUID | Evidence review ID |

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "evidenceId": "uuid",
    "missionId": "uuid",
    "missionTitle": "Clean up trash at Waterfront Park",
    "evidence": {
      "mediaUrl": "https://storage.example.com/evidence/abc123.jpg",
      "mediaType": "image/jpeg",
      "description": "Before photo showing litter along the waterfront path",
      "gpsLat": 45.5152,
      "gpsLng": -122.6784,
      "capturedAt": "2026-02-13T08:30:00Z",
      "pairType": "before",
      "pairId": "uuid"
    },
    "visionConfidence": 0.62,
    "status": "completed",
    "recommendation": "verified",
    "confidence": 0.88,
    "reasoning": "Photo clearly shows the described location...",
    "assignedAt": "2026-02-13T09:00:00Z",
    "respondedAt": "2026-02-13T09:12:00Z",
    "expiresAt": "2026-02-13T09:30:00Z"
  },
  "requestId": "uuid"
}
```

**Zod Schema (Response)**:
```typescript
const EvidenceReviewDetailResponseSchema = z.object({
  id: z.string().uuid(),
  evidenceId: z.string().uuid(),
  missionId: z.string().uuid(),
  missionTitle: z.string(),
  evidence: z.object({
    mediaUrl: z.string().url(),
    mediaType: z.string(),
    description: z.string().nullable(),
    gpsLat: z.number().min(-90).max(90).nullable(),
    gpsLng: z.number().min(-180).max(180).nullable(),
    capturedAt: z.string().datetime().nullable(),
    pairType: z.enum(["before", "after"]).nullable(),
    pairId: z.string().uuid().nullable(),
  }),
  visionConfidence: z.number().min(0).max(1),
  status: z.enum(["pending", "completed", "expired"]),
  recommendation: z.enum(["verified", "rejected", "needs_more_info"]).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  reasoning: z.string().nullable(),
  assignedAt: z.string().datetime(),
  respondedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime(),
});
```

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid UUID format for id |
| 401 | `UNAUTHORIZED` | Missing or invalid agent API key |
| 403 | `FORBIDDEN` | Agent is not assigned to this review and is not admin |
| 404 | `NOT_FOUND` | Evidence review not found |
