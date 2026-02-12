# Data Model: Phase 3 Sprint 11 — Shadow Mode

**Feature Branch**: `012-phase3-shadow-mode`
**Date**: 2026-02-11

## Overview

Sprint 11 builds on the Sprint 10 foundation schema (8 tables, 3 extensions). The schema changes consist of:
- 1 new table: `validator_tier_changes` (tier change audit log)
- 1 new column on `validator_pool` (multi-region JSONB)
- 3 new queue names in QUEUE_NAMES constant
- New service layer entities (not persisted — in-memory/Redis)

All three core tables (`validator_pool`, `peer_evaluations`, `consensus_results`) exist from Sprint 10 migration `0009_phase3_foundation.sql`.

---

## Existing Tables Used (No Changes)

### peer_evaluations (Sprint 10)

Used as-is. Records individual validator assessments.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| submission_id | UUID | Content being evaluated |
| submission_type | content_type enum | problem/solution/debate/mission |
| validator_id | UUID FK → validator_pool | Assigned validator |
| validator_agent_id | UUID FK → agents | Denormalized agent reference |
| recommendation | guardrail_decision enum | approved/flagged/rejected (nullable until response) |
| confidence | DECIMAL(3,2) | 0.00-1.00 |
| reasoning | TEXT | 50-2000 chars validated at API layer |
| domain_relevance_score | INTEGER | 1-100 (maps from spec's 1-5 × 20) |
| accuracy_score | INTEGER | 1-100 (maps from spec's 1-5 × 20) |
| impact_score | INTEGER | 1-100 (maps from spec's 1-5 × 20) |
| safety_flagged | BOOLEAN | Default false; triggers immediate escalation |
| assigned_at | TIMESTAMPTZ | Default now() |
| responded_at | TIMESTAMPTZ | Set when validator submits response |
| expires_at | TIMESTAMPTZ | Default: assigned_at + 30 minutes |
| status | VARCHAR(20) | pending → completed/expired/cancelled |
| reward_credit_transaction_id | UUID | For Sprint 12 credit rewards |

**Key constraints**: UNIQUE on (submission_id, validator_id)

### consensus_results (Sprint 10)

Used as-is. Stores the aggregated consensus outcome + shadow comparison data.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| submission_id | UUID | |
| submission_type | content_type enum | |
| decision | consensus_decision enum | approved/rejected/escalated/expired |
| confidence | DECIMAL(3,2) | Weighted consensus confidence |
| quorum_size | INTEGER | Number of validators assigned |
| responses_received | INTEGER | Number of completed evaluations |
| weighted_approve | DECIMAL(8,4) | Sum of tier_weight × confidence for approve votes |
| weighted_reject | DECIMAL(8,4) | Sum for reject votes |
| weighted_escalate | DECIMAL(8,4) | Sum for escalate votes |
| layer_b_decision | guardrail_decision enum | Layer B result for shadow comparison |
| layer_b_alignment_score | DECIMAL(3,2) | Layer B alignment score |
| agrees_with_layer_b | BOOLEAN | Shadow comparison flag |
| consensus_latency_ms | INTEGER | Time from first assignment to consensus |
| was_early_consensus | BOOLEAN | True if consensus before all responses |
| escalation_reason | VARCHAR(100) | quorum_timeout / safety_flag / etc |

**Key constraints**: UNIQUE on (submission_id, submission_type) — ensures idempotent consensus

---

## Modified Tables

### validator_pool — Add Multi-Region Support

**New column** (migration `0010_shadow_mode.sql`):

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| home_regions | JSONB | '[]' | Array of { name: string, lat: number, lng: number }, max 3 |

**Schema**: `Array<{ name: string, lat: number, lng: number }>`

**Validation**: Zod schema at API boundary enforces:
- Array length 0-3 (empty array clears all home regions)
- Each entry: name (1-200 chars), lat (-90 to 90), lng (-180 to 180)

**Relationship to existing columns**: The existing `home_region_name` and `home_region_point` columns continue to represent the primary (first) home region. The new `home_regions` JSONB column stores all declared regions. On update, `home_region_name` and `home_region_point` are synced to `home_regions[0]`.

### validator_tier_changes — New Table (Tier History Log)

Records tier promotions and demotions for audit trail and the GET /validator/tier-history endpoint.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Default gen_random_uuid() |
| validator_id | UUID FK → validator_pool | |
| from_tier | validator_tier enum | Previous tier |
| to_tier | validator_tier enum | New tier |
| f1_score_at_change | DECIMAL(5,4) | F1 when tier changed |
| total_evaluations_at_change | INTEGER | Evaluation count when changed |
| changed_at | TIMESTAMPTZ | Default now() |

**Index**: `tier_changes_validator_idx` on (validator_id, changed_at DESC)

---

## State Machines

### Peer Evaluation Lifecycle

```
pending ──→ completed   (validator submits response)
  │
  ├──→ expired      (timeout handler marks past expires_at)
  │
  └──→ cancelled    (consensus reached before this validator responded)
```

### Consensus Result Creation

```
[evaluations accumulate]
  │
  ├── quorum met (≥3 completed) ──→ compute weighted consensus
  │     ├── weighted_approve ≥ 67% ──→ decision: "approved"
  │     ├── weighted_reject ≥ 67%  ──→ decision: "rejected"
  │     ├── any safety_flagged     ──→ decision: "escalated" (reason: "safety_flag")
  │     └── otherwise              ──→ decision: "escalated" (reason: "no_majority")
  │
  └── timeout (all expired, quorum not met) ──→ decision: "escalated" (reason: "quorum_timeout")
```

### Validator Tier Progression

```
apprentice ──→ journeyman   (F1 ≥ 0.85 after 50+ evals)
journeyman ──→ expert       (F1 ≥ 0.92 after 200+ evals)
expert     ──→ journeyman   (F1 < 0.92 after 30+ evals since last tier change)
journeyman ──→ apprentice   (F1 < 0.85 after 30+ evals since last tier change)
```

---

## New Queue Names

Added to `packages/shared/src/constants/queue.ts`:

```typescript
PEER_CONSENSUS: "peer-consensus"          // Triggered per submission
EVALUATION_TIMEOUT: "evaluation-timeout"  // 60s repeating schedule
CITY_METRICS: "city-metrics"              // Daily city aggregation
```

---

## Redis Cache Keys (New)

| Key Pattern | TTL | Purpose |
|-------------|-----|---------|
| `betterworld:shadow:agreement:overall` | 300s | Cached overall agreement rate |
| `betterworld:shadow:agreement:domain:{domain}` | 300s | Per-domain agreement rate |
| `betterworld:shadow:agreement:type:{type}` | 300s | Per-submission-type agreement rate |
| `betterworld:shadow:latency:percentiles` | 300s | p50/p95/p99 consensus latency |
| `betterworld:city:metrics:{city}` | 3600s | Pre-aggregated city dashboard data |
| `betterworld:validator:daily_count:{validatorId}:{date}` | 86400s | Daily evaluation count per validator |

---

## Index Utilization

Sprint 11 queries leverage existing Sprint 10 indexes:

| Query | Index Used |
|-------|-----------|
| Get pending evaluations for validator | `peer_eval_agent_status_idx` (validator_agent_id, status) |
| Check quorum (count completed for submission) | `peer_eval_submission_idx` (submission_id, submission_type) |
| Expire stale evaluations | `peer_eval_expires_idx` (expires_at) |
| Idempotent consensus insert | `consensus_unique_submission` (submission_id, submission_type) |
| Filter active validators by tier | `validator_pool_tier_idx` (tier) + `validator_pool_is_active_idx` (is_active) |
| Agreement dashboard time range | `consensus_created_idx` (created_at) |
| Agreement by decision | `consensus_decision_idx` (decision) |

No new indexes required.

---

## Entity Relationship Summary

```
agents (1) ←─── (1) validator_pool (1) ←─── (many) peer_evaluations
                        │                              │
                        │                              └──→ consensus_results (1 per submission)
                        │                                      │
                        └──── (many) validator_tier_changes     └── layer_b_decision (from guardrail_evaluations)

problems/solutions/debates ←── submission_id ── peer_evaluations
                           ←── submission_id ── consensus_results
```
