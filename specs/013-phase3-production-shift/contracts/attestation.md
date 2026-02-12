# Contract: Community Attestation

**Base URL**: `/api/v1`
**Related Spec**: FR-025 through FR-027
**Dependencies**: Problems table, human auth (Sprint 6), hyperlocal scoring engine (Sprint 10)

---

## Overview

Community members can attest to the current real-world status of reported problems. Attestations provide crowdsourced ground truth that feeds into the hyperlocal urgency scoring engine. Each human can attest once per problem. Accumulating attestations (3+ of the same type) trigger urgency score adjustments.

### Attestation Types

| Type | Meaning | Urgency Impact |
|------|---------|----------------|
| `confirmed` | "I have seen this problem at this location" | +10% urgency when 3+ confirmations |
| `resolved` | "This problem appears to be fixed" | Flags problem for resolved review |
| `not_found` | "I visited the location and could not find this problem" | Flags problem for accuracy review |

---

## POST /api/v1/problems/:problemId/attestations

Submit an attestation for a problem's current status.

**Auth**: humanAuth()

**Path Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| problemId | UUID | The problem being attested |

**Request Body**:
```json
{
  "statusType": "confirmed"
}
```

**Zod Schema (Request)**:
```typescript
const CreateAttestationRequestSchema = z.object({
  statusType: z.enum(['confirmed', 'resolved', 'not_found']),
});
```

**Validation Rules**:
- `statusType`: required, one of `confirmed` | `resolved` | `not_found`
- One attestation per human per problem (enforced by unique constraint)
- Problem must exist and not be in `rejected` status

**Response** `201`:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "problemId": "uuid",
    "humanId": "uuid",
    "statusType": "confirmed",
    "createdAt": "2026-02-12T14:00:00Z",
    "attestationCounts": {
      "confirmed": 3,
      "resolved": 0,
      "notFound": 0
    },
    "urgencyImpact": {
      "applied": true,
      "reason": "3 confirmed attestations reached — urgency score increased by 10%",
      "previousUrgencyScore": 0.72,
      "newUrgencyScore": 0.792
    }
  },
  "requestId": "uuid"
}
```

**Response** `201` (no urgency impact yet):
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "problemId": "uuid",
    "humanId": "uuid",
    "statusType": "confirmed",
    "createdAt": "2026-02-12T14:00:00Z",
    "attestationCounts": {
      "confirmed": 2,
      "resolved": 0,
      "notFound": 0
    },
    "urgencyImpact": {
      "applied": false,
      "reason": "2 of 3 confirmations needed to affect urgency score",
      "previousUrgencyScore": null,
      "newUrgencyScore": null
    }
  },
  "requestId": "uuid"
}
```

**Zod Schema (Response)**:
```typescript
const AttestationResponseSchema = z.object({
  id: z.string().uuid(),
  problemId: z.string().uuid(),
  humanId: z.string().uuid(),
  statusType: z.enum(['confirmed', 'resolved', 'not_found']),
  createdAt: z.string().datetime(),
  attestationCounts: z.object({
    confirmed: z.number().int().min(0),
    resolved: z.number().int().min(0),
    notFound: z.number().int().min(0),
  }),
  urgencyImpact: z.object({
    applied: z.boolean(),
    reason: z.string(),
    previousUrgencyScore: z.number().min(0).max(1).nullable(),
    newUrgencyScore: z.number().min(0).max(1).nullable(),
  }),
});
```

### Side Effects

When 3+ attestations of the same type accumulate:

| Attestation Type | Side Effect |
|-----------------|-------------|
| `confirmed` (3+) | Problem `urgency_score` increased by 10% (capped at 1.0) |
| `resolved` (3+) | Problem flagged for review as potentially resolved (admin notification) |
| `not_found` (3+) | Problem flagged for accuracy review (admin notification) |

The urgency score update uses the hyperlocal scoring engine from Sprint 10. The 10% increase is multiplicative: `newScore = Math.min(1.0, currentScore * 1.10)`.

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid statusType |
| 401 | `UNAUTHORIZED` | Missing or invalid human session |
| 404 | `NOT_FOUND` | Problem not found |
| 409 | `DUPLICATE_ATTESTATION` | Human has already attested to this problem |
| 422 | `INVALID_PROBLEM_STATUS` | Problem is in `rejected` status and cannot receive attestations |

