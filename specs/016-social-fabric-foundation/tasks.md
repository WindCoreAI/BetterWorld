# Tasks: Social Fabric Foundation

**Input**: Design documents from `/specs/016-social-fabric-foundation/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Constitution Principle III (NON-NEGOTIABLE) requires coverage must not decrease. Test tasks included in Phase 10. Guardrail integration for discussions (FR-011) requires integration tests verifying full 3-layer pipeline.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US6)
- All paths relative to repository root

---

## Phase 1: Setup (Schema & Migration)

**Purpose**: Create all new database schema files, enums, and migration

- [X] T001 Add 4 new enums (connectionStatusEnum, notificationTypeEnum, discussionScopeTypeEnum, careMomentTypeEnum), 2 new transactionTypeEnum values (spend_cheer, spend_celebrate), and 2 new contentTypeEnum values (discussion_thread, discussion_reply) to `packages/db/src/schema/enums.ts`
- [X] T002 [P] Create follows table schema with indexes, CHECK constraint (no_self_follow), and relations in `packages/db/src/schema/follows.ts`
- [X] T003 [P] Create connections table schema with indexes, CHECK constraint (no_self_connection), and relations in `packages/db/src/schema/connections.ts`
- [X] T004 [P] Create discussion_threads table schema with guardrailStatus (reuse existing guardrailStatusEnum) + guardrailEvaluationId columns, indexes (filtered WHERE guardrailStatus='approved'), and relations in `packages/db/src/schema/discussionThreads.ts`
- [X] T005 [P] Create discussion_replies table schema with guardrailStatus (reuse existing guardrailStatusEnum) + guardrailEvaluationId columns, indexes (filtered WHERE guardrailStatus='approved'), and relations in `packages/db/src/schema/discussionReplies.ts`
- [X] T006 [P] Create notifications table schema with indexes and relations in `packages/db/src/schema/notifications.ts`
- [X] T007 Export all new schemas and enums from `packages/db/src/schema/index.ts`
- [X] T008 Generate and verify migration `packages/db/drizzle/0015_social_fabric.sql` (5 tables, 4 new enums, 4 enum value additions to existing enums, all indexes and CHECK constraints). Note: verify migration number doesn't collide with any competing branches before merge.

**Checkpoint**: Schema ready — all 5 new tables exist in local DB. Run migration locally to verify.

---

## Phase 2: Foundational (Notifications + WebSocket + API Client)

**Purpose**: Cross-cutting infrastructure used by multiple user stories. Notifications are needed by US2 (connection_request), US3 (reply), US5 (streak/milestone/cheer/celebrate/comeback). WebSocket push is needed for real-time delivery. API client is shared by all frontend hooks.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T009 Implement notification.service.ts in `apps/api/src/services/notification.service.ts` — create notification (with aggregation by aggregationKey for unread duplicates; when aggregation increments count on an existing notification, re-push the updated notification via WebSocket to the recipient), mark single read, mark all read, get unread count (Redis cache `notifications:unread:{humanId}` 60s TTL), list notifications (cursor pagination), WebSocket push on create via sendToHuman
- [X] T010 Implement notifications.routes.ts in `apps/api/src/routes/notifications.routes.ts` — 4 endpoints per contract: GET /notifications (requireHuman), GET /notifications/unread-count (requireHuman), PATCH /notifications/:id/read (requireHuman), POST /notifications/read-all (requireHuman). Register routes in main app router.
- [X] T011 Extend WebSocket infrastructure for human clients — in `apps/api/src/ws/feed.ts`: add HumanConnectedClient interface and humanClients Map keyed by humanId, implement addHumanClient/removeHumanClient functions with human session auth verification, implement sendToHuman(humanId, event) function for targeted delivery, add ping/pong heartbeat for human clients. Note: `feed.ts` handles client tracking/messaging logic; `server.ts` handles WebSocket upgrade/auth — human route goes in T012.
- [X] T012 Create human WebSocket connection route in `apps/api/src/ws/server.ts` (extend existing WS server alongside the agent `/ws/feed` route) — add `/ws/human` endpoint, authenticate human session token on upgrade, call addHumanClient on connect, handleMessage for pong, removeHumanClient on close
- [X] T013 Add social API functions to `apps/web/src/lib/humanApi.ts` — extend existing humanApi with new exported objects: followsApi (6 functions), connectionsApi (8 functions), discussionsApi (5 functions), notificationsApi (4 functions), networkApi (2 functions), careApi (2 functions), impactApi (2 functions). Uses existing humanFetch helper.
- [X] T014 Create human WebSocket connection hook in `apps/web/src/hooks/useHumanWebSocket.ts` — establish WebSocket connection with human auth token on mount, handle reconnection with exponential backoff, provide subscribe/unsubscribe API for notification events, integrate with React Query cache invalidation on notification receipt
- [X] T015 Create useNotifications.ts React Query hook in `apps/web/src/hooks/useNotifications.ts` — queries for notification list, unread count; mutations for mark read, mark all read; subscribe to WebSocket notification events via useHumanWebSocket for real-time updates
- [X] T016 [P] Implement NotificationItem.tsx in `apps/web/src/components/notifications/NotificationItem.tsx` — render notification by type with actor name, message, aggregation count, read/unread styling, timestamp
- [X] T017 Implement NotificationList.tsx in `apps/web/src/components/notifications/NotificationList.tsx` — paginated list using useNotifications hook, unread filter toggle, mark-all-read action
- [X] T018 Implement NotificationBell.tsx in `apps/web/src/components/notifications/NotificationBell.tsx` — bell icon with unread count badge, dropdown preview of recent notifications, link to full notifications page
- [X] T019 Create notifications page at `apps/web/app/notifications/page.tsx` — full notification center with NotificationList, type filter, requireHuman auth wrapper
- [X] T020 Integrate NotificationBell into main navigation in `apps/web/src/components/Navigation.tsx` — add bell icon to desktop auth section and mobile menu

**Checkpoint**: Notification bell visible in nav with unread count. Creating a notification via service correctly delivers via WebSocket and appears in the notification list. Human WebSocket connection established on login.

---

## Phase 3: User Story 1 — Follow Other Participants (Priority: P1) MVP

**Goal**: Enable one-way follow relationships so participants can track others' activity. Foundation for all downstream care features.

**Independent Test**: Follow a user from their portfolio → verify follow appears in "Following" list → unfollow → verify removed. Check follower/following counts on profiles.

### Implementation for User Story 1

- [X] T021 [US1] Implement follow.service.ts in `apps/api/src/services/follow.service.ts` — follow (with 200 max limit check, self-follow prevention, duplicate prevention), unfollow, getFollowing (cursor pagination), getFollowers (cursor pagination with isFollowingBack), getStatus (isFollowing + isFollowedBy), getCounts (followerCount + followingCount)
- [X] T022 [US1] Implement follows.routes.ts in `apps/api/src/routes/follows.routes.ts` — 6 endpoints per contract: POST /follows/:humanId (requireHuman), DELETE /follows/:humanId (requireHuman), GET /follows/following (requireHuman), GET /follows/followers (requireHuman), GET /follows/status/:humanId (requireHuman), GET /follows/counts/:humanId (optionalAuth). Register routes in main app router.
- [X] T023 [P] [US1] Create useFollows.ts React Query hook in `apps/web/src/hooks/useFollows.ts` — queries for following list, followers list, follow status, follow counts; mutations for follow/unfollow with optimistic updates
- [X] T024 [P] [US1] Implement FollowButton.tsx in `apps/web/src/components/social/FollowButton.tsx` — toggle between "Follow" and "Following" states, loading state, 200-limit error handling, uses useFollows hook
- [X] T025 [US1] Implement FollowersList.tsx in `apps/web/src/components/social/FollowersList.tsx` — paginated list of followers/following with user cards (avatar, name, tier, city), "Follow back" indicator, cursor pagination via useFollows hook
- [X] T026 [US1] Integrate FollowButton into portfolio page — add FollowButton to user portfolio header alongside existing profile info
- [X] T027 [US1] Integrate FollowButton into leaderboard entries — add compact FollowButton to leaderboard user rows
- [X] T028 [US1] Integrate follower/following counts display into public profiles — show counts on portfolio page header using getCounts endpoint

**Checkpoint**: Follow/unfollow works from portfolio page. Following/followers lists paginate correctly. Counts display on profiles. 200 follow limit enforced.

---

## Phase 4: User Story 2 — Send and Accept Connection Requests (Priority: P1)

**Goal**: Enable mutual connection relationships with suggestion algorithm. Creates the visible professional network.

**Independent Test**: Send connection request → recipient accepts → both appear in each other's connection lists with shared domains. Verify suggestions show on dashboard.

### Implementation for User Story 2

- [X] T029 [US2] Implement connection.service.ts in `apps/api/src/services/connection.service.ts` — sendRequest (self-prevention, duplicate prevention, 30-day cooldown check, auto-accept mutual pending), accept (recipient-only, compute sharedDomains + interactionCount), decline (set declinedAt for cooldown), remove, listAccepted (cursor pagination, domain filter), listPending, suggestions algorithm (shared domains ×3, same city ×2, mutual review history ×5, exclude existing + recently declined, top 5, Redis cache 5-min TTL; for zero-activity users fall back to same-city suggestions), getStatus
- [X] T030 [US2] Implement connections.routes.ts in `apps/api/src/routes/connections.routes.ts` — 8 endpoints per contract: POST /connections/:humanId, POST /connections/:id/accept, POST /connections/:id/decline, DELETE /connections/:id, GET /connections, GET /connections/pending, GET /connections/suggestions, GET /connections/status/:humanId. All requireHuman. Register routes in main app router.
- [X] T031 [US2] Add connection_request and connection_accepted notification triggers to connection.service.ts — on sendRequest create notification for recipient, on accept create notification for requester, push via WebSocket
- [X] T032 [P] [US2] Create useConnections.ts React Query hook in `apps/web/src/hooks/useConnections.ts` — queries for connection list, pending list, suggestions, connection status; mutations for request/accept/decline/remove with optimistic updates
- [X] T033 [P] [US2] Implement ConnectButton.tsx in `apps/web/src/components/social/ConnectButton.tsx` — states: none→"Connect", pending-sent→"Request Sent", pending-received→"Accept/Decline", accepted→"Connected" with remove option; uses useConnections hook
- [X] T034 [US2] Implement ConnectionsList.tsx in `apps/web/src/components/social/ConnectionsList.tsx` — paginated list of accepted connections with shared domains, interaction count, domain filter dropdown; pending requests tab with accept/decline actions
- [X] T035 [US2] Implement ConnectionSuggestions.tsx in `apps/web/src/components/social/ConnectionSuggestions.tsx` — "People you may know" card displaying up to 5 suggestions with reason text, shared domains, ConnectButton per suggestion
- [X] T036 [US2] Integrate ConnectionSuggestions as dashboard card — add to dashboard page layout, integrate ConnectButton into portfolio page header alongside FollowButton

**Checkpoint**: Connection request → accept → appears in both connection lists. Suggestions show on dashboard with relevant reasons. Decline enforces 30-day cooldown. Mutual pending auto-accepts.

---

## Phase 5: User Story 3 — Participate in Discussion Spaces (Priority: P2)

**Goal**: Enable low-stakes domain and city discussion boards with full 3-layer guardrail moderation (regex rule engine sync + Layer B async + Layer C admin review). Content is NOT visible while pending per constitution. Creates the repeated positive interaction space that fosters friendship.

**Independent Test**: Create a thread in "clean_water" domain → verify rule engine passes → content stored as 'pending' and not visible → Layer B evaluates → status updates to 'approved' → thread becomes publicly visible. Reply → verify reply count increments on approval and notification reaches thread author.

### Implementation for User Story 3

- [X] T037 [US3] Implement discussion.service.ts in `apps/api/src/services/discussion.service.ts` — createThread (validate scope against known domains from problemDomainEnum and cities from Open311 city configs, regex rule engine synchronous check on title+content, reject if fails, store with guardrailStatus='pending', queue Layer B evaluation via existing guardrail BullMQ queue with contentType='discussion_thread', rate limit 10 threads/day via Redis counter), createReply (rule engine check, store with guardrailStatus='pending', queue Layer B with contentType='discussion_reply', rate limit 50 replies/day), onGuardrailComplete callback (update guardrailStatus to approved/rejected/flagged, increment replyCount + update lastActivityAt only on approval, send reply notifications only on approval, send status notification to author), listThreads (by scopeType+scopeValue, filter WHERE guardrailStatus='approved' only — no author-pending exception per constitution, sort by activity or recent, cursor pagination), getThread, listReplies (cursor pagination, approved only)
- [X] T038 [US3] Implement discussions.routes.ts in `apps/api/src/routes/discussions.routes.ts` — 5 endpoints per contract: POST /discussions/threads (requireHuman), GET /discussions/threads (public — approved only), GET /discussions/threads/:threadId (public — approved only, 404 if pending), POST /discussions/threads/:threadId/replies (requireHuman), GET /discussions/threads/:threadId/replies (public — approved only). Register routes in main app router.
- [X] T039 [US3] Extend guardrail worker callback routing in `apps/api/src/workers/guardrail-worker.ts` — add handling for contentType 'discussion_thread' and 'discussion_reply' to route completion callbacks to discussion.service.ts onGuardrailComplete method
- [X] T040 [US3] Add reply and status notification triggers to discussion.service.ts onGuardrailComplete — on reply approval, send notification (type: reply) to thread author and distinct previous repliers (excluding the replying user), push via WebSocket. On thread/reply approval or rejection, send status notification to the author.
- [X] T041 [P] [US3] Create useDiscussions.ts React Query hook in `apps/web/src/hooks/useDiscussions.ts` — queries for thread list (by scope), single thread, reply list; mutations for create thread, create reply with cache invalidation; show "submitted for review" confirmation after successful POST
- [X] T042 [P] [US3] Implement NewThreadForm.tsx in `apps/web/src/components/discussions/NewThreadForm.tsx` — scope type/value pre-filled from page context, title (5-200 chars) and content (10-2000 chars) inputs, submission with guardrail rejection error display, "Your post has been submitted for review" success message after creation (do NOT display pending content inline)
- [X] T043 [P] [US3] Implement ReplyForm.tsx in `apps/web/src/components/discussions/ReplyForm.tsx` — content input (2-1000 chars), submission with guardrail rejection error display, rate limit feedback, "Your reply has been submitted for review" confirmation after submission (do NOT display pending content inline)
- [X] T044 [US3] Implement ThreadList.tsx in `apps/web/src/components/discussions/ThreadList.tsx` — thread cards with author info, reply count, last activity timestamp, sort toggle (activity/recent), cursor pagination (approved content only)
- [X] T045 [US3] Implement ThreadDetail.tsx in `apps/web/src/components/discussions/ThreadDetail.tsx` — full thread content, author info, reply list with ReplyForm, cursor-paginated replies (approved content only)
- [X] T046 [US3] Create discussion board page at `apps/web/app/discussions/[scopeType]/[scopeValue]/page.tsx` — ThreadList + NewThreadForm, scope header showing domain or city name
- [X] T047 [US3] Create thread detail page at `apps/web/app/discussions/thread/[threadId]/page.tsx` — ThreadDetail component with auth wrapper for replying

**Checkpoint**: Thread creation passes rule engine synchronously, queues Layer B, stores as 'pending'. Content NOT visible to any user while pending. Thread becomes publicly visible after Layer B approval. Author receives notification on approval/rejection. Reply notifications trigger only after approval. 10 threads/day and 50 replies/day limits enforced. Domain and city boards display correctly.

---

## Phase 6: User Story 4 — View Personal Network Dashboard (Priority: P2)

**Goal**: Aggregate interaction data from follows, connections, peer reviews, endorsements, and shared missions into a visible personal network view.

**Independent Test**: Participant with existing connections and review history views network dashboard → sees connection count, shared domains, active cities, top interaction partners. Click a partner → see full interaction history.

### Implementation for User Story 4

- [X] T048 [US4] Implement network.service.ts in `apps/api/src/services/network.service.ts` — getNetworkSummary (aggregate followersCount, followingCount, connectionsCount from follows+connections tables, sharedDomains and activeCities from humanProfiles, recentConnections from connections, topInteractionPartners from peer_reviews+endorsements; Redis cache `network:me:{humanId}` 5-min TTL), getInteractionHistory (query peer_reviews, endorsements, mission_claims for interactions with a specific partner)
- [X] T049 [US4] Implement network.routes.ts in `apps/api/src/routes/network.routes.ts` — 2 endpoints per contract: GET /network/me (requireHuman), GET /network/me/interactions?partnerId=:id (requireHuman). Register routes in main app router.
- [X] T050 [P] [US4] Create useNetwork.ts React Query hook in `apps/web/src/hooks/useNetwork.ts` — queries for network summary and interaction history by partnerId
- [X] T051 [US4] Implement YourNetworkCard.tsx dashboard card in `apps/web/src/components/dashboard/YourNetworkCard.tsx` — compact summary showing connection count, shared domains, active cities, recent connections list, link to full network page
- [X] T052 [US4] Create network dashboard page at `apps/web/app/dashboard/network/page.tsx` — full network view with connection list, top interaction partners, click-to-expand interaction history detail per partner
- [X] T053 [US4] Add empty state for new participants with no interactions — encouraging message with guidance on how to build network (complete missions, review evidence, endorse others)

**Checkpoint**: Network dashboard loads within 3 seconds. Shows aggregated data from follows + connections + reviews + endorsements. Interaction history displays correctly. Empty state renders for new users.

---

## Phase 7: User Story 5 — Receive and Send Care Moments (Priority: P2)

**Goal**: Detect streaks at risk, milestones achieved, and comebacks — notify followers and enable cheers/celebrations with optional 1-token gifts.

**Independent Test**: Follow a user → user's streak approaches break → follower receives streak_warning notification → send cheer with 1-token gift → verify double-entry token transaction created. Verify milestone detection on tier promotion.

**Dependencies**: Requires US1 (follows) to be complete — followers are the notification recipients.

### Implementation for User Story 5

- [X] T054 [US5] Implement care-moment.service.ts in `apps/api/src/services/care-moment.service.ts` — sendCheer (validate target exists, prevent self-cheer, optional 1-token gift via double-entry accounting with `spend_cheer` transaction type + idempotency key, create cheer notification with aggregation, WebSocket push; note: cheerId in response is the notification ID — no separate care_moments table, careMomentTypeEnum is used for notification metadata), sendCelebrate (same pattern with `spend_celebrate` + milestoneType, celebrationId is notification ID), insufficient balance handling (offer cheer without gift)
- [X] T055 [US5] Implement care-moments.routes.ts in `apps/api/src/routes/care-moments.routes.ts` — 2 endpoints per contract: POST /care/cheer (requireHuman), POST /care/celebrate (requireHuman). Zod schemas for request bodies. Register routes in main app router.
- [X] T056 [US5] Implement care-moment-worker.ts BullMQ worker in `apps/api/src/workers/care-moment-worker.ts` — two scheduled detection jobs: (1) streak-break hourly scan (find humans with no activity for 20+ hours who have active streaks, notify their followers), (2) milestone detection (triggered by events from existing flows, notify followers). Note: comeback detection is event-driven (see T059), not a scheduled job.
- [X] T057 [US5] Register care-moment-worker in BullMQ worker startup — configure hourly cron for streak-break detection, add queue/worker configuration to existing worker infrastructure
- [X] T058 [US5] Hook milestone detection into existing mission completion flow in `apps/api/src/routes/missions/index.ts` (search for the claim completion/status update logic) — after mission claim completion, check mission count milestones (10, 25, 50, 100) and emit milestone event to care-moment-worker
- [X] T059 [US5] Hook milestone detection into existing tier change flow in `apps/api/src/lib/reputation-engine.ts` (around line 355 where `reputation:tier_promoted` is emitted) — after tier promotion, emit tier_promotion event to care-moment-worker. Also add comeback detection: on login/activity, if `lastActiveAt` was 7+ days ago, update `lastActiveAt` and notify followers immediately (event-driven, not cron, to meet SC-009 30-second SLA)
- [X] T060 [US5] Hook `lastActiveAt` update into human auth/login flow — ensure `humanProfiles.lastActiveAt` is updated on every authenticated request or login event, so comeback detection in T059 has accurate data
- [X] T061 [P] [US5] Implement CheerButton.tsx in `apps/web/src/components/care/CheerButton.tsx` — "Cheer" action with optional gift toggle, loading state, insufficient balance fallback, appears in streak_warning notifications
- [X] T062 [P] [US5] Implement CelebrateButton.tsx in `apps/web/src/components/care/CelebrateButton.tsx` — "Celebrate" action with optional gift toggle, appears in milestone notifications
- [X] T063 [US5] Implement CareNotification.tsx in `apps/web/src/components/care/CareNotification.tsx` — renders care moment notifications with cheer/celebrate buttons inline, aggregation display ("3 people cheered your streak")

**Checkpoint**: Streak-break notification reaches followers. Cheer with 1-token gift creates double-entry transaction. Milestone celebration on tier promotion notifies followers. Comeback notification triggers on login within seconds (event-driven). Aggregated notifications display correctly.

---

## Phase 8: User Story 6 — Explore Contribution Ripple Effect (Priority: P3)

**Goal**: Visualize the full impact chain from problem to evidence and aggregate a participant's total downstream impact across all contributions (observations submitted, missions completed, evidence verified).

**Independent Test**: View impact chain for a problem with linked solutions, missions, and evidence → verify full chain displays with all participants. View "My Ripple" → verify aggregate stats (contributions, downstream missions, people, cities).

### Implementation for User Story 6

- [X] T064 [US6] Implement impact-chain.service.ts in `apps/api/src/services/impact-chain.service.ts` — getChain (join problems→solutions→missions→mission_claims→evidence→attestations for a given problemId, depth limited to 5 levels with configurable max, compute summary: totalParticipants, totalCities, totalMissionsCompleted, totalEvidenceVerified), getMyRipple (find all observations submitted, missions completed, evidence verified by the authenticated user, aggregate: contributionsCount by type, downstreamMissions, peopleInvolved, citiesReached, domainsImpacted, topChain, recentChains)
- [X] T065 [US6] Implement impact.routes.ts in `apps/api/src/routes/impact.routes.ts` — 2 endpoints per contract: GET /impact/chain/:problemId (optionalAuth — public endpoint), GET /impact/my-ripple (requireHuman). Register routes in main app router.
- [X] T066 [P] [US6] Create useImpact.ts React Query hook in `apps/web/src/hooks/useImpact.ts` — queries for impact chain by problemId and my-ripple summary
- [X] T067 [P] [US6] Implement ImpactChain.tsx in `apps/web/src/components/impact/ImpactChain.tsx` — chain visualization showing problem→solutions→missions→evidence flow with participant cards, click-through to profiles, depth truncation at 5 levels with "view more" expansion, empty chain state message
- [X] T068 [US6] Implement RippleSummary.tsx in `apps/web/src/components/impact/RippleSummary.tsx` — aggregate stats display: contributions count by type (observations, missions, evidence), downstream missions, people involved, cities reached, domains impacted, top chain highlight
- [X] T069 [US6] Implement ImpactRippleCard.tsx dashboard card in `apps/web/src/components/dashboard/ImpactRippleCard.tsx` — compact ripple summary for dashboard with link to full impact page
- [X] T070 [US6] Create impact chain page at `apps/web/app/impact/[problemId]/page.tsx` — ImpactChain visualization with RippleSummary, breadcrumb navigation back to problem

**Checkpoint**: Impact chain shows full problem→evidence traversal with depth truncation at 5 levels. "My Ripple" shows aggregate downstream impact by contribution type. Empty chain displays gracefully. Dashboard card links to full view.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Integration points, navigation links, notification retention, discussion discovery, analytics hooks, and final validation

- [X] T071 [P] Update dashboard page to include YourNetworkCard and ImpactRippleCard in `apps/web/src/components/dashboard/DashboardCards.tsx`
- [X] T072 [P] Add navigation links to discussion boards from domain detail and city dashboard pages. Add a discussion index/landing component to the main discussions route listing all available domain boards and city boards for discovery.
- [X] T073 [P] Add links to impact chain visualization from problem detail pages
- [X] T074 Implement notification retention policy — create a BullMQ scheduled job (daily cron) in `apps/api/src/workers/` that auto-archives read notifications older than 90 days to prevent unbounded table growth. Must be an actual implementation, not a code comment.
- [X] T075 Add basic analytics hooks for success criteria measurement — track follow/connection/discussion/care-moment event counts via Redis counters (daily buckets), expose via admin API endpoint GET /admin/social-metrics for post-launch SC-001 through SC-012 measurement
- [X] T076 Verify all new routes registered in main app router and accessible
- [X] T077 Run quickstart.md verification checklist end-to-end — validate all 15 checklist items

**Checkpoint**: All features accessible from navigation. Dashboard shows network + impact cards. Discussion boards discoverable via navigation. Notification retention implemented. Analytics counters tracking. All verification checklist items pass.

---

## Phase 10: Testing (Constitution Principle III Compliance)

**Purpose**: Ensure coverage does not decrease per Constitution Principle III (NON-NEGOTIABLE). All new code must have corresponding tests.

- [X] T078 [P] API integration tests for follows and connections routes in `apps/api/src/__tests__/follows.test.ts` and `apps/api/src/__tests__/connections.test.ts` — test all 14 endpoints (6 follow + 8 connection), self-follow/connect prevention, 200 follow limit, cooldown enforcement, auto-accept mutual, suggestion algorithm, cursor pagination
- [X] T079 [P] API integration tests for notifications routes in `apps/api/src/__tests__/notifications.test.ts` — test 4 endpoints, aggregation behavior, mark read, unread count cache, WebSocket delivery
- [X] T080 [P] API integration tests for discussions routes in `apps/api/src/__tests__/discussions.test.ts` — test 5 endpoints, full 3-layer guardrail pipeline integration (verify pending content not returned in listings, verify content visible after approval, verify rule engine rejection), rate limiting, scope validation
- [X] T081 [P] API integration tests for care-moments, network, and impact routes in `apps/api/src/__tests__/care-moments.test.ts`, `apps/api/src/__tests__/network.test.ts`, `apps/api/src/__tests__/impact.test.ts` — test token gift double-entry accounting, idempotency keys, network aggregation with cache, impact chain traversal depth limit
- [X] T082 [P] Unit tests for connection suggestion algorithm in `apps/api/src/__tests__/connection-suggestions.test.ts` — test scoring weights, zero-activity fallback, exclude existing connections, exclude recently declined, cache behavior
- [X] T083 [P] Unit tests for care-moment worker in `apps/api/src/__tests__/care-moment-worker.test.ts` — test streak-break detection, milestone detection event handling, comeback detection on login
- [X] T084 [P] Frontend component tests for critical social flows in `apps/web/src/__tests__/` — FollowButton (follow/unfollow toggle, 200-limit error), ConnectButton (state transitions), NotificationBell (unread count badge, dropdown), CheerButton (gift toggle, insufficient balance)
- [X] T085 Verify test coverage has not decreased — run `pnpm test -- --coverage` across all packages, compare with baseline (667 API + 43 frontend + 354 guardrails + 233 shared = 1254 total). Ensure new tests adequately cover all new code paths.

**Checkpoint**: All tests passing. Coverage has not decreased. Guardrail pipeline integration tests verify full 3-layer compliance for discussions. Notification delivery latency validated.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **US1 Follow (Phase 3)**: Depends on Phase 2 — no dependencies on other stories
- **US2 Connections (Phase 4)**: Depends on Phase 2 — no dependencies on other stories
- **US3 Discussions (Phase 5)**: Depends on Phase 2 — no dependencies on other stories
- **US4 Network Dashboard (Phase 6)**: Depends on Phase 2; benefits from US1 + US2 data but independently testable with existing peer_review/endorsement data
- **US5 Care Moments (Phase 7)**: Depends on Phase 2 + **US1 (follows)** — followers are the notification recipients
- **US6 Impact Ripple (Phase 8)**: Depends on Phase 2 — uses only existing problem/solution/mission/evidence tables
- **Polish (Phase 9)**: Depends on all desired stories being complete
- **Testing (Phase 10)**: Depends on implementation phases being complete; individual test tasks can run as each phase completes

### User Story Dependencies

```
Phase 1 (Setup) ──→ Phase 2 (Foundational) ──┬──→ US1 Follow (P1) ───────────────→ US5 Care Moments (P2)
                                               ├──→ US2 Connections (P1) ──────────→ US4 Network Dashboard (P2)*
                                               ├──→ US3 Discussions (P2)
                                               ├──→ US4 Network Dashboard (P2)*
                                               └──→ US6 Impact Ripple (P3)

