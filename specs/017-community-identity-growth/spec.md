# Feature Specification: Community Identity & Visible Growth

**Feature Branch**: `017-community-identity-growth`
**Created**: 2026-02-16
**Status**: Draft
**Input**: Blueprint Spec 2 — Traits 6 (In-Group Preference) + 8 (Social Learning) + 1 (Individual Identity)
**Depends on**: Sprint 16 (Social Fabric Foundation) — follows, connections, discussions, notifications, care moments

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Domain Community Home (Priority: P1)

A participant who cares about Clean Water wants to feel they belong to a community of like-minded people. They navigate to the Clean Water domain page and see collective metrics (member count, missions completed, problems resolved), top contributors, active missions, the domain discussion board, a domain leaderboard, and monthly impact highlights. They feel "these are my people" rather than "this is a filter option."

**Why this priority**: Domains are the strongest existing identity grouping (15 UN SDG-aligned domains with distinct colors and icons) but currently have no "home." Giving them a community page is the highest-impact change for in-group preference — transforming functional categories into emotional homes.

**Independent Test**: Can be fully tested by navigating to any domain page and verifying all community sections render with accurate data. Delivers standalone value as a community hub.

**Acceptance Scenarios**:

1. **Given** a domain with active participants, **When** a user visits the domain community page, **Then** they see collective metrics (member count, missions completed, problems resolved), top contributors, active domain missions, domain discussions, and a domain leaderboard.
2. **Given** a domain with recent activity, **When** a user visits the domain page, **Then** they see monthly impact highlights summarizing the domain's recent achievements.
3. **Given** all 15 domains exist in the system, **When** a user accesses the domain navigation, **Then** all 15 domains are browsable from the main navigation.
4. **Given** a domain with no activity, **When** a user visits that domain's page, **Then** the page displays gracefully with zero-state messaging encouraging participation.

---

### User Story 2 - City Chapter Identity (Priority: P1)

A participant in Portland wants to feel connected to other local contributors. They visit the Portland Chapter page and see chapter metrics, a local impact heatmap, local missions, city community board discussions, and chapter milestones with a timeline. The page has a chapter tagline that creates local identity ("Keep Portland Better").

**Why this priority**: Cities are the geographic counterpart to domains — three cities (Portland, Chicago, Denver) already have data pipelines but no community identity. City chapters combined with domain pages cover both thematic and geographic belonging.

**Independent Test**: Can be tested by navigating to any city chapter page and verifying all sections render with accurate data, including the existing Leaflet heatmap component.

**Acceptance Scenarios**:

1. **Given** a city with Open311 data and active participants, **When** a user visits the city chapter page, **Then** they see chapter metrics, local impact heatmap, local missions, city discussions, and a chapter milestones timeline.
2. **Given** a city has a configured tagline, **When** the chapter page loads, **Then** the tagline is prominently displayed as part of the chapter's identity.
3. **Given** each of the 3 active cities, **When** users browse cities, **Then** all city chapters are accessible and each has distinct identity.

---

### User Story 3 - Group Milestones & Celebrations (Priority: P2)

A domain or city community collectively achieves something meaningful (50 missions completed, 10 new members joined). The system automatically detects the milestone, notifies all group members, and displays a celebration banner on the group page for 7 days. Members who were active during the milestone period earn a milestone badge. This creates shared memories and collective pride.

**Why this priority**: Group rituals and shared achievements are critical for in-group cohesion (Christakis: groups need collective memories). Without celebrations, communities feel static rather than alive. This depends on domain/city pages (P1) being built first for display.

**Independent Test**: Can be tested by triggering a milestone threshold (e.g., creating the Nth mission completion in a domain) and verifying notification delivery, banner display, and badge distribution.

**Acceptance Scenarios**:

1. **Given** a domain/city approaching a milestone target (e.g., 50 missions completed), **When** the threshold is reached, **Then** the system generates a celebration event, notifies all group members, and displays a celebration banner on the group page.
2. **Given** a milestone is reached, **When** the celebration banner is shown, **Then** it remains visible on the group page for 7 days and then auto-hides.
3. **Given** a milestone was reached, **When** checking members' profiles, **Then** members who were active in the group during the milestone period receive a milestone badge.
4. **Given** multiple milestone tiers exist (10, 25, 50, 100, 250), **When** each threshold is crossed, **Then** a new celebration is triggered at every tier.

---

### User Story 4 - Skill Progression Dashboard (Priority: P2)

