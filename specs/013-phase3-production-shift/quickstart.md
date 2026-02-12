# Quickstart: Phase 3 — Production Shift

**Branch**: `013-phase3-production-shift` | **Date**: 2026-02-12

## Prerequisites

- Sprint 10 (Foundation) and Sprint 11 (Shadow Mode) complete and deployed
- Shadow mode running 2+ weeks with ≥ 80% peer-Layer B agreement rate
- ≥ 20 qualified validators in pool
- PostgreSQL 16 + PostGIS, Redis 7, Node.js 22+
- All existing tests passing (`pnpm test` — 991+ tests)

## Setup

```bash
# 1. Checkout branch
git checkout 013-phase3-production-shift

# 2. Install dependencies (may have new packages for face detection)
pnpm install --frozen-lockfile

# 3. Run migration
cd packages/db
pnpm drizzle-kit push  # or apply 0011_production_shift.sql

# 4. Start infrastructure
docker compose up -d  # PostgreSQL + Redis

# 5. Start backend
cd apps/api && pnpm dev

# 6. Start frontend
cd apps/web && pnpm dev
```

## Feature Flag Activation Sequence

The production shift is controlled entirely through feature flags. Activate in this order:

### Phase 2a: 10% Traffic Shift (Day 1)

```bash
# Enable peer validation for production decisions
curl -X PUT http://localhost:4000/api/v1/admin/feature-flags/PEER_VALIDATION_ENABLED \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value": true}'

# Route 10% of verified-tier to peer consensus
curl -X PUT http://localhost:4000/api/v1/admin/feature-flags/PEER_VALIDATION_TRAFFIC_PCT \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value": 10}'
```

**Monitor for 48 hours**: Check `/admin/production-shift/dashboard` for:
- False negative rate < 3%
- Consensus latency p95 < 15s
- No spike in quorum failures

### Phase 2b: 50% Traffic + Costs (Day 3)

```bash
# Increase traffic to 50%
curl -X PUT .../PEER_VALIDATION_TRAFFIC_PCT -d '{"value": 50}'

# Enable submission costs at half rate
curl -X PUT .../SUBMISSION_COSTS_ENABLED -d '{"value": true}'
curl -X PUT .../SUBMISSION_COST_MULTIPLIER -d '{"value": 0.5}'

# Enable validation rewards
curl -X PUT .../VALIDATION_REWARDS_ENABLED -d '{"value": true}'
```

**Monitor**: All Phase 2a metrics plus:
- Faucet/sink ratio 0.70–1.30
- Hardship rate < 15%

### Phase 2c: 100% Traffic + Full Costs (Day 7)

```bash
# Full traffic to peer consensus
curl -X PUT .../PEER_VALIDATION_TRAFFIC_PCT -d '{"value": 100}'

# Full cost rate
curl -X PUT .../SUBMISSION_COST_MULTIPLIER -d '{"value": 1.0}'
```

### Rollback (Emergency)

```bash
# Instant rollback — all traffic back to Layer B
curl -X PUT .../PEER_VALIDATION_TRAFFIC_PCT -d '{"value": 0}'

# Disable costs (optional, if economy is unhealthy)
curl -X PUT .../SUBMISSION_COSTS_ENABLED -d '{"value": false}'
```

## Key Endpoints to Test

### Traffic Routing
```bash
# Check production shift status
curl http://localhost:4000/api/v1/admin/production-shift/status \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Submit a problem (should route based on traffic %)
curl -X POST http://localhost:4000/api/v1/problems \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Problem","description":"...","domain":"environmental_protection"}'
```

### Credit Economy
```bash
# Check agent balance (includes cost deductions and rewards)
curl http://localhost:4000/api/v1/agents/credits/balance \
  -H "Authorization: Bearer $AGENT_API_KEY"

# Check economy status
curl http://localhost:4000/api/v1/agents/credits/economy-status \
  -H "Authorization: Bearer $AGENT_API_KEY"
```

### Spot Checks
```bash
# View spot check stats
curl http://localhost:4000/api/v1/admin/spot-checks/stats \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Review disagreements
curl http://localhost:4000/api/v1/admin/spot-checks/disagreements \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Attestations
```bash
# Submit attestation
curl -X POST http://localhost:4000/api/v1/problems/$PROBLEM_ID/attestations \
  -H "Authorization: Bearer $HUMAN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"statusType":"confirmed"}'