* US4 is independently testable but shows richer data with US1 + US2 complete
```

### Within Each User Story

1. Service before routes (backend API must exist before frontend can call it)
2. Routes after service (register endpoints)
3. Hook after API client (frontend data layer)
4. Components after hook (UI depends on data)
5. Pages after components (pages compose components)
6. Integration last (plugging into existing pages)

### Parallel Opportunities

**Phase 1**: T002–T006 are all [P] (5 schema files in parallel after T001 enums)

**Phase 2**: T016 (NotificationItem.tsx) is [P] relative to backend tasks

**Cross-story parallelism** (after Phase 2 complete):
- US1 + US2 + US3 + US6 can all start in parallel (no cross-dependencies)
- US5 must wait for US1 completion (needs follow data for notifications)
- US4 can start after Phase 2 but is enriched by US1 + US2

**Within each story**: Hook + early components marked [P] where they don't depend on each other

**Testing**: T078–T084 are all [P] (independent test files)

---

## Parallel Example: After Foundational Phase Completes

```text
# Three stories can start simultaneously:
Agent A: US1 Follow System (T021 → T022 → T023/T024 → T025 → T026-T028)
Agent B: US2 Connection Graph (T029 → T030 → T031 → T032/T033 → T034 → T035-T036)
Agent C: US3 Discussion Spaces (T037 → T038 → T039-T040 → T041/T042/T043 → T044-T045 → T046-T047)

