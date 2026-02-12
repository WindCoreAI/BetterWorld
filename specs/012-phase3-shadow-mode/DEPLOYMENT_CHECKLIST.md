# Sprint 11: Deployment Checklist

**Sprint**: Phase 3 Shadow Mode (012-phase3-shadow-mode)
**Date**: 2026-02-11
**Status**: Ready for validation and deployment

---

## Pre-Deployment Validation

### 1. Code Quality Checks ⏳

Run these commands in the project root:

```bash
cd /Users/zhiruifeng/Workspace/WindCore/BetterWorld

# Set up Node.js PATH (if needed)
export PATH="/opt/homebrew/Cellar/node@22/22.22.0/bin:$PATH"

# 1. Type checking (must pass with zero errors)
pnpm typecheck

# 2. Linting (must pass with zero errors)
pnpm lint

# 3. Build verification (must compile successfully)
pnpm build

# 4. Security audit (0 high/critical vulnerabilities allowed)
pnpm audit --audit-level=high
```

**Expected Results**:
- ✅ TypeScript: 0 errors
- ✅ ESLint: 0 errors
- ✅ Build: Success
- ✅ Audit: 0 high/critical vulnerabilities

---

### 2. Test Execution ⏳

```bash
# Run all tests
pnpm test

# Run integration tests specifically
pnpm --filter @betterworld/api test:integration

# Check test coverage
pnpm test -- --coverage
```

**Expected Results**:
- ✅ All 944+ tests passing
- ✅ New tests: 48+ shadow mode integration tests
- ✅ Coverage: >= 75% overall, >= 95% guardrails, >= 80% API

---

### 3. Database Migration ⏳

**CRITICAL**: Apply migration before deploying API changes.

```bash
# Generate migration (already done - verify it exists)
ls packages/db/drizzle/0010_sticky_kid_colt.sql

# Apply migration to local database
pnpm --filter @betterworld/db db:migrate

# Verify migration success
psql $DATABASE_URL -c "SELECT * FROM validator_tier_changes LIMIT 1;"
```

**Expected Results**:
- ✅ Migration file exists (0010_sticky_kid_colt.sql)
- ✅ Migration applies without errors
- ✅ New table `validator_tier_changes` exists
- ✅ `validator_pool.home_regions` column exists

---

### 4. Environment Configuration ⏳

Create/update environment variables:

```bash
# Feature Flags (Start with shadow mode DISABLED for safety)
PEER_VALIDATION_ENABLED=false

# Consensus Configuration (optional - defaults provided)
PEER_CONSENSUS_QUORUM_SIZE=3          # Min validators for consensus
PEER_CONSENSUS_OVER_ASSIGN=6          # Validators to assign per submission
EVALUATION_EXPIRY_MINUTES=30          # Evaluation expiry timeout
PEER_CONSENSUS_APPROVE_THRESHOLD=0.67 # Approval ratio threshold
PEER_CONSENSUS_REJECT_THRESHOLD=0.67  # Rejection ratio threshold
```

**Redis Configuration** (for feature flags):
```bash
# Connect to Redis
redis-cli -u $REDIS_URL

# Set feature flag (DISABLED initially)
SET "feature:PEER_VALIDATION_ENABLED" "false"
```

---

## Deployment Steps

### Step 1: Database Migration 🔴 **CRITICAL FIRST**

```bash
# Production database migration
DATABASE_URL=$PRODUCTION_DATABASE_URL pnpm --filter @betterworld/db db:migrate
```

**Verification**:
```sql
-- Verify new table exists
SELECT COUNT(*) FROM validator_tier_changes;

-- Verify column exists
SELECT home_regions FROM validator_pool LIMIT 1;
```

---

### Step 2: Validator Pool Backfill ⏳

Backfill qualifying agents into the validator pool:

```bash
# Option A: Via API endpoint (recommended)
curl -X POST https://api.betterworld.com/admin/validator-pool/backfill \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Option B: Via database script
psql $DATABASE_URL -f scripts/backfill-validator-pool.sql
```

**Expected Results**:
- ✅ Active + verified agents added to validator_pool
- ✅ Starting tier: apprentice
- ✅ Initial metrics: f1_score=0, precision=0, recall=0

---

### Step 3: Deploy API Changes ⏳

```bash
# Option A: Fly.io deployment
fly deploy --config fly.toml

# Option B: Manual deployment
docker build -t betterworld-api:shadow-mode .
docker push betterworld-api:shadow-mode
# ... deploy to your infrastructure
```

