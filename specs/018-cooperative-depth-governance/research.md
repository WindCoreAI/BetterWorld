# Research: Cooperative Depth & Governance

**Branch**: `018-cooperative-depth-governance` | **Date**: 2026-02-16

## 1. Tier-Based Mission Limits (Replacing Hard-Coded Max 3)

**Decision**: Replace the hard-coded `activeCount >= 3` check with a tier-based lookup.

**Current Implementation**: `apps/api/src/routes/missions/index.ts` lines 639-646 — raw SQL checks `COUNT(*)` from `mission_claims WHERE status = 'active'` and throws if `>= 3`.

**Approach**: Within the same transaction, query `reputationScores.tier` for the claiming human, then apply tier-based mapping:
- newcomer: 2
- contributor: 3
- advocate: 4
- leader: 5
- champion: 6

**Completion rate safeguard** (FR-055): Query completed vs expired claims. If `completed / (completed + expired) < 0.80`, use `tier_limit - 1` instead.

**Buddy claims**: Count as 0.5 toward the buddy's cap (FR-011). This requires changing the count query to: `SUM(CASE WHEN is_buddy THEN 0.5 ELSE 1 END)`.

**Rationale**: Existing hard-coded "3" was Phase 1 safety net. Tier-based limits reward reliable participants without compromising overcommitment protection.

**Alternatives Considered**:
- Keep hard-coded 3 for all tiers — rejected because it penalizes high-performing champions
- Uncapped for champion tier — rejected because some limit is needed for platform health

## 2. Double-Entry Token Accounting Pattern

**Decision**: Reuse the existing double-entry pattern from `care-moment.service.ts` for all new token flows.

**Existing Pattern** (lines 199-250):
1. Lock sender with `SELECT FOR UPDATE`
2. Lock receiver with `SELECT FOR UPDATE`
3. Debit sender: `tokenBalance - amount`
4. Credit receiver: `tokenBalance + amount`
5. Insert debit `tokenTransactions` record with `balanceBefore` / `balanceAfter`
6. Insert credit `tokenTransactions` record with `balanceBefore` / `balanceAfter`
7. Idempotency key prevents replay

**New Transaction Types** (add to `transactionTypeEnum` in `packages/db/src/schema/enums.ts`):
- `earn_mentorship_bonus` — mentor earns 2 tokens per mentee mission completion
- `earn_mentee_first_mission` — mentee earns 1 bonus token for first mentored mission
- `earn_mentorship_completion` — mentor earns 5 tokens at mentorship end (teaching reward)
- `earn_buddy_split` — buddy earns 40% of mission reward
- `earn_helper_reward` — helper earns 25% of mission reward
- `spend_buddy_share` — claimer pays buddy's 40% from their share
- `spend_helper_share` — claimer pays helper's 25% from their share
- `earn_teaching_reward` — generic teaching activity token
- `earn_ambassador_welcome` — ambassador earns 1 token per welcome
- `earn_case_study_contribution` — contributor earns 2 tokens for published case study

**Buddy Split Flow** (mission completion):
1. Calculate total reward R
2. If solo + no helper: claimer gets R
3. If solo + helper: claimer gets 0.75R, helper gets 0.25R
4. If buddy + no helper: claimer gets 0.60R, buddy gets 0.40R
5. If buddy + helper: claimer gets 0.45R, buddy gets 0.30R, helper gets 0.25R
6. Each distribution is a separate double-entry transaction

**Rationale**: Reusing the proven pattern ensures consistency and correctness. SELECT FOR UPDATE prevents race conditions on reward distribution.

## 3. BullMQ Worker Registration Pattern

**Decision**: Follow existing `all-workers.ts` dynamic import pattern for 6+ new workers.

**Existing Pattern** (`apps/api/src/workers/all-workers.ts`):
- Dynamic `await import("./worker-name.js")` for each worker
- Array of `{ name, create }` objects iterated with `for..of`
- Each worker exports a `createXxxWorker()` factory function

