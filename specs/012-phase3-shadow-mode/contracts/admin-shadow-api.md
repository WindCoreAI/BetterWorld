# API Contract: Admin Shadow Mode Dashboard

**Base path**: `/api/v1/admin`
**Auth**: Admin session (requireAdmin middleware)

---

## GET /api/v1/admin/shadow/agreement

Get shadow mode agreement statistics between peer consensus and Layer B.

**Auth**: Admin

**Query Parameters**:
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| fromDate | string (YYYY-MM-DD) | No | 7 days ago | Start of analysis window |
| toDate | string (YYYY-MM-DD) | No | today | End of analysis window |

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "overall": {
      "totalSubmissions": 523,
      "agreements": 437,
      "disagreements": 86,
      "agreementRate": 0.8356,
      "peerApproveLayerBReject": 31,
      "peerRejectLayerBApprove": 55
    },
    "byDomain": [
      {
        "domain": "environmental_protection",
        "totalSubmissions": 45,
        "agreements": 39,
        "agreementRate": 0.8667
      }
    ],
    "bySubmissionType": [
      {
        "submissionType": "problem",
        "totalSubmissions": 280,
        "agreements": 241,
        "agreementRate": 0.8607
      },
      {
        "submissionType": "solution",
        "totalSubmissions": 178,
        "agreements": 142,
        "agreementRate": 0.7978
      },
      {
        "submissionType": "debate",
        "totalSubmissions": 65,
        "agreements": 54,
        "agreementRate": 0.8308
      }
    ],
    "period": {
      "from": "2026-02-04",
      "to": "2026-02-11"
    }
  },
  "requestId": "uuid"
}
```

---

## GET /api/v1/admin/shadow/latency

Get consensus latency distribution metrics.

**Auth**: Admin

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
    "consensusLatency": {
      "p50Ms": 4200,
      "p95Ms": 12800,
      "p99Ms": 22100,
      "avgMs": 5430,
      "totalSamples": 523
    },
    "validatorResponseTime": {
      "p50Ms": 180000,
      "p95Ms": 720000,
      "p99Ms": 1500000,
      "avgMs": 295000,
      "totalResponses": 2891
    },
    "quorumStats": {
      "totalAttempts": 523,
      "quorumMet": 498,
      "quorumTimeout": 25,
      "quorumSuccessRate": 0.9522
    }
  },
  "requestId": "uuid"
}
```

---

## GET /api/v1/admin/shadow/validators

Get validator pool overview for shadow mode monitoring.

**Auth**: Admin

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "total": 28,
    "active": 25,
    "suspended": 3,
    "byTier": {
      "apprentice": 15,
      "journeyman": 8,
      "expert": 2
    },
    "withHomeRegions": 12,
    "avgF1Score": 0.7823,
    "avgResponseRate": 0.89,
    "tierChanges": {
      "promotions": 3,
      "demotions": 1,
      "since": "2026-02-04"
    }
  },
  "requestId": "uuid"
}
```



> **Note**: City dashboard endpoints have been moved to [city-api.md](city-api.md) — they are public endpoints, not admin-scoped.
```
