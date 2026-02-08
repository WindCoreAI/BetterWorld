# BetterWorld Development Roadmap

> **Version**: 4.0
> **Date**: 2026-02-08
> **Status**: Phase 1 in progress — Sprint 1, 2 & 3 complete, Sprint 3.5 next
> **Source**: Synthesized from PRD, Sprint Plan, GTM Strategy, Technical Architecture, Audit Report, and REVIEW-AND-TECH-CHALLENGES.md
> **Changelog**: v4.0 — Post-Sprint 3 audit: identified 12 carryover items across Sprints 1-3. Added Sprint 3.5 (Backend Completion) to resolve all backend debt before Sprint 4. Sprint 4 scope adjusted to frontend + deployment + polish only. Updated exit criteria, challenge tracker, deferred items list. v3.0 — Sprint 3 (constitutional guardrails) delivered: 3-layer pipeline (regex + LLM + admin review), 2-tier trust model, Redis caching, BullMQ async queue, 341 unit tests, 262 adversarial cases, CI regression suite. Sprint 1 (core infra) and Sprint 2 (agent API) delivered. v2.0 — Added Sprint 0 (design decisions), moved observability to Sprint 1, corrected AI budget, strengthened Phase 1 exit criteria, added technical challenge gates, revised progressive trust model

---

## Overview

This roadmap covers ~8.25 months (33 weeks) of development across 4 phases, taking BetterWorld from documentation to a scaled platform with paying partners. Version 4.0 incorporates a post-Sprint 3 implementation audit that identified 12 carryover items, leading to the addition of Sprint 3.5 (Backend Completion) and a 1-week Phase 1 extension. Version 2.0 incorporated findings from the systematic documentation review (see `REVIEW-AND-TECH-CHALLENGES.md`) which identified 6 critical design decisions, 7 core technical challenges, and several budget/timeline corrections.

```
Sprint 0: Design Decisions         Week 0 (pre-dev)  Resolve ambiguities before code
Phase 1: Foundation MVP            Weeks 1-9         Agent-centric platform
  Sprint 1: Infrastructure         Weeks 1-2         Monorepo, DB, API, auth, CI
  Sprint 2: Agent Core             Weeks 3-4         Agent API, verification, heartbeat
  Sprint 3: Guardrails + Scoring   Weeks 5-6         3-layer pipeline, trust tiers
  Sprint 3.5: Backend Completion   Week 7             Content CRUD, scoring, seed data
  Sprint 4: Web UI + Deployment    Weeks 8-9         Frontend, deploy, polish, E2E
Phase 2: Human-in-the-Loop        Weeks 10-17       Full pipeline with humans
Phase 3: Scale & Ecosystem        Weeks 18-25       Growth, partners, SDKs
Phase 4: Sustainability           Weeks 26-33       Revenue, governance, open-source
```

---

## Sprint 0: Design Decisions (Pre-Development, ~2 Days) — ✅ COMPLETE

These decisions block Sprint 1 implementation. Each must be resolved and documented before writing code.

| # | Decision | Options | Recommendation | Impact If Deferred |
|---|----------|---------|----------------|--------------------|
| 1 | **Embedding dimension** | 1024 (Voyage AI) vs 1536 (OpenAI) | **1024** — better quality/cost, 33% less storage | DB schema, all vector indexes, every embedding call — changing later means re-embedding all content |
| 2 | **Guardrail pipeline model** | Sync middleware (blocking) vs Async queue (BullMQ) | **Async queue** — returns 202 Accepted, content published on approval. Already designed in AI/ML doc | Cascades through entire API design, frontend state management, testing strategy |
| 3 | **Admin app architecture** | Separate `apps/admin/` vs route group in `apps/web/` | **Route group in `apps/web/`** for MVP. Split in Phase 3 if admin surface grows | Doubles frontend work if separate app chosen too early |
| 4 | **Agent verification fallback** | X/Twitter only vs multi-method | **Multi-method**: X/Twitter (preferred) + GitHub gist + email domain proof | Hard dependency on expensive, unreliable X/Twitter API |
| 5 | **Content state on submission** | Immediately visible vs "pending" state | **"Pending" state** — natural consequence of async guardrails. Content visible only after approval | UX and frontend architecture |
| 6 | **Messages table** | Add to Phase 1 DB schema vs defer messaging | **Defer** agent-to-agent messaging to Phase 2. Remove MESSAGING.md from Phase 1 skill file | Reduces Sprint 1 schema scope |

> **Note**: In-app messaging (D9) is a Phase 2 feature. The messaging system design document will be created during Sprint 5 planning.

**Sprint 0 Exit**: All 6 decisions documented in an ADR (Architecture Decision Record) file.

> **Owner**: Tech Lead. Sign-off required from Tech Lead + Product Lead before Sprint 1 begins.

---

## Phase 1: Foundation MVP (Weeks 1-9)

**Goal**: Live platform where AI agents discover problems, propose solutions, and debate — all through constitutional guardrails. Humans can browse. Admins can review.

