# API Contract: Evidence Verification

**Base Path**: `/api/v1/evidence`
**Auth**: Human auth (humanAuth middleware) -- evidence owner only

All responses use standard envelope: `{ ok: boolean, data?: T, error?: { code: string, message: string, details?: unknown }, meta?: {...}, requestId: string }`

---

## GET /api/v1/evidence/:evidenceId/status

Get detailed verification status for an evidence submission.

**Auth**: Human auth (humanAuth middleware) -- must be evidence owner

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| evidenceId | uuid | Evidence submission ID |

### Response: 200 OK

```json
{
  "ok": true,
  "data": {
    "verificationStage": "peer_review",
    "aiVerificationScore": 0.87,
    "aiVerificationReasoning": "Image shows completed tree planting activity consistent with mission requirements. GPS coordinates within 500m of mission location. Timestamp aligns with claim period.",
    "peerReviewCount": 2,
    "peerReviewsNeeded": 3,
    "peerVerdict": null,
    "finalVerdict": null,
    "finalConfidence": null,
    "rewardAmount": null
  },
  "requestId": "uuid"
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| verificationStage | enum | Current stage: `pending`, `ai_review`, `peer_review`, `verified`, `rejected`, `appealed`, `admin_review` |
| aiVerificationScore | decimal \| null | AI confidence score (0.00-1.00), null if not yet reviewed |
| aiVerificationReasoning | string \| null | AI explanation of score, null if not yet reviewed |
| peerReviewCount | integer | Number of peer reviews completed |
| peerReviewsNeeded | integer | Total peer reviews required (default 3) |
| peerVerdict | enum \| null | Aggregated peer verdict: `approve`, `reject`, null if insufficient reviews |
| finalVerdict | enum \| null | Final outcome: `verified`, `rejected`, null if still in progress |
| finalConfidence | decimal \| null | Weighted confidence (0.00-1.00): `aiScore * 0.4 + peerConfidence * 0.6` |
| rewardAmount | integer \| null | Token reward distributed (only if `verified`) |

### Verification Stage Transitions

| From | To | Trigger |
|------|----|---------|
| pending | ai_review | Evidence submission queued |
| ai_review | peer_review | AI score >= 0.30 (passes minimum threshold) |
| ai_review | rejected | AI score < 0.30 (auto-reject, clear fraud/irrelevant) |
| peer_review | verified | finalConfidence >= 0.60 and peerVerdict = "approve" |
| peer_review | rejected | finalConfidence < 0.60 or peerVerdict = "reject" |
| rejected | appealed | Owner submits appeal |
| appealed | admin_review | Appeal queued for admin |
| admin_review | verified | Admin approves |
| admin_review | rejected | Admin rejects (final, no further appeal) |

### Errors

| Code | Status | Condition |
|------|--------|-----------|
| UNAUTHORIZED | 401 | Not authenticated |
| FORBIDDEN | 403 | Not the evidence owner |
| NOT_FOUND | 404 | Evidence not found |

---

## POST /api/v1/evidence/:evidenceId/appeal

Appeal a rejected evidence submission. Moves evidence to admin review queue.

**Auth**: Human auth (humanAuth middleware) -- must be evidence owner
**Rate Limit**: 3 appeals per day per human (Redis sliding window)

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| evidenceId | uuid | Evidence submission ID |

### Request Body

```json
{
  "reason": "string (20-2000 chars)"
}
```

### Validation Rules

- Evidence `finalVerdict` must be `rejected`
- Evidence must not have been previously appealed (one appeal per evidence)
- `reason` minimum 20 characters to ensure substantive appeal
- Human must be the evidence owner (claim owner)

### Response: 201 Created

```json
{
  "ok": true,
  "data": {
    "evidenceId": "uuid",
    "newStage": "appealed"
  },
  "requestId": "uuid"
}
```

### Side Effects

1. Evidence `verificationStage` updated to `appealed`
2. Appeal reason stored in `verificationAuditLog`
3. `finalVerdict` reset to `null` (pending admin review)
4. BullMQ job queued: `evidence:admin-review` with `{ evidenceId }`
5. WebSocket event emitted: `evidence:appealed` with `{ evidenceId, missionId }`

### Errors

| Code | Status | Condition |
|------|--------|-----------|
| UNAUTHORIZED | 401 | Not authenticated |
| FORBIDDEN | 403 | Not the evidence owner, or evidence not in `rejected` state |
| NOT_FOUND | 404 | Evidence not found |
| CONFLICT | 409 | Evidence already appealed (one appeal allowed) |
| VALIDATION_ERROR | 422 | Reason too short or missing |
| RATE_LIMITED | 429 | 3 appeals/day limit exceeded |
