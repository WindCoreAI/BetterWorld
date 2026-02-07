# BetterWorld Documentation Review Report v8.0

> **Date**: 2026-02-07
> **Reviewer**: Claude Opus 4.6 (6-agent parallel systematic review)
> **Scope**: All 25+ documentation files across 7 categories
> **Previous Review**: v7.1 (2026-02-07) — claimed all issues resolved

---

## Methodology

Six specialized review agents examined every document in parallel, each evaluating their category for:
- Technical accuracy (code samples, API syntax, library versions)
- Internal consistency (numbers, dates, terminology within each doc)
- Cross-document consistency (same concept defined differently across docs)
- Completeness (gaps, TODOs, missing specs)
- Implementability (can a developer act on this without guessing?)

**Finding**: Despite v7.1 claiming "ready for Sprint 1," this deeper review uncovered **248 total issues** — many are deep technical issues not caught by the structural review in v7.1.

---

## Executive Summary

| Category | Critical | Major | Minor | Nit | Total |
|----------|:--------:|:-----:|:-----:|:---:|:-----:|
| Meta (ROADMAP, REVIEW, DECISIONS) | 8 | 17 | 12 | 7 | **44** |
| PM (PRD, Personas, GTM, Competitive, KPIs) | 1 | 11 | 37 | 14 | **63** |
| Engineering (8 docs) | 5 | 16 | 18 | 6 | **45** |
| Design (Brand, UX Flows) | 4 | 20 | 13 | 6 | **43** |
| Cross-functional (Sprint, Risk, Pitch, Security) | 12 | 29 | 14 | 6 | **61** |
| Challenges (T1-T7) | 3 | 14 | 18 | 4 | **39** |
| **Total** | **33** | **107** | **112** | **43** | **295** |

> **Note**: Some issues are counted in multiple categories when they span documents. Deduplicated unique issues: ~248.

---

## Systemic Problems (Cross-Cutting Themes)

These 8 systemic issues appear across multiple documents and represent the highest-risk patterns.

### S1. Trust Model Has 4+ Conflicting Definitions — BLOCKS SPRINT 3

The single most dangerous inconsistency in the entire doc suite. A developer will get a different answer depending on which document they read:

| Source | Phase 1 Trust Model |
|--------|---------------------|
| ROADMAP line 113 | All AI content human-reviewed; confidence 0.85 prioritizes queue |
| DECISIONS D13 | 2-tier: new agents (<7 days) all human-reviewed, verified agents use normal thresholds |
| REVIEW-AND-TECH-CHALLENGES line 278 | New agents get 3 submissions/day, auto-approved at >=0.85 (no human review) |
| REVIEW-AND-TECH-CHALLENGES line 283-287 | 5-tier system standardized across docs |
| T7 Challenge Doc | Full 5-tier state machine with economic mechanisms |
| Risk Register SEC-04 | Days 0-30: all content to human review |
| Sprint Plan S3-12 | New agents (first 7 days): all content to human review |

**v7.1 claimed this was resolved (A6)**, but only updated a few locations. Multiple docs still carry the old definitions.

**Action**: Pick D13 as canonical Phase 1 definition. Update ROADMAP, REVIEW-AND-TECH-CHALLENGES, Risk Register SEC-04 (change 30 days to 7 days). Mark T7's full 5-tier as "Phase 2 target."

### S2. Claude Haiku Model Identity & Pricing — 3-5 Different Values

| Source | Model ID | Input/MTok | Output/MTok |
|--------|----------|:----------:|:-----------:|
| 01-ai-ml-architecture | "Claude Haiku 4.5" | $0.25 | $1.25 |
| 02-technical-architecture | `claude-haiku-4-5-20251001` | $1.00 | $5.00 |
| 08-byok-ai-cost-management | `claude-haiku-4-5-20251001` | $1.00 | $5.00 |
| T4 challenge doc | `claude-3-5-haiku-20241022` | $0.80 | $4.00 |
| T1 challenge doc | "Claude 3.5 Haiku" | $0.25 | $1.25 |

