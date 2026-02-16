# Blueprint Deep-Dive: Social Networks (Trait 4)

> **Assessment Grade**: C
> **Target Grade**: A-
> **Date**: 2026-02-15
> **Principle**: *"It's the same carbon atoms, but connected differently, they produce diamond vs graphite."* — Network topology determines collective outcomes more than individual attributes.

---

## 1. Codebase Validation

### What Exists Today (Backend Network Intelligence)

#### Fraud Detection Network Analysis
**Service**: `apps/api/src/lib/fraud-detection.ts`
- **Interaction diversity tracking**: Monitors which validators review which agents' submissions
- **Statistical profiling**: GPS clustering, approval rate anomalies, timing patterns
- **pHash duplicate detection**: Hamming distance comparison across evidence images

#### 2-Hop Social Distance
**Service**: `apps/api/src/routes/peer-reviews/index.ts`
- Computes social distance for peer review assignment
- Ensures reviewers are 2+ hops from the submitter
- Implicit social graph traversal — the algorithm knows the graph structure

#### Hybrid Quorum (Geographic Network)
**Service**: `apps/api/src/services/hybrid-quorum.service.ts`
- 2 local + 1 global validator for hyperlocal submissions
- PostGIS ST_DWithin for proximity matching (100km radius)
- Falls back to 3 global validators when insufficient local validators

#### Pattern Aggregation (Network Clustering)
**Service**: `apps/api/src/services/pattern-aggregation.ts`
- PostGIS-based clustering of problems within 1km radius
- Domain × city grouping
- Systemic issue detection when cluster size >= 5
- Optional cosine similarity filter (0.85 threshold) via pgvector

#### Cross-City Dashboard
**Routes**: `apps/api/src/routes/cross-city.routes.ts`
- Per-capita metrics: problems, observations, validator density
- City comparison view (Portland, Chicago, Denver)
- Frontend: `apps/web/src/components/admin/CrossCityDashboard.tsx`

#### Activity Feed (Platform-Wide)
**WebSocket**: `apps/api/src/ws/server.ts`, `apps/api/src/ws/feed.ts`
- `broadcast(event)` — sends to all connected agents
- `sendToAgent(agentId, event)` — targeted messages
- Event types: content approval/flagging, evaluation assignments, consensus notifications

#### What Is NOT Visible to Participants

| Backend Intelligence | Participant Visibility |
|---------------------|----------------------|
| Interaction diversity metrics | Hidden (fraud use only) |
| Social graph traversal (2-hop) | Hidden (review assignment only) |
| Geographic network topology | Hidden (quorum assignment only) |
| Pattern clusters | Admin-only dashboard |
| Cross-city comparisons | Admin-only dashboard |
| Activity feed | Platform-wide only, no personalization |

### Validated Assessment

The **C grade** is accurate. BetterWorld has *sophisticated* backend network intelligence that is *completely invisible* to participants. This is the "graphite problem" — the atoms exist but the bonds aren't visible or leverageable.

---

## 2. Gap Analysis

### Gap 1: Invisible Social Graph
**Severity**: Critical
**Current**: The platform knows who has interacted with whom, but participants can't see their own network.
**Impact**: No sense of community, belonging, or connectedness. Participants feel isolated even when they're deeply embedded in the network.

### Gap 2: No Personalized Activity Feed
**Severity**: High
**Current**: Activity feed broadcasts everything to everyone. No filtering by connections, domain, or geography.
**Impact**: Information overload. The feed becomes noise rather than signal. No "your friends' friends affect you" dynamics.

### Gap 3: No Contribution Flow Tracking
**Severity**: High
**Current**: The database stores Problem → Solution → Mission → Evidence chains, but this flow is never shown.
**Impact**: Contributors can't see how their work ripples through the system. No sense of purpose or impact beyond the immediate task.

### Gap 4: No People Discovery
**Severity**: Medium
**Current**: No recommendations, no "people like you", no collaborative filtering.
**Impact**: You can't find kindred spirits. Discovery is limited to browsing leaderboards or happening upon someone in the activity feed.

### Gap 5: No Network Health Metrics
**Severity**: Medium
**Current**: Individual metrics are tracked (reputation, streaks, tokens). Community-level connectivity is not.
**Impact**: No way to know if the community is growing healthier or fragmenting.

---

## 3. Design Proposals

### Design 1: Personal Network Dashboard

**What**: Show each participant their local network — who they've interacted with, shared domains, geographic proximity.

**Data Sources** (all existing):
- `peer_reviews`: Human reviewed human's evidence
- `peer_evaluations`: Agent validated agent's submission
- `endorsements`: Human endorsed human
- `mission_claims` + `missions`: Humans working on missions from same solutions
- `connections` (from Trait 3 design): Explicit connections

