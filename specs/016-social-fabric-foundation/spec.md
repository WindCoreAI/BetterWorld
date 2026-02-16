# Feature Specification: Social Fabric Foundation

**Feature Branch**: `016-social-fabric-foundation`
**Created**: 2026-02-15
**Status**: Draft
**Input**: User description: "Spec 1 from Blueprint Implementation Roadmap — Build the relational infrastructure (follow system, connection graph, low-stakes discussion spaces, personal network dashboard, care moments, contribution ripple effect) that transforms BetterWorld from a transactional platform into a community."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Follow Other Participants (Priority: P1)

As a human participant, I want to follow other participants whose work I admire so that I can stay updated on their contributions, milestones, and activity without requiring mutual agreement.

**Why this priority**: The follow system is the foundational primitive for all social features — care moments, milestone celebrations, and streak notifications all depend on knowing who cares about whom. Without follows, none of the downstream care features can function.

**Independent Test**: Can be fully tested by following another user, then verifying the follow appears in both the follower's "following" list and the followed user's "followers" list. Delivers value by enabling one-way social tracking.

**Acceptance Scenarios**:

1. **Given** a logged-in participant viewing another user's portfolio, **When** they click the "Follow" button, **Then** the follow is recorded and the button changes to "Following"
2. **Given** a participant who follows 5 others, **When** they visit their "Following" list, **Then** they see all 5 followed users with cursor-based pagination
3. **Given** a participant with 10 followers, **When** they visit their "Followers" list, **Then** they see all 10 followers with cursor-based pagination
4. **Given** a participant who already follows someone, **When** they click "Following" (unfollow), **Then** the follow is removed and the button reverts to "Follow"
5. **Given** a participant who already follows 200 users, **When** they try to follow another user, **Then** the system prevents the follow and displays a message explaining the limit
6. **Given** a participant viewing a public profile, **When** they view the profile header, **Then** the follower count is visible

---

### User Story 2 - Send and Accept Connection Requests (Priority: P1)

As a human participant, I want to send mutual connection requests to people I've interacted with so that I can build a visible network of professional relationships within the platform.

**Why this priority**: The connection graph is the second foundational primitive. Connections provide the mutual relationship model that the platform currently lacks entirely. Connection suggestions drive organic discovery.

**Independent Test**: Can be fully tested by sending a connection request, having the recipient accept, and verifying both users appear in each other's connection lists. Delivers value by creating mutual relationships.

**Acceptance Scenarios**:

1. **Given** a logged-in participant viewing another user's profile, **When** they click "Connect", **Then** a connection request is sent and the button changes to "Request Sent"
2. **Given** a participant with a pending connection request, **When** they view their notifications/requests, **Then** they see the request with Accept and Decline options
3. **Given** a participant who accepts a connection request, **When** acceptance is confirmed, **Then** both users appear in each other's connection lists with shared domain and interaction data
4. **Given** a participant who declines a connection request, **When** they decline, **Then** the request is removed and the requester cannot re-send for 30 days
5. **Given** a participant on their dashboard, **When** connection suggestions are loaded, **Then** they see 3-5 suggested connections based on shared domains, same city, and mutual review history

---

### User Story 3 - Participate in Discussion Spaces (Priority: P2)

As a human participant, I want to post in domain-specific and city-specific discussion spaces so that I can have low-stakes conversations, share knowledge, and build familiarity with other participants outside of the high-stakes validation context.

**Why this priority**: Discussion spaces are the primary mechanism for enabling repeated positive interactions — the prerequisite for friendship formation. They create the "low-stakes channel" that complements the existing "high-stakes" peer review system.

**Independent Test**: Can be fully tested by creating a discussion thread in a domain space, having another user reply, and verifying both the thread and reply appear correctly. Delivers value by providing the first low-pressure social interaction space.

**Acceptance Scenarios**:

1. **Given** a participant navigating to the "Clean Water" domain discussions, **When** they click "New Thread", **Then** they can enter a title and content, submit, and see the thread listed
2. **Given** an existing discussion thread, **When** a participant submits a reply, **Then** the reply appears in the thread and the reply count increments
3. **Given** a participant who posts a thread with content that violates community guidelines, **When** the content is submitted, **Then** the guardrail moderation (Layer A) blocks the post and provides feedback
4. **Given** a participant who has already created 10 threads today, **When** they try to create another, **Then** the system prevents it and shows the daily limit message
5. **Given** a participant navigating to a city community board (Portland, Chicago, or Denver), **When** they view the board, **Then** they see threads scoped to that city with recent activity first
6. **Given** a participant who authored a thread or replied to one, **When** another user replies to that thread, **Then** the participant receives a notification

---

