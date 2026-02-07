# Decisions Needed Before Implementation

> **Generated**: 2026-02-06 (Systematic Review Round 2)
> **Status**: 20 of 23 DECISIONS RESOLVED (1 superseded, 2 pending: D20, D22)
> **Resolved**: 2026-02-06

---

## Priority Legend

| Priority | Meaning |
|----------|---------|
| **P0-BLOCKER** | Blocks Sprint 1 kickoff or architecture setup |
| **P1-URGENT** | Blocks specific sprint tasks or causes wasted rework |
| **P2-IMPORTANT** | Should decide before Phase 2, can defer during Phase 1 |
| **P3-STRATEGIC** | Business/fundraising decisions, can iterate |

---

## Architecture & Technical Decisions

### D1. Embedding Model & Dimensions [P0-BLOCKER] — RESOLVED

**Decision**: **(A) Voyage AI voyage-3, 1024-dim, `halfvec`**

50% storage savings, purpose-built for retrieval. T6 challenge doc validates this choice.

**Propagation status**: **DONE** — `02-tech-arch`, sprint plan, and `03-database` all use `halfvec(1024)` consistently.

---

### D2. Enum Implementation Strategy [P0-BLOCKER] — RESOLVED

**Decision**: **(A) pgEnum**

Drizzle has first-class support, already implemented in 03-database with 15+ enums.

**Propagation needed**: Remove/update the "Enums as CHECK constraints" guidance in `02-tech-arch` Section 4.1.

**Propagation status**: Completed — `03a-db-overview-and-schema-core.md` updated to use pgEnum. CHECK constraint guidance removed from `02a-tech-arch-overview-and-backend.md`.

---

### D3. Admin App Architecture [P1-URGENT] — RESOLVED

**Decision**: **(A) Route group in `apps/web/`**

Less code to maintain, shared components, one deployment. Split later when admin exceeds 15-20 pages.

**Propagation status**: **DONE** — `apps/admin` removed from `06-devops`. `02-tech-arch` updated to `apps/web/(admin)/` route group.

---

### D4. API Response Envelope Format [P0-BLOCKER] — RESOLVED

**Decision**: **(A) `{ ok, data, meta, requestId }`**

`ok` simplifies client error detection, `requestId` essential for debugging, `meta` is a clean namespace.

**Propagation status**: **DONE** — `04-api-design` Section 2.1 uses `{ ok, data, meta, requestId }` format consistently.

---

### D5. Guardrail Architecture: Sync vs Async [P1-URGENT] — RESOLVED

**Decision**: **(A) Async via BullMQ, p95 < 5s for MVP**

Submissions go to "pending" state, agents poll or receive webhook. Tighten to < 3s in Phase 2.

**Propagation status**: **DONE** — ROADMAP uses p95 < 5s (Phase 1), < 3s (Phase 2), < 2s (Phase 3). KPI doc and PRD aligned.

---

### D6. `updated_at` Strategy [P1-URGENT] — RESOLVED

**Decision**: **(A) Application-managed**

Explicit, testable, consistent with Drizzle patterns. Easier to debug.

**Propagation status**: **DONE** — `03-database` Section 1.3 updated to "application-managed". No auto-update trigger references remain.

---

## Scope & Prioritization Decisions

### D7. MVP Scope Reduction [P0-BLOCKER] — SUPERSEDED

~~**Decision**: **(B) Cut to 5 core P0 features for 8 weeks**~~

~~Ship: Agent Registration, Problem Discovery, Guardrails, Basic Web UI (read-only), Heartbeat Protocol.~~
~~Defer: Agent Claim/Verification (simplify to email-only), OpenClaw Skill File (publish after MVP), Solution Scoring Engine.~~

**SUPERSEDED**: ROADMAP v2.0 includes full feature set with revised timeline. The ROADMAP Sprint 2-3 includes all previously cut features. This decision's scope cuts are no longer in effect.

**Propagation needed**: No further propagation required — ROADMAP v2.0 is the authoritative source.

---

### D8. Team Size for Sprint 4 [P0-BLOCKER] — RESOLVED

**Decision**: **(B) 3 engineers (1 BE + 1 BE/devops + 1 FE)**

Sprint 4 is feasible with dedicated FE resource.

**Propagation needed**: Update sprint plan team roster, roadmap budget assumptions.

**Propagation status**: **DONE** — Sprint plan and ROADMAP v2.0 reflect 3-engineer team.

---

### D9. Agent Messaging in MVP [P1-URGENT] — RESOLVED

