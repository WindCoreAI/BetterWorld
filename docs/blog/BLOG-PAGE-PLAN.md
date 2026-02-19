# Blog Page Implementation Plan

> Plan for adding a blog section to the BetterWorld website with shared UI styles and MDX-based content authoring.

---

## Architecture Decision

**Approach: Static MDX files in the repo (no CMS)**

Rationale:
- Blog content is authored by the team, not user-generated
- MDX allows embedding React components (interactive code blocks, diagrams)
- Next.js 15 App Router has native MDX support
- No external dependency (Contentful, Sanity, etc.)
- Content lives in git — version controlled, reviewable in PRs
- Builds at deploy time — zero runtime cost, excellent SEO

---

## File Structure

```
apps/web/
├── src/
│   ├── app/
│   │   └── blog/
│   │       ├── page.tsx                  # Blog index (list all posts)
│   │       └── [slug]/
│   │           └── page.tsx              # Individual blog post page
│   ├── components/
│   │   └── blog/
│   │       ├── BlogCard.tsx              # Post preview card (list page)
│   │       ├── BlogHeader.tsx            # Post header (title, meta, hero)
│   │       ├── BlogContent.tsx           # MDX renderer with styled components
│   │       ├── BlogFooter.tsx            # Author bio, share links, related posts
│   │       ├── BlogSidebar.tsx           # TOC, category filter, search
│   │       ├── CategoryBadge.tsx         # Category pill (colored by category)
│   │       ├── KeywordTag.tsx            # Keyword chip
│   │       ├── ReadingTime.tsx           # Estimated reading time
│   │       ├── ShareButton.tsx           # Social share (copy link, Twitter/X, LinkedIn)
│   │       ├── TableOfContents.tsx       # Auto-generated from headings
│   │       ├── CodeBlock.tsx             # Syntax-highlighted code (reuse from /docs/connect)
│   │       ├── Callout.tsx               # Info/warning/tip callout box
│   │       ├── BlogImage.tsx             # Optimized image with caption + alt
│   │       └── RelatedPosts.tsx          # "You might also like" section
│   ├── content/
│   │   └── blog/
│   │       ├── constitutional-ai-guardrails.mdx
│   │       ├── shipwreck-survivors-platform-design.mdx
│   │       └── ...                       # One MDX file per blog post
│   └── lib/
│       └── blog.ts                       # Blog utilities (parse frontmatter, sort, filter)
```

---

## Content Format (MDX Frontmatter)

Each blog post is an `.mdx` file with YAML frontmatter:

```mdx
---
title: "Constitutional AI in Action: How BetterWorld's 3-Layer Guardrail System Works"
slug: "constitutional-ai-guardrails"
date: "2026-03-01"
author: "BetterWorld Team"
category: "ai-safety"
keywords: ["constitutional AI", "content moderation", "LLM guardrails", "Claude"]
priority: "P0"
excerpt: "Walk through the 3-layer guardrail architecture that ensures every piece of content on BetterWorld serves social good."
coverImage: "/blog/guardrails-cover.png"
readingTime: 12
---

# Introduction

Content here with full MDX support...

<Callout type="info">
This is an interactive callout component embedded in MDX.
</Callout>

```typescript
// Code blocks with syntax highlighting
const result = await guardrail.evaluate(content);
```
```

---

## Shared UI Component Styles

### Design System Alignment

All blog components inherit BetterWorld's existing neumorphic design system:

| Element | Style |
|---------|-------|
| Background | `bg-cream` (#FAF7F2) — matches site |
| Cards | `shadow-neu-md`, `rounded-xl`, hover lift |
| Headings | `font-bold text-charcoal`, Inter font |
| Body text | `text-charcoal-light`, 18px line-height 1.75 |
| Links | `text-terracotta hover:underline` |
| Code | `font-mono` JetBrains Mono, `bg-charcoal text-cream` |
| Category badges | Colored by category (see below) |

### Category Color Map

| Category | Badge Color | Tailwind Class |
|----------|------------|----------------|
| AI Safety | Red | `bg-red-100 text-red-800 border-red-200` |
| Platform Design | Blue | `bg-blue-100 text-blue-800 border-blue-200` |
| Engineering | Green | `bg-green-100 text-green-800 border-green-200` |
| Social Impact | Orange | `bg-orange-100 text-orange-800 border-orange-200` |
| Security & Privacy | Purple | `bg-purple-100 text-purple-800 border-purple-200` |
| Behavioral Science | Teal | `bg-teal-100 text-teal-800 border-teal-200` |

### BlogCard Component (List Page)

```
┌─────────────────────────────────────────────┐
│  ┌───────────────────────────────────────┐  │
│  │         Cover Image (16:9)            │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  [AI Safety]  ·  12 min read  ·  Mar 2026   │
│                                             │
│  Constitutional AI in Action:               │
│  How BetterWorld's 3-Layer Guardrail...     │
│                                             │
│  Walk through the 3-layer guardrail         │
│  architecture that ensures every piece...   │
│                                             │
│  [constitutional AI] [guardrails] [Claude]  │
└─────────────────────────────────────────────┘
```

### Blog Post Layout (Detail Page)

```
┌──────────────────────────────────────────────────────────────┐
│  Navigation Bar                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ← Back to Blog                                              │
│                                                              │
│  [AI Safety]  ·  12 min read  ·  March 1, 2026               │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                                                      │    │
│  │            Hero / Cover Image                        │    │
│  │                                                      │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────┐  ┌────────────────────────────────────┐    │
│  │ Table of    │  │                                    │    │
│  │ Contents    │  │  Article Content (MDX rendered)     │    │
│  │             │  │                                    │    │
│  │ 1. Intro    │  │  ## Introduction                   │    │
│  │ 2. Layer A  │  │                                    │    │
│  │ 3. Layer B  │  │  Content with code blocks,         │    │
│  │ 4. Layer C  │  │  callouts, images, and             │    │
│  │ 5. Results  │  │  interactive components...         │    │
│  │             │  │                                    │    │
│  │ [Share]     │  │                                    │    │
│  │ [Copy Link] │  │                                    │    │
│  └─────────────┘  └────────────────────────────────────┘    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Keywords: [constitutional AI] [guardrails] [Claude] │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ── Related Posts ──────────────────────────────────────────  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ Card 1   │  │ Card 2   │  │ Card 3   │                   │
│  └──────────┘  └──────────┘  └──────────┘                   │
│                                                              │
│  Footer                                                      │
└──────────────────────────────────────────────────────────────┘
```

---

## MDX Typography Styles (BlogContent)

The `BlogContent` component wraps MDX output with consistent `prose`-like styling via Tailwind:

```
Article container:  max-w-3xl mx-auto
Heading 1:          text-4xl font-bold text-charcoal mt-12 mb-6
Heading 2:          text-2xl font-bold text-charcoal mt-10 mb-4 border-b border-charcoal/10 pb-2
Heading 3:          text-xl font-semibold text-charcoal mt-8 mb-3
Paragraph:          text-lg text-charcoal-light leading-relaxed mb-6
Links:              text-terracotta font-medium hover:underline
Bold:               font-semibold text-charcoal
Lists (ul/ol):      ml-6 space-y-2, markers in terracotta
Blockquote:         border-l-4 border-terracotta pl-6 italic text-charcoal-light bg-terracotta/5 py-4 rounded-r-lg
Code (inline):      bg-charcoal/8 text-charcoal px-1.5 py-0.5 rounded font-mono text-[0.9em]
Code (block):       bg-charcoal text-cream rounded-xl p-6 overflow-x-auto font-mono shadow-neu-sm
Table:              w-full border-collapse, striped rows, rounded corners
Image:              rounded-xl shadow-neu-md, optional caption below
Horizontal rule:    border-charcoal/10 my-12
```

---

## Custom MDX Components

### Callout

Four variants: `info`, `warning`, `tip`, `danger`

```
┌──────────────────────────────────────┐
│ 💡 TIP                              │
│                                      │
│ This is a tip callout with useful    │
│ information for the reader.          │
└──────────────────────────────────────┘
```

Styling:
- `info`: `bg-blue-50 border-l-4 border-blue-500`
- `warning`: `bg-amber-50 border-l-4 border-amber-500`
- `tip`: `bg-green-50 border-l-4 border-green-500`
- `danger`: `bg-red-50 border-l-4 border-red-500`

### CodeBlock

Reuse pattern from `/docs/connect` page:
- Language label in top-right corner
- Copy button
- Syntax highlighting (consider `shiki` for build-time highlighting)
- Line numbers optional
- Line highlighting for emphasis

### BlogImage

```tsx
<BlogImage
  src="/blog/guardrails-pipeline.png"
  alt="3-layer guardrail pipeline diagram"
  caption="The 3-layer guardrail pipeline: regex → LLM classifier → human review"
/>
```

- Next.js `<Image>` for optimization
- Rounded corners + shadow
- Caption below in small text
- Click to expand (lightbox optional, future)

---

## Implementation Tasks

### Phase 1: Infrastructure (Foundation)

1. **Install MDX dependencies**
   - `@next/mdx`, `@mdx-js/loader`, `@mdx-js/react`
   - `gray-matter` (frontmatter parsing)
   - `reading-time` (calculate reading time)
   - `shiki` (syntax highlighting, build-time)

2. **Create blog utility library** (`src/lib/blog.ts`)
   - `getAllPosts()` — read all MDX files, parse frontmatter, sort by date
   - `getPostBySlug(slug)` — read single post
   - `getPostsByCategory(category)` — filter by category
   - `getRelatedPosts(post, limit)` — same category, different slug
   - Type definitions: `BlogPost`, `BlogFrontmatter`, `BlogCategory`

3. **Configure Next.js for MDX**
   - Update `next.config.ts` with MDX plugin
   - Set up MDX component mapping (custom h1, h2, p, code, etc.)

### Phase 2: Shared Components

4. **CategoryBadge** — colored pill by category
5. **KeywordTag** — small chip for keywords
6. **ReadingTime** — "12 min read" display
7. **Callout** — info/warning/tip/danger boxes
8. **CodeBlock** — syntax highlighting with copy button (extend existing)
9. **BlogImage** — optimized image with caption
10. **TableOfContents** — auto-generated from headings, sticky sidebar
11. **ShareButton** — copy link + social share

### Phase 3: Page Components

12. **BlogCard** — post preview card for list page
13. **BlogHeader** — title, meta, cover image for detail page
14. **BlogContent** — MDX renderer with all typography styles
15. **BlogFooter** — keywords, author, related posts
16. **BlogSidebar** — TOC + share + category links
17. **RelatedPosts** — 3 related post cards

### Phase 4: Pages

18. **Blog index page** (`/blog`)
    - Grid of BlogCards (responsive: 1 col mobile, 2 col tablet, 3 col desktop)
    - Category filter tabs at top
    - Optional: search by keyword
    - Metadata: title, description for SEO

19. **Blog post page** (`/blog/[slug]`)
    - Dynamic route, `generateStaticParams` for build-time generation
    - BlogHeader + BlogContent + BlogSidebar + BlogFooter
    - SEO metadata from frontmatter (Open Graph, Twitter cards)

### Phase 5: Navigation & SEO

20. **Add "Blog" to navigation** — in Explore dropdown or as top-level link
21. **SEO optimization**
    - `generateMetadata` with title, description, Open Graph image
    - JSON-LD structured data (BlogPosting schema)
    - Sitemap inclusion
22. **RSS feed** (`/blog/feed.xml`) — optional, for subscribers

### Phase 6: First Content

23. **Write first blog post** (Topic #3: End-to-End Impact Journey)
    - Test full pipeline: MDX authoring → rendering → styling → navigation

---

## Dependencies to Add

```json
{
  "@next/mdx": "^15.x",
  "@mdx-js/loader": "^3.x",
  "@mdx-js/react": "^3.x",
  "gray-matter": "^4.x",
  "reading-time": "^1.x",
  "shiki": "^1.x"
}
```

All are well-maintained, widely used, and have no known vulnerabilities.

---

## Responsive Breakpoints

| Breakpoint | Blog Index | Blog Post |
|------------|-----------|-----------|
| Mobile (<640px) | 1 column cards | Full width, no sidebar |
| Tablet (640-1024px) | 2 column cards | Full width, TOC as dropdown |
| Desktop (>1024px) | 3 column cards | Content + sticky sidebar |

---

## Performance Considerations

- **Build-time rendering**: All blog posts are statically generated at build time (SSG)
- **Image optimization**: Next.js `<Image>` with `sizes` and `priority` for above-fold
- **Code highlighting**: Shiki at build time (not runtime)
- **Font loading**: Already loaded (Inter + JetBrains Mono)
- **No client-side JS** for reading content (RSC by default)
- **Lazy load**: Below-fold images, related post cards

---

## Future Enhancements (Not in Initial Scope)

- Full-text search (lunr.js or Algolia)
- Newsletter subscription (Resend or Buttondown)
- View count tracking (simple Redis counter)
- Comment system (GitHub Discussions or Giscus)
- Series/collection support (multi-part blog posts)
- Dark mode (when site-wide dark mode is added)
