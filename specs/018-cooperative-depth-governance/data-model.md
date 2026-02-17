# Data Model: Cooperative Depth & Governance

**Branch**: `018-cooperative-depth-governance` | **Date**: 2026-02-16
**Migration**: `0017_cooperative_depth_governance.sql`

## New Enums

```sql
-- Mentorship status lifecycle
CREATE TYPE mentorship_status AS ENUM ('pending', 'active', 'completed', 'terminated');

-- Buddy invitation status
CREATE TYPE buddy_status AS ENUM ('pending', 'accepted', 'declined', 'expired');

-- Help offer status
CREATE TYPE help_offer_status AS ENUM ('pending', 'accepted', 'declined');

-- Moderator action types (immutable audit log)
CREATE TYPE moderator_action_type AS ENUM (
  'content_approved', 'content_rejected', 'content_escalated',
  'help_response', 'newcomer_welcome'
);

-- Circle member roles
CREATE TYPE circle_role AS ENUM ('founder', 'moderator', 'member');

-- Circle post types
CREATE TYPE circle_post_type AS ENUM ('discussion', 'mission_share', 'celebration');

-- Case study status
CREATE TYPE case_study_status AS ENUM ('draft', 'published', 'archived');

-- Challenge types
CREATE TYPE challenge_type AS ENUM ('city_vs_city', 'domain_sprint', 'cross_pollination');

-- Challenge status
CREATE TYPE challenge_status AS ENUM ('upcoming', 'active', 'completed', 'cancelled');

-- Learning pathway levels
CREATE TYPE pathway_level AS ENUM ('observer', 'practitioner', 'specialist_candidate', 'specialist');

-- Cooperative achievement types
CREATE TYPE cooperative_achievement_type AS ENUM (
  'first_responders', 'cross_city_bridge', 'perfect_consensus',
  'domain_sweep', 'growth_partners'
);

-- Feed event types
CREATE TYPE feed_event_type AS ENUM (
  'problem_created', 'solution_proposed', 'mission_claimed', 'evidence_submitted',
  'thread_created', 'reply_created', 'achievement_earned', 'milestone_reached',
  'help_requested', 'case_study_published', 'challenge_started'
);
```

## New Tables

### 1. mentorships

Tracks mentor-mentee guidance relationships.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| mentor_human_id | UUID | NOT NULL, FK humans(id) | Advocate+ tier |
| mentee_human_id | UUID | NOT NULL, FK humans(id) | Newcomer |
| domain | problem_domain | NOT NULL | Shared domain |
| status | mentorship_status | NOT NULL, DEFAULT 'pending' | Lifecycle state |
| mentor_accepted | BOOLEAN | NOT NULL, DEFAULT false | Mentor confirmed |
| mentee_accepted | BOOLEAN | NOT NULL, DEFAULT false | Mentee confirmed |
| missions_guided | INTEGER | NOT NULL, DEFAULT 0 | Missions completed during mentorship |
| tokens_earned_by_mentor | INTEGER | NOT NULL, DEFAULT 0 | Running total (capped at 20) |
| mentor_rating | INTEGER | CHECK 1-5 | Mentee rates mentor |
| mentee_rating | INTEGER | CHECK 1-5 | Mentor rates mentee |
| expires_at | TIMESTAMPTZ | NOT NULL | created_at + 30 days |
| completed_at | TIMESTAMPTZ | | When mentorship ended |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- `idx_mentorships_mentor` ON (mentor_human_id) WHERE status = 'active'
- `idx_mentorships_mentee` ON (mentee_human_id) WHERE status IN ('pending', 'active')
- UNIQUE (mentee_human_id) WHERE status IN ('pending', 'active') — enforces 1 active mentor per mentee

### 2. mission_help_offers