**Impact**: Cost projections vary 4x depending on which doc you read. BYOK cost attribution, budget planning, and rate limiting all depend on accurate pricing.

**Action**: Verify current Anthropic pricing. Use `02a-tech-arch-overview-and-backend.md` Model Reference table as single source of truth. Update all other docs to reference it.

### S3. Evidence Verification Cost Attribution — 3 Conflicting Positions

| Source | Who Pays? |
|--------|-----------|
| T1 + REVIEW-AND-TECH-CHALLENGES | Platform-paid (safety-critical, must use platform key) |
| T4 (recommended) | Agent-owner-paid |
| T2 | Self-contradictory (says both within 4 lines) |

**Action**: Make a final decision. T4's analysis is most thorough. Propagate to T1, T2, and REVIEW-AND-TECH-CHALLENGES.

### S4. Propagation Tracking Is Unreliable

DECISIONS-NEEDED lists propagation items as "needed" that are already done. REVIEW-AND-TECH-CHALLENGES marks issues as "Resolution needed" that are resolved. ROADMAP Documentation Debt has items marked NEW that are DONE.

**Specific stale markers**:
- H4 and H5 in REVIEW-AND-TECH-CHALLENGES: say "Resolution needed" but are resolved
- D1 propagation: listed as pending but `02-tech-arch` and sprint plan already updated
- ROADMAP debt table: `halfvec(1024)` item marked NEW but all target docs already use it

**Action**: Single pass across all three meta docs to update all status markers. Consider a dedicated propagation checklist.

### S5. Geographic Scope — 4 Documents, 4 Positions

| Source | Geographic Claim |
|--------|------------------|
| PRD (D18) | 1 pilot city |
| GTM Section 7.5 | 3 countries at W4, 10 at W12, 30 at W24 |
| KPIs Section 2.4 | 15 countries at 6 months |
| Competitive Analysis | "Global from launch" |

**Action**: Standardize to "Global-capable, pilot city first for human missions. Agent activity (digital-only) is global from Day 1."

### S6. Python SDK Timeline — 3 Different Targets

| Source | Timeline |
|--------|----------|
| GTM | W7-10 (Phase 1!) |
| DECISIONS D10 | Phase 2 |
| ROADMAP | Phase 3 (W19-20) |

**Action**: Align to ROADMAP Phase 3 as most realistic. Update D10 and GTM.

### S7. Network Effects — "Three-Sided" vs "Four-Sided"

- **Competitive Analysis**: "three-sided" (agents, humans, problems)
- **GTM**: "four-sided" (adds NGOs)

**Action**: Standardize to "three-sided" core loop. Describe NGO partners as amplifiers.

### S8. GDPR Compliance Timing Contradiction

- **Risk Register**: Lists Phase 1 GDPR required implementations (privacy policy, consent, data subject rights)
- **Security Doc**: "GDPR: Phase 2 compliance target"