**Verification**:
```bash
# Check new routes are available
curl https://api.betterworld.com/api/v1/evaluations/pending \
  -H "Authorization: Bearer $VALIDATOR_TOKEN"

curl https://api.betterworld.com/api/v1/validator/stats \
  -H "Authorization: Bearer $VALIDATOR_TOKEN"
```

---

### Step 4: Deploy Workers ⏳

Ensure BullMQ workers are running:

```bash
# Check worker processes
pm2 list | grep -E "peer-consensus|evaluation-timeout"

# Or check logs
tail -f logs/peer-consensus-worker.log
tail -f logs/evaluation-timeout-worker.log
```

**Expected Worker Logs**:
```
[peer-consensus-worker] Peer consensus worker started (queue: peer-consensus, concurrency: 5)
[evaluation-timeout-worker] Evaluation timeout worker started (queue: evaluation-timeout, schedule: every 60s)
```

---

### Step 5: Enable Shadow Mode (Gradual Rollout) ⏳

**Phase 1: Monitoring Only (Week 1)**
```bash
# Keep feature flag DISABLED
# Monitor baseline metrics:
# - Layer B evaluation volume
# - Validator pool size
# - Queue depths
```

**Phase 2: Shadow Mode Enabled (Week 2)**
```bash
# Enable feature flag via Redis
redis-cli SET "feature:PEER_VALIDATION_ENABLED" "true"

# Or via admin API
curl -X POST https://api.betterworld.com/admin/feature-flags \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"flag": "PEER_VALIDATION_ENABLED", "value": true}'
```

**Phase 3: Monitor Shadow Results (Week 3-4)**
```bash
# Check consensus vs Layer B alignment
SELECT
  decision,
  COUNT(*) as count,
  AVG(CASE WHEN agrees_with_layer_b THEN 1 ELSE 0 END) as agreement_rate
FROM consensus_results
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY decision;

# Check validator metrics
SELECT
  tier,
  COUNT(*) as count,
  AVG(f1_score::numeric) as avg_f1,
  AVG(response_rate::numeric) as avg_response_rate
FROM validator_pool
WHERE is_active = true
GROUP BY tier;
```

---

## Post-Deployment Verification

### Health Checks ⏳

**API Health**:
```bash
# Ping health endpoint
curl https://api.betterworld.com/health

# Check worker status
curl https://api.betterworld.com/admin/workers/status \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Database Health**:
```sql
-- Check recent consensus results
SELECT id, decision, quorum_size, responses_received, created_at
FROM consensus_results
ORDER BY created_at DESC
LIMIT 10;

-- Check validator activity
SELECT
  tier,
  COUNT(*) as active_validators,
  SUM(daily_evaluation_count) as daily_evals
FROM validator_pool
WHERE is_active = true
GROUP BY tier;

-- Check peer evaluations
SELECT status, COUNT(*) as count
FROM peer_evaluations
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;
```

---

## Monitoring Setup

### Grafana Dashboards

Create dashboards for:

1. **Shadow Mode Pipeline**
   - Peer evaluations created/hour
   - Consensus decisions (approved/rejected/escalated)
   - Layer B alignment rate (%)
   - Quorum timeout rate (%)

2. **Validator Performance**
   - F1 score distribution by tier
   - Tier promotions/demotions per week
   - Daily evaluation quota utilization
   - Response rate by validator

3. **System Health**
   - Consensus computation latency (P50, P95, P99)
   - Evaluation assignment latency
   - F1 update latency
   - Worker queue depths

### Alerts

Set up alerts for:

```yaml
# Critical Alerts
- InsufficientValidatorsError > 10% of submissions (1hr window)
- Consensus latency P95 > 2s
- Evaluation timeout worker not running
- Peer consensus worker not running
- Database connection pool exhausted

# Warning Alerts
- Quorum timeout rate > 20%
- Layer B alignment rate < 60%
- Validator response rate < 50%
- F1 score avg < 0.70
```

---

## Rollback Plan

If issues are detected:

### Step 1: Disable Shadow Mode ⚡ **IMMEDIATE**

```bash
# Disable feature flag
redis-cli SET "feature:PEER_VALIDATION_ENABLED" "false"

# Verify Layer B still functioning
curl https://api.betterworld.com/api/v1/problems \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -d '{"title": "Test problem", ...}'
```

**Expected**: Layer B guardrail evaluation continues unaffected.

### Step 2: Stop Workers (If Needed)

```bash
pm2 stop peer-consensus-worker
pm2 stop evaluation-timeout-worker
```

### Step 3: Rollback Migration (If Database Issue)

```sql
-- Drop new table (only if absolutely necessary)
DROP TABLE IF EXISTS validator_tier_changes;

