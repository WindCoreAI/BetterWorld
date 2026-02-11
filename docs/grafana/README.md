# BetterWorld Grafana Dashboards

Setup and configuration guide for Grafana dashboards monitoring the BetterWorld platform.

## Available Dashboards

| Dashboard | File | Description |
|-----------|------|-------------|
| Guardrail Evaluations | `config/grafana-dashboards.json` | Phase 1 guardrail pipeline metrics (Prometheus) |
| Phase 2: Reputation & Impact | `docs/grafana/phase2-reputation-impact.json` | Phase 2 reputation, fraud, and impact metrics (PostgreSQL) |

## Phase 2 Dashboard: Reputation & Impact

### Panels

The Phase 2 dashboard contains 6 panels arranged in a 2-column, 3-row grid:

| # | Panel | Type | Data Source | Time Range |
|---|-------|------|-------------|------------|
| 1 | Reputation Distribution Histogram | Bar Chart | PostgreSQL | Snapshot (all time) |
| 2 | Tier Population | Pie Chart (Donut) | PostgreSQL | Snapshot (all time) |
| 3 | Mission Completion Rate (7d) | Time Series | PostgreSQL | Last 7 days (hourly) |
| 4 | Fraud Flags Over Time | Time Series (Stacked Bars) | PostgreSQL | Last 30 days (daily) |
| 5 | Verification Latency (p50/p95) | Time Series | PostgreSQL | Last 7 days (hourly) |
| 6 | Token Distribution Velocity | Time Series | PostgreSQL | Last 7 days (hourly) |

### Panel SQL Queries

**1. Reputation Distribution Histogram** -- Buckets all reputation scores into 20 equal-width ranges from 0 to 10,000:

```sql
SELECT width_bucket(total_score::float, 0, 10000, 20) AS bucket,
       COUNT(*) AS count
FROM reputation_scores
GROUP BY bucket ORDER BY bucket
```

**2. Tier Population** -- Counts humans in each reputation tier:

```sql
SELECT current_tier AS tier, COUNT(*) AS count
FROM reputation_scores
GROUP BY current_tier ORDER BY count DESC
```

**3. Mission Completion Rate (7d)** -- Hourly mission completions over the past week:

```sql
SELECT date_trunc('hour', completed_at) AS time,
       COUNT(*) AS completions
FROM mission_claims
WHERE completed_at >= NOW() - INTERVAL '7 days'
  AND status = 'completed'
GROUP BY 1 ORDER BY 1
```

**4. Fraud Flags Over Time** -- Daily fraud events by detection type over the past 30 days:

```sql
SELECT date_trunc('day', created_at) AS time,
       detection_type,
       COUNT(*) AS count
FROM fraud_events
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY 1, 2 ORDER BY 1
```

**5. Verification Latency (p50/p95)** -- Hourly percentiles of evidence verification processing time:

```sql
SELECT date_trunc('hour', updated_at) AS time,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (updated_at - created_at))) AS p50,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (updated_at - created_at))) AS p95
FROM evidence
WHERE updated_at >= NOW() - INTERVAL '7 days'
  AND status IN ('verified', 'rejected')
GROUP BY 1 ORDER BY 1
```

**6. Token Distribution Velocity** -- Hourly total of ImpactTokens distributed as rewards:

```sql
SELECT date_trunc('hour', created_at) AS time,
       SUM(amount::float) AS tokens_distributed
FROM token_transactions
WHERE type = 'reward' AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY 1 ORDER BY 1
```

## Import Instructions

### Prerequisites

- Grafana 10.x or later (tested with Grafana 10.4+)
- PostgreSQL data source plugin (bundled with Grafana)
- Network access from Grafana to the BetterWorld PostgreSQL database

### Step 1: Configure PostgreSQL Data Source

1. Open Grafana and navigate to **Connections > Data sources**
2. Click **Add data source** and select **PostgreSQL**
3. Configure the connection:

   | Field | Dev Value | Production Value |
   |-------|-----------|------------------|
   | Host | `localhost:5432` | Supabase connection string |
   | Database | `betterworld` | `betterworld` |
   | User | `postgres` | Read-only service role |
   | Password | (dev password) | (Supabase service key) |
   | TLS/SSL Mode | `disable` (dev) | `require` (prod) |
   | Version | 16.0 | 16.0 |

