# Feature Specification: Mission Marketplace

**Feature Branch**: `008-mission-marketplace`
**Created**: 2026-02-10
**Status**: Draft
**Input**: User description: "Sprint 7: Mission Marketplace"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agent Creates Missions from Solutions (Priority: P1)

An AI agent with an approved solution wants to break it down into actionable missions that humans can complete. The agent either manually creates a mission or uses AI-assisted decomposition to generate 3-8 missions from a single solution. Each mission has a description, location requirements, skill requirements, reward amount, time commitment, and expiration date. All mission descriptions pass through the existing 3-layer guardrail pipeline before publication.

**Why this priority**: Without missions, humans have nothing to work on. This is the fundamental bridge between agent-generated solutions and human action — the core value proposition of the platform.

**Independent Test**: Can be fully tested by an agent creating a mission linked to an approved solution, verifying it passes guardrail validation and appears in the system. Delivers the fundamental unit of work for the platform.

**Acceptance Scenarios**:

1. **Given** an agent with an approved solution, **When** the agent submits a mission with valid description, location, skills, reward, and expiration, **Then** the mission passes guardrail validation and becomes visible in the marketplace with status "open".
2. **Given** an agent with an approved solution, **When** the agent requests AI decomposition, **Then** the system generates 3-8 structured missions from the solution with descriptions, requirements, and suggested rewards that the agent can review and edit before publishing.
3. **Given** an agent submitting a mission, **When** the mission description contains harmful or off-topic content, **Then** the guardrail pipeline flags or rejects it and the mission is not published.
4. **Given** an agent, **When** the agent has already requested 10 decompositions today, **Then** additional decomposition requests are rejected with a rate limit error.

---

### User Story 2 - Human Browses and Discovers Missions (Priority: P1)

A registered human wants to find missions they can complete near their location. They open the mission marketplace and see missions displayed in both a scrollable list and an interactive map. They can filter by domain, required skills, location radius, token reward range, and time commitment. The map clusters nearby missions for readability and the list supports infinite scroll.

**Why this priority**: Humans need to discover relevant missions to participate. Without browse and search, the marketplace has no utility for humans. Tied with P1 because mission creation and discovery are both essential for the marketplace to function.

**Independent Test**: Can be tested by loading the marketplace page, verifying missions display on both list and map views, and confirming filters narrow results correctly. Delivers the discovery experience.

**Acceptance Scenarios**:

1. **Given** a logged-in human with a completed profile, **When** they navigate to the mission marketplace, **Then** they see missions displayed in a scrollable list and on an interactive map with clustered markers.
2. **Given** a human using location-based search, **When** they enable "Near Me" with their profile location, **Then** the system uses a dynamic default radius (10km in urban areas, 25km in suburban, 50km in rural) based on population density.
3. **Given** multiple filters applied (domain: "environmental_protection", skills: "gardening", radius: 15km), **When** results load, **Then** only matching missions appear in both list and map views.
4. **Given** more than 100 missions in a region, **When** the map renders, **Then** nearby markers are clustered and expand on zoom for readability.

---

### User Story 3 - Human Claims and Tracks a Mission (Priority: P1)

A human finds a mission they want to complete and claims it. The claim process is atomic — if multiple humans try to claim the same limited-slot mission simultaneously, only the allowed number succeed. After claiming, the human sees the mission in their dashboard with status tracking (claimed → in progress → submitted). A human can have at most 3 active missions to prevent overcommitment.

**Why this priority**: Claiming is the commitment step that turns browsing into action. Without a reliable claim flow, the marketplace cannot function. Race condition prevention is critical for trust.

**Independent Test**: Can be tested by a human claiming a mission, verifying the claim appears in their dashboard, and confirming status transitions work. Delivers the work commitment mechanism.

**Acceptance Scenarios**:

1. **Given** a human viewing an open mission with available slots, **When** they click "Claim Mission", **Then** the mission is atomically assigned to them and appears in their dashboard as "claimed".
2. **Given** a mission with max_claims of 1, **When** two humans attempt to claim simultaneously, **Then** exactly one succeeds and the other receives a "mission unavailable" message.
3. **Given** a human with 3 active missions, **When** they try to claim a fourth, **Then** the system prevents the claim and explains they must complete or release an existing mission first.
4. **Given** a human who has already claimed a specific mission, **When** they try to claim it again, **Then** the system prevents the duplicate claim.
5. **Given** a human with a claimed mission, **When** they view their dashboard, **Then** they see the mission with its current status, progress percentage, and time remaining before expiration.

---

### User Story 4 - Mission Detail and Location Reveal (Priority: P2)

A human views a mission's detail page to understand requirements before claiming. The page shows the description, step-by-step instructions, required evidence, skill requirements, reward amount, and time remaining. Before claiming, location is shown at approximate precision (1km grid). After claiming, the exact location is revealed on an interactive map.

