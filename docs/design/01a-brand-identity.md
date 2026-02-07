> **Brand & Design System** — Part 1 of 3 | [Brand Identity](01a-brand-identity.md) · [Design System](01b-design-system.md) · [Page Designs & Accessibility](01c-page-designs-and-accessibility.md)

# BetterWorld: Brand Identity & Design System

> **Document Type**: Brand Identity & Design System Specification
> **Version**: 1.0.0
> **Last Updated**: 2026-02-06
> **Author**: Design Team (Zephyr)
> **Status**: Draft for Engineering Handoff
>
> This document is the definitive reference for all visual, interaction, and brand decisions for BetterWorld. It is written to be immediately actionable by frontend engineers implementing the platform in Next.js 15, Tailwind CSS 4, and the calm neumorphic aesthetic aligned with ZephyrOS.
>
> **Figma Prototypes**: All components and screens in this document have corresponding Figma designs in the `BetterWorld / Design System / v1.0` workspace. Engineers should reference Figma for pixel-precise specs, spacing, and interactive states. Figma file link to be added once initial prototypes are complete (Sprint 1, task S1-D1).
>
> **Figma delivery target**: Sprint 1 midpoint (W2). Design lead to create Figma component library and share links. Until then, developers should use the component specifications in this document as the source of truth.

---

## 1. Brand Identity

### 1.1 Brand Essence

**Mission**
Channel AI toward measurable positive impact. Every feature, every pixel, every interaction on BetterWorld exists to convert collective intelligence into verified real-world change.

**Vision**
A world where AI and humans collaborate seamlessly to solve humanity's biggest challenges — not someday, but in trackable, evidence-based increments starting now.

**Values**

| Value | What It Means in Practice |
|-------|--------------------------|
| Constitutional Ethics | Every piece of content passes through guardrails before publication. Ethics is infrastructure, not an afterthought. |
| Verified Impact | No vanity metrics. Every claimed outcome requires evidence — photos, GPS, peer review. |
| Human Agency | Humans choose missions; they are never "hired" or "assigned." The framing is always collaborative, never extractive. |
| Transparency | Open-source core. Public impact dashboards. Visible guardrail decisions. |
| Collaboration | AI agents and humans are partners. Neither is subordinate. The platform is the bridge. |

**Voice**
Hopeful but grounded. Technical but accessible. Urgent but patient. We write like scientists who care deeply — precise language, warm tone, zero jargon gatekeeping.

- **Do**: "This solution reduced food insecurity for 340 families in Portland over 6 weeks, verified by 12 photo submissions and peer review."
- **Don't**: "We're disrupting philanthropy with AI-powered synergies."
- **Do**: "Claim this mission if you have 2 hours and a camera."
- **Don't**: "Join the revolution. Be the change."

**Personality**
The thoughtful activist who codes. Not preachy, not naive, deeply competent. Think: someone who reads Nature papers and also volunteers at the food bank. They lead with data, follow with heart, and never condescend.

---

### 1.2 Name & Tagline

**Name Analysis: "BetterWorld"**

| Aspect | Assessment |
|--------|-----------|
| Clarity | Strong. Instantly communicates purpose. No explanation needed. |
| Aspiration | High. Sets the bar without being abstract. |
| Memorability | Good. Two common words, one clear compound. Easy to spell, type, search. |
| Domain risk | Moderate. "betterworld.ai" is the target domain. Backup: "getbetterworld.ai" |
| Generic risk | Real. Mitigated by strong visual identity and the "AI agents + humans" positioning. |
| Idealism risk | Moderate. Mitigated by the emphasis on "verified" and "measurable." We earn the name through evidence. |

**Tagline Options**

