# Blueprint Deep-Dive: Friendship (Trait 3)

> **Assessment Grade**: D+ | **Final Grade**: B+ | Target Met
> **Target Grade**: B+
> **Date**: 2026-02-15 | **Updated**: 2026-02-16 (Spec 1 D+→B-, Spec 3 B-→B+)
> **Implemented in**: Sprint 16 (connection graph, discussion spaces) + Sprint 18 (circle enrichment, mission buddies, informal help)
> **Principle**: *"Friendship lays the foundation for morality."* — The evolutionary bridge between self-interest and genuine care for non-kin.

---

## 1. Codebase Validation

### What Exists Today

#### Peer Review (Proto-Friendship Dynamics)
**Service**: `apps/api/src/services/evaluation-assignment.ts`
- 6 validators assigned per submission
- Tier stratification (at least 1 journeyman+)
- Self-review exclusion
- **Last 3 submission exclusion** — prevents same validators repeatedly
- PostGIS affinity boost (100km radius preference)
- 30-minute response window

**Key Finding**: The assignment service actively prevents repeated interaction between the same pairs. While this is excellent for fraud prevention, it is the primary architectural barrier to friendship formation.

#### 2-Hop Exclusion (Peer Reviews)
**Service**: `apps/api/src/routes/peer-reviews/index.ts`
- Stranger-only assignment for evidence peer review
- 2-hop exclusion: reviewer can't have interacted with the evidence submitter within 2 degrees of connection
- Prevents collusion and bias

**Key Finding**: The 2-hop exclusion ensures that peer review is always between strangers. This is correct for high-stakes validation but means the platform systematically routes people away from building familiarity.

#### Circles (Underdeveloped Groups)
**Validated via research**: Circles cost 25 ImpactTokens to create.
- Named group container
- But: **no shared mission boards, no group discussions, no collective identity features**
- Circles appear to be a stub — the DB table and creation cost exist, but meaningful circle functionality is minimal.

#### Endorsements (Lightweight Recognition)
**Schema**: `packages/db/src/schema/endorsements.ts`
- One-directional: fromHumanId → toHumanId
- `reason` field (10-500 chars)
- 5/day rate limit
- No mutual confirmation, no relationship state

#### What Does NOT Exist

| Feature | Status |
|---------|--------|
| Friend/connection model | Not implemented |
| Mutual connection requests | Not implemented |
| Shared interaction history view | Not implemented |
| Recurring collaborator detection | Not implemented |
| "People you've worked with" list | Not implemented |
| Low-stakes repeated interaction spaces | Not implemented |
| Circle discussions/shared boards | Not implemented |
| Complementary skill discovery | Not implemented |

### Validated Assessment

The assessment's claim that friendship is **"structurally prevented"** is accurate. The architecture has two anti-friendship mechanisms:

1. **Evaluation assignment**: Actively avoids assigning the same validators to the same submitter
2. **2-hop exclusion**: Ensures peer review happens between strangers

These are correct for fraud prevention but leave zero space for the repeated positive interactions that Christakis identifies as the prerequisite for friendship.

---

## 2. Gap Analysis

### Gap 1: No Connection Model
**Severity**: Critical
**Current**: The platform has no concept of friendship, connection, or mutual relationship between participants.
**Impact**: Without a relationship model, none of the downstream friendship benefits (trust, mutual support, moral cooperation) can emerge.

### Gap 2: Repeated Interaction Prevented
**Severity**: High
**Current**: Both evaluation assignment and peer review actively prevent repeated pairings.
**Impact**: Friendship requires repeated positive interactions. The platform's fraud prevention architecture makes this impossible.

### Gap 3: No Shared History Visibility
**Severity**: High
**Current**: Even though the database contains records of who has reviewed whose work, participated in the same domain, or worked in the same city — this history is invisible to participants.
**Impact**: Two people who have unknowingly validated each other's work 5 times have no way to discover this shared history.

### Gap 4: Circles Are Empty Shells
**Severity**: Medium
**Current**: Circles exist as a concept (25-token creation cost) but have no meaningful functionality.
**Impact**: The one explicit group feature is non-functional as a friendship space.

### Gap 5: No Low-Stakes Interaction Spaces
**Severity**: High
**Current**: All interactions are high-stakes (reviews, evaluations, evidence submission). There's nowhere to have casual conversation or low-pressure collaboration.
**Impact**: Christakis notes that friendship forms in low-pressure environments. BetterWorld only offers high-pressure environments.

---

## 3. Design Proposals

### Design 1: Connection Graph

