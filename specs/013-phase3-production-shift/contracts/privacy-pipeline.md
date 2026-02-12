# Contract: Privacy Pipeline

**Base URL**: `/api/v1`
**Related Spec**: FR-021 through FR-024
**Dependencies**: Observation submission (Sprint 10), Supabase Storage, external vision service (face/plate detection)

---

## Overview

The privacy pipeline processes all user-submitted observation photos to remove personally identifiable information (PII) before the photos are served to any user. Processing occurs asynchronously via a BullMQ worker and consists of three stages: EXIF PII stripping, face detection and blurring, and license plate detection and blurring. Photos that fail processing are quarantined rather than served unprocessed.

### Processing Pipeline

```
Observation photo submitted
       │
       ▼
  Store original in private bucket
  (never served to users)
       │
       ▼
  Enqueue privacy-worker job
       │
       ▼
  Stage 1: EXIF PII Stripping
  (strip GPS, device serial, owner name)
       │
       ▼
  Stage 2: Face Detection + Blurring
  (blur all detected faces)
       │
       ▼
  Stage 3: License Plate Detection + Blurring
  (blur all detected plates)
       │
       ▼
  Store processed photo in public bucket
  Set privacy_processing_status = 'completed'
       │
       ▼
  Photo now visible to users
```

### State Machine

```
pending → processing → completed
pending → processing → quarantined  (any stage fails)
quarantined → processing → completed  (admin retry)
quarantined → processing → quarantined  (retry also fails)
```

---

## Internal Contract: Privacy Worker

The privacy worker (`apps/api/src/workers/privacy-worker.ts`) processes observation photos asynchronously. It is triggered when a new observation is submitted (Sprint 10) and enqueues a job for each photo.

### Job Payload

```typescript
interface PrivacyWorkerJobData {
  observationId: string;      // UUID of the observation
  photoStorageKey: string;    // Supabase Storage key for the original photo
  retryCount: number;         // 0 for first attempt, incremented on retry
}
```

### Processing Stages

#### Stage 1: EXIF PII Stripping

```typescript
interface ExifStrippingResult {
  stripped: boolean;
  fieldsRemoved: string[];    // e.g., ['GPSLatitude', 'GPSLongitude', 'OwnerName', 'SerialNumber']
  originalExifSize: number;   // bytes
}
```

**Implementation**: Uses `exifr` to read and `sharp` to remove EXIF metadata.

**Fields Removed**:
| EXIF Field | Why Stripped |
|-----------|-------------|
| GPSLatitude, GPSLongitude, GPSAltitude | Location PII (system stores GPS separately) |
| GPSDateStamp, GPSTimeStamp | Temporal correlation risk |
| OwnerName | Direct PII |
| CameraOwnerName | Direct PII |
| SerialNumber, LensSerialNumber | Device fingerprinting |
| ImageUniqueID | Tracking identifier |
| MakerNote | May contain serial numbers or location data |

**Fields Preserved**: ImageWidth, ImageHeight, Orientation, ColorSpace, ExifImageWidth, ExifImageHeight (needed for display).

#### Stage 2: Face Detection and Blurring

```typescript
interface FaceBlurringResult {
  facesDetected: number;
  facesBlurred: number;
  detectionConfidences: number[];  // per-face confidence scores
  processingTimeMs: number;
}
```

**External Service**: Calls a face detection API (implementation detail; may use a self-hosted model or cloud API).

**Blurring Method**: Gaussian blur with radius proportional to face bounding box size (minimum 20px radius). Applied using `sharp` composite operations.

#### Stage 3: License Plate Detection and Blurring

```typescript
interface PlateBlurringResult {
  platesDetected: number;
  platesBlurred: number;
  detectionConfidences: number[];
  processingTimeMs: number;
}
```

**External Service**: Calls a license plate detection API (implementation detail; may use same service as face detection).

**Blurring Method**: Same Gaussian blur approach as faces.

### Worker Output

```typescript
interface PrivacyProcessingResult {
  observationId: string;
  status: 'completed' | 'quarantined';
  processedStorageKey: string | null;  // null if quarantined
  exif: ExifStrippingResult;
  faces: FaceBlurringResult;
  plates: PlateBlurringResult;
  totalProcessingTimeMs: number;
  quarantineReason: string | null;     // null if completed
}
```

### Error Handling and Quarantine

| Error Scenario | Handling |
|---------------|----------|
| EXIF stripping fails | Quarantine (cannot guarantee PII removal) |
| Face detection API unavailable | Retry 3 times, then quarantine |
| Face detection API timeout (10s) | Retry 3 times, then quarantine |
| Plate detection API unavailable | Retry 3 times, then quarantine |
| Corrupted/unsupported image format | Quarantine immediately |
| Processing produces empty/invalid output | Quarantine |
| Any unhandled exception | Quarantine (fail-closed) |