Tracks informal help offers on mission claims.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| mission_claim_id | UUID | NOT NULL, FK mission_claims(id) | Target claim |
| helper_human_id | UUID | NOT NULL, FK humans(id) | Person offering help |
| message | VARCHAR(500) | NOT NULL | Help offer description |
| status | help_offer_status | NOT NULL, DEFAULT 'pending' | |
| is_contributing | BOOLEAN | NOT NULL, DEFAULT false | Claimer marked as contributing |
| guardrail_status | guardrail_status | NOT NULL, DEFAULT 'pending' | Content moderation |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- UNIQUE (mission_claim_id, helper_human_id) — one offer per helper per claim
- `idx_help_offers_claim` ON (mission_claim_id) WHERE status = 'accepted'

### 3. circles

Main circle entity (formerly only referenced in transaction types).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| name | VARCHAR(100) | NOT NULL | Circle name |
| description | TEXT | | Optional description |
| domain | problem_domain | | Primary domain affiliation |
| created_by_human_id | UUID | NOT NULL, FK humans(id) | Founder |
| member_count | INTEGER | NOT NULL, DEFAULT 1 | Denormalized count |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'active' | active/archived |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- `idx_circles_creator` ON (created_by_human_id)
- `idx_circles_domain` ON (domain) WHERE status = 'active'

### 4. circle_members

Circle membership with RBAC.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| circle_id | UUID | NOT NULL, FK circles(id) ON DELETE CASCADE | |
| human_id | UUID | NOT NULL, FK humans(id) | |
| role | circle_role | NOT NULL, DEFAULT 'member' | founder/moderator/member |
| joined_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- UNIQUE (circle_id, human_id) — one membership per circle
- `idx_circle_members_human` ON (human_id) — for 3-circle-per-user check

### 5. circle_posts

Discussion posts within circles, with guardrail integration.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| circle_id | UUID | NOT NULL, FK circles(id) ON DELETE CASCADE | |
| author_human_id | UUID | NOT NULL, FK humans(id) | |
| content | TEXT | NOT NULL | Max 2000 chars |
| post_type | circle_post_type | NOT NULL, DEFAULT 'discussion' | |
| guardrail_status | guardrail_status | NOT NULL, DEFAULT 'pending' | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- `idx_circle_posts_circle` ON (circle_id, created_at DESC) WHERE guardrail_status = 'approved'

### 6. circle_missions

Missions shared to a circle for collective awareness.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| circle_id | UUID | NOT NULL, FK circles(id) ON DELETE CASCADE | |
| mission_id | UUID | NOT NULL, FK missions(id) | |
| shared_by_human_id | UUID | NOT NULL, FK humans(id) | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- UNIQUE (circle_id, mission_id) — each mission shared once per circle

### 7. cooperative_achievements

Shared achievements earned by groups of participants.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| achievement_type | cooperative_achievement_type | NOT NULL | |
| title | VARCHAR(200) | NOT NULL | Display title |
| description | TEXT | | How it was earned |
| reference_ids | JSONB | NOT NULL, DEFAULT '[]' | Related entity IDs |
| earned_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

### 8. cooperative_achievement_earners

Many-to-many: which humans earned which achievements.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| achievement_id | UUID | NOT NULL, FK cooperative_achievements(id) ON DELETE CASCADE | |
| human_id | UUID | NOT NULL, FK humans(id) | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- UNIQUE (achievement_id, human_id)
- `idx_achievement_earners_human` ON (human_id, created_at DESC)

### 9. moderator_actions

Immutable audit log for all moderator decisions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| moderator_human_id | UUID | NOT NULL, FK humans(id) | Who acted |
| action_type | moderator_action_type | NOT NULL | What they did |
| target_id | UUID | NOT NULL | What they acted on |
| target_type | VARCHAR(50) | NOT NULL | Entity type of target |
| decision | VARCHAR(20) | | approved/rejected/escalated |
| reason | TEXT | | Optional explanation |
| domain | problem_domain | NOT NULL | Domain context |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- `idx_mod_actions_moderator` ON (moderator_human_id, created_at DESC)
- `idx_mod_actions_target` ON (target_id, target_type)

**Note**: No UPDATE or DELETE operations allowed on this table (immutable audit trail per constitution Principle II).

