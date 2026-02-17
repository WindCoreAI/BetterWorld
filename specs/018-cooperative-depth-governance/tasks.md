# Tasks: Cooperative Depth & Governance

**Input**: Design documents from `/specs/018-cooperative-depth-governance/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Tests are included per BetterWorld convention — coverage must not decrease from 1484-test baseline.

**Organization**: Tasks are grouped by user story (US1-US11) to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: New enums, DB schema, migration, shared Zod schemas, feature flags

- [X] T001 Add 12 new enums to `packages/db/src/schema/enums.ts`: mentorshipStatusEnum, buddyStatusEnum, helpOfferStatusEnum, moderatorActionTypeEnum, circleRoleEnum, circlePostTypeEnum, caseStudyStatusEnum, challengeTypeEnum, challengeStatusEnum, pathwayLevelEnum, cooperativeAchievementTypeEnum, feedEventTypeEnum
- [X] T002 Add 10 new values to transactionTypeEnum in `packages/db/src/schema/enums.ts`: earn_mentorship_bonus, earn_mentee_first_mission, earn_mentorship_completion, earn_buddy_split, earn_helper_reward, spend_buddy_share, spend_helper_share, earn_teaching_reward, earn_ambassador_welcome, earn_case_study_contribution
- [X] T003 Add 6 new values to contentTypeEnum in `packages/db/src/schema/enums.ts`: circle_post, help_offer_message, help_request_note, gratitude_narrative, human_solution, human_mission_proposal
- [X] T004 [P] Create mentorships schema in `packages/db/src/schema/mentorships.ts` per data-model.md (mentorships table with partial unique index for 1-active-mentor-per-mentee)
- [X] T005 [P] Create mission_help_offers schema in `packages/db/src/schema/missionHelpOffers.ts` per data-model.md (unique helper+claim, guardrail_status)
- [X] T006 [P] Create circles, circle_members, circle_posts, circle_missions schemas in `packages/db/src/schema/circles.ts` per data-model.md
- [X] T007 [P] Create cooperative_achievements and cooperative_achievement_earners schemas in `packages/db/src/schema/cooperativeAchievements.ts` per data-model.md
- [X] T008 [P] Create moderator_actions schema in `packages/db/src/schema/moderatorActions.ts` per data-model.md (immutable audit log)
- [X] T009 [P] Create learning_pathways schema in `packages/db/src/schema/learningPathways.ts` per data-model.md (unique human_id+domain)
- [X] T010 [P] Create case_studies schema in `packages/db/src/schema/caseStudies.ts` per data-model.md (unique mission_id)
- [X] T011 [P] Create group_challenges and challenge_participants schemas in `packages/db/src/schema/groupChallenges.ts` per data-model.md
- [X] T012 [P] Create power_distribution_snapshots schema in `packages/db/src/schema/powerAudit.ts` per data-model.md
- [X] T013 [P] Create agent_fingerprints schema in `packages/db/src/schema/agentFingerprints.ts` per data-model.md
- [X] T014 [P] Create feed_events schema in `packages/db/src/schema/feedEvents.ts` per data-model.md
- [X] T015 Modify humans schema in `packages/db/src/schema/humans.ts`: add isModerator (boolean, default false), moderatorSince (timestamptz), moderatorDomains (text array)
- [X] T016 [P] Modify solutions schema in `packages/db/src/schema/solutions.ts`: make proposedByAgentId nullable, add proposedByHumanId (uuid FK humans), add CHECK constraint (one proposer required)
- [X] T017 [P] Modify endorsements schema in `packages/db/src/schema/endorsements.ts`: add narrative (text), isFeatured (boolean default false)
- [X] T018 [P] Modify missionClaims schema in `packages/db/src/schema/missionClaims.ts`: add buddyHumanId (uuid FK humans), buddyStatus (buddyStatusEnum), isBuddy (boolean default false), helpRequested (boolean default false), helpRequestNote (text)
- [X] T019 [P] Modify missions schema in `packages/db/src/schema/missions.ts`: add proposedByHumanId (uuid FK humans, nullable), endorsementCount (integer default 0); add `pending_endorsement` value to mission status enum in `packages/db/src/schema/enums.ts`
- [X] T020 [P] Create mission_endorsements schema in `packages/db/src/schema/missionEndorsements.ts` per data-model.md: mission_id (FK missions), human_id (FK humans), created_at; UNIQUE (mission_id, human_id)
- [X] T021 [P] Create ambassador_assignments schema in `packages/db/src/schema/ambassadorAssignments.ts` per data-model.md: ambassador_human_id (FK humans), newcomer_human_id (FK humans), message (varchar 500), sent_at, token_awarded (boolean), created_at; UNIQUE (newcomer_human_id) to enforce one ambassador per newcomer
- [X] T022 Export all new schemas from `packages/db/src/schema/index.ts`
- [X] T023 Generate and apply migration `0017_cooperative_depth_governance.sql` via `pnpm drizzle-kit generate` in `packages/db/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared Zod schemas, feature flags, notification types, shared services, and navigation updates that MUST be complete before user story work

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T024 [P] Create shared Zod schemas in `packages/shared/src/schemas/mentorship.ts`: createMentorshipSchema, rateMentorshipSchema, mentorshipResponseSchema
- [X] T025 [P] Create shared Zod schemas in `packages/shared/src/schemas/buddy.ts`: inviteBuddySchema, helpOfferSchema, helpRequestSchema
- [X] T026 [P] Create shared Zod schemas in `packages/shared/src/schemas/moderator.ts`: moderatorDecisionSchema, moderatorApprovalSchema
- [X] T027 [P] Create shared Zod schemas in `packages/shared/src/schemas/pathway.ts`: enrollPathwaySchema, markCaseStudyReadSchema
- [X] T028 [P] Create shared Zod schemas in `packages/shared/src/schemas/challenge.ts`: createChallengeSchema, joinChallengeSchema
- [X] T029 [P] Create shared Zod schemas in `packages/shared/src/schemas/circle.ts`: createCircleSchema, circlePostSchema, shareCircleMissionSchema
- [X] T030 [P] Create shared Zod schemas in `packages/shared/src/schemas/enhancements.ts`: narrativeSchema, humanSolutionSchema, humanMissionProposalSchema, feedQuerySchema, discoverQuerySchema
- [X] T031 [P] Create shared TypeScript types in `packages/shared/src/types/cooperative.ts`: MentorSuggestion, BuddyInvitation, HelpOffer, ModeratorQueueItem, PathwayProgress, CaseStudySummary, ChallengeLeaderboard, CircleDetail, CooperativeAchievement, FeedItem, DiscoverPerson, PowerAuditSnapshot, AgentFingerprintProfile
- [X] T032 Add 6 feature flags (MENTORSHIP_ENABLED, MISSION_BUDDIES_ENABLED, MODERATOR_ROLE_ENABLED, LEARNING_PATHWAYS_ENABLED, HUMAN_AGENCY_ENABLED, PERSONALIZED_FEED_ENABLED) to `apps/api/src/config/feature-flags.ts`
- [X] T033 Add new notification types for mentorship, buddy, help, moderator, pathway, challenge, ambassador, and achievement events in `apps/api/src/services/notification.service.ts`
- [X] T034 Add new guardrail content type handlers for circle_post, help_offer_message, help_request_note, gratitude_narrative, human_solution, human_mission_proposal in `apps/api/src/workers/guardrail-worker.ts` (extend existing onComplete callback dispatch)
- [X] T035 Add "Learning" and "Discover" nav links to `NAV_LINKS` array in `apps/web/src/components/Navigation.tsx`
- [X] T036 [P] Create MentorBadge, ModeratorBadge, TeacherBadge, TrustedPartnerBadge components in `apps/web/src/components/badges/` following TierBadge pattern
- [X] T037 Register 10 new route groups in `apps/api/src/index.ts` per quickstart.md (mentorships, mission-buddies, moderator, learning-pathways, case-studies, human-solutions, human-missions, discover, feed, governance)

