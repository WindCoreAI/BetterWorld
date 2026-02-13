# Quickstart: Phase 3 Integration (Sprint 13)

**Branch**: `014-phase3-integration` | **Date**: 2026-02-13

## Prerequisites

- Node.js 22+, pnpm 9+
- PostgreSQL 16 with PostGIS extension
- Redis 7+
- Local dev environment running (API port 4000, Web port 3000)
- All 1096 existing tests passing

## Getting Started

### 1. Switch to feature branch

```bash
git checkout 014-phase3-integration
pnpm install
```

### 2. Run database migration

```bash
# Generate migration from Drizzle schema changes
pnpm --filter @betterworld/db generate

# Apply migration to local PostgreSQL
pnpm --filter @betterworld/db migrate
```

### 3. Start development servers

```bash
# Terminal 1: API server
pnpm --filter @betterworld/api dev

# Terminal 2: Web frontend
pnpm --filter @betterworld/web dev

# Terminal 3: Workers (required for rate adjustment, pattern aggregation, evidence review)
pnpm --filter @betterworld/api dev:worker
```

### 4. Run tests

```bash
# All tests
pnpm test

# Sprint 13 specific tests
pnpm --filter @betterworld/api test -- --grep "dispute|rate-adjust|evidence-review|domain-spec|hybrid-quorum|pattern|denver|cross-city|offline"
```

## Development Order

Follow this order to minimize dependencies and unblock frontend work early:

### Phase A: Credit Economy (Days 1-4)

1. **DB Schema**: Add `disputes`, `rate_adjustments`, `evidence_review_assignments` tables + new enums to `packages/db/src/schema/`
2. **Migration**: Generate and apply `0012_phase3_integration`
3. **Dispute Service**: `apps/api/src/services/dispute.service.ts`
   - `fileDispute(db, redis, agentId, consensusResultId, reason)` — validates eligibility, deducts stake
   - `resolveDispute(db, disputeId, verdict, adminNotes, adminId)` — handles refund/forfeit
   - `checkDisputeSuspension(db, validatorId)` — rolling 30-day window check
4. **Rate Adjustment Service**: `apps/api/src/services/rate-adjustment.service.ts`
   - `calculateFaucetSinkRatio(db, periodDays)` — trailing window calculation
   - `applyRateAdjustment(db, redis, ratio)` — update feature flags + log
   - `checkCircuitBreaker(redis)` — consecutive day check
5. **Routes + Tests**: Wire up endpoints, write tests for each service

### Phase B: Validator Enhancements (Days 5-7)

1. **Evidence Review Service**: `apps/api/src/services/evidence-review.service.ts`
   - `assignEvidenceReviewers(db, evidenceId, evidenceType)` — capability-based assignment
   - `submitEvidenceReview(db, reviewId, recommendation, confidence, reasoning)` — review + reward
2. **Domain Specialization**: `apps/api/src/services/domain-specialization.ts`
   - `updateDomainScore(db, validatorId, domain, isCorrect)` — per-eval update
   - `checkSpecialistDesignation(db, validatorId, domain)` — threshold check
3. **Hybrid Quorum**: Modify `apps/api/src/services/evaluation-assignment.ts`
   - Update candidate selection: 2 local + 1 global for hyperlocal
4. **Consensus Weight**: Modify `apps/api/src/services/consensus-engine.ts`
   - Specialist 1.5x multiplier on domain match
5. **Reward Bonus**: Modify `apps/api/src/services/validation-reward.service.ts`
   - Local validator 1.5x reward

### Phase C: Hyperlocal Intelligence (Days 8-10)

1. **Pattern Aggregation**: `apps/api/src/services/pattern-aggregation.ts`
   - `findClusters(db, domain, city)` — spatial + category + similarity clustering
   - `generateClusterSummary(problems)` — Claude Sonnet tool_use
2. **Pattern Worker**: `apps/api/src/workers/pattern-aggregation-worker.ts` — daily cron
3. **Denver Config**: Add to `packages/shared/src/constants/phase3.ts`
4. **Cross-City Service**: `apps/api/src/services/cross-city.service.ts`
5. **Routes + Tests**: Pattern routes, cross-city routes

### Phase D: Offline PWA (Days 11-12)

1. **PWA Manifest**: `apps/web/public/manifest.json`
2. **Service Worker**: `apps/web/public/sw.js` (Workbox)
3. **Offline Queue**: IndexedDB-based observation queue with Background Sync
4. **Frontend Components**: Install prompt, offline indicator, queue status

### Phase E: Polish (Days 13-14)

1. Integration tests (15+ new)
2. Performance optimization (PostGIS indexes, Redis caching)
3. TypeScript + ESLint zero errors
4. Update documentation

## Key Patterns to Follow

### Double-Entry Credit Transactions

```typescript
// Always use SELECT FOR UPDATE + balance_before/balance_after
await db.transaction(async (tx) => {
  const [agent] = await tx.select().from(agents)
    .where(eq(agents.id, agentId))
    .for("update");

  const newBalance = agent.creditBalance - stakeAmount;
  await tx.update(agents).set({ creditBalance: newBalance });
  await tx.insert(agentCreditTransactions).values({
    agentId, type: "spend_dispute_stake", amount: -stakeAmount,
    balanceBefore: agent.creditBalance, balanceAfter: newBalance,
    idempotencyKey: `dispute:${disputeId}`,
  });
});
```

### Feature Flag Reading

```typescript
import { readFlag } from "../lib/feature-flags.js";
const multiplier = await readFlag(redis, "SUBMISSION_COST_MULTIPLIER", parseFloat) ?? 1.0;
```

### BullMQ Worker Pattern

```typescript
const worker = new Worker("rate-adjustment", async (job) => {
  const db = getDb();
  try {
    // ... job logic
  } finally {
    // cleanup if needed
  }
}, {
  connection: getRedis(),
  concurrency: 1,
});
```

### PostGIS Distance Query

```typescript
// Check if validator is within 50km of problem
const isLocal = await db.execute(sql`
  SELECT ST_DWithin(
    ${validatorPool.homeRegionPoint}::geography,
    ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
    50000
  ) AS within
`);
```

## Environment Variables

No new environment variables required. All new features use existing infrastructure:
- Redis feature flags (PEER_VALIDATION_TRAFFIC_PCT, SUBMISSION_COST_MULTIPLIER, etc.)
- Existing database connection
- Existing BullMQ queue connection
- Existing Anthropic API key (for pattern summary generation)

## New Feature Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| DISPUTE_ENABLED | boolean | false | Enable dispute filing |
| RATE_ADJUSTMENT_ENABLED | boolean | false | Enable weekly auto-adjustment |
| RATE_ADJUSTMENT_PAUSED | boolean | false | Circuit breaker pause flag |
| EVIDENCE_REVIEW_ENABLED | boolean | false | Enable evidence review assignment |
| PATTERN_AGGREGATION_ENABLED | boolean | false | Enable daily pattern clustering |
| VALIDATION_REWARD_MULTIPLIER | float | 1.0 | Current reward rate multiplier |
| HYBRID_QUORUM_ENABLED | boolean | false | Enable domain specialist preference in quorum |
| OFFLINE_PWA_ENABLED | boolean | false | Enable service worker registration for PWA |