**What**: A mutual connection system that surfaces shared history and enables ongoing relationships.

**Schema**:
```sql
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_human_id UUID NOT NULL REFERENCES humans(id),
  recipient_human_id UUID NOT NULL REFERENCES humans(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, accepted, declined
  shared_domains TEXT[],  -- auto-computed: overlapping domains
  interaction_count INTEGER NOT NULL DEFAULT 0,  -- auto-computed
  first_interaction_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(requester_human_id, recipient_human_id)
);

CREATE INDEX idx_connections_requester ON connections(requester_human_id) WHERE status = 'accepted';
CREATE INDEX idx_connections_recipient ON connections(recipient_human_id) WHERE status = 'accepted';
```

**API**:
- `POST /connections/:humanId` — Send connection request
- `POST /connections/:id/accept` — Accept request
- `POST /connections/:id/decline` — Decline request
- `GET /connections` — My connections (cursor pagination, filter by domain)
- `GET /connections/suggestions` — Algorithmically suggested connections

**Connection Suggestions Algorithm**:
1. Find humans who share 2+ domains from specializations/skills
2. Find humans in the same city
3. Find humans who have reviewed each other's work (query peer_reviews + peer_evaluations)
4. Score by: shared_domains × 3 + same_city × 2 + mutual_reviews × 5
5. Exclude existing connections and declined requests

**UX**: "People you may know" card on the dashboard showing 3-5 suggestions with shared context:
```
┌─────────────────────────────────────────┐
│ 👤 Sarah Chen · Contributor             │
│ 🏙️ Portland · Clean Water, Food Sec.   │
│ You've both worked on 4 similar missions│
│                                         │
│ [Connect]                               │
└─────────────────────────────────────────┘
```

### Design 2: Recurring Collaborator Detection

**What**: Algorithmically identify people who frequently interact positively and surface this to both parties.

**Implementation**:
- Scheduled job (weekly): Query peer_reviews, peer_evaluations, endorsements, mission completions in same domain+city
- Build interaction score matrix between human pairs
- When a pair exceeds threshold (5+ positive interactions), trigger a "You and [Name] have been making an impact together" notification
- Suggest they connect if not already connected

**No new schema needed** — uses existing tables as data source. Results stored as a JSONB suggestion cache on a lightweight table or Redis.

### Design 3: Circle Enrichment

**What**: Transform circles from empty shells into genuine friendship spaces.

**Schema Changes**:
```sql
CREATE TABLE circle_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id UUID NOT NULL REFERENCES circles(id),
  human_id UUID NOT NULL REFERENCES humans(id),
  role VARCHAR(20) NOT NULL DEFAULT 'member',  -- founder, moderator, member
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(circle_id, human_id)
);

CREATE TABLE circle_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id UUID NOT NULL REFERENCES circles(id),
  author_human_id UUID NOT NULL REFERENCES humans(id),
  content TEXT NOT NULL,       -- max 2000 chars
  post_type VARCHAR(20) NOT NULL DEFAULT 'discussion', -- discussion, mission_share, celebration
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE circle_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id UUID NOT NULL REFERENCES circles(id),
  mission_id UUID NOT NULL REFERENCES missions(id),
  shared_by_human_id UUID NOT NULL REFERENCES humans(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Circle Features**:
- **Discussion board**: Circle members can post discussions (moderated by Layer A guardrails)
- **Shared mission board**: Members can share missions they think the circle would care about
- **Collective metrics**: "Our circle has completed 47 missions this month"
- **Member directory**: See who's in the circle with their profiles
- **Circle milestones**: "Our circle reached 100 verified missions!"

**Limits**: Max 50 members per circle. Max 3 circles per user. Posts capped at 10/day/member.

### Design 4: Parallel Low-Stakes Interaction Spaces

**What**: Create spaces where repeated interaction is encouraged (complementing the high-stakes spaces where it's prevented).

**Principle**: Keep the 2-hop exclusion for high-stakes review. Add new low-stakes channels where the opposite dynamic applies.

**Domain Discussion Threads**:
- Each of the 15 domains gets a discussion space
- Participants in that domain can post observations, ask questions, share learnings
- No token cost, no validation — just conversation
- Light moderation via Layer A only
- This is where friendships naturally form — around shared interest

**Local Community Boards**:
- Each city gets a community board
- "Hey Portland Clean Water folks — there's a community cleanup this Saturday"
- Events, meetup coordination, local knowledge sharing
- Not mission-scoped — community-scoped

**Schema**:
```sql
CREATE TABLE discussion_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type VARCHAR(20) NOT NULL,  -- domain, city
  scope_value VARCHAR(100) NOT NULL,  -- 'clean_water', 'portland'
  author_human_id UUID NOT NULL REFERENCES humans(id),
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,  -- max 2000 chars
  reply_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE discussion_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES discussion_threads(id),
  author_human_id UUID NOT NULL REFERENCES humans(id),
  content TEXT NOT NULL,  -- max 1000 chars
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Design 5: Friendship Affordances in Missions

