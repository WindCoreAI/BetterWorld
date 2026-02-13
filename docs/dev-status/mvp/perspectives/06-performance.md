# Deep Scan: Performance & Scalability

**Perspective:** N+1 queries, indexing, caching, connection pools, hot-path optimization
**Agent:** a87ea38
**Date:** 2026-02-13

---

## CRITICAL ISSUES

### 1. N+1 Query Pattern in Evaluation Routes
**File:** `apps/api/src/routes/evaluations.routes.ts` (lines 74-123)

The `GET /evaluations/pending` endpoint fetches evaluations, then uses `Promise.all()` with a loop that queries DB for **each evaluation individually**. With 100 evaluations, this is 100+ sequential database queries.

**Impact:** High latency spike on busy validators; potential for cascading timeouts.

**Fix:** Use `inArray()` to batch-fetch all submissions in 1-3 queries. Cache submission details in Redis for 15min TTL.

---

### 2. Debate Thread Depth Walkback (Loop Inside Request)
**File:** `apps/api/src/routes/debates.routes.ts` (lines 27-43)

`getThreadDepth()` walks the parentDebateId chain one-by-one. For a 5-level deep thread: **5 round-trips to database**.

**Impact:** Each debate POST pays O(depth) query cost.

**Fix:**
- Add a `thread_depth` denormalized column, updated via trigger
- Or use PostgreSQL recursive CTEs (single query)
- Cache depth result in Redis for 1 hour

---

## HIGH-PRIORITY ISSUES

### 3. Geographic Haversine Formula in Hot Path
**File:** `apps/api/src/routes/missions/index.ts` (lines 434-443)

Haversine distance calculation (trig functions) runs for every mission in marketplace browse. No index support.

**Impact:** 10-50ms per query with 1000 missions.

**Fix:**
- Migrate to PostGIS `geography(Point, 4326)` type
- Create GIST index
- Use `ST_DWithin()` — drops query to 1-5ms

### 4. Leaderboard Cache Strategy
**File:** `apps/api/src/lib/leaderboard-cache.ts` (lines 40-84)

Serializes entire 100-entry leaderboard to JSON string on every cache miss. No cache stampede protection.

**Impact:** Thundering herd on leaderboard generation; 1-2s query.

**Fix:** Use Redis ZSET, add cache lock (SETNX), pre-compute hourly in worker.

### 5. Missing LIMIT on Aggregation Queries
**File:** `apps/api/src/lib/metrics-aggregator.ts` (lines 79-93)

Domain breakdown query has no LIMIT — could scan entire table if custom domains added.

**Fix:** Add `.limit(50)` or use domain enum validation.

### 6. SELECT * in Multiple Routes
Multiple route files fetch all columns when only 5-10 are needed. Problematic with large JSONB/binary fields.

**Fix:** Use explicit `.select({ id, title, domain, ... })` in list routes.

### 7. Debate Pagination Filtering After Fetch
**File:** `apps/api/src/routes/debates.routes.ts` (lines 121-126)

Fetches `limit+1` rows, then filters in JavaScript. Pagination breaks silently — users see incomplete lists.

**Fix:** Move filter to WHERE clause based on agent identity.

---

## MEDIUM-PRIORITY ISSUES

### 8. Mission Expiration Worker: N Transactions
Each expired mission updated in a separate transaction.

**Fix:** Batch update all expired missions in single transaction.

### 9. Redis Connection Pooling
**File:** `apps/api/src/lib/container.ts` (line 21)

No explicit connection pool size. Fine for <10K concurrent users, bottleneck at 50K+ QPS.

### 10. PostgreSQL Connection String Missing Pool Settings
**File:** `apps/api/src/lib/container.ts` (lines 12-14)

Missing max, min, connection_timeout settings.

### 11. Cache Stampede on Heatmap Aggregation
**File:** `apps/api/src/routes/impact/index.ts` (lines 54-99)

First request after cache expiry triggers full rebuild. Spikes on expiry.

**Fix:** Use probabilistic early expiration or background worker.

### 12. Overly Conservative Query Timeout
30s timeout is long for API requests (user timeout ~10s).

**Fix:** Use tiered timeouts: 10s for standard, 30s for admin/analytics.

---

## POSITIVE FINDINGS

1. **Cursor-based pagination everywhere** — avoiding offset
2. **Batch operations in workers** — limit + inArray()
3. **Explicit column selection** in most routes
4. **Transaction usage** — double-entry accounting, mission claims
5. **Rate limiting** — evidence submission, token spending
6. **Query indexing awareness** — FK indexes, status filters

---

## SUMMARY TABLE

| Issue | Severity | Impact | Effort |
|-------|----------|--------|--------|
| N+1 evaluations enrichment | Critical | 10-100x latency | 2h |
| Debate thread depth walkback | Critical | Lock contention | 3h |
| Haversine in hot path | High | 10-50ms per query | 2h |
| Leaderboard cache strategy | High | Cache stampede | 3h |
| Missing LIMIT on aggregation | High | Unbounded query | 1h |
| SELECT * in routes | High | 10-20% bandwidth waste | 4h |
| Debate pagination filtering | High | Silent pagination break | 1h |
| Mission expiration N txns | Medium | Lock contention | 1h |
| Redis connection pooling | Medium | Bottleneck at scale | 1h |
| PG connection pooling | Medium | Connection exhaustion | 1h |
| Heatmap cache stampede | Medium | User-facing latency | 2h |

## RECOMMENDED ACTION PLAN

**Week 1 (Critical):**
1. Fix N+1 in evaluations routes (3h)
2. Fix debate thread depth (3h)
3. Fix debate pagination (1h)

**Week 2 (High Impact):**
4. Add explicit column selection to list routes (4h)
5. Redesign leaderboard cache -> Redis ZSET (3h)
6. Migrate missions location to PostGIS geography (2h)

**Week 3 (Polish):**
7. Add LIMIT to aggregation queries (1h)
8. Batch update in mission expiration worker (1h)
9. Configure connection pooling (1h)
10. Implement cache stampede protection (2h)