**Error Response** `409`:
```json
{
  "ok": false,
  "error": {
    "code": "DUPLICATE_ATTESTATION",
    "message": "You have already attested to this problem. Use DELETE to remove your attestation before submitting a new one."
  },
  "requestId": "uuid"
}
```

---

## GET /api/v1/problems/:problemId/attestations

Get attestation counts and the authenticated user's attestation for a problem.

**Auth**: humanAuth() (optional -- unauthenticated users see counts but not their own attestation)

**Path Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| problemId | UUID | The problem |

**Response** `200` (authenticated):
```json
{
  "ok": true,
  "data": {
    "problemId": "uuid",
    "counts": {
      "confirmed": 5,
      "resolved": 1,
      "notFound": 0,
      "total": 6
    },
    "userAttestation": {
      "id": "uuid",
      "statusType": "confirmed",
      "createdAt": "2026-02-12T14:00:00Z"
    },
    "thresholdsMet": {
      "confirmed": true,
      "resolved": false,
      "notFound": false
    }
  },
  "requestId": "uuid"
}
```

**Response** `200` (unauthenticated or user has not attested):
```json
{
  "ok": true,
  "data": {
    "problemId": "uuid",
    "counts": {
      "confirmed": 5,
      "resolved": 1,
      "notFound": 0,
      "total": 6
    },
    "userAttestation": null,
    "thresholdsMet": {
      "confirmed": true,
      "resolved": false,
      "notFound": false
    }
  },
  "requestId": "uuid"
}
```

**Zod Schema (Response)**:
```typescript
const UserAttestationSchema = z.object({
  id: z.string().uuid(),
  statusType: z.enum(['confirmed', 'resolved', 'not_found']),
  createdAt: z.string().datetime(),
});

const AttestationCountsResponseSchema = z.object({
  problemId: z.string().uuid(),
  counts: z.object({
    confirmed: z.number().int().min(0),
    resolved: z.number().int().min(0),
    notFound: z.number().int().min(0),
    total: z.number().int().min(0),
  }),
  userAttestation: UserAttestationSchema.nullable(),
  thresholdsMet: z.object({
    confirmed: z.boolean(),
    resolved: z.boolean(),
    notFound: z.boolean(),
  }),
});
```

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | Problem not found |

---

## DELETE /api/v1/problems/:problemId/attestations

Remove the authenticated user's attestation from a problem. This allows them to submit a different attestation type.

**Auth**: humanAuth()

**Path Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| problemId | UUID | The problem |

**Request Body**: None (empty body)

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "deleted": true,
    "problemId": "uuid",
    "previousStatusType": "confirmed",
    "attestationCounts": {
      "confirmed": 4,
      "resolved": 1,
      "notFound": 0
    },
    "urgencyImpact": {
      "recalculated": false,
      "reason": "Remaining 4 confirmed attestations still meet threshold"
    }
  },
  "requestId": "uuid"
}
```

**Response** `200` (deletion causes count to drop below threshold):
```json
{
  "ok": true,
  "data": {
    "deleted": true,
    "problemId": "uuid",
    "previousStatusType": "confirmed",
    "attestationCounts": {
      "confirmed": 2,
      "resolved": 0,
      "notFound": 0
    },
    "urgencyImpact": {
      "recalculated": true,
      "reason": "Confirmed attestations dropped below 3 — urgency score bonus removed"
    }
  },
  "requestId": "uuid"
}
```

**Zod Schema (Response)**:
```typescript
const DeleteAttestationResponseSchema = z.object({
  deleted: z.boolean(),
  problemId: z.string().uuid(),
  previousStatusType: z.enum(['confirmed', 'resolved', 'not_found']),
  attestationCounts: z.object({
    confirmed: z.number().int().min(0),
    resolved: z.number().int().min(0),
    notFound: z.number().int().min(0),
  }),
  urgencyImpact: z.object({
    recalculated: z.boolean(),
    reason: z.string(),
  }),
});
```

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Missing or invalid human session |
| 404 | `NOT_FOUND` | No attestation found for this user on this problem |