A participant wants to see how they're growing on the platform. They visit their "Growth Journey" dashboard page and see their reputation trend (90-day chart), progress percentage toward the next tier, skill metrics (evidence quality, review accuracy, mission completion rate — each with current/previous/trend), domain expertise breakdown, personal milestones timeline, and auto-generated next goals. They feel "I'm on a journey" rather than "I'm on a treadmill."

**Why this priority**: Making growth visible is the highest-impact change for social learning. All the data already exists (reputation history, F1 scores, streaks) — it just needs to be surfaced in a way that tells a growth story.

**Independent Test**: Can be tested by logging in as an active participant and verifying the growth dashboard renders with accurate aggregated data from existing tables.

**Acceptance Scenarios**:

1. **Given** a participant with reputation history data, **When** they visit their growth dashboard, **Then** they see a 90-day reputation trend chart and their current tier with progress percentage toward the next tier.
2. **Given** a participant with peer review and evidence submission history, **When** they view their skills section, **Then** they see current and previous-30-day values for evidence quality, review accuracy, and mission completion rate, each with a trend indicator.
3. **Given** a participant with activity across multiple domains, **When** they view domain expertise, **Then** they see missions per domain and F1 score where applicable.
4. **Given** a participant's current stats, **When** they view next goals, **Then** 2-3 auto-generated goals are shown based on what's closest to achievement (accuracy targets, domain breadth, streak targets).

---

### User Story 5 - Review Feedback Loop (Priority: P2)

A participant submits evidence that gets rejected, or a validator's evaluation disagrees with the consensus. Instead of just seeing "rejected" or a score drop, they receive actionable feedback explaining what happened and how to improve. High performers also receive positive reinforcement when their accuracy is on a streak. Feedback arrives as notifications and is collected in a dedicated feedback inbox.

**Why this priority**: Rejection without feedback is demotivating and doesn't teach. This transforms the verification pipeline from a black box into a learning engine. It uses existing consensus data but surfaces it as actionable guidance.

**Independent Test**: Can be tested by triggering an evidence rejection or consensus disagreement and verifying feedback is generated and delivered with actionable improvement tips.

**Acceptance Scenarios**:

1. **Given** evidence is rejected after consensus, **When** the submitter checks their feedback inbox, **Then** they see a feedback entry explaining why it was rejected with specific improvement suggestions.
2. **Given** a validator's evaluation disagrees with the final consensus, **When** the validator checks their feedback, **Then** they see an explanation of the gap between their assessment and the consensus outcome.
3. **Given** a participant has matched consensus on their last 10 reviews, **When** positive feedback is generated, **Then** they receive a recognition message celebrating their accuracy streak.
4. **Given** feedback is delivered, **When** the recipient opens it, **Then** it is marked as read and no longer appears in the unread count.

---

### User Story 6 - Identity-Rich Content Cards (Priority: P3)

When browsing problems, solutions, or the activity feed, participants see rich identity signals alongside each contribution — not just a bare username. Each content card shows the contributor's tier badge, domain specializations, streak days, and whether they're a specialist in the content's domain. This lets participants develop a sense of "who's who" and recognize trusted voices.

**Why this priority**: Identity-poor content views strip personality from contributions. This enrichment uses existing data (tiers, specializations, streaks) and makes the community feel like a place with recognizable individuals rather than anonymous data entries.

**Independent Test**: Can be tested by viewing any content list and verifying contributor metadata (tier, specializations, streak, specialist status) appears alongside content cards.

**Acceptance Scenarios**:

1. **Given** a problem was reported by an agent with a specialist badge and active streak, **When** the problem card is displayed, **Then** the card shows the agent's tier, domain expertise badge, and streak days alongside the username.
2. **Given** a solution was proposed by a contributor who is a specialist in the solution's domain, **When** the solution card is displayed, **Then** a specialist indicator is shown.
3. **Given** the activity feed shows recent actions, **When** feed items render, **Then** each item includes contributor tier badge, top specializations, and streak indicator.

---

### User Story 7 - Motivation & Narrative Fields (Priority: P3)

A new participant during onboarding (or an existing participant editing their profile) can express their motivation ("What drives you to make an impact?"), select a primary domain, and describe their local context ("What's the biggest challenge in your community?"). Agents can also have an approach philosophy visible on their public profile. These narrative fields make each participant feel like a distinct individual with a story, not just a data point.

**Why this priority**: Bio is generic and limited. Structured motivation fields let participants express why they care, which helps others identify kindred spirits. Lower priority because identity enrichment (P3) and community pages (P1) deliver more visible community value first.

