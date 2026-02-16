# Research: Community Identity & Visible Growth

**Feature**: 017-community-identity-growth
**Date**: 2026-02-16
**Status**: Complete

## R1: Domain Community Pages — Data Sources

**Decision**: Compute domain community pages from existing tables — no new domain-specific table needed.

**Rationale**: All required data already exists across problems, solutions, missions, humanProfiles, agents, reputationHistory, and discussionThreads. Aggregation queries with Redis caching (5-min TTL matching existing NetworkService pattern) provide fresh-enough data without schema bloat.

**Data sources identified**:
- **Member count**: `humanProfiles.primaryDomain` (new field, see R6) + agents/humans with 3+ missions in domain
- **Missions completed**: `missions` WHERE domain matches + status='verified', COUNT + SUM
- **Problems resolved**: `problems` WHERE domain + status='resolved', COUNT
- **Top contributors**: JOIN humans/agents with `reputationHistory`, ORDER BY reputationScore DESC, LIMIT 10
- **Active missions**: `missions` WHERE domain + status IN ('open','claimed','in_progress'), cursor paginated
- **Domain discussions**: `discussionThreads` WHERE scopeType='domain' AND scopeValue=domainSlug (already exists from Sprint 16)
- **Domain leaderboard**: Existing `getLeaderboard()` with domain filter
- **Monthly highlights**: Aggregation query on problems/solutions/missions created_at within current month

**Alternatives considered**:
- Materialized view: Overkill for this query frequency; Redis cache is simpler
- New `domain_stats` table with worker: Extra complexity for data that's easily computed

## R2: City Chapter Pages — Data Sources

**Decision**: Extend existing city dashboard pattern (`app/city/[city]/page.tsx`) with community-focused sections.

**Rationale**: City dashboards already exist with heatmap, metrics, and category breakdown. The pattern uses `useEffect` + fetch with predefined city centers. We extend this with chapter identity (tagline, milestones) and reuse the `ThreadList` component with `scopeType='city'`.

**Data sources identified**:
- **Chapter metrics**: Existing `GET /api/v1/city/{cityId}/metrics` endpoint
- **Local impact heatmap**: Existing `CityHeatmap` component (dynamic import, SSR-safe)
- **Local missions**: `missions` WHERE locationPoint within city radius (PostGIS ST_DWithin)
- **City discussions**: `discussionThreads` WHERE scopeType='city' AND scopeValue=citySlug (Sprint 16)
- **Chapter milestones**: New `group_milestones` table (see R3)
- **Tagline/config**: Static config object or new `city_configs` DB column

**Alternatives considered**:
- Separate city chapter route: Unnecessary, extend existing `/city/[city]` route
- City config in DB: Could add to an admin-managed config table, but static config is simpler for 3 cities

## R3: Group Milestones — Schema Design

**Decision**: New `group_milestones` table with milestone detection via BullMQ worker (daily cron).

**Rationale**: Milestones need persistent tracking (current progress, reached timestamps, banner visibility). A dedicated table is cleaner than JSONB on existing tables. Detection via scheduled worker follows established patterns (care-moment-worker hourly, pattern-aggregation daily).

**Schema**:
- `id` UUID PK
- `groupType` enum('domain','city')
- `groupValue` varchar(100) — domain slug or city slug
- `milestoneType` enum('missions_completed','problems_resolved','members_joined','perfect_week','cross_city_solution')
- `targetValue` integer — threshold (10, 25, 50, 100, 250)
- `currentValue` integer — progress counter
- `reachedAt` timestamptz — when threshold was met (NULL if not reached)
- `bannerExpiresAt` timestamptz — reachedAt + 7 days
- `createdAt` timestamptz

**Unique constraint**: (groupType, groupValue, milestoneType, targetValue) — one row per specific milestone per group.

**Worker pattern**: Daily cron (e.g., 4 AM UTC) following `pattern-aggregation-worker.ts` pattern:
1. For each domain + city, count current metrics
2. Compare against unfulfilled milestones
3. If threshold met → set reachedAt, bannerExpiresAt, create notifications

**Alternatives considered**:
- Real-time detection on each event: Complex, fragile, over-engineered for daily-granularity milestones
- JSONB array on a config table: Harder to query, paginate, and extend

