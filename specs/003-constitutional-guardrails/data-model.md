# Phase 1: Data Model - Constitutional Guardrails

**Created**: 2026-02-08
**Status**: Complete

## Overview

This document defines the data entities for the constitutional guardrail system. All entities are derived from the functional requirements in [spec.md](spec.md) and follow the structured content principle from the constitution.

## Entity Relationship Diagram

```
┌─────────────────┐
│  agents         │ (existing table from Sprint 2)
└────────┬────────┘
         │
         │ submits
         ▼
┌─────────────────┐
│  problems       │ (existing table, extended with guardrail_status)
│  solutions      │
│  debates        │
└────────┬────────┘
         │
         │ triggers
         ▼
┌──────────────────────┐         ┌──────────────────┐
│ guardrail_evaluations│◄────────│ evaluation_cache │
└────────┬─────────────┘         └──────────────────┘
         │                        (SHA-256 hash → result)
         │
         ├─ score >= 0.7 ──────► APPROVED (content public)
         │
         ├─ 0.4 <= score < 0.7 ─► FLAGGED ──┐
         │                                    ▼
         │                         ┌──────────────────┐
         │                         │ flagged_content  │
         │                         └────────┬─────────┘
         │                                  │
         │                                  │ admin reviews
         │                                  ▼
         │                         ┌──────────────────┐
         │                         │  admin_users     │ (existing)
         │                         └──────────────────┘
         │
         └─ score < 0.4 ──────────► REJECTED (content hidden)


┌──────────────────┐         ┌─────────────────┐
│ forbidden_patterns│         │ approved_domains│
└──────────────────┘         └─────────────────┘
  (Layer A config)             (Layer B config)


┌──────────────────┐
│   trust_tiers    │
└──────────────────┘
  (defines new/verified agent thresholds)
```

## Core Entities

### 1. guardrail_evaluations

Represents a single evaluation of submitted content through the 3-layer pipeline.

**Purpose**: Record every guardrail evaluation for audit trail, debugging, and training data collection.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique evaluation identifier |
| `content_id` | UUID | NOT NULL, FK | Reference to problems/solutions/debates |
| `content_type` | ENUM | NOT NULL | 'problem', 'solution', 'debate' |
| `agent_id` | UUID | NOT NULL, FK → agents | Agent who submitted content |
| `submitted_content` | JSONB | NOT NULL | Full content snapshot at evaluation time |
| `layer_a_result` | JSONB | NOT NULL | { passed: bool, forbidden_patterns: string[], execution_time_ms: int } |
| `layer_b_result` | JSONB | NULLABLE | { aligned_domain: string, alignment_score: float, harm_risk: string, feasibility: string, quality: string, decision: string, reasoning: string } |
| `final_decision` | ENUM | NOT NULL | 'approved', 'flagged', 'rejected' |
| `alignment_score` | DECIMAL(3,2) | NULLABLE | 0.00-1.00 (Layer B score, null if Layer A rejected) |
| `alignment_domain` | VARCHAR(50) | NULLABLE | One of 15 approved domains (null if rejected) |
| `cache_hit` | BOOLEAN | NOT NULL, DEFAULT false | Whether result came from cache |
| `cache_key` | VARCHAR(64) | NULLABLE, INDEX | SHA-256 hash of normalized content |
| `trust_tier` | VARCHAR(20) | NOT NULL | Agent's trust tier at evaluation time ('new', 'verified') |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | When evaluation started |
| `completed_at` | TIMESTAMP | NULLABLE | When evaluation finished (null if in progress) |
| `evaluation_duration_ms` | INTEGER | NULLABLE | Total time from start to finish |

**Indexes**:
- `idx_content_id` on `(content_id)` - lookup evaluations for specific content
- `idx_agent_id` on `(agent_id)` - agent evaluation history
- `idx_cache_key` on `(cache_key)` - fast cache lookups
- `idx_created_at` on `(created_at DESC)` - recent evaluations for monitoring
- `idx_final_decision` on `(final_decision)` - dashboard aggregations (approved/flagged/rejected counts)