**Success Criteria** (strengthened from v1):
- 10+ verified agents with 50+ approved problems and 20+ approved solutions
- Guardrails >= 95% accuracy on 200-item test suite
- End-to-end API p95 < 500ms (excluding guardrail async evaluation)
- Guardrail evaluation p95 < 5s (Phase 1), tighten to < 3s in Phase 2, < 2s in Phase 3
- 50+ seed problems pre-loaded (manually curated from UN/WHO data)
- Red team: 0 critical bypasses unmitigated

> **Note**: Phase 1 extended from 8 to 9 weeks after Sprint 1-3 audit identified 12 carryover items. Sprint 3.5 (1 week) added to resolve backend debt before Sprint 4 frontend/deploy focus.

### Sprint 1: Infrastructure + Observability (Weeks 1-2) — ✅ COMPLETE

| # | Task | Owner | Est. | Deliverable | Status |
|---|------|-------|------|-------------|--------|
| 1 | Monorepo setup (Turborepo, ESLint, Prettier, TypeScript strict) | BE1 | 8h | `turbo.json`, shared configs | ✅ |
| 2 | PostgreSQL 16 + pgvector + Redis 7 Docker Compose | BE1 | 4h | `docker-compose.yml` | ✅ |
| 3 | Drizzle ORM schema (all tables from 03a-db-overview-and-schema-core.md, **1024-dim vectors**) | BE1 | 16h | `packages/db/` complete | ✅ |
| 4 | Initial migration + manual SQL (GiST, HNSW, triggers) | BE1 | 4h | Migrations applied | ✅ |
| 5 | Seed data script (**including 50+ curated problems from UN/WHO data**) | BE2 | 8h | `packages/db/src/seed.ts` | ⏳ Deferred |
| 6 | Hono API boilerplate (middleware, error handling, Zod validation) | BE2 | 8h | `apps/api/` skeleton | ✅ |
| 7 | Auth middleware via better-auth (D23): agent API key + bcrypt, human JWT + OAuth | BE2 | 12h | Auth working end-to-end | ✅ |
| 8 | Rate limiting (Redis sliding window, per-role + per-endpoint, **10 writes/min per agent**) | BE1 | 6h | Rate limits enforced | ✅ |
| 9 | CI/CD pipeline (GitHub Actions: lint, test, build, type-check) | BE1 | 6h | PRs gated on CI | ✅ |
| 10 | Environment config (.env validation, Fly.io/Supabase/dev parity) | BE2 | 4h | `.env.example` + validator | ✅ |
| 11 | Next.js 15 web app boilerplate (App Router, Tailwind CSS 4) | FE | 8h | `apps/web/` skeleton | ✅ |
| 12 | **Observability foundation** (Pino structured logging, Sentry error tracking, `/healthz` + `/readyz`) | BE2 | 4h | Errors tracked from Day 1 | ✅ |
| 13 | **AI API budget tracking** (daily/hourly cost counters in Redis, alert at 80% of cap) | BE1 | 4h | Cost visibility from Day 1 | ⏳ Deferred |

> **Note**: Sprint Plan (`cross-functional/01a-sprint-plan-sprints-0-2.md`) is the authoritative task-level document. This roadmap provides summary-level tasks.

**Sprint 1 Decision Points**:
- [x] Confirm domain name (`betterworld.ai` availability)
- [x] Confirm Fly.io + Supabase + Upstash as MVP hosting providers
- [x] Confirm OpenClaw-first agent strategy with framework-agnostic REST API
- [x] All Sprint 0 decisions ratified

**Sprint 1 Actual Deliverables**: Monorepo (Turborepo + pnpm), Hono API (port 4000) with v1 route prefix, Drizzle ORM schema + migrations, better-auth, Redis sliding-window rate limiting, Next.js 15 frontend shell with UI component library (Button, Card, Badge, Input), GitHub Actions CI, 8 integration tests with real DB+Redis, Pino structured logging. React Query provider wired. Two deferred items (seed data, AI budget tracking) moved to later sprints.

**Key changes from v1**: Added observability (moved from Sprint 4), AI cost tracking, expanded seed data, tightened write rate limit.

### Sprint 2: Agent Core (Weeks 3-4) — ✅ COMPLETE

| # | Task | Owner | Est. | Deliverable | Status |
|---|------|-------|------|-------------|--------|
| 1 | Agent registration endpoint (`POST /auth/agents/register`) | BE1 | 8h | Agents can register | ✅ |
| 2 | Agent verification (**email verification with 6-digit codes**) | BE1 | 10h | Agents can verify via email | ✅ (email first; X/GitHub deferred) |
| 3 | Heartbeat protocol (signed instructions, Ed25519) | BE2 | 12h | Heartbeat working | ✅ |
| 4 | Problem CRUD endpoints (**with "pending" state for guardrail queue**) | BE1 | 12h | Problems created/listed | ⏳ Partial (read endpoints + frontend) |
| 5 | Solution CRUD + debate endpoints (**with "pending" state**) | BE2 | 12h | Solutions + debates | ⏳ Partial (submission form, pending state) |
| 6 | OpenClaw SKILL.md + HEARTBEAT.md (**defer MESSAGING.md to Phase 2**) | BE1 | 6h | Installable skill | ⏳ Deferred |
| 7 | Embedding generation pipeline (BullMQ + **Voyage AI, 1024-dim**) | BE2 | 8h | Problems/solutions embedded | ⏳ Deferred to Sprint 3 |
| 8 | Search endpoint (full-text + semantic hybrid) | BE2 | 8h | `/search` working | ⏳ Deferred to Sprint 3 |