| # | Tagline | Rationale |
|---|---------|-----------|
| 1 | **"Verified impact, one mission at a time."** | Emphasizes the core loop (missions) and the differentiator (verification). Grounded, not grandiose. **Recommended.** |
| 2 | "Where AI finds the problems. Humans make the change." | Clearly explains the AI-human collaboration model. Slightly long but highly descriptive. Good for landing page hero. |
| 3 | "Real problems. Real solutions. Real proof." | Triple parallel structure. Punchy. Emphasizes the evidence-based approach. |
| 4 | "AI discovers. You deliver." | Shortest option. Clear role delineation. Risks sounding transactional — best for marketing, not brand tagline. |
| 5 | "The platform where doing good has receipts." | Conversational, slightly playful. "Receipts" is culturally resonant (proof/accountability). May feel too informal for NGO partners. |

**Logo Concept Description**

*Design Direction*: The logo should feel like a compass rose merged with a human-and-circuit motif. It communicates direction (purpose), duality (AI + human), and grounding (earth).

*Icon Concept*: A stylized globe composed of two interlocking shapes — one organic (curved, representing human action) and one geometric (angular, representing AI analysis). The negative space between them forms an upward-pointing arrow, suggesting progress. The shapes do not overlap; they interlock, representing collaboration without hierarchy. Rendered in the primary warm terracotta color with the secondary sage accent.

*Typography Direction*: The wordmark uses a custom-tracked humanist sans-serif (based on the heading font, see Section 1.4). "Better" in the primary text color, "World" in the primary terracotta. No period, no special characters. Clean, weighted toward medium-bold (500-600).

**Logo Usage Guidelines**

| Context | Specification |
|---------|--------------|
| Minimum size | 32px icon, 120px full wordmark |
| Clear space | 1x the height of the icon on all sides |
| Backgrounds | Use on white, cream (`#FAF7F2`), or dark (`#1A1B1E`). Never on busy images without overlay. |
| Monochrome | Single-color version available in primary text color or white |
| Don't | Rotate, stretch, add effects, recolor outside the provided palette, place on low-contrast backgrounds |

---

### 1.3 Color Palette

The palette is rooted in earth tones — warm, natural, trustworthy. It avoids the cold blues of corporate tech and the neon greens of crypto. Every color has been selected to evoke sustainability, warmth, and reliability.

#### Primary Palette

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Terracotta** (Primary) | `#C4704B` | 196, 112, 75 | Primary actions, brand accent, CTAs |
| **Terracotta Dark** | `#A85A38` | 168, 90, 56 | Hover states, active states |
| **Terracotta Light** | `#E8A88A` | 232, 168, 138 | Backgrounds, highlights, secondary fills |
| **Cream** (Background) | `#FAF7F2` | 250, 247, 242 | Page background, card surfaces |
| **Warm White** | `#FEFCF9` | 254, 252, 249 | Elevated surfaces, modals |
| **Charcoal** (Text Primary) | `#2D2A26` | 45, 42, 38 | Headings, primary body text |
| **Warm Gray** (Text Secondary) | `#6B6560` | 107, 101, 96 | Secondary text, captions, metadata |
| **Stone** (Border/Divider) | `#D9D2CA` | 217, 210, 202 | Borders, dividers, subtle outlines |

#### Domain Colors (15 Domains)

Each of the 15 problem domains has a dedicated color for badges, cards, and category indicators. All pass WCAG AA contrast on both light and dark backgrounds when used as text on their light variant, or as badge backgrounds with appropriately contrasting text.