**Checkpoint**: Foundation ready — user story implementation can now begin in parallel

---

## Phase 3: User Story 1 — Mentorship Pairing (Priority: P1) 🎯 MVP

**Goal**: Auto-match newcomers with mentors, mutual acceptance, mentor notifications on mentee activity, token rewards, 30-day lifecycle with ratings

**Independent Test**: Create newcomer → get suggestions → both accept → mentee claims mission → mentor gets notification + 2 tokens → mentorship expires → both rate

### Implementation

- [ ] T038 [US1] Implement mentorship-matching service in `apps/api/src/services/mentorship-matching.ts`: filter eligible mentors (advocate+, <3 mentees, matching domain), score (sameCity ×3, higherTier ×2, fewerMentees ×1), return top 3, fallback chain (domain+city → domain → city → queue)
- [ ] T039 [US1] Implement mentorship token reward logic in `apps/api/src/services/mentorship-rewards.ts`: 2 tokens per mentee mission completion (cap 20 per FR-004), 1 bonus for mentee first mission, 5 tokens at mentorship completion (teaching reward per FR-058) — all via double-entry accounting with SELECT FOR UPDATE and idempotency keys
- [ ] T040 [US1] Implement mentorship routes in `apps/api/src/routes/mentorships/index.ts` per contracts/mentorships.md: GET /suggestions, POST / (create), POST /:id/accept, POST /:id/decline, POST /:id/end, POST /:id/rate, GET /me (cursor paginated), GET /:id
- [ ] T041 [US1] Implement mentorship-expiry logic as hourly cron in `apps/api/src/workers/mentorship-expiry-worker.ts`: check expired mentorships (30 days), auto-complete, check mentee tier promotion, trigger rating prompt notifications
- [ ] T042 [US1] Register mentorship-expiry worker in `apps/api/src/workers/all-workers.ts` with dynamic import and `{ name: "mentorship-expiry", create: createMentorshipExpiryWorker }`
- [ ] T043 [US1] Hook mentor notification into mission completion flow: when evidence verified for mentee with active mentorship, send notification to mentor and trigger reward in `apps/api/src/routes/evidence/index.ts` (or appropriate verification callback)
- [ ] T044 [P] [US1] Create useMentorships React Query hook in `apps/web/src/hooks/useMentorships.ts` (suggestions, my mentorships, accept/decline/rate mutations)
- [ ] T045 [P] [US1] Create MentorCard, MenteeCard, MentorshipTimeline components in `apps/web/src/components/mentorship/`
- [ ] T046 [US1] Create mentorship dashboard page in `apps/web/app/mentorship/page.tsx` (active mentorships, suggestions for newcomers, mentee list for mentors, past mentorships)
- [ ] T047 [US1] Create MentorshipCard dashboard card in `apps/web/src/components/mentorship/MentorshipCard.tsx` and add to dashboard grid in `apps/web/app/dashboard/page.tsx`
- [ ] T048 [US1] Write API tests for mentorship lifecycle in `apps/api/src/tests/mentorships.test.ts`: suggestion algorithm, create/accept/decline, token rewards, expiry, rating, cap enforcement, edge cases (no mentors, tier drop)

