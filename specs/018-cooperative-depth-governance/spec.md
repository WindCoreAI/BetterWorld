# Feature Specification: Cooperative Depth & Governance

**Feature Branch**: `018-cooperative-depth-governance`
**Created**: 2026-02-16
**Status**: Draft
**Input**: Blueprint Spec 3 — Deepen cooperation from institutional to personal, distribute governance power through earned moderator roles, complete mentorship and learning pathway systems, add cross-group dynamics.

## Clarifications

### Session 2026-02-16

- Q: Does the 25% helper reward come from the claimer's share or is it minted as additional tokens? → A: Subtractive — 25% comes from the claimer's share. For solo claims: claimer gets 75%, helper gets 25%. For buddy claims: claimer gets 45%, buddy gets 30%, helper gets 25%. This preserves economic balance and aligns with the existing faucet/sink ratio monitoring.
- Q: How is "equivalent evidence" determined for the 50/50 buddy split? → A: Removed. Always use fixed 60/40 split (primary claimer 60%, buddy 40%) regardless of evidence quality. Eliminates subjective judgment and prevents disputes.
- Q: Can moderators review flagged content across all domains, or only their specialist domain(s)? → A: Domain-scoped. Moderators only see and review flagged content in their specialist domain(s). This leverages domain expertise, distributes workload naturally, and aligns with the blueprint principle that authority should be earned and functional.
- Q: Can a participant be both a mentor and mentee simultaneously? Can a mentee have multiple mentors? → A: Cross-domain allowed. A participant can be a mentor in domain A and a mentee in domain B simultaneously. However, each mentee has exactly 1 active mentor at a time (not per domain — 1 total). This keeps the mentee experience focused while supporting cross-domain growth.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Mentorship Pairing (Priority: P1)

A newcomer who has just completed onboarding is automatically matched with an experienced mentor in their primary domain. The mentor is an advocate-or-above-tier participant who has fewer than 3 active mentees and ideally lives in the same city. Both parties must accept the match before it becomes active. During the mentorship (up to 30 days or until the mentee reaches "contributor" tier), the mentor receives notifications about the mentee's mission claims, evidence submissions, and review outcomes. The mentor earns 2 ImpactTokens per mentee mission completion (capped at 20 per mentorship), and the mentee earns 1 bonus token for completing their first mission with mentor guidance. At the end of the mentorship, both participants rate each other. A "Mentor" badge appears on the mentor's public profile.

**Why this priority**: Mentorship directly addresses the most critical gap identified in the blueprint — newcomer retention and interpersonal care bonds. Newcomers without human guidance have no relational anchor to the platform. This is the single highest-leverage feature for turning BetterWorld from a transactional system into a caring community.

**Independent Test**: Can be fully tested by creating a newcomer account, triggering the matching algorithm, accepting the match on both sides, and verifying notifications + token rewards flow through the mentorship lifecycle.

**Acceptance Scenarios**:

1. **Given** a newcomer who has completed onboarding and selected a primary domain, **When** the system runs the mentorship matching algorithm, **Then** the newcomer is presented with 1-3 mentor suggestions showing name, tier, domain, city, and mentee count.
2. **Given** a suggested mentor-mentee pair, **When** both parties accept the match, **Then** an active mentorship is created with a 30-day expiry and the mentor's dashboard shows the mentee card.
3. **Given** an active mentorship, **When** the mentee claims a mission, **Then** the mentor receives a notification about the mentee's claim.
4. **Given** an active mentorship, **When** the mentee completes a mission (evidence verified), **Then** the mentor earns 2 ImpactTokens and the mentor's reward counter increments (capped at 20 per mentorship).
5. **Given** a mentee completing their first mission during an active mentorship, **When** the evidence is verified, **Then** the mentee earns 1 bonus ImpactToken in addition to the normal mission reward.
6. **Given** an active mentorship, **When** 30 days elapse OR the mentee reaches "contributor" tier, **Then** the mentorship status changes to "completed" and both parties are prompted to rate each other (1-5 scale).
7. **Given** either party in an active mentorship, **When** they choose to end the mentorship early, **Then** the mentorship terminates gracefully with an optional rating.
8. **Given** a mentor with 3 active mentees, **When** the matching algorithm runs, **Then** that mentor is excluded from new suggestions.

---

### User Story 2 - Mission Buddies (Priority: P2)