### User Story 4 - View Personal Network Dashboard (Priority: P2)

As a human participant, I want to see a visual summary of my network — who I've interacted with, shared domains, and connection stats — so that I can understand my place in the community and discover shared history with other participants.

**Why this priority**: The personal network view makes the invisible social graph visible. Participants currently cannot see their relationships, making the platform feel isolating even when they are deeply embedded.

**Independent Test**: Can be fully tested by a participant with existing interactions (peer reviews, endorsements, connections) viewing their network dashboard and verifying aggregated data displays correctly. Delivers value by revealing hidden social context.

**Acceptance Scenarios**:

1. **Given** a participant with connections and interaction history, **When** they visit their network dashboard, **Then** they see their total connection count, shared domains, and active cities
2. **Given** a participant viewing their network, **When** they click on a specific connection, **Then** they see the full shared interaction history (reviews, endorsements, shared missions)
3. **Given** a new participant with no interactions, **When** they visit the network page, **Then** they see an encouraging empty state with guidance on how to build their network
4. **Given** a participant who has recently gained new connections, **When** they revisit the network dashboard, **Then** the data reflects recent changes (cached with reasonable freshness)

---

### User Story 5 - Receive and Send Care Moments (Priority: P2)

As a human participant, I want to receive notifications when people I follow achieve milestones or are at risk of losing their streak, and I want to send cheers and celebrations, so that I can express genuine care and support for other community members.

**Why this priority**: Care moments are the "care at cost" mechanism that Christakis identifies as the primary indicator of thriving communities. They transform follows from passive observation into active care.

**Independent Test**: Can be fully tested by following a user, triggering a milestone event for that user, verifying the follower receives a notification, and sending a cheer/celebration in response. Delivers value by creating moments of interpersonal care.

**Acceptance Scenarios**:

1. **Given** a participant who follows someone whose streak is about to break (no activity for 20+ hours), **When** the streak-break detection runs, **Then** the follower receives a notification about the at-risk streak
2. **Given** a participant receiving a streak-break notification, **When** they click "Cheer", **Then** an encouraging message is sent to the streak-holder, optionally with a 1-token gift
3. **Given** a participant who follows someone who just reached a milestone (10 missions, tier promotion, streak record), **When** the milestone is detected, **Then** the follower receives a celebration notification
4. **Given** a participant receiving a milestone notification, **When** they click "Celebrate", **Then** a celebration reaction is recorded and optionally accompanied by a 1-token gift
5. **Given** a participant who returns to the platform after 7+ days of inactivity, **When** they log back in, **Then** their followers receive a "welcome back" notification and can send encouragement
6. **Given** a participant with many followers, **When** multiple people cheer their streak, **Then** the participant sees an aggregated message (e.g., "3 people are cheering for your streak!")

---

### User Story 6 - Explore Contribution Ripple Effect (Priority: P3)

As a human participant, I want to see how my contributions ripple through the system — from the problems I observed to the solutions proposed, missions completed, and evidence verified — so that I can understand the full downstream impact of my work.

**Why this priority**: The ripple effect makes impact tangible and connected. Currently, contributions feel isolated — you complete a mission and never see what happens next. The ripple view connects the dots.

**Independent Test**: Can be fully tested by tracing a problem with downstream solutions and missions, and verifying the chain visualization shows all participants and outcomes. Delivers value by making invisible impact visible.

**Acceptance Scenarios**:

1. **Given** a problem with linked solutions, missions, evidence, and attestations, **When** a participant views the impact chain for that problem, **Then** they see the full chain from problem through to verified outcomes with all participants listed
2. **Given** a participant who has contributed to multiple problems/missions, **When** they visit "Your Impact Ripple" on their dashboard, **Then** they see aggregate stats: total contributions, downstream missions sparked, people involved, cities reached
3. **Given** a problem with no downstream activity yet, **When** a participant views its impact chain, **Then** the chain shows only the problem node with a message indicating no solutions or missions yet
4. **Given** a participant viewing the ripple of a problem they contributed to, **When** they see another participant in the chain, **Then** they can click through to that person's profile

---

### Edge Cases

