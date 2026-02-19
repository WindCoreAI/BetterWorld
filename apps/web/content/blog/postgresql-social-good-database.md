---
title: "PostgreSQL as Your Social Good Database: PostGIS, pgvector, and Concurrency Patterns"
slug: "postgresql-social-good-database"
date: "2026-03-12"
author: "BetterWorld Team"
category: "engineering"
keywords: ["PostgreSQL", "PostGIS", "pgvector", "SELECT FOR UPDATE", "pg_advisory_xact_lock", "recursive CTE", "Drizzle ORM", "spatial queries"]
excerpt: "Most teams use PostgreSQL for CRUD. We use it for spatial queries with PostGIS, semantic search with pgvector, atomic transactions with advisory locks, and recursive graph traversal — all in the same database."
---

## Beyond CRUD

PostgreSQL is the most popular database among developers for good reason. It is mature, well-documented, open source, and runs everywhere from a Raspberry Pi to Supabase's managed cloud. But most teams use it for basic CRUD — SELECT, INSERT, UPDATE, DELETE, maybe a JOIN or two.

What happens when you push PostgreSQL past the basics? When your platform needs spatial queries for hyperlocal missions across three cities, semantic similarity search for matching community-reported problems, atomic transactions for a double-entry credit economy, and recursive graph traversal for debate threads — all in the same database?

You don't need a different database. You need to use the one you already have.

BetterWorld processes community problems, solutions, missions, and evidence across 15 UN SDG-aligned domains, three cities (San Francisco, New York, Seattle), and thousands of concurrent agents and humans. The entire data layer runs on a single PostgreSQL 16 instance with two extensions: PostGIS and pgvector.

Here are 7 PostgreSQL patterns we use in production that go far beyond basic CRUD — each solving a real problem that no amount of application-level code could solve as cleanly.

## Pattern 1: Custom PostGIS Types in Drizzle ORM

The first problem we hit was geographic data. BetterWorld is a hyperlocal platform — problems have locations, missions have GPS coordinates, evidence photos carry EXIF data, and validators get affinity boosts for reviewing content near their home region. Every one of these features requires storing and querying geographic points.

PostgreSQL's PostGIS extension adds first-class support for geographic data types. But we use Drizzle ORM for type-safe schema definitions, and Drizzle doesn't ship with a built-in PostGIS type. The solution is a custom type:

```typescript
// packages/db/src/schema/types.ts
import { customType } from "drizzle-orm/pg-core";

export const geographyPoint = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return "geography(Point, 4326)";
  },
});
```

This is a small piece of code with a large consequence. The `4326` is the SRID for WGS84 — the coordinate system GPS devices use. By storing locations as `geography` rather than `geometry`, PostgreSQL calculates distances on Earth's curved surface instead of treating coordinates as flat Cartesian points. The difference matters: at the latitude of San Francisco, flat-Earth distance calculation introduces roughly 1% error per degree of longitude. Over a 100-kilometer radius, that's a meaningful discrepancy for mission proximity matching.

The custom type is used across three core tables:

```typescript
// In the problems schema
location: geographyPoint("location"),

// In the observations schema
location: geographyPoint("location"),

// In the missions schema
location: geographyPoint("location"),
```

**The key insight: Drizzle's `customType` lets you extend the ORM with any PostgreSQL type without sacrificing type safety.** You get the full power of PostGIS with the full safety of Drizzle's query builder. No raw SQL for schema definition, no stringly-typed columns, no runtime surprises.

## Pattern 2: Spatial Queries with ST_DWithin

Storing geographic data is the easy part. Querying it efficiently is where PostGIS earns its keep.

BetterWorld's mission marketplace lets humans browse available missions within a configurable radius of their location. A naive implementation would calculate the Haversine distance between the user's coordinates and every mission in the database. For a table with 10,000 missions, that's 10,000 trigonometric calculations per query — O(n) with expensive math at every step.

PostGIS provides `ST_DWithin`, which answers the question "are these two geographic objects within X meters of each other?" using a GIST index:

```typescript
// Find missions within radius
const radiusMeters = searchRadius * 1000;
conditions.push(
  sql`ST_DWithin(
    ${missions.location},
    ST_MakePoint(${searchLng}, ${searchLat})::geography,
    ${radiusMeters}
  )`
);
```

The GIST index on the `location` column transforms this from O(n) to O(log n). PostgreSQL doesn't calculate the distance to every row. It uses a spatial index tree — similar to a B-tree but for two-dimensional data — to prune the search space before doing any distance math. For a 50-kilometer radius search against 10,000 missions, the database typically examines fewer than 200 rows.

We use `ST_DWithin` in three distinct contexts:

**Mission marketplace search** — humans browse missions near their location with configurable radius, domain, difficulty, and reward filters. The spatial filter runs first (because it's the most selective), then remaining conditions apply to the reduced result set.

**Validator affinity boost** — during shadow mode peer validation, validators within 100 kilometers of a submission's location receive an affinity score boost. This ensures local knowledge is weighted in the consensus:

```typescript
// Validator affinity: prefer local validators
sql`ST_DWithin(
  ${validatorPool.homeLocation},
  ${submission.location},
  ${AFFINITY_RADIUS_METERS}
)`
```

**Observation proximity check** — when humans submit observations of community problems, the system verifies GPS coordinates are plausible. Observations claiming to be at a specific location but submitted from coordinates hundreds of kilometers away are flagged for review.

**The key insight: `ST_DWithin` on a `geography` column with a GIST index is the correct way to do radius search in PostgreSQL.** It handles the curvature of the Earth, uses the index, and returns exact results — not approximations. The Haversine formula in application code is never necessary when PostGIS is available.

## Pattern 3: Semantic Search with pgvector

Some problems are similar but described differently. A report about "broken streetlights on Folsom Street" and "dark intersections near SoMa creating pedestrian safety hazards" describe the same underlying issue. Keyword search won't catch this. You need semantic similarity.

PostgreSQL's pgvector extension adds vector column types and similarity operators. BetterWorld stores 1024-dimensional embeddings generated by Voyage AI on problems and solutions:

```typescript
import { halfvec } from "drizzle-orm/pg-core";

// In problems and solutions schemas:
embedding: halfvec("embedding", { dimensions: 1024 })
```

The choice of `halfvec` over `vector` is deliberate. Standard `vector` uses 32-bit floats (4 bytes per dimension). `halfvec` uses 16-bit floats (2 bytes per dimension). For 1024 dimensions, that's 2 KB per row instead of 4 KB — **50% storage reduction**. With tens of thousands of problems in the database, this adds up.

The precision trade-off is minimal. Voyage AI embeddings are designed for similarity ranking, not exact reconstruction. The difference between `0.87654321` and `0.8765` in a similarity score has no practical impact on whether two problems are semantically related.

Similarity search uses the cosine distance operator:

```typescript
// Find semantically similar problems
const similar = await db
  .select()
  .from(problems)
  .where(
    sql`${problems.embedding} <=> ${targetEmbedding} < ${threshold}`
  )
  .orderBy(sql`${problems.embedding} <=> ${targetEmbedding}`)
  .limit(10);
```

The `<=>` operator computes cosine distance (1 - cosine similarity). Lower values mean higher similarity. An HNSW or IVFFlat index on the embedding column makes this sublinear — the database doesn't need to compare against every row.

**The key insight: pgvector's `halfvec` gives you semantic search at half the storage cost with negligible precision loss.** You don't need a dedicated vector database like Pinecone or Weaviate for similarity search. PostgreSQL can store your relational data and your vector embeddings in the same row, queryable in the same transaction.

## Pattern 4: Atomic Transactions with SELECT FOR UPDATE SKIP LOCKED

BetterWorld's mission claiming system has a concurrency problem that application-level locking cannot solve. When a popular mission is posted — say, documenting broken sidewalks in a downtown district with a 25-token reward — multiple humans may try to claim it simultaneously. Each mission has a `max_claims` limit (typically 3-5). The system must guarantee that no mission is over-claimed, no human gets a phantom claim, and no two claiming transactions interfere with each other.

The solution is `SELECT FOR UPDATE SKIP LOCKED`:

```typescript
const result = await db.transaction(async (tx) => {
  // Lock the mission row — skip if another transaction holds the lock
  const locked = await tx.execute(
    sql`SELECT id, current_claim_count, max_claims, status, guardrail_status
        FROM missions
        WHERE id = ${missionId}
        FOR UPDATE SKIP LOCKED`
  );

  // If empty set, another transaction has the lock — retry
  if (!locked[0]) {
    throw new AppError("CONFLICT", "Mission being processed — retry");
  }

  // Business logic checks
  if (locked[0].current_claim_count >= locked[0].max_claims) {
    throw new AppError("CONFLICT", "Mission fully claimed");
  }

  // Check human's active claim count (max 3 active missions)
  const activeClaims = await tx.execute(
    sql`SELECT COUNT(*) FROM mission_claims
        WHERE human_id = ${humanId} AND status = 'active'`
  );
  if (activeClaims[0].count >= 3) {
    throw new AppError("CONFLICT", "Maximum active claims reached");
  }

  // Insert claim with 7-day deadline
  await tx.insert(missionClaims).values({
    missionId,
    humanId,
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    status: "active",
  });

  // Atomically increment claim count
  await tx.execute(
    sql`UPDATE missions
        SET current_claim_count = current_claim_count + 1
        WHERE id = ${missionId}`
  );
});
```

The `SKIP LOCKED` modifier is the critical detail. Without it, `FOR UPDATE` blocks — the second transaction waits until the first commits or rolls back. Under load, this creates a queue of blocked connections, each holding a database connection while waiting. With 50 simultaneous claim attempts, you'd have 49 connections doing nothing but waiting.

`SKIP LOCKED` changes the semantics: if the row is already locked by another transaction, return an empty result set instead of waiting. The application sees the empty result, returns a "retry" response to the client, and releases the connection immediately. No blocking, no connection pile-up, no thundering herd.

**The key insight: `SKIP LOCKED` turns a blocking operation into a non-blocking one.** The database handles the concurrency; the application handles the retry. This is the same pattern that job queues like `pgboss` and `PGMQ` use internally — it's how you build a reliable work queue on top of PostgreSQL.

BetterWorld uses the same pattern for ImpactToken transactions (double-entry accounting with `SELECT FOR UPDATE` on balance rows) and evidence review assignment (claiming a review slot without double-assignment).

## Pattern 5: Advisory Locks for Distributed Coordination

`SELECT FOR UPDATE` locks rows. But sometimes you need to lock a concept — not a specific database row, but an operation identified by an arbitrary key. This is the problem advisory locks solve.

BetterWorld's peer validation pipeline assigns 6 validators to each content submission. When those validators finish, a consensus engine computes the weighted result: approve, reject, or flag for human review. But what happens when 3 validators complete within the same second? Without coordination, three separate consensus computations would run simultaneously, potentially inserting duplicate consensus results.

PostgreSQL's `pg_advisory_xact_lock` provides a transaction-scoped mutex identified by a bigint key:

```typescript
export async function computeConsensus(
  db: Database,
  submissionId: string,
  submissionType: string
) {
  return await db.transaction(async (tx) => {
    // Convert submission ID to a numeric lock key
    const lockHash = hashString(submissionId);

    // Acquire advisory lock — blocks until available
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockHash})`);

    // Check if consensus already exists (idempotency)
    const [existing] = await tx
      .select()
      .from(consensusResults)
      .where(eq(consensusResults.submissionId, submissionId));

    if (existing) return null; // Already computed — no-op

    // Gather all validator votes
    // Compute weighted consensus (tier_weight * confidence)
    // Insert consensus result
    // Update submission status
  });
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
```

The flow when 6 validators complete simultaneously:

1. All 6 transactions call `pg_advisory_xact_lock` with the same hash.
2. Transaction A acquires the lock. Transactions B-F block.
3. Transaction A checks for existing consensus — none found. Computes votes, inserts result, commits. Lock released.
4. Transaction B acquires the lock. Checks for existing consensus — **found** (Transaction A just inserted it). Returns null. Commits. Lock released.
5. Transactions C-F follow the same path as B. All no-ops.

Result: exactly one consensus computation, regardless of how many validators finish at the same time.

**Why not use `SELECT FOR UPDATE`?** Because there's no row to lock yet. The consensus result doesn't exist until the first transaction creates it. You can't lock a row that hasn't been inserted. Advisory locks let you serialize access to an operation identified by an arbitrary key — in this case, the submission ID hashed to an integer.

**Why `pg_advisory_xact_lock` instead of `pg_advisory_lock`?** The `_xact_` variant is automatically released when the transaction ends (commit or rollback). The non-transactional variant requires explicit release, creating a risk of lock leaks if an error occurs between acquisition and release. Transaction-scoped locks are inherently safe — they cannot leak.

**The key insight: advisory locks let you serialize operations that don't correspond to a single row.** They're the PostgreSQL equivalent of a distributed mutex, without needing Redis or ZooKeeper.

## Pattern 6: Recursive CTEs for Graph Traversal

BetterWorld's debate system is tree-structured. Agents submit solutions to problems, and those solutions receive debate arguments — which can themselves receive counter-arguments. The schema allows parent-child relationships between debates, creating an arbitrarily deep tree (capped at depth 5 for practical reasons).

Computing the depth of a debate thread requires traversing this tree. A naive implementation would issue one query per level:

```typescript
// Don't do this
async function getDepthNaive(db, debateId) {
  let depth = 0;
  let currentId = debateId;
  while (currentId) {
    const parent = await db
      .select({ parentId: debates.parentDebateId })
      .from(debates)
      .where(eq(debates.id, currentId));
    currentId = parent[0]?.parentId;
    depth++;
  }
  return depth;
}
```

For a depth-5 thread, that's 5 sequential round trips to the database. Each round trip incurs network latency, query parsing, and execution overhead. Over a WebSocket connection serving real-time debate updates, this adds visible lag.

A recursive CTE collapses this into a single query:

```typescript
async function getThreadDepth(
  db: Database,
  debateId: string
): Promise<number> {
  const result = await db.execute(
    sql`WITH RECURSIVE thread_chain AS (
      -- Base case: start from the given debate
      SELECT id, parent_debate_id, 1 AS depth
      FROM debates
      WHERE id = ${debateId}

      UNION ALL

      -- Recursive case: walk up to parent
      SELECT d.id, d.parent_debate_id, tc.depth + 1
      FROM debates d
      INNER JOIN thread_chain tc ON d.id = tc.parent_debate_id
    )
    SELECT MAX(depth) AS max_depth FROM thread_chain`
  );

  return result[0]?.max_depth ?? 0;
}
```

The `WITH RECURSIVE` clause tells PostgreSQL to iteratively execute the query: start with the base case (the given debate), then repeatedly join against the parent until no more parents exist. The database engine handles the iteration internally — one network round trip, one result.

Recursive CTEs also enable the **contribution ripple effect** — tracing the chain from a community problem through proposed solutions, decomposed missions, submitted evidence, and verified impact. Here is what the single-query approach looks like:

```typescript
sql`WITH RECURSIVE impact_chain AS (
  -- Start from a problem
  SELECT 'problem' AS type, id, NULL AS parent_id, 0 AS depth
  FROM problems WHERE id = ${problemId}

  UNION ALL

  -- Solutions that address this problem
  SELECT 'solution', s.id, s.problem_id, ic.depth + 1
  FROM solutions s
  INNER JOIN impact_chain ic ON s.problem_id = ic.id
  WHERE ic.type = 'problem'

  UNION ALL

  -- Missions decomposed from solutions
  SELECT 'mission', m.id, m.solution_id, ic.depth + 1
  FROM missions m
  INNER JOIN impact_chain ic ON m.solution_id = ic.id
  WHERE ic.type = 'solution'

  UNION ALL

  -- Evidence submitted for missions
  SELECT 'evidence', e.id, e.mission_id, ic.depth + 1
  FROM evidence e
  INNER JOIN impact_chain ic ON e.mission_id = ic.id
  WHERE ic.type = 'mission'
)
SELECT type, COUNT(*) AS count, MAX(depth) AS max_depth
FROM impact_chain
GROUP BY type`
```

One query. One round trip. The entire impact chain from problem to verified evidence, with counts at each level. In practice, BetterWorld's implementation uses sequential queries per entity type for simpler maintenance, but the recursive CTE demonstrates PostgreSQL's ability to collapse multi-level graph traversals into a single query when performance demands it.

**The key insight: recursive CTEs replace application-level loops with database-level iteration.** The database is always faster at traversing its own data than your application is at issuing sequential queries. For any tree or graph structure stored in PostgreSQL, recursive CTEs should be the default approach.

## Pattern 7: Composite Indexes That Actually Help

Indexes are the most common PostgreSQL optimization. They're also the most commonly misapplied. A single-column index on `status` helps queries that filter by status. It does nothing for a query that filters by status, domain, and sorts by creation date — PostgreSQL may even ignore it entirely if the planner estimates a sequential scan is faster.

BetterWorld's problem board supports filtering by status, domain, geographic scope, and urgency, with sorting by creation date. The queries look like this:

```typescript
// "Show me active clean_water problems, newest first"
const results = await db
  .select()
  .from(problems)
  .where(
    and(
      eq(problems.status, "active"),
      eq(problems.domain, "clean_water"),
    )
  )
  .orderBy(desc(problems.createdAt))
  .limit(20);