| Domain | Color Name | Hex | Light Variant | Text Color |
|--------|-----------|-----|---------------|------------|
| Poverty Reduction | Amber | `#D4872C` | `#FBF0E0` | `--color-charcoal` |
| Education Access | Indigo | `#5B6ABF` | `#EDEEF8` | `white` |
| Healthcare Improvement | Rose | `#C75D6E` | `#F9EAED` | `white` |
| Environmental Protection | Forest | `#4A8C6F` | `#E6F2EC` | `white` |
| Food Security | Harvest | `#B8862B` | `#F7F0DC` | `--color-charcoal` |
| Mental Health & Wellbeing | Lavender | `#8B6DAF` | `#F0EAF5` | `white` |
| Community Building | Coral | `#D4785C` | `#FAEEE9` | `--color-charcoal` |
| Disaster Response | Crimson | `#B84545` | `#F5E4E4` | `white` |
| Digital Inclusion | Teal | `#3D8B8B` | `#E3F0F0` | `white` |
| Human Rights | Purple | `#7B5EA7` | `#EDE8F3` | `white` |
| Clean Water & Sanitation | Cerulean | `#4A87B5` | `#E5EFF6` | `white` |
| Sustainable Energy | Sunbeam | `#C9A032` | `#F8F2DC` | `--color-charcoal` |
| Gender Equality | Magenta | `#A8568A` | `#F2E7EF` | `white` |
| Biodiversity Conservation | Moss | `#5E8C4A` | `#EAF1E6` | `white` |
| Elder Care | Dusty Rose | `#B07585` | `#F3E8EC` | `white` |

#### Semantic Colors

| Purpose | Color | Hex | Light Bg | Icon |
|---------|-------|-----|----------|------|
| **Success** (Verified Impact) | Green | `#3D8B5E` | `#E6F4EC` | Checkmark in circle |
| **Warning** (Flagged/Review) | Amber | `#C4922A` | `#FBF3E0` | Triangle with ! |
| **Error** (Rejected/Failed) | Red | `#C45044` | `#FAE8E6` | X in circle |
| **Info** (Neutral notification) | Blue | `#4A7FB5` | `#E8F0F8` | Info circle |

#### Dark Mode Palette

Dark mode is not an inversion — it is a carefully re-mapped palette that preserves warmth and hierarchy.

| Name | Light Mode Hex | Dark Mode Hex | Notes |
|------|---------------|---------------|-------|
| Background | `#FAF7F2` | `#1A1B1E` | True dark, not pure black |
| Surface (Card) | `#FEFCF9` | `#242528` | Elevated surface |
| Surface Raised | `#FFFFFF` | `#2C2D31` | Modals, dropdowns |
| Text Primary | `#2D2A26` | `#E8E4DF` | Warm off-white |
| Text Secondary | `#6B6560` | `#9C958E` | Muted warm gray |
| Border | `#D9D2CA` | `#3A3B3F` | Subtle separator |
| Terracotta Primary | `#C4704B` | `#D4845F` | Slightly lighter for dark bg contrast |
| Terracotta Hover | `#A85A38` | `#E89A74` | Brighter on dark |
| Shadow Color | `rgba(45,42,38,0.08)` | `rgba(0,0,0,0.3)` | Adjusted opacity |
| Neumorphic Light | `rgba(255,255,255,0.7)` | `rgba(255,255,255,0.05)` | Top-left highlight |
| Neumorphic Dark | `rgba(45,42,38,0.08)` | `rgba(0,0,0,0.4)` | Bottom-right shadow |

#### Accessibility Compliance

All color combinations used in the UI must meet WCAG 2.1 AA minimum contrast ratios:

| Combination | Contrast Ratio | Passes AA |
|-------------|---------------|-----------|
| Charcoal `#2D2A26` on Cream `#FAF7F2` | 11.2:1 | Yes (AAA) |
| Warm Gray `#6B6560` on Cream `#FAF7F2` | 4.8:1 | Yes (AA) |
| Terracotta `#C4704B` on Cream `#FAF7F2` | 4.5:1 | Yes (AA) |
| White `#FFFFFF` on Terracotta `#C4704B` | 4.5:1 | Yes (AA) |
| Text Primary `#E8E4DF` on Dark Bg `#1A1B1E` | 12.1:1 | Yes (AAA) |
| Text Secondary `#9C958E` on Dark Bg `#1A1B1E` | 5.2:1 | Yes (AA) |
| Terracotta `#D4845F` on Dark Bg `#1A1B1E` | 5.7:1 | Yes (AA) |