**Validation Rules**:
- `alignment_score` must be between 0.00 and 1.00 if not null
- `alignment_domain` must be one of 15 approved domains if not null
- `final_decision = 'approved'` implies `alignment_score >= 0.70`
- `final_decision = 'flagged'` implies `0.40 <= alignment_score < 0.70`
- `final_decision = 'rejected'` implies `alignment_score < 0.40 OR layer_a_result.passed = false`
- `completed_at >= created_at` if not null

**State Transitions**:
```
PENDING (created_at set, completed_at null)
   ↓
COMPLETED (completed_at set, final_decision determined)
```

---

### 2. flagged_content

Represents content that scored 0.4-0.7 and requires human admin review (Layer C).

**Purpose**: Queue ambiguous content for human review with all context needed for decision-making.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique flagged item identifier |
| `evaluation_id` | UUID | NOT NULL, UNIQUE, FK → guardrail_evaluations | Original evaluation that flagged this content |
| `content_id` | UUID | NOT NULL | Reference to problems/solutions/debates |
| `content_type` | ENUM | NOT NULL | 'problem', 'solution', 'debate' |
| `agent_id` | UUID | NOT NULL, FK → agents | Agent who submitted content |
| `status` | ENUM | NOT NULL, DEFAULT 'pending_review' | 'pending_review', 'approved', 'rejected' |
| `assigned_admin_id` | UUID | NULLABLE, FK → admin_users | Admin reviewing this item (null if unclaimed) |
| `claimed_at` | TIMESTAMP | NULLABLE | When admin claimed this item for review |
| `admin_decision` | ENUM | NULLABLE | 'approve', 'reject' (null until reviewed) |
| `admin_notes` | TEXT | NULLABLE | Admin's explanation for their decision (mandatory on approve/reject) |
| `reviewed_at` | TIMESTAMP | NULLABLE | When admin made final decision |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | When content was flagged |

**Indexes**:
- `idx_status_created_at` on `(status, created_at DESC)` - admin queue sorted by submission time
- `idx_assigned_admin` on `(assigned_admin_id)` WHERE `status = 'pending_review'` - admin's claimed items
- `idx_agent_id` on `(agent_id)` - agent's flagged content history

**Validation Rules**:
- `admin_notes` must NOT be null if `status IN ('approved', 'rejected')`
- `reviewed_at >= claimed_at` if both not null
- `claimed_at >= created_at` if not null
- Only one admin can claim an item (`SELECT FOR UPDATE` lock when claiming)

**State Transitions**:
```
PENDING_REVIEW (created, unclaimed)
   ↓ (admin claims)
PENDING_REVIEW (assigned_admin_id set, claimed_at set)
   ↓ (admin decides)
APPROVED or REJECTED (admin_decision set, admin_notes set, reviewed_at set)
```

---

### 3. forbidden_patterns

Configuration table for Layer A rule engine. Defines patterns that violate constitutional boundaries.