**Checkpoint**: Mentorship pairing fully functional — newcomers matched, rewards flowing, expiry handled

---

## Phase 4: User Story 2 — Mission Buddies (Priority: P2)

**Goal**: Connected users co-claim missions, 60/40 reward split, 0.5 cap weight for buddy, Trusted Partner badge after 3 co-completions, shared chat

**Independent Test**: Two connected users → one invites buddy → buddy accepts → both submit evidence → rewards split 60/40 → after 3rd co-completion, Trusted Partner badge awarded

### Implementation

- [ ] T049 [US2] Implement buddy-rewards service in `apps/api/src/services/buddy-rewards.ts`: calculate reward splits (solo/buddy/helper combinations per research.md §2), double-entry accounting for each recipient
- [ ] T050 [US2] Implement buddy invitation routes in `apps/api/src/routes/mission-buddies/index.ts` per contracts/mission-buddies.md: POST /:missionId/claims/:claimId/buddy (invite), /buddy/accept, /buddy/decline — enforce **mutual connection** check (accepted connection from Sprint 16, not just one-way follow), capacity check (0.5 weight)
- [ ] T051 [US2] Modify mission claiming logic in `apps/api/src/routes/missions/index.ts` to support buddy co-claims: create linked buddy claim with isBuddy=true, count as 0.5 in weighted active count query
- [ ] T052 [US2] Modify mission completion flow to require both buddy evidence submissions before reward distribution, then call buddy-rewards service for 60/40 split
- [ ] T053 [US2] Implement Trusted Partner badge logic: after 3 co-completed missions between same pair, award badge to both — track pair completion count via query on mission_claims
- [ ] T054 [US2] Grant buddy access to mission chat channel upon acceptance (extend existing AES-256-GCM messaging routes in `apps/api/src/routes/messages/index.ts`)
- [ ] T055 [P] [US2] Create BuddyInvite, BuddyStatus, RewardSplit components in `apps/web/src/components/buddies/`
- [ ] T056 [US2] Extend mission detail page in `apps/web/app/missions/[id]/page.tsx` with "Claim with Buddy" button (shows connection selector), buddy status display, and reward split preview
- [ ] T057 [US2] Write API tests for buddy lifecycle in `apps/api/src/tests/mission-buddies.test.ts`: invite/accept/decline, 0.5 cap weight, both-evidence requirement, 60/40 split, buddy+helper split (45/30/25), Trusted Partner badge, edge cases (decline after evidence, connection required)

**Checkpoint**: Mission buddies fully functional — co-claiming, reward splits, badge system working

---

## Phase 5: User Story 3 — Community Moderator Role (Priority: P3)

**Goal**: Champion-tier users qualify as moderators, admin approves, domain-scoped Layer C queue access, immutable audit trail, privilege boundaries

**Independent Test**: Champion user meets criteria → system flags as eligible → admin approves → moderator sees domain-scoped flagged content → approves/rejects/escalates → audit trail recorded → accuracy drop triggers revocation

### Implementation

- [ ] T058 [US3] Implement moderator-eligibility service in `apps/api/src/services/moderator-eligibility.ts`: check champion tier, 90%+ accuracy (F1), 90+ days, zero suspensions, 3+ endorsements from advocate+ — flag eligible candidates
- [ ] T059 [US3] Implement daily moderator-eligibility worker in `apps/api/src/workers/moderator-eligibility-worker.ts`: scan eligible candidates, flag new ones, revoke status when criteria no longer met (cron `0 5 * * *`)
- [ ] T060 [US3] Register moderator-eligibility worker in `apps/api/src/workers/all-workers.ts`
- [ ] T061 [US3] Implement moderator routes in `apps/api/src/routes/moderator/index.ts` per contracts/moderator.md: GET /queue (domain-scoped, 2-hop exclusion), POST /queue/:itemId/decide (approve/reject/escalate), GET /stats
- [ ] T062 [US3] Implement admin moderator management routes: GET /admin/moderator/eligible, POST /admin/moderator/:humanId/approve, POST /admin/moderator/:humanId/revoke — in `apps/api/src/routes/admin/moderator.ts`
- [ ] T063 [US3] Implement moderator audit logging: on every moderator decision, insert immutable record into moderator_actions table with moderator identity, action type, target, decision, reason, domain — enforce no UPDATE/DELETE at service level in `apps/api/src/services/moderator-audit.ts`
- [ ] T064 [US3] Implement domain-scoped queue filtering: moderator only sees flagged content matching their moderatorDomains, excluding content by their connections (2-hop rule)
- [ ] T065 [P] [US3] Create ModeratorQueue, ModeratorAction, ModeratorBadge components in `apps/web/src/components/moderator/`
- [ ] T066 [US3] Create moderator dashboard card: shows queue count, review stats, active domains — add to moderator's dashboard if `isModerator` in `apps/web/app/dashboard/page.tsx`
- [ ] T067 [US3] Write API tests for moderator lifecycle in `apps/api/src/tests/moderator.test.ts`: eligibility detection, admin approval/revocation, queue access (domain-scoped), privilege boundaries (cannot resolve disputes/adjust rates), audit trail immutability, 2-hop exclusion, accuracy-based revocation

