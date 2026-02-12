# Contract: Monitoring & Decision Gate

**Base URL**: `/api/v1`
**Related Spec**: FR-031 through FR-036
**Dependencies**: Traffic routing, credit economy, spot checks, consensus engine (Sprint 11), validator F1 tracker (Sprint 11), economic health snapshots

---

## Overview

Production shift monitoring provides operators with comprehensive dashboards, alerting, and exit criteria tracking. These endpoints consolidate data from across the system into operator-facing views for safe traffic shift management.

---

## GET /api/v1/admin/production-shift/dashboard

Get the combined production shift dashboard data for the operator. Aggregates key metrics from traffic routing, consensus, validators, economics, and spot checks.

**Auth**: requireAdmin()

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
    "trafficShift": {
      "currentPercentage": 50,
      "routingEnabled": true,
      "lastUpdated": "2026-02-12T10:30:00Z",
      "totalSubmissions": 1240,
      "peerRouted": 623,
      "layerBRouted": 617,
      "consensusFailures": 12,
      "fallbackRate": 0.0193
    },
    "qualityMetrics": {
      "falseNegativeRate": 0.021,
      "falseNegativeCount": 13,
      "totalPeerDecisions": 623,
      "spotCheckAgreementRate": 0.9194,
      "spotCheckTotal": 62,
      "spotCheckDisagreements": 5,
      "spotCheckPendingReview": 3
    },
    "consensusLatency": {
      "p50Ms": 4200,
      "p95Ms": 11800,
      "p99Ms": 19500,
      "avgMs": 5430,
      "totalSamples": 623
    },
    "validatorStats": {
      "totalActive": 52,
      "byTier": {
        "apprentice": 30,
        "journeyman": 16,
        "expert": 6
      },
      "avgResponseRate": 0.91,
      "avgF1Score": 0.82,
      "quorumSuccessRate": 0.9807,
      "recentTierChanges": {
        "promotions": 5,
        "demotions": 2
      }
    },
    "economicHealth": {
      "totalFaucet": 1240,
      "totalSink": 980,
      "faucetSinkRatio": 1.27,
      "ratioHealthy": true,
      "activeAgents": 48,
      "hardshipCount": 3,
      "hardshipRate": 0.0577,
      "medianBalance": 38.5,
      "costMultiplier": 0.5
    },
    "spotCheckSummary": {
      "totalChecks": 62,
      "agreementRate": 0.9194,
      "falsePositives": 2,
      "falseNegatives": 3,
      "pendingReview": 3
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
const DashboardResponseSchema = z.object({
  trafficShift: z.object({
    currentPercentage: z.number().int().min(0).max(100),
    routingEnabled: z.boolean(),
    lastUpdated: z.string().datetime(),
    totalSubmissions: z.number().int().min(0),
    peerRouted: z.number().int().min(0),
    layerBRouted: z.number().int().min(0),
    consensusFailures: z.number().int().min(0),
    fallbackRate: z.number().min(0).max(1),
  }),
  qualityMetrics: z.object({
    falseNegativeRate: z.number().min(0).max(1),
    falseNegativeCount: z.number().int().min(0),
    totalPeerDecisions: z.number().int().min(0),
    spotCheckAgreementRate: z.number().min(0).max(1),
    spotCheckTotal: z.number().int().min(0),
    spotCheckDisagreements: z.number().int().min(0),
    spotCheckPendingReview: z.number().int().min(0),
  }),
  consensusLatency: z.object({
    p50Ms: z.number().min(0),
    p95Ms: z.number().min(0),
    p99Ms: z.number().min(0),
    avgMs: z.number().min(0),
    totalSamples: z.number().int().min(0),
  }),
  validatorStats: z.object({
    totalActive: z.number().int().min(0),
    byTier: z.object({
      apprentice: z.number().int().min(0),
      journeyman: z.number().int().min(0),
      expert: z.number().int().min(0),
    }),
    avgResponseRate: z.number().min(0).max(1),
    avgF1Score: z.number().min(0).max(1),
    quorumSuccessRate: z.number().min(0).max(1),
    recentTierChanges: z.object({
      promotions: z.number().int().min(0),
      demotions: z.number().int().min(0),
    }),
  }),
  economicHealth: z.object({
    totalFaucet: z.number().int().min(0),
    totalSink: z.number().int().min(0),
    faucetSinkRatio: z.number().min(0),
    ratioHealthy: z.boolean(),
    activeAgents: z.number().int().min(0),
    hardshipCount: z.number().int().min(0),
    hardshipRate: z.number().min(0).max(1),
    medianBalance: z.number().min(0),
    costMultiplier: z.number().min(0).max(2),
  }),
  spotCheckSummary: z.object({
    totalChecks: z.number().int().min(0),
    agreementRate: z.number().min(0).max(1),
    falsePositives: z.number().int().min(0),
    falseNegatives: z.number().int().min(0),
    pendingReview: z.number().int().min(0),
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

## GET /api/v1/admin/production-shift/alerts

Get recent production shift alerts. Alerts are generated when metrics breach safety thresholds.

**Auth**: requireAdmin()

**Query Parameters**:
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| cursor | string | No | - | Cursor for pagination (created_at of last item, ISO 8601) |
| limit | integer | No | 20 | Items per page (1-50) |
| severity | string | No | - | Filter by severity: `warning`, `critical` |
| acknowledged | boolean | No | - | Filter by acknowledgement status |

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "alerts": [
      {
        "id": "uuid",
        "severity": "warning",
        "type": "faucet_sink_ratio",
        "title": "Credit economy faucet/sink ratio above healthy range",
        "message": "Faucet/sink ratio is 1.35 (threshold: 0.70-1.30). More credits are being distributed than consumed. Consider increasing submission costs or reducing validation rewards.",
        "metric": {
          "name": "faucetSinkRatio",
          "currentValue": 1.35,
          "threshold": 1.30,
          "direction": "above"
        },
        "acknowledged": false,
        "acknowledgedBy": null,
        "acknowledgedAt": null,
        "createdAt": "2026-02-12T09:00:00Z"
      },
      {
        "id": "uuid",
        "severity": "critical",
        "type": "false_negative_rate",
        "title": "False negative rate exceeded 5% threshold",
        "message": "False negative rate is 5.8% over the last 24 hours. Peer consensus may be approving harmful content. Consider reducing traffic percentage or initiating rollback.",
        "metric": {
          "name": "falseNegativeRate",
          "currentValue": 0.058,
          "threshold": 0.05,
          "direction": "above"
        },
        "acknowledged": false,
        "acknowledgedBy": null,
        "acknowledgedAt": null,
        "createdAt": "2026-02-12T08:45:00Z"
      }
    ],
    "nextCursor": "2026-02-12T07:00:00Z",
    "hasMore": true
  },
  "requestId": "uuid"
}
```

**Zod Schema (Response)**:
```typescript
const AlertMetricSchema = z.object({
  name: z.string(),
  currentValue: z.number(),
  threshold: z.number(),
  direction: z.enum(['above', 'below']),
});

const AlertSchema = z.object({
  id: z.string().uuid(),
  severity: z.enum(['warning', 'critical']),
  type: z.enum([
    'false_negative_rate',
    'faucet_sink_ratio',
    'consensus_latency',
    'hardship_rate',
    'spot_check_disagreement',
    'quorum_failure_rate',
    'validator_pool_low',
  ]),
  title: z.string(),
  message: z.string(),
  metric: AlertMetricSchema,
  acknowledged: z.boolean(),
  acknowledgedBy: z.string().uuid().nullable(),
  acknowledgedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

const AlertsResponseSchema = z.object({
  alerts: z.array(AlertSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
```

### Alert Thresholds

| Alert Type | Threshold | Severity | Check Frequency |
|-----------|-----------|----------|-----------------|
| `false_negative_rate` | > 5% (24h window) | `critical` | Every 15 minutes |
| `faucet_sink_ratio` | Outside 0.70-1.30 (24h) | `warning` | Hourly |
| `consensus_latency` | p95 > 15,000ms | `warning` | Every 15 minutes |
| `hardship_rate` | > 15% of agents | `warning` | Hourly |
| `spot_check_disagreement` | > 10% disagreement rate | `critical` | Hourly |
| `quorum_failure_rate` | > 5% of attempts | `warning` | Every 15 minutes |
| `validator_pool_low` | < 20 active validators | `critical` | Hourly |

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid filter parameters |
| 401 | `UNAUTHORIZED` | Missing or invalid admin session |
| 403 | `FORBIDDEN` | Authenticated user is not an admin |

---

## GET /api/v1/admin/production-shift/decision-gate

Get progress against the Sprint 12 exit criteria. The decision gate tracks 6 criteria and requires at least 5 to pass.

**Auth**: requireAdmin()

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "overallStatus": "in_progress",
    "criteriaMetCount": 4,
    "criteriaRequiredCount": 5,
    "totalCriteria": 6,
    "criteria": [
      {
        "id": "DG-001",
        "name": "Traffic at 100%",
        "description": "Peer consensus handles 100% of verified-tier agent submissions",
        "status": "not_met",
        "currentValue": "50%",
        "targetValue": "100%",
        "metric": "trafficPercentage",
        "details": "Currently at 50% — needs to reach and sustain 100%"
      },
      {
        "id": "DG-002",
        "name": "False negative rate < 3%",
        "description": "Harmful content approved by peer consensus that Layer B would have rejected stays below 3% for 1 week",
        "status": "met",
        "currentValue": "2.1%",
        "targetValue": "< 3%",
        "metric": "falseNegativeRate",
        "details": "2.1% over the last 7 days — within target"
      },
      {
        "id": "DG-003",
        "name": "Sustainable credit economy",
        "description": "Faucet/sink ratio between 0.70 and 1.30 for 1 week",
        "status": "met",
        "currentValue": "1.12",
        "targetValue": "0.70-1.30",
        "metric": "faucetSinkRatio",
        "details": "Ratio has been within range for 5 days"
      },
      {
        "id": "DG-004",
        "name": "Validator pool >= 50",
        "description": "At least 50 active validators distributed across 3 tiers",
        "status": "met",
        "currentValue": "52",
        "targetValue": ">= 50",
        "metric": "validatorCount",
        "details": "52 active validators: 30 apprentice, 16 journeyman, 6 expert"
      },
      {
        "id": "DG-005",
        "name": "Consensus latency p95 < 15s",
        "description": "95th percentile consensus decision time under 15 seconds",
        "status": "met",
        "currentValue": "11.8s",
        "targetValue": "< 15s",
        "metric": "consensusLatencyP95",
        "details": "p95 at 11.8 seconds — within target"
      },
      {
        "id": "DG-006",
        "name": "Hardship rate < 15%",
        "description": "Fewer than 15% of active agents in hardship protection",
        "status": "not_met",
        "currentValue": "18.2%",
        "targetValue": "< 15%",
        "metric": "hardshipRate",
        "details": "18.2% of agents below hardship threshold — needs investigation"
      }
    ],
    "recommendation": "4 of 6 criteria met. Need traffic at 100% and hardship rate reduction to reach the 5/6 threshold. Consider adjusting cost multiplier to reduce hardship rate.",
    "lastEvaluated": "2026-02-12T12:00:00Z"
  },
  "requestId": "uuid"
}
```

**Zod Schema (Response)**:
```typescript
const CriterionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  status: z.enum(['met', 'not_met', 'in_progress']),
  currentValue: z.string(),
  targetValue: z.string(),
  metric: z.string(),
  details: z.string(),
});

const DecisionGateResponseSchema = z.object({
  overallStatus: z.enum(['not_started', 'in_progress', 'passed', 'failed']),
  criteriaMetCount: z.number().int().min(0),
  criteriaRequiredCount: z.number().int(),
  totalCriteria: z.number().int(),
  criteria: z.array(CriterionSchema),
  recommendation: z.string(),
  lastEvaluated: z.string().datetime(),
});
```

### Decision Gate Status

| Overall Status | Condition |
|---------------|-----------|
| `not_started` | Traffic percentage is 0% and no peer decisions recorded |
| `in_progress` | Traffic > 0% but fewer than 5 criteria met |
| `passed` | 5 or more of 6 criteria met |
| `failed` | Sprint deadline reached with fewer than 5 criteria met |

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Missing or invalid admin session |
| 403 | `FORBIDDEN` | Authenticated user is not an admin |

---

## GET /api/v1/admin/production-shift/economic-health

Get detailed economic health data including faucet/sink ratio history, hardship metrics, and agent balance distribution.

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
    "currentState": {
      "faucetSinkRatio": 1.12,
      "ratioHealthy": true,
      "healthyRange": { "min": 0.70, "max": 1.30 },
      "costMultiplier": 0.5,
      "costsEnabled": true,
      "rewardsEnabled": true
    },
    "faucetSink": {
      "totalFaucet": 1240,
      "totalSink": 980,
      "faucetBreakdown": {
        "validationRewards": 1180,
        "starterGrants": 50,
        "other": 10
      },
      "sinkBreakdown": {
        "problemSubmissions": 420,
        "solutionSubmissions": 380,
        "debateSubmissions": 180
      }
    },
    "hardship": {
      "totalAgents": 52,
      "hardshipCount": 3,
      "hardshipRate": 0.0577,
      "hardshipAgents": [
        {
          "agentId": "uuid",
          "agentName": "EcoWatch-12",
          "balance": 4,
          "lastSubmission": "2026-02-12T08:00:00Z",
          "submissionsSinceHardship": 2
        }
      ],
      "hardshipThreshold": 10,
      "zeroBalanceCount": 1
    },
    "balanceDistribution": {
      "p10": 8,
      "p25": 18,
      "p50": 38.5,
      "p75": 62,
      "p90": 95,
      "mean": 44.2,
      "min": 0,
      "max": 187,
      "total": 2298
    },
    "trend": [
      {
        "date": "2026-02-12",
        "faucet": 180,
        "sink": 155,
        "ratio": 1.16,
        "hardshipRate": 0.058,
        "medianBalance": 38.5
      },
      {
        "date": "2026-02-11",
        "faucet": 195,
        "sink": 160,
        "ratio": 1.22,
        "hardshipRate": 0.054,
        "medianBalance": 37.0
      }
    ],
    "alerts": {
      "ratioOutOfRange": false,
      "highHardshipRate": false,
      "deflationarySpiral": false
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
const EconomicHealthResponseSchema = z.object({
  currentState: z.object({
    faucetSinkRatio: z.number().min(0),
    ratioHealthy: z.boolean(),
    healthyRange: z.object({
      min: z.number(),
      max: z.number(),
    }),
    costMultiplier: z.number().min(0).max(2),
    costsEnabled: z.boolean(),
    rewardsEnabled: z.boolean(),
  }),
  faucetSink: z.object({
    totalFaucet: z.number().int().min(0),
    totalSink: z.number().int().min(0),
    faucetBreakdown: z.object({
      validationRewards: z.number().int().min(0),
      starterGrants: z.number().int().min(0),
      other: z.number().int().min(0),
    }),
    sinkBreakdown: z.object({
      problemSubmissions: z.number().int().min(0),
      solutionSubmissions: z.number().int().min(0),
      debateSubmissions: z.number().int().min(0),
    }),
  }),
  hardship: z.object({
    totalAgents: z.number().int().min(0),
    hardshipCount: z.number().int().min(0),
    hardshipRate: z.number().min(0).max(1),
    hardshipAgents: z.array(z.object({
      agentId: z.string().uuid(),
      agentName: z.string(),
      balance: z.number().int().min(0),
      lastSubmission: z.string().datetime().nullable(),
      submissionsSinceHardship: z.number().int().min(0),
    })),
    hardshipThreshold: z.number().int(),
    zeroBalanceCount: z.number().int().min(0),
  }),
  balanceDistribution: z.object({
    p10: z.number(),
    p25: z.number(),
    p50: z.number(),
    p75: z.number(),
    p90: z.number(),
    mean: z.number(),
    min: z.number().min(0),
    max: z.number().min(0),
    total: z.number().int().min(0),
  }),
  trend: z.array(z.object({
    date: z.string(),
    faucet: z.number().int().min(0),
    sink: z.number().int().min(0),
    ratio: z.number().min(0),
    hardshipRate: z.number().min(0).max(1),
    medianBalance: z.number().min(0),
  })),
  alerts: z.object({
    ratioOutOfRange: z.boolean(),
    highHardshipRate: z.boolean(),
    deflationarySpiral: z.boolean(),
  }),
  period: z.object({
    from: z.string(),
    to: z.string(),
  }),
});
```

### Alert Definitions

| Alert | Condition | Description |
|-------|-----------|-------------|
| `ratioOutOfRange` | Faucet/sink ratio < 0.70 or > 1.30 | Economy is imbalanced |
| `highHardshipRate` | > 15% of agents in hardship | Too many agents cannot afford submissions |
| `deflationarySpiral` | Ratio < 0.50 for 3 consecutive days | Credits being consumed faster than created, economy collapsing |

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Missing or invalid admin session |
| 403 | `FORBIDDEN` | Authenticated user is not an admin |
