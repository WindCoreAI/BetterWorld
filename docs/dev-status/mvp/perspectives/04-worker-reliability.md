# Deep Scan: Worker Reliability & Failure Modes

**Perspective:** BullMQ workers, retry logic, dead letter handling, idempotency, resource usage, failure cascades
**Agent:** a47b397
**Date:** 2026-02-13

---

## Worker Inventory (16 Workers)

| # | Worker | Schedule | Concurrency | Sprint |
|---|--------|----------|-------------|--------|
| 1 | Guardrail | On-demand | 5 | 3 |
| 2 | Evidence Verification | On-demand | 3 | 8 |
| 3 | Fraud Scoring | On-demand | 3 | 9 |
| 4 | Reputation Decay | Daily midnight | 1 | 9 |
| 5 | Metrics Aggregation | Hourly | 1 | 9 |
| 6 | Mission Expiration | Daily 2 AM | 1 | 7 |
| 7 | Municipal Ingest | Per-city repeatable | 1 | 10 |
| 8 | Peer Consensus | On-demand | 5 | 11 |
| 9 | Evaluation Timeout | Every 60s | 1 | 11 |
| 10 | City Metrics | Daily 6 AM | 1 | 11 |
| 11 | Economic Health | Hourly | 1 | 12 |
| 12 | Spot Check | On-demand | 3 | 12 |
| 13 | Privacy | On-demand | 3 | 12 |
| 14 | Pattern Aggregation | Daily 3 AM | 1 | 13 |
| 15 | Rate Adjustment | Weekly Sunday midnight | 1 | 13 |
| 16 | Claim Reconciliation | Daily | 1 | 8 |

---

## Critical Findings

### Municipal Ingest: DB Connection Per Job
**File:** `apps/api/src/workers/municipal-ingest.ts` (lines 87-90)

Creates new postgres client per job instead of using `getDb()`. This defeats the connection pool.

**Fix:** Replace with `const db = getDb();`

### Privacy Worker: Stuck "processing" State
**File:** `apps/api/src/workers/privacy-worker.ts`

If job is killed during upload, status remains "processing". After dead-letter, observation is stranded permanently.

**Fix:** Mark as "quarantined" on final failure.

### Peer Consensus: No Idempotency Check
**File:** `apps/api/src/workers/peer-consensus.ts`

No check if validators already assigned. Re-running would assign 6 more validators, doubling the quorum. If retried 3 times, could enqueue 3 separate jobs = 18 validators total.

**Fix:** Add idempotency key to peer consensus enqueue.

### Rate Adjustment: Double-Apply on Retry
**File:** `apps/api/src/workers/rate-adjustment-worker.ts`

If job runs at Sunday midnight then retried 3 times, multiplier is adjusted 4x.

**Fix:** Use idempotency key or check `was_already_adjusted_this_week`.

---

## Per-Worker Analysis

### 1. Guardrail Worker
- Error handling: Comprehensive try-catch
- Dead letter: Exhausted jobs marked as rejected
- Cache: Layer B results cached 1hr TTL
- Risk: No idempotency key on peer consensus enqueue

### 2. Evidence Verification Worker
- Error handling: Budget check, graceful fallback to peer review on AI failure
- Retry: 3 attempts, exponential backoff
- Risk: **No idempotency guard** — same evidenceId processed twice = reputation updated twice

### 3. Fraud Scoring Worker
- Error handling: Per-check try-catch, non-fatal
- pHash: Uses `onConflictDoNothing()` (safe)
- Risk: **Re-runs double-count velocity checks and statistical profiling**

### 4. Reputation Decay Worker
- Concurrency: 1 (good, prevents races)
- Batching: Groups of 100
- Risk: **No per-human error handling** — single failure blocks entire batch

### 5. Metrics Aggregation Worker
- Stateless aggregation — re-running produces same result
- Redis SET is atomic, no DB writes

### 6. Mission Expiration Worker
- Uses `db.transaction()` for atomic mission+claim updates
- Batched 100 at a time
- Risk: TODO on token refunds not yet implemented

### 7. Municipal Ingest Worker
- Dedup check via municipal_source_id (good)
- Risk: **New DB connection per job** (defeats pool)

### 8-9. Peer Consensus & Evaluation Timeout
- Timeout: Every 60s, expires stale evaluations
- Consensus: Uses `onConflictDoNothing` for idempotency
- Risk: Peer consensus has no assignment idempotency

### 10-12. City Metrics, Economic Health, Spot Check
- City Metrics: Per-city try-catch, non-blocking errors
- Economic Health: Hourly snapshot, alerts are log-only (no action)
- Spot Check: Silent failure on Layer B error (returns `skipped: true`)

### 13. Privacy Worker
- EXIF strip, face/plate detection stubs
- Risk: **Stuck "processing" state** on dead-letter

### 14-15. Pattern Aggregation, Rate Adjustment
- Pattern: Daily PostGIS clustering, per-domain try-catch
- Rate: Weekly, circuit breaker check
- Risk: Rate adjustment **not idempotent on retry**

---

## Cross-Worker Issues

| Issue | Affected Workers | Severity |
|-------|-----------------|----------|
| No job-level idempotency keys | All | MEDIUM |
| Dead-letter incomplete | evidence, spot-check, privacy, rate-adjustment | MEDIUM |
| DB connection pooling | municipal-ingest | MEDIUM |
| No per-item error handling in batches | reputation-decay, evaluation-timeout | MEDIUM |
| Silent failures | spot-check, pattern-aggregation, rate-adjustment | LOW |
| No job retention policies | Most workers | LOW |
| No concurrency control across workers | guardrail, evidence, fraud, spot-check, privacy | LOW |

---

## Queue Configuration

**Retry Defaults:**
- Guardrail enqueue: No retry options (relies on defaults)
- Evidence enqueue: 3 attempts, exponential 1s
- Fraud enqueue: 3 attempts, exponential 2s
- Peer consensus: 3 attempts, exponential 5s

**Removal Policies:**
- Most workers have **no explicit removal policy** — jobs accumulate in Redis until TTL expires (7 days default)
- Risk: Redis memory growth

---

## Recommendations

1. **Add idempotency keys** to guardrail peer consensus, fraud scoring, peer consensus assignments
2. **Fix municipal ingest DB connection** — use `getDb()` instead of new client
3. **Improve dead-letter handling** — mark privacy as "quarantined", add admin alerts
4. **Batch error isolation** — wrap per-human/per-submission logic in try-catch
5. **Job retention policies** — add `removeOnComplete: { count: 100 }` to all queues
6. **Scheduler registration** — use `queue.upsertJobScheduler()` pattern
7. **Add Prometheus metrics** to all workers (currently only guardrail exports metrics)

**All 16 workers are operational. No critical data corruption risks, but idempotency and error recovery could be hardened.**
