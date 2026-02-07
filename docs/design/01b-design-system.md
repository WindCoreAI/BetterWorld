> **Brand & Design System** — Part 2 of 3 | [Brand Identity](01a-brand-identity.md) · [Design System](01b-design-system.md) · [Page Designs & Accessibility](01c-page-designs-and-accessibility.md)

# Brand & Design System — Design System

## 2. Design System

### 2.1 Design Tokens

All tokens are defined as CSS custom properties for consistency across the application. These map directly to Tailwind CSS 4 theme extensions.

#### Spacing Scale (4px base)

```css
:root {
  --space-0: 0px;
  --space-0-5: 2px;
  --space-1: 4px;
  --space-1-5: 6px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;
  --space-24: 96px;
  --space-32: 128px;
}
```

#### Border Radius Scale

```css
:root {
  --radius-none: 0px;
  --radius-sm: 4px;       /* Badges, small chips */
  --radius-md: 8px;       /* Inputs, small cards */
  --radius-lg: 12px;      /* Cards, containers */
  --radius-xl: 16px;      /* Modals, large cards */
  --radius-2xl: 24px;     /* Floating panels, feature cards */
  --radius-full: 9999px;  /* Pills, avatars, round buttons */
}
```

#### Shadow Scale (Neumorphic)

The "calm neumorphic" style uses soft, multi-layered shadows that create a subtle sense of depth without harsh edges. Each surface appears to gently emerge from or sink into the background.

```css
:root {
  /* Light mode shadows */
  --shadow-xs:
    2px 2px 4px rgba(45, 42, 38, 0.04),
    -1px -1px 3px rgba(255, 255, 255, 0.7);

  --shadow-sm:
    3px 3px 6px rgba(45, 42, 38, 0.06),
    -2px -2px 5px rgba(255, 255, 255, 0.8);

  --shadow-md:
    5px 5px 10px rgba(45, 42, 38, 0.07),
    -3px -3px 8px rgba(255, 255, 255, 0.8);

  --shadow-lg:
    8px 8px 16px rgba(45, 42, 38, 0.08),
    -4px -4px 12px rgba(255, 255, 255, 0.9);

  --shadow-xl:
    12px 12px 24px rgba(45, 42, 38, 0.1),
    -6px -6px 18px rgba(255, 255, 255, 0.9);

  /* Inset (pressed / input fields) */
  --shadow-inset:
    inset 2px 2px 4px rgba(45, 42, 38, 0.06),
    inset -1px -1px 3px rgba(255, 255, 255, 0.5);

  --shadow-inset-md:
    inset 3px 3px 6px rgba(45, 42, 38, 0.08),
    inset -2px -2px 5px rgba(255, 255, 255, 0.6);

  /* Focus ring (accessibility) */
  --shadow-focus:
    0 0 0 3px rgba(196, 112, 75, 0.3);

  /* Elevated (floating elements: tooltips, dropdowns) */
  --shadow-elevated:
    0px 8px 24px rgba(45, 42, 38, 0.12),
    0px 2px 8px rgba(45, 42, 38, 0.06);
}

/* Dark mode shadow overrides */
[data-theme="dark"] {
  --shadow-xs:
    2px 2px 4px rgba(0, 0, 0, 0.2),
    -1px -1px 3px rgba(255, 255, 255, 0.03);

  --shadow-sm:
    3px 3px 6px rgba(0, 0, 0, 0.25),
    -2px -2px 5px rgba(255, 255, 255, 0.04);

  --shadow-md:
    5px 5px 10px rgba(0, 0, 0, 0.3),
    -3px -3px 8px rgba(255, 255, 255, 0.04);

  --shadow-lg:
    8px 8px 16px rgba(0, 0, 0, 0.35),
    -4px -4px 12px rgba(255, 255, 255, 0.05);

  --shadow-xl:
    12px 12px 24px rgba(0, 0, 0, 0.4),
    -6px -6px 18px rgba(255, 255, 255, 0.05);

  --shadow-inset:
    inset 2px 2px 4px rgba(0, 0, 0, 0.3),
    inset -1px -1px 3px rgba(255, 255, 255, 0.03);

  --shadow-inset-md:
    inset 3px 3px 6px rgba(0, 0, 0, 0.35),
    inset -2px -2px 5px rgba(255, 255, 255, 0.04);

  --shadow-elevated:
    0px 8px 24px rgba(0, 0, 0, 0.4),
    0px 2px 8px rgba(0, 0, 0, 0.2);
}
```

#### Motion / Animation Tokens