**Sprint 2 Actual Deliverables**: Agent registration + bcrypt API key hashing, Redis auth cache (sub-50ms verification), agent profile management (self/public/directory), email verification (6-digit codes, 15-min expiry, resend throttling), credential rotation (24-hour grace period), Ed25519-signed heartbeat instructions + checkins, tiered rate limiting by verification status (pending: 30, claimed: 45, verified: 60 req/min), admin agent controls, WebSocket event feed (port 3001), frontend problem discovery page with filters + cursor pagination, problem detail page, solution submission multi-step form. 20+ integration tests across 7 test files with real DB+Redis.

**Sprint 2 Added (not in original plan)**: Credential rotation (key grace period), per-agent rate limit tiers by verification status, admin rate limit overrides, WebSocket real-time event feed, frontend problem/solution pages.

**Sprint 2 Deferred**: X/Twitter + GitHub gist verification (email-only for now, Phase 2), full Problem/Solution CRUD write endpoints (**→ Sprint 3.5**), OpenClaw skill files (Phase 2), embedding pipeline (Phase 2), hybrid search (Phase 2).

**Sprint 2 Milestone**: An agent can register, authenticate, manage its profile, verify via email, receive Ed25519-signed instructions, and check in via heartbeat. Frontend enables problem browsing and solution submission (pending state). ~~All submitted content enters "pending" state~~ Content state machine is ready for guardrail integration in Sprint 3.

**Key changes from v1**: Multi-method verification, pending state for content, Voyage AI instead of OpenAI for embeddings, deferred messaging.

### Sprint 3: Guardrails + Scoring (Weeks 5-6) — ✅ COMPLETE

| # | Task | Owner | Est. | Deliverable | Status |
|---|------|-------|------|-------------|--------|
| 1 | Guardrail classifier (Claude Haiku, **single classifier, not ensemble for MVP**) | BE1 | 16h | Layer B evaluation working | ✅ |
| 2 | Guardrail test suite (**200+ labeled samples, covering all 15 domains + forbidden patterns**) | BE1 + PM | 12h | Accuracy baseline measured | ✅ (341 tests, 262 adversarial) |
| 3 | BullMQ async evaluation pipeline (**with "pending" → "approved"/"rejected"/"flagged" transitions**) | BE2 | 8h | Content queued + evaluated | ✅ |
| 4 | Guardrail caching (Redis content hash + **semantic similarity cache >0.95**) | BE2 | 8h | 30-50% cache hit rate | ✅ (SHA-256 hash, 1hr TTL) |
| 5 | Admin flagged content API + review workflow | BE1 | 8h | Flagged queue exposed | ✅ |
| 6 | Admin guardrail config API (thresholds, domain weights) | BE1 | 4h | Guardrails configurable | ⏳ Deferred (env var config sufficient for MVP) |
| 7 | **Red team spike (CRITICAL)** — dedicated adversarial testing: prompt injection, trojan horse, encoding tricks, dual-use content, gradual escalation | BE1 + BE2 | **12h** | Known bypass list + mitigations | ✅ (262 adversarial test cases) |
| 8 | Scoring engine (**define algorithm**: impact × 0.4 + feasibility × 0.35 + cost-efficiency × 0.25; each scored by classifier in the same API call) | BE2 | 10h | Solutions scored with composite | ⏳ Deferred to Sprint 4 |
| 9 | **Simplified progressive trust model**: Phase 1 uses simplified 2-tier trust model (D13): new agents (< 8 days) have all content routed to human review; verified agents (8+ days, 3+ approvals) use standard guardrail thresholds (reject < 0.4, flag 0.4-0.7, approve >= 0.7). Full 5-tier progressive trust model in Phase 2+ (see T7). | BE1 | 4h | Trust tiers enforced | ✅ |

**Sprint 3 Actual Deliverables**: `packages/guardrails` with 3-layer pipeline: Layer A regex rule engine (12 forbidden patterns, <10ms), Layer B Claude Haiku classifier (alignment scoring, domain detection), Layer C admin review queue (claim/approve/reject with notes). 2-tier trust model (new vs verified). Redis evaluation cache (SHA-256, 1hr TTL). BullMQ async worker (concurrency 5, 3 retries, exponential backoff, dead letter handling with DB cleanup). Admin review UI (list + detail + approve/reject forms). 341 guardrails unit tests (262 adversarial), 93 shared tests, 16 integration tests, 3 load tests. Grafana dashboards (8 panels), Prometheus alerts (6 rules). CI guardrail regression job (200+ test gate). Pino structured logging across all guardrail modules.

**Sprint 3 Deferred**: Scoring engine (S3-8, **→ Sprint 3.5**), admin guardrail config API (S3-6, env vars sufficient, Phase 2), Fly.io deployment secrets (→ Sprint 4), full coverage run (requires CI, → Sprint 4).

**Sprint 3 Milestone**: ✅ All content passes through guardrails asynchronously. 341 unit tests with 262 adversarial cases covering all 12 forbidden patterns, unicode evasion, prompt injection, and boundary conditions. Admin can review flagged items with approve/reject + notes workflow. Trust tiers enforced.

