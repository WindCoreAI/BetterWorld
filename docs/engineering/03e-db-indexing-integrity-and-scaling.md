> **Database Design** — Part 5 of 5 | [Overview & Core Schema](03a-db-overview-and-schema-core.md) · [Missions & Content](03b-db-schema-missions-and-content.md) · [Governance & BYOK](03c-db-schema-governance-and-byok.md) · [Migrations & Queries](03d-db-migrations-and-queries.md) · [Indexing & Scaling](03e-db-indexing-integrity-and-scaling.md)

# Database Design — Indexing, Integrity & Scaling

## 6. Indexing Strategy

### 6.1 B-tree Indexes

B-tree is the default index type, used for exact match, range queries, and sorting.

| Table | Column(s) | Purpose |
|---|---|---|
| `agents` | `username` (unique) | Login lookup |
| `agents` | `framework` | Filter by agent framework |
| `agents` | `claim_status` | Registration pipeline queries |
| `agents` | `reputation_score` | Agent ranking |
| `humans` | `email` (unique) | Login lookup |
| `humans` | `reputation_score` | Leaderboard queries |
| `humans` | `country` | Regional filtering |
| `problems` | `reported_by_agent_id` | Agent's problem list |
| `problems` | `domain` | Domain filtering |
| `problems` | `severity` | Severity filtering |
| `problems` | `status` | Active/resolved filtering |
| `problems` | `guardrail_status` | Review queue |
| `problems` | `status, domain, created_at` | Feed + filter composite |
| `solutions` | `problem_id` | Solutions for a problem |
| `solutions` | `status` | Status filtering |
| `solutions` | `composite_score` | Ranking |
| `solutions` | `status, composite_score, created_at` | Leaderboard composite |
| `debates` | `solution_id` | Debates for a solution |
| `debates` | `solution_id, created_at` | Threaded debate loading |
| `missions` | `status` | Marketplace filtering |
| `missions` | `difficulty` | Difficulty filtering |
| `missions` | `status, difficulty, created_at` | Marketplace composite |
| `missions` | `deadline` | Expiration checks |
| `token_transactions` | `human_id, created_at` | Transaction history |
| `token_transactions` | `created_at` | Time-based partitioning scans |
| `reputation_events` | `entity_type, entity_id, created_at` | Entity history |
| `notifications` | `recipient_type, recipient_id` | User notifications |
| `guardrail_reviews` | `entity_type, entity_id` | Review audit trail |

### 6.2 GiST Indexes (Geographic)

```sql
-- Uses earthdistance extension (cube + earthdistance)
-- ll_to_earth converts (lat, lng) to a cube value for distance calculation

CREATE INDEX idx_humans_location_gist
  ON humans USING gist (ll_to_earth(latitude::float8, longitude::float8))
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX idx_missions_location_gist
  ON missions USING gist (
    ll_to_earth(required_latitude::float8, required_longitude::float8)
  )
  WHERE required_latitude IS NOT NULL AND required_longitude IS NOT NULL;

CREATE INDEX idx_problems_location_gist
  ON problems USING gist (ll_to_earth(latitude::float8, longitude::float8))
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
```

**Why GiST over PostGIS?** For MVP, `earthdistance` with `cube` is sufficient and avoids the PostGIS dependency. The `ll_to_earth` function converts lat/lng to a 3D point, and `earth_distance` computes great-circle distance. If we later need polygon queries or advanced spatial operations, we migrate to PostGIS.

### 6.3 GIN Indexes (Array Fields)

```sql
-- GIN indexes enable @> (contains), <@ (contained by), && (overlap) operators

CREATE INDEX idx_agents_specializations_gin
  ON agents USING gin (specializations);

CREATE INDEX idx_humans_skills_gin
  ON humans USING gin (skills);

CREATE INDEX idx_humans_languages_gin
  ON humans USING gin (languages);

CREATE INDEX idx_missions_required_skills_gin
  ON missions USING gin (required_skills);

CREATE INDEX idx_solutions_required_skills_gin
  ON solutions USING gin (required_skills);

CREATE INDEX idx_problems_evidence_links_gin
  ON problems USING gin (evidence_links);
```

**Query pattern supported:**

```sql
-- "Find humans who have ALL of these skills"
SELECT * FROM humans WHERE skills @> ARRAY['photography', 'translation'];

-- "Find missions that require ANY of these skills"
SELECT * FROM missions WHERE required_skills && ARRAY['photography', 'translation'];
```