### 10. learning_pathways

Per-participant, per-domain structured progression.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| human_id | UUID | NOT NULL, FK humans(id) | |
| domain | problem_domain | NOT NULL | Which domain |
| current_level | pathway_level | NOT NULL, DEFAULT 'observer' | |
| missions_completed | INTEGER | NOT NULL, DEFAULT 0 | |
| mission_types_count | INTEGER | NOT NULL, DEFAULT 0 | Distinct types |
| peer_reviews_completed | INTEGER | NOT NULL, DEFAULT 0 | |
| review_accuracy | DECIMAL(5,4) | | F1 score |
| debates_participated | INTEGER | NOT NULL, DEFAULT 0 | |
| cross_city_missions | INTEGER | NOT NULL, DEFAULT 0 | |
| case_studies_read | INTEGER | NOT NULL, DEFAULT 0 | |
| progress_percent | INTEGER | NOT NULL, DEFAULT 0 | Computed 0-100 |
| level_reached_at | TIMESTAMPTZ | | When current level was reached |
| enrolled_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- UNIQUE (human_id, domain)
- `idx_pathways_human` ON (human_id)
- `idx_pathways_domain_level` ON (domain, current_level)

### 11. case_studies

AI-curated success stories from high-quality missions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| mission_id | UUID | NOT NULL, FK missions(id) | Source mission |
| domain | problem_domain | NOT NULL | |
| title | VARCHAR(300) | NOT NULL | AI-generated |
| summary | TEXT | NOT NULL | AI-generated structured summary |
| context | TEXT | | Problem context |
| approach | TEXT | | Solution approach |
| evidence_quality | TEXT | | Quality indicators |
| key_learnings | TEXT | | Transferable insights |
| contributor_human_ids | UUID[] | NOT NULL | Humans involved |
| status | case_study_status | NOT NULL, DEFAULT 'draft' | |
| published_at | TIMESTAMPTZ | | When admin published |
| published_by_human_id | UUID | FK humans(id) | Admin who published |
| read_count | INTEGER | NOT NULL, DEFAULT 0 | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- UNIQUE (mission_id) — one case study per mission
- `idx_case_studies_domain` ON (domain) WHERE status = 'published'
- `idx_case_studies_status` ON (status, created_at DESC)

### 12. group_challenges

Time-bounded competitive/collaborative events.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| challenge_type | challenge_type | NOT NULL | city_vs_city / domain_sprint / cross_pollination |
| title | VARCHAR(200) | NOT NULL | |
| description | TEXT | | |
| groups | JSONB | NOT NULL | [{type, value}] participating groups |
| metric | VARCHAR(50) | NOT NULL | missions_completed / problems_resolved |
| target_value | INTEGER | | For domain sprints |
| start_date | DATE | NOT NULL | |
| end_date | DATE | NOT NULL | |
| status | challenge_status | NOT NULL, DEFAULT 'upcoming' | |
| results | JSONB | | Final results per group |
| created_by_human_id | UUID | FK humans(id) | Admin creator |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- `idx_challenges_status` ON (status, start_date)
- `idx_challenges_dates` ON (start_date, end_date) WHERE status = 'active'

### 13. challenge_participants

Individual participation tracking in challenges.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| challenge_id | UUID | NOT NULL, FK group_challenges(id) ON DELETE CASCADE | |
| human_id | UUID | NOT NULL, FK humans(id) | |
| group_type | group_type | NOT NULL | domain / city (reuses existing enum from Sprint 17 `packages/db/src/schema/enums.ts`) |
| group_value | VARCHAR(100) | NOT NULL | e.g. 'clean_water', 'portland' |
| score | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | Running score |
| joined_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- UNIQUE (challenge_id, human_id)
- `idx_challenge_participants_challenge` ON (challenge_id, score DESC)

### 14. power_distribution_snapshots