## R4: Skill Progression Dashboard — Data Sources

**Decision**: Aggregate from existing tables via new API endpoint. No new schema needed.

**Rationale**: All growth data already exists: `reputationHistory` (90-day trend), reputation engine `getNextTierInfo()` (tier progress), `evidence` (quality scores), `peerReviews` / `peerEvaluations` (accuracy), `missions` (completion rate), `streaks` (current/longest). We create a single aggregation endpoint with Redis caching.

**Data sources**:
- **Reputation trend**: `reputationHistory` WHERE humanId, ORDER BY createdAt DESC, LIMIT 90 days
- **Tier progress**: `getNextTierInfo(currentTier, currentScore)` from reputation engine
- **Evidence quality**: AVG(`evidence.finalConfidence`) for participant's submissions
- **Review accuracy**: For human peer reviews: `peerReviews` WHERE verdict matches final consensus; for agent validators: F1 from `validatorPool`
- **Mission completion rate**: completed / (completed + expired + abandoned) from `missionClaims`
- **Domain expertise**: GROUP BY domain from missions/problems/solutions
- **Personal milestones**: Tier promotions from `reputationHistory`, streak records from `streaks`
- **Next goals**: Computed from proximity to next tier threshold, accuracy targets, domain breadth

**Alternatives considered**:
- Pre-computed growth table with worker: Premature optimization; Redis cache of query results is sufficient
- Client-side aggregation: Too many round trips; server-side aggregation is standard pattern

## R5: Review Feedback — Schema Design

**Decision**: New `review_feedback` table with feedback generation hooked into consensus post-actions.

**Rationale**: Feedback needs persistent storage (read/unread tracking, dedicated inbox page). The consensus engine already has a post-action hook pattern (non-blocking try-catch) used for F1 updates, reward distribution, and spot checks. Adding feedback generation follows the identical pattern.

**Schema**:
- `id` UUID PK
- `recipientHumanId` UUID FK → humans (nullable, for human peer reviewers)
- `recipientAgentId` UUID FK → agents (nullable, for agent validators)
- `feedbackType` enum('evidence_rejection','review_disagreement','high_performer_recognition')
- `referenceId` UUID — evidence ID, peer evaluation ID, or consensus result ID
- `referenceType` varchar(50) — 'evidence', 'peer_evaluation', 'consensus_result'
- `message` text — the feedback message
- `improvementTips` jsonb — array of structured improvement suggestions
- `isRead` boolean default false
- `readAt` timestamptz
- `createdAt` timestamptz

**Indexes**: recipient_human_id + isRead, recipient_agent_id + isRead, createdAt

**Feedback generation hook** — added to consensus engine post-actions (lines ~222-295 of `consensus-engine.ts`):
```
// After consensus decision:
try {
  await generateFeedback(tx, submissionId, submissionType, decision, completedEvals);
} catch (err) {
  logger.warn("Feedback generation failed (non-blocking)");
}
```

**Notification integration**: Each feedback also creates a notification of new type `feedback` with link to feedback inbox.

**Alternatives considered**:
- Reuse notifications table: Feedback needs structured data (improvementTips, referenceType), read tracking by feedback-specific queries, and a dedicated inbox — too much shoehorning into notifications
- Real-time only (no persistence): Users need to revisit feedback; persistence is essential

## R6: Motivation & Narrative Fields — Schema Changes

**Decision**: Add fields to existing `humanProfiles` and `agents` tables. Add `contributorNote` to `problems` and `solutions`.

**Rationale**: These are simple column additions to existing tables, following the pattern of previous schema extensions (e.g., Phase 3 added 7 columns to problems, 5 to agents).

**Changes**:
- `humanProfiles`: Add `motivation` text, `primaryDomain` problemDomainEnum, `localContext` text
- `agents`: Add `approachPhilosophy` text
- `problems`: Add `contributorNote` text
- `solutions`: Add `contributorNote` text
- `toPublicProfile()` in agent.service.ts: Include `soulSummary` and `approachPhilosophy`
- Profile completeness: Adjust weights — bio+motivation = 20% (up from 15% for bio alone)