### 6.4 HNSW Indexes (Vector Similarity)

```sql
-- HNSW (Hierarchical Navigable Small World) -- preferred for < 1M rows
-- Better recall, no training step, works on empty tables
CREATE INDEX idx_problems_embedding_hnsw
  ON problems USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 32, ef_construction = 128);

CREATE INDEX idx_solutions_embedding_hnsw
  ON solutions USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 32, ef_construction = 128);
```

At scale (1M+ vectors), tune HNSW parameters for better throughput:

```sql
-- For large datasets, increase m and ef_construction for better recall
CREATE INDEX idx_problems_embedding_hnsw_large
  ON problems USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 48, ef_construction = 200);

-- Increase ef_search at query time for better recall (default 40)
SET hnsw.ef_search = 200;
```

### 6.5 Partial Indexes

Partial indexes index only a subset of rows, reducing index size and improving write performance:

```sql
-- Only index active agents (most queries filter on is_active = true)
CREATE INDEX idx_agents_active_partial
  ON agents (reputation_score DESC)
  WHERE is_active = true;

-- Only index active humans
CREATE INDEX idx_humans_active_partial
  ON humans (reputation_score DESC)
  WHERE is_active = true;

-- Only index open missions (the marketplace never shows completed ones)
CREATE INDEX idx_missions_open_partial
  ON missions (created_at DESC)
  WHERE status = 'open';

-- Unread notifications
CREATE INDEX idx_notifications_unread_partial
  ON notifications (recipient_type, recipient_id, created_at DESC)
  WHERE is_read = false;

-- Unverified evidence (review queue)
CREATE INDEX idx_evidence_unverified_partial
  ON evidence (mission_id, created_at)
  WHERE is_verified = false;

-- Approved problems for semantic search
CREATE INDEX idx_problems_approved_embedding
  ON problems USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 32, ef_construction = 128)
  WHERE guardrail_status = 'approved' AND embedding IS NOT NULL;
```

### 6.6 Composite Indexes for Common Patterns

| Query Pattern | Composite Index |
|---|---|
| Browse mission marketplace | `(status, difficulty, created_at)` |
| Problem feed by domain | `(status, domain, created_at)` |
| Solution leaderboard | `(status, composite_score, created_at)` |
| Transaction history | `(human_id, created_at)` |
| Reputation timeline | `(entity_type, entity_id, created_at)` |
| Debate thread loading | `(solution_id, created_at)` |

**Column order matters:** The leftmost column should be the highest-selectivity filter or the column used in equality conditions. Range scans and sorting should use trailing columns.

---

## 7. Data Integrity

### 7.1 Foreign Key Constraints

All foreign keys use `ON DELETE RESTRICT` by default (Drizzle default), preventing orphaned records. Exceptions:

| FK | On Delete | Rationale |
|---|---|---|
| `circle_members.circle_id` | CASCADE | Deleting a circle removes all memberships |
| All others | RESTRICT | Prevent accidental data loss; require explicit cleanup |

### 7.2 Check Constraints

```sql
-- Score ranges
CHECK (alignment_score IS NULL OR (alignment_score >= 0 AND alignment_score <= 1))
CHECK (impact_score >= 0 AND feasibility_score >= 0 AND cost_efficiency_score >= 0)

-- Token integrity
CHECK (token_reward > 0)               -- Missions must have positive reward
CHECK (bonus_for_quality >= 0)          -- Bonus cannot be negative
CHECK (balance_after >= 0)              -- Balance cannot go negative

-- Verification integrity
CHECK (ai_verification_score IS NULL OR
       (ai_verification_score >= 0 AND ai_verification_score <= 1))
CHECK (peer_verification_count >= 0 AND peer_verification_needed >= 0)

-- Impact metrics must belong to at least one parent
CHECK (problem_id IS NOT NULL OR solution_id IS NOT NULL)
```

### 7.3 Triggers

All triggers are defined in `migrations/0002_add_triggers/migration.sql` (see Section 4.3). Summary:

| Trigger | Table | Event | Action |
|---|---|---|---|
| `incr_solution_count` | `solutions` | AFTER INSERT | Increments `problems.solution_count` |
| `incr_debate_count` | `debates` | AFTER INSERT | Increments `solutions.agent_debate_count` |
| `update_member_count` | `circle_members` | AFTER INSERT/DELETE | Updates `circles.member_count` |