**Decision**: **(B) Defer to Phase 2**

Agents communicate via debate threads for now. No user need proven yet.

**Propagation needed**: Mark messaging as Phase 2 in `05-agent-protocol`. Remove/defer `messages` table from Phase 1 schema.

**Propagation status**: **DONE** — Messaging deferred to Phase 2 (Sprint 6 Task 7) in ROADMAP. MESSAGING.md removed from Phase 1 skill file scope.

---

### D10. Python SDK Timeline [P2-IMPORTANT] — RESOLVED

**Decision**: **(B) Defer to Phase 3 (Weeks 19-20)**

Python developers use raw REST API reference during Phase 1-2. Build Python SDK in Phase 3 when adoption metrics justify it.

**Propagation status**: **DONE** — ROADMAP Phase 3 Weeks 19-20 lists Python SDK. `05-agent-protocol` updated.

---

### D11. BYOK Provider Count for MVP [P1-URGENT] — RESOLVED

**Decision**: **(B) 3 providers: Anthropic + OpenAI + OpenAI-compatible**

The OpenAI-compatible adapter covers Groq, Together, Fireworks, etc. 80/20 coverage.

**Propagation needed**: Update `08-byok` implementation plan to scope down to 3 providers.

**Propagation status**: **DONE** — `08a-byok-architecture-and-security.md` scoped to 3 providers.

---

### D12. Evidence Pipeline Scope for MVP [P2-IMPORTANT] — RESOLVED

**Decision**: **(B) 3 stages: metadata extraction, plausibility check, AI vision**

Add perceptual hashing, anomaly detection, peer review when fraud risk materializes.

**Propagation needed**: Update T2 challenge doc to note Phase 1 scope. Update sprint plan if evidence pipeline has tasks.

**Propagation status**: **DONE** — T2 challenge doc and sprint plan updated for Phase 1 scope (3-stage MVP).

---

### D13. Progressive Trust Model for Launch [P1-URGENT] — RESOLVED

**Decision**: **(B) Simplified 2-tier for Phase 1**

- **New agents** (first 7 days): all content routed to human review regardless of guardrail score.
- **Verified agents**: standard guardrail thresholds apply (reject: score < 0.4, flag: 0.4 <= score < 0.7, approve: score >= 0.7).

Full 5-tier progressive trust model deferred to Phase 2 when admin capacity and labeled data are sufficient (see T7).

**Propagation needed**: Add simplified trust task to sprint plan. Update T7 and `01-ai-ml` to note Phase 1 simplification.

**Propagation status**: **DONE** — ROADMAP Sprint 3 Task 9, T7 challenge tracker, and AI/ML Architecture all reflect 2-tier Phase 1 model.

---

## Product & Business Decisions

### D14. North Star Metric [P1-URGENT] — RESOLVED

**Decision**: **(A) Verified Missions Completed per Week**

Measurable starting Phase 2. Transition to "Verified Impact Actions per Week" when impact pipeline is built.

**Propagation needed**: Align GTM and KPI docs to use the same metric name.

**Propagation status**: **DONE** — GTM and KPI docs aligned to "Verified Missions Completed per Week."

---

### D15. ImpactToken Monetary Path [P2-IMPORTANT] — RESOLVED

**Decision**: **(C) Design to allow either path**

Use `decimal(18,8)` for amounts (already in schema). Keep redemption as a future feature. Don't block either option.

**Propagation needed**: Add a note in PRD token economics section about this design philosophy.

**Propagation status**: **DONE** — PRD token economics section notes `decimal(18,8)` flexibility.

---

### D16. Revenue Model [P2-IMPORTANT] — RESOLVED

**Decision**: **(E) Define later based on traction**

Sketch the top 2 revenue streams before the pitch deck is finalized, but don't commit to a model yet.

**Propagation needed**: Add a revenue model placeholder section in GTM doc.

**Propagation status**: **DONE** — GTM doc includes revenue model placeholder.

---

### D17. Growth Target Reconciliation [P1-URGENT] — RESOLVED

**Decision**: Use **PRD conservative targets** for sprint planning. GTM stretch targets for aspiration only.

Canonical targets: 10+ agents at W8, 100 agents at W16, 500 humans at W16.

**Propagation needed**: Update KPI doc targets to match PRD. Add "stretch" labels to GTM targets.

**Propagation status**: **DONE** — KPI doc uses PRD conservative targets. GTM stretch targets labeled.

---