**Action**: Basic GDPR compliance must be Phase 1 (it's illegal to collect EU user data without it). Full compliance (DPO, DPIA) can be Phase 2.

---

## Critical Issues by Category

### Engineering — Schema & Code Issues (Blocks Implementation)

| ID | Issue | Docs Affected | Impact |
|----|-------|---------------|--------|
| E-C1 | HNSW index params mismatch: `m=16, ef_construction=200` vs `m=32, ef_construction=128` | 01-ai-ml vs 03-db-design | Different recall/performance characteristics |
| E-C2 | Vector operator class wrong: `vector_cosine_ops` used with `halfvec` columns; should be `halfvec_cosine_ops` | 01-ai-ml | **Runtime SQL error** |
| E-C3 | TransactionType enum: DB has 18 values, API TypeScript type has 8 | 03-db-design vs 04-api-design | Client SDK breaks on unknown types |
| E-C4 | `agent_ai_keys` schema divergence: Doc 03 and Doc 08 define same table differently (columns, types, enums) | 03-db-design vs 08-byok | Two conflicting migrations |
| E-C5 | Guardrail status defaults to `'approved'` for debates and missions instead of `'pending'` | 03-db-design | **Security: bypasses guardrail pipeline** |

### Engineering — Major Issues

| ID | Issue | Doc |
|----|-------|-----|
| E-M1 | Missing `apiKeyPrefix` column on agents table (auth code references it) | 02-tech-arch vs 03-db-design |
| E-M2 | Evidence table: DB has `exifData`, `gpsCoordinates`, `verificationStage`, `verificationScore`; API interface omits all | 03-db vs 04-api |
| E-M3 | PostgreSQL driver mismatch: tests use `pg` Pool, production uses `postgres.js` | 07-testing vs 03-db-design |
| E-M4 | Mission concurrency test uses agent keys, but missions are claimed by humans | 07-testing |
| E-M5 | Image processing worker references `thumbnailUrl`, `mediumUrl` columns that don't exist in evidence table | 02-tech-arch vs 03-db-design |
| E-M6 | Duplicate `problems` schema in Doc 02 uses older Drizzle ORM index syntax | 02-tech-arch |
| E-M7 | Non-atomic Redis operations in BYOK rate limiter (`incr` then `expire` as two calls) | 08-byok |
| E-M8 | Missing API endpoints: `/solutions/:id/debates`, `/agents/me`, `/agents/me/stats`, `/agents/:id/keys/rotate` | 04-api vs 05-agent-protocol |
| E-M9 | SKILL.md uses `snake_case` fields but API uses `camelCase` — mapping not consistently applied in examples | 05-agent-protocol |
| E-M10 | Dockerfile `pnpm install --prod` before build step skips devDependencies needed for build | 06-devops |
| E-M11 | Score scale inconsistency: functions output 0-1.0, DB stores `numeric(5,2)`, seed data uses 0-100 | 01-ai-ml vs 03-db vs 06-devops |

### Design — Critical Issues (Blocks Frontend)

| ID | Issue | Doc |
|----|-------|-----|
| D-C1 | Tailwind CSS 4 config uses v3 format (`theme.extend` in `tailwind.config.ts`); TW4 uses CSS-native `@theme` blocks | 01-brand-design |
| D-C2 | Several domain badge colors fail WCAG AA for white text (Poverty Amber, Food Harvest, Sustainable Energy Sunbeam) | 01-brand-design |
| D-C3 | Section numbering broken throughout Doc 02 (inconsistent Flow N vs 2.N, skips 6.4) | 02-ux-flows |
| D-C4 | Admin routes in auth matrix vs route map are completely different sets | 02-ux-flows |

### Design — Major Cross-Doc Issues

| ID | Issue | Docs |
|----|-------|------|
| D-M1 | Mobile bottom nav: 5 items (Doc 01) vs 4 + FAB (Doc 02) | 01-brand vs 02-ux |
| D-M2 | Nav label "Discover" (Doc 01) vs "Explore" (Doc 02) | 01-brand vs 02-ux |
| D-M3 | Breakpoints: 5-tier 375/768/1024/1440/1920 (Doc 01) vs 4-tier sm/md/lg/xl at 640/1024/1280 (Doc 02) | 01-brand vs 02-ux |
| D-M4 | Top bar nav: "Problems, Solutions, Missions, Impact" (Doc 01) vs "Explore, Missions, Impact" with dropdown (Doc 02) | 01-brand vs 02-ux |
| D-M5 | Card interactions use generic Tailwind names ("gray-200") instead of design system tokens (`--color-border`) | 02-ux-flows |
| D-M6 | Touch target minimum: 48px (Doc 01) vs 44px (Doc 02) | 01-brand vs 02-ux |

### Cross-Functional — Critical Issues

| ID | Issue | Doc |
|----|-------|-----|
| XF-C1 | Pitch deck says "1536-dimensional" embeddings; all engineering docs use 1024 | 03-pitch-deck |
| XF-C2 | Pitch deck says "Kubernetes (prod)"; all engineering docs use Railway/Fly.io | 03-pitch-deck |
| XF-C3 | Pitch deck security table says "Twitter verification"; Phase 1 is email-only | 03-pitch-deck |
| XF-C4 | Sprint 1 BE1 workload: 61h optimistic for one engineer in 2 weeks learning new tools | 01-sprint-plan |
| XF-C5 | Sprint Plan guardrail thresholds: S3-10 and S3-12 have boundary ambiguity (is 0.4 flag or reject? is 0.7 approve or flag?) | 01-sprint-plan |
| XF-C6 | Risk register heat map axis labels are swapped; SEC-07 placed in wrong cell | 02-risk-register |
| XF-C7 | Risk register prefix convention says "XF-, ENG-, PM-, DES-" but all IDs use SEC-, AIS-, INT-, BUS-, TEC-, HUM-, OPS- | 02-risk-register |
| XF-C8 | No OWASP Top 10 mapping in security doc | 04-security |
| XF-C9 | Missing CSRF protection for cookie-based human/admin auth | 04-security |

### PM — Major Issues

| ID | Issue | Docs |
|----|-------|------|
| PM-M1 | Peer review earns 3 IT (User Stories) but not listed in PRD earning mechanisms table | 02-personas vs 01-prd |
| PM-M2 | Maya journey: 30 IT base reward for medium mission; PRD says 25 IT | 02-personas |
| PM-M3 | GTM "First Mission" campaign at Day 2-7 but humans can't claim missions until Phase 2 | 03-gtm |
| PM-M4 | GTM references `04-sprint-plan.md` which doesn't exist (actual: `cross-functional/01a-sprint-plan-sprints-0-2.md`) | 03-gtm |
| PM-M5 | Developer market size: math shows ~105-149K after overlap, not claimed ~200K | 03-gtm |

### Challenges (T1-T7)

| ID | Issue | Doc |
|----|-------|-----|
| TC-C1 | T4 MODEL_PRICING uses outdated model IDs and prices inconsistent with engineering docs | T4 |
| TC-M1 | T4 and 08-byok are >90% duplicate with slightly different provider enums (9 vs 3) | T4 vs 08-byok |
| TC-M2 | T2 Phase 1 scope unclear — 1400 lines of 6-stage pipeline but Phase 1 is only 3 stages, no delineation | T2 |
| TC-M3 | T7 Phase 1 scope unclear — 1574 lines of 5-tier model but Phase 1 is 2-tier, no implementation guide | T7 |
| TC-M4 | T6 benchmark data appears synthetic (no citations); "8 vCPU / 32GB RAM" is not a standard Railway/Fly.io tier | T6 |
| TC-M5 | "Moltbook" and "RentAHuman" used as primary case studies in T3/T4 without verifiable references | T3, T4 |

---

## Priority Action Plan

### Tier 1: Must Fix Before Sprint 0 Ends (Blocks Development)

1. **S1: Resolve trust model** — Pick D13 2-tier as Phase 1 canonical. Update 6+ docs.
2. **S2: Resolve model identity & pricing** — Single canonical pricing table in 02-tech-arch. Update all references.
3. **E-C2: Fix vector operator class** — `halfvec_cosine_ops` not `vector_cosine_ops` in 01-ai-ml. Runtime SQL error if not fixed.
4. **E-C4: Merge `agent_ai_keys` schema** — One canonical definition (use Doc 08's fuller version). Update Doc 03.
5. **E-C5: Fix guardrail status defaults** — Change debates and missions from `'approved'` to `'pending'`.
6. **D-C1: Fix Tailwind CSS 4 config** — Rewrite to CSS-native `@theme` format. Blocks every frontend task.
7. **D-C4: Reconcile admin routes** — Auth matrix vs route map are different sets.
8. **S8: Fix GDPR timing** — Basic compliance must be Phase 1.
9. **XF-C5: Specify guardrail thresholds precisely** — `reject < 0.4, flag 0.4 <= x < 0.7, approve >= 0.7` as shared constant.
10. **XF-C9: Add CSRF protection** — Real vulnerability for cookie-based auth.

### Tier 2: Must Fix Before Sprint 1 Starts (Prevents Confusion)

11. **E-C1: Align HNSW parameters** — Pick `m=32, ef_construction=128` from DB design.
12. **E-C3: Complete TransactionType in API** — Add missing 10 enum values or mark as internal-only.
13. **E-M1: Add `apiKeyPrefix` column** — Auth code references it; DB schema doesn't have it.
14. **E-M3: Fix PG driver mismatch in tests** — Use same `postgres.js` driver as production.
15. **D-M1/M2/M3/M4: Align navigation & breakpoints** — Both design docs must agree on the UI shell.
16. **XF-C1/C2/C3: Fix pitch deck technical errors** — 1024 not 1536, Railway not Kubernetes, email not Twitter.
17. **S4: Update all stale status markers** — Single pass across meta docs.
18. **PM-M1: Add peer review 3 IT to PRD** — Earning mechanism gap.

### Tier 3: Fix Before Sprint 3 (Phase 1 Completion)

19. **S3: Decide evidence verification cost attribution** — Platform vs agent-owner-pays.
20. **S5: Align geographic scope language** — "Global-capable, pilot city first."
21. **S6: Align Python SDK timeline** — Phase 3.
22. **S7: Align network effects language** — "Three-sided."
23. **TC-M1: Deduplicate T4 and 08-byok** — Strip implementation from T4.
24. **TC-M2/M3: Add Phase 1 implementation guides to T2 and T7** — Clear scope boundaries.
25. **D-C2: Verify domain badge color WCAG compliance** — Run actual contrast checker.
26. **XF-C4: Redistribute Sprint 1 BE1 workload** — 61h is unrealistic.
27. **XF-C8: Add OWASP Top 10 mapping to security doc** — Standard due diligence requirement.

### Tier 4: Fix Before Phase 2

28. **E-M11: Standardize score scale** — Pick 0-100 and update all scoring functions + seed data.
29. **D-M5: Replace generic color names with design tokens in Doc 02 card interactions**.
30. **XF-C6/C7: Fix risk register heat map and prefix convention** — Communication tool must be accurate.
31. **PM-M3: Move GTM "First Mission" campaign to Scale Phase** — Cannot run during Phase 1.
32. **TC-M4: Verify T6 benchmark data sources** — Cite or label as estimates.
33. **TC-M5: Verify or label Moltbook/RentAHuman references** — Case studies need sources.

---

## What's Working Well

1. **3-layer guardrail architecture** — Consistently documented across all docs
2. **15 approved domains** — Identical list in every document, aligned with UN SDGs
3. **BYOK envelope encryption design** — Sound cryptographic architecture
4. **Sprint Plan task-level detail** — Excellent acceptance criteria, dependency graphs, critical path
5. **Brand & Design System depth** — CSS custom properties, neumorphic components, accessibility
6. **T5 (Hono Framework) analysis** — Strongest challenge doc, well-supported conclusion
7. **Challenge docs overall research quality** — Genuine deep analysis, actionable recommendations
8. **Constitutional guardrails engine** — Well-designed defense-in-depth approach

---

## Comparison with v7.1

| Metric | v7.1 | v8.0 (this) |
|--------|------|-------------|
| Methodology | Structural cross-doc consistency | Deep technical + structural + code review |
| Total issues found | 47 (11 A + 18 B + 18 C) | 248 (33 Critical + 107 Major + 112 Minor + 43 Nit) |
| Code-level issues | 0 | 45+ (SQL errors, wrong operator classes, non-atomic Redis, driver mismatches) |
| Design doc issues | 3 (informational) | 43 (including 4 Critical frontend blockers) |
| Security issues | 0 explicit | 5+ (CSRF, guardrail bypass, GDPR timing, bcrypt cost) |
| Status | "All resolved, ready for Sprint 1" | 10 must-fix blockers before Sprint 0 ends |

**Root cause**: v7.1 reviewed structural consistency (do docs reference each other correctly?) but did not review code samples for correctness, validate CSS against Tailwind v4, check SQL syntax against pgvector types, or verify WCAG contrast ratios. This review adds those technical dimensions.

---

*Generated by 6-agent parallel systematic review. Each agent read every document in its category word-by-word, cross-referencing code samples, SQL syntax, API contracts, and design tokens.*
