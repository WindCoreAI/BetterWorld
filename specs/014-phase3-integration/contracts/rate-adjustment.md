# Contract: Rate Adjustment

**Base URL**: `/api/v1`
**Related Spec**: Sprint 13 — Phase 3 Integration (Dynamic Rate Adjustment)
**Dependencies**: Agent credit economy (Sprint 10/12), feature flags (Sprint 10), economic health monitoring (Sprint 12)

---

## Overview

Admins can view the history of rate adjustments (reward multiplier and cost multiplier changes) and manually override the current rates. Rate adjustments affect the credit economy globally: the reward multiplier scales validation rewards, and the cost multiplier scales submission costs. These map to the existing `SUBMISSION_COST_MULTIPLIER` and a new `VALIDATION_REWARD_MULTIPLIER` feature flag.

Rate adjustments are recorded in a new `rate_adjustments` table for audit purposes.

### Rate Adjustment Record

```typescript
interface RateAdjustmentRecord {
  id: string;                   // UUID
  rewardMultiplier: number;     // 0.0-3.0
  costMultiplier: number;       // 0.0-2.0
  reason: string;               // Admin-provided justification
  source: 'manual' | 'auto';   // Manual override or auto-adjustment
  adminId: string | null;       // UUID of admin (null for auto)
  previousRewardMultiplier: number;
  previousCostMultiplier: number;
  createdAt: string;            // ISO 8601
}
```

---

## GET /api/v1/admin/rate-adjustments

Get the history of rate adjustments with cursor-based pagination.

**Auth**: requireAdmin()

**Query Parameters**:
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| cursor | string | No | - | Cursor for pagination (created_at of last item, ISO 8601) |
| limit | integer | No | 20 | Items per page (1-50) |
| source | string | No | - | Filter by source: `manual` or `auto` |

**Zod Schema (Query)**:
```typescript
const ListRateAdjustmentsQuerySchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  source: z.enum(["manual", "auto"]).optional(),
});
```

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "adjustments": [
      {
        "id": "uuid",
        "rewardMultiplier": 1.2,
        "costMultiplier": 0.8,
        "reason": "Increasing rewards to attract more validators during low participation period",
        "source": "manual",
        "adminId": "uuid",
        "adminName": "admin@betterworld.org",
        "previousRewardMultiplier": 1.0,
        "previousCostMultiplier": 1.0,
        "createdAt": "2026-02-13T10:00:00Z"
      },
      {
        "id": "uuid",
        "rewardMultiplier": 1.0,
        "costMultiplier": 1.0,
        "reason": "Auto-adjustment: economic health score recovered above 0.80 threshold",
        "source": "auto",
        "adminId": null,
        "adminName": null,
        "previousRewardMultiplier": 0.5,
        "previousCostMultiplier": 0.5,
        "createdAt": "2026-02-12T06:00:00Z"
      }
    ],
    "currentRates": {
      "rewardMultiplier": 1.2,
      "costMultiplier": 0.8
    },
    "nextCursor": "2026-02-11T18:00:00Z",
    "hasMore": true
  },
  "requestId": "uuid"
}
```

**Zod Schema (Response)**:
```typescript
const RateAdjustmentItemSchema = z.object({
  id: z.string().uuid(),
  rewardMultiplier: z.number().min(0).max(3),
  costMultiplier: z.number().min(0).max(2),
  reason: z.string(),
  source: z.enum(["manual", "auto"]),
  adminId: z.string().uuid().nullable(),
  adminName: z.string().nullable(),
  previousRewardMultiplier: z.number().min(0).max(3),
  previousCostMultiplier: z.number().min(0).max(2),
  createdAt: z.string().datetime(),
});

const ListRateAdjustmentsResponseSchema = z.object({
  adjustments: z.array(RateAdjustmentItemSchema),
  currentRates: z.object({
    rewardMultiplier: z.number().min(0).max(3),
    costMultiplier: z.number().min(0).max(2),
  }),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
```

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid cursor, limit, or source parameter |
| 401 | `UNAUTHORIZED` | Missing or invalid admin session |
| 403 | `FORBIDDEN` | Authenticated user is not an admin |

---

## POST /api/v1/admin/rate-adjustments/override

Manually override the reward and/or cost multipliers. Updates the corresponding feature flags in Redis and logs the adjustment for audit.

**Auth**: requireAdmin()

**Request Body**:
```json
{
  "rewardMultiplier": 1.5,
  "costMultiplier": 0.5,
  "reason": "Temporarily increasing rewards and reducing costs to bootstrap validator participation during Denver expansion."
}
```

**Zod Schema (Request)**:
```typescript
const RateOverrideRequestSchema = z.object({
  rewardMultiplier: z.number().min(0).max(3).optional(),
  costMultiplier: z.number().min(0).max(2).optional(),
  reason: z.string().min(10).max(1000),
}).refine(
  (data) => data.rewardMultiplier !== undefined || data.costMultiplier !== undefined,
  { message: "At least one of rewardMultiplier or costMultiplier must be provided" }
);
```

**Validation Rules**:
- `rewardMultiplier`: optional, number 0.0-3.0 (at least one of reward/cost must be provided)
- `costMultiplier`: optional, number 0.0-2.0 (at least one of reward/cost must be provided)
- `reason`: required, string 10-1000 characters

**Response** `201`:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "rewardMultiplier": 1.5,
    "costMultiplier": 0.5,
    "previousRewardMultiplier": 1.0,
    "previousCostMultiplier": 1.0,
    "reason": "Temporarily increasing rewards and reducing costs to bootstrap validator participation during Denver expansion.",
    "source": "manual",
    "adminId": "uuid",
    "flagsUpdated": {
      "VALIDATION_REWARD_MULTIPLIER": true,
      "SUBMISSION_COST_MULTIPLIER": true
    },
    "createdAt": "2026-02-13T14:00:00Z"
  },
  "requestId": "uuid"
}
```

**Zod Schema (Response)**:
```typescript
const RateOverrideResponseSchema = z.object({
  id: z.string().uuid(),
  rewardMultiplier: z.number().min(0).max(3),
  costMultiplier: z.number().min(0).max(2),
  previousRewardMultiplier: z.number().min(0).max(3),
  previousCostMultiplier: z.number().min(0).max(2),
  reason: z.string(),
  source: z.literal("manual"),
  adminId: z.string().uuid(),
  flagsUpdated: z.record(z.string(), z.boolean()),
  createdAt: z.string().datetime(),
});
```

### Side Effects

- Reads current `VALIDATION_REWARD_MULTIPLIER` and `SUBMISSION_COST_MULTIPLIER` from Redis feature flags
- Updates the corresponding feature flag(s) in Redis
- Inserts a row into `rate_adjustments` with the previous and new values
- Changes take effect immediately (feature flag cache TTL is 60 seconds)

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid multiplier values or missing reason |
| 401 | `UNAUTHORIZED` | Missing or invalid admin session |
| 403 | `FORBIDDEN` | Authenticated user is not an admin |
| 422 | `VALIDATION_ERROR` | Neither rewardMultiplier nor costMultiplier provided |

**Error Response** `422`:
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "At least one of rewardMultiplier or costMultiplier must be provided"
  },
  "requestId": "uuid"
}
```
