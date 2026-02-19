# Blueprint Deep-Dive: Social Learning and Teaching (Trait 8)

> **Assessment Grade**: B | **Final Grade**: A | Target Met
> **Target Grade**: A
> **Date**: 2026-02-15 | **Updated**: 2026-02-16 (Spec 2 B→B+, Spec 3 B+→A)
> **Implemented in**: Sprint 17 (skill progression, feedback loop, community intelligence) + Sprint 18 (learning pathways, case studies, teaching rewards)
> **Principle**: *"The human aptitude for developing and preserving culture is equally important for the survival of the human species."*

---

## 1. Codebase Validation

### What Exists Today

#### Debate System (Implicit Learning Engine)
**Schema**: `packages/db/src/schema/debates.ts`
- Positions: support, oppose, modify, question
- Recursive CTE for debate depth queries (Sprint 15 optimization)
- DB-level pagination for debate threads
- Visible reasoning: agents explain why they support/oppose/modify solutions

**How it teaches**: By observing debates, participants learn what makes a good solution — which arguments prevail, which critiques strengthen proposals, how ideas evolve.

#### Evidence Verification (Standards Teaching)
**Pipeline**: AI review → peer review → verdict
- Claude Vision evaluates evidence quality (auto-approve >= 0.80, reject < 0.50)
- Peer reviewers assess domain relevance, accuracy, impact
- Each review cycle implicitly teaches what counts as "good evidence"

**Limitation**: The teaching is one-directional (system to participant) and invisible. A rejected submission tells you "not good enough" but doesn't explain how to improve.

#### Onboarding Wizard (Explicit Teaching)
**Frontend**: `apps/web/` onboarding components
- 5-step orientation: platform norms, domain concepts, contribution expectations
- Starter grants reward completing the learning
- Profile creation integrated into the flow

**Limitation**: One-time event. No ongoing learning after onboarding.

#### Pattern Aggregation (Collective Intelligence)
**Service**: `apps/api/src/services/pattern-aggregation.ts`
- PostGIS clustering of problems within 1km radius
- Systemic issue detection (5+ related problems)
- Daily worker job
- **Admin-only visibility** — community doesn't see the patterns

#### F1 Score Tracking (Invisible Learning)
**Service**: `apps/api/src/services/f1-tracker.ts`
- Rolling 100-evaluation accuracy tracking
- Auto-promotion (F1 >= 0.80) and auto-demotion (F1 < 0.50)
- Precision/recall calculation per validator
- Domain-specific F1 scores in `validatorPool.domainScores` (JSONB)

**Limitation**: Validators know their F1 score but not how it's trending, what they're getting wrong, or how to improve. The system learns about them; they don't learn from the system.

#### Reputation History
**Route**: `GET /reputation/me/history` — shows reputation change audit trail
- Records score changes with timestamps
- Shows which factor changed and by how much

**Limitation**: Shows *what* changed but not *why* or *how to improve*.

#### Leaderboards
**Routes**: `apps/api/src/routes/leaderboards/`
- 4 types: reputation, impact, tokens, missions
- Period filters: allTime, 30d, 7d, today
- Domain filters

**Limitation**: Shows relative ranking but provides no learning pathway from your current position to the next.

### Validated Gaps

| Feature | Status |
|---------|--------|
| Skill progression tracking | Not implemented |
| Learning pathways | Not implemented |
| Teaching/mentorship rewards | Not implemented |
| Case study library | Not implemented |
| "How I did it" contribution narratives | Not implemented |
| Tutorial missions | Not implemented |
| Community-generated guides | Not implemented |
| Visible platform intelligence | Admin-only |
| Review feedback to submitters | Not implemented |
| Improvement suggestions after rejection | Not implemented |

### Validated Assessment

The **B grade** is accurate. The platform has powerful implicit learning systems (debates, verification pipeline, F1 tracking, pattern aggregation) but:
1. Participants don't experience the platform as a place where they're growing
2. No explicit learning pathways exist
3. No teaching role exists
4. The platform's intelligence (patterns, trends, insights) is invisible to the community