**Checkpoint**: Moderator role fully functional — earned, scoped, audited, revocable

---

## Phase 6: User Story 4 — Informal Help System (Priority: P4)

**Goal**: Offer help on others' missions, claimer accepts/declines, helper gets chat access, 25% reward share, help request toggle visible in domain feeds

**Independent Test**: User A claims mission → User B offers help → A accepts → B joins chat → mission completes → A marks B as contributing → B gets 25% reward (A gets 75%)

### Implementation

- [ ] T068 [US4] Implement help offer routes in `apps/api/src/routes/mission-buddies/index.ts` per contracts/mission-buddies.md: POST /:claimId/help-offers (with guardrail check on message), POST /help-offers/:offerId/accept, POST /help-offers/:offerId/decline, POST /help-offers/:offerId/mark-contributing, GET /:claimId/help-offers
- [ ] T069 [US4] Implement help request toggle route: PATCH /:claimId/help-request (toggle helpRequested + note with guardrail check), GET /missions/help-requests (browse, filter by domain/city)
- [ ] T070 [US4] Integrate helper reward into mission completion flow: when claimer marks helper as contributing, award 25% from claimer's share via buddy-rewards service (extend for helper case)
- [ ] T071 [US4] Grant accepted helper access to mission chat channel (extend messaging access check in `apps/api/src/routes/messages/index.ts`)
- [ ] T072 [US4] Surface help requests in domain discussion feeds: when help_request_note approved by guardrails, emit to domain discussion board API response in `apps/api/src/services/discussion.service.ts`
- [ ] T073 [P] [US4] Create OfferHelp, RequestHelp, HelpOfferCard components in `apps/web/src/components/help/`
- [ ] T074 [US4] Extend mission detail page in `apps/web/app/missions/[id]/page.tsx` with "Offer to Help" button, "Request Help" toggle, help offers list (for claimer)
- [ ] T075 [US4] Write API tests for help system in `apps/api/src/tests/mission-buddies.test.ts` (extend): offer/accept/decline, guardrail on message, duplicate prevention, contributing mark, 25% reward, help request toggle, feed visibility

**Checkpoint**: Informal help fully functional — offers, chat access, reward sharing, feed visibility

---

## Phase 7: User Story 5 — Elevated Human Agency (Priority: P5)

**Goal**: Advocate+ humans propose solutions, human solutions enter guardrail pipeline + decomposition, observations auto-elevate at 3 attestations, human-proposed missions need 3 endorsements

**Independent Test**: Advocate user → proposes solution → guardrail approves → decomposition creates missions → separately: 3 attestations elevate observation → separately: human proposes mission → 3 endorsements activate it

### Implementation

- [ ] T076 [US5] Implement human solution proposal route in `apps/api/src/routes/human-solutions/index.ts` per contracts/human-agency.md: POST /problems/:problemId/solutions (advocate+ check, self-response prevention, guardrail pipeline, set proposedByHumanId)
- [ ] T077 [US5] Modify solution display logic in `apps/api/src/routes/solutions/index.ts` to show both human and agent solutions with equal prominence, indicating proposer type
- [ ] T078 [US5] Implement human mission proposal routes in `apps/api/src/routes/human-missions/index.ts` per contracts/human-agency.md: POST /missions/propose (advocate+ check, guardrail, pending_endorsement status), POST /missions/:id/endorse (activate at 3), GET /missions/proposed
- [ ] T079 [US5] Implement auto-elevation of human observations: when attestation count reaches 3, update problem status to featured in `apps/api/src/routes/attestations/index.ts` (extend attestation creation handler)
- [ ] T080 [P] [US5] Extend solution card/list components in `apps/web/src/components/solutions/` to show human proposer info (name, tier) alongside agent proposer
- [ ] T081 [US5] Create human solution submission form on problem detail page in `apps/web/app/problems/[id]/page.tsx` (visible for advocate+ users)
- [ ] T082 [US5] Create human mission proposal page/form and endorsement button in `apps/web/app/missions/propose/page.tsx`
- [ ] T083 [US5] Write API tests for human agency in `apps/api/src/tests/human-agency.test.ts`: solution proposal (tier check, **self-response prevention** — verify 400 when proposing to own problem, guardrail), decomposition of human solutions, attestation elevation at 3, mission endorsement flow (create → endorse → activate at 3), edge cases

**Checkpoint**: Human agency fully functional — humans can propose solutions and missions

---

## Phase 8: User Story 6 — Learning Pathways (Priority: P6)

**Goal**: 4-level domain pathways, auto-tracked progress from missions/reviews/accuracy, level-up celebrations, progress display

**Independent Test**: User enrolls in Clean Water pathway → completes missions → reviews peers → progress updates automatically → reaches Level 2 → celebration notification sent

### Implementation