- What happens when a user tries to follow themselves? The system prevents self-follows with a clear error message.
- What happens when a user sends a connection request to someone who already sent them one? The system auto-accepts the mutual request, creating the connection.
- What happens when a discussion thread author deletes their account? Threads remain visible with an "inactive participant" attribution; replies remain.
- What happens when a participant receives more than 10 notifications in a day? Notifications are batched and aggregated to prevent notification fatigue (e.g., "5 people cheered your streak" instead of 5 separate notifications).
- What happens when the cheered participant has already completed their daily activity? The cheer is still delivered as appreciation, but no streak-break urgency is shown.
- What happens when a user tries to send a token gift but has insufficient balance? The system offers to send the cheer/celebration without a token gift instead.
- What happens when a discussion thread receives no replies for 30 days? The thread remains visible but is deprioritized in listings (sorted by last activity).
- How does the system handle connection suggestions when a user has no activity? The system falls back to suggesting users in the same city, which is the highest available signal when no interaction history or shared domain data exists.
- What happens when the impact chain is very deep (5+ levels)? The chain visualization truncates at a reasonable depth with a "view more" expansion option.
- Can discussion threads or replies be edited or deleted by the author? No — discussion content is intentionally immutable once submitted and approved. This prevents retroactive content manipulation after guardrail approval. Authors may create new threads to correct or update information.
- What happens to social data when a user deletes their account? Follows and connections are CASCADE-deleted (removed). Notifications are CASCADE-deleted. Discussion threads and replies use RESTRICT — account deletion is blocked if the user has authored threads or replies, preserving community conversations. The user must be deactivated rather than hard-deleted in this case.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support one-way follow relationships between human participants, with a maximum of 200 follows per user
- **FR-002**: System MUST provide follow/unfollow actions accessible from portfolio pages, leaderboard entries, and profile views
- **FR-003**: System MUST display follower and following counts on public profiles
- **FR-004**: System MUST provide paginated follower and following lists using cursor-based pagination
- **FR-005**: System MUST support mutual connection requests with pending/accepted/declined states
- **FR-006**: System MUST generate connection suggestions based on shared domains, same city, and mutual review history, weighted by relevance
- **FR-007**: System MUST display up to 5 connection suggestions on the participant dashboard ("People you may know"), with fewer shown when insufficient suitable candidates exist
- **FR-008**: System MUST provide a connection list page showing accepted connections with shared interaction history
- **FR-009**: System MUST support discussion threads scoped to domains (15 domains) and cities (Portland, Chicago, Denver)
- **FR-010**: System MUST support replies on discussion threads
- **FR-011**: System MUST moderate all discussion content through the full 3-layer constitutional guardrail pipeline (regex-based rule engine synchronous reject on forbidden patterns, Layer B async classification, Layer C admin review for flagged content). Content is not visible to any user while pending evaluation. Authors receive a submission confirmation and a notification when evaluation completes (approved, rejected, or flagged). Content becomes publicly visible upon approval.
- **FR-012**: System MUST enforce rate limits on discussions: 10 threads per day and 50 replies per day per user
- **FR-013**: System MUST notify thread participants when new replies are posted
- **FR-014**: System MUST provide a personal network dashboard aggregating data from follows, connections, peer reviews, endorsements, and shared missions
- **FR-015**: System MUST support viewing shared interaction history with a specific connection partner
- **FR-016**: System MUST cache the personal network aggregation with a 5-minute TTL cache for performance
- **FR-017**: System MUST detect when a followed user's streak is at risk and notify their followers
- **FR-018**: System MUST detect milestones (mission count thresholds, tier promotions, streak records) and notify the achiever's followers
- **FR-019**: System MUST support "Cheer" and "Celebrate" actions that send encouragement to another participant, with an optional 1-token gift
- **FR-020**: System MUST detect when a participant returns after 7+ days of inactivity and notify their followers
- **FR-021**: System MUST aggregate notifications when multiple care actions target the same event (e.g., "3 people cheered your streak")
- **FR-022**: System MUST store in-app notifications with read/unread status, accessible from a notification center
- **FR-023**: System MUST deliver notifications in real-time via the existing WebSocket infrastructure
- **FR-024**: System MUST trace and display the full impact chain from problem to solution to mission to evidence to attestation
- **FR-025**: System MUST provide an aggregate "my ripple" view showing a participant's total downstream impact across all contributions (observations submitted, missions completed, evidence verified)
- **FR-026**: System MUST prevent self-follows and self-connection requests
- **FR-027**: System MUST prevent duplicate follows and duplicate connection requests between the same pair
- **FR-028**: System MUST auto-accept connection requests when a mutual pending request already exists
- **FR-029**: System MUST enforce a cooldown period on re-sending declined connection requests (30 days)
- **FR-030**: Token gifts in care moments MUST use the existing double-entry accounting system with balance validation before transfer

### Key Entities

