# Data Model: Reputation & Impact System

**Branch**: `010-reputation-impact` | **Date**: 2026-02-11

## New Enums

### reputationTierEnum
```sql
CREATE TYPE reputation_tier AS ENUM (
  'newcomer',     -- Tier 1: 0-99
  'contributor',  -- Tier 2: 100-499
  'advocate',     -- Tier 3: 500-1999
  'leader',       -- Tier 4: 2000-4999
  'champion'      -- Tier 5: 5000+
);
```

### fraudActionEnum
```sql
CREATE TYPE fraud_action AS ENUM (
  'flag_for_review',   -- Score 50-149: hold submissions, notify admin
  'auto_suspend',      -- Score 150+: freeze account
  'clear_flag',        -- Admin clears false positive
  'reset_score',       -- Admin resets fraud score
  'manual_suspend',    -- Admin manually suspends
  'unsuspend'          -- Admin reverses suspension
);
```

### endorsementStatusEnum
```sql
CREATE TYPE endorsement_status AS ENUM (
  'active',
  'revoked'
);
```

### portfolioVisibilityEnum
```sql
CREATE TYPE portfolio_visibility AS ENUM (
  'public',
  'private'
);
```

---

## New Tables

### 1. reputation_scores

Stores current reputation state for each human. One row per human.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| human_id | UUID | PK, FK → humans.id (CASCADE) | Human this score belongs to |
| total_score | DECIMAL(10,2) | NOT NULL, DEFAULT 0, CHECK >= 0 | Current total reputation score |
| mission_quality_score | DECIMAL(8,2) | NOT NULL, DEFAULT 0 | Factor 1: average evidence verification confidence |
| peer_accuracy_score | DECIMAL(8,2) | NOT NULL, DEFAULT 0 | Factor 2: peer review consensus alignment |
| streak_score | DECIMAL(8,2) | NOT NULL, DEFAULT 0 | Factor 3: active days streak bonus |
| endorsement_score | DECIMAL(8,2) | NOT NULL, DEFAULT 0 | Factor 4: community endorsement count |
| current_tier | reputation_tier | NOT NULL, DEFAULT 'newcomer' | Current reputation tier |
| tier_multiplier | DECIMAL(3,2) | NOT NULL, DEFAULT 1.00 | Token reward multiplier for current tier |
| grace_period_start | TIMESTAMPTZ | NULL | When grace period began (NULL = no active grace) |
| grace_period_tier | reputation_tier | NULL | Tier being demoted from (NULL = no active grace) |
| last_activity_at | TIMESTAMPTZ | NULL | Last reputation-affecting activity |
| last_decay_at | TIMESTAMPTZ | NULL | Last time decay was applied |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- `idx_rep_scores_total` on (total_score DESC) — leaderboard queries
- `idx_rep_scores_tier` on (current_tier) — tier population metrics
- `idx_rep_scores_last_activity` on (last_activity_at) — decay job targeting
- `idx_rep_scores_grace` on (grace_period_start) WHERE grace_period_start IS NOT NULL — grace period processing

**Relations**: 1:1 with humans (created on first reputation event)

---

### 2. reputation_history

Append-only log of all reputation changes. Immutable audit trail.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| human_id | UUID | NOT NULL, FK → humans.id | |
| score_before | DECIMAL(10,2) | NOT NULL | Score before this event |
| score_after | DECIMAL(10,2) | NOT NULL | Score after this event |
| delta | DECIMAL(10,2) | NOT NULL | Change amount (positive or negative) |
| event_type | VARCHAR(50) | NOT NULL | mission_verified, peer_review, streak_bonus, endorsement, decay, admin_adjust, tier_change |
| event_source_id | UUID | NULL | Reference to evidence, peer review, endorsement, etc. |
| event_source_type | VARCHAR(50) | NULL | evidence, peer_review, endorsement, admin |
| tier_before | reputation_tier | NULL | Tier before (if tier changed) |
| tier_after | reputation_tier | NULL | Tier after (if tier changed) |
| metadata | JSONB | NULL | Additional context (decay %, admin reason, etc.) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- `idx_rep_history_human_created` on (human_id, created_at DESC) — user history
- `idx_rep_history_event_type` on (event_type) — analytics
- `idx_rep_history_created` on (created_at DESC) — time-series queries

---

### 3. streaks