```css
:root {
  /* Durations */
  --duration-instant: 50ms;
  --duration-fast: 150ms;
  --duration-normal: 250ms;
  --duration-slow: 400ms;
  --duration-slower: 600ms;
  --duration-celebration: 1200ms;

  /* Easings */
  --ease-default: cubic-bezier(0.4, 0, 0.2, 1);        /* General purpose */
  --ease-in: cubic-bezier(0.4, 0, 1, 1);                /* Elements exiting */
  --ease-out: cubic-bezier(0, 0, 0.2, 1);               /* Elements entering */
  --ease-in-out: cubic-bezier(0.42, 0, 0.58, 1);         /* Elements transforming (standard ease-in-out) */
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);     /* Playful (rewards) */
  --ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.1); /* Springy entrance */
}
```

#### Z-Index Scale

```css
:root {
  --z-base: 0;
  --z-raised: 10;          /* Cards, raised surfaces */
  --z-dropdown: 100;       /* Dropdowns, popovers */
  --z-sticky: 200;         /* Sticky headers, nav */
  --z-overlay: 300;        /* Overlay backgrounds */
  --z-modal: 400;          /* Modals, dialogs */
  --z-toast: 500;          /* Toast notifications */
  --z-tooltip: 600;        /* Tooltips */
  --z-priority: 9999;      /* Skip-to-content, loading screens */
}
```

---

### 2.2 Core Components

For each component: variants, states, sizing, and accessibility requirements.

---

#### Button

The primary interaction element. Neumorphic buttons appear gently raised from the surface and depress on click.

**Variants**

| Variant | Background | Text | Border | Shadow | Use Case |
|---------|-----------|------|--------|--------|----------|
| **Primary** | `#C4704B` (Terracotta) | `#FFFFFF` | none | `--shadow-sm` | Main CTAs: "Claim Mission", "Submit Evidence" |
| **Secondary** | `#FAF7F2` (Cream) | `#2D2A26` (Charcoal) | `1px solid #D9D2CA` | `--shadow-sm` | Secondary actions: "View Details", "Filter" |
| **Ghost** | transparent | `#C4704B` (Terracotta) | none | none | Tertiary actions: "Cancel", "Back" |
| **Danger** | `#C45044` (Error Red) | `#FFFFFF` | none | `--shadow-sm` | Destructive: "Delete", "Reject" |

**Sizes**

| Size | Height | Padding (H) | Font Size | Icon Size | Border Radius |
|------|--------|-------------|-----------|-----------|---------------|
| `sm` | 32px | 12px | 13px (`--text-body-sm`) | 16px | `--radius-md` |
| `md` | 40px | 16px | 15px (`--text-body`) | 20px | `--radius-md` |
| `lg` | 48px | 24px | 16px (fluid via `--text-body`, resolves to 15-16px) | 24px | `--radius-lg` |

**States**

| State | Visual Change |
|-------|--------------|
| Default | `--shadow-sm`, normal colors |
| Hover | `--shadow-md`, background shifts 5% lighter. Cursor pointer. Transition `--duration-fast`. |
| Active / Pressed | `--shadow-inset`, background shifts 5% darker. Transform `translateY(1px)`. |
| Focus | `--shadow-focus` ring (3px terracotta @ 30% opacity). Outline visible on keyboard-only focus (`:focus-visible`). |
| Disabled | Opacity 0.5. No shadow. Cursor `not-allowed`. `aria-disabled="true"`. |
| Loading | Content replaced with a 20px spinner (matching text color). Width locked to prevent layout shift. `aria-busy="true"`. |

**Accessibility**
- All buttons must have accessible text (visible label, `aria-label`, or `aria-labelledby`)
- Icon-only buttons require `aria-label`
- Loading state sets `aria-busy="true"` and disables click
- Minimum touch target: 48x48px (add invisible padding for `sm` size)
- Keyboard: activates on `Enter` and `Space`

```tsx
/* Example usage */
<Button variant="primary" size="md">Claim Mission</Button>
<Button variant="secondary" size="sm" icon={<Filter />}>Filter</Button>
<Button variant="ghost" size="md">Cancel</Button>
<Button variant="danger" size="md" loading>Deleting...</Button>
```

---

#### Card

The fundamental content container. BetterWorld cards use the calm neumorphic style — soft shadows that make the card appear to gently rise from the background surface.

**Base Card Style**

```css
.card {
  background: var(--color-surface);          /* #FEFCF9 light, #242528 dark */
  border-radius: var(--radius-lg);           /* 12px */
  padding: var(--space-6);                   /* 24px */
  box-shadow: var(--shadow-md);
  transition: box-shadow var(--duration-fast) var(--ease-default),
              transform var(--duration-fast) var(--ease-default);
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

**Card Variants**

| Variant | Top Accent | Additional Elements |
|---------|-----------|-------------------|
| **Problem Card** | 3px left border in domain color | Domain badge, severity indicator, evidence count, upvote count |
| **Solution Card** | 3px left border in `#4A8C6F` (Forest) | Impact score (0-100 radial), feasibility badge, vote count |
| **Mission Card** | 3px left border in domain color | Difficulty badge, token reward (prominent), location, time estimate, skills tags |
| **Impact Card** | Full-width top gradient in domain color (8px) | Large metric number, trend arrow, sparkline chart |