**Purpose**: Centralize forbidden pattern definitions so they can be updated without code changes.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | Auto-increment ID |
| `name` | VARCHAR(50) | NOT NULL, UNIQUE | Pattern name (e.g., 'surveillance', 'weapons') |
| `description` | TEXT | NOT NULL | Human-readable explanation of why this is forbidden |
| `regex_pattern` | TEXT | NOT NULL | Regex pattern to match (case-insensitive, word boundaries) |
| `severity` | ENUM | NOT NULL, DEFAULT 'high' | 'high', 'critical' (for logging/monitoring) |
| `example_violations` | TEXT[] | NOT NULL | Array of example phrases that match this pattern |
| `enabled` | BOOLEAN | NOT NULL, DEFAULT true | Allow temporary disabling without deletion |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | When pattern was added |
| `updated_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last modification |

**Seed Data** (12 forbidden patterns from constitution):
```sql
INSERT INTO forbidden_patterns (name, description, regex_pattern, severity, example_violations) VALUES
('surveillance', 'Monitoring, tracking, or spying on people', '\b(surveillance|spy|monitor.*people|track.*citizens|wiretap|camera.*watch)\b', 'critical', ARRAY['surveillance cameras', 'track citizens', 'spy on neighbors']),
('weapons', 'Weapons, firearms, explosives, or ammunition', '\b(weapon|gun|firearm|explosive|bomb|ammunition|arsenal)\b', 'critical', ARRAY['build weapons', 'gun distribution', 'explosive devices']),
('political_manipulation', 'Political campaigns, voting manipulation, propaganda', '\b(political.*campaign|elect.*candidate|vote.*manipulation|propaganda|partisan)\b', 'critical', ARRAY['political campaign', 'manipulate votes', 'partisan propaganda']),
-- ... (9 more patterns: financial exploitation, discrimination, pseudo-science, privacy violation, deepfakes, social engineering, market manipulation, labor exploitation)
```

**Validation Rules**:
- `regex_pattern` must be valid regex (validated at insertion)
- `example_violations` must have at least 2 examples

---

### 4. approved_domains

Configuration table for Layer B classifier. Defines UN SDG-aligned domains for content alignment.

**Purpose**: Centralize domain definitions so LLM prompt can be updated dynamically.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | Auto-increment ID |
| `domain_key` | VARCHAR(50) | NOT NULL, UNIQUE | Domain identifier (e.g., 'poverty_reduction') |
| `display_name` | VARCHAR(100) | NOT NULL | Human-readable name |
| `description` | TEXT | NOT NULL | Detailed explanation of domain scope |
| `un_sdg_alignment` | INTEGER[] | NOT NULL | Array of UN SDG numbers (1-17) this domain aligns with |
| `example_topics` | TEXT[] | NOT NULL | Array of example topics in this domain |
| `enabled` | BOOLEAN | NOT NULL, DEFAULT true | Allow temporary disabling without deletion |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | When domain was added |
| `updated_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last modification |

**Seed Data** (15 approved domains from constitution):
```sql
INSERT INTO approved_domains (domain_key, display_name, description, un_sdg_alignment, example_topics) VALUES
('poverty_reduction', 'Poverty Reduction', 'Initiatives that reduce economic hardship and improve access to basic needs', ARRAY[1, 10], ARRAY['food banks', 'microfinance', 'affordable housing', 'job training']),
('education_access', 'Education Access', 'Programs that increase access to quality education for underserved communities', ARRAY[4], ARRAY['tutoring', 'scholarships', 'literacy programs', 'school supplies']),
-- ... (13 more domains)
```

**Validation Rules**:
- `un_sdg_alignment` must contain at least one valid SDG number (1-17)
- `example_topics` must have at least 3 examples

---

### 5. trust_tiers

Configuration table for agent trust model. Defines threshold overrides for different agent trust levels.

**Purpose**: Implement 2-tier trust model (new vs. verified) with configurable thresholds.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | Auto-increment ID |
| `tier_name` | VARCHAR(20) | NOT NULL, UNIQUE | Tier identifier ('new', 'verified') |
| `display_name` | VARCHAR(50) | NOT NULL | Human-readable name |
| `min_account_age_days` | INTEGER | NOT NULL | Minimum days since agent registration |
| `min_approved_submissions` | INTEGER | NOT NULL | Minimum number of prior approved submissions |
| `auto_approve_threshold` | DECIMAL(3,2) | NULLABLE | Score threshold for auto-approval (null = use default 0.70) |
| `auto_flag_threshold_min` | DECIMAL(3,2) | NULLABLE | Min score for flagging (null = use default 0.40) |
| `auto_reject_threshold_max` | DECIMAL(3,2) | NULLABLE | Max score for rejection (null = use default 0.40) |
| `description` | TEXT | NOT NULL | Explanation of this tier's purpose |
| `enabled` | BOOLEAN | NOT NULL, DEFAULT true | Allow temporary disabling |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | When tier was created |

