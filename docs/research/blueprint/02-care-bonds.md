# Blueprint Deep-Dive: Care Bonds (Trait 2)

> **Assessment Grade**: D
> **Target Grade**: B
> **Date**: 2026-02-15
> **Principle**: *"Love for partners and offspring."* — Repurposed in platform context as lasting interpersonal bonds, mentorship, and mutual care.

---

## 1. Codebase Validation

### What Exists Today

#### Mission-Claim Relationship (Embryonic Care)
**Schema**: `packages/db/src/schema/missionClaims.ts`
- Human claims mission → commits to 7-day deadline
- Max 3 active missions (hard cap)
- Evidence submission + peer review creates accountability loop
- But: **claim is transactional** — claim, complete, get tokens, move on. No relationship persists post-completion.

#### Endorsement System (Lightweight Appreciation)
**Schema**: `packages/db/src/schema/endorsements.ts`
- `fromHumanId` → `toHumanId` with `reason` (text, 10-500 chars)
- Rate limit: 5 endorsements per day
- Contributes to `endorsementScore` in reputation breakdown
- Displayed on public portfolio

**Limitation**: Endorsements are one-directional acknowledgments, not relationship-building tools. There's no notification, no thread, no ongoing connection.

#### Agent-to-Agent Messaging
**Schema**: `packages/db/src/schema/messages.ts`
- AES-256-GCM encrypted messages
- Scoped to mission coordination
- 4 API routes for sending/receiving

**Limitation**: Messaging is task-scoped, not relationship-scoped. There's no way to message someone outside of a shared mission context.

#### What Does NOT Exist

| Feature | Status |
|---------|--------|
| Mentorship pairing | Not implemented |
| Follow/subscribe relationships | Not implemented |
| Mission co-claiming (buddies) | Not implemented |
| Recurring collaboration tracking | Not implemented |
| Mutual commitment mechanism | Not implemented |
| Gratitude beyond endorsements | Not implemented |
| Streak-break notifications to connections | Not implemented |
| Milestone celebrations for others | Not implemented |
| "Care at cost" mechanisms | Not implemented |

### Validated Assessment

The assessment's **D grade** is accurate. BetterWorld has no lasting interpersonal bonds. Every interaction is:
1. Mediated by systems (guardrails, validators, token economy)
2. Scoped to tasks (missions, reviews, evaluations)
3. Terminated at task completion

There are zero mechanisms for two participants to develop an ongoing, mutually invested relationship.

---

## 2. Gap Analysis

### Gap 1: No Mentorship System
**Severity**: Critical
**Impact**: Newcomers have no guide. Experienced participants have no way to invest in others' growth. The onboarding wizard teaches platform mechanics but doesn't introduce the newcomer to a human being who cares about their success.

### Gap 2: No Follow/Subscribe
**Severity**: High
**Impact**: You can't track someone's journey. If a contributor you respect completes an impressive mission, you'll never know unless you happen to browse the activity feed at the right time.

### Gap 3: No Mission Co-Claiming
**Severity**: High
**Impact**: All missions are solo endeavors. There's no mechanism for two people to share responsibility, help each other, or experience the satisfaction of collaborative completion.

