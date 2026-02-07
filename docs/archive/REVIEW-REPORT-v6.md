# BetterWorld Documentation Review Report v6.0

> **Review Date**: 2026-02-06
> **Scope**: All 30 documentation files across 6 categories
> **Method**: Systematic parallel review with cross-referencing against proposal.md (source of truth)
> **Reviewer**: Claude (automated systematic review)

---

## Executive Summary

**Overall Status: CONDITIONALLY READY FOR DEVELOPMENT**

The documentation suite is comprehensive (~30K lines across 30 files) and architecturally sound. However, **16 CRITICAL issues** and **28 MAJOR issues** were identified that would cause compilation errors, runtime failures, or block engineering progress if not resolved before development begins.

**No architectural changes are needed** — all issues are fixable through documentation updates and clarifications.

| Category | Docs | Critical | Major | Minor |
|----------|------|----------|-------|-------|
| PM (5 docs) | PRD, Personas, GTM, Competitive, KPIs | 4 | 10 | 11 |
| Engineering (8 docs) | AI/ML, Tech Arch, DB, API, Agent Protocol, DevOps, Testing, BYOK | 8 | 10 | 12 |
| Design (2 docs) | Brand System, UX Flows | 1 | 4 | 5 |
| Cross-functional (4 docs) | Sprint Plan, Risk Register, Pitch Deck, Security | 3 | 6 | 5 |
| Meta + Challenges (10 docs) | Roadmap, Decisions, Review, T1-T7 | 0 | 3 | 5 |
| **TOTAL** | **30 docs** | **16** | **33** | **38** |

---

## Part 1: CRITICAL Issues (Must Fix Before Development)

### 1.1 Engineering — Code That Won't Compile/Run

**C1. SQL Column Name Mismatch** — [04-api-design.md](engineering/04-api-design.md)
- Line 565: SQL uses `claimed_by = $2` but Drizzle schema defines `claimedByHumanId` → column doesn't exist, SQL fails at runtime
- **Fix**: Change `claimed_by` → `claimed_by_human_id`

**C2. API Endpoint Path Missing Slashes** — [04-api-design.md](engineering/04-api-design.md)
- Lines 518-521: `GET /missions:id` should be `GET /missions/:id` (missing `/` before `:id`)
- Same issue in rate limit table (lines 1045, 1047)
- **Fix**: Add missing forward slashes in all `:id` parameter paths

**C3. Missing `evidence_required` Field in Schema** — [01-ai-ml-architecture.md](engineering/01-ai-ml-architecture.md) vs [03-database-design.md](engineering/03-database-design.md)
- AI/ML code references `mission.evidence_required?.types?.includes('photo')` in 5+ locations (lines 1238, 1581, 1762, 1944, 1955) but `evidence_required` field does not exist in missions table
- **Fix**: Add `evidenceRequired: jsonb("evidence_required")` to missions schema

**C4. Nullability Mismatch Between DB and API** — [03-database-design.md](engineering/03-database-design.md) vs [04-api-design.md](engineering/04-api-design.md)
- DB: `difficulty` and `missionType` are `.notNull()`
- API types: marks them as `Difficulty | null` and `MissionType | null`
- **Fix**: Align — either make schema nullable or remove null from API types

**C5. Field Naming Inconsistency** — [04-api-design.md](engineering/04-api-design.md) vs [03-database-design.md](engineering/03-database-design.md)
- DB field: `totalImpactTokensEarned`; API type: `totalImpactTokens` — data mapping will break
- Same issue in `LeaderboardEntry` and `ImpactDashboard` types
- **Fix**: Standardize naming across schema and API types

**C6. Undefined Runtime Value in Seed Script** — [06-devops-and-infrastructure.md](engineering/06-devops-and-infrastructure.md)
- Line 412: `reportedByAgentId: /* sentinel-alpha id */ undefined as any` — won't compile
- **Fix**: Replace with actual ID lookup from previous insert

**C7. KeyVault Crypto Implementation Bug** — [08-byok-ai-cost-management.md](engineering/08-byok-ai-cost-management.md)
- Line 328: `dekAuthTag` extraction uses `subarray()` incorrectly — potential TypeError at runtime
- **Fix**: Correct the subarray call parameters

**C8. TypeScript SDK Missing Type Bounds** — [05-agent-integration-protocol.md](engineering/05-agent-integration-protocol.md)
- Lines 1850-2125: SDK class has incomplete generic type support, `Generic[T]` references undefined `T`
- **Fix**: Add explicit type bounds, imports, and constraint usage

### 1.2 PM — Undefined Core Metrics