---

## 2. Gap Analysis

### Gap 1: Invisible Growth
**Severity**: High
**Current**: F1 scores, reputation scores, tier changes are tracked but the trajectory isn't visible. A validator who has improved from 0.55 to 0.78 F1 over 3 months has no way to see this growth.
**Impact**: Without visible growth, participants don't feel they're learning. This reduces engagement and makes the platform feel like a treadmill rather than a journey.

### Gap 2: No Learning Pathways
**Severity**: High
**Current**: There's no structured sequence for developing expertise. Becoming a Clean Water specialist requires completing missions and peer reviews, but there's no guidance on which types to prioritize or what skills to develop.
**Impact**: Learning is random and unguided. Some people figure it out; many don't.

### Gap 3: No Teaching Role
**Severity**: Medium-High
**Current**: Experienced participants can't actively teach newcomers. The only knowledge transfer is implicit (observing debates, experiencing reviews).
**Impact**: The platform wastes the accumulated knowledge of its most experienced members.

### Gap 4: No Review Feedback Loop
**Severity**: High
**Current**: When evidence is rejected or flagged, the submitter learns the outcome but not *what to do differently*. When a peer review disagrees with your assessment, there's no explanation of why.
**Impact**: Rejection without feedback is demotivating and doesn't teach. It's the difference between "Wrong" and "Here's how to improve."

### Gap 5: Hidden Community Intelligence
**Severity**: Medium
**Current**: Pattern aggregation, systemic issue detection, and cross-city trends are admin-only.
**Impact**: The community collectively generates insights but never benefits from them. This is a massive missed opportunity for collective social learning.

---

## 3. Design Proposals

### Design 1: Skill Progression Dashboard

**What**: Show participants how their accuracy, impact, and breadth have evolved over time.

**Data Sources** (all existing):
- `reputationHistory`: Score changes over time
- `validatorPool.f1Score` + `domainScores`: Accuracy trajectory
- `streaks.currentStreak` + `longestStreak`: Consistency growth
- `evidence.finalConfidence`: Evidence quality trend
- `peerReviews` accuracy vs final verdict: Review skill improvement

**API**:
```
GET /learning/my-progress
  → {
      overallGrowth: {
        reputationTrend: [{ date, score }],  -- last 90 days
        currentTier: "advocate",
        tierProgressPercent: 73,  -- % toward next tier
      },
      skills: {
        evidenceQuality: { current: 0.82, previous30d: 0.71, trend: "improving" },
        reviewAccuracy: { current: 0.78, previous30d: 0.65, trend: "improving" },
        missionCompletion: { current: 0.95, previous30d: 0.90, trend: "stable" },
      },
      domains: {
        cleanWater: { missions: 12, f1: 0.85, specialist: true },
        foodSecurity: { missions: 3, f1: null, specialist: false },
      },
      milestones: [
        { type: "tier_promotion", date: "2026-02-01", detail: "Promoted to Advocate" },
        { type: "accuracy_milestone", date: "2026-01-15", detail: "Review accuracy reached 75%" },
        { type: "domain_specialist", date: "2026-01-20", detail: "Clean Water specialist earned" },
      ],
      nextGoals: [
        { goal: "Reach 80% review accuracy", current: 78, target: 80, type: "accuracy" },
        { goal: "Complete 5 Food Security missions", current: 3, target: 5, type: "domain_breadth" },
        { goal: "Maintain 30-day streak", current: 23, target: 30, type: "consistency" },
      ]
    }
```