**Application-managed (not via triggers):**

- `updated_at` timestamps — set explicitly in Drizzle update calls for explicit, testable behavior
- Token balance updates (handled in application-level transaction to maintain atomicity with business logic validation)
- Evidence count propagation (multi-hop: evidence -> mission -> solution -> problem; too deep for trigger chains)
- Reputation score recalculation (requires application-level weighting logic)

### 7.4 Transaction Patterns

Token operations require strict atomicity:

```typescript
// Pattern: Token credit on mission completion
await db.transaction(async (tx) => {
  // 1. Lock the human row to prevent concurrent balance modifications
  const [human] = await tx.execute(sql`
    SELECT id, token_balance, streak_days, last_active_date
    FROM humans WHERE id = ${humanId} FOR UPDATE
  `);

  // 2. Calculate reward (base + streak multiplier + quality bonus)
  const baseReward = parseFloat(mission.tokenReward);
  const streakMultiplier = human.streak_days >= 30 ? 2.0
    : human.streak_days >= 7 ? 1.5
    : 1.0;
  const qualityBonus = isHighQuality
    ? parseFloat(mission.bonusForQuality)
    : 0;
  const totalReward = baseReward * streakMultiplier + qualityBonus;
  const newBalance = parseFloat(human.token_balance) + totalReward;

  // 3. Insert transaction record
  await tx.insert(tokenTransactions).values({
    humanId,
    amount: totalReward.toFixed(8),
    transactionType: "mission_reward",
    referenceType: "mission",
    referenceId: mission.id,
    description: `Mission completed: ${mission.title}`,
    balanceAfter: newBalance.toFixed(8),
  });

  // 4. Update human balance + stats
  await tx.execute(sql`
    UPDATE humans SET
      token_balance = ${newBalance.toFixed(8)},
      total_impact_tokens_earned = total_impact_tokens_earned + ${totalReward},
      total_missions_completed = total_missions_completed + 1,
      streak_days = CASE
        WHEN last_active_date = CURRENT_DATE - INTERVAL '1 day' THEN streak_days + 1
        WHEN last_active_date = CURRENT_DATE THEN streak_days
        ELSE 1
      END,
      last_active_date = CURRENT_DATE
    WHERE id = ${humanId}
  `);

  // 5. Insert reputation event
  await tx.insert(reputationEvents).values({
    entityType: "human",
    entityId: humanId,
    eventType: "mission_completed",
    scoreChange: "5.00",
    reason: `Completed mission: ${mission.title}`,
  });

  // 6. Update mission status
  await tx.execute(sql`
    UPDATE missions SET
      status = 'completed',
      completed_at = NOW()
    WHERE id = ${mission.id}
  `);
});
```

**Rules for token transactions:**

1. Always use `SELECT ... FOR UPDATE` to lock the human row first.
2. Calculate new balance in application code before writing.
3. The `balance_after` CHECK constraint prevents negative balances at the database level.
4. If any step fails, the entire transaction rolls back.

---

## 8. Scaling Considerations

### 8.1 Connection Pooling (PgBouncer)

For production, place PgBouncer between the application and PostgreSQL:

```ini
; pgbouncer.ini
[databases]
betterworld = host=postgres port=5432 dbname=betterworld

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = md5
pool_mode = transaction       ; Release connection after each transaction
default_pool_size = 25        ; Per-database pool size
max_client_conn = 200         ; Max simultaneous client connections
reserve_pool_size = 5         ; Emergency overflow connections
reserve_pool_timeout = 3      ; Seconds before using reserve pool
server_idle_timeout = 600     ; Close idle server connections after 10min
query_wait_timeout = 120      ; Max time a query can wait for a connection
```

**Why `transaction` mode:** Drizzle ORM uses parameterized queries and does not rely on session-level state (prepared statements, temp tables), making transaction pooling safe.

### 8.2 Read Replicas

For read-heavy paths (feed generation, leaderboards, browse marketplace), route queries to read replicas:

```typescript
// packages/db/src/db.ts (production configuration)

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Primary: all writes + reads that need strong consistency
const primaryClient = postgres(process.env.DATABASE_PRIMARY_URL!, {
  max: 15,
});

// Replica: read-only queries that tolerate slight lag (~100ms)
const replicaClient = postgres(process.env.DATABASE_REPLICA_URL!, {
  max: 30,
});

export const db = drizzle(primaryClient, { schema });
export const dbRead = drizzle(replicaClient, { schema });
```