**Problem Card Structure**

```
+-----------------------------------------------------+
| [Domain Badge]  [Severity: High]        [3h ago]     |
|                                                       |
| Title of the Problem (H3, truncated 2 lines)         |
|                                                       |
| Description preview text, truncated to 3 lines       |
| with ellipsis overflow...                             |
|                                                       |
| [Location Pin] Portland, OR    [Globe] Regional      |
|                                                       |
| [Evidence: 4]  [Solutions: 2]  [Comments: 8]  [^12]  |
+-----------------------------------------------------+
```

**Mission Card Structure**

```
+-----------------------------------------------------+
| [Domain Badge: Healthcare]  [Difficulty: Medium]      |
|                                                       |
| Document clinic accessibility for                    |
| wheelchair users in downtown Portland (H3)            |
|                                                       |
| [Camera] Photography  [FileText] Documentation       |
|                                                       |
| [MapPin] Portland, OR (5km)   [Clock] ~2 hours       |
| [Calendar] Due: Feb 15, 2026                          |
|                                                       |
| +-------------------+  +-------------------------+   |
| |     25 IT         |  |   [Claim Mission ->]    |   |
| | ImpactTokens      |  |   primary button        |   |
| +-------------------+  +-------------------------+   |
+-----------------------------------------------------+
```

**Accessibility**
- Clickable cards must be wrapped in an `<a>` element (preferred) or use `role="link"` with `tabindex="0"` and keyboard event handlers for Enter/Space
- Card titles must be headings (`h3` or `h4`) for screen reader navigation
- Interactive elements within cards must have distinct focus states
- Color-only indicators (domain badge) must have text labels

---

#### Badge

Small labeling components for categorization, status, and metadata.

**Variants**

| Variant | Style | Usage |
|---------|-------|-------|
| **Domain Badge** | Background: domain light color. Text: domain color. Rounded pill. | Categorize problems, solutions, missions |
| **Difficulty Badge** | Outlined. Color varies by level. | Easy (green), Medium (amber), Hard (orange), Expert (red) |
| **Status Badge** | Filled, muted. Color matches status. | Mission statuses (open, claimed, verified, etc.) |
| **Reputation Badge** | Icon + text. Filled with gradient subtle background. | User reputation level display |

**Sizing**

| Size | Height | Padding (H) | Font Size | Icon Size |
|------|--------|-------------|-----------|-----------|
| `sm` | 20px | 6px | 12px (`--text-label`) | 12px |
| `md` | 24px | 8px | 12px (`--text-label`) | 14px |
| `lg` | 28px | 10px | 13px | 16px |

**Difficulty Badge Colors**

| Level | Text/Border | Background |
|-------|------------|-----------|
| Easy | `#3D8B5E` | `#E6F4EC` |
| Medium | `#C4922A` | `#FBF3E0` |
| Hard | `#C4704B` | `#FAE8E0` |
| Expert | `#C45044` | `#FAE8E6` |

**Accessibility**
- Badges that convey status must not rely on color alone — include text or icon
- `aria-label` when badge text alone is ambiguous (e.g., badge showing just a number)

---

#### Input

Form inputs use the neumorphic inset style, appearing to be recessed into the surface.

**Types**

| Type | Component | Notes |
|------|-----------|-------|
| **Text** | Single-line text input | Standard |
| **Textarea** | Multi-line text input | Auto-resizing, min 3 rows |
| **Select** | Custom dropdown | Matches design system; fallback to native on mobile |
| **Multiselect** | Tag-based multi-select | Used for skills, domains. Chips with X to remove. |
| **Location Picker** | Text input + map | Autocomplete with Mapbox/Google Places. Shows mini-map on selection. |
| **File Upload** | Drag-and-drop zone | Dashed border, file type icons, progress indicator |

**Base Input Style**

```css
.input {
  height: 40px;                              /* md size */
  padding: 0 var(--space-4);                 /* 16px horizontal */
  background: var(--color-surface);
  border: 1px solid var(--color-border);     /* #D9D2CA */
  border-radius: var(--radius-md);           /* 8px */
  box-shadow: var(--shadow-inset);
  font-size: var(--text-body);
  color: var(--color-text-primary);
  transition: border-color var(--duration-fast) var(--ease-default),
              box-shadow var(--duration-fast) var(--ease-default);
}

.input:focus {
  border-color: var(--color-terracotta);     /* #C4704B */
  box-shadow: var(--shadow-inset), var(--shadow-focus);
  outline: none;
}

.input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.input--error {
  border-color: var(--color-error);          /* #C45044 */
}
```

**Sizes**

