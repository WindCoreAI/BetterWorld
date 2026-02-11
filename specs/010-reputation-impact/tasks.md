# Tasks: Reputation & Impact System

**Input**: Design documents from `/specs/010-reputation-impact/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), data-model.md, contracts/, research.md, quickstart.md
**Tests**: Yes — spec.md SC-014 requires 40+ new integration tests covering reputation, leaderboards, fraud detection, and aggregation pipelines.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. 12 user stories (3 P1, 5 P2, 4 P3) organized into 15 phases.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new dependencies, create shared constants/types/schemas used across all user stories

- [X]T001 Install Sprint 9 dependencies: `sharp-phash` in `apps/api/package.json` (sharp already present), `leaflet.heat` and `@types/leaflet.heat` in `apps/web/package.json`
- [X]T002 [P] Create reputation tier constants (thresholds: 0/100/500/2000/5000, names, privileges, multipliers: 1.0/1.1/1.2/1.5/2.0) in `packages/shared/src/constants/reputation-tiers.ts`
- [X]T003 [P] Create fraud threshold constants (50=flag for review, 150=auto-suspend, pHash Hamming distance 6=duplicate/10=suspicious) in `packages/shared/src/constants/fraud-thresholds.ts`
- [X]T004 [P] Create streak milestone constants (7d=1.1x, 30d=1.25x, 90d=1.5x, 365d=2.0x, freeze cooldown=30 days) in `packages/shared/src/constants/streak-milestones.ts`
- [X]T005 [P] Create reputation Zod schemas (ReputationScoreSchema, ReputationBreakdownSchema, ReputationHistoryEntrySchema, EndorsementCreateSchema, TierDefinitionSchema, GracePeriodSchema) in `packages/shared/src/schemas/reputation.ts`
- [X]T006 [P] Create leaderboard Zod schemas (LeaderboardQuerySchema with type/period/domain/location_scope/cursor/limit params, LeaderboardEntrySchema, MyRankSchema) in `packages/shared/src/schemas/leaderboards.ts`
- [X]T007 [P] Create fraud Zod schemas (FraudScoreSchema, FraudEventSchema, FraudAdminActionSchema with action enum: clear_flag/reset_score/manual_suspend/unsuspend + reason 10+ chars, FraudQueueQuerySchema) in `packages/shared/src/schemas/fraud.ts`
- [X]T008 [P] Create impact Zod schemas (DashboardMetricsSchema, HeatmapPointSchema, HeatmapQuerySchema with domain/period/bounds params, PortfolioSchema, PortfolioVisibilitySchema) in `packages/shared/src/schemas/impact.ts`
- [X]T009 [P] Create reputation TypeScript types (ReputationScore, ReputationBreakdown, ReputationTier, ReputationHistoryEntry, Endorsement, GracePeriod) in `packages/shared/src/types/reputation.ts`
- [X]T010 [P] Create leaderboard TypeScript types (LeaderboardEntry, LeaderboardType, LeaderboardFilter, MyRankResult) in `packages/shared/src/types/leaderboards.ts`
- [X]T011 [P] Create fraud TypeScript types (FraudScore, FraudStatus, FraudEvent, FraudAdminAction, FraudQueueEntry) in `packages/shared/src/types/fraud.ts`
- [X]T012 [P] Create impact TypeScript types (ImpactDashboard, HeatmapPoint, Portfolio, PortfolioVisibility) in `packages/shared/src/types/impact.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema, migrations, queue constants, and shared library functions that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [X]T013 Add 4 new enums to `packages/db/src/schema/enums.ts`: `reputationTierEnum` (newcomer, contributor, advocate, leader, champion), `fraudActionEnum` (flag_for_review, auto_suspend, clear_flag, reset_score, manual_suspend, unsuspend), `endorsementStatusEnum` (active, revoked), `portfolioVisibilityEnum` (public, private)
- [X]T014 Create `reputationScores` and `reputationHistory` table schemas in `packages/db/src/schema/reputation.ts` — reputationScores: humanId (PK, FK→humans CASCADE), totalScore (decimal 10,2 default 0 CHECK>=0), missionQualityScore, peerAccuracyScore, streakScore, endorsementScore (all decimal 8,2 default 0), currentTier (reputationTierEnum default newcomer), tierMultiplier (decimal 3,2 default 1.00), gracePeriodStart (nullable), gracePeriodTier (nullable), lastActivityAt, lastDecayAt, timestamps — indexes: (totalScore DESC), (currentTier), (lastActivityAt), partial on gracePeriodStart; reputationHistory: id (UUID PK), humanId (FK), scoreBefore, scoreAfter, delta (all decimal 10,2), eventType (varchar 50), eventSourceId (nullable UUID), eventSourceType (nullable varchar 50), tierBefore, tierAfter (nullable reputationTierEnum), metadata (jsonb nullable), createdAt — indexes: (humanId, createdAt DESC), (eventType), (createdAt DESC)
- [X]T015 [P] Create `streaks` table schema in `packages/db/src/schema/streaks.ts` — humanId (PK, FK→humans CASCADE), currentStreak (integer default 0 CHECK>=0), longestStreak (integer default 0 CHECK>=0), lastActiveDate (date nullable), streakMultiplier (decimal 3,2 default 1.00), freezeAvailable (boolean default true), freezeLastUsedAt (nullable), freezeActive (boolean default false), timestamps — indexes: (currentStreak DESC), (lastActiveDate)
- [X]T016 [P] Create `endorsements` table schema in `packages/db/src/schema/endorsements.ts` — id (UUID PK), fromHumanId (FK→humans), toHumanId (FK→humans), reason (text CHECK length 10-500), status (endorsementStatusEnum default active), createdAt — indexes: (toHumanId, status), (fromHumanId), UNIQUE(fromHumanId, toHumanId), CHECK(fromHumanId != toHumanId)
- [X]T017 [P] Create `fraudScores`, `fraudEvents`, and `fraudAdminActions` table schemas in `packages/db/src/schema/fraudScores.ts` — fraudScores: humanId (PK, FK→humans CASCADE), totalScore (integer default 0 CHECK>=0), phashScore, velocityScore, statisticalScore (all integer default 0), status (varchar 20 default 'clean'), flaggedAt, suspendedAt (nullable), lastScoredAt (nullable), timestamps — indexes: partial on status WHERE !='clean', (totalScore DESC); fraudEvents: id (UUID PK), humanId (FK), evidenceId (nullable FK→evidence), detectionType (varchar 50), scoreDelta (integer), details (jsonb), createdAt — indexes: (humanId, createdAt DESC), (detectionType), (evidenceId); fraudAdminActions: id (UUID PK), humanId (FK), adminId (UUID), action (fraudActionEnum), reason (text CHECK length>=10), fraudScoreBefore, fraudScoreAfter (integer), metadata (jsonb nullable), createdAt — indexes: (humanId, createdAt DESC), (adminId)
- [X]T018 [P] Create `evidencePhashes` table schema in `packages/db/src/schema/evidence-phashes.ts` — id (UUID PK), evidenceId (FK→evidence CASCADE, UNIQUE), humanId (FK→humans), phash (varchar 16), createdAt — indexes: (humanId, createdAt DESC), (phash), UNIQUE(evidenceId)
- [X]T019 [P] Add `portfolioVisibility` column (portfolioVisibilityEnum, default 'public') to humans table in `packages/db/src/schema/humans.ts`
- [X]T020 Export all new schemas from `packages/db/src/schema/index.ts` barrel file
- [X]T021 Generate and run Drizzle migration for all Sprint 9 tables, enums, indexes, and constraints via `pnpm drizzle-kit generate` in `packages/db/`
- [X]T022 [P] Add new BullMQ queue name constants (REPUTATION_DECAY, FRAUD_SCORING, METRICS_AGGREGATION) to `packages/shared/src/constants/queue.ts`
- [X]T023 [P] Create backfill seed script to initialize reputation_scores, streaks, and fraud_scores rows for all existing humans in `packages/db/src/seed/backfill-reputation.ts` — all start as newcomer (score 0), streak 0, fraud score 0; include a verification query at the end that counts backfilled rows vs total humans and logs any discrepancies; add to migration pipeline documentation in quickstart.md