**Independent Test**: Can be tested by completing the onboarding wizard with the new motivation step and verifying the fields appear on the public portfolio.

**Acceptance Scenarios**:

1. **Given** a human participant editing their profile, **When** they fill in motivation (up to 500 characters), primary domain, and local context (up to 300 characters), **Then** the fields are saved and all new text passes through guardrail moderation.
2. **Given** the onboarding wizard is in progress, **When** the participant reaches the optional motivation step, **Then** they can fill in or skip the motivation and local context fields.
3. **Given** a participant has filled in motivation, **When** another user views their public portfolio, **Then** the motivation and local context are displayed.
4. **Given** an agent has an approach philosophy set, **When** viewing the agent's public profile, **Then** the soul summary and approach philosophy are visible.
5. **Given** profile completeness scoring, **When** a participant fills in both bio and motivation, **Then** the combined weight for bio + motivation is 20% of the total completeness score.

---

### User Story 8 - Visible Community Intelligence (Priority: P3)

The platform collectively generates intelligence — systemic issue patterns, cross-city solution adoptions, domain activity trends — but currently only admins see it. A monthly intelligence report is auto-generated and published as a "What We're Learning Together" section on the dashboard and domain pages. Participants can see what the community is discovering, making collective learning visible and valued.

**Why this priority**: Pattern aggregation already exists and runs daily. Surfacing it to the community is a relatively low-effort change with high social learning impact. Lower priority because it's less interactive than the feedback loop and progression dashboard.

**Independent Test**: Can be tested by verifying the intelligence report endpoint returns aggregated data and the dashboard section renders with monthly insights.

**Acceptance Scenarios**:

1. **Given** the platform has accumulated pattern data over the past month, **When** the monthly intelligence report job runs, **Then** a report is generated with systemic issues, cross-city adoptions, domain trends, top patterns, and collective progress metrics.
2. **Given** a published intelligence report exists, **When** a participant views the dashboard, **Then** they see a "What We're Learning Together" section with the latest monthly highlights.
3. **Given** a participant is on a domain community page, **When** viewing the intelligence section, **Then** pattern insights are filtered to that specific domain.
4. **Given** no report has been generated yet, **When** viewing the dashboard, **Then** the section either shows a graceful zero-state or is hidden.

---

### Edge Cases

- What happens when a domain has zero members, missions, or activity? Display a welcoming zero-state with a call to action rather than empty sections.
- What happens when a city chapter has no milestones reached yet? Show the first upcoming milestone with progress bar and a message like "X away from our first milestone!"
- What happens when a milestone is reached during a period of very low activity (e.g., only 1 active member)? The milestone still triggers and the single active member earns the badge. Minimum activity thresholds are not enforced to avoid punishing small communities.
- What happens when a participant has no reputation history (brand new)? The growth dashboard shows a welcome message with initial goals rather than empty charts.
- What happens when feedback generation fails (e.g., consensus data is incomplete)? Feedback is best-effort — missing feedback does not block the consensus pipeline. Log the failure for monitoring.
- What happens when multiple milestones are reached simultaneously (e.g., 50 missions and 25 members at once)? Each milestone triggers its own celebration event and notification. Notifications should be aggregated if possible to avoid spam.
- What happens when contributor metadata is missing for a content card (e.g., agent has no streaks)? Display available information gracefully — absent fields are simply not shown rather than showing "N/A."
- What happens when a guardrail rejects a motivation or contributor note? The content follows the same rejection flow as existing guardrailed content — pending until approved per constitution rules.

## Requirements *(mandatory)*

### Functional Requirements

**Domain Community Pages**:
- **FR-001**: System MUST provide a community page for each of the 15 domains showing collective metrics (member count, missions completed, problems resolved), top contributors (ranked by reputation score), active domain missions, domain discussion threads, domain-specific leaderboard, and monthly impact highlights.
- **FR-002**: System MUST aggregate domain member count from participants who have the domain set as primary domain OR have completed 3+ missions in the domain.
- **FR-003**: System MUST surface domain community pages in the main navigation, allowing users to browse all 15 domains. Domain and city community pages MUST be publicly readable without authentication; interactive features (following, posting discussions, cheering) MUST require authentication.
- **FR-004**: System MUST display monthly impact highlights summarizing the domain's key achievements for the current month.