**New Workers**:
| Worker | Schedule | Purpose |
|--------|----------|---------|
| `achievement-detection` | Weekly (Sun 3 AM UTC) | Scan for cooperative achievements |
| `case-study-curation` | Weekly (Sat 2 AM UTC) | Identify eligible missions for case studies |
| `power-audit` | Weekly (Mon 5 AM UTC) | Compute Gini coefficient and governance metrics |
| `agent-fingerprint` | Weekly (Mon 6 AM UTC) | Compute agent behavioral profiles |
| `moderator-eligibility` | Daily (5 AM UTC) | Check/revoke moderator qualifications |
| `feed-event-processor` | Every 15 minutes | Score and prune personalized feed events |
| `mentorship-expiry` | Hourly | Check for expired mentorships (30-day) |
| `ambassador-assignment` | Event-driven (on onboarding completion) | Assign welcome ambassadors |

**Cron Pattern Reference**:
- `0 3 * * 0` = Sundays 3 AM UTC (achievements)
- `0 2 * * 6` = Saturdays 2 AM UTC (case studies)
- `0 5 * * 1` = Mondays 5 AM UTC (power audit)
- `0 5 * * *` = Daily 5 AM UTC (moderator check)
- `*/15 * * * *` = Every 15 minutes (feed events)
- `0 * * * *` = Hourly (mentorship expiry)

**Rationale**: Existing pattern proven across 19 workers. Dynamic imports keep startup fast. Staggered cron schedules avoid DB contention.

## 4. Guardrail Integration Pattern

**Decision**: Replicate discussion thread guardrail pattern for all new user-generated content.

**Existing Pattern** (`apps/api/src/services/discussion.service.ts` lines 58-157):
1. **Layer A** (sync): `evaluateLayerA(content)` — regex check, fails fast
2. **Store pending**: Insert with `guardrailStatus: "pending"` — content not visible
3. **Layer B** (async): Queue BullMQ job to `QUEUE_NAMES.GUARDRAIL_EVALUATION` with `contentType` and `content`
4. **Callback**: On Layer B completion, update `guardrailStatus` to `approved`/`rejected`/`flagged`
5. **Layer C**: Flagged content goes to admin (or moderator) review queue

**Content Types to Add**:
- `circle_post` — circle discussion posts
- `help_offer_message` — help offer messages (max 500 chars)
- `help_request_note` — help request descriptions
- `gratitude_narrative` — endorsement narratives (max 1000 chars)
- `human_solution` — human-proposed solution descriptions
- `human_mission_proposal` — human-proposed mission descriptions

**Rate Limits** (per human per day):
- Circle posts: 10/day (same as discussion threads)
- Help offers: 20/day
- Help requests: 5/day
- Gratitude narratives: 5/day
- Solution proposals: 3/day
- Mission proposals: 2/day

**Rationale**: Exact same pipeline for all user content. No bypass path. All content enters pending state.

## 5. Circle Schema Design

**Decision**: Create new `circles`, `circle_members`, `circle_posts`, `circle_missions` tables.

**Finding**: No circles table currently exists in the schema. Only a `spend_circle` transaction type in enums suggests circles were planned.

**Design**:
- `circles`: id, name, description, domain, createdByHumanId, memberCount, status, createdAt
- `circle_members`: id, circleId, humanId, role (founder/moderator/member), joinedAt
- `circle_posts`: id, circleId, authorHumanId, content, postType (discussion/mission_share/celebration), guardrailStatus, createdAt
- `circle_missions`: id, circleId, missionId, sharedByHumanId, createdAt

**Constraints**:
- Max 50 members per circle (CHECK on memberCount or enforced at API level)
- Max 3 circles per user (enforced at API level)
- Circle creation still costs 25 ImpactTokens (existing transaction type)

**Rationale**: Clean separation of concerns. circle_members handles RBAC, circle_posts handles discussions with guardrail integration, circle_missions handles shared mission curation.

## 6. Schema Modifications (Existing Tables)

### Endorsements
**File**: `packages/db/src/schema/endorsements.ts`
**Add**:
- `narrative: text("narrative")` — optional 1000-char endorsement story
- `isFeatured: boolean("is_featured").notNull().default(false)` — recipient can feature up to 3

### Solutions
**File**: `packages/db/src/schema/solutions.ts`
**Add**:
- `proposedByHumanId: uuid("proposed_by_human_id").references(() => humans.id)` — nullable, for human-proposed solutions
- Make `proposedByAgentId` nullable (currently NOT NULL) since human solutions don't have an agent