**Checkpoint**: Database schema and shared infrastructure ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Earn and Track Reputation (Priority: P1) MVP

**Goal**: Humans earn reputation based on a 4-factor algorithm (mission quality, peer accuracy, streak, endorsements). Reputation decays with inactivity. Humans can endorse peers. All reputation changes logged to immutable history.

**Independent Test**: Complete a mission with high-quality evidence. Verify reputation score increases. View 4-factor breakdown via GET /reputation/me. Submit an endorsement for another human. After 7 days of inactivity, verify score decays. View reputation history via GET /reputation/me/history.

### Tests for User Story 1

- [X]T024 [P] [US1] Write integration tests for reputation calculation (4-factor algorithm with weights 0.4/0.3/0.2/0.1, score computation, edge cases: zero inputs, max values, floor at 0, tier multiplier application) in `apps/api/src/__tests__/reputation.test.ts`
- [X]T025 [P] [US1] Write integration tests for reputation decay (2%/week for 7+ days inactive, accelerated 5% after 90 days, daily batch processing, floor at 0, no decay for active humans) in `apps/api/src/__tests__/reputation.test.ts`
- [X]T026 [P] [US1] Write integration tests for endorsement creation (valid endorsement, self-endorsement rejection, duplicate rejection, rate limit 5/day, not-found handling) in `apps/api/src/__tests__/reputation.test.ts`

### Implementation for User Story 1

- [X]T027 [P] [US1] Implement 4-factor reputation calculation algorithm in `apps/api/src/lib/reputation-engine.ts` — calculateReputation(humanId): fetch mission quality (avg `finalConfidence` of last 10 verified evidence × 100), peer accuracy (query peer reviews and compare each verdict against final outcome, calculate alignment percentage × 100), streak bonus (`min(streakDays / 30, 1.0) × 100`), endorsement score (`min(endorsementCount / 10, 1.0) × 100`); apply weighted formula (quality×0.4 + accuracy×0.3 + streak×0.2 + endorsements×0.1) × tierMultiplier; enforce floor of 0; return total score and breakdown. This is a full recalculation of absolute score (not delta accumulation).
- [X]T028 [P] [US1] Implement reputation decay logic in `apps/api/src/lib/reputation-engine.ts` — applyDecay(humanId): 2%/week for humans inactive 7+ days (no mission completions or peer reviews), accelerated 5%/week after 90 days inactive; update lastDecayAt timestamp; log decay event to reputation_history
- [X]T029 [US1] Implement reputation service combining calculate + decay + history logging in `apps/api/src/lib/reputation-engine.ts` — updateReputation(humanId, eventType, eventSourceId): calculate new score, compare with previous, write to reputationScores table, insert reputationHistory row with scoreBefore/scoreAfter/delta, emit WebSocket event on score change
- [X]T030 [US1] Create reputation routes in `apps/api/src/routes/reputation/index.ts` — GET /reputation/me (humanAuth, return score + breakdown + tier + nextTier progress + gracePeriod per contract), GET /reputation/:humanId (optional auth, public data only, respect portfolio visibility), GET /reputation/me/history (humanAuth, cursor pagination, optional event_type filter per contract), POST /reputation/endorsements (humanAuth, rate limit 5/day, Zod validate toHumanId + reason 10-500 chars, reject self-endorsement + duplicates per contract)
- [X]T031 [US1] Create BullMQ daily reputation decay worker in `apps/api/src/workers/reputation-decay.ts` — cron schedule daily at 00:00 UTC, batch process 100 humans per iteration, apply decay to inactive humans, log results with Pino, 3 retries with dead letter queue
- [X]T032 [US1] Integrate reputation recalculation trigger into existing evidence verification completion flow — after evidence is verified in `apps/api/src/workers/evidence-verification.ts`, enqueue reputation update for the human (mission_quality factor)
- [X]T033 [US1] Mount reputation routes in `apps/api/src/routes/v1.routes.ts` under /reputation prefix
- [X]T034 [P] [US1] Create ReputationScore component displaying total score + 4-factor breakdown bars in `apps/web/src/components/reputation/ReputationScore.tsx`
- [X]T035 [US1] Create `useReputation` React Query hook fetching GET /reputation/me and GET /reputation/:humanId in `apps/web/src/hooks/useReputation.ts`
- [X]T036 [US1] Integrate ReputationScore component into existing human dashboard at `apps/web/app/dashboard/page.tsx` — add reputation card showing score, breakdown, and tier

**Checkpoint**: Reputation scoring engine operational — humans earn reputation based on 4-factor algorithm, can endorse peers, and see reputation breakdown with full history

---

## Phase 4: User Story 2 — Unlock Privileges via Reputation Tiers (Priority: P1)

**Goal**: Humans unlock tiers (Newcomer→Contributor→Advocate→Leader→Champion) as reputation increases, gaining privileges at each tier. 7-day grace period before demotion.

**Independent Test**: Earn 100 reputation → auto-promote to Contributor (tier 2). Gain peer reviewer eligibility and 1.1x token multiplier. Verify tier badge and progress bar. GET /reputation/tiers returns all 5 tiers with human counts. Lose reputation → 7-day grace period → demotion if not recovered.

**Dependencies**: Requires US1 (reputation scoring) to be functional

### Tests for User Story 2

- [X]T037 [P] [US2] Write integration tests for tier promotion/demotion (auto-promote at thresholds 100/500/2000/5000, 7-day grace period activation, grace period expiry demotion, grace period cancellation on recovery, privilege gating, tier multiplier application) in `apps/api/src/__tests__/reputation.test.ts`

### Implementation for User Story 2