```

A composite index must match this access pattern:

```typescript
// problems schema indexes
index("problems_status_domain_created_idx").on(
  table.status,
  table.domain,
  table.createdAt
),

index("problems_geo_scope_urgency_idx").on(
  table.geographicScope,
  table.localUrgency,
  table.createdAt
),
```

**Column order in a composite index is not arbitrary.** PostgreSQL uses composite indexes left-to-right. The index `(status, domain, createdAt)` supports these queries efficiently:

- `WHERE status = 'active'` — uses the index (leftmost column)
- `WHERE status = 'active' AND domain = 'clean_water'` — uses the index (first two columns)
- `WHERE status = 'active' AND domain = 'clean_water' ORDER BY createdAt` — uses the index for both filtering and sorting (all three columns)

But it does **not** help:

- `WHERE domain = 'clean_water'` — cannot skip the first column
- `ORDER BY createdAt` — cannot skip to the third column

The rule of thumb: **equality filters first (highest selectivity), then range filters, then ORDER BY column last.** Status has a small number of distinct values (active, resolved, archived). Domain has 15. Creation date has thousands. Putting the most selective filter first narrows the index scan the fastest.

Partial indexes are another powerful tool for queries that always apply the same filter:

```typescript
// Only index approved content — that's what users see
index("problems_approved_idx")
  .on(table.createdAt)
  .where(sql`guardrail_status = 'approved'`)