### Humans
**File**: `packages/db/src/schema/humans.ts`
**Add**:
- `isModerator: boolean("is_moderator").notNull().default(false)`
- `moderatorSince: timestamp("moderator_since", { withTimezone: true })`
- `moderatorDomains: text("moderator_domains").array()` — domains they can moderate

### Mission Claims
**File**: `packages/db/src/schema/missionClaims.ts`
**Add**:
- `buddyHumanId: uuid("buddy_human_id").references(() => humans.id)` — co-claimer
- `buddyStatus: varchar("buddy_status", { length: 20 })` — pending/accepted/declined
- `isBuddy: boolean("is_buddy").notNull().default(false)` — this claim is a buddy claim (counts as 0.5)
- `helpRequested: boolean("help_requested").notNull().default(false)` — claimer requesting help
- `helpRequestNote: text("help_request_note")` — what they need help with

## 7. Connection Suggestions → People Discovery

**Decision**: Extend the existing connection suggestion algorithm for a broader People Discovery service.

**Existing Algorithm** (`apps/api/src/services/connection.service.ts`):
- Shared primary domain: ×3 weight
- Same city: ×2 weight
- Mutual peer reviews: ×5 weight
- Redis 5-min cache

**People Discovery Extensions**:
- Add contribution pattern similarity: ×2 weight (same mission types, similar completion rates)
- Add tier proximity: ×1 weight (people within 1 tier)
- Add pathway enrollment overlap: ×1 weight (same learning pathways)
- Exclude existing connections (already done in suggestions)
- Separate cache key and TTL (10-min for discovery page vs 5-min for dashboard card)

**Rationale**: Building on proven scoring algorithm. Additional signals are cheap to compute from existing tables.

## 8. Group Milestones → Cross-Group Challenges

**Decision**: Create new `group_challenges` table separate from `group_milestones`.

**Finding**: `group_milestones` exists from Sprint 17 for passive milestone tracking. Challenges are active, time-bounded competitions requiring separate schema.

**Design**:
- `group_challenges`: id, challengeType (city_vs_city/domain_sprint/cross_pollination), title, description, metric, targetValue, startDate, endDate, status (active/completed/cancelled), results (JSONB), createdByHumanId (admin), createdAt
- `challenge_participants`: id, challengeId, humanId, groupType, groupValue, score, joinedAt
- Reuse `group_milestones` for tracking challenge-spawned milestones

**Per-Capita Scoring** (city-vs-city):
- Active participant count per city = humans with 1+ activity in last 30 days AND city = X
- Score = missions_completed / active_participant_count × 1000 (scaled for readability)

**Rationale**: Challenges have different lifecycle (admin-created, time-bounded, competitive) than milestones (auto-detected, permanent, celebratory). Separate tables prevent schema confusion.

## 9. Frontend Patterns

### Component Architecture
All new components follow established patterns:
- React Query hooks with `staleTime: 300_000` (5-min cache)
- Loading skeletons with `animate-pulse`
- Empty states with call-to-action
- Error boundaries with retry

### Navigation
New nav items added to `NAV_LINKS` array in `apps/web/src/components/Navigation.tsx`:
- "Learning" → `/learning`
- "Discover" → `/discover`
- "Governance" → `/governance`

### Badge Components
New badges (Mentor, Moderator, Teacher, Trusted Partner) follow TierBadge/SpecialistBadge pattern with color-coded variants.

### Dashboard Cards
New MentorshipCard and WelcomeCard follow YourNetworkCard pattern: hook → loading → empty → content.

## 10. Moderator Role Implementation

**Decision**: Add moderator fields to humans table + create moderator_actions audit table.

**Eligibility Check** (FR-014):
- Champion tier
- 90%+ review accuracy (from F1 score in validator stats)
- 90+ days active (createdAt comparison)
- Zero suspensions (check suspension history)
- 3+ endorsements from advocate+ tier users

**Privilege Boundaries** (FR-017 — server-side enforcement):
- CAN: Review flagged content in Layer C queue (domain-scoped), respond to help requests, welcome newcomers, escalate to admin
- CANNOT: Resolve disputes, adjust economic rates, manage feature flags, suspend users, access admin dashboards beyond moderator queue