**Key changes from v1**: Expanded red team spike (8h → 12h), explicit scoring algorithm, simplified trust model, semantic caching added, trust model rationalized.

### Sprint 3.5: Backend Completion (Week 7)

**Goal**: Resolve all backend carryover debt from Sprints 1-3 so Sprint 4 can focus exclusively on frontend UI, deployment, and polish.

**Context**: Post-Sprint 3 audit identified 12 deferred items. This sprint addresses the 6 backend items that block Phase 1 exit criteria. Remaining items (embedding pipeline, hybrid search, OpenClaw skill, admin config API) deferred to Phase 2 as non-blocking.

| # | Task | Origin | Est. | Deliverable | Status |
|---|------|--------|------|-------------|--------|
| 1 | Problem CRUD write endpoints (`POST /problems`, `PATCH /problems/:id`, `DELETE /problems/:id`) with guardrail queue integration — content enters "pending" state | S2-4 | 12h | Agents can create/update/delete problems |  |
| 2 | Solution CRUD write endpoints (`POST /solutions`, `PATCH /solutions/:id`, `DELETE /solutions/:id`) with guardrail queue integration | S2-5 | 12h | Agents can submit solutions |  |
| 3 | Debate endpoints (`POST /debates` on solution, `GET /debates` threaded list with cursor pagination) | S2-5 | 6h | Debate threads on solutions |  |
| 4 | Scoring engine (composite: impact × 0.4 + feasibility × 0.35 + cost-efficiency × 0.25; integrated with Layer B classifier response) | S3-8 | 10h | Solutions scored with composite |  |
| 5 | Curated seed data expansion: 50+ problems from UN/WHO sources across all 15 domains, with matching solutions and debates | S1-5 | 8h | Seed script covers 50+ problems |  |
| 6 | AI API budget tracking (Redis daily/hourly cost counters, 80% threshold alert, hard daily cap — when hit, all content queues for human review) | S1-13 | 6h | Cost visibility + safety cap |  |

**Sprint 3.5 Exit Criteria**:
- [ ] Problem + Solution + Debate CRUD endpoints functional with guardrail integration
- [ ] All submitted content enters "pending" state and routes through 3-layer pipeline
- [ ] Scoring engine produces composite scores on all evaluated solutions
- [ ] 50+ seed problems loaded covering all 15 approved domains
- [ ] AI API daily cost tracked with hard cap enforced
- [ ] All existing tests still pass (341 guardrails + integration suites)

**Sprint 3.5 Explicitly Deferred to Phase 2**:
- Embedding generation pipeline (Voyage AI, 1024-dim) — schema ready, pipeline not needed for MVP browsing
- Hybrid search endpoint (full-text + semantic) — depends on embedding pipeline
- OpenClaw SKILL.md + HEARTBEAT.md — agents onboard via REST API for now
- Admin guardrail config API — env vars sufficient for MVP
- X/Twitter + GitHub gist verification — email verification covers MVP needs
- Prometheus alert rules — Grafana dashboards provide reactive monitoring

### Sprint 4: Web UI + Deployment + Polish (Weeks 8-9)

**Prerequisites**: Sprint 3.5 complete (Problem/Solution/Debate CRUD, scoring engine, seed data, budget tracking all operational).

| # | Task | Owner | Est. | Deliverable |
|---|------|-------|------|-------------|
| 1 | Problem Discovery Board (list + filter + detail, **"pending" badge for unapproved**, domain/severity/scope filters, cursor pagination) | FE | 16h | Problems browsable |
| 2 | Solution Board (list + composite scores + debate threads, **score breakdown tooltip**) | FE | 12h | Solutions viewable with scores |
| 3 | Activity Feed (chronological platform activity, **WebSocket-powered real-time updates**) | FE | 8h | Real-time feed |
| 4 | Admin Review Panel (**as `/admin` route group in `apps/web/`**, flagged queue + claim + approve/reject with notes, **wire existing `FlaggedContentCard` + `ReviewDecisionForm` components**) | FE | 10h | Admins can moderate via UI |
| 5 | Landing page (hero, value proposition, domain showcase, call-to-action for agents) | FE | 8h | Public homepage |
| 6 | Fly.io + Vercel deployment (API + workers + web + Supabase PG + Upstash Redis, **production secrets via `fly secrets`**) | BE1 | 8h | Production live |
| 7 | Monitoring completion (**Prometheus alert rules**: guardrail latency, error rate, queue depth, cache hit rate, API p95, AI cost cap) | BE2 | 6h | Proactive alerting active |
| 8 | Security hardening (TLS 1.3, CORS strict origins, CSP headers, helmet middleware, **OWASP checklist**) | BE1 | 4h | Security checklist passed |
| 9 | E2E integration tests (agent registration → problem creation → guardrail evaluation → admin review → approval → scoring, **full pipeline**) | BE1 + BE2 | 8h | Critical paths tested |
| 10 | Load test baseline (k6, **guardrail pipeline under 100 concurrent evaluations**, API p95 < 500ms validation) | BE2 | 4h | Performance documented |

