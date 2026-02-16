# Blueprint Implementation Roadmap

> **Date**: 2026-02-15
> **Last Updated**: 2026-02-16 (Spec 1 complete)
> **Source**: Blueprint Deep-Dive Documents 01-08
> **Purpose**: Development plan to raise BetterWorld's Social Suite score from B- to A-

---

## Current State

| # | Trait | Grade (Pre-Spec 1) | Post-Spec 1 | Target | Gap Severity |
|---|-------|---------------------|-------------|--------|-------------|
| 1 | Individual Identity | B+ | B+ | A | Low |
| 2 | Care Bonds | D | C+ | B | Medium (was Critical) |
| 3 | Friendship | D+ | B- | B+ | Low (was Critical) |
| 4 | Social Networks | C | B | A- | Medium (was High) |
| 5 | Cooperation | A | A | A+ | Low |
| 6 | In-Group Preference | B- | B | A- | Medium |
| 7 | Mild Hierarchy | A | A | A+ | Low |
| 8 | Social Learning | B | B | A | Medium |

**Overall: B- → Post-Spec 1: B+ → Target: A-**

### Spec 1 Grade Impact Notes

- **Care Bonds (D → C+)**: Follow system, care moments (streak cheers, milestone celebrations, comeback welcome), 1-token gift mechanism. Still needs mentorship pairing and mission buddies (Spec 3) for full B.
- **Friendship (D+ → B-)**: Connection graph with suggestions algorithm, low-stakes discussion spaces (domain + city boards), mutual connection model with shared history. Still needs circle enrichment and mission buddies (Spec 3) for B+.
- **Social Networks (C → B)**: Personal network dashboard, interaction history, contribution ripple effect visualization, connection/follower counts on profiles. Still needs personalized feed and people discovery (Spec 3) for A-.
- **In-Group Preference (B- → B)**: City and domain discussion boards create community interaction spaces. Still needs domain community pages, city chapters, and group milestones (Spec 2) for A-.

---

## Guiding Principles

1. **Bonds before features** — The #1 finding is that BetterWorld has strong atoms (participants, tokens, validations) but weak bonds (friendship, care, belonging). Every spec prioritizes relational infrastructure.
2. **Fraud prevention is non-negotiable** — The 2-hop exclusion and stranger-only peer review stay for high-stakes validation. New friendship features operate in parallel low-stakes channels.
3. **Structured expression, not free-form chaos** — The constitution requires structured content. New social features use structured schemas with guardrail integration — not unmoderated free text.
4. **Build once, use everywhere** — The follow system, connection graph, and discussion threads are foundational primitives reused across all three specs.

---

## Pre-Spec Quick Wins (< 1 Day, No Spec Needed)

Three changes that can ship as a standalone PR before kicking off the spec pipeline:

| # | Change | File(s) | Impact |
|---|--------|---------|--------|
| QW1 | Add `soulSummary` to `toPublicProfile()` | `apps/api/src/services/agent.service.ts` | Agent narratives become publicly visible |
| QW2 | Enrich ActivityFeed cards with tier badge + domain | `apps/web/src/components/ActivityFeed.tsx` | Identity signals in content views |
| QW3 | Make cross-city dashboard public (not admin-only) | `apps/api/src/routes/cross-city.routes.ts` | Community sees city comparisons |

**Estimated effort**: Half a day. Zero schema changes. Zero new dependencies.

---

## Spec 1: Social Fabric Foundation — COMPLETE

> **Status**: **COMPLETE** (Sprint 16, 2026-02-16) — 85/85 tasks, 6/6 user stories, 1429 tests passing
> **Branch**: `016-social-fabric-foundation`
> **Traits**: 2 (Care Bonds) + 3 (Friendship) + 4 (Social Networks) — core
> **Priority**: Critical — addresses the three lowest-graded traits (D, D+, C)
> **Actual scope**: 85 tasks across 10 phases, ~1 day with AI-assisted development
> **Assessment Priority**: #1 — "Build the Social Fabric"

### Objective