**Audit Trail** (FR-018):
- `moderator_actions` table: id, moderatorHumanId, actionType (enum), targetId, targetType, decision, reason, createdAt
- Immutable (no UPDATE/DELETE on this table)
- Action types: content_approved, content_rejected, content_escalated, help_response, newcomer_welcome

**Domain Scoping** (FR-016, clarification):
- Moderator sees only flagged content matching their specialist domains
- Layer C queue filtered by `domain IN (moderator.moderatorDomains)`
- Connection-based exclusion: 2-hop rule applied (moderator cannot review content by connections)

**Rationale**: Server-side enforcement prevents privilege escalation. Immutable audit trail satisfies constitution Principle II. Domain scoping leverages expertise.

## 11. Mentorship Matching Algorithm

**Decision**: Domain-first matching with city proximity bonus, mentor capacity check, and mutual acceptance.

**Algorithm**:
1. Filter eligible mentors: tier >= advocate, activeMenteeCount < 3, domain matches mentee's primaryDomain, not suspended
2. Score: sameCity × 3 + higherTier × 2 + fewerMentees × 1 + recentActivity × 1
3. Return top 3 candidates to mentee
4. Both parties must accept (double opt-in)
5. If no domain+city match: fall back to domain-only, then city-only, then queue

**Mentorship Lifecycle**:
- Created (pending acceptance) → Active (both accepted) → Completed (30 days OR mentee reaches contributor) → Rated (both rated)
- Either party can end early → Terminated (optional rating)
- Mentor earns 2 tokens per mentee mission completion (cap 20)
- Mentee earns 1 bonus token for first mission during mentorship

**Rationale**: Double opt-in respects autonomy (Principle V). Fallback chain ensures no newcomer is left without options.

## 12. Case Study Curation Pipeline

**Decision**: Weekly cron identifies candidates, Claude Sonnet generates summaries, admin publishes.

**Eligibility Criteria** (FR-038):
- Evidence verification confidence >= 0.90
- Unanimous validator consensus (all 6 agree)
- Before/after photo pair present
- 3+ community attestations

**AI Summary Generation** (FR-039):
- Input: problem description, solution description, mission details, evidence metadata, attestation count
- Model: Claude Sonnet 4.5 (same as existing decomposition)
- Output schema: { context, approach, evidenceQuality, keyLearnings, transferableInsights }
- Cost tracking: reuse existing AI budget Redis counters

**Rationale**: Automated curation reduces admin burden. Claude Sonnet produces high-quality structured summaries. Admin gate prevents auto-publishing low-quality content.

## 13. Personalized Feed Architecture

**Decision**: Event-driven feed with proximity scoring and time decay.

**Feed Events** emitted on:
- Problem creation, solution proposal, mission claim, evidence submission
- Discussion thread/reply creation
- Achievement earned, milestone reached
- Help request posted

**Scoring Formula**:
```
score = freshness_decay(age) × (
  connection_bonus(is_connected ? 5 : is_following ? 3 : 0) +
  domain_match(same_domain ? 3 : 0) +
  city_match(same_city ? 2 : 0)
)
```

Where `freshness_decay = 1 / (1 + age_hours / 24)` (half-life of 24 hours).

**Storage**: `feed_events` table with computed `score` column, pruned to last 1000 events per user. Feed endpoint returns top-N with cursor pagination.

**Fallback**: If feed has <10 items, supplement with domain and city activity, then global activity.

**Rationale**: Event-driven avoids expensive real-time computation. Time decay ensures freshness. Pruning prevents table bloat.

## 14. Power Distribution Audit

**Decision**: Weekly Gini coefficient computation over multiple governance dimensions.

**Metrics**:
- **Review Gini**: Distribution of peer review assignments across validators
- **Decision Concentration**: Percentage of consensus decisions influenced by top 10% of validators
- **Admin Override Rate**: Percentage of Layer C decisions that override Layer B
- **Tier Distribution**: Shape of tier pyramid (healthy = gradual taper)
- **Domain Coverage**: Percentage of 15 domains with active moderators
- **Geographic Balance**: City-level contribution distribution

**Gini Computation**: Standard formula applied to review counts per validator:
```
G = (2 * Σ(i * x_i)) / (n * Σ(x_i)) - (n + 1) / n
```

**Display**: Public `/governance` page with charts and historical trend.

**Rationale**: Transparency builds trust. Gini below 0.4 indicates healthy distribution per SC-011.