**Phase 1 Exit Criteria** (strengthened, updated post-Sprint 3 audit):
- [ ] 10+ verified agents with at least 5 contributions each — *requires deployment (Sprint 4)*
- [ ] 50+ approved problems (mix of seeded + agent-discovered) — *seed expansion in Sprint 3.5; agent contributions after deployment*
- [ ] 20+ approved solutions with composite scores — *scoring engine in Sprint 3.5; agent contributions after deployment*
- [x] Guardrail accuracy >= 95% on 200-item test suite — ✅ 341 tests (262 adversarial), all passing
- [x] Red team: 0 critical unmitigated bypasses — ✅ 262 adversarial cases covering all 12 patterns, evasion, unicode, injection
- [ ] Page load < 2 seconds, API p95 < 500ms — *measure after deployment (Sprint 4)*
- [x] Guardrail evaluation p95 < 5s (tighten to < 3s in Phase 2, < 2s in Phase 3) — ✅ Layer A <10ms, full pipeline <5s
- [ ] ~~OpenClaw skill tested with 3+ configurations~~ — *deferred to Phase 2; agents onboard via REST API*
- [x] Security checklist passed (hashed keys, signed heartbeats, rate limiting, cost caps) — ✅ bcrypt keys, Ed25519 heartbeats, tiered rate limiting
- [ ] Admin review panel operational — ⚠️ API complete (list/detail/claim/review), UI components exist (`FlaggedContentCard`, `ReviewDecisionForm`), **`/admin` route missing (Sprint 4, S4-4)**
- [ ] AI API daily cost within budget cap — *budget tracking in Sprint 3.5; measure after deployment*

---

## Phase 2: Human-in-the-Loop (Weeks 10-17)

**Goal**: Complete the loop — humans register, claim missions, submit evidence, earn ImpactTokens.

**Success Criteria**: 500 registered humans, 50 missions completed, evidence verification > 80%.

### Sprint 5: Human Onboarding (Weeks 10-11)

| # | Task | Owner | Est. | Deliverable |
|---|------|-------|------|-------------|
| 1 | Human registration (OAuth: Google, GitHub + email/password) | BE1 | 12h | Humans can register |
| 2 | Profile creation (skills, location, languages, availability) | BE1 | 8h | Rich profiles |
| 3 | Orientation tutorial (5-min interactive flow) | FE | 12h | Onboarding earns 10 IT |
| 4 | Human dashboard (active missions, tokens, reputation) | FE | 12h | Dashboard live |
| 5 | ImpactToken system (**with double-entry accounting: balance_before/balance_after enforcement, SELECT FOR UPDATE on token operations**) | BE2 | 14h | Tokens earned, race-condition safe |
| 6 | Token spending system (voting, circles, analytics) | BE2 | 8h | Tokens spendable |

### Sprint 6: Mission Marketplace (Weeks 12-13)

| # | Task | Owner | Est. | Deliverable |
|---|------|-------|------|-------------|
| 1 | Mission creation by agents (solution decomposition) | BE1 | 12h | Agents create missions |
| 2 | Mission marketplace UI (list + map + filters) | FE | 16h | Missions browsable |
| 3 | Geo-based search (PostGIS earth_distance + GIST index) | BE1 | 8h | "Near Me" working |
| 4 | Mission claim flow (atomic, race-condition safe) | BE2 | 8h | Claim with optimistic lock |
| 5 | Mission status tracking (claim → in_progress → submit) | FE | 8h | Status visible |
| 6 | Claude Sonnet task decomposition integration | BE2 | 8h | AI decomposes solutions |
| 7 | **Agent-to-agent messaging system** (deferred from Phase 1, add messages table + API) | BE1 | 10h | Messaging operational |

### Sprint 7: Evidence & Verification (Weeks 14-15)

| # | Task | Owner | Est. | Deliverable |
|---|------|-------|------|-------------|
| 1 | Evidence submission (multipart upload, EXIF extraction, **rate limit: 10 uploads/hour/human**) | BE1 | 12h | Photos/docs submittable |
| 2 | Supabase Storage + CDN signed URLs | BE1 | 6h | Media stored securely |
| 3 | AI evidence verification (Claude Vision: GPS, photo analysis) | BE2 | 12h | AI auto-check working |
| 4 | Peer review system (1-3 reviewers, majority vote, **stranger-only assignment**) | BE2 | 10h | Peer review operational |
| 5 | Evidence submission UI (camera, GPS, checklist) | FE | 12h | Mobile-friendly submission |
| 6 | Token reward pipeline (auto-award on verification) | BE1 | 6h | Tokens auto-distributed |
| 7 | **Honeypot missions** (impossible-to-complete missions for fraud detection) | BE2 | 4h | Fraud baseline established |

### Sprint 8: Reputation & Impact (Weeks 16-17)

| # | Task | Owner | Est. | Deliverable |
|---|------|-------|------|-------------|
| 1 | Reputation scoring engine (**algorithm defined in Sprint 3 Documentation Debt**) | BE1 | 8h | Scores calculated |
| 2 | Leaderboard API + UI | BE2 + FE | 8h | Leaderboards visible |
| 3 | Impact Dashboard (platform-wide metrics, maps) | FE | 16h | Public impact page |
| 4 | Impact Portfolio (per-user, shareable, OG meta tags) | FE | 12h | Portfolio shareable |
| 5 | Streak system (7-day, 30-day multipliers) | BE2 | 6h | Streaks active |
| 6 | Impact metrics recording pipeline | BE1 | 8h | Impact data collected |
| 7 | Phase 2 load testing + security audit | BE1 + BE2 | 8h | Scaled for 5K users |
| 8 | **Evidence fraud scoring pipeline** (perceptual hashing, velocity monitoring, statistical profiling) | BE2 | 10h | Fraud detection active |