**Quarantine Principle**: Photos are **never** served to users without completing all three privacy stages. Fail-closed means any failure quarantines the photo.

### BullMQ Configuration

| Setting | Value |
|---------|-------|
| Queue name | `privacy-processing` |
| Concurrency | 3 |
| Max retries | 3 (within a single job attempt) |
| Backoff | Exponential, 5s initial, max 60s |
| Job timeout | 120s (2 minutes per photo) |
| Dead letter queue | `privacy-processing-dlq` |

---

## GET /api/v1/admin/privacy/stats

Get privacy pipeline processing statistics.

**Auth**: requireAdmin()

**Query Parameters**:
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| fromDate | string (YYYY-MM-DD) | No | 7 days ago | Start of window |
| toDate | string (YYYY-MM-DD) | No | today | End of window |

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "counts": {
      "pending": 2,
      "processing": 1,
      "completed": 187,
      "quarantined": 5,
      "total": 195
    },
    "completionRate": 0.9590,
    "avgProcessingTimeMs": 3200,
    "processingDetails": {
      "exifStripped": 187,
      "facesDetected": 42,
      "facesBlurred": 42,
      "platesDetected": 15,
      "platesBlurred": 15
    },
    "quarantineReasons": [
      {
        "reason": "Face detection API timeout after 3 retries",
        "count": 3
      },
      {
        "reason": "Unsupported image format",
        "count": 2
      }
    ],
    "throughput": {
      "last24h": 28,
      "last7d": 187,
      "avgPerDay": 26.7
    },
    "period": {
      "from": "2026-02-05",
      "to": "2026-02-12"
    }
  },
  "requestId": "uuid"
}
```

**Zod Schema (Response)**:
```typescript
const PrivacyStatsResponseSchema = z.object({
  counts: z.object({
    pending: z.number().int().min(0),
    processing: z.number().int().min(0),
    completed: z.number().int().min(0),
    quarantined: z.number().int().min(0),
    total: z.number().int().min(0),
  }),
  completionRate: z.number().min(0).max(1),
  avgProcessingTimeMs: z.number().min(0),
  processingDetails: z.object({
    exifStripped: z.number().int().min(0),
    facesDetected: z.number().int().min(0),
    facesBlurred: z.number().int().min(0),
    platesDetected: z.number().int().min(0),
    platesBlurred: z.number().int().min(0),
  }),
  quarantineReasons: z.array(z.object({
    reason: z.string(),
    count: z.number().int().min(0),
  })),
  throughput: z.object({
    last24h: z.number().int().min(0),
    last7d: z.number().int().min(0),
    avgPerDay: z.number().min(0),
  }),
  period: z.object({
    from: z.string(),
    to: z.string(),
  }),
});
```

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Missing or invalid admin session |
| 403 | `FORBIDDEN` | Authenticated user is not an admin |

---

## PUT /api/v1/admin/privacy/:observationId/retry

Retry privacy processing for a quarantined observation. Re-enqueues the privacy worker job.

**Auth**: requireAdmin()

**Path Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| observationId | UUID | The quarantined observation ID |

**Request Body**: None (empty body)

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "observationId": "uuid",
    "previousStatus": "quarantined",
    "newStatus": "processing",
    "retryCount": 2,
    "jobId": "uuid",
    "enqueuedAt": "2026-02-12T11:30:00Z"
  },
  "requestId": "uuid"
}
```

**Zod Schema (Response)**:
```typescript
const PrivacyRetryResponseSchema = z.object({
  observationId: z.string().uuid(),
  previousStatus: z.literal('quarantined'),
  newStatus: z.literal('processing'),
  retryCount: z.number().int().min(1),
  jobId: z.string(),
  enqueuedAt: z.string().datetime(),
});
```

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Missing or invalid admin session |
| 403 | `FORBIDDEN` | Authenticated user is not an admin |
| 404 | `NOT_FOUND` | Observation not found |
| 409 | `CONFLICT` | Observation is not in `quarantined` status (already processing or completed) |
| 429 | `RATE_LIMITED` | Max 3 retries per observation. Further retries require manual investigation. |

**Error Response** `409`:
```json
{
  "ok": false,
  "error": {
    "code": "CONFLICT",
    "message": "Observation is currently in 'processing' status, cannot retry"
  },
  "requestId": "uuid"
}
```

**Error Response** `429`:
```json
{
  "ok": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Maximum 3 retry attempts exceeded for this observation. Manual investigation required."
  },
  "requestId": "uuid"
}
```