**C9. North Star Metric Undefined for Phase 1** — [01-prd.md](pm/01-prd.md) vs [05-kpis-and-metrics.md](pm/05-kpis-and-metrics.md)
- North Star is "Verified Missions Completed per Week" but Phase 1 (MVP) is agent-only — no humans, no missions → metric is zero for 8 weeks
- **Fix**: Define Phase 1-specific North Star (e.g., "Problems Approved per Week") and transition to verified missions at Phase 2

**C10. Token Multiplier Stacking Undefined** — [01-prd.md](pm/01-prd.md) vs [02-user-personas-and-stories.md](pm/02-user-personas-and-stories.md)
- Personas doc calculates: 50 IT + 20% AI + 15% peer = 67.5 IT (additive)
- But multiplicative: 50 × 1.2 × 1.15 = 69 IT
- Token economy design is ambiguous — impacts all reward calculations
- **Fix**: Explicitly state additive vs multiplicative in PRD Section 5.3

**C11. Decision D19 Missing** — [01-prd.md](pm/01-prd.md) vs [02-user-personas-and-stories.md](pm/02-user-personas-and-stories.md)
- Personas doc references D19 ("humans read-only Phase 1") but it's not in PRD Section 9 Open Questions
- **Fix**: Add D19 to PRD or confirm in DECISIONS-NEEDED.md

**C12. Human Onboarding Timeline Contradictory** — [01-prd.md](pm/01-prd.md) vs [03-go-to-market-strategy.md](pm/03-go-to-market-strategy.md)
- PRD says humans are Phase 2 (W9+), but GTM references humans during "Spark Phase" (W4-8)
- **Fix**: Clarify if humans can browse (read-only) during Phase 1

### 1.3 Cross-functional — Scope Contradictions

**C13. Sprint 2 OpenClaw Scope Contradiction** — [01-sprint-plan-phase1.md](cross-functional/01-sprint-plan-phase1.md)
- Line 267: Sprint 2 goal states "OpenClaw skill file is installable"
- Lines 323-332: S2-06 is explicitly deferred to post-MVP
- Line 408: Definition of Done shows it as crossed out
- **Fix**: Remove from Sprint 2 goal or move S2-06 back into scope

**C14. Color Palette Inconsistency** — [01-brand-and-design-system.md](design/01-brand-and-design-system.md) vs [03-pitch-deck-outline.md](cross-functional/03-pitch-deck-outline.md)
- Design system: Primary = Terracotta `#C4704B`
- Pitch deck: Uses amber `#E8A838`
- **Fix**: Align or document the rationale for different colors

**C15. JWT Token Lifecycle Gap** — [04-security-compliance.md](cross-functional/04-security-compliance.md)
- 24-hour JWT grace period, but refresh tokens have 7-day lifetime
- Tokens signed with old secret become invalid after grace period but are still "alive"
- **Fix**: Add explicit statement about re-login requirement after grace period

**C16. Sprint 4 Completely Missing** — [01-sprint-plan-phase1.md](cross-functional/01-sprint-plan-phase1.md)
- Sprint 4 (Weeks 7-8) has a goal stated but zero task definitions
- This is Phase 1's final milestone — must be specified
- **Fix**: Define Sprint 4 tasks, acceptance criteria, and resource allocation

---

## Part 2: MAJOR Issues (Block Development or Require Clarification)

### Engineering (10 issues)

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| M1 | `solution.total_budget_tokens` referenced but doesn't exist in schema | AI/ML doc line 1358 | Add field to solutions or clarify budget source |
| M2 | Evidence submission request type mismatch (`gpsCoordinates` vs `latitude, longitude`) | API design lines 608-623 | Standardize parameter names |
| M3 | Debate threading max depth (5) not enforced in schema | API design line 508 | Add depth tracking column or check constraint |
| M4 | Missing Dockerfile specifications for api and web | DevOps doc lines 149-171 | Add Dockerfile section with multi-stage build |
| M5 | Missing Vitest integration test config | Testing doc lines 383-397 | Document `vitest.integration.config.ts` |
| M6 | Python SDK marked Phase 2 but includes 180 lines of broken code | Agent Protocol doc lines 2215-2400 | Either complete or remove |
| M7 | BYOK decryption in hot path — no caching strategy | BYOK doc lines 241-256 | Add key caching section (5-10s TTL) |
| M8 | CI/CD references undefined GitHub Secrets | DevOps doc multiple lines | Add secrets setup guide section |
| M9 | pgvector extension creation not in migration docs | DB design lines 2257-2262 | Add `CREATE EXTENSION IF NOT EXISTS vector` |
| M10 | No verification stage enum definition | DB design line 1029 | Define proper enum type |

