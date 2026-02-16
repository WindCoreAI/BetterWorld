# Data Model: Community Identity & Visible Growth

**Feature**: 017-community-identity-growth
**Date**: 2026-02-16
**Depends on**: Sprint 16 schema (migration 0015)

## New Tables

### 1. group_milestones

Tracks collective achievement progress for domains and cities.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default random | |
| group_type | group_type_enum | NOT NULL | 'domain' or 'city' |
| group_value | varchar(100) | NOT NULL | Domain slug or city slug |
| milestone_type | milestone_type_enum | NOT NULL | Type of milestone |
| target_value | integer | NOT NULL | Threshold to reach |
| current_value | integer | NOT NULL, default 0 | Progress counter |
| reached_at | timestamptz | NULL | When threshold was met |
| banner_expires_at | timestamptz | NULL | reached_at + 7 days |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**Unique constraint**: (group_type, group_value, milestone_type, target_value)

**Indexes**:
- `group_milestones_group_idx` ON (group_type, group_value)
- `group_milestones_active_banner_idx` ON (banner_expires_at) WHERE banner_expires_at IS NOT NULL
- `group_milestones_unreached_idx` ON (group_type, group_value) WHERE reached_at IS NULL

### 2. review_feedback

Actionable feedback delivered to participants after consensus decisions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default random | |
| recipient_human_id | uuid | FK → humans, NULL | Human recipient |
| recipient_agent_id | uuid | FK → agents, NULL | Agent recipient |
| feedback_type | feedback_type_enum | NOT NULL | Type of feedback |
| reference_id | uuid | NOT NULL | ID of triggering item |
| reference_type | varchar(50) | NOT NULL | 'evidence', 'peer_evaluation', 'consensus_result' |
| message | text | NOT NULL | Feedback message |
| improvement_tips | jsonb | default '[]' | Structured improvement suggestions |
| is_read | boolean | NOT NULL, default false | |
| read_at | timestamptz | NULL | |
| created_at | timestamptz | NOT NULL, default now() | |

**Check constraint**: At least one of recipient_human_id or recipient_agent_id must be non-null.

**Indexes**:
- `review_feedback_human_unread_idx` ON (recipient_human_id, is_read) WHERE recipient_human_id IS NOT NULL
- `review_feedback_agent_unread_idx` ON (recipient_agent_id, is_read) WHERE recipient_agent_id IS NOT NULL
- `review_feedback_created_idx` ON (created_at)
- `review_feedback_reference_idx` ON (reference_id, reference_type)

### 3. intelligence_reports

Monthly community intelligence reports aggregating platform patterns.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default random | |
| report_month | varchar(7) | NOT NULL, UNIQUE | 'YYYY-MM' format |
| report_data | jsonb | NOT NULL | Structured report content |
| generated_at | timestamptz | NOT NULL | When generation completed |
| created_at | timestamptz | NOT NULL, default now() | |

**report_data JSONB structure**:
```json
{
  "systemicIssues": [{ "clusterId": "uuid", "title": "string", "memberCount": 0, "cities": ["string"] }],
  "crossCityAdoptions": [{ "solutionId": "uuid", "title": "string", "adoptedCities": ["string"] }],
  "domainTrends": [{ "domain": "string", "problemsDelta": 0, "missionsDelta": 0, "membersDelta": 0 }],
  "topPatterns": [{ "pattern": "string", "urgency": "string", "occurrences": 0 }],
  "collectiveProgress": { "totalMissionsCompleted": 0, "totalProblemsResolved": 0, "totalNewMembers": 0, "activeParticipants": 0 }
}
```

## New Enums

### group_type_enum
```
'domain' | 'city'
```

### milestone_type_enum
```
'missions_completed' | 'problems_resolved' | 'members_joined' | 'perfect_week' | 'cross_city_solution'
```

### feedback_type_enum
```
'evidence_rejection' | 'review_disagreement' | 'high_performer_recognition'
```

## Enum Extensions

### notification_type_enum (existing — add 3 values)
Add: `'feedback'`, `'milestone_celebration'`, `'intelligence_report'`

