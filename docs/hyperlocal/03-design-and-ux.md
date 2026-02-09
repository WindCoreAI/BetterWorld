> **Hyperlocal Extension** — Design & UX | [Product Requirements](01-product-requirements.md) · [Technical Architecture](02-technical-architecture.md) · [Design & UX](03-design-and-ux.md)

# Hyperlocal Extension: Design & UX

> **Document Type**: Design & UX Specification
> **Version**: 1.0.0
> **Last Updated**: 2026-02-09
> **Author**: Design Team
> **Status**: Draft for Engineering Handoff
> **Prerequisite Reading**: `docs/design/01a-brand-identity.md`, `docs/design/01b-design-system.md`, `docs/design/02a-ux-ia-and-core-flows.md`
>
> This document specifies the design and UX extensions required to support neighborhood-scale hyperlocal functionality within the BetterWorld platform. It builds upon the existing design system (calm neumorphic aesthetic, Tailwind CSS 4, BetterWorld brand identity) and introduces map-first, mobile-first patterns for local community engagement.
>
> **Key Design Decision**: Hyperlocal is an extension of the existing platform, not a separate app. Problems, missions, and evidence share the unified data model. The UX must integrate hyperlocal features without fragmenting the experience.

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Information Architecture Extensions](#2-information-architecture-extensions)
3. [Core User Flows](#3-core-user-flows)
4. [Key Components](#4-key-components)
5. [Mobile-First Considerations](#5-mobile-first-considerations)
6. [Map Design](#6-map-design)
7. [Accessibility](#7-accessibility)
8. [Empty States & Onboarding](#8-empty-states--onboarding)
9. [Design Tokens & Theme Extensions](#9-design-tokens--theme-extensions)
10. [Responsive Behavior](#10-responsive-behavior)

---

## 1. Design Philosophy

### 1.1 How Hyperlocal UX Differs from Macro

The existing BetterWorld platform is designed around a **dashboard/board paradigm** -- users browse curated lists of problems, solutions, and missions organized by domain and relevance score. This works well for macro-scale issues (national healthcare gaps, global environmental patterns) where the user's physical location is secondary to the content.

Hyperlocal inverts this. The user's **current location is the primary context**. The interface must answer: "What is happening around me right now?" before it asks "What domain are you interested in?"

| Dimension | Macro (Existing) | Hyperlocal (Extension) |
|-----------|-----------------|----------------------|
| **Primary axis** | Domain / topic | Geography / proximity |
| **Entry point** | Problem board (list/grid) | Neighborhood map (spatial) |
| **Content discovery** | Search + filter + sort | Map pan/zoom + radius |
| **Evidence type** | Documents, data, research | Geotagged photos, GPS observations |
| **User posture** | Seated, desktop, browsing | Walking, mobile, camera-ready |
| **Friction tolerance** | Medium (research task) | Very low (quick observation) |
| **Time investment** | 10-60 minutes per session | 30 seconds to 5 minutes |
| **Information density** | High (scores, debates, data) | Low (photo, pin, short description) |

### 1.2 Core Design Principles for Hyperlocal

1. **Map-first, not list-first.** The default view for hyperlocal is a map centered on the user's location. Lists exist as an alternative, not the primary mode.

2. **Mobile-first, truly.** The macro platform is "mobile-responsive." Hyperlocal is "mobile-native." The observation flow must work one-handed while standing on a sidewalk.

3. **Photo-first evidence.** A geotagged photo with GPS coordinates and a timestamp is the atomic unit of hyperlocal evidence. Text descriptions are secondary. The camera is the primary input device.

4. **Progressive disclosure.** Show the minimum: a map pin, a photo, a distance. Reveal detail (scores, debates, agent analysis) on demand.

5. **Ambient awareness.** The neighborhood dashboard should function like a weather app -- glanceable, always up to date, showing the current state of the user's immediate environment.

6. **Continuity with macro.** A pothole reported locally can escalate into a city-wide infrastructure problem. A local food desert observation feeds into a national food security analysis. The UX must make this escalation path visible and natural.

### 1.3 Civic Tech UX Lessons Applied

Research on existing civic tech platforms informs several design decisions:

| Pattern Source | What We Adopt | What We Improve |
|---------------|--------------|----------------|
| **SeeClickFix** | 3-step report flow (pin, photo, submit) | Add problem-linking: observations connect to the AI-analyzed problem graph, not just a support ticket queue |
| **FixMyStreet** | Map-first drop-pin interface | Add the solution/mission pipeline -- reporting is step 1, not the whole experience |
| **SiteCam/Timemark** | GPS+timestamp photo capture, timeline comparisons | Integrate into the BetterWorld evidence verification pipeline with AI validation |
| **Nextdoor** | Neighborhood identity, local stats | Add structured impact tracking instead of free-form discussion threads |

---

## 2. Information Architecture Extensions

### 2.1 New Navigation: "My Neighborhood" Section

The hyperlocal extension adds a new top-level navigation section alongside the existing items.

**Desktop Top Bar (extended):**

```
+------------------------------------------------------------------+
| [Logo] BetterWorld   Explore  Neighborhood  Missions  Impact  [N] 40IT [A] |
+------------------------------------------------------------------+
```

- "Neighborhood" is a new primary nav item between "Explore" and "Missions"
- On hover/click, it opens a dropdown:

```
+----------------------+
| Map View             |
| Recent Activity      |
| My Observations      |
| Local Stats          |
+----------------------+
```

**Mobile Bottom Navigation (extended):**

```
+-----------+-----------+-----------+-----------+-----------+
|  Explore  |  Local    |  Missions |  Impact   |  Profile  |
|  [Search] |  [MapPin] |  [Target] |  [Chart]  |  [User]   |
+-----------+-----------+-----------+-----------+-----------+
                  +---------+
                  |  [Cam]  |  <-- FAB becomes camera shortcut
                  +---------+       in local context
```

- The mobile bottom nav adds a "Local" tab (replaces or sits alongside Explore depending on user preference)
- The Floating Action Button becomes a camera icon in the neighborhood context, launching the quick observation flow

### 2.2 Route Map Extensions

```
betterworld.ai/
│
├── /neighborhood
│   ├── / .......................................... Neighborhood Map (default)
│   │   (Map centered on user location, clustered
│   │    problem pins, nearby mission markers)
│   │
│   ├── /activity .................................. Local Activity Feed
│   │   (Recent observations, problem updates,
│   │    mission completions in the area)
│   │
│   ├── /observations .............................. My Observations
│   │   (User's submitted observations with status)
│   │
│   ├── /stats ..................................... Local Stats Dashboard
│   │   (Neighborhood impact score, trends,
│   │    community leaderboard)
│   │
│   └── /observe ................................... Quick Observation Flow
│       (Camera -> categorize -> submit)
│
├── /problems/:id .................................. Problem Detail (extended)
│   (Now includes: observation gallery, local
│    context panel, spatial cluster view)
│
├── /missions/:id .................................. Mission Detail (extended)
│   (Now includes: location preview, navigation
│    link, proximity indicator)
│
```

### 2.3 Content Hierarchy Extensions

The existing content hierarchy (Problem > Solution > Mission > Evidence) gains a new leaf node:

```
Problem (reported by Agent or aggregated from observations)
  ├── Observations (hyperlocal, human-submitted)
  │   ├── Geotagged Photo (GPS + timestamp + accuracy)
  │   ├── Category/Domain tag
  │   ├── Brief description (optional, 500 char max)
  │   └── Linked Problem (auto or manual)
  │
  ├── Local Context Panel
  │   ├── Observation cluster map (all related observations)
  │   ├── Temporal pattern ("12 reports in last 7 days")
  │   └── Municipal data overlay (if available)
  │
  ├── Solutions (proposed by Agents)
  │   └── Missions (decomposed tasks)
  │       ├── Location requirements (GPS coordinates + radius)
  │       ├── Evidence requirements (before/after photos)
  │       └── Navigation link ("Get directions")
  │
  └── Aggregation Insights (AI-generated)
      ├── "Pattern detected: 12 broken sidewalk reports on Oak St"
      ├── Cluster visualization on mini-map
      └── Escalation recommendation ("Qualifies as city-wide issue")
```

### 2.4 Integration with Existing IA

The hyperlocal extension integrates into the existing platform at three touch points:

**Touch Point 1: Problem Board Enhancement**

The existing Problem Discovery Board (`/explore/problems`) gains a "Near Me" toggle that filters to the user's location:

```
+----------------------------------------------------------+
| Problems                    [All] [Near Me (3km)]         |
|                                                           |
| When "Near Me" is active:                                 |
| - Problems sorted by distance (closest first)             |
| - Distance badge shown on each card                       |
| - Map toggle available in header                          |
| - Observation count shown (not just evidence count)       |
+----------------------------------------------------------+
```

**Touch Point 2: Mission Marketplace Enhancement**

The existing Mission Marketplace (`/missions`) already has a map view. Hyperlocal extends it:

- Default map zoom becomes neighborhood-level (zoom 14-15) when user has location enabled
- Mission pins include a "walking time" estimate badge
- Filter bar gains a "Walk/Bike/Drive" radius toggle

**Touch Point 3: Evidence Gallery Enhancement**

The existing Evidence Gallery component gains hyperlocal capabilities:

- Observation photos show GPS verification badge
- Timeline view for before/after comparisons
- Cluster map tab showing spatial distribution of observations

---

## 3. Core User Flows

### 3.1 Flow 1: Discover Local Problems

**Goal**: User opens the app and discovers what issues exist in their neighborhood.
**Entry point**: "Local" tab (mobile) or "Neighborhood" nav item (desktop).
**Estimated time**: 30-60 seconds.

```
Step 1: Neighborhood Map                           [~5 sec]
+-----------------------------------------------------+
|  My Neighborhood                        [List] [Map] |
|                                                       |
|  +---------------------------------------------------+
|  |                                                   |
|  |        [Cluster: 8]                               |
|  |            *                                      |
|  |                                                   |
|  |                    *  Broken sidewalk              |
|  |    [You]              (Healthcare)                |
|  |      O                                            |
|  |         *  Overflowing drain                      |
|  |                                                   |
|  |                         [Cluster: 3]              |
|  |                              *                    |
|  |                                                   |
|  |  [+][-]  [Locate]  [Filter]                       |
|  +---------------------------------------------------+
|                                                       |
|  Nearby (within 2 km):                                |
|  +---------------------------------------------------+
|  | [Photo]  Broken sidewalk on Oak St     0.3 km     |
|  |          ENVIRONMENT · 4 observations · 2d ago     |
|  +---------------------------------------------------+
|  | [Photo]  Overflowing drain at 5th Ave  0.8 km     |
|  |          CLEAN WATER · 2 observations · 5h ago     |
|  +---------------------------------------------------+
|  | [Photo]  Abandoned lot needs cleanup   1.2 km     |
|  |          COMMUNITY · 7 observations · 1w ago       |
|  +---------------------------------------------------+
|                                                       |
+-----------------------------------------------------+

Map behavior:
  - Centered on user's current location (or last known)
  - Default zoom: 14 (neighborhood level, ~1-2 km visible)
  - Problem pins colored by domain
  - Clusters show aggregate count at low zoom
  - User location: pulsing blue dot with accuracy ring
  - Tapping a pin shows quick-preview card (see Step 2)
```

```
Step 2: Problem Pin Preview                        [~3 sec]
+-----------------------------------------------------+
|                                                       |
|  (Map with selected pin highlighted)                  |
|                                                       |
|  +-------------------------------------------+       |
|  |  [Hero Photo Thumbnail]                    |       |
|  |                                            |       |
|  |  Broken sidewalk on Oak St                 |       |
|  |  ENVIRONMENT · HIGH urgency                |       |
|  |                                            |       |
|  |  0.3 km away · 4 observations · 2 days ago|       |
|  |  [View Details >]                          |       |
|  +-------------------------------------------+       |
|                                                       |
+-----------------------------------------------------+

Preview card:
  - Appears above the tapped pin
  - Width: 280px (matches existing map popup spec)
  - Hero photo: first observation photo, 16:9 crop
  - Domain badge + urgency badge
  - Distance from user
  - Observation count (not evidence count -- different metric)
  - Tap "View Details" -> Problem Detail page
  - Tap elsewhere on map -> dismiss preview
```

```
Step 3: Problem Detail (with Local Context)        [~30 sec]
+-----------------------------------------------------+
|  < Back to Neighborhood                               |
|  Breadcrumb: Neighborhood > Broken sidewalk on Oak St |
|                                                       |
|  ENVIRONMENT · HIGH urgency · Local Scope             |
|                                                       |
|  Broken sidewalk on Oak St between                    |
|  3rd and 5th Avenue                                   |
|  ──────────────────────────────────                   |
|                                                       |
|  Reported by: AI aggregation from 4 observations      |
|  First reported: Feb 5, 2026                          |
|  Last activity: 2 hours ago                           |
|                                                       |
|  OBSERVATION GALLERY (4)                     [+ Add]  |
|  ──────────────────────                               |
|  +-------+ +-------+ +-------+ +-------+             |
|  | [Img] | | [Img] | | [Img] | | [Img] |             |
|  | GPS:Y | | GPS:Y | | GPS:Y | | GPS:Y |             |
|  | Feb 5 | | Feb 6 | | Feb 6 | | Feb 7 |             |
|  +-------+ +-------+ +-------+ +-------+             |
|                                                       |
|  LOCAL CONTEXT                                        |
|  ─────────────                                        |
|  +-------------------------------------------+       |
|  | [Mini cluster map showing all 4            |       |
|  |  observation locations on Oak St]          |       |
|  |                                            |       |
|  |    *  *     *       *                      |       |
|  |  --[Oak Street]--                          |       |
|  +-------------------------------------------+       |
|                                                       |
|  Pattern: 4 reports spanning 200m of sidewalk         |
|  Trend: 2 new observations in last 48 hours           |
|  Similar nearby: 3 other sidewalk issues within 1 km  |
|                                                       |
|  LINKED SOLUTIONS (1)                                 |
|  ────────────────────                                 |
|  #S-4521 "Community sidewalk repair initiative"       |
|  Score: 7.2/10 · 2 missions · [View >]               |
|                                                       |
|  NEARBY MISSIONS (2)                                  |
|  ───────────────────                                  |
|  +-------------------------------------------+       |
|  | Document all sidewalk damage on Oak St     |       |
|  | EASY · 10 IT · 0.3 km · ~30 min           |       |
|  | [Claim Mission]                            |       |
|  +-------------------------------------------+       |
|                                                       |
+-----------------------------------------------------+
```

---

### 3.2 Flow 2: Submit an Observation

**Goal**: User sees an issue in the real world and submits a quick observation.
**Entry point**: FAB camera button (mobile) or "Report Observation" button (desktop).
**Estimated time**: 30-60 seconds.
**Critical requirement**: Must work one-handed on mobile.

```
Step 1: Camera Capture                             [~10 sec]
+-----------------------------------------------------+
|                                                       |
|  (Full-screen camera viewfinder)                      |
|                                                       |
|  +---------------------------------------------------+
|  |                                                   |
|  |                                                   |
|  |                                                   |
|  |          (Live camera feed)                        |
|  |                                                   |
|  |                                                   |
|  |                                                   |
|  +---------------------------------------------------+
|                                                       |
|  GPS: 45.5231N, 122.6765W        Accuracy: 3m        |
|  [Green dot] Location locked                          |
|                                                       |
|  Tips: Hold steady. Include surroundings for context. |
|                                                       |
|        +------+                                       |
|        |      |                                       |
|        | [  ] |  <-- Shutter button (80px, centered)  |
|        |      |                                       |
|        +------+                                       |
|                                                       |
|  [X Close]                         [Gallery import]   |
|                                                       |
+-----------------------------------------------------+

Camera screen:
  - Full-screen viewfinder, no chrome except controls
  - GPS indicator: green dot + coordinates + accuracy
  - Accuracy badge: green (<10m), amber (10-50m), red (>50m)
  - Timestamp: auto-captured, not displayed (reduces clutter)
  - Shutter button: 80px circle, centered at bottom
  - Close: top-left X, returns to previous screen
  - Gallery: bottom-right, import existing photo (GPS
    extracted from EXIF if available)
  - Tip text: contextual, rotates between 3 tips
```

```
Step 2: Categorize & Describe                      [~15 sec]
+-----------------------------------------------------+
|  New Observation                             [X]     |
|                                                       |
|  +-------------------------------------------+       |
|  | [Photo preview, 16:9, with GPS badge]      |       |
|  | GPS: 45.5231N, 122.6765W  [Verified]       |       |
|  +-------------------------------------------+       |
|                                                       |
|  What did you observe?                                |
|                                                       |
|  Category (select one):                               |
|  +----------+ +----------+ +----------+               |
|  | Infrastr.| | Environ. | | Health   |               |
|  | [Road]   | | [Leaf]   | | [Heart]  |               |
|  +----------+ +----------+ +----------+               |
|  +----------+ +----------+ +----------+               |
|  | Safety   | | Community| | Water    |               |
|  | [Shield] | | [Users]  | | [Drop]   |               |
|  +----------+ +----------+ +----------+               |
|  [See all 15 domains >]                               |
|                                                       |
|  Brief description (optional):                        |
|  [Cracked sidewalk, tripping hazard______]            |
|  (500 characters max)                                 |
|                                                       |
|  How urgent is this?                                  |
|  ( ) Immediate danger                                 |
|  (*) Needs attention within days                      |
|  ( ) Can wait weeks                                   |
|  ( ) Low priority                                     |
|                                                       |
|  +-------------------------------------------+       |
|  |          Submit Observation                |       |
|  +-------------------------------------------+       |
|                                                       |
+-----------------------------------------------------+

Categorize screen:
  - Photo preview at top with GPS verification badge
  - Category: 6 most common shown, "See all" expands to 15
  - Category chips: domain icon + short label, single-select
  - Description: optional, short text, one-handed friendly
  - Urgency: radio buttons with simple labels
  - Submit button: full-width primary, bottom of screen
  - Entire flow reachable with thumb on right hand
```

```
Step 3: Confirmation & Linking                     [~5 sec]
+-----------------------------------------------------+
|                                                       |
|  +-------------------------------------------+       |
|  |                                            |       |
|  |    Observation Submitted!                  |       |
|  |                                            |       |
|  |    +5 IT earned                            |       |
|  |                                            |       |
|  |    Your observation was linked to:         |       |
|  |    "Broken sidewalk on Oak St"             |       |
|  |    (4 other observations)                  |       |
|  |                                            |       |
|  |    [View Problem]    [Submit Another]      |       |
|  |                                            |       |
|  +-------------------------------------------+       |
|                                                       |
+-----------------------------------------------------+

Linking logic:
  - System checks GPS proximity to existing problems
  - If match (within 200m of similar-category problem):
    auto-link and show "linked to" message
  - If no match: creates a new observation, shown as
    "standalone" until AI aggregation runs
  - Token reward: 5 IT for observation, instant
```

---

### 3.3 Flow 3: Claim a Local Mission

**Goal**: User finds and claims a mission near their current location.
**Entry point**: Neighborhood map mission pins, or "Nearby Missions" list.
**Estimated time**: 30-60 seconds.

```
Step 1: Browse Nearby Missions on Map              [~15 sec]
+-----------------------------------------------------+
|  Missions Near Me                    [List] [Map]    |
|                                                       |
|  +-------------------------------------------+       |
|  | Filters: [Domain v] [Difficulty v]         |       |
|  | [Walk < 15 min] [Bike < 30 min] [Any]      |       |
|  +-------------------------------------------+       |
|                                                       |
|  +---------------------------------------------------+
|  |                                                   |
|  |    [Mission Pin]         [Mission Pin]            |
|  |    10 IT, Easy           25 IT, Medium            |
|  |                                                   |
|  |          [You]                                    |
|  |            O                                      |
|  |                                                   |
|  |                   [Mission Pin]                   |
|  |                   15 IT, Easy                     |
|  |                                                   |
|  +---------------------------------------------------+
|                                                       |
|  3 missions within walking distance:                  |
|                                                       |
|  +-------------------------------------------+       |
|  | [Photo] Document water fountains           |       |
|  | ENVIRONMENT · Easy · 10 IT                 |       |
|  | 0.4 km · 8 min walk · ~30 min task         |       |
|  | Evidence: 5 geotagged photos required      |       |
|  | [Claim]                                    |       |
|  +-------------------------------------------+       |
|  +-------------------------------------------+       |
|  | [Photo] Survey sidewalk damage on Oak St   |       |
|  | COMMUNITY · Medium · 25 IT                 |       |
|  | 0.3 km · 5 min walk · ~1 hr task           |       |
|  | Evidence: before/after photos + checklist   |       |
|  | [Claim]                                    |       |
|  +-------------------------------------------+       |
|                                                       |
+-----------------------------------------------------+

Mission pin design:
  - Pin shape: rounded rectangle (not circle) to
    differentiate from problem pins
  - Color: domain color
  - Content: token reward + difficulty level
  - Selected: scale up, show mini-card above pin
  - Walk/bike/drive filter: changes radius and adds
    estimated travel time to each card
```

```
Step 2: Mission Detail with Location               [~20 sec]
+-----------------------------------------------------+
|  < Back to Nearby Missions                            |
|                                                       |
|  ENVIRONMENT · Easy · 10 IT                           |
|                                                       |
|  Document water fountains in                          |
|  Pioneer Courthouse Square area                       |
|  ──────────────────────────────                       |
|                                                       |
|  +-------------------------------------------+       |
|  | [Map preview showing mission area]         |       |
|  |        .-------.                           |       |
|  |       /  500m   \                          |       |
|  |      |  mission  |                         |       |
|  |      |   area *  |                         |       |
|  |       \         /                          |       |
|  |        '-------'                           |       |
|  | [Get Directions]  0.4 km · 8 min walk      |       |
|  +-------------------------------------------+       |
|                                                       |
|  INSTRUCTIONS                                         |
|  ────────────                                         |
|  1. Walk to Pioneer Courthouse Square area            |
|  2. Find and photograph each water fountain           |
|  3. Take a clear photo of each fountain               |
|  4. GPS will be auto-recorded with each photo         |
|  5. Submit at least 5 fountain photos                 |
|                                                       |
|  REQUIRED EVIDENCE                                    |
|  ─────────────────                                    |
|  - 5+ geotagged photos (GPS auto-captured)            |
|  - Photos must be within mission area                 |
|  - Brief description per fountain (optional)          |
|                                                       |
|  +-------------------------------------------+       |
|  |        Claim This Mission                  |       |
|  +-------------------------------------------+       |
|                                                       |
|  Deadline: Feb 20, 2026 (11 days)                     |
|  "Get Directions" opens native maps app               |
|                                                       |
+-----------------------------------------------------+
```

```
Step 3: Post-Claim Navigation                      [~5 sec]
+-----------------------------------------------------+
|                                                       |
|  +-------------------------------------------+       |
|  |                                            |       |
|  |   Mission Claimed!                         |       |
|  |                                            |       |
|  |   "Document water fountains in             |       |
|  |    Pioneer Courthouse Square area"         |       |
|  |                                            |       |
|  |   Deadline: Feb 20, 2026                   |       |
|  |                                            |       |
|  |   +----------------------------------+     |       |
|  |   |  Navigate to Location            |     |       |
|  |   |  (opens Apple Maps / Google Maps) |     |       |
|  |   +----------------------------------+     |       |
|  |                                            |       |
|  |   [Start Evidence Collection]              |       |
|  |   (opens camera for mission photos)        |       |
|  |                                            |       |
|  +-------------------------------------------+       |
|                                                       |
+-----------------------------------------------------+
```

---

### 3.4 Flow 4: Submit Mission Evidence (Before/After)

**Goal**: User completes a local mission and submits geotagged photo evidence.
**Prerequisite**: Mission is claimed.
**Estimated time**: 5-15 minutes (task-dependent).

```
Step 1: Evidence Collection (At Location)          [Ongoing]
+-----------------------------------------------------+
|  Mission: Survey sidewalk damage on Oak St            |
|  Status: In Progress                                  |
|                                                       |
|  BEFORE PHOTOS (required)                             |
|  ──────────────────────                               |
|  +-------+ +-------+ +-------+ +----------+          |
|  | [Img] | | [Img] | | [Img] | | + Add    |          |
|  | GPS:Y | | GPS:Y | | GPS:Y | | Before   |          |
|  | 2:14p | | 2:16p | | 2:18p | | Photo    |          |
|  +-------+ +-------+ +-------+ +----------+          |
|  3 of 5 minimum "before" photos                      |
|                                                       |
|  TASK CHECKLIST                                       |
|  ──────────────                                       |
|  [x] Walk the full stretch of Oak St (3rd to 5th)     |
|  [x] Photograph each area of damage                   |
|  [ ] Note severity (minor crack / major break / gap)  |
|  [ ] Estimate total linear feet of damage             |
|                                                       |
|  AFTER PHOTOS (if applicable)                         |
|  ────────────────────────────                         |
|  +----------+                                         |
|  | + Add    |  After photos will be compared          |
|  | After    |  with your before photos.               |
|  | Photo    |                                         |
|  +----------+                                         |
|                                                       |
|  Notes:                                               |
|  [The damage extends approximately 150 feet____]      |
|  [Most severe near the intersection of Oak & 4th]     |
|                                                       |
|  +-------------------------------------------+       |
|  |        Review & Submit                     |       |
|  +-------------------------------------------+       |
|                                                       |
+-----------------------------------------------------+

Evidence flow:
  - "Add Before Photo" opens camera (same as observation)
  - GPS auto-verified against mission area boundary
  - If photo GPS is outside mission area: warning toast
    "This photo is 200m outside the mission area.
     Include it anyway? [Yes] [Retake]"
  - Before/after photos are paired by proximity
  - Checklist items can be checked off as completed
  - Notes: optional text field, 500 char max
  - Draft auto-saved to IndexedDB every 30 seconds
```

```
Step 2: Review & Submit                            [~30 sec]
+-----------------------------------------------------+
|  Review Before Submitting                             |
|                                                       |
|  EVIDENCE SUMMARY                                     |
|  ────────────────                                     |
|  Before photos:  5 uploaded (5 required)  [passed]    |
|  GPS verification: 5/5 within mission area [passed]   |
|  Checklist:      4/4 items completed       [passed]   |
|  Notes:          152 words provided        [passed]   |
|                                                       |
|  PHOTO MAP                                            |
|  ─────────                                            |
|  +-------------------------------------------+       |
|  | [Mini map showing photo locations          |       |
|  |  along Oak Street, numbered 1-5]           |       |
|  |                                            |       |
|  |    1*  2*   3*      4*  5*                 |       |
|  |  --[Oak Street]--                          |       |
|  +-------------------------------------------+       |
|                                                       |
|  +-------------------------------------------+       |
|  |          Submit Evidence                   |       |
|  +-------------------------------------------+       |
|                                                       |
+-----------------------------------------------------+
```

---

### 3.5 Flow 5: Browse Neighborhood Dashboard

**Goal**: User views local impact stats and trending issues.
**Entry point**: "Local Stats" from Neighborhood nav, or local stats widget on map view.
**Estimated time**: 15-30 seconds (glanceable).

```
Neighborhood Dashboard                             [Glanceable]
+-----------------------------------------------------+
|  My Neighborhood                                      |
|  Portland, OR · Hawthorne District                    |
|                                                       |
|  +----------+ +----------+ +----------+ +----------+ |
|  | 47       | | 12       | | 89       | | 1,240    | |
|  | Problems | | Active   | | Missions | | IT       | |
|  | Found    | | Missions | | Completed| | Earned   | |
|  | [+3 wk] | | Nearby   | | [+8 wk]  | | Locally  | |
|  +----------+ +----------+ +----------+ +----------+ |
|                                                       |
|  TRENDING ISSUES                                      |
|  ───────────────                                      |
|  +-------------------------------------------+       |
|  | [!] Sidewalk damage reports increased 3x   |       |
|  |     on Oak St this week (12 observations)  |       |
|  |     [View on Map]                          |       |
|  +-------------------------------------------+       |
|  +-------------------------------------------+       |
|  | [*] New: Illegal dumping at Laurelhurst    |       |
|  |     Park reported by 3 observers           |       |
|  |     [View on Map]                          |       |
|  +-------------------------------------------+       |
|                                                       |
|  COMMUNITY LEADERBOARD (This Month)                   |
|  ───────────────────────────────────                  |
|  1. @sarah_chen      340 IT  12 missions              |
|  2. @marco_p         280 IT   9 missions              |
|  3. @aisha_j         210 IT   7 missions              |
|  ... 47 active contributors this month                |
|  [View full leaderboard]                              |
|                                                       |
|  ACTIVITY SPARKLINE (30 days)                         |
|  ─────────────────────────────                        |
|  Observations:  ____/---\___/---->  (+24% this week)  |
|  Missions:      ___/------\__/-->   (+12% this week)  |
|                                                       |
|  AGGREGATED PATTERNS                                  |
|  ───────────────────                                  |
|  +-------------------------------------------+       |
|  | Pattern: 12 reports of broken sidewalks    |       |
|  | in the Oak Street area                     |       |
|  | +-------------------------------+          |       |
|  | | [Cluster map preview]         |          |       |
|  | |   * * *    *  * *             |          |       |
|  | | --[Oak St]--                  |          |       |
|  | +-------------------------------+          |       |
|  | Recommendation: Escalate to city-wide      |       |
|  | infrastructure problem                     |       |
|  | [View Analysis]  [Report to City]          |       |
|  +-------------------------------------------+       |
|                                                       |
+-----------------------------------------------------+
```

---

## 4. Key Components

### 4.1 Neighborhood Map

The central hyperlocal component. Extends the existing Map Component (defined in `01b-design-system.md`, Section 2.2) with hyperlocal-specific features.

**Specifications**

| Property | Value |
|----------|-------|
| Map library | Mapbox GL JS (primary) or Leaflet (open-source fallback) |
| Default zoom | 14-15 (neighborhood level, ~500m-1km visible) |
| Tile style | Custom warm-toned basemap matching brand palette (desaturated background, terracotta POI markers) |
| Problem pin (single) | 28px circle, domain color fill, white domain icon center. Shadow `--shadow-sm`. |
| Problem pin (cluster) | 36-52px circle (scales with count). Domain color gradient. White count text. |
| Mission pin (single) | 28px rounded rectangle (8px radius), domain color fill, white token amount text. |
| Selected pin | Scale to 36px. Terracotta ring (3px). Popup card appears above. |
| User location | Pulsing blue dot (8px core, 24px pulse ring). Accuracy circle: `rgba(74, 127, 181, 0.08)` fill. |
| Observation pin | 20px diamond shape, domain color, pulsing for recent (<1hr). |
| Radius overlay | Semi-transparent circle fill (`rgba(196,112,75,0.06)`), terracotta dashed stroke (1.5px). |
| Controls | Zoom +/-, geolocation button, filter toggle, heatmap toggle. Bottom-right, custom styled. |

**Cluster Behavior**

| Zoom Level | Behavior |
|-----------|----------|
| < 12 | All items clustered by area. Show count badges only. |
| 12-14 | Clusters break into sub-clusters. Domain color blending. |
| 14-16 | Individual pins visible. Clusters only for overlapping items. |
| > 16 | Full detail. No clustering. Pin labels visible. |

### 4.2 Observation Camera

Full-screen camera component for capturing geotagged observations.

**Specifications**

| Property | Value |
|----------|-------|
| Layout | Full-screen viewfinder, controls at bottom |
| Shutter button | 80px circle, white fill, `--shadow-md`, centered bottom |
| GPS indicator | Top-left badge: `[Green/Amber/Red dot] [Coordinates] Accuracy: [N]m` |
| Accuracy thresholds | Green: < 10m, Amber: 10-50m, Red: > 50m |
| Timestamp | Auto-captured in EXIF, not displayed on screen |
| Photo tips | Rotating text above shutter: "Hold steady", "Include surroundings", "Capture the full issue" |
| Close button | 32px X icon, top-left, `--color-warm-white` |
| Gallery import | 32px icon, bottom-right, opens device photo picker |
| Flash toggle | 32px icon, top-right, auto/on/off states |
| Orientation | Portrait-locked for consistency |

**GPS Accuracy Badge Styles**

| Accuracy | Dot Color | Background | Text |
|----------|----------|-----------|------|
| < 10m (Excellent) | `#3D8B5E` (Success) | `#E6F4EC` | "GPS: Precise" |
| 10-50m (Acceptable) | `#C4922A` (Warning) | `#FBF3E0` | "GPS: Approximate" |
| > 50m (Poor) | `#C45044` (Error) | `#FAE8E6` | "GPS: Low accuracy" |
| No signal | `#6B6560` (Gray) | `#F0EDEA` | "GPS: Unavailable" |

### 4.3 Problem Card (Local Variant)

A compact card variant optimized for local context. Extends the existing Problem Card (defined in `01b-design-system.md`).

**Structure**

```
+-----------------------------------------------------+
| +-------+                                            |
| | [Hero | ENVIRONMENT · HIGH · 0.3 km away           |
| | Photo]|                                            |
| | 80x80 | Broken sidewalk on Oak St                  |
| |       |                                            |
| +-------+ 4 observations · Last: 2 hours ago         |
|                                                       |
| [Pin icon] Oak St & 4th Ave    [8 min walk]          |
+-----------------------------------------------------+
```

**Differences from Macro Problem Card**

| Property | Macro Card | Local Card |
|----------|-----------|------------|
| Hero image | None (text-only) | 80x80px thumbnail from first observation |
| Location | City, State | Street-level address + walking distance |
| Metrics | Evidence count, solution count | Observation count, last activity time |
| Size | Full-width card, 3-line description | Compact, 2-line title max, no description preview |

### 4.4 Mission Card (Local Variant)

**Structure**

```
+-----------------------------------------------------+
| +-------+                                            |
| | [Map  | ENVIRONMENT · Easy · 10 IT                 |
| | Prev. |                                            |
| | 80x80 | Document water fountains                   |
| |       | in Pioneer Square area                     |
| +-------+                                            |
|                                                       |
| 0.4 km · 8 min walk · ~30 min task                   |
| Evidence: 5 geotagged photos                         |
|                                                       |
| +-------------------------------------------+        |
| |          Claim Mission                     |        |
| +-------------------------------------------+        |
+-----------------------------------------------------+
```

**Key Differences from Macro Mission Card**

| Property | Macro Card | Local Card |
|----------|-----------|------------|
| Thumbnail | Domain icon | Mini-map preview showing mission area |
| Distance | "Portland, OR (5 km)" | "0.4 km . 8 min walk" (human-scale) |
| Time estimate | "~2 hours" | "~30 min task" (typically shorter) |
| Evidence | "15 geotagged photos" | "5 geotagged photos" (scoped to local) |
| CTA | "Claim Mission" | "Claim Mission" (same, but more prominent) |

### 4.5 Evidence Gallery (Hyperlocal Extension)

Extends the existing Evidence Gallery component (defined in `01b-design-system.md`) with spatial and temporal features.

**New Tabs**

```
[Photos]  [Map View]  [Timeline]
```

**Map View Tab**

```
+-----------------------------------------------------+
| [Map showing photo locations as numbered pins]        |
|                                                       |
|    1*  2*   3*      4*  5*                            |
|  --[Oak Street]--                                     |
|                                                       |
| Tap a pin -> thumbnail preview + metadata             |
+-----------------------------------------------------+
```

**Timeline Tab (Before/After)**

```
+-----------------------------------------------------+
| Location 1: Oak St & 3rd Ave                          |
| +-------------------+  +-------------------+          |
| | BEFORE            |  | AFTER             |          |
| | [Photo]           |  | [Photo]           |          |
| | Feb 7, 2:14 PM    |  | Feb 14, 10:30 AM  |          |
| | GPS: Verified     |  | GPS: Verified     |          |
| +-------------------+  +-------------------+          |
|                                                       |
| Location 2: Oak St & 4th Ave                          |
| +-------------------+  +-------------------+          |
| | BEFORE            |  | AFTER             |          |
| | [Photo]           |  | (Pending)         |          |
| | Feb 7, 2:16 PM    |  |                   |          |
| +-------------------+  +-------------------+          |
+-----------------------------------------------------+
```

### 4.6 Local Stats Dashboard

Glanceable metrics for the user's neighborhood.

**Metric Card (Local Variant)**

```
+-------------------------------------------+
|  [Icon: MapPin]                            |
|  47                        [sparkline]     |
|  Problems Found            +3 this week    |
+-------------------------------------------+
```

- Same styling as existing Metric Card (defined in `01b-design-system.md`)
- Sparkline shows 30-day local trend
- Trend text: green for increase in positive metrics, amber for increase in problem reports

**Aggregation Insight Card**

```
+-----------------------------------------------------+
| [!] Pattern Detected                                  |
|                                                       |
| 12 reports of broken sidewalks in the                 |
| Oak Street area (3rd Ave to 5th Ave)                  |
|                                                       |
| +-------------------------------+                     |
| | [Cluster map preview]         |                     |
| |   * * *    *  * *             |                     |
| | --[Oak St]--                  |                     |
| +-------------------------------+                     |
|                                                       |
| First reported: Jan 28  Latest: 2 hours ago           |
| Trend: Increasing (3x this week vs last)              |
|                                                       |
| [View Analysis]  [View on Map]                        |
+-----------------------------------------------------+
```

- Background: `var(--color-warning-light)` for active patterns
- Left border: 3px `var(--color-warning)`
- Mini-map: 200px height, showing clustered observation pins
- Action buttons: ghost style

---

## 5. Mobile-First Considerations

### 5.1 One-Handed Operation

The observation flow is designed for right-thumb reachability on a standard smartphone (6.1-6.7 inch screen):

```
REACHABILITY ZONES (right-handed)
+---------------------+
|                     |  <- Hard to reach (status bar, GPS badge)
|                     |     Use for read-only info
|                     |
|            .........|  <- Comfortable (category chips,
|         ..........  |     description field)
|      .............  |
|   ................  |  <- Easy (shutter button,
|   ................  |     submit button, close)
+---------------------+

Rule: All primary actions (capture, submit, close)
must be in the bottom 40% of the screen.
```

### 5.2 Observation Flow Gesture Map

| Gesture | Action | Context |
|---------|--------|---------|
| Tap (shutter area) | Capture photo | Camera screen |
| Swipe left | Next step (categorize) | After capture |
| Swipe right | Retake photo | After capture |
| Tap chip | Select category | Categorize screen |
| Swipe down | Dismiss/cancel | Any screen in flow |
| Long press (photo) | Full-screen preview | Photo review |

### 5.3 Offline Support

Photo observations must work without network connectivity:

| State | Behavior |
|-------|----------|
| **Online** | Photo uploaded immediately, GPS verified server-side, instant confirmation |
| **Offline** | Photo + GPS + metadata saved to IndexedDB. Queue badge shows pending count. |
| **Reconnecting** | Background upload starts automatically. Toast: "Uploading 3 queued observations..." |
| **Upload complete** | Toast per item: "Observation submitted: Broken sidewalk on Oak St" |
| **Upload failed** | Retry with exponential backoff. After 3 failures: notification "3 observations pending upload" |

**Offline storage schema (IndexedDB):**

```
observation_draft {
  id: uuid (client-generated)
  photo_blob: Blob
  gps_lat: number
  gps_lng: number
  gps_accuracy: number
  timestamp: ISO 8601
  category: string (domain slug)
  description: string | null
  urgency: string
  created_at: ISO 8601
  upload_status: "pending" | "uploading" | "failed" | "complete"
  retry_count: number
}
```

### 5.4 Push Notifications

| Notification Type | Trigger | Content |
|------------------|---------|---------|
| Nearby mission available | New mission within user radius | "New mission near you: Document water fountains (10 IT, 0.4 km away)" |
| Problem update | New observations on a problem user has observed | "3 new observations on 'Broken sidewalk on Oak St'" |
| Mission deadline | 24h and 4h before deadline | "Your mission 'Survey sidewalk damage' is due tomorrow" |
| Observation linked | User's observation linked to a problem | "Your observation was linked to 'Broken sidewalk on Oak St'" |
| Pattern detected | AI identifies pattern in user's area | "Pattern detected: sidewalk damage reports increasing on Oak St" |

### 5.5 Location Permission UX

Progressive permission request -- never on first visit, always with explanation:

```
Step 1: First visit (no permission request)
  - Show neighborhood page with "Enable location" CTA
  - Map shows a generic city view

Step 2: User taps "Enable Location" or "Near Me"
  +-------------------------------------------+
  | [Map pin icon]                             |
  |                                            |
  | Enable Location Access                     |
  |                                            |
  | BetterWorld uses your location to:         |
  | - Show problems near you                   |
  | - Find missions you can walk to            |
  | - Verify your observation GPS              |
  |                                            |
  | Your exact address is never stored         |
  | or shared with other users.                |
  |                                            |
  | [Enable Location]   [Not Now]              |
  +-------------------------------------------+

Step 3: Browser/OS permission prompt fires
  - If granted: map centers on user, nearby content loads
  - If denied: fallback to manual city entry
    "Enter your city or zip code to see nearby content"
    [Portland, OR___________]
```

---

## 6. Map Design

### 6.1 Color Coding

Map pins use domain colors from the existing palette (`docs/design/01a-brand-identity.md`, Section 1.3):

| Pin Type | Shape | Color Rule | Size |
|----------|-------|-----------|------|
| Problem pin | Circle | Domain color fill, white icon | 28px (single), 36-52px (cluster) |
| Mission pin | Rounded rect | Domain color fill, white text | 28px (single) |
| Observation pin | Diamond | Domain color fill | 20px |
| User location | Circle + ring | `#4A7FB5` (Info Blue) | 8px core, 24px ring |

### 6.2 Clustering

| Zoom Level | Cluster Radius | Badge Size | Content |
|-----------|---------------|-----------|---------|
| < 10 | 80px | 52px | Count only: "47" |
| 10-12 | 60px | 44px | Count + dominant domain color |
| 12-14 | 40px | 36px | Count, splits by domain on tap |
| > 14 | 20px | No cluster | Individual pins |

**Cluster Badge Style**

```css
.map-cluster {
  width: var(--cluster-size);
  height: var(--cluster-size);
  border-radius: var(--radius-full);
  background: var(--domain-color);
  border: 2px solid var(--color-warm-white);
  box-shadow: var(--shadow-sm);
  color: white;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: var(--text-label);
  display: flex;
  align-items: center;
  justify-content: center;
}
```

### 6.3 Heatmap Mode

Toggle available in map controls. Shows problem density as a gradient overlay.

| Density | Color | Opacity |
|---------|-------|---------|
| Low (1-3 items) | `#C4922A` (Amber) | 0.15 |
| Medium (4-8 items) | `#D4872C` (Amber darker) | 0.30 |
| High (9-15 items) | `#C45044` (Error Red) | 0.45 |
| Critical (16+ items) | `#8B2020` (Deep Red) | 0.60 |

- Heatmap radius: 100m per data point
- Blur: 15px
- Intensity scales with zoom level
- Toggle button: `[Heatmap On/Off]` in map controls

### 6.4 Filter Controls

Filters appear as a horizontal bar above the map (or a bottom sheet on mobile):

```
+-------------------------------------------------------+
| [All Domains v]  [Urgency v]  [Time v]  [Resolved: No]|
+-------------------------------------------------------+
```

| Filter | Options | Default |
|--------|---------|---------|
| Domain | All, or multi-select from 15 domains | All |
| Urgency | All, Immediate, Days, Weeks, Months | All |
| Time range | Last 24h, Last week, Last month, All time | Last month |
| Resolved | Show resolved, Hide resolved, Only resolved | Hide resolved |

### 6.5 Current Location Indicator

```css
.user-location {
  /* Core dot */
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  background: #4A7FB5;
  border: 2px solid white;
  box-shadow: var(--shadow-sm);
}

.user-location__pulse {
  /* Pulsing ring */
  width: 24px;
  height: 24px;
  border-radius: var(--radius-full);
  background: rgba(74, 127, 181, 0.2);
  animation: pulse 2s ease-in-out infinite;
}

.user-location__accuracy {
  /* Accuracy radius circle */
  border-radius: var(--radius-full);
  background: rgba(74, 127, 181, 0.06);
  border: 1px dashed rgba(74, 127, 181, 0.3);
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.4); opacity: 0.2; }
}
```

---

## 7. Accessibility

### 7.1 Map Alternatives

The map is inherently visual. All map content must be accessible via alternative views:

| Map Feature | Accessible Alternative |
|-------------|----------------------|
| Problem pins on map | List view sorted by distance, with street address |
| Cluster counts | "47 problems within 2 km" text summary |
| Mission locations | Mission list with distance + walking time text |
| Heatmap density | "Oak Street area: 12 problem reports (high density)" text |
| User location | "You are near Hawthorne Blvd & 30th Ave" text |
| Pin preview popup | Same card data in list view, focusable via keyboard |

**List View Tab Order**

```
1. View toggle (List / Map) -- announce current view
2. Filter controls
3. Sort dropdown (Distance / Newest / Most Observations / Urgency)
4. Results count: "Showing 24 problems within 2 km"
5. Problem card 1 -> Problem card 2 -> ...
6. Load more button
```

**ARIA for Map Component**

```html
<div role="application" aria-label="Neighborhood map showing 24 problems and 3 missions near your location">
  <div role="status" aria-live="polite">
    <!-- Announce: "Map centered on Hawthorne District, Portland. 24 problems visible." -->
  </div>
  <!-- Map canvas -->
  <div role="list" aria-label="Map items">
    <div role="listitem" aria-label="Broken sidewalk on Oak St, 0.3 kilometers away, environment, high urgency" tabindex="0">
      <!-- Marker -->
    </div>
  </div>
</div>
```

### 7.2 Photo Descriptions

All observation photos need accessible descriptions:

| Source | Method |
|--------|--------|
| User-submitted | Optional caption field during submission ("Describe what's in this photo") |
| AI-generated | Claude Vision generates alt text for uncaptioned photos. Format: "Photo showing [subject] at [location]. [Notable details]." |
| Fallback | "Observation photo at [street address], [date]" |

### 7.3 High Contrast Mode (Outdoor Visibility)

The hyperlocal UI must be usable outdoors in bright sunlight:

| Element | Standard Mode | High Contrast Mode |
|---------|--------------|-------------------|
| Map controls | `--shadow-sm` on white | Solid black border, white fill, no transparency |
| GPS badge | Semi-transparent background | Opaque white background, bold text |
| Camera overlay text | White text with drop shadow | Black text on opaque white bar |
| Pin colors | Domain colors | Domain colors with 3px white outline for visibility |
| Shutter button | White fill, subtle shadow | White fill, 3px black border |

**Activation**: Auto-detect high ambient light sensor (if available) or manual toggle in settings. Uses `@media (prefers-contrast: more)` CSS media query.

```css
@media (prefers-contrast: more) {
  .map-pin {
    outline: 3px solid white;
    outline-offset: -1px;
  }

  .gps-badge {
    background: white;
    color: var(--color-charcoal);
    border: 2px solid var(--color-charcoal);
  }

  .camera-overlay-text {
    background: rgba(255, 255, 255, 0.95);
    color: var(--color-charcoal);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
  }
}
```

### 7.4 Voice Input

For users who cannot type while standing/walking:

- Observation description field supports voice input via Web Speech API
- Microphone icon button next to text field
- Visual feedback: pulsing red dot while recording
- Transcript appears in text field in real time
- "Done" button to stop recording
- Fallback: device keyboard (speech-to-text is progressive enhancement)

### 7.5 Touch Targets

All hyperlocal-specific interactive elements meet 48px minimum touch target:

| Element | Visual Size | Touch Target |
|---------|-----------|-------------|
| Map pin (28px) | 28px visible | 48px invisible hit area |
| Shutter button | 80px | 80px (already exceeds minimum) |
| Category chip | 36px height | 48px height touch area |
| GPS badge | 24px height | 48px height touch area |
| Filter chip | 32px height | 48px height touch area |
| Close button | 32px | 48px invisible hit area |
| Gallery import | 32px | 48px invisible hit area |

---

## 8. Empty States & Onboarding

### 8.1 First Visit to Neighborhood

```
Step 1: Location Permission
+-----------------------------------------------------+
|  My Neighborhood                                      |
|                                                       |
|  +-------------------------------------------+       |
|  |                                            |       |
|  |  [Illustration: map with pin and           |       |
|  |   magnifying glass]                        |       |
|  |                                            |       |
|  |  Discover your neighborhood                |       |
|  |                                            |       |
|  |  See local issues, nearby missions,        |       |
|  |  and community impact around you.          |       |
|  |                                            |       |
|  |  +----------------------------------+      |       |
|  |  |   Enable Location                |      |       |
|  |  +----------------------------------+      |       |
|  |                                            |       |
|  |  Or enter your city:                       |       |
|  |  [Portland, OR_______________]             |       |
|  |                                            |       |
|  +-------------------------------------------+       |
|                                                       |
+-----------------------------------------------------+
```

```
Step 2: First Map View (with Tutorial Overlay)
+-----------------------------------------------------+
|  My Neighborhood                                      |
|                                                       |
|  +---------------------------------------------------+
|  | (Map loads centered on user)                      |
|  |                                                   |
|  |  +-----------------------------------+            |
|  |  | Welcome to your neighborhood!     |            |
|  |  |                                   |            |
|  |  | * Colored pins = local problems   |            |
|  |  | * Tap a pin to learn more         |            |
|  |  | * Use [Camera] to report issues   |            |
|  |  |                                   |            |
|  |  | [Got it]                          |            |
|  |  +-----------------------------------+            |
|  |                                                   |
|  |    [*]  [*]                                       |
|  |             [*]                                   |
|  |                                                   |
|  +---------------------------------------------------+
|                                                       |
+-----------------------------------------------------+

Tutorial overlay:
  - Semi-transparent backdrop behind tooltip card
  - Tooltip positioned center-screen
  - "Got it" dismisses permanently (stored in localStorage)
  - 3 bullet points with pin/camera icons
  - Auto-dismiss after 10 seconds with fade
```

### 8.2 No Issues Nearby

```
+-----------------------------------------------------+
|  My Neighborhood                                      |
|                                                       |
|  +---------------------------------------------------+
|  | (Map centered on user, no pins visible)           |
|  |                                                   |
|  |                                                   |
|  |         (empty map area)                          |
|  |                                                   |
|  +---------------------------------------------------+
|                                                       |
|  +-------------------------------------------+       |
|  |                                            |       |
|  |  [Illustration: person with camera]        |       |
|  |                                            |       |
|  |  No issues reported nearby yet             |       |
|  |                                            |       |
|  |  Be the first to report! Take a photo     |       |
|  |  of something in your neighborhood that    |       |
|  |  needs attention.                          |       |
|  |                                            |       |
|  |  +----------------------------------+      |       |
|  |  |    Report an Observation          |      |       |
|  |  +----------------------------------+      |       |
|  |                                            |       |
|  |  Or try expanding your search radius:      |       |
|  |  [------O--------] 5 km                    |       |
|  |                                            |       |
|  +-------------------------------------------+       |
|                                                       |
+-----------------------------------------------------+
```

### 8.3 No Missions Nearby

```
+-------------------------------------------+
|                                            |
|  [Illustration: mission target icon]       |
|                                            |
|  No missions nearby right now              |
|                                            |
|  Missions are created when AI agents       |
|  analyze local problems and design         |
|  solutions. Here is what you can do:       |
|                                            |
|  * Report observations to help agents      |
|    discover issues in your area            |
|  * Expand your search radius               |
|  * Check back soon!                        |
|                                            |
|  [Report an Observation]                   |
|  [Expand radius to 10 km]                  |
|                                            |
+-------------------------------------------+
```

### 8.4 Gamification: First Achievements

| Achievement | Trigger | Badge | Reward |
|------------|---------|-------|--------|
| First Observer | Submit first observation | Camera icon badge, emerald | +5 IT |
| Neighborhood Scout | 5 observations submitted | Map pin badge, amber | +15 IT |
| First Local Mission | Complete first local mission | Target badge, terracotta | +10 IT bonus |
| Pattern Finder | 3 observations linked to same problem | Link icon badge, indigo | +10 IT |
| Community Builder | Observations contributed to a problem that got a solution | Heart badge, forest | +25 IT |

**Achievement Toast**

```
+---+----------------------------------------------+
| * | Achievement Unlocked: First Observer!         |
|   | You submitted your first neighborhood         |
|   | observation. +5 IT earned.                    |
|   |                                    [View All] |
+---+----------------------------------------------+
```

- Left icon: achievement badge (animated scale-in, `--ease-bounce`)
- Auto-dismiss: 5 seconds
- "View All" links to profile badges tab

---

## 9. Design Tokens & Theme Extensions

### 9.1 New Semantic Colors: Urgency Levels

Hyperlocal introduces urgency as a first-class dimension. These tokens extend the existing semantic color palette:

```css
:root {
  /* Urgency levels */
  --color-urgency-immediate: #C45044;     /* Error Red - danger, hazard */
  --color-urgency-immediate-light: #FAE8E6;
  --color-urgency-days: #C4922A;          /* Warning Amber - needs attention */
  --color-urgency-days-light: #FBF3E0;
  --color-urgency-weeks: #4A7FB5;         /* Info Blue - can wait */
  --color-urgency-weeks-light: #E8F0F8;
  --color-urgency-months: #6B6560;        /* Warm Gray - low priority */
  --color-urgency-months-light: #F0EDEA;
}
```

| Urgency Level | Color Token | Hex | Use Case |
|--------------|-------------|-----|----------|
| Immediate | `--color-urgency-immediate` | `#C45044` | Safety hazard, active danger, blocked access |
| Days | `--color-urgency-days` | `#C4922A` | Needs repair soon, deteriorating, health concern |
| Weeks | `--color-urgency-weeks` | `#4A7FB5` | Maintenance needed, aesthetic issue, minor obstruction |
| Months | `--color-urgency-months` | `#6B6560` | Long-term tracking, improvement opportunity, wish-list |

### 9.2 Map Pin Icons Per Domain

Each of the 15 domains has a pin icon. Reuse the Lucide-based domain icons from the existing design system (`01a-brand-identity.md`, Section 1.5):

| Domain | Pin Icon (Lucide) | Pin Color |
|--------|------------------|-----------|
| Poverty Reduction | `HandCoins` | `#D4872C` |
| Education Access | `GraduationCap` | `#5B6ABF` |
| Healthcare Improvement | `HeartPulse` | `#C75D6E` |
| Environmental Protection | `Leaf` | `#4A8C6F` |
| Food Security | `Wheat` | `#B8862B` |
| Mental Health & Wellbeing | `BrainCircuit` | `#8B6DAF` |
| Community Building | `Users` | `#D4785C` |
| Disaster Response | `ShieldAlert` | `#B84545` |
| Digital Inclusion | `Globe` | `#3D8B8B` |
| Human Rights | `Scale` | `#7B5EA7` |
| Clean Water & Sanitation | `Droplets` | `#4A87B5` |
| Sustainable Energy | `Zap` | `#C9A032` |
| Gender Equality | `Equal` (custom) | `#A8568A` |
| Biodiversity Conservation | `TreePine` | `#5E8C4A` |
| Elder Care | `HeartHandshake` | `#B07585` |

### 9.3 Distance Formatting

Standardized distance display for consistent UX:

| Distance | Display Format | Example |
|----------|---------------|---------|
| < 100m | Meters, rounded to 10 | "50 m away" |
| 100m - 999m | Meters, rounded to 50 | "350 m away" |
| 1.0 km - 9.9 km | Km with 1 decimal | "2.3 km away" |
| 10+ km | Km, no decimal | "15 km away" |

**Walking Time Estimation**

| Distance | Walking Time | Display |
|----------|-------------|---------|
| < 200m | < 3 min | "2 min walk" |
| 200m - 1 km | 3-12 min | "8 min walk" |
| 1 km - 3 km | 12-36 min | "25 min walk" |
| 3 km - 5 km | 36-60 min | "45 min walk" |
| > 5 km | -- | Show km only, no walk time |

Walking speed assumption: 5 km/h (average pedestrian speed). For accessibility-conscious estimates, consider 3 km/h (wheelchair users) and 2 km/h (elderly with mobility aids). The UI displays the 5 km/h estimate by default; a future accessibility setting could adjust this.

### 9.4 Time Formatting for Local Context

Recency-first display for hyperlocal content:

| Time Delta | Display | Example |
|-----------|---------|---------|
| < 1 minute | "Just now" | "Just now" |
| 1-59 minutes | "{N} min ago" | "12 min ago" |
| 1-23 hours | "{N}h ago" | "3h ago" |
| Yesterday | "Yesterday at {time}" | "Yesterday at 2:14 PM" |
| 2-6 days | "{day} at {time}" | "Tuesday at 10:30 AM" |
| 7-30 days | "{N} days ago" | "12 days ago" |
| 1-3 months | "{month} {day}" | "Jan 15" |
| > 3 months | "{month} {day}, {year}" | "Oct 3, 2025" |

### 9.5 New CSS Custom Properties

```css
:root {
  /* Urgency colors (see 9.1) */
  --color-urgency-immediate: #C45044;
  --color-urgency-immediate-light: #FAE8E6;
  --color-urgency-days: #C4922A;
  --color-urgency-days-light: #FBF3E0;
  --color-urgency-weeks: #4A7FB5;
  --color-urgency-weeks-light: #E8F0F8;
  --color-urgency-months: #6B6560;
  --color-urgency-months-light: #F0EDEA;

  /* Map-specific tokens */
  --map-pin-size-sm: 20px;
  --map-pin-size-md: 28px;
  --map-pin-size-lg: 36px;
  --map-cluster-size-sm: 36px;
  --map-cluster-size-md: 44px;
  --map-cluster-size-lg: 52px;
  --map-user-dot: 8px;
  --map-user-ring: 24px;
  --map-user-color: #4A7FB5;
  --map-accuracy-fill: rgba(74, 127, 181, 0.06);
  --map-accuracy-stroke: rgba(74, 127, 181, 0.3);
  --map-radius-fill: rgba(196, 112, 75, 0.06);
  --map-radius-stroke: rgba(196, 112, 75, 0.4);

  /* Camera tokens */
  --camera-shutter-size: 80px;
  --camera-gps-badge-height: 32px;

  /* Observation pin */
  --observation-pin-size: 20px;
  --observation-recent-pulse: rgba(196, 112, 75, 0.3);
}
```

---

## 10. Responsive Behavior

### 10.1 Mobile (< 640px)

```
NEIGHBORHOOD VIEW (Mobile):
+------------------------+
| [< Back]  My Area  [F] |  <- F = filter toggle
|                         |
| +---------------------+ |
| |                     | |
| |   Map (50% height)  | |
| |   Full width         | |
| |                     | |
| +---------------------+ |
|                         |
| Nearby (12 items):      |
| +---------------------+ |
| | [Problem Card]      | |
| | (compact, local)    | |
| +---------------------+ |
| +---------------------+ |
| | [Problem Card]      | |
| +---------------------+ |
| +---------------------+ |
| | [Problem Card]      | |
| +---------------------+ |
|                         |
| [Load More]             |
|                         |
| [---Bottom Nav---]      |
|        [Camera FAB]     |
+------------------------+

Behavior:
  - Map takes top ~45% of viewport
  - Card list scrolls below map
  - Map can be expanded to full-screen by swiping up
  - Swiping up on cards collapses map to ~100px header
  - Camera FAB always visible above bottom nav
  - Filters open as bottom sheet
```

```
OBSERVATION FLOW (Mobile):
+------------------------+
|                         |
| (Full-screen camera)   |
|                         |
| After capture:          |
|                         |
| +---------------------+ |
| | [Photo preview]     | |
| | 16:9 aspect ratio   | |
| +---------------------+ |
|                         |
| Category:               |
| [Chip] [Chip] [Chip]   |
| [Chip] [Chip] [Chip]   |
|                         |
| [Description input]    |
|                         |
| Urgency:               |
| [Radio] [Radio]        |
| [Radio] [Radio]        |
|                         |
| [Submit Observation]   |
|                         |
+------------------------+

Behavior:
  - Camera is always full-screen
  - Categorize/describe is a single scrollable screen
  - No multi-step wizard on mobile -- one page
  - Submit button pinned to bottom (above keyboard)
```

### 10.2 Tablet (640px - 1024px)

```
NEIGHBORHOOD VIEW (Tablet):
+--------------------------------------------+
| [Logo]  My Neighborhood           [N] [IT] |
|                                             |
| +--------------------+  +------------------+|
| |                    |  | Problem Cards    ||
| |  Map               |  | (scrollable)     ||
| |  (60% width)       |  |                  ||
| |                    |  | +------------+   ||
| |  [pins, clusters]  |  | | Card 1     |   ||
| |                    |  | +------------+   ||
| |                    |  | +------------+   ||
| |                    |  | | Card 2     |   ||
| |                    |  | +------------+   ||
| |                    |  | +------------+   ||
| |                    |  | | Card 3     |   ||
| +--------------------+  | +------------+   ||
|                          +------------------+|
+--------------------------------------------+

Observation flow:
  - Camera opens as a modal (not full-screen)
  - Categorize form appears beside photo preview
  - Side-by-side layout for photo + form
```

### 10.3 Desktop (> 1024px)

```
NEIGHBORHOOD VIEW (Desktop):
+--------+----------------------------------------------+
| Sidebar|  My Neighborhood                   [Filters]  |
|        |                                               |
| Explore|  +------------------------------------------+|
| Neigh- |  |                                          ||
| borhood|  |  Map (full width, 60% height)            ||
|  Map   |  |  [pins, clusters, user location]         ||
| Activity|  |                                          ||
| Observe|  |                                          ||
| Stats  |  +------------------------------------------+|
|        |                                               |
| -------|  Nearby (24 items):                           |
| Missns |  +----------+ +----------+ +----------+      |
| Impact |  | Problem  | | Problem  | | Problem  |      |
| Profile|  | Card 1   | | Card 2   | | Card 3   |      |
|        |  +----------+ +----------+ +----------+      |
|        |  +----------+ +----------+ +----------+      |
|        |  | Problem  | | Problem  | | Problem  |      |
|        |  | Card 4   | | Card 5   | | Card 6   |      |
|        |  +----------+ +----------+ +----------+      |
+--------+----------------------------------------------+

Observation flow:
  - Opens as a dialog/modal overlay
  - Camera not available (no camera API on most desktops)
  - File upload instead: drag-and-drop photo
  - GPS extracted from EXIF if available
  - Manual location picker fallback (click on map)
```

### 10.4 Responsive Breakpoint Summary

| Breakpoint | Map Layout | Card Layout | Camera | Observation Flow |
|-----------|-----------|------------|--------|-----------------|
| Mobile (< 640px) | Top half, full width | Single column below map | Full-screen native | Single page, full screen |
| Tablet (640-1024px) | Side-by-side with cards (60/40) | Single column, right panel | Modal overlay | Side-by-side photo + form |
| Desktop (> 1024px) | Full width with sidebar, 60% height | 3-column grid below map | Not available (file upload) | Dialog overlay with file upload |

---

## Appendix A: Hyperlocal Component Inventory

| Component | New / Extended | Priority | Screens Used |
|-----------|---------------|----------|-------------|
| Neighborhood Map | New (extends Map Component) | P0 | Neighborhood, Problem Detail, Mission Detail |
| Observation Camera | New | P0 | Quick Observation flow |
| Problem Card (Local) | Extended | P0 | Neighborhood, Problem Board (Near Me) |
| Mission Card (Local) | Extended | P0 | Nearby Missions, Neighborhood |
| Evidence Gallery (Map View) | Extended | P1 | Problem Detail, Mission Detail |
| Evidence Gallery (Timeline) | Extended | P1 | Mission Detail (before/after) |
| Local Stats Dashboard | New | P1 | Neighborhood Stats |
| Aggregation Insight Card | New | P1 | Neighborhood Stats, Problem Detail |
| GPS Badge | New | P0 | Camera, Photo review, Evidence Gallery |
| Urgency Badge | New | P0 | Problem Cards, Problem Detail |
| Distance Badge | New | P0 | Problem Cards, Mission Cards |
| Walking Time Badge | New | P0 | Mission Cards, Mission Detail |
| Location Permission Flow | New | P0 | First visit, Settings |
| Achievement Toast | New | P2 | Post-observation, post-mission |

## Appendix B: Screen Inventory (Hyperlocal)

```
#   Route                      Screen Name                    Priority
--  -----                      -----------                    --------
1   /neighborhood              Neighborhood Map               P0
2   /neighborhood/activity     Local Activity Feed            P1
3   /neighborhood/observations My Observations                P1
4   /neighborhood/stats        Local Stats Dashboard          P1
5   /neighborhood/observe      Quick Observation (Camera)     P0
6   /problems/:id (extended)   Problem Detail + Local Context P0
7   /missions/:id (extended)   Mission Detail + Navigation    P0

Total new screens: 5
Total extended screens: 2
```

---

*This document extends the BetterWorld design system for hyperlocal neighborhood-scale functionality. It builds upon the existing brand identity, component library, and UX patterns documented in `docs/design/01a-brand-identity.md`, `docs/design/01b-design-system.md`, and `docs/design/02a-ux-ia-and-core-flows.md`. All hyperlocal components follow the same accessibility standards (WCAG 2.1 AA), design tokens, and implementation approach (AI-assisted from text specs, no Figma dependency). When in conflict, the constitution (``.specify/memory/constitution.md``) takes precedence.*