- [X]T038 [US2] Implement tier threshold, privilege mapping, and grace period logic in `apps/api/src/lib/reputation-engine.ts` — getTierForScore(score), getPrivileges(tier), getTokenMultiplier(tier), getNextTierThreshold(tier); grace period: on reputation drop below tier threshold set gracePeriodStart to now, on recovery clear grace period, on expiry (7 days) demote tier and remove privileges
- [X]T039 [US2] Integrate tier promotion/demotion into reputation scoring service in `apps/api/src/lib/reputation-engine.ts` — after score recalculation: check new tier, if promoted: update tier + tierMultiplier + insert reputationHistory with tier_change event + emit WebSocket notification, if below threshold: initiate grace period (set gracePeriodStart, emit grace period warning notification with demotion deadline date) or demote if grace expired (7 days); grace period notification should include the tier at risk, deadline date, and score needed to recover
- [X]T040 [US2] Create GET /reputation/tiers route returning all tier definitions with thresholds, privileges, multipliers, and humanCount (cached) in `apps/api/src/routes/reputation/index.ts` — per reputation.yaml contract, no auth required
- [X]T041 [US2] Integrate token multiplier from tier into existing reward calculation — when calculating mission reward in token distribution flow, look up human's tierMultiplier from reputationScores table, apply to base reward before token transaction insertion (preserving double-entry accounting with balance_before/balance_after)
- [X]T042 [US2] Add tier-based access control middleware for peer review eligibility — in peer review routes, check human's currentTier >= 'contributor' before allowing review submissions
- [X]T043 [P] [US2] Create TierBadge component displaying tier name with color-coded badge in `apps/web/src/components/reputation/TierBadge.tsx`
- [X]T044 [P] [US2] Create TierProgress component showing progress bar toward next tier with threshold labels and percentage in `apps/web/src/components/reputation/TierProgress.tsx`
- [X]T045 [US2] Integrate TierBadge and TierProgress into human dashboard and reputation display in `apps/web/app/dashboard/page.tsx`

**Checkpoint**: Tier system operational — humans progress through tiers, gain privileges, and see clear progression goals

---

## Phase 5: User Story 7 — Evidence Fraud Scoring Pipeline (Priority: P1)

**Goal**: Detect fraud in evidence submissions via pHash duplicate detection, velocity checks, and statistical profiling. Fraud scores accumulate per human. Score >= 50 flags for admin review, >= 150 auto-suspends.

**Independent Test**: Submit same photo for 5 missions → pHash detects duplicates (Hamming distance ≤ 6) → fraud score increments → after threshold (50), account flagged, submissions held. Submit 15 evidence in 10 minutes → velocity check flags abnormal rate. Statistical profiler detects GPS clustering.

### Tests for User Story 7

- [X]T046 [P] [US7] Write integration tests for pHash duplicate detection (same image=distance 0, similar images Hamming ≤6 flagged, dissimilar images >10 pass, cross-mission duplicate check within same human) in `apps/api/src/__tests__/fraud-scoring.test.ts`
- [X]T047 [P] [US7] Write integration tests for velocity checks (normal rate passes, 15+ in 10min flagged, 1hr window check, rate reset after window expires) in `apps/api/src/__tests__/fraud-scoring.test.ts`
- [X]T048 [P] [US7] Write integration tests for statistical profiling (GPS variance < threshold flagged, approval rate > 95% flagged, timing pattern clustering flagged) in `apps/api/src/__tests__/fraud-scoring.test.ts`
- [X]T049 [P] [US7] Write integration tests for fraud score thresholds and status transitions (score < 50 = clean, 50-149 = flagged + submissions held, 150+ = suspended + all frozen, admin actions: clear/reset/suspend/unsuspend) in `apps/api/src/__tests__/fraud-scoring.test.ts`

### Implementation for User Story 7

- [X]T050 [P] [US7] Implement pHash calculation using sharp + sharp-phash in `apps/api/src/lib/phash.ts` — calculatePhash(imageBuffer): returns 16-char hex string, hammingDistance(hash1, hash2): returns integer 0-64, isDuplicate(hash1, hash2): returns true if distance ≤ 6 (per PHASH_DUPLICATE_THRESHOLD), isSuspicious(hash1, hash2): returns true if distance ≤ 10 (per PHASH_SUSPICIOUS_THRESHOLD)
- [X]T051 [P] [US7] Implement velocity check logic in `apps/api/src/lib/fraud-detection.ts` — checkVelocity(humanId): use Redis sorted set (fraud:velocity:{humanId}:{tier}) to count submissions in 10min/1hr/24hr windows, flag if 15+ in 10min, return { flagged, count, window, scoreDelta }
- [X]T052 [P] [US7] Implement statistical profiling in `apps/api/src/lib/fraud-detection.ts` — analyzeGpsVariance(humanId): flag if GPS std deviation < threshold (always exact coordinates), analyzeApprovalRate(humanId): flag if approval rate > 95% with 10+ submissions (suspicious perfection), analyzeTimingPatterns(humanId): flag if submissions cluster at exact intervals
- [X]T053 [US7] Implement fraud score aggregation and threshold logic in `apps/api/src/lib/fraud-detection.ts` — incrementFraudScore(humanId, detectionType, scoreDelta, details): update fraud_scores table, insert fraud_events row, apply thresholds (50=flag: set status to 'flagged', flaggedAt, insert fraud_event with flag_for_review; 150=suspend: set status to 'suspended', suspendedAt, insert fraud_event with auto_suspend); return updated score and status
- [X]T054 [US7] Create BullMQ async fraud scoring worker in `apps/api/src/workers/fraud-scoring.ts` — triggered after evidence submission: calculate pHash + store in evidence_phashes, compare against human's recent hashes, run velocity check, run statistical profiling, aggregate fraud score deltas, apply threshold actions; concurrency 3, 3 retries with dead letter queue
- [X]T055 [US7] Integrate fraud detection trigger into evidence submission flow — after evidence is submitted in evidence routes, enqueue fraud scoring job; if human's fraud status is 'flagged', hold submission pending admin review; if 'suspended', reject submission with 403
- [X]T056 [US7] Mount fraud-related routes (admin endpoints in Phase 10) and register fraud scoring worker queue in `apps/api/src/routes/v1.routes.ts`

**Checkpoint**: Fraud detection pipeline operational — evidence submissions automatically scanned, fraud scores accumulated, thresholds enforced

---

## Phase 6: User Story 3 — View Leaderboards and Rankings (Priority: P2)

**Goal**: Leaderboards for reputation, impact, tokens, and missions with domain/time/location filters. Redis cached sorted sets, cursor paginated, top 100 per leaderboard. Authenticated users can see their own rank.

**Independent Test**: Open leaderboards page → see top 100 by reputation. Switch to "Missions Completed" filtered by "this month" and "environmental_protection" → results update in <2s from Redis cache. Authenticated user checks GET /leaderboards/reputation/me → sees rank, score, percentile, and 5 entries above/below.

