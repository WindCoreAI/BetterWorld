# Contract: Pattern Aggregation

**Base URL**: `/api/v1`
**Related Spec**: Sprint 13 — Phase 3 Integration (Systemic Pattern Detection)
**Dependencies**: Problem clusters table (Sprint 10 schema), observations (Sprint 10), PostGIS (Sprint 10), pgvector embeddings

---

## Overview

Pattern aggregation detects systemic issues by clustering geographically and semantically related problems. The existing `problem_clusters` table stores cluster data including centroid coordinates, radius, member problem IDs, and optional pgvector embeddings. Clusters are surfaced publicly to highlight recurring patterns in a city, and admins can trigger re-aggregation.

### Cluster Detection Logic

The aggregation worker groups problems by:
1. **Geographic proximity** -- problems within a configurable radius (default 500m for neighborhood, 5km for city scope)
2. **Domain match** -- only problems in the same domain are clustered
3. **Minimum members** -- clusters require at least 5 member problems to be created (systemic issue threshold)
4. **Observation density** -- `totalObservations` and `distinctReporters` track corroboration

---

## GET /api/v1/patterns

List active problem clusters (systemic patterns). Public endpoint.

**Auth**: None (public endpoint)

**Query Parameters**:
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| cursor | string | No | - | Cursor for pagination (created_at of last item, ISO 8601) |
| limit | integer | No | 20 | Items per page (1-50) |
| city | string | No | - | Filter by city (e.g., `portland`, `chicago`, `denver`) |
| domain | string | No | - | Filter by problem domain |
| minMembers | integer | No | - | Minimum number of member problems |
| scope | string | No | - | Filter by geographic scope: `neighborhood`, `city`, `country`, `global` |

**Zod Schema (Query)**:
```typescript
const ListPatternsQuerySchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  city: z.string().max(100).optional(),
  domain: z.enum([
    "poverty_reduction", "education_access", "healthcare_improvement",
    "environmental_protection", "food_security", "mental_health_wellbeing",
    "community_building", "disaster_response", "digital_inclusion",
    "human_rights", "clean_water_sanitation", "sustainable_energy",
    "gender_equality", "biodiversity_conservation", "elder_care",
  ]).optional(),
  minMembers: z.coerce.number().int().min(1).optional(),
  scope: z.enum(["neighborhood", "city", "country", "global"]).optional(),
});
```

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "patterns": [
      {
        "id": "uuid",
        "title": "Recurring pothole damage on SE Division corridor",
        "description": "Multiple reports of pothole-related infrastructure issues along a 2km stretch of SE Division Street",
        "domain": "environmental_protection",
        "scope": "neighborhood",
        "city": "portland",
        "centroid": {
          "lat": 45.5047,
          "lng": -122.6196
        },
        "radiusMeters": 1200,
        "memberCount": 7,
        "totalObservations": 23,
        "distinctReporters": 15,
        "isPromoted": false,
        "lastAggregatedAt": "2026-02-13T06:00:00Z",
        "createdAt": "2026-02-10T06:00:00Z"
      }
    ],
    "nextCursor": "2026-02-09T06:00:00Z",
    "hasMore": true
  },
  "requestId": "uuid"
}
```

**Zod Schema (Response)**:
```typescript
const PatternListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  domain: z.string(),
  scope: z.enum(["neighborhood", "city", "country", "global"]),
  city: z.string().nullable(),
  centroid: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).nullable(),
  radiusMeters: z.number().int().min(0),
  memberCount: z.number().int().min(0),
  totalObservations: z.number().int().min(0),
  distinctReporters: z.number().int().min(0),
  isPromoted: z.boolean(),
  lastAggregatedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