Tracks active day streaks per human.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| human_id | UUID | PK, FK → humans.id (CASCADE) | |
| current_streak | INTEGER | NOT NULL, DEFAULT 0, CHECK >= 0 | Consecutive active days |
| longest_streak | INTEGER | NOT NULL, DEFAULT 0, CHECK >= 0 | All-time longest streak |
| last_active_date | DATE | NULL | Last date with qualifying activity (UTC) |
| streak_multiplier | DECIMAL(3,2) | NOT NULL, DEFAULT 1.00 | Current reward multiplier |
| freeze_available | BOOLEAN | NOT NULL, DEFAULT true | Whether freeze can be used |
| freeze_last_used_at | TIMESTAMPTZ | NULL | Last freeze usage (30-day cooldown) |
| freeze_active | BOOLEAN | NOT NULL, DEFAULT false | Whether freeze is currently active for today |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- `idx_streaks_current` on (current_streak DESC) — leaderboard
- `idx_streaks_last_active` on (last_active_date) — daily streak check job

**Multiplier Logic**:
- 1-6 days: 1.0x
- 7-29 days: 1.1x
- 30-89 days: 1.25x
- 90-364 days: 1.5x
- 365+ days: 2.0x

---

### 4. endorsements

Peer-to-peer endorsements between humans.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| from_human_id | UUID | NOT NULL, FK → humans.id | Endorser |
| to_human_id | UUID | NOT NULL, FK → humans.id | Endorsed |
| reason | TEXT | NOT NULL, CHECK length >= 10 AND length <= 500 | Why endorsing |
| status | endorsement_status | NOT NULL, DEFAULT 'active' | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- `idx_endorsements_to` on (to_human_id, status) — count endorsements for reputation
- `idx_endorsements_from` on (from_human_id) — rate limit endorsements per user
- `idx_endorsements_unique` UNIQUE on (from_human_id, to_human_id) — one endorsement per pair

**Constraints**:
- `from_human_id != to_human_id` — no self-endorsement

---

### 5. fraud_scores

Current fraud score per human. One row per human.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| human_id | UUID | PK, FK → humans.id (CASCADE) | |
| total_score | INTEGER | NOT NULL, DEFAULT 0, CHECK >= 0 | Cumulative fraud score |
| phash_score | INTEGER | NOT NULL, DEFAULT 0 | Score from duplicate photo detection |
| velocity_score | INTEGER | NOT NULL, DEFAULT 0 | Score from submission rate anomalies |
| statistical_score | INTEGER | NOT NULL, DEFAULT 0 | Score from pattern anomalies |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'clean' | clean, flagged, suspended |
| flagged_at | TIMESTAMPTZ | NULL | When account was flagged |
| suspended_at | TIMESTAMPTZ | NULL | When account was suspended |
| last_scored_at | TIMESTAMPTZ | NULL | Last time fraud pipeline ran |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- `idx_fraud_scores_status` on (status) WHERE status != 'clean' — admin review queue
- `idx_fraud_scores_total` on (total_score DESC) — fraud monitoring

---

### 6. fraud_events

Append-only log of fraud detection events.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| human_id | UUID | NOT NULL, FK → humans.id | |
| evidence_id | UUID | NULL, FK → evidence.id | Triggering evidence (if applicable) |
| detection_type | VARCHAR(50) | NOT NULL | phash_duplicate, velocity_burst, gps_clustering, approval_anomaly, timing_pattern, honeypot |
| score_delta | INTEGER | NOT NULL | Points added to fraud score |
| details | JSONB | NOT NULL | Detection-specific details |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- `idx_fraud_events_human` on (human_id, created_at DESC) — human fraud history
- `idx_fraud_events_type` on (detection_type) — analytics
- `idx_fraud_events_evidence` on (evidence_id) — link to evidence

**Example `details` JSONB**:
- pHash: `{ "matchedEvidenceId": "uuid", "hammingDistance": 3, "hashA": "...", "hashB": "..." }`
- Velocity: `{ "submissionCount": 18, "windowMinutes": 10, "threshold": 15 }`
- GPS: `{ "varianceLat": 0.0001, "varianceLng": 0.0002, "submissionCount": 20 }`

---

### 7. fraud_admin_actions

Audit trail of admin actions on flagged/suspended accounts.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| human_id | UUID | NOT NULL, FK → humans.id | Flagged human |
| admin_id | UUID | NOT NULL | Admin who took action |
| action | fraud_action | NOT NULL | Action taken |
| reason | TEXT | NOT NULL, CHECK length >= 10 | Admin reasoning |
| fraud_score_before | INTEGER | NOT NULL | Score before action |
| fraud_score_after | INTEGER | NOT NULL | Score after action |
| metadata | JSONB | NULL | Additional context |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- `idx_fraud_admin_human` on (human_id, created_at DESC) — action history
- `idx_fraud_admin_admin` on (admin_id) — admin activity audit

