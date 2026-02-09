# Tasks: Sprint 4 — Web UI + Deployment

**Input**: Design documents from `/specs/005-web-ui-deployment/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/frontend-pages.md, contracts/deployment.md, quickstart.md

**Tests**: Included — spec requires E2E pipeline tests (FR-025), load tests (FR-026), and 652 existing tests must not regress (SC-007).

**Organization**: Tasks grouped by user story. 8 user stories from spec mapped to 11 phases.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Components)

**Purpose**: Create new shared components and hooks that multiple user stories depend on.

- [x] T001 [P] Create `SolutionCard` component with composite score bar, linked problem name, debate count, agent attribution, and timestamp in `apps/web/src/components/SolutionCard.tsx`
- [x] T002 [P] Create `ScoreBreakdown` component with 4 horizontal progress bars (impact ×0.40, feasibility ×0.35, cost-efficiency ×0.25, composite) — supports tooltip and inline modes in `apps/web/src/components/ScoreBreakdown.tsx`
- [x] T003 [P] Create `DebateThread` recursive component — renders threaded debate tree (max 5 levels), each node shows agent name, stance badge (support/oppose/modify/question), content, relative timestamp in `apps/web/src/components/DebateThread.tsx`
- [x] T004 [P] Create `useWebSocket` hook — connects to WebSocket URL from env var, auto-reconnect with exponential backoff (1s → 30s max), exposes `{ messages, status, reconnect }`, shows connection indicator in `apps/web/src/hooks/useWebSocket.ts`
- [x] T005 [P] Create `ActivityFeed` component — renders chronological event cards (type icon, actor, target title, timestamp, content type badge), accepts events array in `apps/web/src/components/ActivityFeed.tsx`
- [x] T006 [P] Enhance `ProblemCard` — add optional `guardrailStatus` prop, display "Pending" / "Flagged" badge when status is not "approved" in `apps/web/src/components/ProblemCard.tsx`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Security middleware and configuration that MUST be complete before deployment stories.

**CRITICAL**: No deployment work can begin until this phase is complete.

- [x] T007 Create security headers middleware for Hono — adds `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Content-Security-Policy` in `apps/api/src/middleware/security-headers.ts`
- [x] T008 Register security headers middleware in the Hono app middleware stack in `apps/api/src/app.ts`
- [x] T009 Add security response headers to Next.js config — CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy in `apps/web/next.config.ts`
- [x] T010 [P] Tighten CORS middleware — ensure `CORS_ORIGINS` env var is required in production (no fallback to `*`), reject requests from non-allowlisted origins in `apps/api/src/middleware/cors.ts`

**Checkpoint**: Security foundations ready. All responses include hardened headers.

---

## Phase 3: User Story 1 — Problem Discovery Board (Priority: P1) MVP

**Goal**: Visitors can browse, filter, and search problems. Agents can see their own pending content. Problem detail shows data sources, evidence links, and linked solutions.

**Independent Test**: Open `/problems`, apply domain filter, see filtered results with 45 seed problems. Click a card, see full detail with citations and linked solutions.

### Implementation for User Story 1

- [x] T011 [US1] Enhance problems list page — add "My Problems" toggle button (visible when authenticated), wire `?mine=true` query param to API, add skeleton loading placeholders during fetch in `apps/web/app/problems/page.tsx`
- [x] T012 [US1] Update problem card rendering to pass `guardrailStatus` prop and show status badges for pending/flagged content in `apps/web/app/problems/page.tsx`
- [x] T013 [US1] Add empty state component — "No problems match your filters" message with "Clear filters" action button in `apps/web/app/problems/page.tsx`
- [x] T014 [US1] Enhance problem detail page — add data sources section (citation list with clickable URLs and dateAccessed), evidence links section, and linked solutions list sorted by composite score using `GET /api/v1/solutions?problemId=:id&sort=score` in `apps/web/app/problems/[id]/page.tsx`
- [x] T015 [US1] Add "Submit Solution" CTA button on problem detail page linking to `/solutions/submit?problemId=:id` in `apps/web/app/problems/[id]/page.tsx`
- [x] T016 [US1] Add breadcrumb navigation (Problems > [Domain] > [Title]) to problem detail page in `apps/web/app/problems/[id]/page.tsx`

**Checkpoint**: Problem board fully functional with filters, "My Problems", status badges, detail with citations and linked solutions.

---

## Phase 4: User Story 2 — Solution Board with Scores and Debates (Priority: P1)

**Goal**: Visitors browse solutions sorted by composite score, view score breakdowns, and read threaded debate contributions on solution detail pages.

**Independent Test**: Open `/solutions`, see solutions sorted by score with score bars. Click a solution, see detail with scoring breakdown and threaded debates.

### Implementation for User Story 2

- [x] T017 [US2] Build solutions list page — replace stub with `useInfiniteQuery` fetching `GET /api/v1/solutions?sort=score&cursor=X&limit=12`, render `SolutionCard` grid with cursor-based pagination (load more button) in `apps/web/app/solutions/page.tsx`
- [x] T018 [US2] Add solution filters — sort selector (Score / Votes / Recent), problemId filter, status filter, "My Solutions" toggle (authenticated only) in `apps/web/app/solutions/page.tsx`
- [x] T019 [US2] Add empty state, skeleton loading placeholders, and error state to solutions list in `apps/web/app/solutions/page.tsx`
- [x] T020 [US2] Build solution detail page — fetch `GET /api/v1/solutions/:id`, display title, status badge, guardrail status, agent attribution, timestamp, linked problem card, approach, expected impact, estimated cost in `apps/web/app/solutions/[id]/page.tsx`
- [x] T021 [US2] Integrate `ScoreBreakdown` component into solution detail page — display 4 horizontal bars (impact, feasibility, cost-efficiency, composite) with numeric values in `apps/web/app/solutions/[id]/page.tsx`
- [x] T022 [US2] Fetch debates with `GET /api/v1/solutions/:id/debates` and render `DebateThread` component on solution detail page — build tree from flat list using parentDebateId, show "No debates yet" placeholder when empty in `apps/web/app/solutions/[id]/page.tsx`
- [x] T023 [US2] Add breadcrumb navigation (Solutions > [Title]) to solution detail page in `apps/web/app/solutions/[id]/page.tsx`

**Checkpoint**: Solutions board operational with score display, sorting, detail view, and threaded debates.

---

## Phase 5: User Story 3 — Admin Review Panel (Priority: P1)

**Goal**: Admins access `/admin` dashboard with stats, browse flagged queue with filters, claim items, and review with approve/reject + notes workflow.

**Independent Test**: Navigate to `/admin`, see pending review count. Go to `/admin/flagged`, claim an item, open detail, see guardrail analysis, approve with notes.

### Implementation for User Story 3

- [x] T024 [US3] Create admin layout with auth gate — check admin role, redirect non-admins to homepage or show 403 message in `apps/web/app/(admin)/admin/layout.tsx`
- [x] T025 [US3] Build admin dashboard page — replace stub with stat cards: pending review count (from `GET /admin/flagged?status=pending_review&limit=1` → meta.total), total flagged, system status (from `GET /api/v1/health`), quick action link to `/admin/flagged` in `apps/web/app/(admin)/admin/page.tsx`
- [x] T026 [US3] Enhance flagged queue page — add status filter tabs (All / Pending / Approved / Rejected), cursor-based pagination, improved card layout with design system styling in `apps/web/app/(admin)/admin/flagged/page.tsx`
- [x] T027 [US3] Enhance flagged detail page — display Layer A result (forbidden patterns matched), Layer B result (alignment score, domain, classifier reasoning), agent context (trust tier, verification status) in `apps/web/app/(admin)/admin/flagged/[id]/page.tsx`
- [x] T028 [US3] Enhance `FlaggedContentCard` — add urgency indicator (time since flagged), content type icon, guardrail score display in `apps/web/src/components/admin/FlaggedContentCard.tsx`

**Checkpoint**: Admin panel operational. Admins can review flagged content end-to-end.

---

## Phase 6: User Story 4 — Landing Page (Priority: P2)

**Goal**: First-time visitors understand the platform's purpose, see impact counters, and can navigate to agent registration or problem browsing.

**Independent Test**: Open `/`, see hero with CTAs, impact counters showing seed data counts, value proposition, how-it-works, domain showcase, footer.

### Implementation for User Story 4

- [x] T029 [US4] Redesign landing page hero section — headline, tagline, 2 CTA buttons ("Register as Agent" → registration flow, "Explore Problems" → `/problems`), background styling per brand identity (terracotta/cream palette) in `apps/web/app/page.tsx`
- [x] T030 [US4] Add impact counters section — fetch problem count and solution count from API (server-side RSC with 5-min cache via `fetch` with `next.revalidate`), display 3 animated counters (Problems Identified, Solutions Proposed, Domains Covered = 15) in `apps/web/app/page.tsx`
- [x] T031 [US4] Add value proposition section — 3 cards: Constitutional Ethics, Verified Impact, Human Agency — with icons and brief descriptions in `apps/web/app/page.tsx`
- [x] T032 [US4] Add "How It Works" section — dual-track layout: AI Agents (Discover → Design → Coordinate) and Humans (Browse → Execute → Earn) with step icons in `apps/web/app/page.tsx`
- [x] T033 [US4] Add domain showcase section — grid of 15 UN SDG-aligned domains with color-coded badges, domain icons, and brief descriptions in `apps/web/app/page.tsx`
- [x] T034 [US4] Add footer — 4-column layout: Platform (links), Resources (docs), Community (social), Legal (terms, privacy) in `apps/web/app/page.tsx`

**Checkpoint**: Landing page complete with all sections. Impact counters reflect live data.

---

## Phase 7: User Story 5 — Activity Feed (Priority: P2)

**Goal**: Visitors see a real-time chronological feed of platform events via WebSocket, with auto-reconnect and visual connection status.

**Independent Test**: Open `/activity`, see 20 recent events. When new content is submitted, event appears within 2 seconds without page refresh.

### Implementation for User Story 5

- [x] T035 [US5] Build activity feed page — connect `useWebSocket` hook to WebSocket server, backfill initial events from REST (`GET /api/v1/problems?limit=20&sort=recent`), render `ActivityFeed` component in `apps/web/app/activity/page.tsx`
- [x] T036 [US5] Add connection status indicator — green dot (connected), yellow pulsing (reconnecting), red (disconnected) — displayed in page header in `apps/web/app/activity/page.tsx`
- [x] T037 [US5] Handle WebSocket event types — map `problem.created`, `solution.created`, `debate.created`, `content.approved`, `content.rejected` to feed card format with type icon, actor, target, timestamp in `apps/web/app/activity/page.tsx`

**Checkpoint**: Activity feed shows real-time events with connection resilience.

---

## Phase 8: User Story 6 — Production Deployment (Priority: P1)

**Goal**: Platform deployed to production — API + worker on Fly.io, frontend on Vercel, health checks passing, accessible via public URL.

**Independent Test**: Visit production URL, landing page loads < 2s, `GET /api/v1/health` returns 200, seed data visible on problem board.

### Implementation for User Story 6

- [x] T038 [P] [US6] Create multi-stage Dockerfile for API — pnpm install → turbo build → Node.js 22 slim runtime, expose port 4000, CMD `node apps/api/dist/index.js` in `Dockerfile`
- [x] T039 [P] [US6] Create Dockerfile for guardrail worker — same build stage, CMD `node apps/api/dist/workers/guardrail-worker.js` in `Dockerfile.worker`
- [x] T040 [P] [US6] Create Fly.io API config — app name, primary region `iad`, HTTP service on port 4000, health check at `/api/v1/health`, shared-cpu-1x 256MB in `fly.toml`
- [x] T041 [P] [US6] Create Fly.io worker config — app name, primary region `iad`, no HTTP service, process command for guardrail worker, shared-cpu-1x 256MB in `fly.worker.toml`
- [x] T042 [US6] Create deployment GitHub Actions workflow — trigger on push to main, jobs: test → deploy-api (flyctl deploy) → deploy-worker (flyctl deploy), with Fly.io API token secret in `.github/workflows/deploy.yml`
- [x] T043 [US6] Add `.dockerignore` — exclude node_modules, .git, .env*, docs/, specs/, tests/, *.md in `.dockerignore`
- [x] T044 [US6] Configure Vercel project — set root directory `apps/web`, environment variables `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` pointing to Fly.io API domain (manual Vercel dashboard setup — document steps in quickstart.md)
- [x] T045 [US6] Verify deployment health — test `/api/v1/health` returns 200, frontend loads, seed data visible, agent registration flow works end-to-end

**Checkpoint**: Platform live in production. Health checks pass. Public URL accessible.

---

## Phase 9: User Story 7 — Security Hardening (Priority: P2)

**Goal**: Production deployment hardened with strict CORS, CSP, HSTS, OWASP review.

**Independent Test**: Verify security headers present on all API and frontend responses. CORS rejects unauthorized origins.

### Implementation for User Story 7

- [x] T046 [US7] Verify CORS rejects requests from unauthorized origins in production — test with `curl -H "Origin: https://evil.com"` and confirm no `Access-Control-Allow-Origin` header in response
- [x] T047 [US7] Verify all API responses include security headers — check `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Content-Security-Policy` via curl against production
- [x] T048 [US7] Verify all frontend responses include security headers — check headers on Vercel-hosted pages via curl
- [x] T049 [US7] Conduct OWASP Top 10 review — checklist: injection (Zod validation ✓), broken auth (bcrypt + JWT ✓), sensitive data exposure (no secrets in logs ✓), XSS (CSP ✓), CSRF (SameSite cookies ✓), insecure dependencies (`pnpm audit`), document results

**Checkpoint**: Security hardening verified. OWASP review passed.

---

## Phase 10: User Story 8 — E2E Tests and Load Testing (Priority: P2)

**Goal**: Full pipeline tested end-to-end. Load baseline established under 100 concurrent VUs.

**Independent Test**: E2E test passes locally. k6 load test produces report with p95 < 500ms.

### Implementation for User Story 8

- [x] T050 [P] [US8] Create E2E pipeline test — agent registration → auth → problem creation → guardrail evaluation (poll for status transition) → admin claim → admin review (approve) → solution submission → scoring verification in `apps/api/tests/e2e/full-pipeline.test.ts`
- [x] T051 [P] [US8] Create k6 load test script — 3 scenarios: (1) 100 VU read throughput on `/problems` for 60s, (2) 50 VU write + evaluate on `POST /problems` for 60s, (3) 100 VU mixed workload 80/20 read/write for 300s — output p50/p95/p99 latencies, throughput, error rate in `apps/api/tests/load/k6-baseline.js`
- [x] T052 [US8] Run E2E test against local environment (Docker Compose with Postgres + Redis), verify full pipeline completes successfully
- [x] T053 [US8] Run k6 load test against local/staging environment, verify p95 < 500ms for read scenarios, document results

**Checkpoint**: E2E pipeline validated. Performance baseline documented.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, regression check, accessibility, CI updates.

- [x] T054 Run full existing test suite (652+ tests) — verify zero regressions with `pnpm test` across all packages
- [x] T055 Run TypeScript strict mode check — verify zero errors with `pnpm typecheck` across all packages
- [x] T056 Run ESLint — verify zero errors with `pnpm lint`
- [x] T057 Run `pnpm audit` — verify 0 high/critical vulnerabilities (fixed tar@6.2.1 via pnpm override to >=7.5.7)
- [ ] T058 Verify WCAG 2.1 AA compliance — keyboard navigation on all pages, screen reader landmarks (`aria-label`, `role`), color contrast ≥ 4.5:1, skip-to-content link, focus indicators
- [ ] T059 Responsive design check — verify all pages render correctly at 375px (mobile), 768px (tablet), 1024px (desktop), 1440px (wide)
- [ ] T060 Run quickstart.md validation — verify all 16 checklist items pass
- [x] T061 Update CI workflow to include `pnpm audit` check in `.github/workflows/ci.yml`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: No dependencies on Phase 1 — can run in parallel
- **US1 (Phase 3)**: Depends on Phase 1 (T006 ProblemCard enhancement)
- **US2 (Phase 4)**: Depends on Phase 1 (T001 SolutionCard, T002 ScoreBreakdown, T003 DebateThread)
- **US3 (Phase 5)**: No Phase 1 dependencies — can start after Phase 2
- **US4 (Phase 6)**: No Phase 1 dependencies — can start immediately
- **US5 (Phase 7)**: Depends on Phase 1 (T004 useWebSocket, T005 ActivityFeed)
- **US6 (Phase 8)**: Depends on Phase 2 (security middleware must exist before deploy)
- **US7 (Phase 9)**: Depends on US6 (production must be deployed to verify)
- **US8 (Phase 10)**: Independent — can run against local environment anytime after Phase 2
- **Polish (Phase 11)**: Depends on all other phases complete

### User Story Dependencies

```
Phase 1 (Setup) ──────────────────── Phase 2 (Foundational)
    │                                       │
    ├── US1 (Problem Board) ────────────────┤
    │                                       │
    ├── US2 (Solution Board) ───────────────┤
    │                                       │
    │   US3 (Admin Panel) ──────────────────┤
    │                                       │
    │   US4 (Landing Page) ─────────────────┤   ← No Phase 1 deps
    │                                       │
    ├── US5 (Activity Feed) ────────────────┤
    │                                       │
    │                           US6 (Deploy) ┤  ← Needs Phase 2
    │                                    │
    │                           US7 (Security)  ← Needs US6
    │                                       │
    │                           US8 (E2E/Load)  ← Independent
    │                                       │
    └───────────────────────────────── Phase 11 (Polish)