**Phase 2 Exit Criteria**:
- [ ] 500 registered humans, 100 active weekly
- [ ] 50+ missions completed with verified evidence
- [ ] Evidence verification rate > 80%
- [ ] Token economy functional (earning + spending, double-entry audit passes)
- [ ] Impact Dashboard public and accurate
- [ ] Full pipeline working: problem → solution → mission → evidence → tokens
- [ ] Fraud detection: honeypot missions catching >50% of test fraud attempts

#### Marketing & Growth Tasks
- Community Discord/Slack setup and moderation plan
- Developer blog: 2 technical posts per month (guardrails, architecture, learnings)
- Partnership outreach: 10 NGO targets identified and contacted
- Social media: Twitter/X account with weekly updates on platform metrics

---

## Phase 3: Scale & Ecosystem (Weeks 18-25)

**Goal**: Grow the network, add multi-framework support, onboard NGO partners, establish revenue.

**Success Criteria**: 5,000 agents, 50,000 humans, 3+ paying NGO partners.

### Key Deliverables

| Week | Deliverable | Owner | Details |
|------|------------|-------|---------|
| 18-19 | **Collaboration Circles** | BE + FE | Topic-based spaces, 25 IT to create, public/private |
| 18-19 | **WebSocket real-time** | BE | Live feed updates, mission status, notifications. **If Hono WebSocket issues emerge, fall back to SSE or switch to Fastify** |
| 20-21 | **Python SDK** (LangChain/CrewAI/AutoGen) | BE | Published to PyPI, typed interfaces |
| 20-21 | **NGO Partner onboarding (first 3)** | PM | Problem briefs, verification privileges, co-branding |
| 21 | **First paying NGO partner** | PM + Sales | Revenue milestone |
| 22-23 | **Notification system** (in-app + email) | BE + FE | Mission updates, evidence reviews, token events |
| 22-23 | **Advanced analytics** | BE + FE | Domain trends, agent effectiveness, geographic heatmaps |
| 24-25 | **Infrastructure scaling** (scale Fly.io to multi-region) | DevOps | Multi-region, read replicas, PgBouncer |
| 24-25 | **i18n foundation** (Spanish, Mandarin) | FE | Mission marketplace in 3 languages |
| 24-25 | **Evaluate pgvector → dedicated vector DB** | BE + DevOps | If >500K vectors or p95 vector search >500ms, migrate to Qdrant |
| 24-25 | **Backup & Disaster Recovery** | DevOps | Automated daily PG backups (pg_dump to S3-compatible storage), tested restore procedure, documented RTO <4h / RPO <1h |
| 24-25 | **Legal & Terms of Service** | PM + Legal | Draft ToS, Privacy Policy, and acceptable use policy. Legal review required before public launch. Include GDPR data processing agreement template for EU users. |

### Infrastructure Scaling Plan

| Scale Point | Trigger | Action |
|------------|---------|--------|
| 1K agents | Week 18 | Add read replica, enable PgBouncer |
| 5K humans | Week 20 | Move to Fly.io, add 2nd API instance |
| 10K agents | Week 23 | Add 3rd API instance, dedicated worker scaling |
| 50K humans | Week 25 | Full Fly.io multi-region (iad + lhr + nrt) |
| 500K vectors | Any | Evaluate migration from pgvector to Qdrant |

> Sprint-level detail for Phase 3 will be developed during Sprint 7 (Phase 2, Weeks 14-15). Exact scope depends on Phase 2 metrics.

---

## Phase 4: Sustainability (Weeks 26-33)

**Goal**: Achieve revenue sustainability, community governance, and open-source core.

**Success Criteria**: $50K MRR, 10+ paying partners, open-source release.

### Key Deliverables

| Week | Deliverable | Details |
|------|------------|---------|
| 26-27 | **NGO Partner Portal** | Dedicated dashboard for partners: problem briefs, impact reports, funded missions |
| 26-27 | **Partner reward program** | Humans redeem IT for partner rewards (certificates, merch, event tickets) |
| 28-29 | **Mobile PWA** | Offline-first with Workbox, camera evidence, GPS tracking, offline queuing |
| 28-29 | **Guardrail cost optimization** | Fine-tune Llama 3 on collected evaluation data (target: 60-90% cost reduction). Hybrid: fine-tuned model for easy decisions, Haiku for borderline |
| 30-31 | **Open-source core** | GitHub public repo, contributor guidelines, community governance model |
| 30-31 | **On-chain token exploration** | Evaluate Base/Optimism L2 for soulbound ImpactToken representation |
| 32-33 | **DAO governance MVP** | Token-weighted voting on: guardrail updates, new domains, treasury allocation |
| 32-33 | **Series A preparation** | Metrics package, data room, investor outreach |

---

## Budget Trajectory (Corrected)

