# Quickstart: Phase 3 Sprint 11 — Shadow Mode

**Branch**: `012-phase3-shadow-mode`
**Prerequisites**: Sprint 10 (Foundation) complete, all 944+ tests passing

---

## Development Setup

```bash
# 1. Switch to feature branch
git checkout 012-phase3-shadow-mode

# 2. Install dependencies
pnpm install --frozen-lockfile

# 3. Start infrastructure (PostgreSQL 16 + PostGIS + Redis 7)
docker compose up -d

# 4. Run existing migrations (Sprint 10 foundation tables required)
pnpm --filter @betterworld/db db:migrate

# 5. Generate new migration for Sprint 11 schema changes
pnpm --filter @betterworld/db db:generate

# 6. Apply Sprint 11 migration
pnpm --filter @betterworld/db db:migrate

# 7. Seed validator pool (if not already populated from Sprint 10)
pnpm --filter @betterworld/db db:seed

# 8. Start API server (port 4000)
pnpm --filter @betterworld/api dev

# 9. Start workers (in separate terminal)
pnpm --filter @betterworld/api dev:workers

# 10. Start frontend (port 3000)
pnpm --filter @betterworld/web dev
```

---

## Key Environment Variables

```env
# Existing (from Sprint 10)
DATABASE_URL=postgresql://betterworld:betterworld_dev@localhost:5432/betterworld
REDIS_URL=redis://localhost:6379

# Feature flags — enable shadow mode
PHASE3_PEER_VALIDATION_ENABLED=true
PHASE3_PEER_VALIDATION_TRAFFIC_PCT=0

# Consensus configuration
PEER_CONSENSUS_QUORUM_SIZE=3
PEER_CONSENSUS_OVER_ASSIGN=6
PEER_CONSENSUS_EXPIRY_MINUTES=30
PEER_CONSENSUS_APPROVE_THRESHOLD=0.67
```

---

## Implementation Order

### Phase A: Core Pipeline (P1 — Stories 1-3)

1. **Evaluation Assignment Service** (`apps/api/src/services/evaluation-assignment.ts`)
   - Validator selection algorithm (filter, exclude, boost, stratify)
   - Creates `peer_evaluations` records with `status: pending`
   - Sends WebSocket notifications

2. **Evaluation API Routes** (`apps/api/src/routes/evaluations.routes.ts`)
   - GET /pending — cursor-paginated pending evaluations
   - POST /:id/respond — submit evaluation with validation
   - GET /:id — evaluation details

3. **Consensus Engine** (`apps/api/src/services/consensus-engine.ts`)
   - Triggered on evaluation response when quorum met
   - Weighted voting: tier_weight × confidence
   - Advisory lock for idempotency
   - Writes to `consensus_results`

4. **Shadow Pipeline Integration** (`apps/api/src/workers/guardrail-worker.ts`)
   - After Layer B completes → enqueue peer consensus job
   - Pass Layer B decision for shadow comparison
   - Feature flag gate: `PEER_VALIDATION_ENABLED`

5. **Timeout Worker** (`apps/api/src/workers/evaluation-timeout.ts`)
   - 60s repeating schedule
   - Expire stale evaluations
   - Trigger escalation if quorum not met

### Phase B: Tracking & Monitoring (P2 — Stories 4-6)

6. **F1 Score Tracking** (`apps/api/src/services/f1-tracker.ts`)
   - Rolling window (last 100 evals) per validator
   - Tier promotion/demotion logic
   - Called after consensus computation

7. **Agreement Dashboard API** (`apps/api/src/routes/admin/shadow.ts`)
   - Agreement rates (overall, by domain, by type)
   - Disagreement breakdown
   - Latency percentiles

8. **Validator Affinity API** (`apps/api/src/routes/validator.routes.ts`)
   - PATCH /affinity — update home regions
   - GET /stats — validator statistics

### Phase C: Frontend & Dashboards (P2-P3 — Stories 5-7)

9. **Agreement Dashboard UI** (`apps/web/src/app/admin/shadow/`)
   - Agreement rate charts
   - Domain/type breakdown tables
   - Latency histograms

10. **Validator Affinity Settings** (`apps/web/src/app/validator/`)
    - City search/autocomplete
    - Home region management

11. **City Dashboards** (`apps/web/src/app/city/`)
    - City selector
    - Problem metrics by category
    - Heatmap (Leaflet + leaflet.heat)

### Phase D: Integration & Testing

12. **Integration Tests** (15+ new tests)
    - Full shadow pipeline flow
    - Consensus edge cases
    - F1 tracking and tier changes
    - Timeout handling

13. **Worker Registration** (`apps/api/src/workers/all-workers.ts`)
    - Add peer-consensus, evaluation-timeout, city-metrics workers

---

## Verification Commands

```bash
# Run all tests
pnpm test

# Run Sprint 11 specific tests
pnpm --filter @betterworld/api test -- --grep "shadow\|consensus\|evaluation\|validator"

# Check TypeScript
pnpm typecheck

# Lint
pnpm lint

# Verify feature flags
curl http://localhost:4000/api/v1/admin/feature-flags

# Enable shadow mode
curl -X PUT http://localhost:4000/api/v1/admin/feature-flags/PEER_VALIDATION_ENABLED \
  -H "Content-Type: application/json" -d '{"value": true}'

# Check agreement dashboard
curl http://localhost:4000/api/v1/admin/shadow/agreement

# Check validator pool
curl http://localhost:4000/api/v1/admin/shadow/validators
```

---

## File Map (New Files)

```
apps/api/src/
├── routes/
│   ├── evaluations.routes.ts     # Evaluation CRUD (pending, respond, details)
│   ├── validator.routes.ts       # Validator stats, affinity, tier-history
│   ├── city.routes.ts            # City dashboard endpoints (public)
│   └── admin/
│       └── shadow.ts             # Agreement dashboard, latency, validators
├── services/
│   ├── evaluation-assignment.ts  # Validator selection algorithm
│   ├── consensus-engine.ts       # Weighted voting + shadow comparison
│   ├── f1-tracker.ts             # Rolling F1/precision/recall + tier mgmt
│   └── agreement-stats.ts        # Agreement stats + pipeline health
├── workers/
│   ├── peer-consensus.ts         # Per-submission consensus orchestration
│   ├── evaluation-timeout.ts     # 60s scheduled expiry + daily count reset
│   └── city-metrics.ts           # Daily city aggregation worker

apps/web/src/
├── app/
│   ├── admin/shadow/
│   │   └── page.tsx              # Agreement dashboard
│   ├── validator/
│   │   └── affinity/page.tsx     # Home region settings
│   └── city/
│       ├── page.tsx              # City selector page
│       └── [city]/page.tsx       # City dashboard with heatmap
├── components/
│   ├── AgreementChart.tsx        # Agreement rate visualization
│   ├── LatencyHistogram.tsx      # Consensus latency distribution
│   ├── ValidatorTierBadge.tsx    # Tier display component
│   └── CityHeatmap.tsx           # Leaflet heatmap for city dashboard

packages/shared/src/
├── constants/
│   ├── queue.ts                  # +3 queue names
│   ├── consensus.ts              # Tier weights, quorum config, thresholds
│   └── cities.ts                 # Supported cities config
├── types/
│   └── shadow.ts                 # Evaluation, consensus, validator types
└── schemas/
    └── evaluation.ts             # Zod schemas for evaluation API

packages/db/src/schema/
├── validatorPool.ts              # +home_regions JSONB column
└── validatorTierChanges.ts       # Tier change history log
```