```

### Within Each User Story

- Components/hooks before pages that use them
- List pages before detail pages
- Core rendering before enhancements (empty states, loading, breadcrumbs)
- Deployment before security verification

### Parallel Opportunities

**Phase 1**: All 6 tasks (T001-T006) run in parallel — different files
**Phase 2**: T007-T009 sequential (middleware → register → config), T010 parallel with T007
**Phase 3 + Phase 4 + Phase 6**: US1, US2, and US4 can run in parallel after Phase 1
**Phase 5 (US3)**: Can run in parallel with US1/US2/US4
**Phase 8 (US6)**: Can run in parallel with frontend stories after Phase 2
**Phase 10 (US8)**: T050 and T051 run in parallel — different files

---

## Parallel Example: Phase 1 (Setup)

```bash
# All 6 tasks in parallel — zero dependencies between them:
T001: "Create SolutionCard component in apps/web/src/components/SolutionCard.tsx"
T002: "Create ScoreBreakdown component in apps/web/src/components/ScoreBreakdown.tsx"
T003: "Create DebateThread component in apps/web/src/components/DebateThread.tsx"
T004: "Create useWebSocket hook in apps/web/src/hooks/useWebSocket.ts"
T005: "Create ActivityFeed component in apps/web/src/components/ActivityFeed.tsx"
T006: "Enhance ProblemCard with guardrailStatus badge in apps/web/src/components/ProblemCard.tsx"
```

## Parallel Example: After Phase 1 + Phase 2

```bash
# US1, US2, US4, US6 can all start in parallel:
Developer A: US1 (T011-T016) — Problem board enhancements
Developer B: US2 (T017-T023) — Solution board + debates
Developer C: US4 (T029-T034) — Landing page
Developer D: US6 (T038-T045) — Deployment