**What**: Allow missions to be flagged as collaborative and enable co-discovery.

**Schema Change**:
```sql
ALTER TABLE missions ADD COLUMN collaboration_type VARCHAR(20) NOT NULL DEFAULT 'solo';
  -- solo, partner_welcome, team_required
ALTER TABLE missions ADD COLUMN ideal_team_size INTEGER DEFAULT 1;
```

**UX**:
- Mission cards show a "Partner Welcome" or "Team" badge
- Filter marketplace by collaboration type
- "Partner Welcome" missions show who else is interested (not claimed yet)
- Connection suggestions prioritize people interested in the same collaborative missions

---

## 4. Implementation Plan

### Phase A: Connection Graph (3-4 days)

| # | Task | Impact |
|---|------|--------|
| A1 | Create `connections` table + migration | Foundation |
| A2 | Connection request/accept/decline API routes | Core CRUD |
| A3 | Connection suggestions algorithm (shared domains + city + reviews) | Discovery |
| A4 | "People you may know" dashboard card | Frontend |
| A5 | Connection list page with shared history | Relationship visibility |

### Phase B: Low-Stakes Spaces (4-5 days)

| # | Task | Impact |
|---|------|--------|
| B1 | Create `discussion_threads` and `discussion_replies` tables | Foundation |
| B2 | Thread CRUD API routes with Layer A moderation | Safety |
| B3 | Domain discussion pages (15 domains) | Friendship spaces |
| B4 | City community boards (3 cities) | Local friendship |
| B5 | Reply notifications to thread author and participants | Engagement |

### Phase C: Circle Enrichment (3-4 days)

| # | Task | Impact |
|---|------|--------|
| C1 | Create `circle_members`, `circle_posts`, `circle_missions` tables | Foundation |
| C2 | Circle member management API | Membership |
| C3 | Circle discussion board + mission sharing | Functionality |
| C4 | Circle collective metrics computation | Group identity |
| C5 | Circle page UI with member directory, discussions, metrics | Frontend |

### Phase D: Collaborator Detection & Mission Affordances (2-3 days)

| # | Task | Impact |
|---|------|--------|
| D1 | Weekly collaborator detection job | Automated discovery |
| D2 | "You and [Name] work well together" notifications | Relationship surfacing |
| D3 | Add `collaboration_type` and `ideal_team_size` to missions | Mission metadata |
| D4 | "Partner Welcome" badge on mission cards | Discovery |
| D5 | Collaborative mission filter in marketplace | Browsing |

### Dependencies
- Phase A should come first (connections are used by B, C, D)
- Phases B and C can run in parallel
- Phase D depends on A (for connection suggestions)

### Key Architectural Decision: Fraud Prevention + Friendship

**The 2-hop exclusion stays for high-stakes review.** This is non-negotiable for platform integrity.

**New friendship features operate in parallel spaces**:
- High-stakes: peer review, evidence validation → stranger-only, 2-hop exclusion
- Low-stakes: discussions, circles, missions, endorsements → repeated interaction encouraged

This dual-track approach preserves fraud prevention while creating friendship channels.

---

## 5. Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Mutual connections per user | 0 | 5+ after 60 days |
| Discussion threads/week | 0 | 30+ (across all domains/cities) |
| Active circles | 0 (functional) | 20+ with 5+ members each |
| Collaborator pairs detected/month | 0 | 50+ |
| "Partner Welcome" missions claimed | 0 | 25% of collaborative missions |
| Repeat interaction pairs (low-stakes) | 0 | 100+ pairs with 5+ interactions |

---

## References

- Christakis, N. A. (2019). *Blueprint*, Ch. 4: "Friends" — friendship as the evolutionary leap from kin-based to non-kin cooperation
- Christakis' primate evidence: grooming networks, alliance formation, conflict resolution through third-party mediation
- Assessment: `docs/research/blueprint/00-blueprint-assessment.md`, §3
- Evaluation assignment: `apps/api/src/services/evaluation-assignment.ts`
- Peer reviews: `apps/api/src/routes/peer-reviews/index.ts`
- Endorsements: `packages/db/src/schema/endorsements.ts`