```

A partial index is smaller (only matching rows) and faster (no need to filter the indexed predicate at query time). For a table where 80% of rows are approved, the partial index is roughly the same size as a full index. But for a table where only 20% are approved — common during early platform growth when most content is pending review — the partial index is 5x smaller.

**The key insight: a composite index is a data structure, not a magic speed button.** Column order determines which queries benefit. Adding indexes without understanding access patterns can slow down writes (every INSERT and UPDATE must maintain every index) without speeding up reads.

## The Full Picture

Here's every pattern in one view, with the problem each one solves and the alternative it replaces:

| Pattern | Problem | PostgreSQL Solution | Alternative It Replaces |
|---|---|---|---|
| Custom PostGIS type | Store GPS coordinates with Earth-accurate math | `geography(Point, 4326)` via Drizzle `customType` | Storing lat/lng as two FLOAT columns |
| ST_DWithin | Radius search across thousands of locations | GIST-indexed spatial predicate, O(log n) | Application-level Haversine on every row, O(n) |
| pgvector halfvec | Semantic similarity between text descriptions | 1024-dim half-precision vectors, cosine distance | External vector database (Pinecone, Weaviate) |
| SELECT FOR UPDATE SKIP LOCKED | Prevent over-claiming of limited-slot missions | Row-level lock with non-blocking skip | Application-level mutex or Redis distributed lock |
| pg_advisory_xact_lock | Ensure exactly-once consensus computation | Transaction-scoped named mutex | Redis SETNX or distributed lock service |
| Recursive CTE | Traverse debate trees and impact chains | Single-query graph traversal | N sequential queries in application loop |
| Composite indexes | Multi-filter queries with sorting | Left-to-right index column ordering | Single-column indexes that the planner ignores |

Seven patterns. One database. No additional infrastructure.

## One Database, Zero Excuses

There is a persistent temptation in platform engineering to reach for specialized databases. Redis for locking. Elasticsearch for search. A dedicated vector database for embeddings. A graph database for relationships. Each addition brings its own operational burden — deployment, monitoring, backup, version upgrades, connection pooling, failure modes.

PostgreSQL is not the fastest at any single one of these tasks. Redis is faster for distributed locks. A dedicated vector database may handle billion-scale embedding search better. Neo4j is purpose-built for graph traversal.

But PostgreSQL is **good enough at all of them, in the same transaction**. You can insert a mission with a PostGIS location, store its embedding for similarity search, claim it with `SELECT FOR UPDATE SKIP LOCKED`, compute consensus with an advisory lock, traverse its debate tree with a recursive CTE, and query it through a composite index — all in the same database, with full ACID guarantees, using a single connection pool.

For a platform operating at the scale of a city — thousands of active missions, tens of thousands of problems, hundreds of concurrent users — PostgreSQL with PostGIS and pgvector handles everything without breaking a sweat. The operational simplicity of one database pays dividends every day: one backup strategy, one monitoring dashboard, one connection pool to tune, one set of migrations to manage.

We didn't start with 7 advanced PostgreSQL patterns. We started with basic CRUD and added each pattern when a real problem demanded it. PostGIS arrived when we needed hyperlocal missions. Advisory locks arrived when validators started racing on consensus. Recursive CTEs arrived when debate threads got deep enough to cause N+1 query storms.

PostgreSQL didn't need replacing at any of those inflection points. It just needed us to read the documentation.

---

## References & Related Reading

**PostgreSQL Documentation:**

- [PostGIS Geography Type](https://postgis.net/docs/using_postgis_dbmanagement.html#PostGIS_Geography) — geography vs. geometry, WGS84, and ST_DWithin behavior
- [pgvector: Open-Source Vector Similarity Search](https://github.com/pgvector/pgvector) — halfvec, HNSW indexes, distance operators
- [PostgreSQL Advisory Locks](https://www.postgresql.org/docs/16/explicit-locking.html#ADVISORY-LOCKS) — pg_advisory_xact_lock vs. pg_advisory_lock
- [PostgreSQL Recursive Queries](https://www.postgresql.org/docs/16/queries-with.html#QUERIES-WITH-RECURSIVE) — WITH RECURSIVE syntax and execution model
- [PostgreSQL Row-Level Locks](https://www.postgresql.org/docs/16/explicit-locking.html#LOCKING-ROWS) — FOR UPDATE, FOR SHARE, SKIP LOCKED, NOWAIT

**ORM & Tooling:**

- [Drizzle ORM Custom Types](https://orm.drizzle.team/docs/custom-types) — extending Drizzle with PostgreSQL-specific types
- [Drizzle ORM pgvector Support](https://orm.drizzle.team/docs/extensions/pg#pg_vector) — halfvec and vector column types

**BetterWorld Series:**

- [Soulbound Tokens Without the Blockchain](/blog/soulbound-tokens-without-blockchain) — the credit economy powered by SELECT FOR UPDATE and double-entry accounting
- [Cost-Optimized AI Image Verification](/blog/cost-optimized-ai-image-verification) — evidence verification queries that depend on these spatial and concurrency patterns
- [82% of SDGs Are Failing](/blog/sdgs-failing-hyperlocal-technology) — the hyperlocal platform these 7 patterns power