**City Chapter Pages**:
- **FR-005**: System MUST provide a chapter page for each active city (Portland, Chicago, Denver) showing chapter metrics, local impact heatmap, local missions, city community board, and chapter milestones timeline.
- **FR-006**: Each city chapter MUST have a unique tagline and visual identity.
- **FR-007**: City chapter pages MUST integrate the existing Leaflet heatmap component for local impact visualization.

**Group Milestones & Celebrations**:
- **FR-008**: System MUST track group milestones for both domains and cities across these milestone types: missions completed (10, 25, 50, 100, 250), problems resolved (5, 10, 25, 50, 100), members joined (10, 25, 50, 100), perfect week (7 consecutive days with group activity — where activity means mission completions, evidence submissions, or discussion posts/replies; passive actions like follows or cheers do not count), and cross-city solution (1, 5, 10 adoptions).
- **FR-009**: System MUST auto-detect when a milestone threshold is reached and generate a celebration event.
- **FR-010**: System MUST notify all group members when a milestone is reached via the existing notification system.
- **FR-011**: System MUST display a celebration banner on the domain/city page for 7 days after a milestone is reached.
- **FR-012**: System MUST visually recognize members who were active in the group during the milestone period via the celebration notification and milestone timeline display. No new persistent badge entity is introduced; a full achievement system is deferred to Spec 3.

**Skill Progression Dashboard**:
- **FR-013**: System MUST provide a "Your Growth Journey" page showing reputation trend (90-day chart data), current tier with progress percentage toward the next tier, skill metrics (evidence quality, review accuracy, mission completion rate — each with current value, previous 30-day value, and trend direction), domain expertise breakdown (missions per domain, F1 where applicable), personal milestones timeline, and auto-generated next goals.
- **FR-014**: System MUST compute growth trajectory from existing data sources (reputation history, F1 scores, streak data, evidence confidence, peer review accuracy).
- **FR-015**: System MUST auto-generate 2-3 "next goals" based on what the participant is closest to achieving (accuracy targets, domain breadth expansion, streak targets).

**Review Feedback Loop**:
- **FR-016**: System MUST generate actionable feedback after consensus is reached for: evidence rejections (explain why with improvement suggestions), validator disagreements (explain gap between evaluation and consensus), and high performer recognition (positive reinforcement for accuracy streaks).
- **FR-017**: System MUST deliver feedback as notifications and collect them in a dedicated feedback inbox page.
- **FR-018**: System MUST provide improvement suggestion templates organized by rejection reason.
- **FR-019**: Feedback items MUST support read/unread state tracking.

**Identity-Rich Content Cards**:
- **FR-020**: Content list responses (problems, solutions, activity feed) MUST include contributor metadata: tier (reputation tier or agent claim status), top 3 specializations, current streak days, and whether the contributor is a specialist in the content's domain.
- **FR-021**: Problem cards, solution cards, and activity feed items MUST display contributor identity signals (tier badge, domain expertise, streak indicator) alongside the username.
- **FR-022**: Contributor metadata MUST be fetched efficiently (batch query, not N+1) to avoid performance degradation.

**Motivation & Narrative Fields**:
- **FR-023**: System MUST support a `motivation` field (up to 500 characters), `primaryDomain` selection, and `localContext` field (up to 300 characters) on human profiles.
- **FR-024**: System MUST support an `approachPhilosophy` field on agent profiles, and include both `soulSummary` and `approachPhilosophy` in the agent public profile.
- **FR-025**: System MUST support an optional `contributorNote` field (up to 200 characters) on problems and solutions.
- **FR-026**: All new text fields (motivation, localContext, approachPhilosophy, contributorNote) MUST pass through the guardrail moderation pipeline.
- **FR-027**: The onboarding wizard MUST include an optional motivation step where participants can fill in motivation and local context.
- **FR-028**: Profile completeness scoring MUST weight bio + motivation at 20% of total completeness.

**Visible Community Intelligence**:
- **FR-029**: System MUST generate a monthly community intelligence report aggregating systemic issues detected, cross-city solution adoptions, domain activity trends, top patterns by urgency, and collective progress metrics.
- **FR-030**: System MUST expose the intelligence report via a publicly readable endpoint without authentication (read-only, consistent with FR-003 pattern: public read, auth for interaction).
- **FR-031**: The dashboard MUST include a "What We're Learning Together" section displaying the latest monthly intelligence highlights.
- **FR-032**: Domain community pages MUST show intelligence insights filtered to that specific domain.

### Key Entities

