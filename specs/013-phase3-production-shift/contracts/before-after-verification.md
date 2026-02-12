# Contract: Before/After Verification

**Base URL**: `/api/v1`
**Related Spec**: FR-017 through FR-020
**Dependencies**: Evidence submission pipeline (Sprint 8), Claude Vision AI (Sprint 8), mission claims, Supabase Storage

---

## Overview

Extends the existing evidence submission system (Sprint 8) to support paired before/after photos for mission completion verification. Photo pairs are linked by a shared `pair_id` and processed through AI-powered comparison to determine whether the submitted after photo demonstrates meaningful change from the before photo relative to the mission objective.

---

## POST /api/v1/missions/:missionId/evidence

Extended to accept photo pair metadata. This modifies the existing evidence submission endpoint from Sprint 8.

**Auth**: humanAuth() (must be the mission claimer)

**Path Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| missionId | UUID | The claimed mission |

**Request Body** (multipart/form-data):
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | File | Yes | Photo file (JPEG/PNG, max 10MB) |
| pair_id | UUID | No | Shared identifier linking before/after photos. Omit for standalone evidence. |
| photo_sequence_type | string | Yes | `before`, `after`, or `standalone` (default) |
| description | string | No | Optional description of the evidence |
| latitude | number | Yes | GPS latitude of the photo location |
| longitude | number | Yes | GPS longitude of the photo location |

**Zod Schema (Request)**:
```typescript
const EvidenceSubmissionSchema = z.object({
  pair_id: z.string().uuid().optional(),
  photo_sequence_type: z.enum(['before', 'after', 'standalone']).default('standalone'),
  description: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
```

**Validation Rules**:
- If `photo_sequence_type` is `before` or `after`, `pair_id` is **required**.
- If `photo_sequence_type` is `standalone`, `pair_id` must be omitted or null.
- A `pair_id` can have at most **one** `before` and **one** `after` photo.
- The `before` photo must be submitted **before** the `after` photo for a given `pair_id`.
- GPS coordinates must be within the mission's location radius (from mission or template `gps_radius_meters`).
- File must be JPEG or PNG, max 10MB.
- Human must have an active (uncompleted, unexpired) claim on this mission.

**Response** `201`:
```json
{
  "ok": true,
  "data": {
    "evidenceId": "uuid",
    "missionId": "uuid",
    "pairId": "uuid",
    "photoSequenceType": "before",
    "gpsVerified": true,
    "gpsDistanceMeters": 23.5,
    "status": "pending_pair",
    "uploadUrl": "https://storage.supabase.co/...",
    "createdAt": "2026-02-12T10:00:00Z"
  },
  "requestId": "uuid"
}
```

**Response** `201` (after photo triggers comparison):
```json
{
  "ok": true,
  "data": {
    "evidenceId": "uuid",
    "missionId": "uuid",
    "pairId": "uuid",
    "photoSequenceType": "after",
    "gpsVerified": true,
    "gpsDistanceMeters": 18.2,
    "status": "comparison_queued",
    "comparisonJobId": "uuid",
    "uploadUrl": "https://storage.supabase.co/...",
    "createdAt": "2026-02-12T10:45:00Z"
  },
  "requestId": "uuid"
}
```

**Zod Schema (Response)**:
```typescript
const EvidenceSubmissionResponseSchema = z.object({
  evidenceId: z.string().uuid(),
  missionId: z.string().uuid(),
  pairId: z.string().uuid().nullable(),
  photoSequenceType: z.enum(['before', 'after', 'standalone']),
  gpsVerified: z.boolean(),
  gpsDistanceMeters: z.number().min(0),
  status: z.enum([
    'pending',           // standalone evidence awaiting verification
    'pending_pair',      // before photo awaiting its after counterpart
    'comparison_queued', // after photo submitted, AI comparison enqueued
    'verified',          // verification complete
  ]),
  comparisonJobId: z.string().uuid().optional(),
  uploadUrl: z.string().url(),
  createdAt: z.string().datetime(),
});
```

### Status Transitions

```
Before photo submitted:
  → pending_pair

After photo submitted (triggers comparison):
  → comparison_queued → (AI processes) → verified / peer_review / rejected

Standalone photo:
  → pending → (existing Sprint 8 pipeline) → verified / peer_review / rejected
```

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid fields, missing pair_id for before/after, bad file type |
| 400 | `PAIR_INCOMPLETE` | Attempting to submit `after` without a matching `before` for the pair_id |
| 400 | `PAIR_ALREADY_COMPLETE` | Both before and after already exist for this pair_id |
| 401 | `UNAUTHORIZED` | Missing or invalid human session |
| 403 | `FORBIDDEN` | Human does not have an active claim on this mission |
| 404 | `NOT_FOUND` | Mission not found |
| 413 | `PAYLOAD_TOO_LARGE` | File exceeds 10MB |
| 422 | `GPS_OUT_OF_RANGE` | Photo GPS coordinates are outside the mission location radius |

**Error Response** `400` (pair incomplete):
```json
{
  "ok": false,
  "error": {
    "code": "PAIR_INCOMPLETE",
    "message": "Cannot submit 'after' photo: no 'before' photo found for pair_id abc-123"
  },
  "requestId": "uuid"
}
```

**Error Response** `422` (GPS out of range):
```json
{
  "ok": false,
  "error": {
    "code": "GPS_OUT_OF_RANGE",
    "message": "Photo location is 342m from mission site, maximum allowed is 100m"
  },
  "requestId": "uuid"
}
```

---

## GET /api/v1/evidence/pairs/:pairId

Get both photos in a before/after pair along with the AI comparison result.