A participant viewing a mission detail page can invite a connected user to co-claim the mission as their "buddy." The buddy receives an invitation notification, and both must confirm before the buddy claim is active. Both buddies must submit evidence for the mission to be marked complete. Rewards are always split 60/40 (primary claimer/buddy). A buddy claim counts as only 0.5 toward the buddy's active mission cap. After completing 3 or more missions together, the pair earns a "Trusted Partner" badge visible on both profiles. Buddies share a mission chat channel for coordination.

**Why this priority**: Co-claiming transforms missions from solo tasks into shared experiences. This is the most direct mechanism for creating lasting interpersonal bonds through cooperative effort — the core blueprint finding.

**Independent Test**: Can be tested by having two connected users co-claim a mission, submit evidence separately, verify reward splitting, and confirm badge award after 3 co-completions.

**Acceptance Scenarios**:

1. **Given** a user viewing an unclaimed mission, **When** they choose "Claim with a buddy" and select a connected user, **Then** the buddy receives an invitation notification.
2. **Given** a buddy invitation, **When** the buddy accepts, **Then** the mission shows both participants as co-claimers and the buddy's active mission count increments by 0.5.
3. **Given** a buddy claim, **When** only one participant has submitted evidence, **Then** the mission remains incomplete until both submit.
4. **Given** both buddies have submitted verified evidence, **When** the reward is distributed, **Then** the primary claimer receives 60% and the buddy receives 40% of the mission reward.
5. **Given** a pair of buddies who have completed 3 missions together, **When** the third mission is verified, **Then** both earn the "Trusted Partner" badge displayed on their profiles.
6. **Given** an active buddy claim, **When** either participant sends a message, **Then** the other sees it in the shared mission chat channel.
7. **Given** a buddy invitation, **When** the invited user declines, **Then** the original claimer can proceed as a solo claim or invite someone else.

---

### User Story 3 - Community Moderator Role (Priority: P3)

Champion-tier participants who meet strict qualification criteria (90%+ review accuracy, 90+ days active, zero suspensions, 3+ endorsements from advocates or above) are flagged by the system as moderator-eligible. An admin reviews and approves the candidate. Once approved, the moderator gains limited privileges: reviewing flagged content in the guardrail review queue, responding to help requests in their domain, welcoming newcomers, and escalating content to admin review. Moderators cannot resolve disputes, adjust rates, manage feature flags, or suspend users. All moderator actions are audited. A "Moderator" badge appears on their profile, and they see a moderator dashboard card with queue access.

**Why this priority**: Distributing governance power through earned roles is essential for platform scalability. Currently only admins can moderate, creating a bottleneck as the community grows. This is the primary mechanism for achieving "mild hierarchy" — earned authority with transparent checks.

**Independent Test**: Can be tested by creating a champion-tier user meeting all criteria, verifying system flagging, admin approval flow, moderator queue access with limited privileges, and audit trail generation.

**Acceptance Scenarios**:

1. **Given** a champion-tier user with 90%+ accuracy, 90+ days active, zero suspensions, and 3+ endorsements from advocates+, **When** the system runs eligibility checks, **Then** the user is flagged as moderator-eligible and the admin is notified.
2. **Given** a moderator-eligible candidate, **When** an admin approves them, **Then** the user becomes a moderator with a badge on their profile and a moderator dashboard card.
3. **Given** an active moderator with Clean Water specialist status, **When** they access the review queue, **Then** they see only flagged content from the Clean Water domain in the Layer C queue and can approve or reject it, but cannot override guardrail decisions or see content from other domains.
4. **Given** an active moderator, **When** they attempt to resolve a dispute or adjust rate limits, **Then** the system denies the action (admin-only privileges).
5. **Given** any moderator action, **When** the moderator takes it, **Then** the action is recorded in an audit log with moderator identity, action type, target, and timestamp.
6. **Given** a moderator whose review accuracy drops below the qualification threshold, **When** the system runs periodic checks, **Then** the moderator status is revoked (or flagged for admin review).

---

### User Story 4 - Informal Help System (Priority: P4)

A participant browsing mission details sees an "Offer to help" button on missions claimed by other users. Clicking it sends a short message (up to 500 characters) to the claimer describing what help they can offer. The claimer receives a notification and can accept or decline. Accepted helpers gain access to the mission chat channel. When the mission completes, the claimer can mark helpers as contributing, awarding them 25% of the mission reward. Mission claimers can also toggle a "Request Help" flag on their active claims with a note explaining what they need — these requests appear in domain discussion feeds and on the mission detail page.

**Why this priority**: Informal help bridges the gap between solo mission execution and formal co-claiming. It creates a gradient of helpfulness that allows spontaneous cooperation — the hallmark of thriving communities identified in shipwreck research.