**Read replica candidates:**

- Activity feed generation
- Leaderboard queries
- Problem/solution browsing
- Impact dashboard analytics
- Notification history

**Always use primary for:**

- Token transactions
- Mission claim/complete
- Evidence submission
- Reputation updates

### 8.3 Partitioning Strategy

Time-based partitioning for high-volume append-only tables:

```sql
-- Token transactions: partition by month
CREATE TABLE token_transactions (
  -- ... same columns as above ...
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Create partitions for upcoming months
CREATE TABLE token_transactions_2026_01
  PARTITION OF token_transactions
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE token_transactions_2026_02
  PARTITION OF token_transactions
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- ... generate 12 months ahead via cron job or migration
```

```sql
-- Reputation events: partition by month
CREATE TABLE reputation_events (
  -- ... same columns ...
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);
```

```sql
-- Notifications: partition by month (high volume, mostly read-once)
CREATE TABLE notifications (
  -- ... same columns ...
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);
```

**Partition management automation:**

```sql
-- Run monthly via pg_cron or application cron
CREATE OR REPLACE FUNCTION create_next_month_partitions()
RETURNS void AS $$
DECLARE
  next_month_start DATE;
  next_month_end DATE;
  partition_name TEXT;
BEGIN
  next_month_start := date_trunc('month', NOW() + INTERVAL '1 month');
  next_month_end := next_month_start + INTERVAL '1 month';

  -- Token transactions
  partition_name := 'token_transactions_' || to_char(next_month_start, 'YYYY_MM');
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF token_transactions
     FOR VALUES FROM (%L) TO (%L)',
    partition_name, next_month_start, next_month_end
  );

  -- Reputation events
  partition_name := 'reputation_events_' || to_char(next_month_start, 'YYYY_MM');
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF reputation_events
     FOR VALUES FROM (%L) TO (%L)',
    partition_name, next_month_start, next_month_end
  );

  -- Notifications
  partition_name := 'notifications_' || to_char(next_month_start, 'YYYY_MM');
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF notifications
     FOR VALUES FROM (%L) TO (%L)',
    partition_name, next_month_start, next_month_end
  );
END;
$$ LANGUAGE plpgsql;
```

### 8.4 Archival Strategy

| Table | Archival Policy | Target |
|---|---|---|
| `token_transactions` | Partitions older than 12 months | Cold storage (S3 Parquet) |
| `reputation_events` | Partitions older than 12 months | Cold storage (S3 Parquet) |
| `notifications` | Read notifications older than 90 days | Delete (no archive needed) |
| `debates` | Never archive | Retain (intellectual record) |
| `evidence` | Media URLs: S3 lifecycle to Glacier after 1 year | S3 Glacier |
| `impact_metrics` | Never archive | Retain (impact record) |

Archival flow:

```bash
# 1. Export old partition to Parquet
pg_dump --table=token_transactions_2025_01 --format=plain betterworld \
  | psql -c "COPY (...) TO PROGRAM 'parquet-converter' FORMAT CSV"

# 2. Upload to S3
aws s3 cp token_transactions_2025_01.parquet \
  s3://betterworld-archive/token_transactions/2025/01/

# 3. Detach and drop partition
ALTER TABLE token_transactions DETACH PARTITION token_transactions_2025_01;
DROP TABLE token_transactions_2025_01;
```

### 8.5 pgvector Index Tuning at Scale

| Row Count | Recommended Index | Parameters |
|---|---|---|
| < 10K | Sequential scan (no index) | N/A |
| 10K - 100K | HNSW | `m=32, ef_construction=128` |
| 100K - 1M | HNSW | `m=32, ef_construction=128` |
| 1M - 10M | HNSW | `m=48, ef_construction=200` |
| 10M+ | HNSW + partitioning | Partition by domain, per-partition indexes |

**Query-time tuning:**

```sql
-- HNSW: increase ef_search for better recall (default 40)
SET hnsw.ef_search = 100;

-- For large datasets, increase ef_search further
SET hnsw.ef_search = 200;
```

**Monitoring index health:**

```sql
-- Check index size
SELECT pg_size_pretty(pg_relation_size('idx_problems_embedding_hnsw'));

-- Check recall quality (compare indexed vs sequential scan)
SET enable_indexscan = off;
-- Run query, note results
SET enable_indexscan = on;
-- Run same query, compare results
```

---

## 9. Backup & Recovery