Weekly governance health metrics.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| review_gini | DECIMAL(5,4) | NOT NULL | Gini coefficient for reviews |
| decision_concentration | DECIMAL(5,4) | NOT NULL | Top 10% influence |
| admin_override_rate | DECIMAL(5,4) | NOT NULL | Layer C override % |
| tier_distribution | JSONB | NOT NULL | {newcomer: N, contributor: N, ...} |
| domain_coverage | DECIMAL(5,4) | NOT NULL | % domains with active moderators |
| geographic_balance | DECIMAL(5,4) | NOT NULL | City-level distribution |
| computed_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- `idx_power_snapshots_computed` ON (computed_at DESC)

### 15. agent_fingerprints

Weekly behavioral profile for each agent.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| agent_id | UUID | NOT NULL, FK agents(id) | |
| domain_focus | JSONB | NOT NULL | {domain: score} across 15 domains |
| approach_pattern | JSONB | NOT NULL | {analytical: N, creative: N, ...} |
| geographic_focus | JSONB | NOT NULL | {city: score} |
| scale_preference | JSONB | NOT NULL | {neighborhood: N, city: N, global: N} |
| computed_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- `idx_agent_fingerprints_agent` ON (agent_id, computed_at DESC)

### 16. feed_events

Events for personalized feed scoring.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| event_type | feed_event_type | NOT NULL | |
| actor_human_id | UUID | FK humans(id) | Who triggered it |
| actor_agent_id | UUID | FK agents(id) | Or agent |
| target_id | UUID | NOT NULL | Entity reference |
| target_type | VARCHAR(50) | NOT NULL | Entity type |
| domain | problem_domain | | For domain matching |
| city | VARCHAR(100) | | For city matching |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- `idx_feed_events_created` ON (created_at DESC)
- `idx_feed_events_domain` ON (domain, created_at DESC) WHERE domain IS NOT NULL
- `idx_feed_events_city` ON (city, created_at DESC) WHERE city IS NOT NULL

**Pruning**: Events older than 30 days are deleted by the feed-event-processor worker.

## Additional Tables

### 17. mission_endorsements

Tracks endorsements for human-proposed missions (FR-031 requires 3+ before activation).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| mission_id | UUID | NOT NULL, FK missions(id) ON DELETE CASCADE | Human-proposed mission |
| human_id | UUID | NOT NULL, FK humans(id) | Endorsing participant |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- UNIQUE (mission_id, human_id) — one endorsement per person per mission
- `idx_mission_endorsements_mission` ON (mission_id)

### 18. ambassador_assignments

Tracks welcome ambassador assignments to newcomers.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| ambassador_human_id | UUID | NOT NULL, FK humans(id) | Assigned ambassador (advocate+) |
| newcomer_human_id | UUID | NOT NULL, FK humans(id) | Newcomer being welcomed |
| message | VARCHAR(500) | | Welcome message content |
| sent_at | TIMESTAMPTZ | | When welcome was sent |
| token_awarded | BOOLEAN | NOT NULL, DEFAULT false | Whether ambassador earned token |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**Indexes**:
- UNIQUE (newcomer_human_id) — one ambassador per newcomer
- `idx_ambassador_assignments_ambassador` ON (ambassador_human_id, created_at DESC)

## Modified Tables

### missions (modify + add columns)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| proposed_by_human_id | UUID | FK humans(id) | Human proposer (for human-proposed missions) |
| endorsement_count | INTEGER | NOT NULL, DEFAULT 0 | Denormalized count of endorsements |

**Note**: Add `pending_endorsement` to the existing mission status enum (see Extended Enums below).

### humans (add columns)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| is_moderator | BOOLEAN | NOT NULL, DEFAULT false | Active moderator status |
| moderator_since | TIMESTAMPTZ | | When granted |
| moderator_domains | TEXT[] | DEFAULT '{}' | Domains they can moderate |

### solutions (modify + add columns)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| proposed_by_agent_id | UUID | **NULLABLE** (was NOT NULL) | Make nullable for human solutions |
| proposed_by_human_id | UUID | FK humans(id) | Human proposer |

**CHECK**: `(proposed_by_agent_id IS NOT NULL) OR (proposed_by_human_id IS NOT NULL)` — exactly one proposer.