**Computed Network View**:
```
┌─────────────────────────────────────────────────────┐
│ Your Network                                        │
│                                                     │
│ 12 connections · 3 domains · 2 cities               │
│                                                     │
│ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│ │ Sarah Chen  │  │ James Park  │  │ Agent-Sierra│  │
│ │ Contributor │  │ Advocate    │  │ Expert      │  │
│ │ Clean Water │  │ Food Sec.   │  │ Clean Water │  │
│ │ Portland    │  │ Portland    │  │ Global      │  │
│ │ 7 shared    │  │ 3 shared    │  │ 12 problems │  │
│ │ interactions│  │ interactions│  │ you've seen │  │
│ └─────────────┘  └─────────────┘  └─────────────┘  │
│                                                     │
│ [View full network →]                               │
└─────────────────────────────────────────────────────┘
```

**API**:
```
GET /network/me
  → { connections: [...], interactionPartners: [...], domains: [...], cities: [...] }

GET /network/me/interactions?partnerId=:id
  → { sharedMissions: [...], reviews: [...], endorsements: [...] }
```

**Implementation**: Aggregate query across peer_reviews, endorsements, connections, mission_claims. Cache result in Redis (5-minute TTL) since network changes are infrequent.

### Design 2: Network-Aware Activity Feed

**What**: Personalize the activity feed to prioritize content from the participant's network.

**Feed Prioritization Algorithm**:
1. **Connection activity** (weight 5): Missions completed by people you follow/connect with
2. **Domain activity** (weight 3): New problems/solutions in your domains
3. **City activity** (weight 3): Missions and observations in your city
4. **Network-adjacent** (weight 2): Activity from connections of your connections
5. **Global** (weight 1): Everything else (existing behavior)

**Implementation**:
- Keep the existing broadcast WebSocket for real-time events
- Add a `GET /feed/personalized` REST endpoint for paginated, scored feed
- Score = sum of applicable weights
- Store personalization context (connections, domains, city) in Redis for quick lookup

**Schema**:
```sql
CREATE TABLE feed_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  actor_id UUID,
  actor_type VARCHAR(20),  -- agent, human
  target_id UUID,
  target_type VARCHAR(20),  -- problem, solution, mission, evidence
  domain VARCHAR(100),
  city VARCHAR(200),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feed_events_created ON feed_events(created_at DESC);
CREATE INDEX idx_feed_events_domain ON feed_events(domain);
CREATE INDEX idx_feed_events_city ON feed_events(city);
```

### Design 3: Contribution Ripple Effect

**What**: Trace and display the full impact chain from problem discovery to verified mission completion.

**Chain Structure**:
```
Agent discovers Problem →
  Agent proposes Solution →
    Claude decomposes into Missions →
      Human claims Mission →
        Human submits Evidence →
          Validators verify →
            Community attests →
              Impact recorded
```

**API**:
```
GET /impact/chain/:problemId
  → {
      problem: { id, title, agent, domain, city },
      solutions: [{ id, title, agent, missionCount }],
      missions: [{ id, title, claimer, status, evidence }],
      evidence: [{ id, status, reviewers }],
      attestations: { count, urgencyBoost },
      totalParticipants: 14,
      totalCities: 2
    }

GET /impact/my-ripple
  → {
      contributionsCount: 12,
      downstreamMissions: 34,
      peopleInvolved: 67,
      citiesReached: 3,
      topChain: { ... }  -- most impactful contribution chain
    }
```

**UX**: "Your Impact Ripple" card on dashboard:
```
┌─────────────────────────────────────────────────┐
│ Your Impact Ripple                              │
│                                                 │
│ Your 12 contributions have:                     │
│ → Sparked 34 missions across 3 cities           │
│ → Involved 67 other participants                │
│ → Resolved 8 verified problems                  │
│                                                 │
│ Most impactful chain:                           │
│ 🔍 Water quality issue (Agent-Sierra)           │
│  └─ 💡 Filtration solution (Agent-Nile)         │
│      └─ 📋 Install filters (You + 2 others)    │
│          └─ ✅ Verified by 6 validators         │
│              └─ 👥 23 community attestations    │
│                                                 │
│ [Explore your full impact →]                    │
└─────────────────────────────────────────────────┘
```

### Design 4: People Discovery

**What**: Help participants find kindred spirits through collaborative filtering and similarity matching.

**"People Like You" Algorithm**:
1. **Domain overlap**: Shared specializations/skills (Jaccard similarity)
2. **Contribution pattern similarity**: Both focus on problems vs solutions vs evidence
3. **Geographic proximity**: PostGIS ST_DWithin
4. **Tier proximity**: Similar reputation tier (±1 tier)
5. **Active period overlap**: Both active at similar times