Create the relational infrastructure that transforms BetterWorld from a transactional platform (do task → get token → leave) into a community where participants know each other, care about each other's outcomes, and can see their place in the network.

### What Was Delivered

- **5 DB tables**: follows, connections, discussion_threads, discussion_replies, notifications (migration 0015_social_fabric)
- **7 services**: follow, connection (with suggestion algorithm), discussion (with full 3-layer guardrail pipeline), notification (with WebSocket push + aggregation), network (with Redis caching), care-moment (streak/milestone/comeback detection + token gifts), impact-chain (recursive traversal)
- **8 route files**: follows, connections, discussions, notifications, network, care-moments, impact, admin social-metrics
- **2 BullMQ workers**: care-moment (hourly streak-break scan + milestone detection), notification-retention (daily 90-day archival)
- **Human WebSocket**: `/ws/human` endpoint for real-time notification delivery
- **7 frontend pages**: notifications, discussions (board + thread), network dashboard, impact chain, connections
- **20 components**: FollowButton, ConnectButton, ConnectionsList, ConnectionSuggestions, ThreadList, ThreadDetail, NewThreadForm, ReplyForm, NotificationBell, NotificationList, NotificationItem, CheerButton, CelebrateButton, CareNotification, YourNetworkCard, ImpactRippleCard, ImpactChain, RippleSummary, plus discussion index
- **7 React Query hooks**: useFollows, useConnections, useDiscussions, useNotifications, useNetwork, useHumanWebSocket, useImpact
- **9 test files**: 175 new tests (follows, connections, discussions, notifications, care-moments, network, impact, connection-suggestions, care-moment-worker + frontend components)
- **1429 total tests passing** (up from 1254)

### Core Deliverables

#### 1.1 Follow System (Foundation for All Care Features)
**Source**: Trait 2, Design 2

- `follows` table (follower_human_id → following_human_id, unique pair)
- Follow/unfollow API routes
- Following/followers list endpoints (cursor pagination)
- Follow button on portfolio pages and leaderboard entries
- Follower count on public profiles
- Max 200 follows per user

**Why first**: Every care feature (streak cheers, milestone celebrations, mentorship notifications) depends on knowing who cares about whom. The follow system is the foundation.

#### 1.2 Connection Graph
**Source**: Trait 3, Design 1

- `connections` table (requester → recipient, status: pending/accepted/declined)
- Connection request/accept/decline API routes
- Connection suggestions algorithm:
  - Shared domains (×3 weight)
  - Same city (×2 weight)
  - Mutual peer reviews (×5 weight)
- "People you may know" dashboard card (3-5 suggestions)
- Connection list page with shared interaction history

**Depends on**: Follow system (connections and follows are complementary but independent — follows are one-way, connections are mutual)

#### 1.3 Low-Stakes Discussion Spaces
**Source**: Trait 3, Design 4

- `discussion_threads` table (scope_type: domain|city, scope_value, title, content)
- `discussion_replies` table (thread_id, content)
- Thread CRUD API routes with Layer A guardrail moderation
- Domain discussion pages (15 domains)
- City community boards (3 cities: Portland, Chicago, Denver)
- Reply notifications to thread participants
- Rate limits: 10 threads/day, 50 replies/day per user

**Key architectural decision**: These are LOW-STAKES spaces where repeated interaction is encouraged. The 2-hop exclusion applies only to HIGH-STAKES peer review. This dual-track approach preserves fraud prevention while enabling friendship formation.

#### 1.4 Personal Network Dashboard
**Source**: Trait 4, Design 1

- Network aggregation service (query across peer_reviews, endorsements, connections)
- `GET /network/me` endpoint with Redis caching (5-min TTL)
- `GET /network/me/interactions?partnerId=:id` for shared history detail
- "Your Network" dashboard card showing connection count, shared domains, cities
- Full network page with interaction history per connection

#### 1.5 Care Moments
**Source**: Trait 2, Design 4

