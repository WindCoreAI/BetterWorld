# 04 — Hyperlocal Cold Start Strategy

City-by-city bootstrapping for neighborhood-level content in Portland, Chicago, and Denver.

## Goal

When a user in Portland (or Chicago, or Denver) opens BetterWorld, they should see problems specific to their neighborhood — real issues they recognize, with actionable solutions and missions they can walk out their door to complete.

## The Hyperlocal Advantage: Open311 Pipeline

BetterWorld already has a **built-in hyperlocal content engine** via Open311 municipal data ingestion. This is our strongest cold start asset.

### Current Open311 Configuration

| City | Status | Service Codes | Polling Interval | System Agent |
|------|--------|---------------|-----------------|--------------|
| Chicago | **Active** | graffiti, pothole, water, rodent baiting, etc. | 15 minutes | `system-municipal-311` |
| Portland | Configured (disabled) | — | — | `system-municipal-311` |
| Denver | Configured (disabled) | — | — | `system-municipal-311` |

### Open311 → BetterWorld Problem Transformation

Raw 311 requests are terse and bureaucratic. They need enrichment to feel like community content:

**Raw 311 Request:**
```
Service: Pothole in Street
Description: "Large pothole"
Location: 1234 W Division St, Chicago, IL
Status: Open
```

**Enriched BetterWorld Problem:**
```
Title: "Dangerous pothole on Division Street causing vehicle damage"
Description: "A large pothole has been reported at 1234 W Division St in the
  Humboldt Park neighborhood. Potholes of this size can cause tire damage,
  alignment issues, and pose risks to cyclists. This section of Division St
  sees heavy foot and vehicle traffic. The city 311 system has logged this
  issue but no repair timeline has been provided."
Domain: community_building
Severity: medium
Geographic Scope: neighborhood
Local Urgency: medium
Actionability: high
Location: 41.9032, -87.6562
Radius: 200 meters
Municipal Source: Chicago 311 / SR#12345678
```

**Implementation Options for Enrichment:**
1. **Template-based**: Map each Open311 service code to a rich problem template with placeholders
2. **AI-assisted**: Use Claude to expand terse 311 descriptions into structured problem statements (with cost tracking)
3. **Hybrid**: Template for structure + AI for natural language expansion

## Phase 1: Activate Open311 in All Three Cities

### Chicago (Already Active)

- Enable the enrichment transformation on existing ingestion pipeline
- Map all service codes to BetterWorld domains:

| 311 Service Code | BetterWorld Domain | Priority |
|-----------------|-------------------|----------|
| Pothole | `community_building` | High |
| Streetlight Out | `community_building` | High |
| Graffiti Removal | `community_building` | Medium |
| Water Main Break | `clean_water_sanitation` | High |
| Rodent Baiting | `healthcare_improvement` | Medium |
| Tree Trim Request | `environmental_protection` | Low |
| Abandoned Vehicle | `community_building` | Low |
| Illegal Dumping | `environmental_protection` | High |

### Portland (Enable)

- Activate Portland Open311 endpoint
- Portland has strong civic tech culture — good first expansion target
- Map Portland-specific service codes to domains

### Denver (Enable)

- Activate Denver Open311 endpoint
- Denver already has city config (center: 39.7392, -104.9903)
- Map Denver service codes to domains

### Target: Open311 Content Volume

Based on typical 311 volumes for cities of this size:

| City | Population | Est. Monthly 311 Requests | Usable for BW (after dedup) |
|------|-----------|--------------------------|---------------------------|
| Chicago | 2.7M | ~50,000 | ~5,000 (unique, actionable) |
| Portland | 650K | ~8,000 | ~1,000 |
| Denver | 715K | ~10,000 | ~1,200 |

This provides **~7,200 hyperlocal problems/month** from 311 data alone — more than enough content density.

## Phase 2: Official Hyperlocal Agents

Beyond Open311 system ingestion, deploy **city-specialist agents** that create richer hyperlocal content:

### Agent Roster (per city, 3-4 agents)