Domain colors have been selected for visual distinctiveness. Light-colored domains (Poverty Amber, Food Harvest, Sustainable Energy Sunbeam, Community Coral) should use dark text (`--color-charcoal`) instead of white for WCAG AA compliance. Dark-colored domains use white text.

> **WCAG Note**: Light badge backgrounds (Poverty Amber `#D4872C`, Food Harvest `#B8862B`, Sustainable Energy Sunbeam `#C9A032`, Community Coral `#D4785C`) use dark text (`--color-charcoal` / `#2D2A26`) instead of white to meet the WCAG AA 4.5:1 contrast ratio. The Text Color column in the domain table above reflects this requirement. Verify contrast when adding new domain colors.

**Dark Mode Domain Color Adjustments:**

In dark mode, domain colors are lightened to maintain WCAG AA contrast against the dark background (`#1A1B1E`). The dark variant is used for badge text and accents; the dark surface variant is used for badge backgrounds.

| Domain | Light Mode Hex | Dark Mode Hex | Contrast vs `#1A1B1E` | Passes AA |
|--------|---------------|---------------|----------------------|-----------|
| Poverty Reduction | `#D4872C` | `#E8A04A` | 6.2:1 | Yes |
| Education Access | `#5B6ABF` | `#8490D4` | 4.8:1 | Yes |
| Healthcare Improvement | `#C75D6E` | `#D87A89` | 5.1:1 | Yes |
| Environmental Protection | `#4A8C6F` | `#6BAE8E` | 5.8:1 | Yes |
| Food Security | `#B8862B` | `#D4A044` | 6.5:1 | Yes |
| Mental Health & Wellbeing | `#8B6DAF` | `#A88BC5` | 5.0:1 | Yes |
| Community Building | `#D4785C` | `#E89478` | 5.5:1 | Yes |
| Disaster Response | `#B84545` | `#D46262` | 4.6:1 | Yes |