const ListPatternsResponseSchema = z.object({
  patterns: z.array(PatternListItemSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
```

### Notes

- Only active clusters (`is_active = true`) are returned
- `isPromoted` is `true` when the cluster has been promoted to a formal problem (via `promoted_to_problem_id`)
- Centroid is extracted from the PostGIS `geography(Point,4326)` column
- Results are ordered by `created_at DESC` (newest first)

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid query parameters (bad domain, cursor, limit, etc.) |

---

## GET /api/v1/patterns/:id

Get detailed information about a specific pattern cluster, including its member problems.

**Auth**: None (public endpoint)

**Path Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| id | UUID | Problem cluster ID |

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "title": "Recurring pothole damage on SE Division corridor",
    "description": "Multiple reports of pothole-related infrastructure issues along a 2km stretch of SE Division Street",
    "domain": "environmental_protection",
    "scope": "neighborhood",
    "city": "portland",
    "centroid": {
      "lat": 45.5047,
      "lng": -122.6196
    },
    "radiusMeters": 1200,
    "memberCount": 7,
    "totalObservations": 23,
    "distinctReporters": 15,
    "isPromoted": false,
    "promotedToProblemId": null,
    "members": [
      {
        "id": "uuid",
        "title": "Large pothole on SE Division and 82nd",
        "domain": "environmental_protection",
        "severity": "medium",
        "status": "active",
        "observationCount": 5,
        "location": {
          "lat": 45.5052,
          "lng": -122.5780
        },
        "createdAt": "2026-02-08T14:00:00Z"
      },
      {
        "id": "uuid",
        "title": "Pothole cluster near SE Division and 60th",
        "domain": "environmental_protection",
        "severity": "high",
        "status": "active",
        "observationCount": 8,
        "location": {
          "lat": 45.5045,
          "lng": -122.6003
        },
        "createdAt": "2026-02-06T10:00:00Z"
      }
    ],
    "lastAggregatedAt": "2026-02-13T06:00:00Z",
    "createdAt": "2026-02-10T06:00:00Z",
    "updatedAt": "2026-02-13T06:00:00Z"
  },
  "requestId": "uuid"
}
```

**Zod Schema (Response)**:
```typescript
const PatternMemberSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  domain: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]).nullable(),
  status: z.string(),
  observationCount: z.number().int().min(0),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).nullable(),
  createdAt: z.string().datetime(),
});

const PatternDetailResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  domain: z.string(),
  scope: z.enum(["neighborhood", "city", "country", "global"]),
  city: z.string().nullable(),
  centroid: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).nullable(),
  radiusMeters: z.number().int().min(0),
  memberCount: z.number().int().min(0),
  totalObservations: z.number().int().min(0),
  distinctReporters: z.number().int().min(0),
  isPromoted: z.boolean(),
  promotedToProblemId: z.string().uuid().nullable(),
  members: z.array(PatternMemberSchema),
  lastAggregatedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
```

### Notes

- Member problems are fetched by looking up the UUIDs in `member_problem_ids` array
- Members are ordered by `observationCount DESC` (most corroborated first)
- If a member problem has been deleted or is inactive, it is still returned but with `status: "inactive"`

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid UUID format for id |
| 404 | `NOT_FOUND` | Pattern cluster not found or inactive |

**Error Response** `404`:
```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Pattern cluster not found"
  },
  "requestId": "uuid"
}
```

---

## POST /api/v1/admin/patterns/refresh

Trigger a manual pattern aggregation run. This enqueues a BullMQ job to re-cluster problems.

**Auth**: requireAdmin()

**Request Body**: None (empty body)

**Response** `202`:
```json
{
  "ok": true,
  "data": {
    "jobId": "pattern-aggregation-1707825600000",
    "status": "queued",
    "message": "Pattern aggregation job has been enqueued",
    "estimatedDurationSeconds": 30
  },
  "requestId": "uuid"
}
```

**Zod Schema (Response)**:
```typescript
const RefreshPatternsResponseSchema = z.object({
  jobId: z.string(),
  status: z.literal("queued"),
  message: z.string(),
  estimatedDurationSeconds: z.number().int().min(0),
});
```

### Side Effects

- Enqueues a `pattern-aggregation` job to the BullMQ queue
- The worker re-scans all active problems, recomputes clusters using geographic proximity + domain matching
- Updates existing clusters (member counts, centroid recalculation) and creates new ones
- Deactivates clusters that no longer meet the minimum member threshold (5 problems)
- Sets `lastAggregatedAt` on all processed clusters

### Rate Limiting

Manual refresh is rate-limited to **1 request per 5 minutes** to prevent excessive recomputation.

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Missing or invalid admin session |
| 403 | `FORBIDDEN` | Authenticated user is not an admin |
| 429 | `RATE_LIMITED` | Manual refresh already triggered within the last 5 minutes |

**Error Response** `429`:
```json
{
  "ok": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Pattern aggregation was recently triggered. Please wait before refreshing again.",
    "metadata": {
      "retryAfterSeconds": 187
    }
  },
  "requestId": "uuid"
}
```
