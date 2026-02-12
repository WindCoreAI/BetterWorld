# Contract: Traffic Routing

**Base URL**: `/api/v1`
**Related Spec**: FR-001 through FR-005
**Dependencies**: Sprint 11 shadow mode pipeline, feature flags (Sprint 10), guardrail worker

---

## GET /api/v1/admin/production-shift/status

Get the current production shift status including traffic percentage, routing statistics, and rollback readiness.

**Auth**: requireAdmin()

**Query Parameters**:
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| fromDate | string (YYYY-MM-DD) | No | 7 days ago | Start of stats window |
| toDate | string (YYYY-MM-DD) | No | today | End of stats window |

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "trafficPercentage": 50,
    "routingEnabled": true,
    "lastUpdated": "2026-02-12T10:30:00Z",
    "updatedBy": "admin-uuid",
    "routing": {
      "totalSubmissions": 1240,
      "peerConsensusRouted": 623,
      "layerBRouted": 617,
      "actualPeerPercentage": 50.24,
      "consensusFailures": 12,
      "fallbackToLayerB": 12,
      "avgConsensusLatencyMs": 5430
    },
    "byTier": {
      "verified": {
        "total": 890,
        "peerRouted": 623,
        "layerBRouted": 267
      },
      "new": {
        "total": 350,
        "peerRouted": 0,
        "layerBRouted": 350
      }
    },
    "rollbackReadiness": {
      "ready": true,
      "layerBHealthy": true,
      "layerBAvgLatencyMs": 820,
      "pendingPeerEvaluations": 3,
      "estimatedRollbackTimeMs": 1200
    },
    "period": {
      "from": "2026-02-05",
      "to": "2026-02-12"
    }
  },
  "requestId": "uuid"
}
```

**Zod Schema**:
```typescript
const TrafficStatusResponseSchema = z.object({
  trafficPercentage: z.number().int().min(0).max(100),
  routingEnabled: z.boolean(),
  lastUpdated: z.string().datetime(),
  updatedBy: z.string().uuid().nullable(),
  routing: z.object({
    totalSubmissions: z.number().int().min(0),
    peerConsensusRouted: z.number().int().min(0),
    layerBRouted: z.number().int().min(0),
    actualPeerPercentage: z.number().min(0).max(100),
    consensusFailures: z.number().int().min(0),
    fallbackToLayerB: z.number().int().min(0),
    avgConsensusLatencyMs: z.number().min(0),
  }),
  byTier: z.object({
    verified: z.object({
      total: z.number().int().min(0),
      peerRouted: z.number().int().min(0),
      layerBRouted: z.number().int().min(0),
    }),
    new: z.object({
      total: z.number().int().min(0),
      peerRouted: z.number().int().min(0),
      layerBRouted: z.number().int().min(0),
    }),
  }),
  rollbackReadiness: z.object({
    ready: z.boolean(),
    layerBHealthy: z.boolean(),
    layerBAvgLatencyMs: z.number().min(0),
    pendingPeerEvaluations: z.number().int().min(0),
    estimatedRollbackTimeMs: z.number().min(0),
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

## PUT /api/v1/admin/production-shift/traffic

Set the traffic routing percentage. Changes take effect immediately for all new submissions. In-flight peer evaluations continue to completion; they do not abort on percentage change.

**Auth**: requireAdmin()

**Request Body**:
```json
{
  "percentage": 50,
  "reason": "Increasing to 50% after 48h at 10% with <3% false negative rate"
}
```

**Zod Schema (Request)**:
```typescript
const SetTrafficRequestSchema = z.object({
  percentage: z.number().int().min(0).max(100),
  reason: z.string().min(10).max(500),
});
```

**Validation Rules**:
- `percentage`: required, integer 0-100
- `reason`: required, string 10-500 characters (audit trail)

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "previousPercentage": 10,
    "newPercentage": 50,
    "effectiveAt": "2026-02-12T10:30:00Z",
    "updatedBy": "admin-uuid",
    "reason": "Increasing to 50% after 48h at 10% with <3% false negative rate",
    "rollbackAvailable": true
  },
  "requestId": "uuid"
}
```

**Zod Schema (Response)**:
```typescript
const SetTrafficResponseSchema = z.object({
  previousPercentage: z.number().int().min(0).max(100),
  newPercentage: z.number().int().min(0).max(100),
  effectiveAt: z.string().datetime(),
  updatedBy: z.string().uuid(),
  reason: z.string(),
  rollbackAvailable: z.boolean(),
});
```

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid percentage or missing reason |
| 401 | `UNAUTHORIZED` | Missing or invalid admin session |
| 403 | `FORBIDDEN` | Authenticated user is not an admin |
| 409 | `PRECONDITION_FAILED` | Shadow mode agreement rate < 80% (safety gate prevents enabling) |
| 503 | `SERVICE_UNAVAILABLE` | Layer B health check failed; routing change blocked for safety |

**Error Response** `409`:
```json
{
  "ok": false,
  "error": {
    "code": "PRECONDITION_FAILED",
    "message": "Cannot enable peer routing: shadow mode agreement rate is 74.2%, minimum required is 80%"
  },
  "requestId": "uuid"
}
```

---

## Internal Contract: Guardrail Worker Routing Decision

This is **not** an API endpoint. It documents the internal routing logic inserted into the existing guardrail worker (`apps/api/src/workers/guardrail-worker.ts`) after Layer A passes.

### Routing Function Signature

```typescript
/**
 * Determines whether a submission should be routed to peer consensus
 * or Layer B based on traffic percentage, agent tier, and deterministic hash.
 */
function resolveRoute(params: {
  submissionId: string;       // UUID of the content submission
  agentId: string;            // UUID of the submitting agent
  agentTier: 'new' | 'verified';
  trafficPercentage: number;  // 0-100, from Redis feature flag
}): RoutingDecision;

type RoutingDecision = {
  route: 'layer_b' | 'peer_consensus';
  reason: string;             // Human-readable reason for audit log
  hashValue: number;          // The deterministic hash bucket (0-99)
};
```

### Routing Rules (evaluated in order)

1. **Layer A hard block**: If Layer A detects a forbidden pattern, the submission is **rejected immediately**. No routing decision is made. This is unchanged from existing behavior.

2. **New-tier agents always use Layer B**: If `agentTier === 'new'`, route to `layer_b` regardless of traffic percentage. Reason: `"new-tier agent always uses Layer B"`.

3. **Traffic percentage = 0**: If `trafficPercentage === 0`, route to `layer_b`. Reason: `"traffic routing disabled (0%)"`.

4. **Deterministic hash selection**: Compute `hashValue = fnv1a(submissionId) % 100`. If `hashValue < trafficPercentage`, route to `peer_consensus`. Otherwise route to `layer_b`. Reason includes the hash value for auditability.

5. **Consensus failure fallback**: If routed to `peer_consensus` and consensus fails (timeout, no quorum, escalation), the worker **falls back to Layer B** automatically. The `routing_decision` column in `guardrail_evaluations` remains `peer_consensus` but the final decision uses Layer B's result. A `fallback_used` flag is set.

### Hash Function

```typescript
/**
 * FNV-1a 32-bit hash for deterministic routing.
 * Same submissionId always produces the same bucket.
 */
function fnv1a(input: string): number;
```

### Feature Flag

| Flag Name | Type | Default | Description |
|-----------|------|---------|-------------|
| `PEER_VALIDATION_TRAFFIC_PCT` | integer | 0 | Traffic percentage (0-100). Stored in Redis. Updated via PUT /admin/production-shift/traffic. |

### Sequence Diagram

```
Submission arrives
       │
       ▼
   Layer A (regex) ─── BLOCK ──→ rejected (unchanged)
       │ PASS
       ▼
   resolveRoute()
       │
  ┌────┴─────┐
  │          │
layer_b    peer_consensus
  │          │
  ▼          ▼
Layer B    Assign 6 validators
(Haiku)    Wait for consensus
  │          │
  │     ┌────┴─────┐
  │     │          │
  │  consensus   failure
  │  reached     (timeout/
  │     │         no quorum)
  │     │          │
  │     ▼          ▼
  │  Use peer   Fallback to
  │  decision   Layer B
  │     │          │
  └─────┴──────────┘
       │
       ▼
  Record routing_decision
  in guardrail_evaluations
       │
       ▼
  Continue pipeline
  (approve/reject/flag)
```

### Data Written

The routing decision is persisted in the `guardrail_evaluations` table via the new `routing_decision` column (`routing_decision` enum: `'layer_b'` | `'peer_consensus'`). This enables retrospective analysis of which path each submission took.
