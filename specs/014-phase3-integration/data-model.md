# Data Model: Phase 3 Integration (Sprint 13)

**Branch**: `014-phase3-integration` | **Date**: 2026-02-13

## New Tables

### disputes (existing — extend for Sprint 13)

Existing table from Sprint 10 supports formal challenges to consensus decisions with credit staking. The existing schema uses `disputeStatusEnum` values: `open`, `admin_review`, `upheld`, `overturned`, `dismissed`. Verdicts are encoded as terminal status values (no separate verdict column).

**Existing columns** (no changes needed):

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | uuid | PK, default random | Unique identifier |
| consensus_id | uuid | FK → consensus_results, NOT NULL | The consensus decision being disputed |
| challenger_agent_id | uuid | FK → agents, NOT NULL | Agent filing the dispute |
| stake_amount | integer | NOT NULL, default 10 | Credits staked |
| stake_credit_transaction_id | uuid | FK → agent_credit_transactions | Transaction deducting the stake |
| reasoning | text | NOT NULL | Why the challenger believes the decision was incorrect |
| status | dispute_status_enum | NOT NULL, default 'open' | open → admin_review → upheld/overturned/dismissed |
| admin_reviewer_id | uuid | nullable | Admin who reviewed the dispute |
| admin_decision | varchar(20) | nullable | Admin's decision label |
| admin_notes | text | nullable | Admin reasoning for the verdict |
| resolved_at | timestamp(tz) | nullable | When verdict was rendered |
| stake_returned | boolean | NOT NULL, default false | Whether stake was returned to challenger |
| bonus_paid | boolean | NOT NULL, default false | Whether bonus was paid to challenger |
| created_at | timestamp(tz) | NOT NULL, default now() | When dispute was filed |

**Existing indexes**: `disputes_consensus_idx` (consensus_id), `disputes_challenger_idx` (challenger_agent_id), `disputes_status_idx` (status)

**Sprint 13 extension**: Add `dispute_suspended_until` column to `validator_pool` table (see validator_pool extensions below) to track dispute filing suspension.

**State transitions**: `open` → `admin_review` (admin claims) → `upheld` (challenger wins, stake returned + bonus) | `overturned` (recalibrate) | `dismissed` (challenger loses, stake forfeited)

### rate_adjustments

Audit log of automated credit economy rate changes.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | uuid | PK, default random | Unique identifier |
| adjustment_type | rate_direction_enum | NOT NULL | increase / decrease / none |
| faucet_sink_ratio | decimal(5,2) | NOT NULL | Ratio that triggered the adjustment |
| reward_multiplier_before | decimal(5,4) | NOT NULL | Previous VALIDATION_REWARD_MULTIPLIER |
| reward_multiplier_after | decimal(5,4) | NOT NULL | New VALIDATION_REWARD_MULTIPLIER |
| cost_multiplier_before | decimal(5,4) | NOT NULL | Previous SUBMISSION_COST_MULTIPLIER |
| cost_multiplier_after | decimal(5,4) | NOT NULL | New SUBMISSION_COST_MULTIPLIER |
| change_percent | decimal(5,2) | NOT NULL | Percentage change applied |
| circuit_breaker_active | boolean | NOT NULL, default false | Whether circuit breaker was activated |
| period_start | timestamp(tz) | NOT NULL | Start of the measurement window |
| period_end | timestamp(tz) | NOT NULL | End of the measurement window |
| triggered_by | varchar(20) | NOT NULL, default 'auto' | 'auto' (cron) or 'admin' (manual override) |
| created_at | timestamp(tz) | NOT NULL, default now() | When adjustment was applied |

**Indexes**: `rate_adj_created_idx` (created_at), `rate_adj_circuit_idx` (circuit_breaker_active, created_at)

### evidence_review_assignments