---

### 8. evidence_phashes

Perceptual hashes of evidence photos for duplicate detection.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| evidence_id | UUID | NOT NULL, UNIQUE, FK → evidence.id (CASCADE) | |
| human_id | UUID | NOT NULL, FK → humans.id | For per-human lookup |
| phash | VARCHAR(16) | NOT NULL | 64-bit perceptual hash as hex string |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- `idx_phashes_human` on (human_id, created_at DESC) — per-human duplicate check
- `idx_phashes_hash` on (phash) — cross-human duplicate search
- `idx_phashes_evidence` UNIQUE on (evidence_id) — 1:1 with evidence

---

## Modified Tables

### humans (existing — Sprint 6)

**New columns** (add via migration):

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| portfolio_visibility | portfolio_visibility | NOT NULL, DEFAULT 'public' | Impact Portfolio visibility |

### humanProfiles (existing — Sprint 6)

No schema changes. `streakDays` and `totalMissionsCompleted` already exist — will be kept in sync by reputation workers.

---

## State Transitions

### Reputation Tier Transitions

```
newcomer (0-99)
    ↓ score >= 100
contributor (100-499)
    ↓ score >= 500
advocate (500-1999)
    ↓ score >= 2000
leader (2000-4999)
    ↓ score >= 5000
champion (5000+)
```

**Demotion**: When score drops below tier threshold → 7-day grace period → demote if not recovered.

### Fraud Status Transitions

```
clean
    ↓ total_score >= 50
flagged (submissions held)
    ↓ total_score >= 150
suspended (all frozen)
    ↓ admin action: unsuspend
clean (score reset)
```

Admin can also: `flagged → clean` (clear flag), `suspended → clean` (unsuspend + reset).

### Streak Lifecycle

```
0 days (no activity)
    ↓ first qualifying activity
1 day (streak started)
    ↓ activity next day
N days (streak growing)
    ↓ missed day + no freeze
0 days (streak broken)

OR:
    ↓ missed day + freeze active
N days (streak preserved, freeze consumed)
```

---

## Relationship Diagram

```
humans (1:1) ← reputation_scores
humans (1:N) ← reputation_history
humans (1:1) ← streaks
humans (1:1) ← fraud_scores
humans (1:N) ← fraud_events
humans (1:N) ← fraud_admin_actions (as target)
humans (1:N) ← fraud_admin_actions (as admin)
humans (1:N) ← endorsements (as endorser)
humans (1:N) ← endorsements (as endorsed)
evidence (1:1) ← evidence_phashes
evidence (1:N) ← fraud_events
```

---

## Redis Cache Keys

### Leaderboards (Sorted Sets, 1hr TTL)
```
leaderboard:{type}:{period}:{domain|global}:{location|global}
```
- `type`: reputation, tokens, missions, impact
- `period`: alltime, month, week
- `domain`: one of 15 domain keys OR "global"
- `location`: "global", "country:{ISO}", "city:{name}"

### Metrics Aggregates (HASHes, 1hr TTL)
```
metrics:aggregate:{metric}:{scope}
```
- `metrics:aggregate:total_missions:global`
- `metrics:aggregate:total_tokens:domain:environmental_protection`
- `metrics:aggregate:active_humans:country:US`

### Fraud Detection (Sorted Sets + Counters)
```
fraud:velocity:{humanId}:{tier}      # Sorted set of submission timestamps
fraud:phash:{humanId}                 # Sorted set of recent pHashes (7-day TTL)
fraud:score:{humanId}                 # Cached fraud score (1hr TTL)
```

### Streak Tracking
```
streak:last_active:{humanId}          # Last active date string (24hr TTL)
```

---

## Migration Order

1. Add new enums (reputation_tier, fraud_action, endorsement_status, portfolio_visibility)
2. Create reputation_scores table
3. Create reputation_history table
4. Create streaks table
5. Create endorsements table
6. Create fraud_scores table
7. Create fraud_events table
8. Create fraud_admin_actions table
9. Create evidence_phashes table
10. Add `portfolio_visibility` column to humans table
11. Backfill reputation_scores for existing humans (all start as newcomer, score 0)
12. Backfill streaks for existing humans
13. Backfill fraud_scores for existing humans