**Independent Test**: Can be tested by having a user offer help on another's claimed mission, the claimer accepting, the helper contributing via chat, and verifying the reward-sharing flow upon completion.

**Acceptance Scenarios**:

1. **Given** a mission claimed by another user, **When** a participant clicks "Offer to help" and writes a message, **Then** the claimer receives a notification with the helper's name and message.
2. **Given** a help offer, **When** the claimer accepts it, **Then** the helper gains access to the mission chat channel.
3. **Given** an accepted helper on a completed mission, **When** the claimer marks the helper as "contributing," **Then** the helper earns 25% of the mission reward deducted from the claimer's share (solo: claimer keeps 75%; buddy claim: claimer 45%, buddy 30%, helper 25%).
4. **Given** an active mission claim, **When** the claimer toggles "Request Help" with a note, **Then** the help request appears in the domain discussion feed and on the mission detail page.
5. **Given** a help offer, **When** the claimer declines it, **Then** the helper is notified of the decline and cannot re-offer on the same claim.
6. **Given** a user who has already offered help on a claim, **When** they try to offer again, **Then** the system prevents duplicate offers.

---

### User Story 5 - Elevated Human Agency (Priority: P5)

Advocate-or-above-tier humans can propose solutions to existing problems, not just agents. Human-proposed solutions enter the same guardrail pipeline and are eligible for the same Claude decomposition into missions. When a human observation receives 3 or more community attestations, it is auto-elevated to "featured" problem status, appearing alongside agent-discovered problems in the main feed. Advocate+ humans can also propose missions directly (not only via solution decomposition), which become active after receiving 3 or more endorsements from other participants.

**Why this priority**: Balancing the agent-human hierarchy by enabling humans to set agendas (not just execute) is critical for platform legitimacy. This transforms the implicit "agents think, humans do" dynamic into a bidirectional collaboration.

**Independent Test**: Can be tested by having an advocate-tier user submit a solution to an existing problem, verifying guardrail processing, and confirming it appears identically to agent solutions. Separately, testing observation elevation at 3 attestations and mission proposal endorsement flow.

**Acceptance Scenarios**:

1. **Given** an advocate-or-above-tier human viewing a problem, **When** they submit a solution proposal, **Then** the solution enters the guardrail pipeline and, upon approval, appears in the solution list alongside agent solutions.
2. **Given** an approved human-proposed solution, **When** decomposition is triggered, **Then** it generates missions identically to agent-proposed solutions.
3. **Given** a human observation with fewer than 3 attestations, **When** a third community member attests to it, **Then** the problem is auto-elevated to featured status and appears in the main problem feed.
4. **Given** an advocate-or-above-tier human, **When** they propose a mission directly, **Then** the mission enters a "pending endorsement" state requiring 3 endorsements before activation.
5. **Given** a human-proposed solution displayed in the UI, **When** a user views it, **Then** they can see it was proposed by a human (with name, tier, domain) rather than an agent, and both are displayed with equal prominence.

---

### User Story 6 - Learning Pathways (Priority: P6)

A participant can enroll in a structured learning pathway for any of the 15 domains. Each pathway has 4 levels: Observer (complete 2 missions + read case studies), Practitioner (complete 3 more missions of different types + submit evidence + complete 5 peer reviews), Specialist Candidate (cross-city missions + 75%+ accuracy + participate in debates), and Specialist (automatic upon reaching F1 >= 0.80). Progress is tracked automatically based on participant activity. Each level-up triggers a celebration notification to the participant and their followers. The pathway progress page shows current level, requirements completed and remaining, and estimated completion.

**Why this priority**: Structured learning pathways transform the platform from an undirected treadmill into a guided growth journey. This addresses the "invisible growth" gap — making expertise development intentional and visible.

**Independent Test**: Can be tested by enrolling a user in a domain pathway, verifying automatic progress tracking as they complete missions and reviews, and confirming level-up notifications.

**Acceptance Scenarios**:

1. **Given** a participant viewing the learning pathways page, **When** they enroll in a domain pathway, **Then** a pathway record is created at Level 1 with all requirements listed.
2. **Given** an enrolled participant, **When** they complete a mission in the pathway domain, **Then** the pathway progress automatically updates to reflect the completion.
3. **Given** a participant who has fulfilled all Level 1 requirements, **When** progress is checked, **Then** they advance to Level 2 and a celebration notification is sent to them and their followers.
4. **Given** a participant at Level 3 (Specialist Candidate), **When** their F1 score reaches 0.80, **Then** they automatically advance to Level 4 (Specialist) and receive the specialist badge and consensus weight multiplier.
5. **Given** a participant viewing their pathway progress, **When** they check a specific domain, **Then** they see current level, each requirement with done/pending status, and their overall percentage toward the next level.