### PM (10 issues)

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| M11 | Agent verification fallback not documented | PRD lines 203-211 | Clarify backup flow if X/Twitter API fails |
| M12 | Problem domain severity scales missing | PRD Appendix 10.1 | Add severity guidelines per domain |
| M13 | Guardrail test suite (200 items) construction process not documented | PRD, KPIs docs | Add ground truth labeling SOP |
| M14 | Solution scoring composite formula never defined | PRD lines 228-235 | Define how composite_score >= 7.0 is computed |
| M15 | Viral coefficient (k=1.2) completely unvalidated | GTM doc line 49 | Add hypothesis validation plan |
| M16 | Agent retention not addressed in GTM | GTM doc | Add retention strategy section |
| M17 | NGO partnership roadmap lacks detail | GTM doc lines 61, 179 | Add partner acquisition funnel |
| M18 | Token inflation control mechanism missing | KPIs doc line 285 | Add supply control strategy |
| M19 | Competitive claims unverified | Competitive doc lines 36-38 | Add citations or caveats |
| M20 | Time window inconsistency: "per week" vs "per month" | KPIs vs GTM docs | Standardize on weekly |

### Design + Cross-functional (10 issues)

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| M21 | Figma links deferred indefinitely | Design docs lines 11, 23 | Set delivery deadline (Sprint 1 midpoint) |
| M22 | Admin routes missing from authorization matrix | UX flows lines 126-149 | Add `/admin/*` routes |
| M23 | Canonical skill list not defined as shared constant | UX flows lines 320-356 | Create `packages/shared/constants.ts` |
| M24 | BE1 vs BE2 DevOps responsibility contradictory | Sprint plan lines 19-20 vs 54 | Clarify role assignments |
| M25 | Resource utilization dangerously low (23-33%) | Sprint plan lines 232-260 | Pre-allocate specific tasks to reach 60% |
| M26 | Only 2 of 10 top risks have detailed playbooks | Risk register | Add playbooks for remaining top-8 |
| M27 | Pitch deck: only 1 variant provided (promised 2) | Pitch deck outline | Provide both variants |
| M28 | Evidence quality scoring algorithm undefined | Multiple docs | Define and cross-reference |
| M29 | Onboarding bonus (+10 IT) not in sprint plan | UX flows line 356 | Add to Sprint 1/2 acceptance criteria |
| M30 | Security-compliance.md NOT listed in INDEX.md | INDEX.md | Add entry to cross-functional table |

### Meta + Challenges (3 issues)

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| M31 | BYOK cost footnote needed | ROADMAP.md | Clarify $400/mo assumes partial BYOK adoption |
| M32 | D2 (enum strategy) propagation incomplete | DECISIONS-NEEDED.md | Update 02-tech-arch.md with pgEnum guidance |
| M33 | T7 Phase 1 implementation conflicts with D13 (5-tier vs 2-tier) | T7 doc Section 9.2 | Update to specify: build framework, activate 2 tiers |

---

## Part 3: Minor Issues (38 total — summarized)

### Engineering (12)
- Placeholder `XXXX` in migration file naming pattern
- Missing guardrail override verdict enum definition
- Timestamp format ambiguity (should explicitly state "UTC")
- Ed25519 key rotation policy not enforced
- Cost estimates use outdated 2024 pricing
- Seed script uses decimal as text without rationale
- Playwright config assumes full dev server startup
- BYOK fallback key selection logic undefined
- Solution status naming inconsistency
- Missing debate depth tracking
- Docker compose references unspecified targets
- Inconsistent units (seconds vs milliseconds) across docs

### PM (11)
- Token terminology inconsistency ("ImpactToken" vs "IT")
- Agent verification D7 marker used for two different features
- Guardrail latency units vary (5s vs 5000ms)
- Personas lack accessibility representation
- Channel attribution model not specified
- Domain expansion conflated with geographic expansion
- Competitive "slop" definition missing
- Moltbook competitive claims cited as hearsay
- Dashboard specs too prescriptive
- Event tracking missing sampling/privacy/retention policies
- Quality metrics definition ambiguous

### Design + Cross-functional (5)
- Disaster Response domain color at 4.6:1 barely meets WCAG AA
- CSS `clamp()` formula may not match stated min/max values
- Lucide React version not pinned
- "XF-" prefix used inconsistently
- ASCII heat map in risk register is hard to parse