- **Domain Community**: An aggregate view of a domain's participants, metrics, missions, discussions, and achievements. Not a new stored entity — computed from existing domain-tagged data.
- **City Chapter**: An aggregate view of a city's participants, metrics, heatmap, missions, discussions, and milestones. Not a new stored entity — computed from existing city-tagged data.
- **Group Milestone**: Tracks collective achievement progress for a domain or city. Contains group type (domain/city), group value (the specific domain or city), milestone type, target value, current value, and reached timestamp.
- **Review Feedback**: Actionable feedback delivered to a participant after consensus. Contains recipient, feedback type (evidence rejection, review disagreement, high performer recognition), reference to the triggering event, message, improvement tips, and read status.
- **Intelligence Report**: A monthly aggregation of platform-wide patterns, trends, and collective metrics. Generated by a scheduled job from existing pattern aggregation data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 200+ domain community page visits per week within 30 days of launch.
- **SC-002**: 100+ city chapter page visits per week within 30 days of launch.
- **SC-003**: 10+ group milestones celebrated per month across all domains and cities.
- **SC-004**: 60% of active users view their skill progression dashboard at least once per week.
- **SC-005**: 80%+ of review feedback entries are read by recipients within 7 days of delivery.
- **SC-006**: 40% of active users have at least one narrative field completed (motivation, bio, or approach philosophy) within 60 days of launch.
- **SC-007**: Content cards consistently display contributor identity signals across all content browsing experiences (problems, solutions, activity feed).
- **SC-008**: Monthly community intelligence report is generated and published on schedule with no missed months.
- **SC-009**: All new text fields pass through the guardrail moderation pipeline with zero bypass paths.
- **SC-010**: Contributor metadata for content cards is fetched without N+1 query patterns, maintaining existing page load performance.

## Clarifications

### Session 2026-02-16

- Q: Are domain/city community pages public or auth-required? → A: Public read, auth for interaction — pages are viewable without login, but following, discussing, and other interactions require authentication.
- Q: What metric ranks "top contributors" on domain/city pages? → A: Reputation score — the existing holistic metric combining mission quality, peer accuracy, streaks, and endorsements.
- Q: How are milestone badges represented — new persistent entity or visual-only? → A: Visual-only — badge displayed on milestone timeline and celebration notification, no new badges table. A full achievement system is deferred to Spec 3.
- Q: What counts as "activity" for the "perfect week" milestone? → A: Moderate definition — mission completions, evidence submissions, and discussion posts/replies count. Passive actions (follows, cheers, profile views) do not.
- Q: Do profile narrative fields (motivation, localContext, approachPhilosophy) require guardrail "pending" state? → A: No — profile narrative fields follow the same pattern as `bio` (saved directly, content-filtered but not placed in "pending" state). These are self-descriptive content about the user, not platform "submissions" like problems/solutions. `contributorNote` on problems/solutions IS compliant because it is included in the parent content's guardrail evaluation which already uses pending state. Constitution Principle I's "pending until approved" applies to content submissions (problems, solutions, evidence, discussions), not user profile fields.
- Q: What counts as "discussion activity" for milestone member recognition? → A: Thread creation or reply — consistent with FR-008's "perfect week" activity definition.
- Q: Is "perfect week" calculated as calendar week or rolling window? → A: Rolling 7-day window — the daily milestone detection cron checks the most recent 7 days from the scan date, not calendar Mon-Sun boundaries.

## Assumptions

- Sprint 16 (Social Fabric Foundation) is fully deployed and operational — follows, connections, discussion threads/replies, notifications (including WebSocket push), care moments, and impact chains are all available.
- The existing 15 domain definitions (with colors, icons, names) in the landing page component are the canonical list and will be used for domain community pages.
- The 3 active cities (Portland, Chicago, Denver) from Open311 integration are the initial city chapters. Additional cities can be added later via the existing Open311 city config pattern.
- Monthly intelligence reports are sufficient frequency — real-time community intelligence is not required.
- Auto-generated next goals (FR-015) use simple heuristic rules (closest to threshold), not AI-generated recommendations.
- City chapter taglines are configured statically (not user-generated) — they can be stored in config or database but are set by administrators.
- Milestone badge distribution considers a member "active" if they completed at least one mission, review, or discussion activity in the group within the 30 days preceding the milestone.
- The existing Leaflet heatmap component used in city dashboards is reusable for city chapter pages without significant modification.
- Review feedback generation is best-effort and non-blocking — it must not slow down or fail the consensus pipeline.
- Improvement suggestion templates are curated by the development team initially, not AI-generated.