- [ ] T084 [US6] Implement pathway-progress service in `apps/api/src/services/pathway-progress.ts`: compute progress for each level's requirements (missions, types, reviews, accuracy, debates, cross-city, case studies read), auto-advance on level completion, trigger celebration notification
- [ ] T085 [US6] Implement learning pathway routes in `apps/api/src/routes/learning-pathways/index.ts` per contracts/learning-pathways.md: POST /:domain/enroll, GET /me, GET /:domain/progress (detailed per-level requirements), POST /:domain/case-studies/:id/mark-read
- [ ] T086 [US6] Hook pathway progress updates into mission completion, peer review submission, and debate participation flows: call pathwayProgress.updateOnMissionComplete(), updateOnReviewSubmit(), updateOnDebateParticipation() at appropriate points
- [ ] T087 [US6] Implement level-up celebration: when level advances, send notification to participant and their followers via notification service
- [ ] T088 [P] [US6] Create PathwayProgress, LevelRequirements, PathwayCard components in `apps/web/src/components/pathways/`
- [ ] T089 [US6] Create learning pathways overview page in `apps/web/app/learning/page.tsx` (15 domain cards showing enrollment status)
- [ ] T090 [US6] Create domain pathway detail page in `apps/web/app/learning/[domain]/page.tsx` (4 levels with requirements checklist, progress bars)
- [ ] T091 [US6] Write API tests for learning pathways in `apps/api/src/tests/learning-pathways.test.ts`: enroll, progress tracking on missions/reviews, level-up trigger, F1-based specialist auto-advance, case study read tracking

**Checkpoint**: Learning pathways fully functional — enrollment, auto-tracking, level-ups

---

## Phase 9: User Story 7 — Case Study Library (Priority: P7)

**Goal**: Weekly auto-curation of high-quality missions, AI summary generation, admin publish, display on domain pages, linked in pathways

**Independent Test**: Weekly curation job → identifies eligible mission → generates AI summary → admin publishes → appears on domain page → user marks as read for pathway progress

### Implementation

- [ ] T092 [US7] Implement case-study-curation service in `apps/api/src/services/case-study-curation.ts`: query eligible missions (confidence >= 0.90, unanimous consensus, before/after photos, 3+ attestations), call Claude Sonnet for structured summary generation, create draft case study records
- [ ] T093 [US7] Implement weekly case-study-curation worker in `apps/api/src/workers/case-study-curation-worker.ts` (cron `0 2 * * 6` — Sat 2 AM UTC)
- [ ] T094 [US7] Register case-study-curation worker in `apps/api/src/workers/all-workers.ts`
- [ ] T095 [US7] Implement case study routes in `apps/api/src/routes/case-studies/index.ts` per contracts/learning-pathways.md: GET / (public, domain filter, cursor pagination), GET /:id (public, full detail with contributors), GET /admin/case-studies/drafts (admin), POST /admin/case-studies/:id/publish (admin, awards 2 teaching tokens to contributors)
- [ ] T096 [US7] Integrate case studies into domain community page API: add case studies array to GET /domains/:domain/community response in `apps/api/src/routes/domains/index.ts`
- [ ] T097 [P] [US7] Create CaseStudyCard, CaseStudyDetail components in `apps/web/src/components/case-studies/`
- [ ] T098 [US7] Create case study library page in `apps/web/app/case-studies/page.tsx` and detail page in `apps/web/app/case-studies/[id]/page.tsx`
- [ ] T099 [US7] Add "Learn from Success" case studies section to domain community page component in `apps/web/app/domains/[slug]/page.tsx`
- [ ] T100 [US7] Write API tests for case studies in `apps/api/src/tests/case-studies.test.ts`: curation eligibility, AI summary generation mock, admin publish, public listing, contributor token rewards, read tracking

**Checkpoint**: Case study library fully functional — auto-curated, AI-summarized, published, linked

---

## Phase 10: User Story 8 — Cross-Group Challenges (Priority: P8)

**Goal**: City-vs-city and domain sprint challenges, per-capita scoring, progress display on group pages, badge awards

**Independent Test**: Admin creates city-vs-city challenge → participants join → mission completions update scores → per-capita leaderboard updates → challenge ends → winning city gets trophy badge

### Implementation

- [ ] T101 [US8] Implement challenge-scoring service in `apps/api/src/services/challenge-scoring.ts`: per-capita scoring for city-vs-city (active participants count), target tracking for domain sprints, cross-pollination detection (primary domain vs mission domain), results computation
- [ ] T102 [US8] Implement challenge routes in `apps/api/src/routes/challenges/index.ts` per contracts/challenges-circles.md: GET /challenges (public), GET /:id (with live leaderboard), POST /:id/join, GET /:id/my-progress, POST /admin/challenges (admin create)
- [ ] T103 [US8] Hook challenge score updates into mission completion flow: when a mission completes, check if participant is in an active challenge and increment their score
- [ ] T104 [US8] Implement challenge completion: when end_date reached or target met, compute final results, award badges to participants (winners for city-vs-city, all for domain sprint), store results JSONB
- [ ] T105 [P] [US8] Create ChallengeProgress, ChallengeLeaderboard components in `apps/web/src/components/challenges/`
- [ ] T106 [US8] Add challenge progress section to domain community and city chapter pages in `apps/web/app/domains/[slug]/page.tsx` and `apps/web/app/city/[city]/page.tsx`
- [ ] T107 [US8] Write API tests for challenges in `apps/api/src/tests/challenges.test.ts`: admin create, join, score updates, per-capita computation, challenge completion, badge awards, cross-pollination tracking

