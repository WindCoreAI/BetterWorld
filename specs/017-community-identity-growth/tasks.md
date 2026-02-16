# Tasks: Community Identity & Visible Growth

**Input**: Design documents from `/specs/017-community-identity-growth/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/api-contracts.md, quickstart.md

**Tests**: Test tasks are included in the Polish phase as integration and component tests.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Backend API**: `apps/api/src/`
- **Frontend**: `apps/web/`
- **Database schema**: `packages/db/src/schema/`
- **Migrations**: `packages/db/migrations/`
- **Shared types/constants**: `packages/shared/src/`

---

## Phase 1: Setup

**Purpose**: Verify environment and ensure existing tests pass before making changes

- [X] T001 Checkout `017-community-identity-growth` branch, run `pnpm install --frozen-lockfile`, and verify existing tests pass with `pnpm test`

---

## Phase 2: Foundational (Schema, Migration, Shared Constants)

**Purpose**: Database schema changes, migration, Zod schemas, and shared constants that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Add 3 new enums (`group_type_enum`, `milestone_type_enum`, `feedback_type_enum`) and extend `notification_type_enum` with 3 new values (`feedback`, `milestone_celebration`, `intelligence_report`) in `packages/db/src/schema/enums.ts`. Note: the Drizzle `pgEnum` definition must have the new values appended, AND the migration (T011) must use `ALTER TYPE notification_type ADD VALUE` statements — both are required
- [X] T003 [P] Create `group_milestones` table schema (id, groupType, groupValue, milestoneType, targetValue, currentValue, reachedAt, bannerExpiresAt, timestamps; unique constraint on groupType+groupValue+milestoneType+targetValue; 3 indexes) in `packages/db/src/schema/groupMilestones.ts`
- [X] T004 [P] Create `review_feedback` table schema (id, recipientHumanId FK, recipientAgentId FK, feedbackType, referenceId, referenceType, message, improvementTips jsonb, isRead, readAt, timestamps; check constraint requiring at least one recipient; 4 indexes) in `packages/db/src/schema/reviewFeedback.ts`
- [X] T005 [P] Create `intelligence_reports` table schema (id, reportMonth varchar(7) unique, reportData jsonb, generatedAt, timestamps) in `packages/db/src/schema/intelligenceReports.ts`
- [X] T006 [P] Add `motivation` (text), `primaryDomain` (problemDomainEnum), and `localContext` (text) columns to `packages/db/src/schema/humanProfiles.ts`
- [X] T007 [P] Add `approachPhilosophy` (text) column to `packages/db/src/schema/agents.ts`
- [X] T008 [P] Add `contributorNote` (text) column to `packages/db/src/schema/problems.ts`
- [X] T009 [P] Add `contributorNote` (text) column to `packages/db/src/schema/solutions.ts`
- [X] T010 Re-export new tables (`groupMilestones`, `reviewFeedback`, `intelligenceReports`) from `packages/db/src/schema/index.ts`
- [X] T011 Create migration `packages/db/migrations/0016_community_identity_growth.sql` — 3 new enums, 3 enum value additions to notification_type_enum, 3 new tables with constraints and indexes, 6 column additions, 1 new index on humanProfiles.primaryDomain (16 ordered operations per data-model.md)
- [X] T012 [P] Create Zod schemas for motivation fields (`motivationSchema`, `approachPhilosophySchema`, `contributorNoteSchema`) in `packages/shared/src/schemas/motivation.ts`
- [X] T013 [P] Create Zod schemas for feedback (feedback read, feedback list query params, improvement tip structure) in `packages/shared/src/schemas/feedback.ts`
- [X] T014 [P] Create Zod schemas for intelligence reports (`reportMonthSchema`, report data structure matching the exact JSONB schema from data-model.md L72-80: systemicIssues, crossCityAdoptions, domainTrends, topPatterns, collectiveProgress) in `packages/shared/src/schemas/intelligence.ts`
- [X] T015 [P] Create milestone type constants and tier thresholds (missions_completed: [10,25,50,100,250], problems_resolved: [5,10,25,50,100], members_joined: [10,25,50,100], perfect_week: [1,5,10,25], cross_city_solution: [1,5,10]) in `packages/shared/src/constants/milestones.ts`
- [X] T016 [P] Create city chapter config with taglines and center coordinates for all 3 cities in `packages/shared/src/constants/cities.ts` — Portland: "Keep Portland Better" (45.5152, -122.6784), Chicago: "Chicago Cares Forward" (41.8781, -87.6298), Denver: "Mile High Impact" (39.7392, -104.9903). Taglines are admin-configured static values
- [X] T017 [P] Add 2 new queue names (`milestone-detection`, `intelligence-report`) to `packages/shared/src/constants/queue.ts`
- [X] T018 Create seed data script for milestone rows (15 domains + 3 cities, each with 5 milestone types at varying tiers from T015 constants — exact count depends on tier configuration, approximately 396-450 rows; all with currentValue=0 and reachedAt=NULL) in packages/db seed files

**Checkpoint**: Schema, migration, and shared infrastructure ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Domain Community Home (Priority: P1) MVP

**Goal**: Give each of the 15 domains a community home page with collective metrics, top contributors, monthly highlights, and domain navigation

**Independent Test**: Navigate to any domain page and verify all community sections render with accurate data. Navigate to domain directory and verify all 15 domains listed.

**FRs**: FR-001, FR-002, FR-003, FR-004

### Implementation

- [X] T019 [P] [US1] Create `domain-community.service.ts` — aggregate member count (primaryDomain OR 3+ missions), missions completed, problems resolved, active missions, total solutions; top contributors (JOIN humans/agents with reputationHistory, ORDER BY score, LIMIT param); monthly highlights (current month aggregation); Redis 5-min cache per domain slug — in `apps/api/src/services/domain-community.service.ts`
- [X] T020 [US1] Create domain routes — `GET /domains` (list all 15 with basic metrics) and `GET /domains/:slug` (full community page data with metrics, topContributors, monthlyHighlights, activeMilestones, recentMilestones, intelligence) with Zod validation and standard envelope. No auth middleware — these are public read endpoints per FR-003. Domain discussions and interactions require auth but are handled by existing Sprint 16 discussion system — in `apps/api/src/routes/domains/index.ts`
- [X] T021 [P] [US1] Create `useDomainCommunity` React Query hook for domain list and domain detail endpoints in `apps/web/src/hooks/useDomainCommunity.ts`
- [X] T022 [P] [US1] Create `DomainCard` component (domain name, color, icon, member count, missions, problems; links to domain page) in `apps/web/src/components/domains/DomainCard.tsx`
- [X] T023 [P] [US1] Create `DomainMetrics`, `DomainContributors`, and `DomainHighlights` components (metrics panel with counts, top contributors list with TierBadge/StreakCounter, monthly highlights summary) in `apps/web/src/components/domains/`
- [X] T024 [US1] Create domain directory page — grid of all 15 DomainCards with domain colors/icons, browsable from main nav — in `apps/web/app/domains/page.tsx`
- [X] T025 [US1] Create domain community page — domain header with color/icon, DomainMetrics, DomainContributors, DomainHighlights, existing ThreadList for domain discussions (scopeType='domain'), existing leaderboard for domain (verify existing leaderboard endpoint supports domain filter param; if not, add domain parameter to leaderboard route), zero-state messaging for inactive domains — in `apps/web/app/domains/[slug]/page.tsx`
- [X] T026 [US1] Add domain navigation links (link to `/domains` directory) in `apps/web/src/components/Navigation.tsx`

**Checkpoint**: Domain community pages fully functional — users can browse all 15 domains and view community data

---

## Phase 4: User Story 2 — City Chapter Identity (Priority: P1)

**Goal**: Give each of the 3 cities (Portland, Chicago, Denver) a chapter identity with tagline, chapter metrics, milestones timeline, and city discussions

**Independent Test**: Navigate to any city chapter page and verify tagline, metrics, heatmap, milestones timeline, and discussions render with accurate data

**FRs**: FR-005, FR-006, FR-007

### Implementation

- [X] T027 [P] [US2] Create `city-chapter.service.ts` — aggregate chapter metrics (totalProblems, totalObservations, activeLocalValidators, missionsCompleted, activeParticipants), heatmap data (existing pattern), milestones for city group, Redis 5-min cache per city slug — in `apps/api/src/services/city-chapter.service.ts`
- [X] T028 [US2] Create city chapter route — `GET /cities/:citySlug/chapter` with city slug validation against config, standard envelope, 404 for unknown cities — in `apps/api/src/routes/cities/chapter.ts`
- [X] T029 [US2] Enhance city page with chapter identity sections — add tagline display from city config, chapter milestones timeline, city discussion board (ThreadList with scopeType='city'), integrate existing CityHeatmap — in `apps/web/app/city/[city]/page.tsx`

**Checkpoint**: City chapter pages have community identity — tagline, milestones, discussions alongside existing metrics/heatmap

---

## Phase 5: User Story 3 — Group Milestones & Celebrations (Priority: P2)

**Goal**: Auto-detect when domains/cities reach milestones, display celebration banners for 7 days, notify all group members

**Independent Test**: Trigger a milestone threshold via seed data or test setup, verify banner displays on domain/city page for 7 days, verify notifications sent to group members

**FRs**: FR-008, FR-009, FR-010, FR-011, FR-012

### Implementation

- [X] T030 [P] [US3] Create milestone detection worker — daily cron 4 AM UTC, for each domain + city: count current metrics (missions completed, problems resolved, members joined, perfect weeks using rolling 7-day window from scan date, cross-city solutions), compare against unfilled milestones, set reachedAt + bannerExpiresAt on threshold. On milestone reached: create milestone_celebration notifications filtered to members who had qualifying activity (mission completion, evidence submission, peer review, or discussion thread/reply) within 30 days before milestone date. If multiple milestones reached in single run, leverage existing Sprint 16 notification aggregation. Per-item error isolation — in `apps/api/src/workers/milestone-detection-worker.ts`
- [X] T031 [P] [US3] Create milestones route — `GET /milestones` with required query params (groupType: 'domain'|'city', groupValue: string) and optional status filter ('reached'|'unreached'|'all'), compute bannerActive from bannerExpiresAt > now(), standard envelope — in `apps/api/src/routes/milestones/index.ts`
- [X] T032 [US3] Register `milestone-detection-worker` via dynamic import in `apps/api/src/workers/all-workers.ts`
- [X] T033 [P] [US3] Create `MilestoneBanner` component — celebration banner for recently reached milestones (shows milestone type, target achieved, days remaining), auto-hides after banner period — in `apps/web/src/components/milestones/MilestoneBanner.tsx`
- [X] T034 [P] [US3] Create `MilestoneTimeline` component — vertical timeline of reached and upcoming milestones with progress bars, reached dates, active member recognition — in `apps/web/src/components/milestones/MilestoneTimeline.tsx`
- [X] T035 [US3] Integrate MilestoneBanner (top of page, visible during banner period) and MilestoneTimeline (dedicated section) into domain community page (`apps/web/app/domains/[slug]/page.tsx`) and city chapter page (`apps/web/app/city/[city]/page.tsx`)

**Checkpoint**: Group milestones are tracked, celebrated with 7-day banners, and notifications sent to community members

---

## Phase 6: User Story 4 — Skill Progression Dashboard (Priority: P2)

**Goal**: Show participants their growth journey with reputation trend, tier progress, skill metrics, domain expertise, and auto-generated next goals

**Independent Test**: Log in as an active participant and verify growth dashboard renders with accurate aggregated data

**FRs**: FR-013, FR-014, FR-015

### Implementation

- [X] T036 [P] [US4] Create `growth-journey.service.ts` — aggregate reputation trend (90-day from reputationHistory), current tier + next tier progress (from reputation engine getNextTierInfo), skills (evidence quality AVG confidence, review accuracy from peer reviews/consensus, mission completion rate from missionClaims), domain expertise (GROUP BY domain from missions), personal milestones (tier promotions + streak records), auto-generated next goals (closest to: next tier, accuracy target, domain breadth, streak record), Redis 5-min cache per humanId — in `apps/api/src/services/growth-journey.service.ts`
- [X] T037 [US4] Create growth route — `GET /growth/me` with humanAuth(), returns full growth journey data per api-contracts.md Section 4, standard envelope — in `apps/api/src/routes/growth/index.ts`
- [X] T038 [P] [US4] Create `useGrowthJourney` React Query hook for growth endpoint in `apps/web/src/hooks/useGrowthJourney.ts`
- [X] T039 [P] [US4] Create growth components — `ReputationTrend` (90-day line chart), `SkillMetrics` (3 skill cards with current/previous/trend arrow), `DomainExpertise` (domain breakdown with mission counts), `NextGoals` (2-3 auto-generated goal cards with progress bars) — in `apps/web/src/components/growth/`
- [X] T040 [US4] Create growth dashboard page — "Your Growth Journey" header, current tier with progress to next, ReputationTrend chart, SkillMetrics cards, DomainExpertise breakdown, personal milestones timeline, NextGoals section, welcome zero-state for new participants — in `apps/web/app/dashboard/growth/page.tsx`

**Checkpoint**: Participants can view their complete growth journey and understand their progression path

---

## Phase 7: User Story 5 — Review Feedback Loop (Priority: P2)

**Goal**: Generate actionable feedback after consensus decisions (rejections, disagreements, recognition), deliver via notifications and dedicated feedback inbox

**Independent Test**: Trigger an evidence rejection or consensus disagreement and verify feedback is generated and appears in feedback inbox with improvement tips

**FRs**: FR-016, FR-017, FR-018, FR-019

### Implementation

- [X] T041 [P] [US5] Create `feedback.service.ts` — generate feedback from consensus decisions (evidence_rejection with improvement tips by rejection reason, review_disagreement explaining gap, high_performer_recognition for 10+ accuracy streak), inbox queries (cursor-paginated, unreadOnly filter, type filter), mark read with ownership check, unread count with Redis 1-min cache — in `apps/api/src/services/feedback.service.ts`
- [X] T042 [US5] Create feedback routes — `GET /feedback` (cursor-paginated, humanAuth() or requireAgent(), unreadOnly/type/cursor/limit query params), `PATCH /feedback/:id/read` (ownership check, 403 if not recipient), `GET /feedback/unread-count` — in `apps/api/src/routes/feedback/index.ts`
- [X] T043 [US5] Add feedback generation hook to consensus engine post-actions — non-blocking try-catch after consensus decision, call `feedbackService.generateFeedback(tx, submissionId, submissionType, decision, completedEvals)`, also create notification of type `feedback` — in `apps/api/src/services/consensus-engine.ts`
- [X] T044 [P] [US5] Create `useFeedback` React Query hook for feedback list, mark-read mutation, and unread count in `apps/web/src/hooks/useFeedback.ts`
- [X] T045 [P] [US5] Create `FeedbackList` (inbox list with unread indicator, type filter) and `FeedbackItem` (feedback card with type icon, message, improvement tips, reference link, read/unread state) components in `apps/web/src/components/feedback/`
- [X] T046 [US5] Create feedback inbox page — header with unread count badge, FeedbackList with infinite scroll, filter by type, mark-as-read on open, empty state messaging — in `apps/web/app/dashboard/feedback/page.tsx`

**Checkpoint**: Feedback loop operational — consensus decisions generate actionable feedback, participants can read and learn from it

---

## Phase 8: User Story 6 — Identity-Rich Content Cards (Priority: P3)

**Goal**: Enrich problem cards, solution cards, and activity feed with contributor identity signals (tier, specializations, streak, specialist status)

**Independent Test**: View any content list and verify contributor metadata (tier badge, specializations, streak days, specialist indicator) appears alongside content cards

**FRs**: FR-020, FR-021, FR-022

### Implementation

- [X] T047 [P] [US6] Create `contributor-metadata.service.ts` — batch fetch contributor identity for a list of contributor IDs, no N+1 queries. Data sources by entity type: **Agents**: tier from `validatorPool.currentTier`, specializations from `validatorPool.domainSpecializations` JSONB, streakDays from `streaks`, isSpecialist=true if domainSpecializations includes the content's domain. **Humans**: tier from reputation engine (reputationScore → tier mapping), specializations = domains with 3+ completed missions (GROUP BY domain from missionClaims), streakDays from `streaks`. Single batch query with UNION approach — in `apps/api/src/services/contributor-metadata.service.ts`
- [X] T048 [US6] Enrich `GET /problems`, `GET /solutions`, and activity feed event responses with contributor metadata — collect unique contributor IDs from results, batch fetch via contributor-metadata service, merge `contributor` object into each item. For activity feed: enrich `actor` object in WebSocket events and any activity feed list endpoint with tier, specializations, and streakDays — in `apps/api/src/routes/problems.routes.ts`, `apps/api/src/routes/solutions.routes.ts`, and activity feed event construction
- [X] T049 [P] [US6] Create `ContributorIdentity` component — displays TierBadge, top 3 SpecialistBadges, StreakCounter, specialist-in-domain indicator alongside username; gracefully handles missing fields — in `apps/web/src/components/identity/ContributorIdentity.tsx`
- [X] T050 [US6] Update `ProblemCard`, `SolutionCard`, and `ActivityFeed` components to render ContributorIdentity alongside contributor username, replacing bare username display — in `apps/web/src/components/ProblemCard.tsx`, `apps/web/src/components/SolutionCard.tsx`, `apps/web/src/components/ActivityFeed.tsx`

**Checkpoint**: Content cards throughout the platform show rich contributor identity, building recognition and trust

---

## Phase 9: User Story 7 — Motivation & Narrative Fields (Priority: P3)

**Goal**: Allow participants to express motivation, primary domain, local context, and contributor notes; agents expose approach philosophy; update onboarding and profile completeness

**Independent Test**: Complete onboarding with motivation step, edit profile with new fields, create a problem with contributorNote, verify all text passes guardrail moderation

**FRs**: FR-023, FR-024, FR-025, FR-026, FR-027, FR-028

### Implementation

- [X] T051 [P] [US7] Enhance human profile route to accept `motivation` (max 500, guardrail pipeline), `primaryDomain` (problemDomainEnum), and `localContext` (max 300, guardrail pipeline) fields in `PATCH /profile` — in `apps/api/src/routes/profile/index.ts`
- [X] T052 [P] [US7] Enhance agent routes — accept `approachPhilosophy` (max 1000, guardrail pipeline) in `PATCH /agents/me`, add `approachPhilosophy` to `toPublicProfile()` in `GET /agents/:id` (note: `soulSummary` is already exposed in toPublicProfile) — in `apps/api/src/services/agent.service.ts` and relevant agent routes
- [X] T053 [P] [US7] Enhance `POST /problems` and `POST /solutions` to accept optional `contributorNote` (max 200, included in parent content guardrail evaluation) — in `apps/api/src/routes/problems.routes.ts` and `apps/api/src/routes/solutions.routes.ts`
- [X] T054 [US7] Update profile completeness scoring — add `motivation` to ProfileInput interface, adjust weights so bio (10 pts) + motivation (10 pts) = 20 pts total (current bio = 10 pts out of 100; add 10 new points for motivation and renormalize other categories to keep total at 100, or expand to 110 total). Note: spec says "up from 15%" but actual current bio weight is 10% — in the profile completeness service/utility
- [X] T055 [US7] Add optional motivation step to onboarding wizard — motivation textarea (500 chars), primaryDomain dropdown (15 domains), localContext textarea (300 chars), skip button, submit via existing `PATCH /profile` — in `apps/web/src/components/onboarding/OrientationSteps.tsx` and `apps/web/app/onboarding/page.tsx`

**Checkpoint**: Participants can express their personal narrative, agents show approach philosophy, profile completeness reflects motivation

---

## Phase 10: User Story 8 — Visible Community Intelligence (Priority: P3)

**Goal**: Generate and display monthly community intelligence reports with systemic issues, cross-city adoptions, domain trends, and collective progress

**Independent Test**: Verify intelligence report endpoint returns aggregated data and dashboard/domain pages render monthly insights

**FRs**: FR-029, FR-030, FR-031, FR-032

### Implementation

- [X] T056 [P] [US8] Create `intelligence.service.ts` — aggregate monthly report from existing pattern aggregation data: systemic issues (problem clusters), cross-city solution adoptions, domain trends (problems/missions/members deltas), top patterns by urgency, collective progress metrics (total missions, problems resolved, new members, active participants), domain-filtered view — in `apps/api/src/services/intelligence.service.ts`
- [X] T057 [P] [US8] Create intelligence report worker — monthly cron (1st of month, 5 AM UTC), deterministic jobId based on month (prevent duplicates), calls intelligence service to generate report, stores in intelligence_reports table, creates intelligence_report notification — in `apps/api/src/workers/intelligence-report-worker.ts`
- [X] T058 [US8] Create intelligence routes — `GET /intelligence/latest` (public, latest report, Redis 1-hour cache), `GET /intelligence/domain/:domain` (public, domain-filtered, Redis 1-hour cache), graceful 404 zero-state if no report exists — in `apps/api/src/routes/intelligence/index.ts`
- [X] T059 [US8] Register `intelligence-report-worker` via dynamic import in `apps/api/src/workers/all-workers.ts`
- [X] T060 [P] [US8] Create `useIntelligence` React Query hook for latest report and domain-filtered report in `apps/web/src/hooks/useIntelligence.ts`
- [X] T061 [P] [US8] Create `CommunityIntelligence` component — "What We're Learning Together" section showing systemic issues, cross-city adoptions, domain trends, collective progress metrics, zero-state when no report — in `apps/web/src/components/intelligence/CommunityIntelligence.tsx`
- [X] T062 [US8] Integrate CommunityIntelligence into main dashboard and domain community page (domain-filtered view using `GET /intelligence/domain/:domain`) — in dashboard layout and `apps/web/app/domains/[slug]/page.tsx`

**Checkpoint**: Monthly community intelligence is generated and visible across dashboard and domain pages

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Integration tests, frontend component tests, edge cases, and performance validation

### API Integration Tests

- [X] T063 [P] Write integration tests for domain community endpoints (GET /domains list, GET /domains/:slug detail, 404 for invalid slug, zero-state domain) in `apps/api/tests/domains.test.ts`
- [X] T064 [P] Write integration tests for city chapter endpoint (GET /cities/:slug/chapter, 404 for invalid city, tagline + metrics verification) in `apps/api/tests/city-chapter.test.ts`
- [X] T065 [P] Write integration tests for milestones endpoint (GET /milestones with groupType/groupValue, status filter, bannerActive computation) in `apps/api/tests/milestones.test.ts`
- [X] T066 [P] Write integration tests for growth journey endpoint (GET /growth/me, auth required, reputation trend, tier progress, skills, goals) in `apps/api/tests/growth.test.ts`
- [X] T067 [P] Write integration tests for feedback endpoints (GET /feedback cursor pagination, PATCH /feedback/:id/read ownership check, GET /feedback/unread-count, 403 for non-recipient) in `apps/api/tests/feedback.test.ts`
- [X] T068 [P] Write integration tests for intelligence endpoints (GET /intelligence/latest, GET /intelligence/domain/:domain, 404 zero-state) in `apps/api/tests/intelligence.test.ts`
- [X] T069 [P] Write integration tests for contributor metadata enrichment (batch query, no N+1, problems/solutions responses include contributor object) in `apps/api/tests/contributor-metadata.test.ts`
- [X] T070 [P] Write integration tests for motivation fields (PATCH /profile with motivation/primaryDomain/localContext, PATCH /agents/me with approachPhilosophy, POST /problems with contributorNote, guardrail integration) in `apps/api/tests/motivation-fields.test.ts`

### Frontend Component Tests

- [X] T071 [P] Write component tests for domain community (DomainCard renders, domain directory lists 15 domains, domain page renders sections, zero-state handling) in `apps/web/src/__tests__/DomainCommunity.test.tsx`
- [X] T072 [P] Write component tests for growth dashboard (ReputationTrend renders, SkillMetrics shows trends, NextGoals renders goals, welcome state for new users) in `apps/web/src/__tests__/GrowthDashboard.test.tsx`
- [X] T073 [P] Write component tests for feedback inbox (FeedbackList renders items, FeedbackItem shows improvement tips, mark-as-read works, empty state) in `apps/web/src/__tests__/FeedbackInbox.test.tsx`

### Verification

- [X] T074 Verify edge cases — zero-state domains/cities (graceful messaging), new participant growth dashboard (welcome state), missing contributor metadata (fields hidden not "N/A"), simultaneous milestones (each triggers independently), guardrail rejection flow for motivation/contributorNote
- [X] T075 Verify performance — no N+1 queries in contributor metadata (batch query), Redis cache hit rates for domain/city/growth endpoints, API p95 < 500ms for all new endpoints, milestone worker completes within reasonable time for 450 rows
- [X] T076 Run `pnpm typecheck` and `pnpm lint` to ensure zero TypeScript and linting errors across all new and modified files

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories**
- **US1 Domain Community (Phase 3)**: Depends on Foundational (Phase 2)
- **US2 City Chapter (Phase 4)**: Depends on Foundational (Phase 2)
- **US3 Group Milestones (Phase 5)**: Depends on Foundational (Phase 2); display integration into US1/US2 pages
- **US4 Skill Progression (Phase 6)**: Depends on Foundational (Phase 2) only — fully independent
- **US5 Review Feedback (Phase 7)**: Depends on Foundational (Phase 2) only — fully independent
- **US6 Identity-Rich Cards (Phase 8)**: Depends on Foundational (Phase 2) only — fully independent
- **US7 Motivation & Narrative (Phase 9)**: Depends on Foundational (Phase 2) only — fully independent
- **US8 Community Intelligence (Phase 10)**: Depends on Foundational (Phase 2); display integration into US1 domain pages
- **Polish (Phase 11)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: After Foundational — no dependencies on other stories
- **US2 (P1)**: After Foundational — no dependencies on other stories
- **US3 (P2)**: After Foundational — milestone display integrates into US1/US2 pages (T035), but milestones backend works independently
- **US4 (P2)**: After Foundational — fully independent of all other stories
- **US5 (P2)**: After Foundational — fully independent of all other stories
- **US6 (P3)**: After Foundational — fully independent; best after US7 for full enrichment with contributorNote
- **US7 (P3)**: After Foundational — fully independent of all other stories
- **US8 (P3)**: After Foundational — intelligence display integrates into US1 domain pages (T062), but intelligence backend works independently

### Within Each User Story

- Services before routes (backend)
- Routes before frontend hooks
- Hooks and components before pages
- Core implementation before integration with other stories

### Parallel Opportunities

- All Foundational tasks marked [P] (T003-T009, T012-T017) can run in parallel
- After Foundational phase, **all 8 user stories can start in parallel**
- Within each story, backend service [P] tasks can run alongside frontend component [P] tasks
- All test tasks in Phase 11 (T063-T073) can run in parallel

---

## Parallel Examples

### Foundational Phase — Parallel Schema + Shared Tasks

```
# Launch all new table schemas in parallel:
Task T003: "Create group_milestones table schema"
Task T004: "Create review_feedback table schema"
Task T005: "Create intelligence_reports table schema"