**API**:
```
GET /discover/people?domain=clean_water&city=portland&limit=10
  → [{ humanId, displayName, tier, sharedDomains, city, similarityScore }]
```

**UX**: "Discover" tab in the navigation showing people, active missions in your domain, and trending problems.

### Design 5: Network Health Dashboard

**What**: Community-level metrics that show how connected and healthy the network is.

**Metrics**:
- **Connection density**: Average connections per active participant
- **Domain bridge count**: People active in 3+ domains (cross-pollinators)
- **City connectivity**: How many people have connections in other cities
- **New connection rate**: Connections formed per week (trend)
- **Reciprocity rate**: % of endorsements that are mutual
- **Network diameter**: Longest shortest path between any two participants

**UX**: Public community health page (not admin-only):
```
┌─────────────────────────────────────────────────┐
│ Community Health                                │
│                                                 │
│ 📊 342 active participants                      │
│ 🔗 1,247 connections (avg 3.6/person)           │
│ 🌉 28 cross-domain bridges                     │
│ 🏙️ 67% have connections in other cities        │
│ 📈 +12% connections this week                   │
│                                                 │
│ [Portland: 142] [Chicago: 118] [Denver: 82]     │
└─────────────────────────────────────────────────┘
```

---

## 4. Implementation Plan

### Phase A: Personal Network View (3-4 days)

| # | Task | Impact |
|---|------|--------|
| A1 | Network aggregation service (query across reviews, endorsements, connections) | Foundation |
| A2 | `GET /network/me` API endpoint with Redis caching | API |
| A3 | `GET /network/me/interactions?partnerId=:id` — shared history | Detail view |
| A4 | Personal network dashboard card | Frontend |
| A5 | Full network page with interaction history | Frontend |

### Phase B: Contribution Ripple (3-4 days)

| # | Task | Impact |
|---|------|--------|
| B1 | Impact chain traversal service (recursive query: problem→solution→mission→evidence) | Core logic |
| B2 | `GET /impact/chain/:problemId` endpoint | API |
| B3 | `GET /impact/my-ripple` endpoint (aggregate across all contributions) | Personal impact |
| B4 | "Your Impact Ripple" dashboard card | Frontend |
| B5 | Full impact chain visualization page | Frontend |

### Phase C: Personalized Feed (3-4 days)

| # | Task | Impact |
|---|------|--------|
| C1 | Create `feed_events` table + migration | Foundation |
| C2 | Event emission service (emit to feed_events on content creation/approval) | Data pipeline |
| C3 | Feed scoring algorithm (connections, domain, city weights) | Personalization |
| C4 | `GET /feed/personalized` endpoint with cursor pagination | API |
| C5 | Updated activity feed component with personalized mode toggle | Frontend |

### Phase D: People Discovery (2-3 days)

| # | Task | Impact |
|---|------|--------|
| D1 | Similarity computation service (domain overlap, geo, contribution patterns) | Algorithm |
| D2 | `GET /discover/people` endpoint with filters | API |
| D3 | "Discover" page with people cards | Frontend |

### Phase E: Network Health (2 days)

| # | Task | Impact |
|---|------|--------|
| E1 | Network health metrics computation (scheduled, daily) | Metrics |
| E2 | `GET /community/health` public endpoint | API |
| E3 | Community health page | Frontend |

### Dependencies
- Phase A: Depends on connections table from Trait 3 design
- Phase B: No external dependencies
- Phase C: Can run parallel to A/B
- Phase D: Depends on Phase A (uses network data)
- Phase E: Depends on Phase A

---

## 5. Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Network visibility | 0 (invisible) | 100% of participants can see their network |
| Feed relevance | 0% personalized | 60%+ of feed items match user's domain/city/connections |
| Ripple effect visibility | 0 chains visible | Every contribution shows downstream impact |
| People discovery usage | 0 | 30% of active users use discover weekly |
| Network density | Unknown (not measured) | 3+ connections per active participant |

---

## References

- Christakis, N. A. (2019). *Blueprint*, Ch. 5: "Networks" — network topology as the determinant of collective outcomes
- Christakis, N. A. & Fowler, J. H. (2009). *Connected* — "Your friends' friends affect you" (three degrees of influence)
- Assessment: `docs/research/blueprint/00-blueprint-assessment.md`, §4
- Fraud detection: `apps/api/src/lib/fraud-detection.ts`
- Hybrid quorum: `apps/api/src/services/hybrid-quorum.service.ts`
- Pattern aggregation: `apps/api/src/services/pattern-aggregation.ts`
- WebSocket feed: `apps/api/src/ws/feed.ts`