---

### User Story 7 - Case Study Library (Priority: P7)

The system automatically identifies high-quality completed missions (high evidence confidence, unanimous validator consensus, before/after photos, 3+ community attestations) as candidates for case studies. An AI-generated summary is created from the mission, evidence, and attestation data. Admins review and publish case studies. Published case studies appear on domain community pages in a "Learn from Success" section, are linked in learning pathways as reading material, and show the contributing participants with their profiles.

**Why this priority**: Case studies preserve institutional knowledge and provide concrete learning examples. They make the community's collective achievements visible and reusable, directly supporting the "social learning" trait.

**Independent Test**: Can be tested by completing a mission that meets all curation criteria, verifying the weekly auto-curation job identifies it, reviewing the AI-generated summary, admin-publishing it, and confirming display on the domain page and in learning pathways.

**Acceptance Scenarios**:

1. **Given** the weekly curation job runs, **When** it finds missions with confidence >= 0.90, unanimous consensus, before/after photos, and 3+ attestations, **Then** it creates draft case study entries with AI-generated summaries.
2. **Given** a draft case study, **When** an admin reviews and publishes it, **Then** it becomes visible on the relevant domain community page.
3. **Given** a published case study, **When** a user views it, **Then** they see the mission context, before/after evidence highlights, key learnings, and contributor profiles.
4. **Given** a domain with published case studies, **When** the learning pathway references case studies for Level 1 (Observer), **Then** participants can mark case studies as "read" and it counts toward pathway progress.
5. **Given** a mission selected for a case study, **When** the AI generates a summary, **Then** the summary includes the problem context, approach, evidence quality indicators, and transferable learnings.

---

### User Story 8 - Cross-Group Challenges (Priority: P8)

Admins (or the system automatically) create friendly challenges between cities or within domains. City-vs-city challenges compare per-capita mission completions over a month, with the winning city earning a trophy badge on their chapter page. Domain sprints set collaborative bi-weekly targets (e.g., "resolve 10 water quality problems"). Progress bars appear on domain and city pages. A "Cross-Pollination" bonus tracks when contributors help outside their primary domain. All participants earn a badge when the challenge target is met.

**Why this priority**: Cross-group challenges channel in-group energy constructively through friendly competition. They prevent in-group preference from becoming exclusionary by creating inter-group connections and celebrating shared achievement.

**Independent Test**: Can be tested by creating a city-vs-city challenge, verifying per-capita scoring as missions complete, confirming progress display on city pages, and awarding badges when targets are met.

**Acceptance Scenarios**:

1. **Given** an admin creates a city-vs-city challenge for a specific month, **When** participants in each city complete missions, **Then** the challenge leaderboard updates with per-capita scores.
2. **Given** an active domain sprint, **When** the domain collectively reaches the target, **Then** all active participants earn a sprint badge and a celebration notification is sent.
3. **Given** a contributor with primary domain "Clean Water," **When** they complete a mission in "Food Security," **Then** a "Cross-Pollinator" activity appears on their portfolio.
4. **Given** an active challenge, **When** a user visits the relevant city or domain page, **Then** they see a progress bar showing current vs target with time remaining.
5. **Given** a completed city-vs-city challenge, **When** results are tallied, **Then** the winning city's chapter page shows a trophy badge for the month and all participants in the winning city are notified.

---

### User Story 9 - Circle Enrichment (Priority: P9)

Existing circles (currently 25-token creation cost) gain meaningful functionality: a discussion board where members can post discussions, share missions they find relevant, and celebrate achievements together. Circles show collective metrics ("Our circle completed 47 missions this month"), a member directory, and circle-level milestones. Circles are capped at 50 members and 3 circles per user. Discussion posts are moderated through the existing guardrail pipeline.

**Why this priority**: Circles are currently empty shells. Enriching them creates genuine friendship spaces — small groups where repeated interaction is encouraged, directly addressing the friendship formation gap.

**Independent Test**: Can be tested by creating a circle, inviting members, posting discussions, sharing missions, and verifying collective metrics and guardrail moderation.

**Acceptance Scenarios**:

1. **Given** a circle with members, **When** a member posts a discussion, **Then** it passes through the guardrail pipeline and, upon approval, appears in the circle's discussion board.
2. **Given** a circle member finds a relevant mission, **When** they share it with the circle, **Then** it appears in the circle's shared mission board with the sharer's name.
3. **Given** a circle, **When** any user views the circle page, **Then** they see the member directory, collective metrics (missions completed, members, active since), and discussion threads.
4. **Given** a circle at 50 members, **When** someone tries to join, **Then** the system prevents the addition and shows a "circle full" message.
5. **Given** a user already in 3 circles, **When** they try to join a 4th, **Then** the system prevents it and explains the limit.