- Streak-break detection in existing streak decay worker (notify followers when streak at risk)
- Milestone detection service (mission count thresholds, tier promotions, streak records)
- "Cheer" action: send encouragement + optional 1-token gift
- "Celebrate" action: react to milestone with optional 1-token gift
- Notification delivery via WebSocket + in-app notification store
- Comeback welcome: notify followers when someone returns after 7+ days

#### 1.6 Contribution Ripple Effect
**Source**: Trait 4, Design 3

- Impact chain traversal service (recursive query: problem → solution → mission → evidence)
- `GET /impact/chain/:problemId` — full chain with participants
- `GET /impact/my-ripple` — aggregate impact across all contributions
- "Your Impact Ripple" dashboard card
- Chain visualization: problem → solution → missions → evidence → attestations

### New Database Tables

| Table | Columns | Purpose |
|-------|---------|---------|
| `follows` | follower_human_id, following_human_id, created_at | One-way follow relationships |
| `connections` | requester_human_id, recipient_human_id, status, shared_domains, interaction_count | Mutual connections |
| `discussion_threads` | scope_type, scope_value, author_human_id, title, content, reply_count | Domain/city discussions |
| `discussion_replies` | thread_id, author_human_id, content | Thread replies |
| `notifications` | recipient_human_id, type, reference_id, message, is_read | In-app notification store |

### Dependency Graph

```
follows ──────────────┐
                      ├──→ care moments (streak cheers, celebrations)
connections ──────────┤
                      ├──→ personal network dashboard
discussion_threads ───┤
                      └──→ connection suggestions (shared activity feeds into algorithm)

contribution ripple ──→ standalone (uses existing problem/solution/mission/evidence tables)
```

### Success Criteria

- 80%+ of active users have 1+ follow within 30 days
- 50%+ of active users have 1+ mutual connection within 60 days
- 30+ discussion threads per week across domains/cities
- 20+ care moment interactions (cheers/celebrations) per week
- Every contribution shows its downstream ripple effect

---

## Spec 2: Community Identity & Visible Growth

> **Traits**: 6 (In-Group Preference) + 8 (Social Learning) + 1 (Individual Identity)
> **Priority**: High — addresses the "emotional home" and "visible learning" gaps
> **Estimated scope**: 50-60 tasks, ~2-3 weeks
> **Assessment Priority**: #2 + #3 + #4
> **Depends on**: Spec 1 (domain discussions + city boards integrated into community pages)

### Objective

Give domains and cities emotional identity (not just functional categories), make participant growth visible and celebrated, and deepen individual identity expression.

### Core Deliverables

#### 2.1 Domain Community Pages
**Source**: Trait 6, Design 1

- Domain community stats aggregation service (members, missions completed, problems resolved)
- `GET /domains/:domain/community` API endpoint
- Domain page with:
  - Collective metrics (member count, missions completed, problems resolved)
  - Top contributors for the domain
  - Active missions filtered to domain
  - Domain discussion threads (from Spec 1)
  - Domain-specific leaderboard
  - Monthly impact highlights
- Domain page navigation in main nav (15 domains)

#### 2.2 City Chapter Pages
**Source**: Trait 6, Design 2

- City chapter stats aggregation service
- `GET /cities/:city/chapter` API endpoint
- City page with:
  - Chapter metrics
  - Local impact heatmap (existing Leaflet component)
  - Local missions
  - City community board (from Spec 1)
  - Chapter milestones timeline
- City chapter taglines and identity

#### 2.3 Group Milestones & Celebrations
**Source**: Trait 6, Design 3

- `group_milestones` table (group_type, group_value, milestone_type, target, current, reached_at)
- Milestone tracking service (increment on mission completion, problem resolution, member join)
- Milestone types: missions completed (10/25/50/100/250), problems resolved, members joined, perfect week, cross-city solution
- Celebration event generation + notification to group members
- Celebration banner on domain/city pages (7-day display)
- Milestone badge distribution to active group members

#### 2.4 Skill Progression Dashboard
**Source**: Trait 8, Design 1