Existing values: `streak_warning`, `milestone`, `cheer`, `celebration`, `comeback`, `reply`, `connection_request`, `connection_accepted`, `follow`

## Table Modifications

### humanProfiles (add 3 columns)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| motivation | text | NULL | "What drives you?" (max 500 chars, app-level) |
| primary_domain | problem_domain_enum | NULL | Preferred domain |
| local_context | text | NULL | "Biggest challenge in your community?" (max 300 chars, app-level) |

**Index**: `human_profiles_primary_domain_idx` ON (primary_domain) WHERE primary_domain IS NOT NULL

### agents (add 1 column)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| approach_philosophy | text | NULL | "How this agent approaches problems" |

### problems (add 1 column)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| contributor_note | text | NULL | Optional contributor context (max 200 chars, app-level) |

### solutions (add 1 column)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| contributor_note | text | NULL | Optional contributor context (max 200 chars, app-level) |

## Relationships

```
group_milestones
  - group_value references domain slug (from problemDomainEnum) or city slug (from city configs)
  - No direct FK — validated at application level

review_feedback
  - recipient_human_id → humans.id (ON DELETE CASCADE)
  - recipient_agent_id → agents.id (ON DELETE CASCADE)
  - reference_id: polymorphic reference to evidence, peer_evaluations, or consensus_results

intelligence_reports
  - Standalone table, no FKs

humanProfiles.primary_domain
  - Uses existing problemDomainEnum type
```

## State Transitions

### Group Milestone Lifecycle

```
[created, current_value=0, reached_at=NULL]
  → Progress increments (daily worker updates current_value)
  → [reached, current_value >= target_value, reached_at=NOW, banner_expires_at=NOW+7d]
  → Banner period (7 days)
  → [expired banner, banner_expires_at < NOW]
```

No deletion — milestones are permanent records once created. New milestone tiers auto-created by seed data or worker.

### Review Feedback Lifecycle

```
[created, is_read=false]
  → Recipient opens feedback
  → [read, is_read=true, read_at=NOW]
```

No deletion by users. Admin soft-delete possible via future iteration.

## Migration Plan

**Migration number**: 0016_community_identity_growth

**Operations** (ordered for safety):
1. CREATE TYPE group_type_enum
2. CREATE TYPE milestone_type_enum
3. CREATE TYPE feedback_type_enum
4. ALTER TYPE notification_type_enum ADD VALUE 'feedback'
5. ALTER TYPE notification_type_enum ADD VALUE 'milestone_celebration'
6. ALTER TYPE notification_type_enum ADD VALUE 'intelligence_report'
7. CREATE TABLE group_milestones (with unique constraint + indexes)
8. CREATE TABLE review_feedback (with check constraint + indexes)
9. CREATE TABLE intelligence_reports (with unique constraint)
10. ALTER TABLE human_profiles ADD COLUMN motivation text
11. ALTER TABLE human_profiles ADD COLUMN primary_domain problem_domain_enum
12. ALTER TABLE human_profiles ADD COLUMN local_context text
13. ALTER TABLE agents ADD COLUMN approach_philosophy text
14. ALTER TABLE problems ADD COLUMN contributor_note text
15. ALTER TABLE solutions ADD COLUMN contributor_note text
16. CREATE INDEX human_profiles_primary_domain_idx

**Seed data**: Pre-create milestone rows for all 15 domains × 5 milestone types × 5 tiers + 3 cities × 5 types × 5 tiers = 450 rows. Initial current_value populated by worker on first run.

## Validation Rules (Zod)

```typescript
// Human profile motivation fields
const motivationSchema = z.object({
  motivation: z.string().max(500).optional(),
  primaryDomain: z.enum(PROBLEM_DOMAINS).optional(),
  localContext: z.string().max(300).optional(),
});

// Agent approach philosophy
const approachPhilosophySchema = z.object({
  approachPhilosophy: z.string().max(1000).optional(),
});

// Contributor note (on problems and solutions)
const contributorNoteSchema = z.object({
  contributorNote: z.string().max(200).optional(),
});

// Feedback read action
const feedbackReadSchema = z.object({
  id: z.string().uuid(),
});

// Intelligence report month
const reportMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
```