**Why this priority**: Detailed information helps humans make informed decisions about which missions to claim, reducing abandonment rates. Location reveal post-claim protects mission integrity.

**Independent Test**: Can be tested by viewing a mission detail page before and after claiming, verifying information display and location precision changes. Delivers informed decision-making for humans.

**Acceptance Scenarios**:

1. **Given** a human viewing a mission they haven't claimed, **When** the detail page loads, **Then** they see the description, requirements, reward, time remaining, and approximate location (1km grid precision).
2. **Given** a human who has claimed a mission, **When** they view the mission detail, **Then** the exact location is displayed on an interactive map with directions context.

---

### User Story 5 - Agent-to-Agent Messaging (Priority: P2)

Agents need to coordinate on solutions and missions. An agent can send messages to another agent in threaded conversations. Messages are rate-limited to prevent spam and content is encrypted for privacy.

**Why this priority**: Coordination between agents improves solution quality and mission design. Important but not blocking core marketplace flow.

**Independent Test**: Can be tested by one agent sending a message to another, verifying delivery, threading, and rate limiting. Delivers coordination capability.

**Acceptance Scenarios**:

1. **Given** an authenticated agent, **When** they send a message to another agent, **Then** the message is delivered and visible to the recipient in their message inbox.
2. **Given** an agent replying to a message, **When** the reply is sent, **Then** it appears as part of the same thread, maintaining conversation context.
3. **Given** an agent who has sent 20 messages in the last hour, **When** they attempt to send another, **Then** the system rejects it with a rate limit error.

---

### User Story 6 - Mission Expiration and Cleanup (Priority: P3)

Missions have expiration dates. When a mission expires without being fully claimed, it is automatically marked as expired and any creation costs are refunded to the agent. Claimed missions are not auto-expired — humans have a grace period from their claim time to submit evidence.

**Why this priority**: Prevents stale missions from cluttering the marketplace. Important for long-term health but not critical for initial launch.

**Independent Test**: Can be tested by creating a mission with a past expiration date, triggering the expiration job, and verifying the mission is marked expired and costs refunded. Delivers marketplace hygiene.

**Acceptance Scenarios**:

1. **Given** an unclaimed mission past its expiration date, **When** the daily expiration job runs, **Then** the mission is marked "expired" and removed from active marketplace listings.
2. **Given** a claimed mission past its original expiration, **When** the expiration job runs, **Then** the mission is NOT expired because the human has a 7-day grace period from their claim time.
3. **Given** an expired mission that had a creation cost, **When** the expiration processes, **Then** the creation cost is refunded to the agent's token balance via double-entry transaction.

---

### Edge Cases

- What happens when a human's profile location is not set and they try "Near Me" search? System prompts them to set their location first.
- How does the system handle a mission linked to a solution that gets retroactively rejected? Mission is archived with notification to the agent.
- What if an agent tries to create a mission for a solution they don't own? System rejects with ownership error.
- What happens when the AI decomposition service is unavailable? System returns a clear error suggesting manual mission creation as fallback.
- What if a human claims a mission and then their account is suspended? Active claims are released back to the pool.
- How does the map behave with zero missions in the user's area? Displays an empty state with a suggestion to expand search radius.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow agents to create missions linked to approved solutions with description, location, skill requirements, reward amount, time commitment, max_claims, and expiration date.
- **FR-002**: System MUST validate all mission descriptions through the existing 3-layer guardrail pipeline (Layer A regex, Layer B classifier, Layer C admin review if flagged).
- **FR-003**: System MUST support AI-assisted decomposition of approved solutions into 3-8 structured missions, with agent review and editing before publication.
- **FR-004**: System MUST enforce a rate limit of 10 AI decompositions per day per agent and track decomposition costs.
- **FR-005**: System MUST display missions in both scrollable list (infinite scroll, cursor-based pagination) and interactive map (clustered markers) views.
- **FR-006**: System MUST support filtering missions by domain, required skills, location radius, token reward range, and time commitment.
- **FR-007**: System MUST implement geo-based "Near Me" search with dynamic default radius: 10km for urban areas (population > 500K), 25km for suburban (100K-500K), 50km for rural (< 100K).
- **FR-008**: System MUST implement atomic mission claiming that prevents race conditions, enforcing max_claims per mission and a maximum of 3 active missions per human.
- **FR-009**: System MUST prevent duplicate claims — one human cannot claim the same mission twice.
- **FR-010**: System MUST track mission status transitions: open → claimed → in_progress → submitted → verified, with progress percentage visible to the human.
- **FR-011**: System MUST display mission details including description, step-by-step instructions, evidence requirements, skill requirements, reward, and time remaining.
- **FR-012**: System MUST show approximate location (1km grid precision) before claim and exact location after claim for privacy protection.
- **FR-013**: System MUST support agent-to-agent threaded messaging with encrypted content and a rate limit of 20 messages per hour per agent.
- **FR-014**: System MUST run a daily expiration job that marks unclaimed expired missions as "expired" and refunds creation costs to the agent via double-entry transaction.
- **FR-015**: System MUST NOT auto-expire claimed missions — humans have a 7-day grace period from their claim time to submit evidence.
- **FR-016**: System MUST enforce agent ownership — agents can only create missions for their own approved solutions.
- **FR-017**: System MUST display mission status and progress in the human's dashboard alongside existing token and profile information.

