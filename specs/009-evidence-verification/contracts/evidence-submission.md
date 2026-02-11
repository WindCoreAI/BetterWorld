# API Contract: Evidence Submission

**Base Path**: `/api/v1/missions/:missionId/evidence` and `/api/v1/evidence`
**Auth**: Human auth (humanAuth middleware)

All responses use standard envelope: `{ ok: boolean, data?: T, error?: { code: string, message: string, details?: unknown }, meta?: {...}, requestId: string }`

---

## POST /api/v1/missions/:missionId/evidence

Submit evidence for a claimed mission.

**Auth**: Human auth (humanAuth middleware) -- must have an active claim on this mission
**Content-Type**: `multipart/form-data`
**Rate Limit**: 10 submissions per hour per human (Redis sliding window)

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| missionId | uuid | Mission to submit evidence for |

### Form Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| files | File[] | Yes | Evidence files (1-5 files) |
| latitude | decimal | No | GPS latitude of evidence capture (-90 to 90) |
| longitude | decimal | No | GPS longitude of evidence capture (-180 to 180) |
| capturedAt | string | No | ISO 8601 timestamp when evidence was captured |
| notes | string | No | Additional context (max 2000 chars) |

### Validation Rules

- Human must have an active claim (`status = "active"`) on this mission
- Mission must not be expired (`expiresAt > NOW()`)
- Claim must not be past its deadline (`deadlineAt > NOW()`)
- At least 1 file required, maximum 5 files per submission
- Each file max 10MB
- Allowed MIME types: `image/jpeg`, `image/png`, `image/heic`, `application/pdf`, `video/mp4`, `video/quicktime`
- If `latitude` provided, `longitude` must also be provided (and vice versa)
- `capturedAt` must not be in the future

### Response: 201 Created

```json
{
  "ok": true,
  "data": {
    "evidenceId": "uuid",
    "missionId": "uuid",
    "claimId": "uuid",
    "status": "pending",
    "filesUploaded": 3
  },
  "requestId": "uuid"
}
```

### Side Effects

1. Files uploaded to Supabase Storage (`evidence/{evidenceId}/{filename}`)
2. Thumbnail generated for image files (stored alongside originals)
3. BullMQ job queued: `evidence:ai-verify` with `{ evidenceId }` for AI verification stage
4. WebSocket event emitted: `evidence:submitted` with `{ missionId, evidenceId, humanId }`

### Errors

| Code | Status | Condition |
|------|--------|-----------|
| UNAUTHORIZED | 401 | Not authenticated |
| FORBIDDEN | 403 | No active claim on this mission |
| NOT_FOUND | 404 | Mission not found |
| VALIDATION_ERROR | 413 | File exceeds 10MB limit |
| VALIDATION_ERROR | 422 | Invalid file type or missing required fields |
| RATE_LIMITED | 429 | 10 submissions/hour limit exceeded |
| CONFLICT | 409 | Mission expired or claim past deadline |

---

## GET /api/v1/missions/:missionId/evidence

List evidence submissions for a mission. Claim owner sees own evidence only.

**Auth**: Human auth (humanAuth middleware)

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| missionId | uuid | Mission to list evidence for |

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
    "evidence": [
      {
        "id": "uuid",
        "missionId": "uuid",
        "claimId": "uuid",
        "evidenceType": "image",
        "contentUrl": "string (signed URL, 1hr expiry)",
        "thumbnailUrl": "string (signed URL, 1hr expiry)",
        "verificationStage": "ai_review",
        "aiVerificationScore": 0.85,
        "finalVerdict": null,
        "createdAt": "ISO 8601"
      }
    ],
    "nextCursor": "uuid | null"
  },
  "meta": {
    "hasMore": true,
    "count": 3
  },
  "requestId": "uuid"
}
```

### Errors

| Code | Status | Condition |
|------|--------|-----------|
| UNAUTHORIZED | 401 | Not authenticated |
| NOT_FOUND | 404 | Mission not found or no claim |

---

## GET /api/v1/evidence/:evidenceId

Get full evidence details including verification status.

**Auth**: Human auth (owner of the claim) or Admin

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| evidenceId | uuid | Evidence submission ID |

### Response: 200 OK

```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "missionId": "uuid",
    "claimId": "uuid",
    "evidenceType": "image",
    "contentUrl": "string (signed URL, 1hr expiry)",
    "thumbnailUrl": "string (signed URL, 1hr expiry)",
    "latitude": 40.7128,
    "longitude": -74.0060,
    "capturedAt": "ISO 8601",
    "notes": "string",
    "verificationStage": "peer_review",
    "aiVerificationScore": 0.85,
    "peerReviewCount": 2,
    "finalVerdict": null,
    "finalConfidence": null,
    "createdAt": "ISO 8601"
  },
  "requestId": "uuid"
}
```

### Evidence Type Mapping

| MIME Type | evidenceType |
|-----------|-------------|
| image/jpeg, image/png, image/heic | image |
| application/pdf | document |
| video/mp4, video/quicktime | video |

### Verification Stages (lifecycle)

```
pending -> ai_review -> peer_review -> verified | rejected
                                    -> appealed -> admin_review -> verified | rejected
```

### Errors

| Code | Status | Condition |
|------|--------|-----------|
| UNAUTHORIZED | 401 | Not authenticated |
| FORBIDDEN | 403 | Not the evidence owner and not admin |
| NOT_FOUND | 404 | Evidence not found |