- Growth trajectory computation service (aggregate from reputation history, F1 scores, streaks)
- `GET /learning/my-progress` endpoint with:
  - Reputation trend (90-day chart data)
  - Tier progress percentage toward next tier
  - Skill metrics: evidence quality, review accuracy, mission completion rate — each with current/previous/trend
  - Domain expertise breakdown (missions per domain, F1 where applicable)
  - Personal milestones timeline
  - Next goals (auto-generated: accuracy target, domain breadth, streak target)
- "Your Growth Journey" dashboard page

#### 2.5 Review Feedback Loop
**Source**: Trait 8, Design 3

- `review_feedback` table (recipient_human_id, feedback_type, reference_id, message, improvement_tips, is_read)
- Post-consensus feedback generation:
  - Evidence rejections: explain why + improvement suggestions
  - Validator disagreements: explain gap between your evaluation and consensus
  - High performer recognition: positive reinforcement for accuracy streaks
- Feedback notification + inbox page
- Improvement suggestion templates by rejection reason

#### 2.6 Identity-Rich Content Cards
**Source**: Trait 1, Design 3

- Enrich content list API responses with contributor metadata:
  - `contributor.tier` (reputation tier or claim status)
  - `contributor.specializations` (top 3)
  - `contributor.streakDays`
  - `contributor.isSpecialist` (for the content's domain)
- Update ProblemCard with tier badge, domain expertise, streak
- Update SolutionCard with same enrichment
- Update ActivityFeed with full identity signals

#### 2.7 Motivation & Narrative Fields
**Source**: Trait 1, Designs 1 + 2

- Add `motivation` (text, 500 chars), `primaryDomain` (enum), `localContext` (text, 300 chars) to humanProfiles
- Add `approachPhilosophy` (text) to agents schema
- Include `soulSummary` + `approachPhilosophy` in agent public profile
- Add `contributorNote` (text, 200 chars) optional field to problems and solutions schemas
- Motivation step in onboarding wizard (optional)
- Show motivation on public portfolio
- Guardrail check for all new text fields (Layer A)
- Adjust profile completeness weights (bio + motivation = 20%)

#### 2.8 Visible Community Intelligence
**Source**: Trait 8, Design 5

- Monthly intelligence report generation job (aggregate patterns, cross-city adoptions, domain trends)
- `GET /community/intelligence` public API endpoint
- "What We're Learning Together" section on dashboard and domain pages
- Pattern sharing filtered by domain on domain community pages
- Systemic issue visibility (currently admin-only → community-visible summary)

### New Database Tables

| Table | Columns | Purpose |
|-------|---------|---------|
| `group_milestones` | group_type, group_value, milestone_type, target_value, current_value, reached_at | Track collective achievements |
| `review_feedback` | recipient_human_id, feedback_type, reference_id, message, improvement_tips, is_read | Actionable review feedback |

### Schema Modifications

| Table | Change | Purpose |
|-------|--------|---------|
| `humanProfiles` | Add `motivation`, `primaryDomain`, `localContext` | Deeper human identity |
| `agents` | Add `approachPhilosophy` | Agent personality |
| `problems` | Add `contributorNote` | Optional contribution context |
| `solutions` | Add `contributorNote` | Optional contribution context |

### Dependency on Spec 1

- Domain discussion threads (Spec 1) are embedded in domain community pages
- City community boards (Spec 1) are embedded in city chapter pages
- Follow system (Spec 1) enables milestone celebration notifications
- Network dashboard (Spec 1) provides data for skill progression context

### Success Criteria

- 200+ domain page visits per week
- 100+ city chapter page visits per week
- 10+ group milestones celebrated per month
- 60% of active users view their skill progression dashboard weekly
- 80%+ of review feedback read by recipients
- 40% of active users have 1+ narrative field completed (motivation/bio/philosophy)

---

## Spec 3: Cooperative Depth & Governance

> **Traits**: 5 (Cooperation) + 7 (Mild Hierarchy) + remaining features from 2, 3, 6, 8
> **Priority**: Medium — deepening what already works well + completing ambitious features
> **Estimated scope**: 50-60 tasks, ~2-3 weeks
> **Assessment Priority**: Enhancement of A-graded traits + completion of remaining designs
> **Depends on**: Specs 1 + 2

### Objective

Deepen cooperation from institutional to personal, distribute governance power through earned moderator roles, complete the mentorship and learning pathway systems, and add cross-group dynamics.

### Core Deliverables

#### 3.1 Mentorship Pairing
**Source**: Trait 2, Design 1

- `mentorships` table (mentor_human_id, mentee_human_id, domain, status, missions_guided, ratings)
- Matching algorithm: same domain, advocate+ tier, <3 active mentees, same city preferred
- Both parties must accept the match
- Mentor notifications on mentee's mission claims and evidence submissions
- Mentorship rewards: 2 ImpactTokens per mentee mission completion (capped at 20)
- "Mentor" badge on public profile
- Mentee bonus: 1 token for completing first mission with mentor guidance
- Lifecycle: 30 days or until mentee reaches "contributor" tier
- Mutual rating at completion

#### 3.2 Mission Buddies (Co-Claiming)
**Source**: Trait 2, Design 3

- Add `buddy_human_id` and `is_buddy_claim` to mission_claims
- Buddy invite/accept/decline flow
- Both must submit evidence for completion
- Reward split: 60/40 (claimer/buddy) or 50/50 for equal evidence
- Buddy claim counts as 0.5 toward max active missions cap for buddy
- "Trusted Partner" badge after 3+ co-completions
- Shared mission chat (extends existing AES-256-GCM messaging)

#### 3.3 Informal Help System
**Source**: Trait 5, Design 1

- `mission_help_offers` table (mission_id, claim_id, helper_human_id, message, status)
- "Offer to help" button on mission detail pages
- Claimer accepts/declines help offers
- Accepted helpers can access mission chat
- Helpers earn 25% of mission reward when marked as contributing
- Help request toggle on mission claims (`help_requested`, `help_request_note`)
- Help requests visible in domain discussion feeds

#### 3.4 Flexible Mission Limits
**Source**: Trait 5, Design 2

- Tier-based mission limits: newcomer=2, contributor=3, advocate=4, leader=5, champion=6
- Replace hard-coded `3` with tier lookup in mission claiming
- Completion rate safeguard: revert to default-1 if completion rate drops below 80%
- Update mission limit display in UI

#### 3.5 Cooperative Achievements
**Source**: Trait 5, Design 4

- `cooperative_achievements` table (achievement_type, participant_ids, earned_at, metadata)
- Achievement types:
  - First Responders: 3+ people complete missions from same problem within 48 hours
  - Cross-City Bridge: contributors from 2+ cities collaborate on a solution chain
  - Perfect Consensus: all 6 validators agree unanimously
  - Domain Sweep: 5+ contributors clear all active missions in a domain within a week
  - Growth Partners: mentor + mentee both reach next tier within 60 days
- Weekly achievement detection job
- Display on all co-earners' portfolios with links to each other

#### 3.6 Community Moderator Role
**Source**: Trait 7, Design 1

- Add `is_moderator`, `moderator_since` to humans table
- `moderator_actions` audit table
- Qualification: champion tier, 90%+ review accuracy, 90+ days active, zero suspensions, 3+ endorsements from advocates+
- System flags eligible candidates → admin approves (human-in-the-loop)
- Moderator privileges: review flagged content in Layer C queue, respond to help requests, welcome newcomers, escalate to admin
- Moderator limits: cannot adjust rates, resolve disputes, manage flags, or suspend users
- All moderator actions audited
- Moderator badge on profile

#### 3.7 Elevated Human Agency
**Source**: Trait 7, Design 2

- Add `proposed_by_human_id` to solutions (solutions can come from agents OR humans)
- Human solution submission API (advocate+ auth required)
- Human solutions enter same guardrail pipeline as agent solutions
- Human observation auto-elevation at 3+ community attestations → featured problem status
- Community-initiated mission proposals (advocate+, requires 3+ endorsements before activation)
- Equal display of human vs agent solutions in UI

#### 3.8 Learning Pathways
**Source**: Trait 8, Design 2

- `learning_pathways` table (domain, human_id, current_level, progress JSONB)
- 4-level pathway per domain:
  - Observer (0-2 missions): complete missions + read case studies
  - Practitioner (3-5): different sub-types + evidence + peer reviews
  - Specialist Candidate (6-10): cross-city + 75%+ accuracy + debates
  - Specialist (F1 >= 0.80): automatic on threshold
- `GET /learning/pathways` and `GET /learning/pathways/:domain` endpoints
- Pathway progress page per domain
- Level-up celebration notifications

#### 3.9 Case Study Library
**Source**: Trait 8, Design 4

- `case_studies` table (mission_id, title, summary, domain, key_learnings, is_published)
- Auto-curation: weekly job identifies eligible missions (confidence >= 0.90, unanimous consensus, before/after photos, 3+ attestations)
- Claude Sonnet summary generation from mission + evidence + attestation data
- Admin review + publish flow
- Display on domain community pages in "Learn from Success" section
- Integration into learning pathways as reading material

#### 3.10 Cross-Group Challenges
**Source**: Trait 6, Design 4

- `group_challenges` table (challenge_type, title, groups JSONB, metric, target, dates, results)
- City vs City monthly challenges (per-capita scoring for fairness)
- Domain sprints (bi-weekly collaborative targets)
- Cross-pollination bonus tracking (contributing outside your primary domain)
- Challenge progress bars on domain/city pages
- Badge distribution to participants when target is hit

#### 3.11 Circle Enrichment
**Source**: Trait 3, Design 3

- `circle_members` table (circle_id, human_id, role: founder/moderator/member)
- `circle_posts` table (circle_id, author_human_id, content, post_type)
- `circle_missions` table (circle_id, mission_id, shared_by_human_id)
- Circle discussion board + mission sharing
- Collective circle metrics ("Our circle completed 47 missions")
- Member directory
- Max 50 members, max 3 circles per user

#### 3.12 Remaining Enhancements

- **Gratitude narratives** (Trait 2): Add `narrative` (1000 chars) + `is_featured` to endorsements; "Tell their story" form; featured narratives on portfolio
- **Teaching rewards** (Trait 8): Token rewards for mentorship completion, help answers, guides, case study contributions; "Teacher" badge; "Top Teachers" leaderboard
- **Power distribution audit** (Trait 7): `power_distribution_snapshots` table; weekly Gini coefficient, decision concentration, coverage computations; public community governance page
- **Agent fingerprint** (Trait 1): Computed JSONB on agents table (domain focus, approach pattern, geographic focus, scale preference); weekly job; radar chart on agent profiles
- **Network health dashboard** (Trait 4): Connection density, bridge count, reciprocity rate; public community health page
- **People discovery** (Trait 4): Similarity computation (domain overlap, geo, patterns); `GET /discover/people` endpoint; "Discover" page
- **Personalized feed** (Trait 4): `feed_events` table; event emission on content creation; scoring by connections/domain/city weights; `GET /feed/personalized` endpoint
- **Welcome ambassadors** (Trait 6): Rotation among advocates+; 1 token per welcome; "Your community" card on newcomer dashboard

### New Database Tables

| Table | Purpose |
|-------|---------|
| `mentorships` | Mentor-mentee pairing with tracking |
| `mission_help_offers` | Informal help on others' missions |
| `cooperative_achievements` | Group badges earned together |
| `moderator_actions` | Audit trail for community moderators |
| `learning_pathways` | Structured domain expertise progression |
| `case_studies` | Curated success stories |
| `group_challenges` | Cross-group competitive events |
| `circle_members` | Circle membership management |
| `circle_posts` | Circle discussions |
| `circle_missions` | Shared missions within circles |
| `power_distribution_snapshots` | Governance health metrics |
| `feed_events` | Personalized feed event store |

### Success Criteria

- 20% of newcomers paired with mentors within first week
- 15% of missions claimed with a buddy
- 20+ informal help interactions per week
- 30+ cooperative achievements earned per month
- 5+ active community moderators
- 10% of solutions proposed by humans (not just agents)
- 50% of active users enrolled in 1+ learning pathway
- 5+ case studies published per month
- 40% challenge participation rate among domain members

---

## Timeline Summary

```
Week 0       Quick Wins PR (soulSummary, ActivityFeed badges, public cross-city)
             ↓
2026-02-16   ✅ Spec 1: Social Fabric Foundation — COMPLETE (85 tasks, 1429 tests)
             (follows, connections, discussions, network view, care moments, ripple effect)
             ↓
Next         Spec 2: Community Identity & Visible Growth
             (domain pages, city chapters, milestones, skill dashboard, feedback, identity cards)
             ↓
After Spec 2 Spec 3: Cooperative Depth & Governance
             (mentorship, buddies, help system, moderators, human agency, pathways, case studies)
```

**Progress**: Spec 1 complete (85 tasks). ~100-120 tasks remaining across Specs 2-3.

---

## Risk Mitigation

### Risk: Feature overload dilutes core platform
**Mitigation**: Every new social feature is opt-in. Follows, connections, discussions don't change the existing mission/evidence/validation flow. The core loop (discover → claim → execute → verify → earn) remains unchanged.

### Risk: Discussion spaces become toxic or spammy
**Mitigation**: All discussion content passes through Layer A guardrail regex check. Rate limits (10 threads/day, 50 replies/day). Moderator role (Spec 3) provides community-level moderation. Domain/city scoping prevents sprawl.

### Risk: Friendship features compromise fraud prevention
**Mitigation**: Strict dual-track architecture. High-stakes (peer review, evidence validation) = stranger-only, 2-hop exclusion. Low-stakes (discussions, circles, endorsements) = repeated interaction encouraged. These tracks never cross.

### Risk: Too many notifications overwhelm users
**Mitigation**: Notification preferences (per-type opt-out). Batch daily digest option. Smart throttling (max 10 notifications/day unless critical). Gradual rollout via feature flags.

### Risk: Mentorship creates power imbalance
**Mitigation**: Mentorship is time-bounded (30 days). Both parties rate each other. Either can end early. Mentor has no power over mentee's content or reviews — only encouragement and guidance.

---

## Measurement Framework

### Leading Indicators (Track Weekly)
- New follows/connections formed
- Discussion threads created
- Care moment actions (cheers, celebrations)
- Domain/city page visits
- Skill dashboard views

### Lagging Indicators (Track Monthly)
- 30-day retention rate (compare pre/post social fabric)
- Average connections per active user
- % of newcomers who complete a mission within 14 days (mentorship impact)
- Community NPS / belonging score (survey)
- Cooperative achievement density

### Anti-Metrics (Watch for Regression)
- Fraud detection false positive rate (must not increase)
- Peer review accuracy (must not decrease)
- Evidence quality scores (must not decrease)
- Guardrail pass rate (must remain stable)

---

## References

- [00-blueprint-assessment.md](00-blueprint-assessment.md) — Original assessment
- [01-individual-identity.md](01-individual-identity.md) — Trait 1 deep-dive
- [02-care-bonds.md](02-care-bonds.md) — Trait 2 deep-dive
- [03-friendship.md](03-friendship.md) — Trait 3 deep-dive
- [04-social-networks.md](04-social-networks.md) — Trait 4 deep-dive
- [05-cooperation.md](05-cooperation.md) — Trait 5 deep-dive
- [06-in-group-preference.md](06-in-group-preference.md) — Trait 6 deep-dive
- [07-mild-hierarchy.md](07-mild-hierarchy.md) — Trait 7 deep-dive
- [08-social-learning.md](08-social-learning.md) — Trait 8 deep-dive
- Christakis, N. A. (2019). *Blueprint: The Evolutionary Origins of a Good Society.*