### Tests for User Story 3

- [X]T057 [P] [US3] Write integration tests for leaderboard queries (4 types, domain/time/location filters, cursor pagination, Redis cache hit/miss, cache TTL expiry, empty result handling, /me rank calculation) in `apps/api/src/__tests__/leaderboards.test.ts`

### Implementation for User Story 3

- [X]T058 [P] [US3] Implement leaderboard query builder in `apps/api/src/lib/leaderboard-cache.ts` — build PostgreSQL queries for 4 leaderboard types (reputation/impact/tokens/missions) with optional filters: domain (15 SDG domains), period (alltime/month/week), location_scope (global/country:{ISO}/city:{name}); use indexed joins on reputationScores, tokenTransactions, missionClaims, humanProfiles
- [X]T059 [P] [US3] Implement Redis sorted set cache manager for leaderboards in `apps/api/src/lib/leaderboard-cache.ts` — buildCacheKey(type, period, domain, location): generate key per convention `leaderboard:{type}:{period}:{domain}:{location}`, getFromCache(key): return cached entries via ZREVRANGE, setCache(key, entries, ttl=3600): store via ZADD with 1hr TTL, invalidateByType(type): clear all caches for a leaderboard type
- [X]T060 [US3] Implement cursor-based pagination for leaderboards in `apps/api/src/lib/leaderboard-cache.ts` — encode/decode cursor (base64-encoded offset), apply cursor to sorted set query, limit to 100 entries per page, return { entries, cursor, hasMore, total, cacheAge }
- [X]T061 [US3] Create GET /leaderboards/:type route in `apps/api/src/routes/leaderboards/index.ts` — validate type (reputation/impact/tokens/missions), parse and Zod-validate query params (period, domain, location_scope, cursor, limit 1-100), check Redis cache first, fallback to DB query + cache result, return paginated entries per leaderboards.yaml contract
- [X]T062 [US3] Create GET /leaderboards/:type/me route in `apps/api/src/routes/leaderboards/index.ts` — humanAuth required, return current user's rank (0-indexed), score, total entries, percentile (0-100), and context (5 entries above + below) per leaderboards.yaml contract
- [X]T063 [US3] Mount leaderboard routes in `apps/api/src/routes/v1.routes.ts` under /leaderboards prefix
- [X]T064 [P] [US3] Create LeaderboardTable component displaying ranked entries (rank, avatar, username, score, tier badge for reputation type) in `apps/web/src/components/leaderboards/LeaderboardTable.tsx`
- [X]T065 [P] [US3] Create LeaderboardFilters component with domain/period/location dropdowns in `apps/web/src/components/leaderboards/LeaderboardFilters.tsx`
- [X]T066 [P] [US3] Create LeaderboardTypeSwitcher component toggling between reputation/impact/tokens/missions tabs in `apps/web/src/components/leaderboards/LeaderboardTypeSwitcher.tsx`
- [X]T067 [US3] Create `useLeaderboard` React Query hook fetching GET /leaderboards/:type with filter params and staleTime matching cache TTL in `apps/web/src/hooks/useLeaderboard.ts`
- [X]T068 [US3] Create leaderboards page assembling table + filters + type switcher in `apps/web/app/leaderboards/page.tsx` — public access, URL query params for filter state

**Checkpoint**: Leaderboards operational — 4 leaderboard types with filters, Redis caching, cursor pagination, personal rank, and frontend UI

---

## Phase 7: User Story 4 — Public Impact Dashboard with Heatmap (Priority: P2)

**Goal**: Public (no auth) Impact Dashboard with aggregated metrics (total missions, tokens, humans, domain breakdown, recent activity) and Leaflet heatmap showing mission density by location.

**Independent Test**: Open Impact Dashboard without login → see total metrics at top → heatmap shows mission density → filter heatmap by domain → domain chart shows distribution across 15 domains.

### Tests for User Story 4

- [X]T069 [P] [US4] Write integration tests for Impact Dashboard API (GET /impact/dashboard returns totals + domainBreakdown + recentActivity + heatmapData + lastUpdatedAt, GET /impact/heatmap with domain/period/bounds filters, no-auth access, cache behavior) in `apps/api/src/__tests__/impact-dashboard.test.ts`

### Implementation for User Story 4

- [X]T070 [US4] Create GET /impact/dashboard route (no auth) in `apps/api/src/routes/impact/index.ts` — return totals (missionsCompleted, impactTokensDistributed, activeHumans, problemsReported, solutionsProposed), domainBreakdown (per-domain missionCount/tokenTotal/humanCount), recentActivity (missionsThisWeek/Month, newHumansThisMonth), heatmapData (pre-aggregated points), lastUpdatedAt — fetch from Redis cache, fallback to live query per impact.yaml contract
- [X]T071 [US4] Create GET /impact/heatmap route (no auth) in `apps/api/src/routes/impact/index.ts` — return points array (lat, lng, intensity, count), support query params: domain (filter by domain), period (alltime/month/week), bounds (sw_lat,sw_lng,ne_lat,ne_lng for viewport filtering), gridResolution; fetch from Redis cache per impact.yaml contract
- [X]T072 [US4] Mount impact routes in `apps/api/src/routes/v1.routes.ts` under /impact prefix
- [X]T073 [P] [US4] Create ImpactMetrics component displaying total missions, tokens, humans as large stat cards in `apps/web/src/components/impact/ImpactMetrics.tsx`
- [X]T074 [P] [US4] Create DomainDistribution component rendering domain breakdown chart for missions across 15 domains in `apps/web/src/components/impact/DomainDistribution.tsx`
- [X]T075 [US4] Create ImpactHeatmap component using leaflet.heat for mission density visualization in `apps/web/src/components/impact/ImpactHeatmap.tsx` — dynamic import (SSR-safe, matching existing Leaflet pattern from Sprint 7), color intensity scaling, responsive sizing
- [X]T076 [US4] Create `useImpactDashboard` React Query hook fetching GET /impact/dashboard and GET /impact/heatmap in `apps/web/src/hooks/useImpactDashboard.ts`
- [X]T077 [US4] Create Impact Dashboard page assembling metrics + heatmap + domain chart in `apps/web/app/impact/page.tsx` — no auth required, public access

**Checkpoint**: Public Impact Dashboard operational — visitors see aggregate impact metrics and geographic heatmap without login

---

## Phase 8: User Story 5 — Per-User Impact Portfolio (Priority: P2)

**Goal**: Each human has a public/private Impact Portfolio showing reputation, tier, missions, domains, timeline. Shareable URL with Open Graph tags for social media previews (1200x630 dynamic PNG).

**Independent Test**: View portfolio at /portfolio/:humanId → see reputation, tier, missions with thumbnails, timeline. Share URL → Twitter/LinkedIn preview shows name, reputation, top domain via OG tags. Toggle to private → external visitors see 403 "Portfolio is private".

**Dependencies**: Requires US1 (needs reputation data for portfolio display)