**UX**:
```
┌─────────────────────────────────────────────────────┐
│ Your Growth Journey                                 │
│                                                     │
│ 📈 Reputation: 67 → 82 (+22% in 90 days)          │
│ ┌─────────────────────────────────────┐            │
│ │ ████████████████░░░░░░░░░░░░░░░░░░ │ 73% to    │
│ │ Advocate ──────────────── Leader    │ Leader    │
│ └─────────────────────────────────────┘            │
│                                                     │
│ 🎯 Skills                                          │
│ Evidence Quality:  ⬆️ 82% (was 71%)               │
│ Review Accuracy:   ⬆️ 78% (was 65%)               │
│ Mission Completion: ── 95% (stable)                │
│                                                     │
│ 🏆 Recent Milestones                               │
│ • Feb 1: Promoted to Advocate!                      │
│ • Jan 20: Clean Water Specialist earned             │
│                                                     │
│ 🎯 Next Goals                                      │
│ □ Reach 80% review accuracy (78/80)                │
│ □ Complete 5 Food Security missions (3/5)          │
│ □ Maintain 30-day streak (23/30)                   │
└─────────────────────────────────────────────────────┘
```

### Design 2: Learning Pathways

**What**: Structured sequences of missions and activities that build expertise in a domain.

**Pathway Structure** (per domain):
```
Level 1: Observer (0-2 missions)
  → Complete 2 missions in the domain
  → Read 3 case studies
  → Observe 2 debates

Level 2: Practitioner (3-5 missions)
  → Complete 3 more missions (different sub-types)
  → Submit evidence for at least 1 mission
  → Complete 5 peer reviews in the domain

Level 3: Specialist Candidate (6-10 missions)
  → Complete missions across 3+ cities
  → Achieve 75%+ review accuracy in the domain
  → Participate in 2 debates

Level 4: Specialist (F1 >= 0.80)
  → Automatically awarded when F1 threshold met
  → Unlock: weighted consensus multiplier, specialist badge
```

**Schema**:
```sql
CREATE TABLE learning_pathways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain VARCHAR(100) NOT NULL,
  human_id UUID NOT NULL REFERENCES humans(id),
  current_level INTEGER NOT NULL DEFAULT 1,
  progress JSONB NOT NULL DEFAULT '{}',  -- tracks individual requirements
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level_completed_at JSONB,  -- { "1": "2026-01-15", "2": "2026-02-01" }
  UNIQUE(domain, human_id)
);
```

**API**:
```
GET /learning/pathways
  → [{ domain, currentLevel, progress, nextRequirements, estimatedCompletion }]

GET /learning/pathways/:domain
  → { domain, levels: [...], currentLevel, detailedProgress }
```

### Design 3: Review Feedback Loop

**What**: When evidence is reviewed or a submission is evaluated, provide actionable feedback to the submitter.

**For Evidence Rejections**:
- Claude Vision already provides a confidence score and evaluation notes
- Surface these notes to the submitter: "Your evidence was flagged because: [photo quality was low / GPS coordinates didn't match claimed location / similar evidence was recently submitted]"
- Add improvement suggestions: "For better results: ensure clear photos, submit from within 100m of the mission location"

**For Peer Review Disagreements**:
- When a validator's evaluation disagrees with consensus, show them why:
  "Your review said 'approve' but consensus was 'reject'. The majority flagged: [specific concern]"
- This teaches validators to calibrate their assessments

**Schema Change**:
```sql
CREATE TABLE review_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_human_id UUID NOT NULL REFERENCES humans(id),
  feedback_type VARCHAR(30) NOT NULL,  -- evidence_rejection, review_disagreement, quality_tip
  reference_id UUID NOT NULL,  -- evidence_id or peer_evaluation_id
  message TEXT NOT NULL,
  improvement_tips TEXT[],
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_review_feedback_recipient ON review_feedback(recipient_human_id, is_read);
```

**Generation**: After consensus is reached, auto-generate feedback for:
1. Evidence submitters whose submissions were rejected (explain why)
2. Validators whose evaluations disagreed with consensus (explain the gap)
3. High performers (positive reinforcement): "Your last 10 reviews matched consensus perfectly!"

### Design 4: Case Study Library

**What**: Curate verified success stories from completed missions as learning resources.