# After US1 completes, US5 can start:
Agent A: US5 Care Moments (T054 → T055 → T056-T057 → T058-T060 → T061/T062 → T063)

# Testing can begin per-phase:
Agent D: Tests for completed phases (T078-T085 as each story completes)
```

---

## Implementation Strategy

### MVP First (US1 Follow Only)

1. Complete Phase 1: Setup (schema + migration)
2. Complete Phase 2: Foundational (notification infra + WebSocket + API client)
3. Complete Phase 3: US1 Follow System
4. **STOP and VALIDATE**: Follow/unfollow from portfolio, counts on profiles, paginated lists
5. Deploy/demo as first social feature

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. US1 Follow → Social tracking MVP (P1)
3. US2 Connections → Mutual relationships + suggestions (P1)
4. US3 Discussions → Low-stakes interaction spaces with full guardrail compliance (P2)
5. US4 Network Dashboard → Visible social graph (P2)
6. US5 Care Moments → Active care expression (P2) — requires US1
7. US6 Impact Ripple → Downstream impact visibility (P3)
8. Polish → Navigation links, dashboard cards, notification retention, analytics, discussion discovery
9. Testing → Full test coverage verification

### Suggested MVP Scope

- **Minimum**: Phase 1 + Phase 2 + US1 (Follow System) = 28 tasks
- **Recommended**: Add US2 (Connections) for mutual relationships = 36 tasks
- **Full feature**: All 85 tasks across 10 phases

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks in same phase
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable (except US5 depends on US1)
- Cursor-based pagination on all list endpoints (`timestamp::id` composite cursor)
- All write endpoints use `requireHuman()` auth middleware; read endpoints are public for approved content
- Discussion content passes full 3-layer guardrail pipeline (regex rule engine sync reject + Layer B async classification + Layer C admin review). Content NOT visible to any user while pending per constitution. Publicly visible upon approval.
- Token gifts use existing double-entry accounting with `SELECT FOR UPDATE` + idempotency keys
- Standard envelope `{ ok, data/error, requestId }` on all new endpoints
- Cheers/celebrations are stored as notifications (cheerId/celebrationId = notification ID); no separate care_moments table
- Comeback detection is event-driven on login (not daily cron) to meet SC-009 30-second SLA
- Impact chain depth is limited to 5 levels and truncatable in the visualization
- Notification retention policy prevents unbounded table growth (90-day archival of read notifications)
- Discussion content uses existing `guardrailStatusEnum` (not VARCHAR) and extends `contentTypeEnum` with `discussion_thread` and `discussion_reply`
- `lastActiveAt` is updated on every authenticated request to enable accurate comeback detection
- Analytics counters track social event volumes for post-launch success criteria measurement