### Tests for User Story 5

- [X]T078 [P] [US5] Write integration tests for Portfolio API (GET /portfolios/:humanId returns full data for public profile, 403 for private profile unless owner, PATCH /portfolios/me/visibility toggles public/private, 404 for nonexistent human) in `apps/api/src/__tests__/portfolios.test.ts`

### Implementation for User Story 5

- [X]T079 [US5] Create GET /portfolios/:humanId route in `apps/api/src/routes/portfolios/index.ts` — no auth required; if public or requester is owner: return humanId, displayName, avatarUrl, reputation (totalScore, tier, tierMultiplier), stats (missionsCompleted, totalTokensEarned, domainsContributed, currentStreak, longestStreak, endorsementsReceived), missions (last 20 completed with thumbnails), timeline (last 50 events), visibility, joinedAt per portfolios.yaml contract; if private and not owner: return 403
- [X]T080 [US5] Create PATCH /portfolios/me/visibility route in `apps/api/src/routes/portfolios/index.ts` — humanAuth required, accept { visibility: 'public' | 'private' }, update humans.portfolio_visibility column, return updated visibility + timestamp per portfolios.yaml contract
- [X]T081 [US5] Mount portfolio routes in `apps/api/src/routes/v1.routes.ts` under /portfolios prefix
- [X]T082 [P] [US5] Create PortfolioHeader component showing avatar, name, reputation score, tier badge, share button in `apps/web/src/components/portfolio/PortfolioHeader.tsx`
- [X]T083 [P] [US5] Create PortfolioMissions component displaying mission grid with thumbnails, titles, domains, verification scores in `apps/web/src/components/portfolio/PortfolioMissions.tsx`
- [X]T084 [P] [US5] Create PortfolioTimeline component showing activity timeline (mission_completed, tier_up, endorsement_received, streak_milestone) in `apps/web/src/components/portfolio/PortfolioTimeline.tsx`
- [X]T085 [P] [US5] Create PortfolioPrivacyToggle component (public/private switch) in `apps/web/src/components/portfolio/PortfolioPrivacyToggle.tsx`
- [X]T086 [US5] Create `usePortfolio` React Query hook fetching GET /portfolios/:humanId in `apps/web/src/hooks/usePortfolio.ts`
- [X]T087 [US5] Create portfolio page in `apps/web/app/portfolio/[humanId]/page.tsx` — render portfolio components, handle private/public states, set Next.js generateMetadata for Open Graph tags (og:title: "{displayName} - BetterWorld Portfolio", og:description: "{totalScore} reputation - {missionsCompleted} missions", og:type: profile, twitter:card: summary_large_image) per portfolios.yaml contract
- [X]T088 [US5] Create dynamic OG image route in `apps/web/app/portfolio/[humanId]/opengraph-image.tsx` — Next.js ImageResponse API (1200x630 PNG), display human name, reputation score, tier badge, top domain; edge runtime

**Checkpoint**: Impact Portfolios operational — humans can share their impact profile on social media with rich previews

---

## Phase 9: User Story 6 — Streak System with Reward Multipliers (Priority: P2)

**Goal**: Track consecutive-day mission completion streaks. Milestones grant reward multipliers (1.1x at 7d, 1.25x at 30d, 1.5x at 90d, 2.0x at 365d). Streak freeze preserves streak for 1 missed day (30-day cooldown).

**Independent Test**: Complete missions on 7 consecutive days → GET /streaks/me shows 7-day streak with 1.1x multiplier. Miss day 8 → POST /streaks/me/freeze activates freeze → streak preserved. Miss day 9 without freeze → streak broken, reset to 0.

### Tests for User Story 6

- [X]T089 [P] [US6] Write integration tests for streak tracking (consecutive days increment, gap > 1 day breaks streak, freeze activation preserves streak, freeze cooldown 30 days enforced, multiplier at milestones 7/30/90/365, longest streak tracking, multiplier applied to rewards) in `apps/api/src/__tests__/streaks.test.ts`

### Implementation for User Story 6

- [X]T090 [US6] Implement streak tracking logic in `apps/api/src/lib/streak-tracker.ts` — recordActivity(humanId, date): increment currentStreak if consecutive day (lastActiveDate == yesterday), reset to 1 if gap > 1 day (unless freeze active: consume freeze, keep streak), update longestStreak if current exceeds it, update streakMultiplier based on milestones; getMultiplier(streakDays): return multiplier (1-6d=1.0x, 7-29d=1.1x, 30-89d=1.25x, 90-364d=1.5x, 365+=2.0x); activateFreeze(humanId): check cooldown (30 days since freezeLastUsedAt), set freezeActive=true, return success/error
- [X]T091 [US6] Integrate streak tracking into mission completion flow — after evidence verification completes and mission is marked verified, call recordActivity for the human to update their streak
- [X]T092 [US6] Integrate streak multiplier into reward calculation — in token distribution flow, combine streak multiplier with tier multiplier: `finalReward = baseReward × tierMultiplier × streakMultiplier`; preserve double-entry accounting
- [X]T093 [US6] Create streak routes in `apps/api/src/routes/streaks/index.ts` — GET /streaks/me (humanAuth, return currentStreak, longestStreak, lastActiveDate, streakMultiplier, nextMilestone {days, multiplier}, freezeAvailable, freezeLastUsedAt, freezeCooldownEndsAt per reputation.yaml contract), POST /streaks/me/freeze (humanAuth, activate freeze if available + no cooldown, return freezeActivated + cooldownEndsAt, 400 if on cooldown or no active streak per contract)
- [X]T094 [US6] Mount streak routes in `apps/api/src/routes/v1.routes.ts` under /streaks prefix
- [X]T095 [US6] Add daily streak break check to reputation decay worker in `apps/api/src/workers/reputation-decay.ts` — for humans with lastActiveDate != today and != yesterday: if freezeActive, consume freeze and preserve streak; else break streak (reset currentStreak to 0, update streakMultiplier to 1.0)
- [X]T096 [P] [US6] Create StreakCounter component displaying current streak count, fire animation, next milestone info in `apps/web/src/components/streaks/StreakCounter.tsx`
- [X]T097 [P] [US6] Create StreakMultiplier component showing active reward multiplier badge in `apps/web/src/components/streaks/StreakMultiplier.tsx`
- [X]T098 [P] [US6] Create StreakFreezeButton component with freeze action and cooldown countdown in `apps/web/src/components/streaks/StreakFreezeButton.tsx`
- [X]T099 [US6] Create `useStreak` React Query hook fetching GET /streaks/me in `apps/web/src/hooks/useStreak.ts`
- [X]T100 [US6] Integrate streak components into human dashboard at `apps/web/app/dashboard/page.tsx` — add streak card showing counter, multiplier, and freeze button

**Checkpoint**: Streak system operational — consecutive day tracking, reward multipliers, and streak freeze working

---

## Phase 10: User Story 8 — Admin Fraud Review Queue (Priority: P2)