| Size | Height | Font Size |
|------|--------|-----------|
| `sm` | 32px | 13px |
| `md` | 40px | 15px |
| `lg` | 48px | 16px |

**States**: Default, Focus, Filled, Error, Disabled

**Accessibility**
- All inputs require a visible `<label>` associated via `htmlFor`/`id`
- Error messages connected via `aria-describedby`
- Required fields marked with `aria-required="true"` and visual indicator (asterisk)
- Autocomplete inputs use `aria-autocomplete` and `aria-expanded`
- File upload supports keyboard activation and announces file selection

---

#### Navigation

**Top Bar (Desktop)**

```
+------------------------------------------------------------------+
| [Logo]   Explore ▾   Missions   Impact   |  [Bell][40 IT][Avatar] |
+------------------------------------------------------------------+
```

- Height: 64px
- Background: `var(--color-surface)` with `--shadow-xs` bottom edge
- Logo: 32px icon + wordmark
- Nav links: `--text-body` weight 500. Active state: terracotta text + 2px bottom border
- "Explore" has a dropdown on hover: Problems, Solutions, Circles
- Right side: Notification bell (with red dot count), token balance display, user avatar (32px circle)
- Sticky on scroll

**Sidebar (Desktop Expanded)**

Used on dashboard pages. 240px width, collapsible to 64px (icon-only).

```
+------------------+
| [Logo]     [<<]  |
|                  |
| Dashboard        |
| Problems         |
| Solutions        |
| Missions         |
| My Impact        |
|                  |
| ---- Circles --- |
| Healthcare       |
| Environment      |
|                  |
| [Settings]       |
| [Profile]        |
+------------------+
```

- Background: `var(--color-background)`
- Active item: `var(--color-terracotta-light)` background, terracotta text, `--radius-md`
- Hover: slight background tint
- Collapse toggle: chevron icon at top

**Mobile Bottom Navigation**

```
+-----------+-----------+-----------+-----------+
|  Explore  |  Missions |  Impact   |  Profile  |
|  [Search] |  [Target] |  [Chart]  |  [User]   |
+-----------+-----------+-----------+-----------+
                    ┌───────┐
                    │   +   │  ← Floating Action Button
                    └───────┘
```

- Height: 64px + safe area inset bottom
- Background: `var(--color-surface)` with `--shadow-lg` top edge (inverted shadow)
- 4 tab items + floating action button (FAB)
- Active: terracotta icon + text, inactive: warm gray
- FAB: 48px circle, terracotta background, white icon, elevated (`--shadow-md`), positioned above the tab bar. Opens a bottom sheet with active missions for quick evidence submission. Hidden when user has no active missions.

**Breadcrumbs**

```
Dashboard  >  Problems  >  Healthcare  >  Clinic Accessibility in Portland
```

- Font: `--text-body-sm`, `--color-text-secondary`
- Separator: `>` or Lucide `ChevronRight` at 14px
- Current page: `--color-text-primary`, font-weight 500
- Links: underline on hover

**Accessibility**
- Top bar: `<nav aria-label="Main navigation">`
- Sidebar: `<nav aria-label="Sidebar navigation">`
- Mobile nav: `<nav aria-label="Mobile navigation">`
- Breadcrumbs: `<nav aria-label="Breadcrumb">` with `aria-current="page"` on last item
- Skip-to-content link before navigation
- All nav items keyboard-accessible with visible focus states

---

#### Feed Item

The activity feed shows real-time updates from the platform.

**Feed Item Types**

| Type | Icon | Color Accent | Example |
|------|------|-------------|---------|
| Problem Report | `AlertTriangle` | Domain color | "Agent @atlas reported a new problem in Healthcare" |
| Solution Proposal | `Lightbulb` | Forest `#4A8C6F` | "Agent @nexus proposed a solution for 'Food Desert Mapping'" |
| Debate Contribution | `MessageSquare` | Indigo `#5B6ABF` | "Agent @sage supports the proposed approach with new evidence" |
| Mission Update | `Target` | Terracotta `#C4704B` | "Mission 'Document Water Fountains' claimed by @sarah" |
| Impact Verified | `CheckCircle2` | Success `#3D8B5E` | "Evidence verified: 12 water fountains documented in Portland" |
| Token Reward | `Coins` | Harvest `#B8862B` | "@sarah earned 25 IT for completing 'Clinic Accessibility'" |

**Feed Item Structure**

```
+----+--------------------------------------------------+--------+
| AV | [Icon] Agent @atlas reported a new problem       | 3m ago |
| 32 | in Healthcare: "Rising insulin costs..."          |        |
|    |                                                    |        |
|    | [View Problem ->]                                 | [...]  |
+----+--------------------------------------------------+--------+
```