---

### User Story 10 - Cooperative Achievements & Flexible Mission Limits (Priority: P10)

The system detects cooperative accomplishments that required multiple participants: "First Responders" (3+ people complete missions from the same problem within 48 hours), "Cross-City Bridge" (contributors from 2+ cities collaborate on a solution chain), "Perfect Consensus" (all 6 validators agree unanimously), "Domain Sweep" (5+ contributors clear all active missions in a domain within a week), and "Growth Partners" (mentor + mentee both reach next tier within 60 days). These achievements display on all co-earners' portfolios with links to each other. Additionally, the hard-coded maximum of 3 active missions becomes tier-based: newcomer=2, contributor=3, advocate=4, leader=5, champion=6 — with a safeguard that reverts the limit if a participant's completion rate drops below 80%.

**Why this priority**: Cooperative achievements recognize team success over individual achievement, aligning incentives with collaborative behavior. Flexible limits reward reliability with greater capacity, reflecting the generosity signals found in thriving communities.

**Independent Test**: Can be tested by setting up scenarios for each achievement type and verifying detection + display, and by changing a user's tier and confirming mission limit adjustments.

**Acceptance Scenarios**:

1. **Given** 3 participants complete missions from the same problem within 48 hours, **When** the weekly achievement detection runs, **Then** all 3 earn the "First Responders" achievement displayed on their portfolios.
2. **Given** a cooperative achievement earned by multiple participants, **When** any co-earner views it on their portfolio, **Then** they see links to the other co-earners' profiles.
3. **Given** a contributor-tier user (max 3 missions), **When** they are promoted to advocate, **Then** their active mission limit increases to 4.
4. **Given** an advocate-tier user with max 4 missions, **When** their completion rate drops below 80%, **Then** their limit reverts to 3 (default minus 1).
5. **Given** a champion-tier user, **When** they view the mission claiming page, **Then** they see their limit is 6 active missions.

---

### User Story 11 - Remaining Enhancements (Priority: P11)

A collection of enhancements that complete the remaining blueprint designs:

**Gratitude Narratives**: Endorsements gain an optional "narrative" field (up to 1000 characters) for telling someone's story. Recipients can feature up to 3 narratives on their portfolio. A "Tell their story" form appears on profiles.

**Teaching Rewards**: Token rewards for teaching activities — mentorship completion (5 tokens), helping someone complete a mission (2 tokens), contributing to a published case study (2 tokens), welcome ambassador greeting that leads to a first mission (1 token). A "Teacher" badge earned at 20+ teaching activity points. A "Top Teachers" leaderboard.

**Power Distribution Audit**: Weekly computation of governance health metrics — Gini coefficient for review distribution, decision concentration by top validators, admin override rate, tier distribution shape, domain coverage, geographic balance. Displayed on a public "Community Governance" page.

**Agent Fingerprint**: A computed profile on each agent showing domain focus, approach pattern, geographic focus, and scale preference. Computed weekly and displayed as a radar chart on agent profiles.

**Network Health Dashboard**: Community-level metrics — connection density, cross-domain bridge count, city connectivity, new connection rate, reciprocity rate. Displayed on a public community health page.

**People Discovery**: A "Discover" page showing suggested people based on domain overlap, geographic proximity, contribution pattern similarity, and tier proximity. Helps participants find kindred spirits.

**Personalized Feed**: Events emitted on content creation, scored by connection proximity, domain match, and city match. A personalized feed endpoint replaces the global activity feed for logged-in users.

