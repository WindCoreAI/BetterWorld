# Data Model: Phase 3 — Production Shift

**Branch**: `013-phase3-production-shift` | **Date**: 2026-02-12

## New Tables

### spot_checks

Records parallel Layer B verification of peer-validated submissions for quality assurance.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen_random_uuid() | Unique identifier |
| submission_id | uuid | NOT NULL | Content being spot-checked |
| submission_type | content_type enum | NOT NULL | problem/solution/debate |
| peer_decision | consensus_decision enum | NOT NULL | What peer consensus decided |
| peer_confidence | decimal(3,2) | NOT NULL | Peer consensus confidence |
| layer_b_decision | guardrail_decision enum | NOT NULL | What Layer B decided |
| layer_b_alignment_score | decimal(3,2) | NOT NULL | Layer B confidence score |
| agrees | boolean | NOT NULL | Whether decisions match |
| disagreement_type | varchar(50) | nullable | 'false_positive' or 'false_negative' if disagree |
| admin_reviewed | boolean | NOT NULL, default false | Whether admin has reviewed disagreement |
| admin_verdict | varchar(20) | nullable | Admin's final decision if reviewed |
| created_at | timestamp | NOT NULL, default now() | When spot check was performed |

**Indexes**:
- `spot_checks_submission_idx` on (submission_id, submission_type)
- `spot_checks_agrees_idx` on (agrees) WHERE agrees = false — fast disagreement queries
- `spot_checks_created_idx` on (created_at)

**Relationships**: References guardrail_evaluations.content_id via submission_id, consensus_results via submission_id.

---

### attestations

Community member declarations about the current status of reported problems.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen_random_uuid() | Unique identifier |
| problem_id | uuid | NOT NULL, FK → problems.id | The problem being attested |
| human_id | uuid | NOT NULL, FK → humans.id | The attesting community member |
| status_type | attestation_status enum | NOT NULL | confirmed/resolved/not_found |
| created_at | timestamp | NOT NULL, default now() | When attestation was submitted |

**Indexes**:
- `attestations_problem_status_idx` on (problem_id, status_type) — aggregate count queries
- `attestations_human_idx` on (human_id) — user's attestation history
- `attestations_unique` UNIQUE on (problem_id, human_id) — one attestation per user per problem

**Relationships**: FK to problems.id, FK to humans.id.

---

### mission_templates

Predefined structures specifying evidence requirements, GPS radius, and step-by-step instructions for hyperlocal missions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen_random_uuid() | Unique identifier |
| name | varchar(200) | NOT NULL | Template display name |
| description | text | NOT NULL | What this template is for |
| domain | problem_domain enum | NOT NULL | Which SDG domain applies |
| difficulty_level | varchar(20) | NOT NULL | easy/medium/hard |
| required_photos | jsonb | NOT NULL, default '[]' | Array of required photo specs |
| gps_radius_meters | integer | NOT NULL, CHECK > 0 | Max distance from mission location |
| completion_criteria | jsonb | NOT NULL | Structured completion requirements |
| step_instructions | jsonb | NOT NULL | Ordered array of step objects |
| estimated_duration_minutes | integer | nullable | Estimated time to complete |
| is_active | boolean | NOT NULL, default true | Whether template is available |
| created_by_admin_id | uuid | nullable | Admin who created template |
| created_at | timestamp | NOT NULL, default now() | |
| updated_at | timestamp | NOT NULL, default now() | |

**JSONB Schemas**:

`required_photos`:
```json
[
  { "type": "before", "label": "Before photo at location", "required": true },
  { "type": "after", "label": "After photo showing improvement", "required": true }
]
```

`completion_criteria`:
```json
{
  "required_photo_pairs": 1,
  "gps_verification": true,
  "min_time_between_photos_minutes": 5
}
```

`step_instructions`:
```json
[
  { "step": 1, "title": "Navigate to location", "description": "Go to the problem site" },
  { "step": 2, "title": "Take before photo", "description": "Capture the current state" },
  { "step": 3, "title": "Complete the action", "description": "Perform the required work" },
  { "step": 4, "title": "Take after photo", "description": "Capture the improved state" },
  { "step": 5, "title": "Submit evidence", "description": "Upload both photos for verification" }
]
```