### Gap 4: No "Care at Cost" Mechanisms
**Severity**: Critical (Christakis' primary indicator)
**Impact**: The shipwreck evidence is clear — communities that thrive create moments where people help others at personal cost. BetterWorld has no mechanism for this. Every action is individually incentivized.

### Gap 5: No Gratitude Narratives
**Severity**: Medium
**Impact**: Endorsements are a 5/day counter with a reason field. There's no way for a "thank you" to become a meaningful part of someone's story or a visible act of care.

---

## 3. Design Proposals

### Design 1: Mentorship Pairing

**What**: Match experienced contributors (advocate+ tier) with newcomers in the same domain. Create a structured mentorship relationship with tracking and rewards.

**Schema**:
```sql
CREATE TABLE mentorships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_human_id UUID NOT NULL REFERENCES humans(id),
  mentee_human_id UUID NOT NULL REFERENCES humans(id),
  domain VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, completed, expired
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  mentor_rating INTEGER,  -- 1-5, optional
  mentee_rating INTEGER,  -- 1-5, optional
  missions_guided INTEGER NOT NULL DEFAULT 0,
  UNIQUE(mentor_human_id, mentee_human_id, domain)
);
```

**Matching Algorithm**:
1. Newcomer completes onboarding → system identifies their primary domain
2. Find mentors: same domain, advocate+ tier, fewer than 3 active mentees, in the same city (preferred)
3. Suggest match — both parties must accept
4. Mentor gets notified of mentee's mission claims, evidence submissions, and review outcomes

**Rewards**:
- Mentor earns 2 ImpactTokens per mentee mission completion (capped at 20 per mentorship)
- "Mentor" badge on public profile
- Mentorship count contributes to endorsement score factor
- Mentee gets 1 bonus token for completing first mission with mentor guidance

**Mentorship Lifecycle**:
- Active for 30 days or until mentee reaches "contributor" tier
- Either party can end early
- Mutual rating at completion

**UX**:
- Dashboard card: "Your Mentor: [Name] — advocate in Clean Water"
- Or: "Your Mentees: [Name1], [Name2]"
- Mentor sees mentee's pending missions and can send encouragement messages

### Design 2: Follow System

**What**: Let participants follow others to receive updates on their contributions and milestones.

**Schema**:
```sql
CREATE TABLE follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_human_id UUID NOT NULL REFERENCES humans(id),
  following_human_id UUID NOT NULL REFERENCES humans(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(follower_human_id, following_human_id)
);

CREATE INDEX idx_follows_follower ON follows(follower_human_id);
CREATE INDEX idx_follows_following ON follows(following_human_id);
```

**API**:
- `POST /follows/:humanId` — Follow someone
- `DELETE /follows/:humanId` — Unfollow
- `GET /follows/following` — People I follow (cursor pagination)
- `GET /follows/followers` — People following me (cursor pagination)
- `GET /follows/:humanId/mutual` — Mutual follows with someone

**Notifications** (via WebSocket or future notification system):
- "[Person you follow] completed a mission in Clean Water"
- "[Person you follow] reached Contributor tier!"
- "[Person you follow]'s streak is about to break — cheer them on!"

**Limits**: Max 200 follows per user (prevent spam following).

### Design 3: Mission Buddies (Co-Claiming)

**What**: Allow two humans to co-claim a mission and share responsibility.

**Schema Change**:
```sql
ALTER TABLE mission_claims ADD COLUMN buddy_human_id UUID REFERENCES humans(id);
ALTER TABLE mission_claims ADD COLUMN is_buddy_claim BOOLEAN NOT NULL DEFAULT FALSE;
```

**Rules**:
- Either person can initiate a buddy claim
- Both must confirm (buddy gets an invite notification)
- Both must submit evidence for completion
- Reward is split 60/40 (claimer/buddy) — or 50/50 if both submit equal evidence
- Buddy claim counts as 0.5 toward the max 3 active missions cap for the buddy
- Buddy pairs who complete 3+ missions together earn a "Trusted Partner" badge

**UX**:
- Mission detail page: "Claim with a buddy" button
- Select from followed users or search by username
- Shared mission chat (extends existing AES-256-GCM messaging)

### Design 4: Care Moments

**What**: System-generated moments that create opportunities for interpersonal care.

**Streak-Break Warning**:
- When a followed user's streak is at risk (no activity for 20+ hours), send a notification to their followers
- Followers can send a "cheer" (pre-set encouraging message + 1 token gift)
- The person receives: "3 people are cheering for your streak! Keep going!"

**Milestone Celebration**:
- When someone hits a milestone (10 missions, 50 endorsements, tier promotion), auto-notify followers
- Followers can react with a celebration (confetti animation + optional 1-token gift)
- Celebrations appear on the recipient's portfolio timeline

**Comeback Welcome**:
- When someone returns after 7+ days inactive, followers get notified
- "Welcome back!" messages from followers create re-engagement incentive

### Design 5: Gratitude Narratives

**What**: Extend endorsements into meaningful stories that become part of the recipient's portfolio.

**Schema Change**:
```sql
ALTER TABLE endorsements ADD COLUMN narrative TEXT;  -- max 1000 chars
ALTER TABLE endorsements ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT FALSE;
```

**Rules**:
- `narrative` is optional but encouraged (longer than `reason`)
- Recipients can "feature" up to 3 gratitude narratives on their portfolio
- Featured narratives show on the portfolio page with the endorser's name and avatar
- Narratives pass through Layer A guardrail check

**UX**: "Tell their story" button on someone's profile, opening a form:
> "How has [Name] made a difference? Share a specific moment."

---

## 4. Implementation Plan

### Phase A: Follow System (2-3 days)

| # | Task | Impact |
|---|------|--------|
| A1 | Create `follows` table + migration | Foundation for all care features |
| A2 | Follow/unfollow API routes with Zod validation | API support |
| A3 | Following/followers list endpoints (cursor pagination) | Query support |
| A4 | Follow button on portfolio page and leaderboard | Frontend integration |
| A5 | Follower count on public profile | Social proof |

### Phase B: Care Moments (3-4 days)

| # | Task | Impact |
|---|------|--------|
| B1 | Streak-break detection in existing streak decay worker | Trigger care events |
| B2 | Milestone detection service (mission count, tier, streaks) | Trigger celebrations |
| B3 | Notification delivery (WebSocket + in-app notification store) | Display care moments |
| B4 | "Cheer" and "Celebrate" UI actions | User-initiated care |
| B5 | Token gift mechanism (1-token micro-transaction) | Care at cost |

### Phase C: Mentorship (4-5 days)

| # | Task | Impact |
|---|------|--------|
| C1 | Create `mentorships` table + migration | Foundation |
| C2 | Mentorship matching service | Algorithmic pairing |
| C3 | Mentorship API routes (accept, decline, end, rate) | API support |
| C4 | Mentor dashboard card on human dashboard | Visibility |
| C5 | Mentee progress notifications to mentor | Connection maintenance |
| C6 | Mentorship rewards integration with token economy | Incentive alignment |

### Phase D: Mission Buddies (3-4 days)

| # | Task | Impact |
|---|------|--------|
| D1 | Add buddy fields to mission_claims schema | Foundation |
| D2 | Buddy invite/accept/decline API | Coordination |
| D3 | Shared evidence requirement for buddy claims | Accountability |
| D4 | Reward splitting logic | Fair distribution |
| D5 | "Trusted Partner" badge after 3+ co-completions | Relationship recognition |
| D6 | Buddy claim UI on mission detail page | Frontend |

### Phase E: Gratitude Narratives (1-2 days)

| # | Task | Impact |
|---|------|--------|
| E1 | Add `narrative` and `is_featured` to endorsements | Extended gratitude |
| E2 | "Tell their story" form on profile pages | Input mechanism |
| E3 | Featured narratives on portfolio page | Public visibility |
| E4 | Guardrail check for narrative content | Safety |

### Dependencies
- Phase A (follows) should come first — Phases B, C, D all benefit from follow relationships
- Phase B depends on Phase A
- Phases C, D, E can run in parallel after A

---

## 5. Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Lasting interpersonal bonds | 0 mechanisms | 4 (follow, mentor, buddy, gratitude) |
| "Care at cost" actions/week | 0 | 50+ (cheers, celebrations, token gifts) |
| Active mentorships | 0 | 20% of newcomers paired within first week |
| Co-claimed missions | 0 | 15% of missions claimed with buddy |
| Follow relationships per user (avg) | 0 | 8+ after 30 days |
| Portfolio featured narratives | 0 | 40% of active users have 1+ |

---

## References

- Christakis, N. A. (2019). *Blueprint*, Ch. 3: "Pairs" — how evolution repurposed parental care into broader bonding
- Christakis' shipwreck evidence: Auckland Islands (rescue-first crew survived; abandon-injured crew collapsed)
- Assessment: `docs/research/blueprint/00-blueprint-assessment.md`, §2
- Endorsements schema: `packages/db/src/schema/endorsements.ts`
- Mission claims: `packages/db/src/schema/missionClaims.ts`
- Messages: `packages/db/src/schema/messages.ts`
