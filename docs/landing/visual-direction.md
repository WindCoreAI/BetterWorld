# BetterWorld Landing Page — Visual Direction

> Design specifications, animation guidelines, and asset requirements.

---

## Color Palette (from brand identity)

### Primary
| Name | Hex | Usage |
|------|-----|-------|
| Terracotta | `#C4704B` | Primary CTAs, accents, stat numbers |
| Terracotta Dark | `#A85A38` | Hover states |
| Terracotta Light | `#E8A88A` | Highlights, secondary fills |
| Cream | `#FAF7F2` | Page background |
| Warm White | `#FEFCF9` | Card surfaces |
| Charcoal | `#2D2A26` | Headings, primary text |
| Warm Gray | `#6B6560` | Secondary text, captions |
| Stone | `#D9D2CA` | Borders, dividers |

### Domain Colors (15)
See brand identity doc for full table. Each domain has a unique hex + light variant for cards and badges.

### Dark Mode
| Element | Light | Dark |
|---------|-------|------|
| Background | `#FAF7F2` | `#1A1B1E` |
| Surface | `#FEFCF9` | `#242528` |
| Text Primary | `#2D2A26` | `#E8E4DF` |
| Text Secondary | `#6B6560` | `#9C958E` |
| Terracotta | `#C4704B` | `#D4845F` |

---

## Typography

- **Headings**: Inter (700 weight, tight letter-spacing)
- **Body**: Inter (400 weight)
- **Monospace/Data**: JetBrains Mono (for stats, code snippets, technical details)
- **Display sizes**: Use CSS `clamp()` for fluid scaling (32px mobile → 48px desktop for hero)

---

## Animation Specifications

### Hero Section
- **Gradient mesh**: Animated gradient flowing between terracotta/sage/cream (CSS animation, 20s loop)
- **Domain icons orbit**: 15 small icons floating in a slow orbit pattern around the central concept (Framer Motion, staggered entry)
- **Text reveal**: Headline fades up with slight Y-translate (0.6s, ease-out)
- **CTA pulse**: Subtle scale pulse on the waitlist button (CSS keyframe, 2s interval)

### How It Works (Section 3)
- **Scroll-triggered**: Each step card fades in with stagger (intersection observer + Framer Motion)
- **Connecting particles**: Animated dots/lines flowing between steps (Canvas or SVG animation)
- **Active step**: Current step in viewport gets a subtle glow/lift
- **Guardrail bar**: Continuous subtle pulse animation (border-color cycling through terracotta shades)

### Impact Counters (Section 7)
- **Count-up**: Numbers animate from 0 to target value when scrolled into view (1.5s duration, ease-out)
- **Stagger**: Each counter starts 200ms after the previous
- **Background**: World map with pulsing dots (CSS radial-gradient + opacity animation)

### Domain Grid (Section 5)
- **Hover lift**: Cards lift 4px with shadow increase on hover (0.2s transition)
- **Color accent**: Border transitions to domain color on hover
- **Stagger entry**: Cards fade in sequentially when section enters viewport

### General Principles
- **Performance**: All animations use `transform` and `opacity` only (GPU-composited)
- **Reduced motion**: Respect `prefers-reduced-motion` — disable animations, show static state
- **No autoplay video**: All video content is user-initiated
- **Max animation duration**: 2s for reveals, 20s for ambient loops

---

## Component Design Patterns

### Cards
- Background: `#FEFCF9` (warm white)
- Border radius: 16px
- Shadow: `0 2px 8px rgba(45, 42, 38, 0.08)` (neumorphic, soft)
- Padding: 24px (mobile: 16px)
- Hover: lift 4px, shadow deepens to `0 8px 24px rgba(45, 42, 38, 0.12)`

### Buttons (Primary CTA)
- Background: `#C4704B` (terracotta)
- Text: white, Inter 600
- Border radius: 12px
- Padding: 16px 32px
- Hover: `#A85A38` (darken)
- Active: scale(0.98)
- Focus: 2px outline in terracotta-light

### Section Layout
- Max width: 1200px, centered
- Horizontal padding: 24px (mobile), 48px (tablet), 64px (desktop)
- Section gap: 120px (desktop), 80px (mobile)
- Overline text: uppercase, `#6B6560`, 13px, letter-spacing 0.1em

### Navigation Bar
- Fixed/sticky top
- Background: `#FAF7F2` with backdrop blur on scroll
- Height: 64px
- Logo left, nav links center, CTA right
- Mobile: hamburger menu with slide-in drawer
- Scroll behavior: becomes semi-transparent until scroll > 50px

---

## Asset Requirements

### Images/Graphics to Create

| Asset | Type | Description |
|-------|------|-------------|
| Logo | SVG | Interlocking organic + geometric shapes forming upward arrow |
| Logo wordmark | SVG | "Better" in charcoal, "World" in terracotta |
| Globe graphic | SVG/Lottie | Animated globe made of interlocking AI + human motif |
| Domain icons (15) | SVG | Based on Lucide icons, domain-colored |
| Pipeline flow | SVG | 4-step horizontal flow with connecting lines |
| Guardrail layers | SVG/CSS | 3 stacked layers with data flow |
| Architecture diagram | SVG | Simplified 4-layer stack |
| World map | SVG | Minimal outline map with activity dots |
| Comparison chart | Component | Feature comparison table |
| Social proof avatars | PNG/SVG | Placeholder avatar circles for testimonials |

### Favicon / Meta Images
| Asset | Size | Usage |
|-------|------|-------|
| Favicon | 32x32, 16x16 | Browser tab |
| Apple touch icon | 180x180 | iOS home screen |
| OG image | 1200x630 | Social media sharing |
| Twitter card | 1200x600 | X/Twitter sharing |

### OG Meta Tags
```html
<meta property="og:title" content="BetterWorld — Where AI Finds the Problems. You Make the Change." />
<meta property="og:description" content="The first platform where AI agents and humans collaborate under constitutional guardrails to create verified, measurable positive impact across 15 UN SDG domains." />
<meta property="og:image" content="/og-image.png" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
```

---

## Responsive Breakpoints

| Breakpoint | Width | Layout adjustments |
|-----------|-------|-------------------|
| Mobile | < 640px | Single column, stacked cards, hamburger nav |
| Tablet | 640-1024px | 2-column grid, side nav |
| Desktop | 1024-1440px | Full layout, 3-column grids |
| Wide | > 1440px | Centered with max-width, larger type |

---

## Performance Targets

- Lighthouse Performance: >= 95
- First Contentful Paint: < 1.5s
- Largest Contentful Paint: < 2.5s
- Cumulative Layout Shift: < 0.1
- Total page weight: < 500KB (excluding images)
- Images: WebP/AVIF with lazy loading
- Fonts: Inter variable (subset), preloaded
