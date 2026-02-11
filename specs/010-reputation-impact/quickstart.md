# Quickstart: Reputation & Impact System

**Branch**: `010-reputation-impact` | **Date**: 2026-02-11

## Prerequisites

- Node.js 22+, pnpm 9+
- Docker running (PostgreSQL 16 + Redis 7)
- All Sprint 6/7/8 tables migrated
- Environment variables configured (see below)

## Setup

### 1. Install new dependencies

```bash
# From repo root
pnpm install

# New packages needed:
# apps/api: sharp-phash (pHash generation)
# apps/web: leaflet.heat, @types/leaflet.heat
cd apps/api && pnpm add sharp-phash
cd apps/web && pnpm add leaflet.heat && pnpm add -D @types/leaflet.heat
```

### 2. Run database migrations

```bash
# Generate and run new migrations
cd packages/db
pnpm drizzle-kit generate
pnpm drizzle-kit migrate

# New tables created:
# - reputation_scores
# - reputation_history
# - streaks
# - endorsements
# - fraud_scores
# - fraud_events
# - fraud_admin_actions
# - evidence_phashes
# - humans.portfolio_visibility column added
```

### 3. Environment variables

No new secrets required. Existing env vars used:
```bash
# Already configured from previous sprints:
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
ANTHROPIC_API_KEY=sk-ant-...   # Claude Sonnet for evidence verification
JWT_SECRET=...
```

Optional tuning (all have sensible defaults):
```bash
# Reputation
REPUTATION_DECAY_PERCENT=2          # Weekly decay % (default: 2)
REPUTATION_DECAY_ACCELERATED=5      # After 90 days inactive (default: 5)
REPUTATION_GRACE_PERIOD_DAYS=7      # Tier demotion grace (default: 7)

# Fraud
FRAUD_FLAG_THRESHOLD=50             # Auto-flag score (default: 50)
FRAUD_SUSPEND_THRESHOLD=150         # Auto-suspend score (default: 150)
PHASH_DUPLICATE_THRESHOLD=6         # Hamming distance for duplicate (default: 6)
PHASH_SUSPICIOUS_THRESHOLD=10       # Hamming distance for flag (default: 10)

# Leaderboard
LEADERBOARD_CACHE_TTL=3600          # Redis TTL in seconds (default: 3600)
LEADERBOARD_TOP_N=100               # Max entries per leaderboard (default: 100)

# Aggregation
METRICS_AGGREGATION_INTERVAL=60     # Minutes between aggregation runs (default: 60)
```

### 4. Start services

```bash
# Terminal 1: Database + Redis (Docker)
docker compose up -d

# Terminal 2: API server
cd apps/api && pnpm dev

# Terminal 3: Workers (reputation + fraud + aggregation)
cd apps/api && pnpm tsx src/workers/reputation-decay.ts &
cd apps/api && pnpm tsx src/workers/fraud-scoring.ts &
cd apps/api && pnpm tsx src/workers/metrics-aggregation.ts &

# Terminal 4: Frontend
cd apps/web && pnpm dev
```

### 5. Seed test data (optional)

```bash
# Backfill reputation_scores, streaks, and fraud_scores for existing humans
cd packages/db && pnpm tsx src/seed/backfill-reputation.ts
```

## Verification

### Quick smoke test

```bash
# 1. Check reputation endpoint
curl http://localhost:4000/api/v1/reputation/tiers | jq

# 2. Check leaderboard (public)
curl "http://localhost:4000/api/v1/leaderboards/reputation?period=alltime&limit=10" | jq

# 3. Check Impact Dashboard (public)
curl http://localhost:4000/api/v1/impact/dashboard | jq

# 4. Check heatmap data (public)
curl http://localhost:4000/api/v1/impact/heatmap | jq

# 5. Check my reputation (requires auth token)
curl -H "Authorization: Bearer <JWT>" \
  http://localhost:4000/api/v1/reputation/me | jq

# 6. Check my streak
curl -H "Authorization: Bearer <JWT>" \
  http://localhost:4000/api/v1/streaks/me | jq

# 7. Check fraud admin queue (requires admin auth)
curl -H "Authorization: Bearer <ADMIN_JWT>" \
  http://localhost:4000/api/v1/admin/fraud/queue | jq
```

### Frontend pages

- Impact Dashboard: http://localhost:3000/impact
- Leaderboards: http://localhost:3000/leaderboards
- Portfolio: http://localhost:3000/portfolio/{humanId}

## Key Architecture Notes

### Workers

| Worker | Queue Name | Schedule | Concurrency |
|--------|-----------|----------|-------------|
| Reputation Decay | reputation-decay | Daily 00:00 UTC | 1 |
| Fraud Scoring | fraud-scoring | On evidence submission | 3 |
| Metrics Aggregation | metrics-aggregation | Every 60 min | 1 |
| (Existing) Guardrail Evaluation | guardrail-evaluation | On content submission | 5 |
| (Existing) Mission Expiration | mission-expiration | Daily 02:00 UTC | 1 |
| (Existing) Evidence AI Verify | evidence-ai-verify | On evidence submission | 3 |

### Reputation Calculation Triggers

Reputation is recalculated after these events:
1. Evidence verified (mission_quality factor update)
2. Peer review submitted (peer_accuracy factor update)
3. Streak milestone reached (streak factor update)
4. Endorsement received (endorsement factor update)
5. Daily decay job (for inactive humans)

### Token Multiplier Stack

Token rewards are multiplied by both tier and streak multipliers:
```
finalReward = baseReward × tierMultiplier × streakMultiplier
```
Example: 100 IT base × 1.2 (Advocate tier) × 1.25 (30-day streak) = 150 IT

### Redis Key Conventions

```
leaderboard:{type}:{period}:{domain}:{location}   # Sorted Set
metrics:aggregate:{metric}:{scope}                  # Hash
fraud:velocity:{humanId}:{tier}                     # Sorted Set
fraud:phash:{humanId}                               # Sorted Set
streak:last_active:{humanId}                        # String
```

## Testing

```bash
# Run all tests
pnpm test

# Run only new reputation tests
pnpm test -- --grep "reputation"

# Run fraud detection tests
pnpm test -- --grep "fraud"

# Run k6 load test (requires staging env)
k6 run k6/phase2-load-test.js
```