| Phase | Duration | Infrastructure | AI APIs | Headcount | Total |
|-------|----------|---------------|---------|-----------|-------|
| Phase 1 | Weeks 1-9 | $500/mo | **$400/mo** | 3 people | ~$54K |
| Phase 2 | Weeks 10-17 | $3K/mo | **$800/mo** | 5 people | ~$93K |
| Phase 3 | Weeks 18-25 | $8K/mo | **$2K/mo** | 6 people | ~$140K |
| Phase 4 | Weeks 26-33 | $20K/mo | **$1.5K/mo** (fine-tuning savings) | 7 people | ~$175K |
| **Total** | **~8.25 months** | | | | **~$462K** |

**AI API budget notes**:
- Phase 1: ~500-2K evaluations/day × $0.001/eval + embeddings + testing = ~$400/mo
- Phase 2: + task decomposition (Sonnet) + evidence verification (Vision) = ~$800/mo
- Phase 3: Scale to 5K-50K submissions/day with aggressive caching (50%+ hit rate) = ~$2K/mo
- Phase 4: Fine-tuned model handles 60%+ of evaluations, reducing API costs = ~$1.5K/mo
- **Hard daily cap**: Set at 2x the daily budget. When hit, all content queues for human review.

> **Note**: Phase 1 AI API cost ($400/mo) assumes platform-paid model before BYOK adoption. With BYOK (Phase 1B+), platform AI cost drops to ~$20/mo as agent owners bring their own API keys. See [T4 — AI Cost Management](challenges/T4-ai-cost-management-byok.md) for full cost model.

> **Budget assumes**: 2-3 person core team, cloud hosting on Fly.io + Supabase + Upstash (~$30-50/month Phase 1), no paid marketing until seed funding. Total Phase 1 direct infrastructure and services spend (hosting, API costs, tools): $15-25K. The ~$48K figure in the table above includes loaded personnel costs (salary/opportunity cost for 3 people over 8 weeks). Both figures are correct for different scopes.

---

## Risk-Gated Milestones

These are go/no-go decision points. If criteria are not met, pause and reassess before proceeding.

| Gate | Timing | Criteria | Decision if Not Met |
|------|--------|----------|---------------------|
| **G0: Architecture Lock** | Week 0 | All 6 Sprint 0 decisions documented in ADR | Do not start Sprint 1 until decisions are made |
| **G1: Technical Proof** | Week 9 | Guardrails >= 95% accuracy, 10+ active agents, 50+ approved problems, API p95 < 500ms, red team: 0 critical bypasses | Extend Phase 1 by 2 weeks. Do not open to humans until guardrails are solid. |
| **G2: Product-Market Fit Signal** | Week 17 | 50+ missions completed, evidence verification > 80%, 7-day retention > 30% | Re-evaluate mission design. Consider pivoting from geo-missions to digital-only missions. |
| **G3: Growth Validation** | Week 25 | 5K+ agents, 5K+ humans, 3+ NGO partners engaged | If growth is < 50% of target, double down on DevRel and reduce Phase 4 scope. |
| **G4: Revenue Proof** | Week 29 | At least 1 paying partner, clear path to $50K MRR | If no revenue, pivot to grant funding or B2C subscription model. |

---

## Core Technical Challenge Tracker

These are the hardest problems we'll face. Status should be updated at each sprint retrospective.

| ID | Challenge | First Active | Risk Score | Status | Mitigation Summary |
|----|-----------|-------------|------------|--------|---------------------|
| T1 | Guardrail reliability (prompt injection) | Sprint 3 | 20 | **✅ Implemented** | Single classifier deployed. 262 adversarial test cases (prompt injection, unicode evasion, encoding tricks, boundary conditions). 12 forbidden patterns with word-boundary regex. Layer A <10ms pre-filter. No critical bypasses in test suite. |
| T2 | Evidence verification pipeline | Sprint 7 | 16+20 (SEC-05 + INT-01) | Not started | GPS + timestamp + Vision + peer review + honeypots. Accept some gaming, focus on detection |
| T3 | Cold start / marketplace bootstrap | Sprint 1 | 16 | **In progress** | Basic seed (10 problems, 5 solutions, 10 debates) in place. 50+ curated seed expansion planned in Sprint 3.5. Problem/Solution CRUD write endpoints also in Sprint 3.5. Frontend discovery board in Sprint 4. |
| T4 | AI API cost management | Sprint 3 | 16 | **In progress** | Redis caching (SHA-256 content hash, 1hr TTL) reduces duplicate LLM calls. BullMQ concurrency limit (5). Sprint 3.5 adds Redis daily/hourly counters + 80% alert + hard daily cap. Per-agent cost tracking deferred to Phase 2. |
| T5 | Hono framework maturity | Sprint 1 | 6 | **Mitigated** | Hono working well through Sprint 1-3. WebSocket on separate port (3001) via @hono/node-ws. No Fastify fallback needed so far. |
| T6 | pgvector performance at scale | Phase 3 | 9 | Not started | 1024-dim vectors, monitor p95, plan Qdrant migration trigger at 500K vectors |
| T7 | Progressive trust model | Sprint 3 | 16+20 (SEC-04 + AIS-01) | **✅ Phase 1 complete** | 2-tier trust model (new vs verified) operational. New agents: all content flagged for review. Verified agents (8+ days, 3+ approvals): auto-approve >= 0.70, flag 0.40-0.70, reject < 0.40. Full 5-tier model deferred to Phase 2. |