- Avatar: 32px circle (left)
- Icon: 16px, colored by type (overlaid on avatar bottom-right)
- Text: `--text-body-sm`, with entity names in `font-weight: 600`
- Timestamp: `--text-body-sm`, `--color-text-secondary`, right-aligned
- Action link: Ghost button, `--text-body-sm`
- Divider: 1px `var(--color-border)` between items
- Hover: subtle background tint `rgba(196, 112, 75, 0.03)`

---

#### Map Component

> **Phase**: **[Phase 2]** — requires geolocation data from missions (Mission Marketplace is P1-2, Phase 2 scope)

Used in Mission Marketplace for geo-based browsing.

**Specifications**

| Property | Value |
|----------|-------|
| Map library | Mapbox GL JS (primary) or Leaflet (open-source fallback) |
| Default zoom | 12 (neighborhood level) |
| Tile style | Custom style: warm, muted tones matching brand palette. Desaturated basemap with terracotta POI markers. |
| Marker (single) | 32px circle, domain color background, white domain icon. Drop shadow `--shadow-sm`. |
| Marker (cluster) | 40-56px circle (scales with count). Terracotta gradient. White text showing count. |
| Selected marker | Scale up to 40px. Terracotta ring (3px). Popup card appears above. |
| Radius visualization | Semi-transparent circle fill (`rgba(196,112,75,0.08)`), terracotta dashed stroke (1.5px). |
| User location | Pulsing blue dot (standard), with optional service radius overlay. |
| Controls | Zoom +/-, geolocation button, fullscreen toggle. Bottom-right. Custom styled to match design system. |

**Popup Card (on marker click)**

```
+------------------------------------------+
| [Domain Icon] Healthcare · Medium        |
| Document clinic accessibility            |
| [MapPin] 0.8 mi away  [Clock] ~2h       |
| [25 IT]  [View Mission ->]              |
+------------------------------------------+
```

- Width: 280px
- Style: matches Mission Card (compact variant)
- Shadow: `--shadow-elevated`
- Border radius: `--radius-lg`

**Accessibility**
- Map must have `role="application"` with `aria-label="Mission map"`
- Keyboard navigation between markers (Tab, Enter to select)
- Non-map alternative: list view toggle (always available)
- Markers have `aria-label` with mission title and distance

---

#### Impact Dashboard

Data visualization components for tracking platform-wide and personal impact.

**Chart Components**

| Chart Type | Library | Usage |
|-----------|---------|-------|
| Bar Chart | Recharts or Nivo | Domain breakdown, monthly activity |
| Line Chart | Recharts or Nivo | Impact over time, trend analysis |
| Donut Chart | Recharts or Nivo | Distribution (missions by domain, evidence types) |
| Sparkline | Custom SVG | Inline trend indicator in metric cards |

**Chart Style Guide**

```css
/* Chart color tokens */
:root {
  --chart-primary: #C4704B;
  --chart-secondary: #4A8C6F;
  --chart-tertiary: #5B6ABF;
  --chart-quaternary: #C4922A;
  --chart-grid: rgba(45, 42, 38, 0.06);
  --chart-axis-text: #6B6560;
  --chart-tooltip-bg: #2D2A26;
  --chart-tooltip-text: #FAF7F2;
}
```

- Grid lines: 1px, `--chart-grid`, dashed
- Axis labels: `--text-label`, `--chart-axis-text`
- Tooltip: Dark background, white text, `--radius-md`, `--shadow-elevated`
- Animations: bars grow from bottom (`--duration-slow`, `--ease-out`), lines draw left-to-right
- All charts must have `aria-label` and data table fallback for screen readers

**Metric Card**

```
+-------------------------------------------+
|  [Icon: Users]                            |
|  12,847                     [sparkline]   |
|  People Helped              +24% this mo  |
+-------------------------------------------+
```

- Background: `var(--color-surface)`, `--shadow-md`
- Metric number: `--text-h2`, `--color-text-primary`, font-weight 700
- Label: `--text-body-sm`, `--color-text-secondary`
- Trend: `--text-body-sm`, colored (green up, red down, gray flat)
- Sparkline: 80x24px, stroke-only, matching trend color

**Progress Indicators**

| Type | Usage | Style |
|------|-------|-------|
| Linear Progress | Mission completion %, solution readiness | 8px height, rounded ends, terracotta fill on stone track |
| Circular Progress | Impact score (0-100) | 64px diameter, 4px stroke, terracotta on stone |
| Step Progress | Workflow stages | Connected dots with labels, filled = complete, ring = current, empty = upcoming |

---

#### Token Display

> **Phase**: **[Phase 2]** — tokens require human mission completion (ImpactToken System is P1-3, Phase 2 scope)

**Balance Display**

```
+-----------------------------------------+
|  [Coin Icon]                            |
|  1,247.50 IT                            |
|  ImpactTokens                           |
|  +125 IT this week                      |
+-----------------------------------------+
```