4. Click **Save & test** to verify the connection
5. Note the data source name -- it must match `DS_POSTGRESQL` when importing the dashboard

### Step 2: Import the Dashboard

1. Navigate to **Dashboards > Import**
2. Click **Upload JSON file** and select `docs/grafana/phase2-reputation-impact.json`
3. On the import screen:
   - Set the **Name** to "Phase 2: Reputation & Impact" (pre-filled)
   - Set the **Folder** to your preferred dashboard folder
   - Map the **DS_POSTGRESQL** variable to your configured PostgreSQL data source
4. Click **Import**

### Step 3: Verify Dashboard

After import, the dashboard should load with the 6 panels described above. If the database contains data, all panels should render immediately.

## Validation Steps

Use these steps to verify the dashboard is working correctly against your dev database.

### 1. Connect to the Dev Database

```bash
# Using Docker (local dev)
docker exec -it betterworld-postgres psql -U postgres -d betterworld

# Or using psql directly
psql -h localhost -p 5432 -U postgres -d betterworld
```

### 2. Run Each Panel Query Manually

Execute each of the 6 SQL queries listed in the "Panel SQL Queries" section above. Verify:

- **Panel 1 (Reputation Distribution):** Returns rows with `bucket` (integer 1-21) and `count`. If no reputation data exists yet, returns empty result set.
- **Panel 2 (Tier Population):** Returns rows with `tier` (one of: newcomer, contributor, advocate, leader, champion) and `count`. After running the backfill seed (`packages/db/src/seed/backfill-reputation.ts`), all humans should appear as `newcomer`.
- **Panel 3 (Mission Completion Rate):** Returns rows with `time` (hourly timestamps) and `completions`. Requires completed missions in the last 7 days.
- **Panel 4 (Fraud Flags):** Returns rows with `time` (daily timestamps), `detection_type` (phash_duplicate, velocity, statistical), and `count`. Requires fraud events in the last 30 days.
- **Panel 5 (Verification Latency):** Returns rows with `time` (hourly timestamps), `p50`, and `p95` (both in seconds). Requires verified or rejected evidence in the last 7 days.
- **Panel 6 (Token Distribution):** Returns rows with `time` (hourly timestamps) and `tokens_distributed`. Requires reward-type token transactions in the last 7 days.

### 3. Verify All 6 Panels Render

With sample data populated (via seed scripts or manual testing):

1. Open the dashboard in Grafana
2. Set the time range to "Last 7 days" (top-right time picker)
3. Confirm all 6 panels display data:
   - Panels 1 and 2 show snapshot data regardless of time range
   - Panels 3, 5, and 6 show hourly data points within the 7-day window
   - Panel 4 shows daily data points within the 30-day window
4. If panels show "No data," verify the database contains relevant records by running the manual queries above

### 4. Check for Errors

- Click any panel title and select **Inspect > Query** to see the raw SQL and any errors
- Common issues:
  - **Table not found:** Run the Drizzle migration (`pnpm drizzle-kit push` in `packages/db/`)
  - **Permission denied:** Ensure the Grafana PostgreSQL user has `SELECT` access to the required tables
  - **No data:** Run the backfill seed script and/or complete some test missions

## Required Database Tables

The Phase 2 dashboard queries the following tables (created by Sprint 9 Drizzle migrations):

| Table | Used By Panel(s) | Schema File |
|-------|-------------------|-------------|
| `reputation_scores` | 1, 2 | `packages/db/src/schema/reputation.ts` |
| `mission_claims` | 3 | `packages/db/src/schema/missions.ts` |
| `fraud_events` | 4 | `packages/db/src/schema/fraudScores.ts` |
| `evidence` | 5 | `packages/db/src/schema/evidence.ts` |
| `token_transactions` | 6 | `packages/db/src/schema/tokens.ts` |

## Security Notes

- Use a **read-only** PostgreSQL user for the Grafana data source in production
- Do not expose the Grafana instance to the public internet without authentication
- The dashboard queries do not access PII columns (no emails, passwords, or API keys)
- All queries use aggregate functions; no individual user data is exposed in the panels
