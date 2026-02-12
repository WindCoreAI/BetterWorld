# Quickstart: Phase 3 Foundation (Sprint 10)

**Branch**: `011-phase3-foundation`
**Prerequisites**: Phase 2 complete (944+ tests passing), Docker running (PostgreSQL + Redis)

---

## Setup

### 1. Switch to feature branch

```bash
git checkout 011-phase3-foundation
pnpm install --frozen-lockfile
```

### 2. Enable PostGIS in local database

Add to `scripts/init-db.sql` (alongside existing extensions):

```sql
CREATE EXTENSION IF NOT EXISTS "postgis";
```

Or run directly:

```bash
docker exec -it betterworld-db psql -U postgres -d betterworld -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

### 3. Run migrations

```bash
pnpm --filter db generate    # Generate migration from schema changes
pnpm --filter db migrate     # Apply migration
```

### 4. Environment variables

Add to `.env` (all defaults are safe — Phase 3 features are disabled):

```bash
# Phase 3 Feature Flags (all default to disabled, managed via Redis at runtime)
# These env vars serve as fallback when Redis is unavailable

# Open311 API (optional — only if Portland requires auth)
# OPEN311_PORTLAND_API_KEY=
# OPEN311_CHICAGO_API_KEY=
```

No additional env vars are required. Feature flags default to `false`/`0` and are managed via the admin API + Redis.

### 5. Start services

```bash
pnpm dev          # Start API (port 4000) + web (port 3000)
pnpm dev:worker   # Start workers (includes new municipal-ingest worker)
```

---

## Verify Installation

### Check PostGIS is enabled

```bash
docker exec -it betterworld-db psql -U postgres -d betterworld -c "SELECT PostGIS_Version();"
```

Expected: `3.x.x` (any 3.x version)

### Check new tables exist

```bash
docker exec -it betterworld-db psql -U postgres -d betterworld -c "\dt *validator*; \dt *observation*; \dt *credit*; \dt *consensus*; \dt *dispute*; \dt *cluster*; \dt *peer_eval*;"
```

### Check system agent exists

```bash
docker exec -it betterworld-db psql -U postgres -d betterworld -c "SELECT id, username, framework FROM agents WHERE username = 'system-municipal-311';"
```

### Run tests

```bash
pnpm test                           # All tests (should be 960+)
pnpm --filter api test              # API tests only
pnpm --filter api test -- credits   # Agent credit tests
pnpm --filter api test -- open311   # Open311 ingestion tests
pnpm --filter api test -- observation  # Observation tests
```

---

## Key Development Tasks

### Agent Credit System

**Files to work with**:
- Schema: `packages/db/src/schema/agentCreditTransactions.ts`
- Service: `apps/api/src/services/agent-credit.service.ts`
- Routes: `apps/api/src/routes/agents/credits.ts`

**Core pattern** — Atomic credit operation:
```typescript
await db.transaction(async (tx) => {
  // 1. Lock agent row
  const [agent] = await tx.execute(
    sql`SELECT id, credit_balance FROM agents WHERE id = ${agentId} FOR UPDATE`
  );
  const balanceBefore = agent.credit_balance;
  const balanceAfter = balanceBefore + amount;
  // 2. Validate (balanceAfter >= 0)
  if (balanceAfter < 0) throw new Error('Insufficient balance');
  // 3. Insert transaction record (double-entry: balanceBefore/balanceAfter per Constitution Principle IV)
  await tx.insert(agentCreditTransactions).values({
    agentId, amount, balanceBefore, balanceAfter, transactionType, ...
  });
  // 4. Update balance atomically
  await tx.execute(sql`UPDATE agents SET credit_balance = ${balanceAfter} WHERE id = ${agentId}`);
});
```

### Open311 Ingestion

**Files to work with**:
- Service: `apps/api/src/services/open311.service.ts`
- Worker: `apps/api/src/workers/municipal-ingest.ts`
- Config: `packages/shared/src/constants.ts` (city configs + service code mappings)

**Worker pattern** — BullMQ repeatable job:
```typescript
const queue = new Queue('municipal-ingest', { connection: redis });
// Per-city repeatable job
await queue.add('ingest-chicago', { cityId: 'chicago' }, {
  repeat: { every: 15 * 60 * 1000 }, // 15 minutes
});
```

### Observation Submission

**Files to work with**:
- Schema: `packages/db/src/schema/observations.ts`
- Service: `apps/api/src/services/observation.service.ts`
- Routes: `apps/api/src/routes/observations/index.ts`
- GPS helpers: `apps/api/src/lib/geo-helpers.ts`

**GPS validation rules**:
1. Reject null island: `lat === 0 && lng === 0`
2. Reject polar: `Math.abs(lat) > 80`
3. Reject low accuracy: `gpsAccuracyMeters > 1000`
4. Proximity check: `ST_Distance(obs, problem) < problem.radiusMeters + gpsAccuracy`

### Feature Flags

**Files to work with**:
- Service: `apps/api/src/services/feature-flags.ts`
- Routes: `apps/api/src/routes/admin/phase3.ts`

**Usage in code**:
```typescript
import { getFlag } from '../services/feature-flags';

const isEnabled = await getFlag(redis, 'HYPERLOCAL_INGESTION_ENABLED');
if (!isEnabled) return; // Skip if feature disabled
```

### Hyperlocal Scoring

**File**: `apps/api/src/services/hyperlocal-scoring.ts`

**Scoring formula**:
- Hyperlocal (neighborhood/city): urgency×0.30 + actionability×0.30 + feasibility×0.25 + demand×0.15
- Global/country: impact×0.40 + feasibility×0.35 + costEfficiency×0.25 (unchanged)

---

## Testing Strategy

### Unit tests to write
- Agent credit service: earn, debit, starter grant, idempotency, negative balance rejection
- GPS validation: null island, polar, accuracy, proximity
- Open311 transform: service code mapping, field extraction, dedup
- Hyperlocal scoring: weight validation, scope detection, edge cases
- Feature flags: Redis read/write, env var fallback, cache invalidation

### Integration tests to write
- Full credit flow: register agent → starter grant → check balance
- Open311 ingestion: mock API → transform → guardrail → published
- Observation submission: auth → validate GPS → store → link to problem
- Feature flag toggle: admin sets flag → feature activates/deactivates
- PostGIS queries: spatial data → ST_DWithin returns correct results

### Run the full test suite before PR
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

---

## Architecture Notes

- **PostGIS columns**: Use `customType` in Drizzle schema, raw `sql` for queries. See [research.md](research.md#r1-postgis-in-drizzle-orm).
- **Feature flags**: Redis-backed with env var fallback. See [research.md](research.md#r3-feature-flag-implementation).
- **Credit accounting**: Simplified (no balanceBefore/balanceAfter). `agents.credit_balance` is authoritative. Daily reconciliation job verifies `SUM(amount) = credit_balance`.
- **Open311**: Generic client + per-city adapters. Chicago primary, Portland experimental. See [research.md](research.md#r2-open311-api-integration).