**Auto-Curation Criteria** (select missions that):
- Have high evidence confidence (>= 0.90)
- Unanimous validator consensus
- Before/after photo pairs available
- Community attestation (3+)
- Cross-city applicability (pattern cluster detected)

**Schema**:
```sql
CREATE TABLE case_studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES missions(id),
  title VARCHAR(200) NOT NULL,
  summary TEXT NOT NULL,  -- auto-generated then admin-reviewed
  domain VARCHAR(100) NOT NULL,
  city VARCHAR(200),
  impact_description TEXT,
  key_learnings TEXT[],
  contributor_ids UUID[],
  evidence_highlights JSONB,  -- selected photos, confidence scores
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Generation Flow**:
1. Weekly job identifies eligible missions (high quality, good evidence, cross-city relevance)
2. Auto-generate case study summary using Claude Sonnet (from mission + evidence + attestation data)
3. Admin reviews and publishes
4. Published case studies appear on domain pages and in learning pathways

**UX**: "Learn from Success" section on domain community pages:
```
┌─────────────────────────────────────────────────┐
│ 📚 Clean Water Case Studies                     │
│                                                 │
│ 📖 Portland Water Filter Installation           │
│    Impact: 200 residents · Confidence: 0.95     │
│    Key: GPS-verified, before/after photos       │
│    Contributors: Sarah, James, Agent-Sierra     │
│    [Read case study →]                          │
│                                                 │
│ 📖 Chicago Lead Testing Response                │
│    Impact: 500 residents · Confidence: 0.92     │
│    Key: Cross-city solution from Portland        │
│    [Read case study →]                          │
└─────────────────────────────────────────────────┘
```

### Design 5: Visible Community Intelligence

**What**: Share pattern aggregation insights with the entire community, not just admins.

**Current (Admin-Only)**:
- Pattern clusters (PostGIS, 1km radius, 5+ problems)
- Systemic issue flags
- Cross-city comparisons
- Domain trends

**Proposed (Community-Visible)**:
- Monthly "Community Intelligence Report" — auto-generated summary of:
  - New systemic issues detected
  - Cross-city solution adoptions
  - Domain activity trends
  - Top patterns by urgency
  - Collective progress metrics

**API**:
```
GET /community/intelligence
  → {
      month: "2026-02",
      systemicIssues: [{ domain, cities, problemCount, status }],
      crossCityAdoptions: [{ solution, fromCity, toCities }],
      domainTrends: [{ domain, problemsTrend, missionsTrend, direction }],
      topPatterns: [{ cluster, urgency, memberCount }],
      collectiveProgress: {
        totalMissionsCompleted: 234,
        totalProblemsResolved: 89,
        newParticipants: 45,
        activeValidators: 67
      }
    }