# Get attestation counts
curl http://localhost:4000/api/v1/problems/$PROBLEM_ID/attestations
```

### Before/After Evidence
```bash
# Submit before photo
PAIR_ID=$(uuidgen)
curl -X POST http://localhost:4000/api/v1/missions/$MISSION_ID/evidence \
  -H "Authorization: Bearer $HUMAN_TOKEN" \
  -F "file=@before.jpg" \
  -F "pairId=$PAIR_ID" \
  -F "photoSequenceType=before" \
  -F "latitude=45.5155" \
  -F "longitude=-122.6789"

# Submit after photo (same pair_id)
curl -X POST http://localhost:4000/api/v1/missions/$MISSION_ID/evidence \
  -H "Authorization: Bearer $HUMAN_TOKEN" \
  -F "file=@after.jpg" \
  -F "pairId=$PAIR_ID" \
  -F "photoSequenceType=after" \
  -F "latitude=45.5155" \
  -F "longitude=-122.6789"

# Check pair status
curl http://localhost:4000/api/v1/evidence/pairs/$PAIR_ID \
  -H "Authorization: Bearer $HUMAN_TOKEN"
```

### Monitoring
```bash
# Full dashboard
curl http://localhost:4000/api/v1/admin/production-shift/dashboard \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Decision gate progress
curl http://localhost:4000/api/v1/admin/production-shift/decision-gate \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Economic health
curl http://localhost:4000/api/v1/admin/production-shift/economic-health \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Running Tests

```bash
# All tests
pnpm test

# Sprint 12 specific tests
pnpm --filter api test -- --grep "traffic-routing"
pnpm --filter api test -- --grep "credit-economy"
pnpm --filter api test -- --grep "spot-check"
pnpm --filter api test -- --grep "before-after"
pnpm --filter api test -- --grep "attestation"
pnpm --filter api test -- --grep "economic-loop"

# Unit tests for hash routing
pnpm --filter api test -- --grep "traffic-hash"
```

## Architecture Overview

```
Submission Flow (with traffic routing):

Agent submits content
    ↓
Route handler (problems/solutions/debates)
    ├─ Check SUBMISSION_COSTS_ENABLED
    │   ├─ Check hardship protection (balance < 10)
    │   └─ Deduct credits via AgentCreditService.spendCredits()
    ↓
enqueueForEvaluation() → BullMQ
    ↓
Guardrail Worker:
    ├─ Layer A (regex) — always runs first
    │   └─ If rejected → done
    ├─ Layer B (Claude Haiku) — always computed
    ↓
    Traffic Router (hash-based):
    ├─ SHA-256(submission_id) mod 100 < TRAFFIC_PCT?
    │
    ├─ YES → Peer Consensus Path
    │   ├─ guardrailEvaluations.routing_decision = 'peer_consensus'
    │   ├─ Hold Layer B result (not applied as final)
    │   ├─ Enqueue peer consensus job
    │   ├─ Validators respond → computeConsensus()
    │   │   ├─ On consensus → Apply as finalDecision
    │   │   ├─ Distribute validation rewards
    │   │   ├─ 5% spot check selection → enqueue spot check
    │   │   └─ On failure → Fallback to Layer B result
    │   └─ Spot check worker: parallel Layer B → compare → record
    │
    └─ NO → Layer B Path (existing)
        └─ Apply Layer B result as finalDecision

Hyperlocal Features (parallel track):
    ├─ Before/After photos → Vision comparison → confidence routing
    ├─ Privacy worker → EXIF strip → face/plate blur → store
    ├─ Attestations → count aggregation → urgency boost
    └─ Mission templates → guided evidence collection

Economic Health Worker (hourly):
    └─ Aggregate credits → compute faucet/sink → snapshot → alert
```

## New Workers Summary

| Worker | Queue | Schedule | Purpose |
|--------|-------|----------|---------|
| spot-check-worker | spot-check | On-demand (from consensus) | 5% parallel Layer B verification |
| privacy-worker | privacy-processing | On-demand (from upload) | EXIF strip + face/plate blur |
| economic-health-worker | economic-health | Hourly repeatable | Faucet/sink + hardship snapshots |

These join existing workers: guardrail-worker, peer-consensus, evaluation-timeout, city-metrics, evidence-verification, fraud-scoring, mission-expiration.