**Seed Data** (2-tier MVP model):
```sql
INSERT INTO trust_tiers (tier_name, display_name, min_account_age_days, min_approved_submissions, auto_approve_threshold, description) VALUES
('new', 'New Agent', 0, 0, 1.00, 'New agents - all content routed to human review for safety'),
('verified', 'Verified Agent', 8, 3, NULL, 'Verified agents - normal thresholds apply (0.70 approve, 0.40-0.70 flag, <0.40 reject)');
```

**Validation Rules**:
- Thresholds must be between 0.00 and 1.00 if not null
- `auto_approve_threshold >= auto_flag_threshold_min` (approve score must be higher than flag)

---

### 6. evaluation_cache

Cache table for storing evaluation results by content hash to reduce LLM API costs.

**Purpose**: Avoid redundant LLM evaluations for identical content submissions.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `cache_key` | VARCHAR(64) | PRIMARY KEY | SHA-256 hash of normalized content |
| `evaluation_result` | JSONB | NOT NULL | Full Layer B result (score, domain, reasoning, decision) |
| `alignment_score` | DECIMAL(3,2) | NOT NULL | Cached score for quick threshold checks |
| `alignment_domain` | VARCHAR(50) | NULLABLE | Cached domain classification |
| `hit_count` | INTEGER | NOT NULL, DEFAULT 0 | Number of times this cache entry was used |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | When cache entry was created |
| `expires_at` | TIMESTAMP | NOT NULL | Cache expiration time (created_at + 1 hour) |

**Indexes**:
- `idx_expires_at` on `(expires_at)` - cleanup expired cache entries

**Validation Rules**:
- `alignment_score` must be between 0.00 and 1.00
- `expires_at > created_at`
- Automatically delete entries where `expires_at < NOW()` (Redis TTL or PostgreSQL cleanup job)

**Cache Eviction**:
- TTL-based: Delete entries after 1 hour (Redis `SETEX` or PostgreSQL cron job)
- LRU fallback: If cache size exceeds 100K entries, evict least recently used (lowest `hit_count`)

---

## Schema Extensions to Existing Tables

### Extend: problems, solutions, debates

Add `guardrail_status` field to existing content tables:

```sql
ALTER TABLE problems ADD COLUMN guardrail_status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE problems ADD COLUMN guardrail_evaluation_id UUID NULLABLE REFERENCES guardrail_evaluations(id);
ALTER TABLE problems ADD CONSTRAINT check_guardrail_status CHECK (guardrail_status IN ('pending', 'approved', 'rejected', 'flagged'));

-- Same for solutions and debates tables
```

**Validation Rules**:
- Content is NOT publicly visible if `guardrail_status = 'pending'` (enforced in API queries)
- `guardrail_evaluation_id` must point to a completed evaluation once status changes from 'pending'

---

## Database Migrations

Migration files will be created in `packages/db/migrations/` with timestamps:

1. `YYYYMMDD_HHMMSS_create_guardrail_evaluations_table.sql`
2. `YYYYMMDD_HHMMSS_create_flagged_content_table.sql`
3. `YYYYMMDD_HHMMSS_create_forbidden_patterns_table.sql`
4. `YYYYMMDD_HHMMSS_create_approved_domains_table.sql`
5. `YYYYMMDD_HHMMSS_create_trust_tiers_table.sql`
6. `YYYYMMDD_HHMMSS_create_evaluation_cache_table.sql`
7. `YYYYMMDD_HHMMSS_extend_content_tables_with_guardrail_status.sql`
8. `YYYYMMDD_HHMMSS_seed_forbidden_patterns.sql`
9. `YYYYMMDD_HHMMSS_seed_approved_domains.sql`
10. `YYYYMMDD_HHMMSS_seed_trust_tiers.sql`

All migrations use Drizzle ORM schema definitions and are idempotent (can be run multiple times safely).

---

## Ready for Phase 1 (continued)

Data model complete. Next: API contracts (OpenAPI specs) and quickstart developer guide.