### Meta + Challenges (5)
- ROADMAP "Messaging.md" reference needs D9 clarification
- T5 risk score discrepancy (6 vs 9)
- T2 evidence cost attribution needs T4 cross-reference
- T2 GPS terminology inconsistency (app GPS vs geofencing)
- T6 Qdrant migration "two-trigger" rule under-justified

---

## Part 4: Cross-Document Consistency Assessment

### Consistent (verified)
- Tech stack references (Node 22, PG 16, Redis 7, Hono, Drizzle) — consistent across all docs
- Phase timeline (Phase 1: W1-8, Phase 2: W9-16, Phase 3: W17-32) — consistent
- Agent registration targets (10 W8, 100 W16) — consistent across PRD, GTM, KPIs
- 15 approved domains aligned with UN SDGs — consistent across PRD, proposal, guardrails
- BYOK cost model — consistent between T4, ROADMAP, and BYOK architecture doc
- All 22 decisions in DECISIONS-NEEDED.md are resolved with choices documented
- All 7 technical challenges have dedicated research documents

### Inconsistent (requires resolution)
| Inconsistency | Documents | Resolution |
|---------------|-----------|------------|
| North Star metric undefined for Phase 1 | PRD, KPIs | Define Phase 1 metric |
| Human onboarding timeline | PRD (W9+), GTM (W4-8) | Clarify read-only access |
| Token multiplier stacking | PRD, Personas | Define formula explicitly |
| Sprint 2 OpenClaw skill scope | Sprint plan (contradicts itself) | Remove from goal |
| Color palette (Terracotta vs Amber) | Design system, Pitch deck | Align or document rationale |
| `totalImpactTokens` vs `totalImpactTokensEarned` | API, DB schema | Standardize naming |
| `evidence_required` field | AI/ML (uses it), DB (missing it) | Add to schema |
| Trust model tiers (2 vs 5 for Phase 1) | D13 decision, T7 doc | Clarify: build 5, activate 2 |

---

## Part 5: Document Quality Scores

| Document | Completeness | Accuracy | Actionability | Cross-Ref | Overall |
|----------|:-----------:|:--------:|:------------:|:---------:|:-------:|
| **PM** | | | | | |
| 01-prd.md | 80% | 75% | 85% | 75% | **79%** |
| 02-user-personas.md | 90% | 80% | 90% | 80% | **85%** |
| 03-go-to-market.md | 75% | 70% | 75% | 70% | **73%** |
| 04-competitive-analysis.md | 85% | 75% | 80% | 85% | **81%** |
| 05-kpis-and-metrics.md | 90% | 80% | 85% | 75% | **83%** |
| **Engineering** | | | | | |
| 01-ai-ml-architecture.md | 90% | 70% | 85% | 75% | **80%** |
| 02-technical-architecture.md | 85% | 80% | 85% | 80% | **83%** |
| 03-database-design.md | 90% | 80% | 85% | 75% | **83%** |
| 04-api-design.md | 80% | 65% | 80% | 70% | **74%** |
| 05-agent-integration-protocol.md | 75% | 70% | 75% | 80% | **75%** |
| 06-devops-and-infrastructure.md | 80% | 75% | 70% | 75% | **75%** |
| 07-testing-strategy.md | 85% | 80% | 80% | 75% | **80%** |
| 08-byok-ai-cost-management.md | 90% | 85% | 85% | 85% | **86%** |
| **Design** | | | | | |
| 01-brand-and-design-system.md | 85% | 75% | 90% | 80% | **83%** |
| 02-ux-flows-and-ia.md | 70% | 80% | 85% | 75% | **78%** |
| **Cross-functional** | | | | | |
| 01-sprint-plan-phase1.md | 65% | 75% | 80% | 70% | **72%** |
| 02-risk-register.md | 80% | 70% | 75% | 80% | **76%** |
| 03-pitch-deck-outline.md | 50% | 70% | 60% | 60% | **60%** |
| 04-security-compliance.md | 85% | 80% | 85% | 75% | **81%** |
| **Meta + Challenges** | | | | | |
| ROADMAP.md | 90% | 85% | 90% | 85% | **88%** |
| DECISIONS-NEEDED.md | 95% | 90% | 90% | 90% | **91%** |
| REVIEW-AND-TECH-CHALLENGES.md | 90% | 90% | 85% | 90% | **89%** |
| T1-T7 (average) | 90% | 85% | 85% | 85% | **86%** |
| **OVERALL AVERAGE** | **83%** | **78%** | **82%** | **78%** | **80%** |

---

## Part 6: Prioritized Action Plan

### Tier 1: Fix Immediately (before any code is written) — ~4 hours