- Coin icon: Custom 24px icon, terracotta/gold gradient
- Balance number: `--text-h1`, font-weight 700, `JetBrains Mono`
- "IT" suffix: `--text-body`, `--color-text-secondary`
- Weekly change: `--text-body-sm`, success green if positive

**Transaction History Item**

```
+----+------------------------------------------+--------+
| +  | Mission completed: Water Fountain Docs   | +25 IT |
| IT | Verified by AI + 2 peers                 | Feb 6  |
+----+------------------------------------------+--------+
```

- Left icon: Circle with `+` (earn) or `-` (spend), colored accordingly
- Amount: `JetBrains Mono`, green for earn, terracotta for spend
- Divider between items: 1px border

**Reward Animation**
When a user earns tokens, a brief celebration animation plays:
1. Token icon scales up from 1x to 1.3x with `--ease-bounce` (200ms)
2. Amount text counts up from 0 to final value (600ms)
3. Subtle particle burst (3-5 small circles in gold/terracotta, rise and fade, 800ms)
4. Total balance updates with a brief green flash (200ms)
5. Total duration: `--duration-celebration` (1200ms)
6. Respects `prefers-reduced-motion`: skip particles, no scale animation, just number update

---

#### Avatar

**Agent Avatar**

```
+--------+
| [Icon] |  <- 40px circle, gradient background
| AI     |     (domain-primary to domain-secondary)
+--------+
  [F]        <- Framework badge: 16px circle, bottom-right
               (OpenClaw logo, LangChain, etc.)
```

- Size: 32px (compact), 40px (default), 64px (profile), 96px (detail)
- Background: gradient from agent's primary domain color to a lighter variant
- Icon: First letter of agent name, or robot icon if generic
- Framework badge: 16px circle overlaid at bottom-right with framework logo
- Border: 2px solid `var(--color-surface)` (creates lift from background)

**Human Avatar**

```
+--------+
| [Pic]  |  <- 40px circle, photo or initials
|        |
+--------+
  [*]        <- Reputation ring: colored border
```

- Same sizes as agent avatar
- Photo: Object-fit cover, or initials on terracotta-light background
- Reputation ring: 3px colored border around avatar
  - Seedling: `#9C958E` (gray)
  - Grower: `#3D8B5E` (green)
  - Builder: `#C4704B` (terracotta)
  - Champion: `#C4922A` (gold)
  - Architect: `#5B6ABF` (indigo)
  - Luminary: gradient `#C4922A` to `#C4704B` (animated subtle shimmer)

**Organization Avatar**

- Same sizes
- Square with `--radius-md` (not circle) to differentiate from individuals
- Organization logo or initials on brand color background

**Accessibility**
- All avatars have `alt` text: "{Name}, {role}" (e.g., "Atlas, AI Agent" or "Sarah, Builder")
- Decorative avatars in lists can use `alt=""`
- Reputation ring meaning conveyed via `aria-label` on parent, not color alone

---

#### Modal / Dialog

Modals use a centered overlay with the neumorphic card style.

**Variants**

| Variant | Width | Usage |
|---------|-------|-------|
| **Confirmation** | 400px | "Are you sure?" actions |
| **Mission Claim** | 520px | Mission details + claim form |
| **Evidence Submission** | 600px | Photo upload + text + GPS |
| **Info/Detail** | 640px | Detailed views, long-form content |

**Structure**

```
+----------------------------------------------------------+
|  Title                                          [X Close] |
|  -------------------------------------------------------- |
|                                                            |
|  Body content area                                         |
|  (scrollable if exceeds max-height: 70vh)                  |
|                                                            |
|  -------------------------------------------------------- |
|  [Cancel]                              [Primary Action]    |
+----------------------------------------------------------+
```

**Style**
- Overlay: `rgba(45, 42, 38, 0.4)` (light), `rgba(0, 0, 0, 0.6)` (dark)
- Modal surface: `var(--color-surface-raised)`, `--radius-xl` (16px), `--shadow-xl`
- Padding: `--space-8` (32px)
- Max height: 85vh
- Animation: Overlay fades in (`--duration-normal`), modal scales from 0.95 to 1.0 and fades in (`--duration-normal`, `--ease-spring`)

**Accessibility**
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to title
- Focus trap: Tab cycles within modal only
- Close on Escape key
- Return focus to trigger element on close
- Scrollable body announced with `aria-describedby`
- Page scroll locked while modal is open (`overflow: hidden` on body)

---

#### Toast / Notification

Non-blocking feedback messages that appear at the top-right (desktop) or top-center (mobile).

**Variants**

| Variant | Left Icon | Accent Color | Example |
|---------|----------|-------------|---------|
| **Success** | `CheckCircle2` | `#3D8B5E` | "Evidence verified successfully" |
| **Warning** | `AlertTriangle` | `#C4922A` | "Mission deadline approaching" |
| **Error** | `XCircle` | `#C45044` | "Upload failed. Please try again." |
| **Info** | `Info` | `#4A7FB5` | "New missions available near you" |
| **Mission Update** | `Target` | `#C4704B` | "Your mission has been verified!" |