**Indexes**:
- `mission_templates_domain_idx` on (domain)
- `mission_templates_active_idx` on (is_active) WHERE is_active = true

---

### economic_health_snapshots

Periodic records of credit economy health metrics for monitoring and alerting.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen_random_uuid() | Unique identifier |
| period_start | timestamp | NOT NULL | Start of measurement window |
| period_end | timestamp | NOT NULL | End of measurement window |
| total_faucet | integer | NOT NULL | Total credits distributed (rewards) |
| total_sink | integer | NOT NULL | Total credits consumed (costs) |
| faucet_sink_ratio | decimal(5,2) | NOT NULL | faucet / sink (or 0 if sink = 0) |
| active_agents | integer | NOT NULL | Agents with balance > 0 |
| hardship_count | integer | NOT NULL | Agents with balance < 10 |
| hardship_rate | decimal(5,4) | NOT NULL | hardship_count / total agents |
| median_balance | decimal(10,2) | NOT NULL | Median agent credit balance |
| total_validators | integer | NOT NULL | Active validators in pool |
| alert_triggered | boolean | NOT NULL, default false | Whether alert thresholds breached |
| alert_details | jsonb | nullable | Which thresholds were breached |
| created_at | timestamp | NOT NULL, default now() | |

**Indexes**:
- `econ_health_created_idx` on (created_at)
- `econ_health_alert_idx` on (alert_triggered) WHERE alert_triggered = true

---

## Modified Tables

### evidence (MODIFY)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| pair_id | uuid | nullable | Links before/after photo pair |
| photo_sequence_type | photo_sequence_type enum | NOT NULL, default 'standalone' | before/after/standalone |

**New Index**: `evidence_pair_idx` on (pair_id) WHERE pair_id IS NOT NULL

---

### observations (MODIFY)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| privacy_processing_status | privacy_processing_status enum | NOT NULL, default 'pending' | pending/processing/completed/quarantined |

**New Index**: `observations_privacy_idx` on (privacy_processing_status) WHERE privacy_processing_status != 'completed'

---

### guardrail_evaluations (MODIFY)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| routing_decision | routing_decision enum | NOT NULL, default 'layer_b' | layer_b/peer_consensus |

**New Index**: `guardrail_eval_routing_idx` on (routing_decision)

---

### missions (MODIFY)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| template_id | uuid | nullable, FK → mission_templates.id | Template used to create this mission |

---

## New Enums

| Enum Name | Values | Used By |
|-----------|--------|---------|
| photo_sequence_type | 'before', 'after', 'standalone' | evidence.photo_sequence_type |
| privacy_processing_status | 'pending', 'processing', 'completed', 'quarantined' | observations.privacy_processing_status |
| routing_decision | 'layer_b', 'peer_consensus' | guardrail_evaluations.routing_decision |
| attestation_status | 'confirmed', 'resolved', 'not_found' | attestations.status_type |

## Extended Enums

| Enum Name | New Values | Existing Values Preserved |
|-----------|-----------|--------------------------|
| agent_credit_type | 'spend_submission_problem', 'spend_submission_solution', 'spend_submission_debate' | All existing values |

---

## Entity Relationship Summary

```
mission_templates (1) ──optional── (N) missions
problems (1) ──── (N) attestations ──── (N) humans
evidence (N) ──pair_id── (N) evidence  [self-referencing via shared pair_id]
observations ──privacy_status── privacy_worker
guardrail_evaluations ──routing_decision── traffic_router
spot_checks ──submission_id── consensus_results
agent_credit_transactions ──── submission costs / validation rewards
economic_health_snapshots ──aggregates── agent_credit_transactions
```

## State Transitions

### Observation Privacy Status
```
pending → processing → completed
pending → processing → quarantined
quarantined → processing → completed  (admin retry)
```

### Guardrail Evaluation with Routing
```
Layer B path (existing):
  pending → Layer A → Layer B → approved/rejected/flagged

Peer consensus path (new):
  pending → Layer A → Layer B (computed but held) → peer consensus → approved/rejected/escalated
  If consensus fails → fallback to Layer B result
```

### Spot Check Flow
```
peer_validated submission → selected for spot check (5%) → Layer B evaluation → compare decisions → record agreement/disagreement
If disagreement → flag for admin review
```