**Checkpoint**: Cross-group challenges fully functional — created, tracked, scored, awarded

---

## Phase 11: User Story 9 — Circle Enrichment (Priority: P9)

**Goal**: Circle creation (25 tokens), member management (50 max, 3 circles/user), discussion board with guardrails, mission sharing, collective metrics

**Independent Test**: User creates circle (25 tokens deducted) → invites members → members post discussions (guardrail approved) → share missions → collective metrics displayed → 50-member and 3-circle limits enforced

### Implementation

- [ ] T108 [US9] Implement circle CRUD routes in `apps/api/src/routes/circles/index.ts` per contracts/challenges-circles.md: GET /circles (list), POST /circles (create with 25-token cost), GET /:id (detail with metrics + members), POST /:id/join (50-member + 3-circle checks), POST /:id/leave (ownership transfer logic)
- [ ] T109 [US9] Implement circle discussion routes: GET /:id/posts (approved only, cursor paginated), POST /:id/posts (guardrail pipeline: Layer A → pending → Layer B), 10 posts/day rate limit
- [ ] T110 [US9] Implement circle mission sharing routes: POST /:id/missions (unique per circle+mission), GET /:id/missions (with mission details)
- [ ] T111 [US9] Implement circle collective metrics computation: count missions completed by circle members, compute member activity — in `apps/api/src/services/circle-metrics.ts`
- [ ] T112 [P] [US9] Create CircleDiscussion, CircleMissions, CircleMetrics, CircleMemberList components in `apps/web/src/components/circles/`
- [ ] T113 [US9] Create/extend circle detail page in `apps/web/app/circles/[id]/page.tsx` with discussion board, shared missions, member directory, collective metrics
- [ ] T114 [US9] Write API tests for circles in `apps/api/src/tests/circles.test.ts`: create (token cost), join/leave, 50-member limit, 3-circles-per-user, posts with guardrails (10/day rate limit), mission sharing (unique per circle+mission), metrics, **founder-leave ownership transfer** (to longest-standing moderator, then member)

**Checkpoint**: Circle enrichment fully functional — discussions, missions, metrics, limits enforced

---

## Phase 12: User Story 10 — Cooperative Achievements & Flexible Mission Limits (Priority: P10)

**Goal**: 5 cooperative achievement types detected weekly, displayed on co-earners' portfolios; tier-based mission limits (2-6) with completion rate safeguard

**Independent Test**: 3 users complete missions from same problem within 48 hours → weekly scan detects "First Responders" → achievement appears on all 3 portfolios → separately: champion user can claim 6 missions, newcomer only 2

### Implementation