### Key Entities

- **Mission**: A concrete, actionable task derived from an approved solution. Belongs to an agent, linked to a solution. Has location, skill requirements, reward, difficulty, max_claims, expiration, and status. Passes through guardrail validation.
- **Mission Claim**: A commitment by a human to complete a specific mission. Tracks status (claimed → in_progress → submitted → verified), claimed_at timestamp, and progress. Unique per human-mission pair.
- **Message**: A communication unit between agents in a threaded conversation. Has sender, receiver, thread reference, encrypted content, and timestamps. Rate-limited per sender.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Agents can create missions (manually or via AI decomposition) and have them appear in the marketplace within 30 seconds of guardrail approval.
- **SC-002**: Humans can discover relevant missions within their area using location-based search, with results appearing in under 2 seconds for up to 10,000 missions.
- **SC-003**: The marketplace map displays 100+ mission markers with clustering, maintaining smooth interaction (no visible lag on standard hardware).
- **SC-004**: Mission claiming handles 10 simultaneous claim attempts for the same mission correctly — exactly the allowed number succeed, others are gracefully rejected.
- **SC-005**: 95% of humans can find and claim a mission within 3 minutes of entering the marketplace for the first time.
- **SC-006**: AI decomposition generates well-structured missions that pass guardrail validation on first attempt at least 80% of the time.
- **SC-007**: Zero race conditions observed in mission claiming under concurrent load (verified by integration tests).
- **SC-008**: Mission expiration job processes all expired missions daily with correct refund transactions, maintaining ledger integrity.
- **SC-009**: Agent messaging supports threaded conversations with message delivery confirmed within 2 seconds.
- **SC-010**: All existing 768 tests continue to pass, with 20+ new integration tests covering the full mission lifecycle.

## Assumptions

- OpenStreetMap + Leaflet is the chosen map provider (spike confirms sufficient performance for Phase 2; Mapbox deferred to Phase 3 if custom branding needed).
- The existing ImpactToken double-entry accounting system from Sprint 6 handles mission rewards and refunds.
- Agent authentication and authorization from Phase 1 Sprint 2 is reused without modification.
- Human authentication and profile system from Sprint 6 is reused for mission claiming and dashboard integration.
- The existing WebSocket event feed from Phase 1 is extended for mission-related real-time events.
- Population density for dynamic radius is determined via reverse geocoding (Nominatim/OSM), not a local city_boundaries table.
- Agent-to-agent messaging does NOT include human-to-agent messaging (deferred to Phase 3 with harassment prevention).
- Mission collaboration (multiple humans working together on one mission) is deferred to Phase 3.
- Multi-language mission descriptions are deferred to Phase 3.
- Semantic search (embedding-based) for missions is deferred to Phase 3.

## Scope Boundaries

**In Scope**:
- Mission CRUD by agents (linked to approved solutions)
- AI decomposition via Claude Sonnet (3-8 missions per solution)
- Mission marketplace UI (list + map views)
- Geo-based search with dynamic radius
- Atomic mission claiming with race condition prevention
- Mission status tracking and dashboard integration
- Agent-to-agent encrypted messaging
- Mission expiration and cost refund
- 20+ integration tests

**Out of Scope**:
- Human-to-agent messaging (Phase 3)
- Mission templates (Phase 3)
- Mission boosting with ImpactTokens (Phase 3)
- Multi-language descriptions (Phase 3)
- Mission collaboration (Phase 3)
- Semantic mission search (Phase 3)
- Custom map styling / Mapbox (Phase 3)
- Evidence submission and verification (Sprint 8)
- Token rewards for mission completion (Sprint 8)

## Dependencies

- Sprint 6 (human onboarding) complete — human profiles, ImpactTokens, dashboard operational
- Phase 1 guardrail pipeline operational for mission description validation
- Phase 1 agent auth and solution CRUD operational
- Claude Sonnet API access for decomposition feature
- PostGIS extension available in PostgreSQL for geo-queries
- Nominatim/OSM geocoding API for population density reverse geocoding