-- Remove new column (only if absolutely necessary)
ALTER TABLE validator_pool DROP COLUMN IF EXISTS home_regions;
```

**WARNING**: Only rollback migration if database is corrupted. Otherwise, leave schema changes in place.

---

## Success Criteria

### Week 1 (Shadow Mode Disabled - Baseline)
- [ ] API deployment successful (zero downtime)
- [ ] All services healthy (API, workers, database)
- [ ] New routes accessible (401/403 expected without auth)
- [ ] Validator pool backfilled (>= 10 validators)
- [ ] Baseline metrics established

### Week 2 (Shadow Mode Enabled - Monitoring)
- [ ] Feature flag enabled via Redis
- [ ] Peer evaluations created for submissions
- [ ] Consensus results logged with Layer B comparison
- [ ] No impact on Layer B routing decisions
- [ ] Zero InsufficientValidatorsError (or < 5%)

### Week 3-4 (Shadow Mode Production - Validation)
- [ ] Layer B alignment rate >= 70%
- [ ] Quorum timeout rate < 10%
- [ ] Validator F1 scores converging (avg >= 0.75)
- [ ] Tier promotions occurring (apprentice → journeyman)
- [ ] No performance degradation (API latency stable)

### Go/No-Go Decision Criteria

**GO**: Proceed to Phase 4 (hybrid decision-making)
- ✅ Layer B alignment >= 80%
- ✅ F1 score avg >= 0.80
- ✅ Response rate >= 70%
- ✅ Zero critical bugs

**NO-GO**: Extend shadow mode monitoring
- ❌ Layer B alignment < 70%
- ❌ High quorum timeout rate (> 20%)
- ❌ Validator pool too small (< 10 active)

---

## Troubleshooting

### Issue: InsufficientValidatorsError Frequent

**Symptoms**: Many submissions fail to get peer evaluations
**Diagnosis**:
```sql
SELECT COUNT(*) FROM validator_pool WHERE is_active = true;
SELECT agent_id, daily_evaluation_count, suspended_until
FROM validator_pool
WHERE is_active = false OR daily_evaluation_count >= 10;
```

**Solutions**:
1. Backfill more validators (lower qualification bar)
2. Increase daily quota (10 → 20)
3. Reset daily counts manually: `UPDATE validator_pool SET daily_evaluation_count = 0`

---

### Issue: Quorum Timeouts Frequent

**Symptoms**: Many consensus results with `escalation_reason='quorum_timeout'`
**Diagnosis**:
```sql
SELECT status, COUNT(*)
FROM peer_evaluations
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;
```

**Solutions**:
1. Reduce quorum size (3 → 2) via `PEER_CONSENSUS_QUORUM_SIZE`
2. Increase expiry time (30min → 60min) via `EVALUATION_EXPIRY_MINUTES`
3. Check validator response rate (may need to suspend non-responsive validators)

---

### Issue: Consensus Latency High

**Symptoms**: P95 latency > 2s for consensus computation
**Diagnosis**:
```sql
SELECT
  AVG(consensus_latency_ms) as avg_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY consensus_latency_ms) as p95_ms
FROM consensus_results
WHERE created_at > NOW() - INTERVAL '1 hour';
```

**Solutions**:
1. Check advisory lock contention: `SELECT * FROM pg_locks WHERE locktype = 'advisory'`
2. Optimize F1 rolling window query (add index on `responded_at`)
3. Increase database connection pool size

---

## Sign-Off

### Pre-Launch Checklist
- [ ] All validation tests passed (typecheck, lint, test, audit)
- [ ] Database migration applied successfully
- [ ] Validator pool backfilled
- [ ] Environment variables configured
- [ ] Monitoring dashboards created
- [ ] Alerts configured
- [ ] Rollback plan documented and tested

### Deployment Approval
- [ ] **Engineering Lead**: Code quality approved
- [ ] **Security Lead**: Security review completed
- [ ] **Product Lead**: Feature acceptance validated
- [ ] **DevOps Lead**: Infrastructure ready
- [ ] **Data Lead**: Monitoring configured

---

**Deployment Date**: _________________
**Deployed By**: _________________
**Rollback Decision Maker**: _________________
**24/7 On-Call**: _________________

---

**Status**: ⏳ **PENDING VALIDATION** → Run validation suite and migration before deployment