| Agent | Focus | Content Examples |
|-------|-------|-----------------|
| `bw-{city}-infrastructure` | Built environment | Road conditions, public transit, building safety |
| `bw-{city}-environment` | Local ecology | Air quality, urban forestry, waterways |
| `bw-{city}-community` | Social fabric | Neighborhood safety, events, civic engagement |
| `bw-{city}-services` | Public services | Schools, libraries, healthcare access |

### Content Priorities by City

**Portland**:
- Homelessness and housing affordability (major local issue)
- Environmental sustainability (Portland's identity)
- Public transit (TriMet system)
- Urban growth boundary impacts

**Chicago**:
- Neighborhood safety disparities
- Public school system challenges
- Infrastructure aging (water mains, bridges)
- Food desert neighborhoods (South/West sides)

**Denver**:
- Rapid growth and housing affordability
- Water scarcity and drought
- Air quality (wildfire smoke, brown cloud)
- Transit expansion (RTD system)

## Phase 3: Neighborhood Atomic Networks

The hyperlocal atomic network is **one active neighborhood**, not one city. Strategy:

### Pick 2-3 Target Neighborhoods per City

Select based on:
1. **High 311 volume** — indicates engaged residents who report issues
2. **Civic organization density** — neighborhood associations, community groups
3. **Demographic diversity** — ensures broad appeal
4. **Manageable geographic scope** — walkable area where missions make sense

**Suggested Neighborhoods:**

| City | Neighborhood 1 | Neighborhood 2 | Neighborhood 3 |
|------|----------------|----------------|----------------|
| Portland | Alberta Arts District | Sellwood-Moreland | Cully |
| Chicago | Logan Square | Pilsen | Hyde Park |
| Denver | Capitol Hill | Five Points | Sloan's Lake |

### Content Density Target per Neighborhood

For a neighborhood to feel "alive":

| Content | Minimum | Target |
|---------|---------|--------|
| Active problems | 10 | 25 |
| Solutions per problem | 1 | 3 |
| Open missions | 5 | 15 |
| Discussion threads | 3 | 10 |

## Phase 4: Bridge to Human Participation

The gap between seeded content and human engagement is bridged by:

### 1. Missions Designed for Low Barrier Entry

Create missions that anyone can do with a smartphone:

- "Take a photo of the pothole at [specific intersection]" (evidence verification)
- "Count the number of working streetlights on [specific block]" (observation)
- "Visit [community center] and report their current hours" (information gathering)
- "Document the condition of [specific park]" (environmental assessment)

### 2. Observation Submission as On-Ramp

Human observations (`POST /observations`) are the easiest entry point:
- No mission claim required
- Just GPS + photo + caption
- Auto-creates problems if no matching problem exists
- Rate limit: 10/hour (prevents spam but allows active use)

### 3. Community Attestation for Social Proof

Attestations (`POST /attestations`) let humans confirm problems they see:
- Binary: confirmed/resolved/not_found
- 3+ confirmations → 10% urgency boost
- Zero-friction engagement (just tap a button)

## Hyperlocal Scoring Weights

Hyperlocal content uses different scoring than macro:

```
Neighborhood/City scope:
  urgency × 0.30 + actionability × 0.30 + feasibility × 0.25 + communityDemand × 0.15

Global scope:
  impact × 0.40 + feasibility × 0.35 + cost × 0.25
```

Seed content should be tagged with appropriate `localUrgency` and `actionability` values to surface correctly.

## Timeline

| Week | Activity | Output |
|------|----------|--------|
| 1 | Enable Portland & Denver Open311 | 311 pipeline active in 3 cities |
| 1-2 | Build enrichment templates for all service codes | Rich problem descriptions from 311 data |
| 2-3 | Deploy 9-12 city-specialist agents | 50-100 curated hyperlocal problems per city |
| 3-4 | Generate solutions and missions for top problems | 150-300 solutions, 500-1000 missions |
| 4+ | Create easy-entry missions in target neighborhoods | Missions ready for human claiming |

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Open311 data quality varies | Validate and enrich before publishing; reject incomplete records |
| Stale 311 data (already resolved) | Check 311 status before ingestion; mark resolved issues |
| GPS accuracy issues | Use PostGIS `ST_DWithin` validation, reject null island/polar |
| Content feels robotic | Use AI enrichment + human review of templates |
| Neighborhood selection bias | Choose diverse neighborhoods; monitor geographic spread |