**Guardrail integration**: All new text fields route through the existing guardrail pipeline. For `motivation`, `localContext`, and `approachPhilosophy`, use the same pattern as `bio` updates. For `contributorNote`, it's included in the parent content's guardrail evaluation.

**Alternatives considered**:
- Separate `motivation_profiles` table: Over-normalized for 3 fields
- JSONB column: Loses type safety and query efficiency

## R7: Identity-Rich Content Cards — API Enrichment

**Decision**: Enrich existing content list endpoints with contributor metadata via batch JOIN query.

**Rationale**: Current ProblemCard shows `reportedByUsername`, SolutionCard shows `agent.username`, ActivityFeed shows `actor.username` — all bare identifiers. We add contributor metadata (tier, specializations, streak, specialist status) to the existing list endpoint responses via a single batch query after fetching content.

**Implementation pattern**:
1. Fetch content list (existing query)
2. Collect unique contributor IDs
3. Batch fetch contributor metadata: `SELECT id, tier, specializations, streakDays, ... FROM (humans JOIN humanProfiles) UNION (agents)` WHERE id IN (...)
4. Merge into response objects

**Frontend changes**: Update `ProblemCard`, `SolutionCard`, `ActivityFeed` components to render `TierBadge`, `SpecialistBadge`, `StreakCounter` (all existing components from Sprint 9/11).

**Alternatives considered**:
- Pre-computed contributor_metadata JSONB on each content row: Stale data, complex sync
- Client-side fetch per card: N+1 pattern, explicitly forbidden by FR-022

## R8: Community Intelligence — Monthly Report

**Decision**: New monthly BullMQ worker job generating report data stored as JSONB. Extends existing pattern-aggregation pipeline.

**Rationale**: Pattern aggregation already runs daily (`pattern-aggregation-worker.ts`). A monthly job aggregates the daily results plus additional metrics into a report stored in a new `intelligence_reports` table or as a JSONB record.

**Schema**:
- `id` UUID PK
- `reportMonth` varchar(7) — 'YYYY-MM' format, unique
- `reportData` jsonb — structured report content (systemic issues, cross-city adoptions, domain trends, top patterns, collective progress)
- `generatedAt` timestamptz
- `createdAt` timestamptz

**Worker**: Monthly cron (1st of month, 5 AM UTC), follows existing worker factory pattern.

**API**: `GET /api/v1/intelligence/latest` (public, no auth) + `GET /api/v1/intelligence/domain/:domain` (domain-filtered view).

**Alternatives considered**:
- Generate on-demand per request: Too expensive for complex aggregation queries
- Store in Redis only: Need persistence for historical comparison

## R9: Notification Type Extensions

**Decision**: Add new notification types to `notificationTypeEnum`: `feedback`, `milestone_celebration`, `intelligence_report`.

**Rationale**: The existing notification system (Sprint 16) supports typed notifications with aggregation, WebSocket push, and unread tracking. New features hook into this cleanly by adding enum values and creating notifications through `NotificationService`.

**New enum values**:
- `feedback` — review feedback delivered to participant
- `milestone_celebration` — group milestone reached, notify all members
- `intelligence_report` — monthly report published

**Alternatives considered**:
- Separate notification tables per feature: Violates DRY, fragments the notification UX

## R10: Worker Architecture

**Decision**: Add 2 new BullMQ workers following established patterns.

**Workers**:
1. **milestone-detection-worker**: Daily cron (4 AM UTC), scans all domains + cities for milestone thresholds, creates notifications. Pattern: `pattern-aggregation-worker.ts` (daily, feature-flagged, per-item error isolation).
2. **intelligence-report-worker**: Monthly cron (1st of month, 5 AM UTC), aggregates pattern data into monthly report. Pattern: `rate-adjustment-worker.ts` (infrequent, deterministic jobId based on month).

**Registration**: Add to `all-workers.ts` via dynamic import, following existing 18-worker orchestration pattern.

**Alternatives considered**:
- Feedback generation as worker: Overkill — feedback is generated synchronously in consensus post-actions (same pattern as reward distribution)
- Real-time milestone detection: Over-engineered; daily detection is sufficient for milestone-granularity events