# Launch all column additions in parallel:
Task T006: "Add motivation columns to humanProfiles"
Task T007: "Add approachPhilosophy to agents"
Task T008: "Add contributorNote to problems"
Task T009: "Add contributorNote to solutions"

# Launch all Zod schemas in parallel:
Task T012: "Create motivation Zod schemas"
Task T013: "Create feedback Zod schemas"
Task T014: "Create intelligence Zod schemas"

# Launch all constants in parallel:
Task T015: "Create milestone constants"
Task T016: "Create city chapter config"
Task T017: "Add queue names"
```

### User Story 1 — Parallel Backend + Frontend

```
# Launch service and frontend components in parallel:
Task T019: "Create domain-community.service.ts"  (backend)
Task T021: "Create useDomainCommunity hook"       (frontend - can stub API)
Task T022: "Create DomainCard component"          (frontend)
Task T023: "Create DomainMetrics/Contributors/Highlights" (frontend)
```

### Cross-Story Parallelism (After Foundational)

```
# All 8 user stories can proceed simultaneously:
Developer A: US1 (Domain Community) + US2 (City Chapter)
Developer B: US4 (Skill Progression) + US5 (Review Feedback)
Developer C: US6 (Identity-Rich Cards) + US7 (Motivation Fields)
Developer D: US3 (Group Milestones) + US8 (Community Intelligence)
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: US1 — Domain Community Home
4. Complete Phase 4: US2 — City Chapter Identity
5. **STOP and VALIDATE**: Test domain directory, domain pages, city chapter pages independently
6. Deploy/demo if ready — community now has visible homes

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. **US1 + US2** → Domain + City community pages (MVP!)
3. **US3** → Group milestones on community pages
4. **US4 + US5** → Growth dashboard + Feedback loop (personal growth visible)
5. **US6 + US7** → Identity enrichment + Narrative fields
6. **US8** → Community intelligence
7. **Polish** → Tests, edge cases, performance validation

### Suggested Priority Order (Single Developer)

1. Phase 2 (Foundational) — all stories need this
2. US1 → US2 (P1 stories — community homes)
3. US4 (P2 — growth dashboard, fully independent, high visible impact)
4. US7 (P3 — motivation fields, enables richer US6)
5. US3 (P2 — milestones, best after US1/US2 pages exist)
6. US5 (P2 — feedback, can be built any time)
7. US6 (P3 — identity cards, best after US7)
8. US8 (P3 — intelligence, best after US1 pages exist)
9. Phase 11 (Polish — tests + verification)

---

## Notes

- [P] tasks = different files, no dependencies within the phase
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable after Foundational phase
- All new text content (motivation, localContext, approachPhilosophy, contributorNote) MUST route through the 3-layer guardrail pipeline — no bypass path (Constitution Principle I)
- Cursor-based pagination with composite cursor `${timestamp}::${id}` for feedback list
- Redis caching: 5-min for community pages/growth, 1-min for feedback unread, 1-hour for intelligence
- Standard API envelope: `{ ok, data/error, requestId }` for all new endpoints
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- 76 total tasks across 11 phases