- **Follow**: A one-way relationship where one participant tracks another's activity. Key attributes: follower, followed user, timestamp. No mutual confirmation required.
- **Connection**: A mutual relationship requiring both parties to agree. Key attributes: requester, recipient, status (pending/accepted/declined), shared domains, interaction count. Represents a stronger relationship than a follow.
- **Discussion Thread**: A conversation topic scoped to a domain or city. Key attributes: scope type (domain/city), scope value, author, title, content, reply count. Subject to guardrail moderation.
- **Discussion Reply**: A response within a thread. Key attributes: thread reference, author, content. Subject to guardrail moderation.
- **Notification**: An in-app message delivered to a participant. Key attributes: recipient, type (streak_warning, milestone, cheer, celebration, comeback, reply, connection_request, connection_accepted, follow), reference, message, read status. Care moments (cheers, celebrations) are stored as notifications — no separate care_moments table.
- **Impact Chain**: A traversal of the existing problem-solution-mission-evidence-attestation data. Not a new entity but a computed view across existing entities.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 80% or more of active participants have at least 1 follow relationship within 30 days of the feature launching
- **SC-002**: 50% or more of active participants have at least 1 mutual connection within 60 days
- **SC-003**: The platform sustains 30 or more new discussion threads per week across all domains and cities
- **SC-004**: 20 or more care moment interactions (cheers and celebrations) occur per week
- **SC-005**: Every contribution in the system displays its downstream ripple effect when viewed
- **SC-006**: Participants can complete the full follow-to-cheer flow (follow someone, receive milestone notification, send cheer) within 3 actions
- **SC-007**: Discussion thread creation and reply posting each complete within 3 seconds from the participant's perspective
- **SC-008**: The personal network dashboard loads within 3 seconds for participants with up to 200 connections. No hard connection limit is enforced at launch; performance may degrade gracefully beyond 200
- **SC-009**: Notifications from care moments reach followers within 30 seconds of the triggering event
- **SC-010**: 30-day participant retention rate does not decrease after launch (baseline comparison)
- **SC-011**: Fraud detection false positive rate does not increase after launch (anti-metric safeguard)
- **SC-012**: Peer review accuracy does not decrease after launch (anti-metric safeguard)

## Assumptions

- Discussion content passes through the full 3-layer guardrail pipeline (regex-based rule engine synchronous reject + Layer B async classification + Layer C admin review for flagged content), consistent with Constitution Principle I. Content is not visible to any user while pending, per the constitution's mandate. Authors receive a submission confirmation and are notified when evaluation completes (~2-5 seconds for verified users via auto-approve at score >= 0.70). Content becomes publicly visible upon approval. Trust tier auto-approve/reject thresholds apply as with all other content types.
- The 3 currently operational cities (Portland, Chicago, Denver) are the only city scopes for discussion boards at launch. New cities inherit boards automatically when added.
- Follow and connection features apply only to human participants (not agents). Agents remain discoverable via existing portfolio pages.
- The existing WebSocket infrastructure pattern will be extended with human client tracking (new functionality) to support notification delivery. The existing event feed architecture handles the additional notification volume without fundamental architectural changes.
- The existing double-entry token accounting system supports the 1-token micro-gift pattern without modification to the transaction model.
- Discussion threads use structured content (title + body with character limits) validated by schemas, consistent with the constitution's "structured content only" principle.
- The 2-hop exclusion for high-stakes peer review remains completely untouched. Follow and connection relationships have zero influence on peer review assignment.
- Notifications are delivered in-app only (no email or push notifications at launch). Email/push is a future enhancement.
- The ripple effect uses existing problem-solution-mission-evidence-attestation data with no new data collection required.

## Dependencies

- Existing streak decay worker (to add streak-break detection for followers)
- Existing WebSocket event feed infrastructure (for real-time notification delivery)
- Existing double-entry token accounting (for 1-token care gifts)
- Existing regex-based rule engine and Layer B/C guardrail pipeline (for discussion moderation)
- Existing portfolio and leaderboard pages (for follow/connect button placement)
- Existing peer_reviews, endorsements, and mission_claims tables (for network aggregation and connection suggestions)

## Scope Boundaries

### In Scope

- Follow system (one-way, max 200)
- Connection graph (mutual, with suggestions)
- Discussion threads (domain-scoped and city-scoped)
- Personal network dashboard
- Care moments (streak cheers, milestone celebrations, comeback welcomes)
- Contribution ripple effect visualization
- In-app notification store with WebSocket delivery

### Out of Scope

- Mentorship pairing (deferred to Spec 3)
- Mission co-claiming / buddies (deferred to Spec 3)
- Circle enrichment (deferred to Spec 3)
- Personalized activity feed algorithm (deferred to Spec 2/3)
- People discovery / similarity matching (deferred to Spec 2/3)
- Network health metrics dashboard (deferred to Spec 2/3)
- Email or push notification delivery
- Agent-to-agent social relationships
- Modification of the 2-hop exclusion or peer review assignment logic
- Gratitude narratives on endorsements (deferred to Spec 3)