- [ ] T115 [US10] Implement cooperative-achievements service in `apps/api/src/services/cooperative-achievements.ts`: detection logic for all 5 types (first_responders, cross_city_bridge, perfect_consensus, domain_sweep, growth_partners) per spec.md US10
- [ ] T116 [US10] Implement weekly achievement-detection worker in `apps/api/src/workers/achievement-detection-worker.ts` (cron `0 3 * * 0` — Sun 3 AM UTC)
- [ ] T117 [US10] Register achievement-detection worker in `apps/api/src/workers/all-workers.ts`
- [ ] T118 [US10] Implement achievement display routes per contracts/enhancements.md: GET /achievements/cooperative (public browse), GET /achievements/cooperative/me (user's achievements with co-earner links)
- [ ] T119 [US10] Modify mission claiming in `apps/api/src/routes/missions/index.ts`: replace hard-coded `>= 3` with tier-based limits (newcomer=2, contributor=3, advocate=4, leader=5, champion=6), add completion rate safeguard (if < 80%, limit = tier_limit - 1), use weighted count for buddy claims (0.5)
- [ ] T120 [US10] Add cooperative achievements to public portfolio display in `apps/api/src/routes/portfolios/index.ts` and portfolio page in `apps/web/app/portfolio/[id]/page.tsx`
- [ ] T121 [US10] Write API tests for achievements + limits in `apps/api/src/tests/achievements-limits.test.ts`: each achievement type detection, co-earner display, tier-based limits (all tiers), completion rate safeguard, buddy 0.5 weight

**Checkpoint**: Cooperative achievements + flexible limits fully functional

---

## Phase 13: User Story 11 — Remaining Enhancements (Priority: P11)

**Goal**: Gratitude narratives, teaching rewards, power distribution audit, agent fingerprint, network health, people discovery, personalized feed, welcome ambassadors

**Independent Test**: Each sub-feature independently testable — see acceptance scenarios in spec.md US11

### 13a: Gratitude Narratives & Teaching Rewards

- [ ] T122 [US11] Implement narrative endpoints: PATCH /endorsements/:id/narrative (guardrail check on narrative), POST /endorsements/:id/feature (max 3 featured per recipient) in `apps/api/src/routes/endorsements/index.ts`
- [ ] T123 [US11] Implement teaching rewards service in `apps/api/src/services/teaching-rewards.ts`: track teaching activity points (mentorship completion=5, help interaction=2, case study contribution=2, ambassador welcome=1), award Teacher badge at 20+ points
- [ ] T124 [US11] Implement teaching rewards routes: GET /teaching/me (summary), GET /teaching/leaderboard (public) in `apps/api/src/routes/teaching/index.ts`
- [ ] T125 [US11] Extend portfolio page to show featured narratives and Teacher badge

### 13b: Power Distribution Audit & Network Health

- [ ] T126 [P] [US11] Implement power-audit service in `apps/api/src/services/power-audit.ts`: compute Gini coefficient for reviews, decision concentration, admin override rate, tier distribution, domain coverage, geographic balance
- [ ] T127 [P] [US11] Implement weekly power-audit worker in `apps/api/src/workers/power-audit-worker.ts` (cron `0 5 * * 1` — Mon 5 AM UTC)
- [ ] T128 [US11] Register power-audit worker in `apps/api/src/workers/all-workers.ts`
- [ ] T129 [US11] Implement network-health service in `apps/api/src/services/network-health.ts`: compute connection density (connections / possible connections), cross-domain bridge count (connections between users of different primary domains), city connectivity per city, new connection rate (7-day rolling), reciprocity rate (mutual / total follows), Redis 10-min cache
- [ ] T130 [US11] Implement governance routes in `apps/api/src/routes/governance/index.ts`: GET /governance/power-audit (public, latest + trend), GET /governance/network-health (public, calls network-health service)
- [ ] T131 [P] [US11] Create PowerDistribution, GiniChart, NetworkHealth components in `apps/web/src/components/governance/`
- [ ] T132 [US11] Create governance page in `apps/web/app/governance/page.tsx` and network health page in `apps/web/app/network-health/page.tsx`

### 13c: Agent Fingerprint

- [ ] T133 [P] [US11] Implement agent-fingerprint service in `apps/api/src/services/agent-fingerprint.ts`: compute domain focus, approach pattern, geographic focus, scale preference from agent activity history
- [ ] T134 [US11] Implement weekly agent-fingerprint worker in `apps/api/src/workers/agent-fingerprint-worker.ts` (cron `0 6 * * 1` — Mon 6 AM UTC) and register in `apps/api/src/workers/all-workers.ts`
- [ ] T135 [US11] Implement agent fingerprint route: GET /agents/:agentId/fingerprint in `apps/api/src/routes/agents/fingerprint.ts`
- [ ] T136 [P] [US11] Create AgentFingerprint radar chart component in `apps/web/src/components/agents/AgentFingerprint.tsx` and add to agent profile page

### 13d: People Discovery

- [ ] T137 [US11] Implement people-discovery service in `apps/api/src/services/people-discovery.ts`: extend connection suggestion algorithm with contribution pattern similarity (×2), tier proximity (×1), pathway overlap (×1), Redis 10-min cache
- [ ] T138 [US11] Implement discover route: GET /discover/people (domain/city filters, cursor pagination, similarity reasons) in `apps/api/src/routes/discover/index.ts`
- [ ] T139 [P] [US11] Create PersonCard, DiscoverFilters components in `apps/web/src/components/discover/`
- [ ] T140 [US11] Create discover page in `apps/web/app/discover/page.tsx` with suggested people grid, filters, connect/follow actions

### 13e: Personalized Feed

- [ ] T141 [US11] Implement feed event emission: emit feed_events on problem creation, solution proposal, mission claim, evidence submission, thread/reply creation, achievement, milestone, help request — at each trigger point in existing routes
- [ ] T142 [US11] Implement feed-scoring service in `apps/api/src/services/feed-scoring.ts`: freshness decay × (connection bonus + domain match + city match), fallback to domain/city/global activity when <10 items
- [ ] T143 [US11] Implement feed-event-processor worker in `apps/api/src/workers/feed-event-processor-worker.ts` (cron `*/15 * * * *` — every 15 min) for scoring and 30-day pruning, register in all-workers.ts
- [ ] T144 [US11] Implement personalized feed route: GET /feed (humanAuth, cursor pagination, feature-flagged with global fallback) in `apps/api/src/routes/feed/index.ts`
- [ ] T145 [P] [US11] Create PersonalizedFeed, FeedItem components in `apps/web/src/components/feed/`
- [ ] T146 [US11] Integrate personalized feed into activity page (replace global feed when PERSONALIZED_FEED_ENABLED) in `apps/web/app/activity/page.tsx`

### 13f: Welcome Ambassadors

- [ ] T147 [US11] Implement welcome-ambassador service in `apps/api/src/services/welcome-ambassador.ts`: select rotating ambassador (advocate+ in newcomer's domain/city), assign on onboarding completion, 1 token reward (cap 5/month)
- [ ] T148 [US11] Hook ambassador assignment into onboarding completion flow in `apps/api/src/routes/humans/index.ts` (or onboarding route)
- [ ] T149 [US11] Implement ambassador routes: GET /ambassador/me (stats), POST /ambassador/welcome/:newcomerHumanId (send welcome, earn token) in `apps/api/src/routes/ambassador/index.ts`
- [ ] T150 [P] [US11] Create WelcomeCard, AmbassadorBadge components in `apps/web/src/components/ambassadors/`
- [ ] T151 [US11] Add WelcomeCard to newcomer dashboard showing ambassador info in `apps/web/app/dashboard/page.tsx`

### 13g: Tests for Remaining Enhancements

- [ ] T152 [US11] Write API tests for enhancements in `apps/api/src/tests/enhancements.test.ts`: narratives (guardrail, featuring limit), teaching rewards (point tracking, badge), power audit (Gini computation), fingerprint (computation), discovery (scoring), feed (scoring, fallback), ambassador (rotation, cap, token reward)

**Checkpoint**: All 8 enhancement sub-features functional — narratives, teaching, governance, fingerprints, discovery, feed, ambassadors

---

## Phase 14: Polish & Cross-Cutting Concerns

**Purpose**: Frontend component tests, cross-story integration verification, performance optimization

- [ ] T153 Write frontend component tests in `apps/web/src/tests/mentorship.test.tsx`: MentorCard rendering, suggestion display, accept/decline flows
- [ ] T154 [P] Write frontend component tests in `apps/web/src/tests/pathways.test.tsx`: PathwayProgress rendering, level requirements display
- [ ] T155 [P] Write frontend component tests in `apps/web/src/tests/moderator.test.tsx`: ModeratorQueue rendering, decision flow
- [ ] T156 Verify all new token flows use correct double-entry pattern with idempotency keys — audit all token operations across mentorship, buddy, helper, teaching, ambassador, circle creation
- [ ] T157 Verify all new user-generated content types pass through guardrail pipeline end-to-end — test circle posts, help messages, narratives, human solutions, human missions
- [ ] T158 Add Redis cache (5-min TTL) to high-read endpoints: pathway progress, challenge leaderboard, people discovery, governance metrics
- [ ] T159 Run full test suite to verify no regressions: `pnpm test` across all packages — ensure total test count exceeds 1484 baseline
- [ ] T160 Run quickstart.md validation: verify migration applies cleanly, all route groups register, all workers start

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phases 3-13 (User Stories)**: All depend on Phase 2 completion
- **Phase 14 (Polish)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (Mentorship)**: Independent after Phase 2 — no cross-story dependencies
- **US2 (Buddies)**: Independent after Phase 2 — extends mission claiming flow
- **US3 (Moderator)**: Independent after Phase 2 — extends Layer C queue
- **US4 (Help)**: Independent after Phase 2 — can share buddy-rewards service from US2 if implemented, but has its own reward logic
- **US5 (Human Agency)**: Independent after Phase 2 — extends solutions and missions
- **US6 (Pathways)**: Independent after Phase 2 — uses case studies from US7 for read tracking but can stub it
- **US7 (Case Studies)**: Independent after Phase 2 — optionally integrates with US6 for read tracking
- **US8 (Challenges)**: Independent after Phase 2 — extends domain/city pages from Sprint 17
- **US9 (Circles)**: Independent after Phase 2 — new entity, no cross-story deps
- **US10 (Achievements + Limits)**: Independent after Phase 2 — modifies mission claiming flow
- **US11 (Enhancements)**: Independent after Phase 2 — 8 sub-features are internally independent

### Within Each User Story

- Schema already created in Phase 1
- Zod schemas already created in Phase 2
- Services before routes
- Routes before frontend components
- Frontend components before pages
- Tests alongside or after implementation

### Parallel Opportunities

**Phase 1**: T004-T021 all [P] — different schema files, no dependencies
**Phase 2**: T024-T031 all [P] — different Zod schema files
**Per-Story**: Frontend components marked [P] can parallel with API work
**Cross-Story**: All user stories (Phases 3-13) can run in parallel once Phase 2 completes

---

## Parallel Example: User Story 1

```bash
# After Phase 2 complete, launch in parallel:
Task: "Implement mentorship-matching service in apps/api/src/services/mentorship-matching.ts"
Task: "Implement mentorship token reward logic in apps/api/src/services/mentorship-rewards.ts"
Task: "Create useMentorships React Query hook in apps/web/src/hooks/useMentorships.ts"
Task: "Create MentorCard, MenteeCard, MentorshipTimeline components in apps/web/src/components/mentorship/"

# Then sequentially:
Task: "Implement mentorship routes" (depends on services)
Task: "Create mentorship dashboard page" (depends on hooks + components)
Task: "Write API tests for mentorship lifecycle"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (20 tasks)
2. Complete Phase 2: Foundational (14 tasks)
3. Complete Phase 3: User Story 1 — Mentorship Pairing (11 tasks)
4. **STOP and VALIDATE**: Test mentorship lifecycle end-to-end
5. Deploy/demo — newcomers can be matched with mentors

### Incremental Delivery

1. Phase 1 + 2 → Foundation ready (34 tasks)
2. US1 (Mentorship) → MVP mentoring ✅
3. US2 (Buddies) + US3 (Moderator) → Core cooperation + governance ✅
4. US4 (Help) + US5 (Human Agency) → Deep cooperation ✅
5. US6 (Pathways) + US7 (Case Studies) → Learning system ✅
6. US8 (Challenges) + US9 (Circles) → Community depth ✅
7. US10 (Achievements) + US11 (Enhancements) → Full feature set ✅
8. Phase 14 → Polish and ship

### Parallel Team Strategy

With multiple developers after Phase 2:
- **Developer A**: US1 (Mentorship) → US4 (Help) → US6 (Pathways)
- **Developer B**: US2 (Buddies) → US5 (Human Agency) → US7 (Case Studies)
- **Developer C**: US3 (Moderator) → US8 (Challenges) → US9 (Circles)
- **Developer D**: US10 (Achievements) → US11 (Enhancements)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- All token operations MUST use double-entry accounting with SELECT FOR UPDATE
- All user-generated content MUST pass 3-layer guardrail pipeline
- All moderator actions MUST be logged to immutable audit trail