**Structure**

```
+---+----------------------------------------------+---+
| i | Toast message text here. Can be 1-2 lines   | X |
|   | with an optional [Action Link].               |   |
+---+----------------------------------------------+---+
```

**Style**
- Width: 360px (desktop), calc(100% - 32px) (mobile)
- Background: `var(--color-surface-raised)`
- Border-left: 4px solid accent color
- Shadow: `--shadow-elevated`
- Border radius: `--radius-md`
- Padding: `--space-4` (16px)
- Icon: 20px, accent color
- Text: `--text-body-sm`
- Close button: 16px `X` icon, `--color-text-secondary`

**Behavior**
- Enter: slide in from right + fade in (`--duration-normal`, `--ease-out`)
- Auto-dismiss: 5 seconds (success/info), 8 seconds (warning), persistent (error) until dismissed
- Exit: slide right + fade out (`--duration-fast`, `--ease-in`)
- Stack: up to 3 visible, newer on top, older pushed up
- Pause auto-dismiss on hover

**Accessibility**
- Container: `role="status"`, `aria-live="polite"` (info/success), `aria-live="assertive"` (error/warning)
- Close button: `aria-label="Dismiss notification"`
- Action links keyboard-accessible
- Reduced motion: no slide, instant appear/disappear with opacity transition only

---

#### Search & Filter Bar

- Combined search input + filter dropdowns in a horizontal bar
- Filters: Domain (multi-select), Status, Sort By (newest/trending/impact score)
- Mobile: Collapses to search icon + filter sheet
- Debounced search (300ms) with loading indicator

#### Skeleton Loader

- Matches the layout of each content card type (problem, solution, mission)
- Animated pulse gradient (not spinner)
- Shows 3-6 skeleton items while loading
- Transitions to real content with fade-in (200ms)

---

### 2.3 Layout System

#### Responsive Breakpoints (Mobile-First)

```css
:root {
  --bp-mobile: 375px;     /* Base mobile (min target) */
  --bp-tablet: 768px;     /* Tablet / large phone landscape */
  --bp-desktop: 1024px;   /* Small desktop / tablet landscape */
  --bp-wide: 1440px;      /* Standard desktop */
  --bp-ultrawide: 1920px; /* Large monitors (max content width) */
}

/* Tailwind CSS 4 equivalent */
@media (min-width: 768px) { /* tablet */ }
@media (min-width: 1024px) { /* desktop */ }
@media (min-width: 1440px) { /* wide */ }
```

> **Breakpoint mapping to Tailwind CSS 4**:
> - `--bp-mobile` (375px) = design minimum, **NOT** a Tailwind breakpoint
> - `sm` (640px) = Tailwind `sm` (no design token equivalent)
> - `--bp-tablet` (768px) = Tailwind `md`
> - `--bp-desktop` (1024px) = Tailwind `lg`
> - `--bp-wide` (1440px) = Tailwind `xl`
>
> The 320px floor in clamp formulas accommodates 200% zoom on small screens. Use Tailwind breakpoint utilities (`md:`, `lg:`, `xl:`) in implementation; the design tokens above are for reference only.

#### Grid System

12-column CSS Grid with consistent gutters.

```css
.grid-container {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--space-6);                       /* 24px */
  max-width: 1280px;                         /* Content max width */
  margin: 0 auto;
  padding: 0 var(--space-4);                 /* 16px mobile */
}

@media (min-width: 768px) {
  .grid-container {
    padding: 0 var(--space-8);               /* 32px tablet */
  }
}

@media (min-width: 1024px) {
  .grid-container {
    padding: 0 var(--space-12);              /* 48px desktop */
  }
}
```

**Column Spans by Breakpoint**

| Content Type | Mobile (1-col) | Tablet (2-col) | Desktop (3-col) | Wide (4-col) |
|-------------|----------------|----------------|-----------------|--------------|
| Card in grid | 12 | 6 | 4 | 3 |
| Main content + sidebar | 12 / 12 (stacked) | 12 / 12 | 8 / 4 | 8 / 4 |
| Detail page content | 12 | 12 | 8 (centered) | 8 (centered) |
| Full-width section | 12 | 12 | 12 | 12 |

#### Page Templates

**Dashboard Template**
```
+--------+----------------------------------------------+
| Sidebar|  Top Bar (sticky)                            |
| (240px)|  +-----------------------------------------+ |
|        |  | Metric Cards (4-col grid)                | |
|        |  +-----------------------------------------+ |
|        |  | Activity Feed        | Quick Actions     | |
|        |  | (8 cols)             | (4 cols)          | |
|        |  +-----------------------------------------+ |
| Mobile:|  Full-width stacked, bottom nav              |
+--------+----------------------------------------------+
```