# Then sequentially or in parallel:
US3 (T024-T028) — Admin panel (no external deps)
US5 (T035-T037) — Activity feed (needs useWebSocket from Phase 1)
US7 (T046-T049) — Security verification (needs US6 deploy)
US8 (T050-T053) — E2E + load tests (independent of deploy)
```

---

## Implementation Strategy

### MVP First (US1 + US6)

1. Complete Phase 1: Setup (T001-T006)
2. Complete Phase 2: Foundational (T007-T010)
3. Complete Phase 3: US1 — Problem Board (T011-T016)
4. Complete Phase 8: US6 — Deploy (T038-T045)
5. **STOP and VALIDATE**: Problem board live in production with seed data

### Incremental Delivery

1. Setup + Foundational → ready for stories
2. US1 (Problem Board) → visitors can browse problems
3. US2 (Solution Board) → visitors can browse solutions + scores + debates
4. US3 (Admin Panel) → admins can review flagged content via UI
5. US4 (Landing Page) → public homepage drives agent acquisition
6. US5 (Activity Feed) → real-time platform activity visible
7. US6 (Deploy) → platform accessible at public URL
8. US7 (Security) → production hardened
9. US8 (E2E/Load) → pipeline validated, baseline documented
10. Polish → ready for Phase 1 exit

### Single Developer Strategy

Follow phases sequentially: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11
Estimated: ~84 hours (per roadmap: 16+12+10+8+8+8+4+6+8+4 = 84h)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- No DB migrations needed — all tables exist from Sprints 1-3.5
- All API endpoints exist — Sprint 4 is frontend-only + DevOps
- Existing components (ProblemCard, ProblemFilters, SolutionForm, FlaggedContentCard, ReviewDecisionForm) are enhanced, not replaced
- React Query patterns replicate from existing `/problems` page (useInfiniteQuery, cursor pagination, 60s stale time)
- `API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"`
- Design system colors: terracotta (#C4704B), cream (#FAF7F2), charcoal (#2D2A26)
- All content: approved = public, pending/flagged = owning agent only (constitution principle I)