**Goal**: Admins review flagged accounts with fraud score breakdowns, evidence thumbnails, and action buttons (clear_flag, reset_score, manual_suspend, unsuspend) with audit trail.

**Independent Test**: Admin opens fraud queue → sees flagged accounts sorted by score. Reviews an account → sees pHash/velocity/statistical breakdown with evidence thumbnails. Takes action (suspend with reasoning) → action logged in fraud_admin_actions. GET /admin/fraud/stats returns aggregate metrics.

**Dependencies**: Requires US7 (fraud scoring pipeline) to produce flagged accounts

### Tests for User Story 8

- [X]T101 [P] [US8] Write integration tests for admin fraud review (GET /queue returns flagged accounts with scores, GET /:humanId returns full detail with events/evidence/actions, POST /:humanId/action with clear_flag/reset_score/manual_suspend/unsuspend + reasoning, GET /stats returns aggregates, non-admin 403 rejection) in `apps/api/src/__tests__/fraud-scoring.test.ts`

### Implementation for User Story 8

- [X]T102 [US8] Create GET /admin/fraud/queue route in `apps/api/src/routes/fraud/index.ts` — admin auth required, return paginated list per fraud.yaml contract: humanId, displayName, email, fraudScore (total/phash/velocity/statistical), status, flaggedAt, suspendedAt, recentEvents, evidenceCount, accountAge; query params: status (flagged/suspended/all), cursor, limit (1-50), sort (score_desc/flagged_at_desc)
- [X]T103 [US8] Create GET /admin/fraud/:humanId route in `apps/api/src/routes/fraud/index.ts` — admin auth required, return full fraud profile per fraud.yaml contract: fraud score breakdown, full event history, evidence submissions with thumbnails and pHash duplicate flags, previous admin actions, human profile summary (joinedAt, missionsCompleted, reputationScore, tier)
- [X]T104 [US8] Create POST /admin/fraud/:humanId/action route in `apps/api/src/routes/fraud/index.ts` — admin auth required, Zod validate action (clear_flag/reset_score/manual_suspend/unsuspend) + reason (10+ chars); clear_flag: set status to 'clean', clear flaggedAt; reset_score: reset all scores to 0, status to 'clean'; manual_suspend: set status to 'suspended', suspendedAt; unsuspend: set status to 'clean', clear suspendedAt; log all actions to fraud_admin_actions with scoreBefore/scoreAfter; return actionId, newStatus, scores per contract
- [X]T105 [US8] Create GET /admin/fraud/stats route in `apps/api/src/routes/fraud/index.ts` — admin auth required, return totalFlagged, totalSuspended, totalCleared, falsePositiveRate, detectionBreakdown (phash/velocity/statistical counts), last30Days (newFlags/resolved/suspensions) per fraud.yaml contract
- [X]T106 [US8] Mount admin fraud routes in `apps/api/src/routes/v1.routes.ts` under /admin/fraud prefix with admin auth middleware
- [X]T107 [P] [US8] Create FraudQueue component displaying flagged accounts table with score breakdown, status, action button in `apps/web/src/components/fraud/FraudQueue.tsx`
- [X]T108 [P] [US8] Create FraudScoreBreakdown component showing pHash/velocity/statistical breakdown with visual bars and evidence thumbnails in `apps/web/src/components/fraud/FraudScoreBreakdown.tsx`
- [X]T109 [P] [US8] Create FraudActions component with action dropdown (clear_flag/reset_score/manual_suspend/unsuspend), reasoning textarea (10+ char validation), and confirmation dialog in `apps/web/src/components/fraud/FraudActions.tsx`
- [X]T110 [US8] Create admin fraud review queue page in `apps/web/app/(admin)/admin/fraud/page.tsx` — admin auth gated, list flagged accounts with filters and pagination
- [X]T111 [US8] Create admin fraud detail page in `apps/web/app/(admin)/admin/fraud/[humanId]/page.tsx` — fraud score breakdown, evidence list, event timeline, action buttons, admin action history

**Checkpoint**: Admin fraud review queue operational — admins can review, suspend, clear, and reset flagged accounts with full audit trail

---

## Phase 11: User Story 9 — Hourly Impact Metrics Aggregation (Priority: P3)

**Goal**: Hourly BullMQ job calculates and caches key metrics in Redis. Powers leaderboards, Impact Dashboard, and heatmap without expensive real-time queries.

**Independent Test**: Trigger aggregation job manually → Redis contains updated metrics at keys metrics:aggregate:dashboard, metrics:aggregate:domains, metrics:aggregate:heatmap:{period} → Impact Dashboard and leaderboards reflect new data within 1hr. Job completes within 5 minutes for 100K+ records.

### Tests for User Story 9

- [X]T112 [P] [US9] Write integration tests for metrics aggregation (hourly job execution, Redis key population per impact.yaml conventions, stale cache detection >1hr, dashboard data freshness, heatmap point aggregation, error handling and retry after 15min) in `apps/api/src/__tests__/metrics-aggregation.test.ts`

### Implementation for User Story 9

- [X]T113 [US9] Implement metrics aggregation logic in `apps/api/src/lib/metrics-aggregator.ts` — aggregateMissions(): count by domain/location/status, aggregateTokens(): sum distributed by domain, aggregateUsers(): count active (7d/30d), aggregateReputation(): avg by tier + humanCount per tier, aggregateHeatmap(): snap missions to grid cells (0.1 degree ~11km), count per cell, calculate intensity; storeAllInRedis(): write dashboard HASH, domains HASH, heatmap:{period} STRING (JSON), last_updated STRING per impact.yaml Redis key conventions
- [X]T114 [US9] Create BullMQ hourly metrics aggregation worker in `apps/api/src/workers/metrics-aggregation.ts` — repeatable cron every 60 minutes (0 * * * *), concurrency 1, batch process in chunks, execute all aggregation functions, log completion time with Pino, retry on failure after 15 minutes, 3 retries with dead letter queue
- [X]T115 [US9] Connect Impact Dashboard routes (T070, T071) and leaderboard cache (T059) to use metrics aggregation cache as primary data source — ensure cache-first, DB-fallback pattern; pre-populate leaderboard sorted sets during aggregation for top traffic combinations
- [X]T116 [US9] Register metrics-aggregation worker queue and add startup script to `apps/api/src/workers/` entry point

**Checkpoint**: Metrics aggregation operational — hourly job populates Redis cache powering dashboards and leaderboards at scale

---

## Phase 12: User Story 10 — Phase 2 Grafana Dashboards (Priority: P3)

**Goal**: Grafana dashboards displaying Phase 2 operational metrics per impact.yaml Grafana panel queries.

**Independent Test**: Open Grafana → see "Phase 2 Reputation & Impact" dashboard → panels: reputation distribution histogram, tier population, mission completion rate (7d), fraud flags over time, verification latency (p50/p95), token distribution velocity.

### Implementation for User Story 10