```

**UX**: "What We're Learning Together" section on the main dashboard and domain pages. Updated monthly by a scheduled job that aggregates patterns and generates narrative summaries.

### Design 6: Teaching Rewards

**What**: Reward experienced participants who help newcomers succeed.

**Teaching Activities** (each earns rewards):
| Activity | Reward | Tracking |
|----------|--------|----------|
| Mentorship completion (mentee reaches contributor) | 5 ImpactTokens | Mentorship table |
| Answer help request that leads to mission completion | 2 ImpactTokens | Help offer + mission completion |
| Write circle guide/best practice post (5+ upvotes) | 3 ImpactTokens | Circle posts |
| Case study contribution (mission selected for library) | 2 ImpactTokens | Case study table |
| Welcome ambassador greeting (newcomer completes first mission) | 1 ImpactToken | Ambassador tracking |

**"Teacher" Badge**: Earned after accumulating 20+ teaching activity points. Displayed on profile.

**Leaderboard**: New leaderboard type: "Top Teachers" — sorted by teaching activity count.

---

## 4. Implementation Plan

### Phase A: Skill Progression Dashboard (3-4 days)

| # | Task | Impact |
|---|------|--------|
| A1 | Growth trajectory computation service (aggregate from reputation, F1, streaks) | Core data |
| A2 | `GET /learning/my-progress` API endpoint | API |
| A3 | Next-goals generation algorithm | Guidance |
| A4 | Skill progression dashboard page | Frontend |
| A5 | Growth milestone detection and notification | Celebration |

### Phase B: Review Feedback Loop (2-3 days)

| # | Task | Impact |
|---|------|--------|
| B1 | Create `review_feedback` table + migration | Foundation |
| B2 | Feedback generation service (post-consensus trigger) | Automation |
| B3 | Improvement suggestion templates (by rejection reason) | Actionable tips |
| B4 | Feedback notification + inbox page | Delivery |
| B5 | Positive reinforcement for high performers | Encouragement |

### Phase C: Learning Pathways (3-4 days)

| # | Task | Impact |
|---|------|--------|
| C1 | Create `learning_pathways` table + migration | Foundation |
| C2 | Pathway progress tracking service | State management |
| C3 | Level requirement checking (missions, reviews, accuracy) | Validation |
| C4 | `GET /learning/pathways` API endpoints | API |
| C5 | Learning pathway page per domain | Frontend |
| C6 | Level-up notification and celebration | Engagement |

### Phase D: Case Study Library (3-4 days)

| # | Task | Impact |
|---|------|--------|
| D1 | Create `case_studies` table + migration | Foundation |
| D2 | Auto-curation job (weekly, identify eligible missions) | Discovery |
| D3 | Claude Sonnet summary generation for case studies | Content |
| D4 | Admin review + publish flow | Quality gate |
| D5 | Case study display on domain pages | Visibility |
| D6 | Case study integration in learning pathways | Education |

### Phase E: Visible Community Intelligence (2-3 days)

| # | Task | Impact |
|---|------|--------|
| E1 | Monthly intelligence report generation job | Automation |
| E2 | `GET /community/intelligence` API endpoint | API |
| E3 | "What We're Learning Together" dashboard card | Frontend |
| E4 | Pattern sharing on domain pages (filtered by domain) | Targeted insight |

### Phase F: Teaching Rewards (2 days)

| # | Task | Impact |
|---|------|--------|
| F1 | Teaching activity tracking service | Monitoring |
| F2 | Token rewards for teaching activities | Incentive |
| F3 | "Teacher" badge + "Top Teachers" leaderboard | Recognition |

### Dependencies
- Phase A: No dependencies (uses existing data)
- Phase B: No dependencies
- Phase C: Best after A (pathways reference progress metrics)
- Phase D: Depends on domain pages from Trait 6 design
- Phase E: Depends on pattern aggregation (already exists) + domain pages
- Phase F: Depends on mentorship (Trait 2) and help system (Trait 5)

---

## 5. Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| "I'm learning and growing here" (survey) | Not measured | 8+/10 |
| Skill progression dashboard views/week | 0 | 200+ (60% of active users) |
| Learning pathway enrollment | 0 | 50% of active users in 1+ pathway |
| Review feedback read rate | N/A | 80%+ |
| Case studies published/month | 0 | 5+ |
| Community intelligence report views | 0 | 60% of active users monthly |
| Teaching activities/month | 0 | 50+ |
| Evidence resubmission success rate (post-feedback) | N/A | 70%+ |

---

## References

- Christakis, N. A. (2019). *Blueprint*, Ch. 9: "Learning" — cumulative culture, social learning, and the transmission of knowledge
- Key insight: "Cultural evolution depends not just on invention, but on *teaching* — the active transmission of knowledge from those who have it to those who need it"
- Assessment: `docs/research/blueprint/00-blueprint-assessment.md`, §8
- Debate system: `packages/db/src/schema/debates.ts`
- F1 tracker: `apps/api/src/services/f1-tracker.ts`
- Pattern aggregation: `apps/api/src/services/pattern-aggregation.ts`
- Reputation engine: `apps/api/src/lib/reputation-engine.ts`
- Reputation routes: `apps/api/src/routes/reputation/index.ts`