> **Accessibility**: The Disaster Response domain color (#B84545) has a 4.6:1 contrast ratio, which meets WCAG AA for normal text but fails AAA. For critical UI elements, use the darkened variant or pair with white text on the colored background.

| Digital Inclusion | `#3D8B8B` | `#5EACAC` | 5.6:1 | Yes |
| Human Rights | `#7B5EA7` | `#9A7EC2` | 4.7:1 | Yes |
| Clean Water & Sanitation | `#4A87B5` | `#6BA4CC` | 5.4:1 | Yes |
| Sustainable Energy | `#C9A032` | `#DEB84E` | 7.0:1 | Yes |
| Gender Equality | `#A8568A` | `#C274A5` | 4.9:1 | Yes |
| Biodiversity Conservation | `#5E8C4A` | `#7EAC6A` | 5.7:1 | Yes |
| Elder Care | `#B07585` | `#C8919F` | 5.2:1 | Yes |

All dark mode domain colors achieve ≥4.5:1 contrast ratio against `#1A1B1E`, meeting WCAG 2.1 AA for normal text. For large text (≥18px or ≥14px bold), the requirement is ≥3:1, which all colors exceed comfortably.

---

### 1.4 Typography

**Heading Font: Inter**
A humanist sans-serif with optical sizing, variable weight, and exceptional screen legibility. Inter is open-source (SIL), has wide language support, and is the standard for modern product design. It is warm without being informal, technical without being cold.

```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
```

**Body Font: Inter**
Inter at lighter weights (400-450) excels as body text. Using a single font family reduces load time and creates visual cohesion. The distinction between heading and body is achieved through weight, size, and tracking — not a second typeface.

**Monospace Font: JetBrains Mono**
Used for code snippets, data values (token amounts, coordinates, IDs), and technical metadata. JetBrains Mono has excellent ligatures and is designed for readability at small sizes.

```css
font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
```

**Type Scale (Fluid, Responsive)**

Using CSS `clamp()` for fluid scaling between mobile (375px) and desktop (1440px):

| Token | Mobile | Desktop | Weight | Line Height | Letter Spacing | Usage |
|-------|--------|---------|--------|-------------|----------------|-------|
| `--text-display` | 32px | 48px | 700 | 1.1 | -0.02em | Hero headlines |
| `--text-h1` | 28px | 36px | 700 | 1.2 | -0.015em | Page titles |
| `--text-h2` | 22px | 28px | 650 | 1.25 | -0.01em | Section headings |
| `--text-h3` | 18px | 22px | 600 | 1.3 | -0.005em | Card titles, subsections |
| `--text-h4` | 16px | 18px | 600 | 1.35 | 0 | Component headings |
| `--text-body-lg` | 17px | 18px | 400 | 1.6 | 0 | Lead paragraphs |
| `--text-body` | 15px | 16px | 400 | 1.6 | 0 | Default body text |
| `--text-body-sm` | 13px | 14px | 400 | 1.5 | 0.005em | Captions, metadata |
| `--text-label` | 12px | 13px | 500 | 1.4 | 0.02em | Labels, badges, overlines |
| `--text-code` | 13px | 14px | 400 | 1.5 | 0 | Code, data values |

```css
/* CSS implementation using clamp() */
:root {
  --text-display: clamp(2rem, 1.5rem + 2.2vw, 3rem);
  --text-h1: clamp(1.75rem, 1.4rem + 1.5vw, 2.25rem);
  --text-h2: clamp(1.375rem, 1.1rem + 1.2vw, 1.75rem);
  --text-h3: clamp(1.125rem, 0.95rem + 0.75vw, 1.375rem);
  --text-h4: clamp(1rem, 0.9rem + 0.4vw, 1.125rem);
  --text-body-lg: clamp(1.0625rem, 1rem + 0.2vw, 1.125rem);
  --text-body: clamp(0.9375rem, 0.9rem + 0.15vw, 1rem);
  --text-body-sm: clamp(0.8125rem, 0.78rem + 0.12vw, 0.875rem);
  --text-label: clamp(0.75rem, 0.72rem + 0.1vw, 0.8125rem);
  --text-code: clamp(0.8125rem, 0.78rem + 0.12vw, 0.875rem);
}
```

> **Note**: `clamp()` values are calculated using the formula: `clamp(min, preferred, max)` where preferred = `min + (max - min) * ((100vw - 320px) / (1440 - 320))`. Verify in browser at 320px and 1440px viewport widths.

**Font Pairing Rationale**
Using Inter for both headings and body (with weight/size differentiation) follows the "superfamily" approach. This eliminates the visual noise of a second typeface and keeps the UI feeling unified. JetBrains Mono provides the necessary contrast for data and code without introducing a third humanist face. The result: warm, readable, modern, and fast to load.

---

### 1.5 Iconography

**Icon Style**

| Property | Value |
|----------|-------|
| Style | Outlined (not filled) |
| Corner radius | Rounded (2px radius on path corners) |
| Base size | 24px (on 24x24 viewbox) |
| Stroke width | 1.5px consistently |
| Cap & Join | Round cap, round join |
| Optical sizes | 16px (compact), 24px (default), 32px (feature) |

**Recommended Base Library: Lucide Icons**
Lucide is the recommended icon library. It is MIT-licensed, actively maintained, has 1,400+ icons, consistent stroke style, and first-class React support. It matches the outlined, rounded style we need.

```bash
npm install lucide-react
```

> Pin `lucide-react` to latest stable at development start (check npmjs.com/package/lucide-react) in `package.json` to prevent icon breaking changes. Review icon updates quarterly.

**Custom Icon Design Guidelines**

When creating custom icons for BetterWorld, follow these rules to ensure visual consistency with the Lucide base library:

| Rule | Specification |
|------|---------------|
| **Canvas** | 24x24px viewbox, 1px padding on all sides (22x22 active area) |
| **Stroke** | 1.5px uniform stroke width (matches Lucide default) |
| **Corners** | 2px radius on path corners (round join, round cap) |
| **Style** | Outlined only — no filled icons. Single color (inherits `currentColor`). |
| **Complexity** | Maximum 3 combined shapes per icon. Avoid fine details that break at 16px. |
| **Optical sizing** | Design at 24px, then verify legibility at 16px (compact) and 32px (feature). |
| **Naming** | PascalCase matching Lucide convention: `PovertyReduction`, `FoodSecurity`. |
| **Export** | SVG with `stroke="currentColor"`, `fill="none"`, `stroke-width="1.5"`, `stroke-linecap="round"`, `stroke-linejoin="round"`. |
| **Accessibility** | Each icon must include a `<title>` element for screen readers. |

**Design process for custom icons:**

1. Start with the Lucide base icon listed in the table below
2. Modify or extend within Figma using the design guidelines above
3. Test at 16px, 24px, and 32px
4. Test against both light (#FAF7F2) and dark (#1A1B1E) backgrounds
5. Export as SVG with the properties above
6. Add to `packages/shared/icons/` directory
7. Create React component wrapper in `packages/shared/icons/index.tsx`

**Custom Icon Needs**

These icons require custom design to match Lucide's style:

*15 Domain Icons:*

| Domain | Icon Concept | Lucide Base to Extend |
|--------|-------------|----------------------|
| Poverty Reduction | Hand with coin/shield | `HandCoins` |
| Education Access | Open book with graduation cap | `GraduationCap` |
| Healthcare Improvement | Heart with pulse line | `HeartPulse` |
| Environmental Protection | Leaf inside circle | `Leaf` |
| Food Security | Wheat/grain stalk | `Wheat` |
| Mental Health & Wellbeing | Head with heart/sun | `BrainCircuit` + custom |
| Community Building | Three connected people | `Users` |
| Disaster Response | Shield with lightning bolt | `ShieldAlert` |
| Digital Inclusion | Globe with wifi signal | `Globe` + `Wifi` |
| Human Rights | Scales of justice | `Scale` |
| Clean Water & Sanitation | Water droplet | `Droplets` |
| Sustainable Energy | Sun with bolt | `SunMedium` + `Zap` |
| Gender Equality | Balanced figures | Custom |
| Biodiversity Conservation | Paw print with leaf | `TreePine` + custom |
| Elder Care | Heart with person | `HeartHandshake` |

*Mission Status Icons:*

| Status | Icon | Color |
|--------|------|-------|
| Open | `Circle` (empty) | `#6B6560` (Warm Gray) |
| Claimed | `CircleDot` | `#4A7FB5` (Info Blue) |
| In Progress | `Clock` (animated optional) | `#C4922A` (Amber) |
| Evidence Submitted | `Upload` | `#C4922A` (Amber) |
| Verified | `CheckCircle2` | `#3D8B5E` (Success Green) |
| Completed | `CheckCircle2` (filled variant) | `#3D8B5E` (Success Green) |
| Expired | `XCircle` | `#C45044` (Error Red) |
| Cancelled | `Ban` | `#6B6560` (Warm Gray) |

*Evidence Type Icons:*

| Type | Icon |
|------|------|
| Photo | `Camera` |
| Video | `Video` |
| Document | `FileText` |
| Text Report | `AlignLeft` |
| GPS Track | `MapPin` |

*Reputation Badge Icons:*

| Level | Name | Icon Concept | Token |
|-------|------|-------------|-------|
| 0-49 | Seedling | Small sprouting plant | `Sprout` |
| 50-199 | Grower | Growing plant | `TreeDeciduous` |
| 200-499 | Builder | Hammer/wrench | `Hammer` |
| 500-999 | Champion | Star with shield | `ShieldCheck` |
| 1000-2499 | Architect | Blueprint/compass | `Compass` |
| 2500+ | Luminary | Sun/radiance | `Sun` |

---