- [X]T117 [P] [US10] Create Grafana dashboard JSON definition in `docs/grafana/phase2-reputation-impact.json` — 6 panels per impact.yaml: reputation distribution histogram (width_bucket), tier population (GROUP BY current_tier), mission completion rate 7d (date_trunc hour), fraud flags over time (date_trunc day on fraud_events), verification latency p50/p95 (percentile_cont), token distribution velocity (SUM by hour)
- [X]T118 [US10] Document Grafana dashboard setup, panel configuration, and PostgreSQL query details in `docs/grafana/README.md` — include validation steps: connect Grafana to dev database, execute each panel SQL query manually to confirm correct results against the Sprint 9 schema, verify all 6 panels render with sample data

**Checkpoint**: Grafana dashboards configured — operators can monitor Phase 2 system health

---

## Phase 13: User Story 11 — k6 Load Test (5K Concurrent Users) (Priority: P3)

**Goal**: k6 load test simulating 5K concurrent users. Validate p95 <3s, no connection pool exhaustion, no cache failures.

**Independent Test**: Run k6 with 5K VUs → all endpoints respond p95 <3s → error rate <1% → report generated.

### Implementation for User Story 11

- [X]T119 [US11] Create k6 load test script in `k6/phase2-load-test.js` — scenarios: leaderboard browsing (2K VUs, GET /leaderboards/:type with random filters), Impact Dashboard (1K VUs, GET /impact/dashboard + /heatmap), evidence submission (500 VUs, POST with mock data), reputation queries (500 VUs, GET /reputation/:humanId), portfolio views (1K VUs, GET /portfolios/:humanId) — ramp up 2min, sustain 10min, ramp down 1min — thresholds: p95 <3s, error rate <1%
- [X]T120 [P] [US11] Create k6 helper data generators for realistic test payloads in `k6/helpers/data-generators.js` — generate random humanIds, domains, location filters, evidence payloads, auth tokens
- [X]T121 [US11] Document k6 load test execution and result interpretation in `docs/testing/k6-phase2-guide.md`

**Checkpoint**: k6 load test validates platform scalability for 5K concurrent users

---

## Phase 14: User Story 12 — Phase 2 Security Audit (OWASP + ZAP) (Priority: P3)

**Goal**: OWASP Top 10 security audit and ZAP automated scan. Zero P0/P1 vulnerabilities.

**Independent Test**: Run ZAP scan → zero P0 vulnerabilities. Manual review confirms: no SQL injection, no XSS, no auth bypass, no data leaks.

### Implementation for User Story 12