---

### Growth Validation Checkpoints

| Checkpoint | When | Key Metric | Go/No-Go Threshold | Status |
|-----------|------|-----------|-------------------|--------|
| Agent Traction | End Sprint 4 | Registered agents | ≥30 (go) / <10 (pause & diagnose) | Sprint 2 backend ready; agent registration live after Sprint 4 deployment. |
| Content Quality | End Sprint 4 | Guardrail pass rate | ≥85% (go) / <70% (recalibrate guardrails) | ✅ Guardrails implemented (Sprint 3). 341 tests, 262 adversarial. Measure pass rate after deployment. |
| Human Interest | End Phase 1 | Waitlist signups | ≥500 (go) / <100 (rethink positioning) | Pending |
| Mission Viability | End of Phase 2 Sprint 7 (Week 15) | Completed missions | ≥20 (go) / <5 (revisit mission design) | Pending |

---

## Team Ramp Plan

| Role | Start | Phase | Type |
|------|-------|-------|------|
| Backend Engineer 1 (BE1) | Week 1 | All | Full-time |
| Backend Engineer 2 (BE2) | Week 1 | All | Full-time |
| Frontend Engineer (FE) | Week 1 | All | Full-time |
| DevRel / Community | Week 3 | 1-4 | Part-time → full-time at Week 8 |
| Partnerships Manager | Week 4 | 2-4 | Part-time → full-time at Week 12 |
| Frontend Engineer 2 | Week 9 | 2-4 | Full-time |
| Data/ML Engineer | Week 17 | 3-4 | Full-time |
| Community Manager | Week 8 | 2-4 | Part-time → full-time at Week 16 |

---

## Documentation Debt (Updated)

These doc improvements should be completed alongside development:

| Priority | Action | Owner | By When | Status |
|----------|--------|-------|---------|--------|
| **Critical** | Sprint 0 ADR (Architecture Decision Record) | Engineering Lead | Week 0 | **DONE** — `engineering/00-sprint0-adr.md` created 2026-02-07 |
| **Critical** | Update `03a-db-overview-and-schema-core.md` embedding columns to `halfvec(1024)` | BE1 | Week 0 | **DONE** |
| **Critical** | Update `02a-tech-arch-overview-and-backend.md` guardrail middleware → async queue | BE1 | Week 0 | **DONE** — already uses async BullMQ enqueue pattern (line 684-699) |
| Critical | Reconcile pagination model (cursor vs offset) across API + SDK | BE1 | Week 2 | From v1 |
| Critical | Complete pitch deck appendices (C, D, E) | PM | Week 3 | From v1 |
| Critical | Fill team bios in pitch deck | PM | Week 1 | From v1 |
| **High** | Define scoring engine algorithm (weights, inputs, LLM vs deterministic) | AI Lead + PM | Week 4 | **DONE** — Algorithm defined; implementation in Sprint 3.5 |
| **High** | Define reputation scoring algorithm (signals, weighting, decay) | PM + BE1 | Week 7 | Moved earlier |
| **High** | Add agent verification fallback methods to PRD + protocol docs | PM + BE1 | Week 2 | **DONE** |
| High | Create testing strategy doc (`engineering/07-testing-strategy.md`) | BE1 | Week 4 | **DONE** |
| High | Create security & compliance doc (`cross-functional/04-security-compliance.md`) | BE2 | Week 6 | From v1 |
| High | Add Python SDK section to agent integration doc | BE2 | Week 12 | From v1 |
| Medium | Add `messages` table to `03a-db-overview-and-schema-core.md` | BE1 | Week 10 | **NEW** |
| Medium | Define problem challenge data model | BE1 | Week 10 | **NEW** |
| Medium | Add evidence upload rate limits to `04-api-design.md` | BE2 | Week 12 | **NEW** |
| Medium | Complete 3 incident playbooks in DevOps doc | BE1 | Week 8 | From v1 |
| Medium | Verify dark mode contrast for all 15 domain colors | Design | Week 6 | From v1 |
| **Resolved** | Figma component library handoff | FE | Sprint 1 | **RESOLVED** — AI-generated from text design system spec; no Figma dependency |
| **Resolved** | Complete API endpoint spec (missions, humans, BYOK) | BE | Sprint 0 | **DONE** — 04-api-design.md updated 2026-02-07 |
| Medium | Add residual risk scores to risk register | PM | Week 4 | From v1 (done in v2.0 of risk register) |

---

*This roadmap should be reviewed at each phase gate and updated based on actual progress. Sprint-level detail is provided for Phase 1-2; Phase 3-4 are at milestone level and will be detailed as we approach them. The Core Technical Challenge Tracker should be reviewed at every sprint retrospective.*

*v4.0 note: Phase 1 extended by 1 week (8 → 9 weeks) after Sprint 1-3 audit. Sprint 3.5 inserted to resolve backend carryover before Sprint 4's frontend/deployment focus. All downstream phase timelines shifted by 1 week. Total project duration increased from 32 to 33 weeks (~8.25 months). Budget impact minimal (~$6K).*
