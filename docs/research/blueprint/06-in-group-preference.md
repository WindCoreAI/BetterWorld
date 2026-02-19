# Blueprint Deep-Dive: In-Group Preference (Trait 6)

> **Assessment Grade**: B- | **Final Grade**: A | Target Exceeded
> **Target Grade**: A-
> **Date**: 2026-02-15 | **Updated**: 2026-02-16 (Spec 1 B-→B, Spec 2 B→A-, Spec 3 A-→A)
> **Implemented in**: Sprint 16 (discussion boards) + Sprint 17 (domain/city pages, milestones) + Sprint 18 (cross-group challenges, welcome ambassadors)
> **Principle**: *"Children wearing red t-shirts favoured and liked other children wearing the same colour — even when told colours were given out randomly."* — In-group preference creates powerful cohesion; successful societies channel it toward constructive group identity.

---

## 1. Codebase Validation

### What Exists Today

#### Domain System (15 UN SDG-Aligned Domains)
**Landing Page**: `landing-page/src/components/Domains.tsx`
- 15 domains with distinct names, icons, colors, and example problems:
  - Poverty Reduction (#D4872C), Education Access (#5B6ABF), Healthcare (#C75D6E)
  - Environmental Protection (#4A8C6F), Food Security (#B8862B), Mental Health (#8B6DAF)
  - Community Building (#D4785C), Disaster Response (#B84545), Digital Inclusion (#3D8B8B)
  - Human Rights (#7B5EA7), Clean Water (#4A87B5), Sustainable Energy (#C9A032)
  - Gender Equality (#A8568A), Biodiversity (#5E8C4A), Elder Care (#B07585)

Each domain has a unique color palette — this is a ready-made in-group visual identity system.

#### Domain Specialist Badges
**Component**: `apps/web/src/components/validators/SpecialistBadge.tsx`
- Domain-colored badges with F1 score
- Visual markers showing domain expertise
- Specialist promotion/revocation: `apps/api/src/services/domain-specialization.ts` (F1-based)

#### City-Based Communities
**Config**: Open311 city configs for Portland, Chicago, Denver
- Each city has its own problem ingestion pipeline
- City-specific metrics in cross-city dashboard
- City selector in frontend for browsing city data
- City heatmaps via Leaflet

#### Trust Tiers (Aspirational In-Groups)
**Schema**: `packages/db/src/schema/reputation.ts`
- 5 tiers: newcomer → contributor → advocate → leader → champion
- Each tier has color-coded badge, multiplier, and privileges
- Tier requirements are public and transparent

#### Cross-City Dashboard
**Component**: `apps/web/src/components/admin/CrossCityDashboard.tsx`
- Per-capita metric comparison across cities
- Problems, observations, validator density comparisons
- **Admin-only** — not visible to regular participants

### Validated Gaps

| Feature | Status |
|---------|--------|
| Domain home pages | Not implemented |
| Domain collective metrics | Not implemented |
| Domain shared mission boards | Not implemented |
| Domain narratives/stories | Not implemented |
| City chapter pages | Not implemented |
| City milestones | Not implemented |
| City celebration moments | Not implemented |
| Cross-group challenges | Not implemented |
| Group onboarding (welcome from members) | Not implemented |
| Monthly impact stories | Not implemented |
| Domain discussion spaces | Not implemented |
| City community boards | Not implemented |

### Validated Assessment

The **B- grade** is accurate. The raw materials for in-group identity are excellent:
- 15 beautifully designed domains with distinct colors and icons
- 3 cities with real data pipelines
- 5 reputation tiers with visual badges

But these are **functional categories**, not **emotional homes**. A participant who specializes in Clean Water has no community page, no group metrics, no shared narrative, no celebration moments, and no way to feel "this is my people."

---

## 2. Gap Analysis

### Gap 1: Domains Are Categories, Not Communities
**Severity**: High
**Current**: Domains are filter options in dropdowns and specialist badge labels. They have no "home" — no page, no metrics, no conversation, no identity.
**Impact**: The 15 domains could be powerful in-groups but are wasted as mere tags.

### Gap 2: Cities Are Data Sources, Not Chapters
**Severity**: High
**Current**: Cities are Open311 data ingestion endpoints and cross-city dashboard metrics. No community identity.
**Impact**: Portland vs Chicago vs Denver could generate healthy inter-city dynamics, but currently they're just administrative boundaries.

### Gap 3: No Group Rituals or Milestones
**Severity**: High
**Current**: Zero group-level celebrations, milestones, challenges, or shared narratives.
**Impact**: Christakis emphasizes that in-groups need shared stories and collective memories. Without them, group identity doesn't form.

### Gap 4: Cross-Group Dynamics Are Static
**Severity**: Medium
**Current**: Cross-city dashboard shows static comparisons. No friendly competition, joint challenges, or cross-pollination mechanisms.
**Impact**: In-group preference without constructive inter-group dynamics becomes destructive (out-group hostility). Healthy competition channels the energy positively.

### Gap 5: Onboarding Is System-Generated, Not Human-Welcoming
**Severity**: Medium
**Current**: Onboarding wizard is a 5-step system tutorial. No introduction to actual community members.
**Impact**: First impression is "this is a system" rather than "these are your people." Christakis shows that initial social framing predicts long-term engagement.

---

## 3. Design Proposals

### Design 1: Domain Community Pages

**What**: Give each of the 15 domains a home page with collective metrics, active missions, recent achievements, and community discussion.

**Page Structure**:
```
/domains/clean-water

┌─────────────────────────────────────────────────┐
│ 💧 Clean Water Community                        │
│ "Access to clean water is a human right."       │
│                                                 │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│ │ 47       │ │ 23       │ │ 8        │         │
│ │ Members  │ │ Missions │ │ Problems │         │
│ │          │ │ Complete │ │ Resolved │         │
│ └──────────┘ └──────────┘ └──────────┘         │
│                                                 │
│ 🏆 This Month's Impact                         │
│ • 5 water quality tests completed               │
│ • 2 filter installations verified               │
│ • Portland + Chicago both active                │
│                                                 │
│ 👥 Top Contributors                             │
│ Sarah Chen (Advocate) · James Park (Leader)     │
│                                                 │
│ 📋 Active Missions (12)                        │
│ [Browse Clean Water missions →]                 │
│                                                 │
│ 💬 Community Discussion                        │
│ [Latest threads...]                             │
│                                                 │
│ 📊 Domain Leaderboard                          │
│ [Top contributors this period...]               │
└─────────────────────────────────────────────────┘
```

**API**:
```
GET /domains/:domain/community
  → {
      domain, displayName, color, icon,
      stats: { memberCount, missionsCompleted, problemsResolved, activeMissions },
      topContributors: [...],
      recentAchievements: [...],
      monthlyImpact: { highlights: [...] }
    }
```

**Member Count**: Count of participants who have `primaryDomain` set (from Trait 1 design) or have completed 3+ missions in the domain.

### Design 2: City Chapter Pages

**What**: Give each city a community page with local identity, milestones, and celebration.

**Page Structure**:
```
/cities/portland

┌─────────────────────────────────────────────────┐
│ 🌲 Portland Chapter                            │
│ "Keep Portland Better"                          │
│                                                 │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│ │ 142      │ │ 89       │ │ 34       │         │
│ │ Members  │ │ Missions │ │ Problems │         │
│ │          │ │ Complete │ │ Resolved │         │
│ └──────────┘ └──────────┘ └──────────┘         │
│                                                 │
│ 🎯 Chapter Milestones                           │
│ ✅ 50 missions completed (reached Feb 2!)       │
│ ⬜ 100 missions completed (56% there)           │
│ ✅ First cross-city solution (with Chicago!)    │
│                                                 │
│ 🗺️ Impact Heatmap                              │
│ [Leaflet map with verified mission locations]   │
│                                                 │
│ 📋 Local Missions (18 active)                  │
│ [Browse Portland missions →]                    │
│                                                 │
│ 💬 Community Board                              │
│ [Local discussions...]                          │
└─────────────────────────────────────────────────┘
```

**API**:
```
GET /cities/:city/chapter
  → {
      city, tagline,
      stats: { memberCount, missionsCompleted, problemsResolved },
      milestones: [{ name, target, current, reachedAt }],
      heatmapData: [...],
      topContributors: [...]
    }
```

### Design 3: Group Milestones & Celebrations

**What**: Automated milestone tracking and collective celebration moments.

**Schema**:
```sql
CREATE TABLE group_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_type VARCHAR(20) NOT NULL,  -- domain, city
  group_value VARCHAR(100) NOT NULL,  -- 'clean_water', 'portland'
  milestone_type VARCHAR(50) NOT NULL,
  target_value INTEGER NOT NULL,
  current_value INTEGER NOT NULL DEFAULT 0,
  reached_at TIMESTAMPTZ,
  celebrated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(group_type, group_value, milestone_type, target_value)
);
```

**Milestone Types**:
| Milestone | Target Levels | Trigger |
|-----------|--------------|---------|
| Missions Completed | 10, 25, 50, 100, 250 | Mission completion |
| Problems Resolved | 5, 10, 25, 50, 100 | Problem status change |
| Members Joined | 10, 25, 50, 100 | Profile creation with domain/city |
| Perfect Week | 7 consecutive days with activity | Daily check |
| Cross-City Solution | 1, 5, 10 | Solution adopted in new city |

**Celebration Flow**:
1. Milestone reached → create celebration event
2. Notify all group members via WebSocket + in-app notification
3. Show celebration banner on group page for 7 days
4. Add milestone to group's permanent achievement timeline
5. All members active during the milestone period earn a badge

### Design 4: Cross-Group Challenges

**What**: Friendly competition between domains and cities that channels in-group energy constructively.

**Challenge Types**:

**City vs City** (monthly):
- "Which city completes the most missions in February?"
- Leaderboard visible on both city chapter pages
- Winning city gets a trophy badge on their page for the month
- **Rule**: Per-capita scoring to be fair across city sizes

**Domain Sprints** (bi-weekly):
- "Clean Water Sprint: Resolve 10 water quality problems in 2 weeks"
- Domain members collaborate to hit the target
- Progress bar on domain page
- All participants earn a sprint badge if target is hit

**Cross-Pollination Bonus**:
- When a contributor from one domain helps with a mission in a different domain, they earn a "Cross-Pollinator" activity on their portfolio
- Domains that receive the most cross-domain help earn a "Welcoming Community" badge

**Schema**:
```sql
CREATE TABLE group_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_type VARCHAR(30) NOT NULL,  -- city_vs_city, domain_sprint, cross_pollination
  title VARCHAR(200) NOT NULL,
  description TEXT,
  groups JSONB NOT NULL,  -- [{ type: 'city', value: 'portland' }, ...]
  metric VARCHAR(50) NOT NULL,  -- missions_completed, problems_resolved
  target_value INTEGER,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, completed
  results JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Design 5: Human-Welcoming Group Onboarding

**What**: When a newcomer joins a domain or city, they receive a welcome from existing community members — not just a system message.

**Mechanism**:
1. When a human completes onboarding and selects their primary domain + city:
2. System finds 2-3 active members in the same domain + city (advocate+ tier preferred)
3. Auto-generates a welcome message: "Welcome to Clean Water Portland! Here's what we're working on this month..."
4. Assigns a "Welcome Ambassador" role (rotated among advocates+) who sends a personal note
5. Newcomer sees "Your community" card on dashboard with ambassador's name and domain page link

**Welcome Ambassador Rotation**:
- Advocates and above in each domain/city are eligible
- System rotates ambassadors to distribute the load
- Ambassadors earn 1 ImpactToken per welcome (capped at 5/month)
- Ambassador can send a template-assisted personal message (not fully automated)

---

## 4. Implementation Plan

### Phase A: Domain Community Pages (4-5 days)

| # | Task | Impact |
|---|------|--------|
| A1 | Domain community stats aggregation service | Metrics |
| A2 | `GET /domains/:domain/community` API endpoint | API |
| A3 | Domain page with stats, top contributors, active missions | Frontend |
| A4 | Domain discussion integration (from Trait 3 design) | Community conversation |
| A5 | Domain leaderboard (filtered from existing leaderboard system) | Competition |
| A6 | Domain page navigation in main nav | Discoverability |

### Phase B: City Chapter Pages (3-4 days)

| # | Task | Impact |
|---|------|--------|
| B1 | City chapter stats aggregation service | Metrics |
| B2 | `GET /cities/:city/chapter` API endpoint | API |
| B3 | City chapter page with stats, heatmap, local missions | Frontend |
| B4 | City community board integration (from Trait 3 design) | Local conversation |
| B5 | Make cross-city dashboard public (not admin-only) | Accessibility |

### Phase C: Milestones & Celebrations (3-4 days)

| # | Task | Impact |
|---|------|--------|
| C1 | Create `group_milestones` table + migration | Foundation |
| C2 | Milestone tracking service (increment on mission completion, etc.) | Tracking |
| C3 | Celebration event generation + notification | Celebration |
| C4 | Milestone display on domain/city pages | Visibility |
| C5 | Celebration banner component | Frontend |
| C6 | Milestone badge distribution to active group members | Rewards |

### Phase D: Cross-Group Challenges (3-4 days)

| # | Task | Impact |
|---|------|--------|
| D1 | Create `group_challenges` table + migration | Foundation |
| D2 | Challenge creation service (admin or automated) | Setup |
| D3 | Challenge progress tracking (real-time metric increment) | Tracking |
| D4 | Challenge results computation and badge distribution | Resolution |
| D5 | Challenge leaderboard on domain/city pages | Visibility |
| D6 | Cross-pollination tracking and badge | Inter-group dynamics |

### Phase E: Group Onboarding (2-3 days)

| # | Task | Impact |
|---|------|--------|
| E1 | Welcome ambassador selection service (rotation logic) | Assignment |
| E2 | Welcome message generation + delivery | First impression |
| E3 | "Your community" card on new user dashboard | Belonging |
| E4 | Ambassador reward integration (1 token per welcome) | Incentive |

### Dependencies
- Phase A: Depends on domain discussion threads from Trait 3
- Phase B: Depends on community boards from Trait 3
- Phase C: Depends on Phases A and B (milestones display on group pages)
- Phase D: Depends on Phases A and B
- Phase E: Depends on Trait 1 (primaryDomain field) and Trait 2 (mentorship concept)

---

## 5. Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Domain page visits/week | 0 (no pages) | 200+ |
| City chapter visits/week | 0 (no pages) | 100+ |
| Group milestones celebrated/month | 0 | 10+ |
| Challenge participation rate | 0 | 40% of active domain members |
| Cross-domain contributions/month | Not tracked | 15% of contributions |
| Newcomers greeted by ambassador | 0% | 80%+ within 24 hours |
| "Sense of belonging" (survey) | Not measured | 7+/10 after 30 days |

---

## References

- Christakis, N. A. (2019). *Blueprint*, Ch. 7: "Us and Them" — how in-group preference creates cohesion and how to prevent it from becoming exclusion
- Red t-shirt experiment: Arbitrary group assignment still creates preference (Tajfel minimal group paradigm, extended by Christakis)
- Assessment: `docs/research/blueprint/00-blueprint-assessment.md`, §6
- Domain system: `landing-page/src/components/Domains.tsx`
- Specialist badges: `apps/web/src/components/validators/SpecialistBadge.tsx`
- Cross-city dashboard: `apps/web/src/components/admin/CrossCityDashboard.tsx`
- City configs: Open311 ingestion for Portland, Chicago, Denver