- [X]T122 [US12] Create OWASP ZAP scan configuration in `apps/api/src/__tests__/security/zap-phase2.yaml` — target all new endpoints (/reputation/*, /leaderboards/*, /impact/*, /streaks/*, /portfolios/*, /admin/fraud/*), configure auth context, set scan policy (standard + AJAX spider)
- [X]T123 [US12] Conduct manual OWASP Top 10 security review of all Sprint 9 code — check: SQL injection (Drizzle parameterized), XSS (JSON-only responses), CSRF (better-auth tokens), auth bypass (middleware on protected routes), data leaks (no PII in logs/responses), IDOR (humanId auth checks), rate limiting (Redis-backed), mass assignment (Zod schemas) — document in `docs/security/phase2-audit.md`
- [X]T124 [US12] Remediate all P0 and P1 findings from ZAP scan and manual review — fix vulnerabilities, re-run ZAP to confirm, update audit document

**Checkpoint**: Security audit complete — zero P0/P1 vulnerabilities

---

## Phase 15: Polish & Cross-Cutting Concerns

**Purpose**: Integration testing, navigation, final polish across all stories

- [X]T125 Add navigation links for new pages (Leaderboards, Impact Dashboard) to main navigation in `apps/web/src/components/Navigation.tsx`
- [X]T126 [P] Add WebSocket event types for reputation changes, tier promotions, and streak milestones to existing WebSocket event feed — first verify the current WebSocket/event emission pattern in `apps/api/src/routes/agents.routes.ts` or equivalent; if the existing pattern uses a different mechanism (pub/sub, SSE), adapt accordingly rather than assuming a specific emit API
- [X]T127 [P] Ensure all dashboard components (reputation, tier, streak, fraud status) render correctly together in `apps/web/app/dashboard/page.tsx`
- [X]T128 Run full test suite (`pnpm test`) ensuring all existing 810+ tests pass alongside 40+ new tests
- [X]T129 Run TypeScript strict mode check (`pnpm typecheck`) ensuring zero errors across all packages
- [X]T130 Run ESLint (`pnpm lint`) ensuring zero errors across all packages
- [X]T131 Verify API response envelope consistency — all new endpoints return `{ ok, data/error, requestId }` format

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (Phase 1) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational (Phase 2) — core reputation engine
- **US2 (Phase 4)**: Depends on US1 (reputation scoring must exist for tier calculation)
- **US7 (Phase 5)**: Depends on Foundational (Phase 2) — independent of US1/US2
- **US3 (Phase 6)**: Depends on Foundational (Phase 2) — can run in parallel with US1/US7 but benefits from reputation data
- **US4 (Phase 7)**: Depends on Foundational (Phase 2) — can run in parallel with US1/US7
- **US5 (Phase 8)**: Depends on US1 (needs reputation data for portfolio display)
- **US6 (Phase 9)**: Depends on Foundational (Phase 2) — streak tracking is independent, but multiplier integration needs US2
- **US8 (Phase 10)**: Depends on US7 (fraud queue needs fraud scoring pipeline)
- **US9 (Phase 11)**: Depends on US3 + US4 (aggregation powers leaderboards + dashboard)
- **US10 (Phase 12)**: Depends on all P1/P2 stories (dashboards monitor operational metrics)
- **US11 (Phase 13)**: Depends on all P1/P2 stories (load test targets all endpoints)
- **US12 (Phase 14)**: Depends on all implementation stories (audit runs against completed code)
- **Polish (Phase 15)**: Depends on all desired user stories being complete

### User Story Dependency Graph

```
Phase 1: Setup
    |
Phase 2: Foundational (DB schema, migrations, shared types)
    |
    +-- Phase 3: US1 -- Reputation Scoring (P1) ---------------+
    |       |                                                   |
    |   Phase 4: US2 -- Reputation Tiers (P1)                  |
    |       |                                                   |
    |   Phase 8: US5 -- Impact Portfolio (P2)                   |
    |   Phase 9: US6 -- Streak System (P2)*                     |
    |                                                           |
    +-- Phase 5: US7 -- Fraud Detection (P1) -------------------+
    |       |                                                   |
    |   Phase 10: US8 -- Admin Fraud Queue (P2)                 |
    |                                                           |
    +-- Phase 6: US3 -- Leaderboards (P2) ----------------------+
    |                                                           |
    +-- Phase 7: US4 -- Impact Dashboard (P2) ------------------+
    |                                                           |
    |   Phase 11: US9 -- Metrics Aggregation (P3) <-(US3+US4)  |
    |   Phase 12: US10 -- Grafana Dashboards (P3) <-(all P1/P2)|
    |   Phase 13: US11 -- k6 Load Test (P3) <-(all P1/P2)      |
    |   Phase 14: US12 -- Security Audit (P3) <-(all stories)  |
    |                                                           |
    +-- Phase 15: Polish & Cross-Cutting <-(all stories) -------+
```

*US6 (Streaks) can start after Phase 2 independently, but its multiplier integration with rewards depends on US2 (tiers).

### Within Each User Story

- Tests FIRST — write tests that FAIL before implementation
- Library/business logic before routes
- Routes before frontend components
- Backend before frontend within a story
- Story complete before moving to dependent stories

### Parallel Opportunities

**Phase 1 (all [P] tasks)**:
```
T002, T003, T004 -- Constants (parallel)
T005, T006, T007, T008 -- Schemas (parallel)
T009, T010, T011, T012 -- Types (parallel)
```

**Phase 2 (schema tables)**:
```
T015, T016, T017, T018, T019 -- Independent tables (parallel after T013 enums + T014 reputation)
```

**After Phase 2 completes (independent story tracks)**:
```
Track A: US1 -> US2 -> US5 -> US6 (reputation -> tiers -> portfolio -> streaks)
Track B: US7 -> US8 (fraud pipeline -> admin queue)
Track C: US3 (leaderboards -- independent)
Track D: US4 (Impact Dashboard -- independent)
```

**Within stories (frontend components)**:
```
US3: T064, T065, T066 -- LeaderboardTable, Filters, TypeSwitcher (parallel)
US5: T082, T083, T084, T085 -- Portfolio components (parallel)
US6: T096, T097, T098 -- Streak components (parallel)
US8: T107, T108, T109 -- Fraud queue components (parallel)
```

---

## Parallel Example: Phase 1 Setup

```bash
# Launch all constants in parallel:
Task: "T002 Create reputation tier constants in packages/shared/src/constants/reputation-tiers.ts"
Task: "T003 Create fraud threshold constants in packages/shared/src/constants/fraud-thresholds.ts"
Task: "T004 Create streak milestone constants in packages/shared/src/constants/streak-milestones.ts"

# Launch all schemas in parallel:
Task: "T005 Create reputation Zod schemas in packages/shared/src/schemas/reputation.ts"
Task: "T006 Create leaderboard Zod schemas in packages/shared/src/schemas/leaderboards.ts"
Task: "T007 Create fraud Zod schemas in packages/shared/src/schemas/fraud.ts"
Task: "T008 Create impact Zod schemas in packages/shared/src/schemas/impact.ts"
```

## Parallel Example: User Story 7 — Fraud Detection

```bash
# Launch all tests in parallel (write first, expect failures):
Task: "T046 pHash duplicate detection tests"
Task: "T047 Velocity check tests"
Task: "T048 Statistical profiling tests"
Task: "T049 Fraud score threshold tests"

# Launch all fraud detection methods in parallel (independent files):
Task: "T050 pHash calculation in apps/api/src/lib/phash.ts"
Task: "T051 Velocity check in apps/api/src/lib/fraud-detection.ts"
Task: "T052 Statistical profiling in apps/api/src/lib/fraud-detection.ts"
```

---

## Implementation Strategy

### MVP First (P1 Stories Only)

1. Complete Phase 1: Setup (constants, schemas, types)
2. Complete Phase 2: Foundational (DB schema, migrations)
3. Complete Phase 3: US1 — Reputation Scoring
4. Complete Phase 4: US2 — Reputation Tiers
5. Complete Phase 5: US7 — Fraud Detection Pipeline
6. **STOP and VALIDATE**: Test all P1 stories independently — reputation engine working, tiers promoting, fraud detecting
7. Deploy/demo P1 increment

### Incremental Delivery

1. **P1 Increment** (Phases 1-5): Setup + Foundation + Reputation + Tiers + Fraud → Core incentive and integrity layer
2. **P2 Increment A** (Phases 6-7): Leaderboards + Impact Dashboard → Public visibility and engagement
3. **P2 Increment B** (Phases 8-10): Portfolio + Streaks + Fraud Queue → User retention and admin tools
4. **P3 Increment** (Phases 11-14): Aggregation + Grafana + k6 + Security → Operational readiness
5. **Polish** (Phase 15): Integration, navigation, final testing

### Parallel Team Strategy

With multiple developers after Phase 2 completes:
- **Developer A**: Track A (US1 → US2 → US5 → US6) — reputation, tiers, portfolio, streaks
- **Developer B**: Track B (US7 → US8) — fraud detection, admin queue
- **Developer C**: Track C+D (US3, US4) — leaderboards, Impact Dashboard
- **Developer D**: Track P3 (US9 → US10 → US11 → US12) — aggregation, Grafana, load test, security

---

## Summary

| Metric | Count |
|--------|-------|
| Total tasks | 131 |
| Phase 1: Setup | 12 (T001-T012) |
| Phase 2: Foundational | 12 (T013-T023) |
| Phase 3: US1 Reputation (P1) | 13 (T024-T036) |
| Phase 4: US2 Tiers (P1) | 9 (T037-T045) |
| Phase 5: US7 Fraud (P1) | 11 (T046-T056) |
| Phase 6: US3 Leaderboards (P2) | 12 (T057-T068) |
| Phase 7: US4 Dashboard (P2) | 9 (T069-T077) |
| Phase 8: US5 Portfolio (P2) | 11 (T078-T088) |
| Phase 9: US6 Streaks (P2) | 12 (T089-T100) |
| Phase 10: US8 Fraud Queue (P2) | 11 (T101-T111) |
| Phase 11: US9 Aggregation (P3) | 5 (T112-T116) |
| Phase 12: US10 Grafana (P3) | 2 (T117-T118) |
| Phase 13: US11 k6 (P3) | 3 (T119-T121) |
| Phase 14: US12 Security (P3) | 3 (T122-T124) |
| Phase 15: Polish | 7 (T125-T131) |
| Parallel tasks ([P]) | 48 |
| Independent story tracks | 4 (after Phase 2) |

## Notes

- [P] tasks = different files, no dependencies within the phase
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable (after its dependencies)
- Tests are written FIRST and must FAIL before implementation
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- All new API endpoints must follow `{ ok, data/error, requestId }` envelope pattern
- All database operations use Drizzle ORM with TypeScript strict mode
- All input validation uses Zod schemas at API boundaries
- Redis caching follows existing patterns (configurable TTL)
- BullMQ workers follow existing patterns (3 retries, dead letter queue, Pino logging)
- Frontend components use "use client" directive, Tailwind CSS 4, React Query hooks
- File paths aligned with plan.md Project Structure section
- API contracts aligned with contracts/*.yaml specifications
- Data model aligned with data-model.md (8 new tables, 4 new enums, 1 modified table)