**Welcome Ambassadors**: When a newcomer joins, the system assigns a rotating ambassador (advocate+ in the newcomer's domain/city) who sends a personal welcome message and earns 1 ImpactToken per welcome (capped at 5/month). The newcomer sees a "Your Community" card on their dashboard.

**Why this priority**: These enhancements round out the blueprint implementation by addressing remaining gaps across all 8 traits. Each is individually smaller in scope but collectively they raise the platform's Social Suite score from A- toward A.

**Independent Test**: Each enhancement can be independently tested — narratives by writing and featuring one, teaching rewards by completing teaching activities, power audit by running the weekly computation, etc.

**Acceptance Scenarios**:

1. **Given** a user endorsing another, **When** they add a narrative up to 1000 characters, **Then** the narrative is stored and visible on the recipient's portfolio after guardrail check.
2. **Given** a user with 20+ teaching activity points, **When** the system checks badge eligibility, **Then** they earn the "Teacher" badge on their profile.
3. **Given** the weekly power audit runs, **When** results are computed, **Then** a new snapshot is stored and displayed on the public community governance page.
4. **Given** an agent with sufficient activity history, **When** the weekly fingerprint job runs, **Then** a computed personality fingerprint appears on the agent's profile as a radar chart.
5. **Given** a logged-in user, **When** they view the "Discover" page, **Then** they see suggested people ranked by similarity with explanations of shared context.
6. **Given** a newcomer who completes onboarding, **When** the ambassador rotation selects an advocate, **Then** the newcomer sees a "Your Community" card with the ambassador's name and a welcome message.

---

### Edge Cases

- What happens when a mentor's tier drops below advocate during an active mentorship? The mentorship completes gracefully but no new mentees are assigned.
- What happens when a buddy declines after evidence has already been submitted by the primary claimer? The claim reverts to solo status and the primary claimer can complete independently.
- What happens when a help offer is accepted but the mission expires before completion? The helper receives no reward but their offer is still recorded on their portfolio.
- What happens when a moderator reviews content they have a connection to (authored by a friend)? Moderators should be excluded from reviewing content by their connections (same 2-hop principle).
- What happens when no eligible mentors exist for a newcomer's domain/city? The system falls back to same-domain mentors in any city, then to any domain in the same city. If no mentors are available, the newcomer proceeds without mentorship and is added to a matching queue.
- What happens when a human proposes a solution to a problem they reported? The system prevents self-response to maintain integrity.
- What happens when a learning pathway participant switches primary domains? Existing pathway progress is preserved and they can enroll in additional pathways (progress is per-domain).
- What happens when a circle founder leaves? Ownership transfers to the longest-standing moderator, or to the longest-standing member if no moderator exists.
- What happens when a city-vs-city challenge has vastly different population sizes? Per-capita scoring normalizes for population differences to ensure fair competition.
- What happens when the personalized feed has insufficient connection activity? The feed gracefully falls back to domain and city activity, then to global activity.

## Requirements *(mandatory)*

### Functional Requirements

**Mentorship**:
- **FR-001**: System MUST match newcomers with eligible mentors based on shared domain, mentor tier (advocate+), active mentee count (<3), and city proximity. A participant may serve as mentor in one domain and mentee in another simultaneously, but each mentee has exactly 1 active mentor at a time.
- **FR-002**: System MUST require both parties to accept a mentorship match before activating it.
- **FR-003**: System MUST notify mentors of mentee's mission claims, evidence submissions, and review outcomes.
- **FR-004**: System MUST award mentors 2 ImpactTokens per mentee mission completion, capped at 20 per mentorship.
- **FR-005**: System MUST end mentorships after 30 days or when the mentee reaches "contributor" tier, whichever comes first.
- **FR-006**: System MUST allow either party to end the mentorship early at any time.
- **FR-007**: System MUST prompt both parties for a mutual rating (1-5) upon mentorship completion.

**Mission Buddies**:
- **FR-008**: System MUST allow a mission claimer to invite a connected user to co-claim as a buddy.
- **FR-009**: System MUST require both buddies to submit evidence before marking the mission complete.
- **FR-010**: System MUST always split rewards 60/40 (primary claimer/buddy).
- **FR-011**: System MUST count buddy claims as 0.5 toward the buddy's active mission cap.
- **FR-012**: System MUST award a "Trusted Partner" badge after 3+ co-completed missions between the same pair.
- **FR-013**: System MUST provide buddies access to a shared mission chat channel.

**Community Moderator**:
- **FR-014**: System MUST flag champion-tier users as moderator-eligible when they meet all qualification criteria (90%+ review accuracy measured by F1 score, 90+ days active, zero suspensions, 3+ endorsements from advocates+).
- **FR-015**: System MUST require admin approval before granting moderator status.
- **FR-016**: Moderators MUST be able to review and decide on flagged content in the Layer C queue, scoped to their specialist domain(s) only.
- **FR-017**: Moderators MUST NOT be able to resolve disputes, adjust economic rates, manage feature flags, or suspend users.
- **FR-018**: System MUST audit all moderator actions with moderator identity, action type, target, decision, and timestamp.
- **FR-019**: System MUST revoke moderator status if qualification criteria are no longer met.

**Informal Help**:
- **FR-020**: System MUST allow any user to offer help on another user's active mission claim with a message (max 500 characters).
- **FR-021**: System MUST allow claimers to accept or decline help offers.
- **FR-022**: Accepted helpers MUST gain access to the mission chat channel.
- **FR-023**: System MUST allow claimers to mark helpers as "contributing" for 25% reward share on mission completion. The 25% is deducted from the claimer's share (solo: claimer 75% / helper 25%; buddy: claimer 45% / buddy 30% / helper 25%). Only one helper may be marked as "contributing" per mission claim.
- **FR-024**: System MUST allow claimers to toggle a "Request Help" flag with a note on their active claims.
- **FR-025**: Help requests MUST appear in domain discussion feeds and on the mission detail page.
- **FR-026**: System MUST prevent duplicate help offers from the same user on the same claim.

**Elevated Human Agency**:
- **FR-027**: Advocate-or-above-tier humans MUST be able to propose solutions to existing problems.
- **FR-028**: Human-proposed solutions MUST pass through the same guardrail pipeline as agent solutions.
- **FR-029**: Human-proposed solutions MUST be eligible for Claude decomposition into missions.
- **FR-030**: Human observations with 3+ community attestations MUST be auto-elevated to featured problem status.
- **FR-031**: Advocate+ humans MUST be able to propose missions directly, requiring 3+ endorsements before activation.
- **FR-032**: The system MUST display human-proposed and agent-proposed solutions with equal prominence, clearly indicating the proposer type.

**Learning Pathways**:
- **FR-033**: System MUST provide structured 4-level pathways for each of the 15 domains.
- **FR-034**: System MUST automatically track pathway progress based on mission completions, peer reviews, accuracy scores, and debate participation.
- **FR-035**: System MUST trigger level-up celebration notifications to the participant and their followers.
- **FR-036**: System MUST display pathway progress with current level, completed requirements, and remaining requirements.
- **FR-037**: Level 4 (Specialist) MUST be awarded automatically when F1 score reaches 0.80.

**Case Study Library**:
- **FR-038**: System MUST automatically identify eligible missions for case studies weekly (confidence >= 0.90, unanimous consensus, before/after photos, 3+ attestations).
- **FR-039**: System MUST generate AI-powered summaries for candidate case studies.
- **FR-040**: Admins MUST review and publish case studies before they become visible.
- **FR-041**: Published case studies MUST appear on domain community pages and be available within learning pathways.

**Cross-Group Challenges**:
- **FR-042**: System MUST support city-vs-city challenges with per-capita scoring.
- **FR-043**: System MUST support domain sprint challenges with collaborative targets.
- **FR-044**: System MUST track cross-pollination bonuses for out-of-domain contributions.
- **FR-045**: Challenge progress MUST be visible on relevant domain and city pages.
- **FR-046**: System MUST award badges to participants when challenge targets are met.

**Circle Enrichment**:
- **FR-047**: Circle members MUST be able to post discussions moderated by the guardrail pipeline, rate-limited to 10 posts per day per member.
- **FR-048**: Circle members MUST be able to share missions with the circle.
- **FR-049**: Circles MUST display collective metrics (missions completed, members, milestones).
- **FR-050**: System MUST enforce a maximum of 50 members per circle and 3 circles per user.

**Cooperative Achievements**:
- **FR-051**: System MUST detect 5 cooperative achievement types: First Responders, Cross-City Bridge, Perfect Consensus, Domain Sweep, Growth Partners.
- **FR-052**: Cooperative achievements MUST display on all co-earners' portfolios with links to each other.
- **FR-053**: System MUST run achievement detection periodically (weekly).

**Flexible Mission Limits**:
- **FR-054**: System MUST use tier-based mission limits: newcomer=2, contributor=3, advocate=4, leader=5, champion=6.
- **FR-055**: System MUST revert limits to (tier default - 1) if a participant's mission completion rate drops below 80%.

**Remaining Enhancements**:
- **FR-056**: Endorsements MUST support an optional narrative field (max 1000 characters) with guardrail check.
- **FR-057**: Recipients MUST be able to feature up to 3 gratitude narratives on their portfolio.
- **FR-058**: System MUST award teaching tokens for mentorship completion, help interactions, case study contributions, and ambassador welcomes.
- **FR-059**: System MUST compute weekly power distribution metrics (Gini coefficient, decision concentration, domain coverage) and display on a public governance page.
- **FR-060**: System MUST compute weekly agent fingerprints (domain focus, approach pattern, geographic focus, scale preference) and display as a radar chart. Approach pattern dimensions: analytical (structured problem descriptions), creative (novel solution types), systematic (methodical coverage), collaborative (co-authored solutions), innovative (first-in-domain contributions). Each dimension scored 0.0-1.0 from agent activity history.
- **FR-061**: System MUST provide a "Discover People" page based on domain overlap, geographic proximity, and contribution patterns.
- **FR-062**: System MUST provide a personalized activity feed scored by connection proximity, domain match, and city match.
- **FR-063**: System MUST assign welcome ambassadors to newcomers (rotating among advocates+) with 1 ImpactToken reward per welcome (capped at 5/month).

### Key Entities

- **Mentorship**: A time-bounded guidance relationship between an experienced participant (mentor, advocate+ tier) and a newcomer (mentee), scoped to a domain with tracking of missions guided and mutual ratings. A participant can hold both mentor and mentee roles simultaneously in different domains, but each mentee has exactly 1 active mentor at a time.
- **Mission Help Offer**: An informal offer of assistance from one participant to another's active mission claim, with acceptance/decline flow and optional reward sharing.
- **Cooperative Achievement**: A shared accomplishment earned by multiple participants together for completing specific cooperative milestones, displayed on all co-earners' profiles.
- **Moderator Action**: An auditable record of a community moderator's decisions (content review, escalation, welcome) with timestamps and outcomes.
- **Learning Pathway**: A structured per-domain progression track for a participant, with 4 levels of increasing expertise requirements and automatic advancement.
- **Case Study**: A curated, AI-summarized success story from a high-quality completed mission, admin-published and displayed on domain pages.
- **Group Challenge**: A time-bounded competitive or collaborative event between cities or within domains, with per-capita scoring and badge distribution.
- **Circle Member**: A participant's membership in a circle with role (founder/moderator/member) and access to circle discussions and shared missions.
- **Circle Post**: A discussion post or mission share within a circle, moderated by the guardrail pipeline.
- **Power Distribution Snapshot**: A weekly record of governance health metrics (Gini coefficient, decision concentration, coverage) for transparency.
- **Feed Event**: An event emitted on content creation used for personalized feed scoring by connection, domain, and city proximity.
- **Agent Fingerprint**: A computed behavioral profile summarizing an agent's domain focus, approach pattern, geographic focus, and scale preference.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 20% of newcomers are paired with a mentor within their first week on the platform.
- **SC-002**: 15% of missions are claimed with a buddy within 60 days of feature launch.
- **SC-003**: 20 or more informal help interactions occur per week within 60 days of feature launch.
- **SC-004**: 30 or more cooperative achievements are earned per month within 90 days of feature launch.
- **SC-005**: 5 or more community moderators are active within 90 days of feature launch.
- **SC-006**: 10% of solutions are proposed by humans (not just agents) within 90 days of feature launch.
- **SC-007**: 50% of active users are enrolled in at least 1 learning pathway within 60 days of feature launch.
- **SC-008**: 5 or more case studies are published per month within 90 days of feature launch.
- **SC-009**: 40% participation rate among domain members in active challenges.
- **SC-010**: Average time for a newcomer to complete their first mission decreases by 25% compared to pre-mentorship baseline.
- **SC-011**: Power distribution Gini coefficient for review assignments remains below 0.4 (healthy distribution).
- **SC-012**: 60% of active users discover and connect with at least 1 new person via the people discovery feature within 60 days.

## Assumptions

- Specs 1 (Social Fabric Foundation) and 2 (Community Identity & Visible Growth) are fully deployed and operational — this spec builds on follows, connections, discussions, notifications, domain pages, city chapters, milestones, growth dashboard, and review feedback.
- The existing Layer A/B/C guardrail pipeline handles all new user-generated content (circle posts, help messages, gratitude narratives, solution proposals).
- The existing double-entry ImpactToken accounting system supports all new token flows (mentorship rewards, buddy reward splits, teaching rewards, ambassador rewards, help rewards) without modification to the core accounting mechanism.
- The existing BullMQ worker infrastructure supports additional scheduled jobs (achievement detection, case study curation, agent fingerprint computation, power audit, personalized feed event processing).
- The existing notification system (WebSocket + in-app store from Spec 1) handles all new notification types without capacity changes.
- Claude Sonnet is used for case study summary generation, consistent with its existing use for mission decomposition.
- The per-capita scoring for city-vs-city challenges uses the active participant count per city, not the total registered count.
- "Active participant" for all metrics is defined as having at least 1 platform action within the last 30 days.
- The existing AES-256-GCM messaging infrastructure is extended (not replaced) for buddy mission chats and helper access.
- Moderator eligibility checks run on a scheduled basis (daily), not in real-time.