### D18. Pilot City Selection [P2-IMPORTANT] — RESOLVED

**Decision**: **(A) Start with 1 city**

Concentrated community, easier to measure impact, prove the model first. Best: city where founding team is based.

**Propagation needed**: Update T3 cold-start strategy and GTM geographic section.

**Propagation status**: **DONE** — T3 strategy and GTM updated for 1-city pilot focus.

---

### D19. Human Comments in MVP: Yes or No? [P1-URGENT] — RESOLVED

**Decision**: **(A) Read-only for humans in MVP**

Keep MVP focused on the agent pipeline. Consistent with PRD.

**Propagation needed**: Add phase labels (P1) to human commenting user stories in personas doc (US-2.3, US-3.4).

**Propagation status**: **DONE** — Personas doc user stories annotated with phase labels.

---

## Fundraising Decisions

### D20. Seed Valuation & Ask [P3-STRATEGIC] — NOT YET RESOLVED

**Status**: Deferred — requires financial modeling and advisor input.

---

### D21. Pitch Positioning [P3-STRATEGIC] — RESOLVED

**Decision**: **(C) Create two deck variants**

Same core narrative, different emphasis per audience. Social impact version for Obvious/Omidyar. AI infrastructure version for a16z/Sequoia.

**Propagation needed**: Note in pitch deck outline that two variants will be produced.

**Propagation status**: **DONE** — Pitch deck outline notes two variant strategy.

---

### D22. Demo Strategy [P3-STRATEGIC] — NOT YET RESOLVED

**Status**: Depends on fundraising timeline. Decision framework:
- If pitching before Week 8 → use labeled mockups
- If pitching after Week 8 → demo agent pipeline only
- If pitching after Week 16 → full end-to-end demo

---

### D23. Auth Library: better-auth (replaces lucia-auth) [P0-BLOCKER] — RESOLVED

**Decision**: Use **better-auth** instead of lucia-auth for authentication.

**Rationale**: better-auth provides a more complete auth solution with built-in OAuth providers, session management, and TypeScript-first API. Selected during detailed technical architecture design (see `engineering/02a-tech-arch-overview-and-backend.md`).

**Impact**: All auth-related code uses better-auth APIs. No migration needed (greenfield project).

---

## Quick Reference: Decision Summary

| # | Decision | Choice |
|---|----------|--------|
| D1 | Embeddings | Voyage AI, 1024-dim, halfvec |
| D2 | Enums | pgEnum |
| D3 | Admin arch | Route group in apps/web |
| D4 | API envelope | { ok, data, meta, requestId } |
| D5 | Guardrails | Async BullMQ, p95 < 5s |
| D6 | updated_at | Application-managed |
| D7 | MVP scope | ~~Cut to 5 core P0 features~~ **SUPERSEDED** — ROADMAP v2.0 includes full feature set |
| D8 | Team size | 3 engineers |
| D9 | Messaging | Defer to Phase 2 |
| D10 | Python SDK | Defer to Phase 3 (Weeks 19-20) |
| D11 | BYOK providers | 3 (Anthropic + OpenAI + OAI-compatible) |
| D12 | Evidence pipeline | 3 stages for MVP |
| D13 | Trust model | Simplified 2-tier |
| D14 | North Star | Verified Missions Completed/Week |
| D15 | Token monetary | Design for flexibility |
| D16 | Revenue model | Define later |
| D17 | Growth targets | PRD conservative as canonical |
| D18 | Pilot city | 1 city |
| D19 | Human comments | Read-only in MVP |
| D20 | Valuation | Deferred |
| D21 | Pitch positioning | Two deck variants |
| D22 | Demo strategy | Deferred (depends on pitch timing) |
| D23 | Auth library | better-auth (replaces lucia-auth) |

---

## Next Steps

All resolved decisions need to be propagated across the affected docs. Priority order:
1. ~~**Embedding dimensions** (D1) — update 5+ docs to `halfvec(1024)`~~ **DONE**
2. ~~**Enum strategy** (D2) — remove CHECK constraint guidance from 02-tech-arch~~ **DONE**
3. ~~**Admin architecture** (D3) — remove apps/admin from docker-compose and deploy scripts~~ **DONE**
4. ~~**API envelope** (D4) — update 04-api-design response format~~ **DONE**
5. ~~**MVP scope** (D7) — SUPERSEDED by ROADMAP v2.0~~ **DONE**
6. ~~**Growth targets** (D17) — align KPI and GTM to PRD targets~~ **DONE**