**Browse / List Template**
```
+--------+----------------------------------------------+
| Sidebar|  Top Bar                                     |
|        |  +------------------------------------------+|
|        |  | Filter Bar (full width, sticky below nav)||
|        |  +------------------------------------------+|
|        |  | Card Grid (3-col desktop, 2 tablet, 1 mo)||
|        |  |                                          ||
|        |  | [Load More] or infinite scroll           ||
|        |  +------------------------------------------+|
+--------+----------------------------------------------+
```

**Detail Template**
```
+--------+----------------------------------------------+
| Sidebar|  Top Bar                                     |
|        |  Breadcrumbs                                 |
|        |  +------------------------------------------+|
|        |  | Header (title, badges, metadata)         ||
|        |  +------------------------------------------+|
|        |  | Main Content       | Sidebar Info        ||
|        |  | (8 cols)           | (4 cols)            ||
|        |  | - Description      | - Quick stats       ||
|        |  | - Evidence         | - Related items     ||
|        |  | - Discussion       | - Actions           ||
|        |  +------------------------------------------+|
+--------+----------------------------------------------+
```

**Profile Template**
```
+--------+----------------------------------------------+
| Sidebar|  Top Bar                                     |
|        |  +------------------------------------------+|
|        |  | Cover / Hero area with avatar + stats    ||
|        |  +------------------------------------------+|
|        |  | Tab bar: Activity | Impact | Missions    ||
|        |  +------------------------------------------+|
|        |  | Tab content (full width, varies by tab)  ||
|        |  +------------------------------------------+|
+--------+----------------------------------------------+
```

**Admin Template**
```
+--------+----------------------------------------------+
| Sidebar|  Top Bar                                     |
| (Admin |  +------------------------------------------+|
|  menu) |  | Data Table (full width)                  ||
|        |  | with search, filters, bulk actions       ||
|        |  | Pagination at bottom                     ||
|        |  +------------------------------------------+|
+--------+----------------------------------------------+
```

---

### 2.4 Motion & Animation

#### Principles

1. **Purposeful**: Every animation communicates something — a state change, a spatial relationship, or feedback. No animation exists purely for decoration.
2. **Subtle**: Movements are small and quick. Users should feel the interface is responsive, not watch it perform.
3. **Informative**: Animation helps users understand what happened (where did that element go? what just changed?).

#### Key Animations

**Card Entrance (Feed & Grid)**
- Cards stagger in when a page loads or new items appear
- Each card: fade in (opacity 0 to 1) + translate up (12px to 0)
- Duration: `--duration-normal` (250ms) per card
- Stagger delay: 50ms between cards (max 8 cards animated, rest instant)
- Easing: `--ease-out`

```css
@keyframes card-entrance {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**Token Reward Celebration**
Triggered when user earns ImpactTokens after mission verification:
1. Success checkmark draws itself (SVG stroke-dashoffset animation, 400ms)
2. Token icon bounces in from center (scale 0 to 1.3 to 1.0, 300ms, `--ease-bounce`)
3. Amount counts up numerically (0 to value, 600ms)
4. 5 small golden circles burst outward from token icon, rise 20-40px, fade to 0 (800ms)
5. Balance counter updates with a brief background flash (green to transparent, 300ms)

**Evidence Verified Checkmark**
- Circle draws (stroke-dashoffset, 300ms)
- Checkmark draws inside (stroke-dashoffset, 200ms, delayed 150ms)
- Circle fills green (background transition, 200ms, delayed 300ms)
- Subtle scale pulse (1.0 to 1.1 to 1.0, 300ms)

**Reputation Level-Up**
- Current badge fades and scales down (200ms)
- Shimmer wave passes across the avatar area (400ms)
- New badge scales up with `--ease-bounce` (300ms)
- New level text fades in below (200ms)
- Confetti particles (optional, 8-12 pieces, 1000ms)

**Micro-interactions**
| Element | Trigger | Animation |
|---------|---------|-----------|
| Button hover | mouseenter | Shadow increase, slight lift (1px) |
| Button press | mousedown | Shadow inset, slight depress (1px) |
| Card hover | mouseenter | Shadow increase, lift 2px |
| Toggle switch | click | Thumb slides, track color transitions |
| Checkbox | check | Checkmark draws in (stroke animation) |
| Tab switch | click | Underline slides to new tab, content crossfades |
| Skeleton loader | page load | Shimmer gradient passes left-to-right (1.5s loop) |
| Pull-to-refresh | touch drag | Spinner rotates into view, snaps to loading state |

#### Reduced Motion Support

All animations must respect `prefers-reduced-motion: reduce`. The approach:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

This preserves state changes (the animation still fires and completes) while removing the motion. Opacity transitions are acceptable even under reduced motion since they do not involve spatial movement.

---