**Auth**: humanAuth() (must be the evidence submitter or mission owner) | requireAdmin()

**Path Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| pairId | UUID | The shared pair identifier |

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "pairId": "uuid",
    "missionId": "uuid",
    "missionTitle": "Clean up litter at Laurelhurst Park entrance",
    "before": {
      "evidenceId": "uuid",
      "photoUrl": "https://storage.supabase.co/.../before.jpg",
      "latitude": 45.5231,
      "longitude": -122.6267,
      "gpsDistanceMeters": 23.5,
      "description": "Litter scattered near park entrance",
      "submittedAt": "2026-02-12T10:00:00Z"
    },
    "after": {
      "evidenceId": "uuid",
      "photoUrl": "https://storage.supabase.co/.../after.jpg",
      "latitude": 45.5232,
      "longitude": -122.6266,
      "gpsDistanceMeters": 18.2,
      "description": "Area cleaned, bags collected",
      "submittedAt": "2026-02-12T10:45:00Z"
    },
    "comparison": {
      "status": "completed",
      "confidence": 0.87,
      "decision": "approved",
      "reasoning": "The after photo shows significant improvement: litter has been removed from the park entrance area. Before photo shows scattered waste; after photo shows clean ground with collection bags visible.",
      "comparedAt": "2026-02-12T10:46:15Z"
    },
    "pairStatus": "approved"
  },
  "requestId": "uuid"
}
```

**Zod Schema (Response)**:
```typescript
const PhotoSchema = z.object({
  evidenceId: z.string().uuid(),
  photoUrl: z.string().url(),
  latitude: z.number(),
  longitude: z.number(),
  gpsDistanceMeters: z.number().min(0),
  description: z.string().nullable(),
  submittedAt: z.string().datetime(),
});

const ComparisonSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  confidence: z.number().min(0).max(1).nullable(),
  decision: z.enum(['approved', 'peer_review', 'rejected']).nullable(),
  reasoning: z.string().nullable(),
  comparedAt: z.string().datetime().nullable(),
});

const EvidencePairResponseSchema = z.object({
  pairId: z.string().uuid(),
  missionId: z.string().uuid(),
  missionTitle: z.string(),
  before: PhotoSchema.nullable(),
  after: PhotoSchema.nullable(),
  comparison: ComparisonSchema.nullable(),
  pairStatus: z.enum([
    'pending_before',    // No photos yet (should not normally occur via API)
    'pending_after',     // Before submitted, awaiting after
    'comparison_queued', // Both submitted, AI processing
    'approved',          // AI confidence >= 0.80
    'peer_review',       // AI confidence 0.50-0.80
    'rejected',          // AI confidence < 0.50
  ]),
});
```

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Missing or invalid session |
| 403 | `FORBIDDEN` | Not the evidence submitter, mission owner, or admin |
| 404 | `NOT_FOUND` | No evidence pair found with this pair_id |

---

## Internal Contract: Before/After Vision API Comparison

This documents the internal AI-powered comparison service (`apps/api/src/services/before-after.service.ts`) that is triggered by the BullMQ worker when an after photo is submitted.

### Input

```typescript
interface BeforeAfterComparisonInput {
  pairId: string;
  missionId: string;
  missionTitle: string;
  missionDescription: string;
  beforePhoto: {
    storageUrl: string;       // Supabase Storage URL
    latitude: number;
    longitude: number;
  };
  afterPhoto: {
    storageUrl: string;
    latitude: number;
    longitude: number;
  };
}
```

### Claude Vision API Call

**Model**: Claude Sonnet 4.5 (same as evidence verification in Sprint 8)

**System Prompt**:
```
You are verifying mission completion by comparing before and after photos.
The mission objective is: {missionDescription}

Analyze whether the after photo shows meaningful progress toward completing
the mission objective compared to the before photo. Consider:
1. Is the core problem visibly addressed?
2. Is the change genuine (not staged or digitally altered)?
3. Are the photos of the same location (similar background/context)?

Respond with a JSON object containing:
- confidence: number 0-1 (how confident you are the mission was completed)
- reasoning: string (detailed explanation of your assessment)
- changeDetected: boolean (whether any meaningful change is visible)
- locationMatch: boolean (whether photos appear to be the same location)
```

### Output

```typescript
interface BeforeAfterComparisonOutput {
  pairId: string;
  confidence: number;         // 0.00-1.00
  decision: 'approved' | 'peer_review' | 'rejected';
  reasoning: string;          // AI-generated explanation
  changeDetected: boolean;
  locationMatch: boolean;
  processingTimeMs: number;
  modelUsed: string;          // e.g., "claude-sonnet-4-5-20241022"
  inputTokens: number;
  outputTokens: number;
}
```

### Decision Thresholds

| Confidence | Decision | Action |
|-----------|----------|--------|
| >= 0.80 | `approved` | Auto-approve evidence, progress mission |
| 0.50 - 0.79 | `peer_review` | Route to peer review (existing Sprint 8 pipeline) |
| < 0.50 | `rejected` | Auto-reject with reasoning provided to submitter |

### Cost Tracking

AI comparison costs are tracked in Redis using the existing AI budget tracking from Sprint 4:
- Key: `ai:cost:before_after:{YYYY-MM-DD}`
- Increment: estimated cost per call
- Daily limit: shared with evidence verification budget

### Error Handling

| Error | Handling |
|-------|----------|
| Vision API timeout (30s) | Retry up to 2 times, then route to peer review |
| Vision API rate limit | Back off and retry with exponential delay |
| Unreadable photo | Mark comparison as `failed`, route to peer review |
| API returns invalid JSON | Log error, route to peer review |