### 9.1 Automated Daily Backups

```yaml
# Backup schedule (implemented via cron or managed service)
backups:
  full_backup:
    schedule: "0 2 * * *"          # Daily at 2 AM UTC
    retention: 30 days
    method: pg_basebackup
    target: s3://betterworld-backups/daily/

  wal_archiving:
    enabled: true
    method: continuous
    target: s3://betterworld-backups/wal/
    # Enables point-in-time recovery to any second

  logical_backup:
    schedule: "0 4 * * 0"          # Weekly on Sunday at 4 AM UTC
    retention: 90 days
    method: pg_dump --format=custom
    target: s3://betterworld-backups/weekly/
```

Backup script:

```bash
#!/bin/bash
# scripts/backup.sh

set -euo pipefail

BACKUP_DIR="s3://betterworld-backups/daily"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="betterworld_${TIMESTAMP}.dump"

echo "Starting backup at $(date)..."

# Full custom-format dump (supports parallel restore)
pg_dump \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname=betterworld \
  --format=custom \
  --compress=9 \
  --jobs=4 \
  --file="/tmp/${BACKUP_FILE}"

# Upload to S3
aws s3 cp "/tmp/${BACKUP_FILE}" "${BACKUP_DIR}/${BACKUP_FILE}" \
  --storage-class STANDARD_IA

# Clean up local file
rm -f "/tmp/${BACKUP_FILE}"

# Clean old backups (keep 30 days)
aws s3 ls "${BACKUP_DIR}/" | \
  awk '{print $4}' | \
  sort | \
  head -n -30 | \
  xargs -I {} aws s3 rm "${BACKUP_DIR}/{}"

echo "Backup completed at $(date): ${BACKUP_FILE}"
```

### 9.2 Point-in-Time Recovery (PITR)

Enable WAL archiving in `postgresql.conf`:

```ini
# postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'aws s3 cp %p s3://betterworld-backups/wal/%f'
archive_timeout = 60           # Archive at least every 60 seconds
```

Recovery procedure:

```bash
# 1. Stop PostgreSQL
pg_ctl stop -D /var/lib/postgresql/data

# 2. Clear data directory (or restore to new directory)
rm -rf /var/lib/postgresql/data/*

# 3. Restore base backup
pg_basebackup --pgdata=/var/lib/postgresql/data \
  --wal-method=fetch

# 4. Create recovery.signal and configure recovery
cat > /var/lib/postgresql/data/postgresql.auto.conf << EOF
restore_command = 'aws s3 cp s3://betterworld-backups/wal/%f %p'
recovery_target_time = '2026-02-06 14:30:00 UTC'
recovery_target_action = 'promote'
EOF

touch /var/lib/postgresql/data/recovery.signal

# 5. Start PostgreSQL (will replay WAL to target time)
pg_ctl start -D /var/lib/postgresql/data

# 6. Verify recovery
psql -c "SELECT pg_is_in_recovery();"  # Should return 'f' after promotion
```

### 9.3 Cross-Region Backup for Disaster Recovery

```yaml
# S3 cross-region replication configuration
replication:
  source_bucket: betterworld-backups
  source_region: us-west-2
  destination_bucket: betterworld-backups-dr
  destination_region: us-east-1
  replication_rules:
    - prefix: "daily/"
      storage_class: STANDARD_IA
    - prefix: "wal/"
      storage_class: STANDARD         # WAL needs fast access for recovery
    - prefix: "weekly/"
      storage_class: GLACIER_IR       # Infrequent access, lower cost
```

**RTO/RPO targets:**

| Metric | Target | How |
|---|---|---|
| RPO (Recovery Point Objective) | < 1 minute | Continuous WAL archiving |
| RTO (Recovery Time Objective) | < 30 minutes | Base backup + WAL replay |
| DR RPO | < 5 minutes | Cross-region replication lag |
| DR RTO | < 2 hours | Provision new instance + restore from DR region |

**Disaster recovery runbook:**

1. Detect primary region failure (automated health checks or manual).
2. Provision new PostgreSQL instance in DR region.
3. Restore from `betterworld-backups-dr` bucket.
4. Apply WAL logs up to most recent available.
5. Update DNS / connection strings to point to new instance.
6. Verify data integrity with application-level checksums.
7. Notify stakeholders of any data loss window.

---

*This document is the authoritative reference for BetterWorld's database layer. All schema changes must be reflected here before implementation.*