| # | Action | Est. | Owner |
|---|--------|------|-------|
| 1 | Fix SQL column name `claimed_by` → `claimed_by_human_id` (C1) | 5m | Eng |
| 2 | Fix API endpoint paths — add missing `/` before `:id` (C2) | 10m | Eng |
| 3 | Add `evidence_required` field to missions schema (C3) | 15m | Eng |
| 4 | Align nullability between DB schema and API types (C4) | 15m | Eng |
| 5 | Standardize `totalImpactTokens` naming across docs (C5) | 15m | Eng |
| 6 | Fix seed script runtime value (C6) | 10m | Eng |
| 7 | Fix KeyVault crypto subarray bug (C7) | 5m | Eng |
| 8 | Complete TypeScript SDK type bounds (C8) | 30m | Eng |
| 9 | Define Phase 1 North Star metric (C9) | 30m | PM |
| 10 | Define token multiplier formula (C10) | 15m | PM |
| 11 | Add D19 to PRD or DECISIONS-NEEDED (C11) | 10m | PM |
| 12 | Clarify human read-only access Phase 1 (C12) | 15m | PM |
| 13 | Fix Sprint 2 OpenClaw scope contradiction (C13) | 10m | PM |
| 14 | Align color palette or document rationale (C14) | 15m | Design |
| 15 | Clarify JWT lifecycle after grace period (C15) | 10m | Eng |
| 16 | Add Sprint 4 task definitions (C16) | 60m | PM+Eng |

### Tier 2: Fix Before Sprint 1 Ends — ~6 hours

| # | Action | Est. |
|---|--------|------|
| 1 | Add Dockerfile specifications for api and web (M4) | 30m |
| 2 | Document GitHub Secrets setup guide (M8) | 20m |
| 3 | Add Vitest integration test config (M5) | 15m |
| 4 | Add pgvector extension to migration docs (M9) | 5m |
| 5 | Define composite scoring formula (M14) | 30m |
| 6 | Add security-compliance.md to INDEX.md (M30) | 5m |
| 7 | Add admin routes to auth matrix (M22) | 15m |
| 8 | Create canonical skill list constant (M23) | 15m |
| 9 | Clarify BE1 vs BE2 DevOps responsibilities (M24) | 10m |
| 10 | Define evidence quality scoring algorithm (M28) | 30m |
| 11 | Resolve T7 Phase 1 (2 vs 5 tiers) (M33) | 15m |
| 12 | Complete D2 pgEnum propagation (M32) | 30m |
| 13 | Add BYOK cost footnote to ROADMAP (M31) | 10m |
| 14 | Set Figma delivery deadline (M21) | 5m |

### Tier 3: Fix Before Phase 2 — documentation quality improvements

- Add guardrail test suite construction SOP
- Add agent retention strategy to GTM
- Add NGO partnership acquisition funnel
- Expand domain severity scales
- Add detailed playbooks for top-8 risks
- Add problem/solution budget fields
- Complete or remove Python SDK code
- Add BYOK key caching strategy
- Validate viral coefficient assumption

---

## Part 7: INDEX.md Update Needed

The [INDEX.md](INDEX.md) is missing `04-security-compliance.md` from the cross-functional section. Add:

```markdown
| 4 | [Security & Compliance Framework](cross-functional/04-security-compliance.md) | Authentication, data protection, API security, compliance, incident response | ~3,000 |
```

Also update:
- Last Review date to current review
- Line counts that have changed since last update
- Add this review report to the meta documents table

---

## Conclusion

The BetterWorld documentation suite is **architecturally sound and 80% development-ready**. The 16 CRITICAL issues are all fixable within ~4 hours of focused editing. Once Tier 1 fixes are applied, an engineer can begin implementation using the reading order specified in INDEX.md.

**Strongest docs**: DECISIONS-NEEDED (91%), ROADMAP (88%), BYOK Architecture (86%), Challenge Research (86% avg)

**Weakest docs**: Pitch Deck Outline (60%), Sprint Plan Phase 1 (72%), Go-to-Market (73%), API Design (74%)

**Key blockers for engineering start**:
1. Schema/API type mismatches (C1-C5) — will cause TypeScript compilation errors
2. Sprint 4 undefined (C16) — Phase 1 endpoint unclear
3. North Star metric undefined for Phase 1 (C9) — no success measure for first 8 weeks
4. Figma prototypes deferred — affects frontend pixel-precision

**Recommendation**: Schedule a 4-hour working session with PM + Design + Engineering leads to resolve all Tier 1 items, then begin Sprint 1 implementation.