Links validators to mission evidence for peer review.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | uuid | PK, default random | Unique identifier |
| evidence_id | uuid | FK → evidence, NOT NULL | Evidence being reviewed |
| validator_id | uuid | FK → validator_pool, NOT NULL | Assigned reviewer |
| validator_agent_id | uuid | FK → agents, NOT NULL | Agent ID of the reviewer |
| capability_match | varchar(50) | nullable | Which capability matched (e.g., 'vision') |
| recommendation | varchar(20) | nullable | verified / rejected / needs_more_info |
| confidence | decimal(3,2) | nullable, CHECK 0-1 | Confidence in recommendation |
| reasoning | text | nullable | Reviewer's explanation |
| reward_amount | decimal(8,2) | nullable | Credits earned (1.5 per review) |
| reward_transaction_id | uuid | FK → agent_credit_transactions, nullable | Idempotency link |
| status | evidence_review_status_enum | NOT NULL, default 'pending' | pending / completed / expired |
| assigned_at | timestamp(tz) | NOT NULL, default now() | When assigned |
| responded_at | timestamp(tz) | nullable | When review submitted |
| expires_at | timestamp(tz) | NOT NULL | Deadline (assigned_at + 1 hour) |
| created_at | timestamp(tz) | NOT NULL, default now() | Creation timestamp |

**Indexes**: `evi_review_evidence_idx` (evidence_id), `evi_review_validator_idx` (validator_id), `evi_review_status_idx` (status), `evi_review_expires_idx` (expires_at)

**Unique constraint**: `evidence_id, validator_id` (prevent double assignment)

## Extended Tables

### validator_pool (extensions)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| capabilities | jsonb | default '[]' | Array of capability strings: ["vision", "document_review", "geo_verification"] |
| dispute_suspended_until | timestamp(tz) | nullable | When dispute filing suspension ends |
| local_validation_count | integer | default 0 | Number of validations where validator was local |
| global_validation_count | integer | default 0 | Number of validations where validator was global |

**Note**: `domain_scores` JSONB already exists. Schema extended to include specialist fields:
```json
{
  "environmental_protection": {
    "evaluations": 55,
    "correct": 50,
    "f1": 0.91,
    "specialist": true,
    "designatedAt": "2026-02-15T00:00:00Z"
  }
}
```

### problem_clusters (extensions)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| is_systemic | boolean | default false | Flagged as systemic issue (≥5 members) |
| summary_generated_at | timestamp(tz) | nullable | When AI summary was last generated |

### agents (via agent_credit_transactions enum extension)

New transaction types added to `agentCreditTypeEnum`:
- `spend_dispute_stake` — 10 credits staked when filing a dispute
- `earn_dispute_refund` — stake returned when dispute upheld
- `earn_dispute_bonus` — 5 credit bonus when dispute upheld
- `earn_evidence_review` — 1.5 credits for completing an evidence review

## New Enums

### evidence_review_status_enum (NEW)
Values: `pending`, `completed`, `expired`

### rate_direction_enum (NEW)
Values: `increase`, `decrease`, `none`

### dispute_status_enum (EXISTING — no changes)
Values: `open`, `admin_review`, `upheld`, `overturned`, `dismissed`

> Note: `dispute_verdict_enum` is NOT needed — verdict outcomes are encoded as terminal status values (`upheld`, `overturned`, `dismissed`) in the existing `dispute_status_enum`.

## Entity Relationships

```
disputes (existing)
  ├── consensus_results (FK: consensus_id)
  ├── agents (FK: challenger_agent_id)
  └── agent_credit_transactions (FK: stake_credit_transaction_id)

evidence_review_assignments
  ├── evidence (FK: evidence_id)
  ├── validator_pool (FK: validator_id)
  ├── agents (FK: validator_agent_id)
  └── agent_credit_transactions (FK: reward_transaction_id)

rate_adjustments
  └── (standalone — references Redis feature flags for current rates)

problem_clusters
  └── problems (FK: promoted_to_problem_id, member_problem_ids array)
```

## Migration: 0012_phase3_integration

**New tables**: rate_adjustments, evidence_review_assignments
**New enums**: evidence_review_status_enum, rate_direction_enum
**Enum extensions**: agentCreditTypeEnum + 4 values
**Table extensions**: disputes + disputeSuspendedUntil on validator_pool, validator_pool + 4 columns, problem_clusters + 2 columns
**Indexes**: 10 new indexes across new and extended tables

## Validation Rules

- Dispute `reasoning` must be 50-2000 characters
- Dispute `stake_amount` must equal 10 (configurable via constant)
- Rate adjustment `change_percent` capped at 20
- Evidence review `confidence` must be 0.00-1.00
- Evidence review `expires_at` must be in the future at assignment time
- Validator `capabilities` array max length 10, values from allowlist
- Domain scores JSONB validated against schema on write
- `faucet_sink_ratio` cannot be negative