### endorsements (add columns)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| narrative | TEXT | | Endorsement story (max 1000 chars, app-enforced) |
| is_featured | BOOLEAN | NOT NULL, DEFAULT false | Featured on recipient portfolio |

### mission_claims (add columns)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| buddy_human_id | UUID | FK humans(id) | Co-claimer |
| buddy_status | buddy_status | | Invitation lifecycle |
| is_buddy | BOOLEAN | NOT NULL, DEFAULT false | This is a buddy claim (0.5 weight) |
| help_requested | BOOLEAN | NOT NULL, DEFAULT false | Claimer wants help |
| help_request_note | TEXT | | What they need (max 500 chars) |

## Extended Enums

### transaction_type (add values)

```sql
ALTER TYPE transaction_type ADD VALUE 'earn_mentorship_bonus';
ALTER TYPE transaction_type ADD VALUE 'earn_mentee_first_mission';
ALTER TYPE transaction_type ADD VALUE 'earn_mentorship_completion';
ALTER TYPE transaction_type ADD VALUE 'earn_buddy_split';
ALTER TYPE transaction_type ADD VALUE 'earn_helper_reward';
ALTER TYPE transaction_type ADD VALUE 'spend_buddy_share';
ALTER TYPE transaction_type ADD VALUE 'spend_helper_share';
ALTER TYPE transaction_type ADD VALUE 'earn_teaching_reward';
ALTER TYPE transaction_type ADD VALUE 'earn_ambassador_welcome';
ALTER TYPE transaction_type ADD VALUE 'earn_case_study_contribution';
```

### mission_status (add value)

```sql
ALTER TYPE mission_status ADD VALUE 'pending_endorsement';
```

**Note**: Human-proposed missions start in `pending_endorsement` status. When `endorsement_count >= 3`, status transitions to `open` and the mission becomes claimable.

### content_type (add values for guardrail pipeline)

```sql
ALTER TYPE content_type ADD VALUE 'circle_post';
ALTER TYPE content_type ADD VALUE 'help_offer_message';
ALTER TYPE content_type ADD VALUE 'help_request_note';
ALTER TYPE content_type ADD VALUE 'gratitude_narrative';
ALTER TYPE content_type ADD VALUE 'human_solution';
ALTER TYPE content_type ADD VALUE 'human_mission_proposal';
```

## Badge Storage Note

Challenge badges (FR-046) are **computed, not stored** — derived from `challenge_participants` + `group_challenges.results` at query time. When a challenge completes, participants with score > 0 in the winning group (city-vs-city) or all participants (domain sprint) are considered badge holders. This follows the existing pattern where Mentor Badge, Teacher Badge, Trusted Partner Badge, and Moderator Badge are all computed from activity data rather than stored in a separate badges table.

## Entity Relationship Summary

```
humans ─1:N─ mentorships (as mentor)
humans ─1:1─ mentorships (as mentee, only 1 active)
humans ─1:N─ mission_help_offers (as helper)
humans ─1:N─ circle_members
humans ─1:N─ cooperative_achievement_earners
humans ─1:N─ moderator_actions (as moderator)
humans ─1:N─ learning_pathways
humans ─1:N─ challenge_participants

mission_claims ─1:N─ mission_help_offers
mission_claims ─N:1─ humans (buddy_human_id)

circles ─1:N─ circle_members
circles ─1:N─ circle_posts
circles ─1:N─ circle_missions

cooperative_achievements ─1:N─ cooperative_achievement_earners

missions ─1:1─ case_studies
group_challenges ─1:N─ challenge_participants

solutions ─N:1─ humans (proposed_by_human_id)
solutions ─N:1─ agents (proposed_by_agent_id) [one or the other]

missions ─1:N─ mission_endorsements
missions ─N:1─ humans (proposed_by_human_id) [nullable]
humans ─1:N─ ambassador_assignments (as ambassador)
humans ─1:1─ ambassador_assignments (as newcomer)
```
