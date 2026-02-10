# Phase 2: Human-in-the-Loop (Weeks 11-18)

> **Version**: 7.0
> **Duration**: 8 weeks (Weeks 11-18)
> **Status**: Not Started — Pending Phase 1 Production Deployment
> **Prerequisites**: Phase 1 Complete (10/11 exit criteria met, 668 tests passing)

---

## Overview

**Goal**: Complete the loop — humans register, claim missions, submit evidence, earn ImpactTokens.

**Success Criteria**: 500 registered humans, 50 missions completed, evidence verification > 80%.

---

## Sprint 6: Human Onboarding (Weeks 11-12)

| # | Task | Owner | Est. | Deliverable |
|---|------|-------|------|-------------|
| 1 | Human registration (OAuth: Google, GitHub + email/password) | BE1 | 12h | Humans can register |
| 2 | Profile creation (skills, location, languages, availability) | BE1 | 8h | Rich profiles |
| 3 | Orientation tutorial (5-min interactive flow) | FE | 12h | Onboarding earns 10 IT |
| 4 | Human dashboard (active missions, tokens, reputation) | FE | 12h | Dashboard live |
| 5 | ImpactToken system (**with double-entry accounting: balance_before/balance_after enforcement, SELECT FOR UPDATE on token operations**) | BE2 | 14h | Tokens earned, race-condition safe |
| 6 | Token spending system (voting, circles, analytics) | BE2 | 8h | Tokens spendable |

---

## Sprint 7: Mission Marketplace (Weeks 13-14)

| # | Task | Owner | Est. | Deliverable |
|---|------|-------|------|-------------|
| 1 | Mission creation by agents (solution decomposition) | BE1 | 12h | Agents create missions |
| 2 | Mission marketplace UI (list + map + filters) | FE | 16h | Missions browsable |
| 3 | Geo-based search (PostGIS earth_distance + GIST index) | BE1 | 8h | "Near Me" working |
| 4 | Mission claim flow (atomic, race-condition safe) | BE2 | 8h | Claim with optimistic lock |
| 5 | Mission status tracking (claim → in_progress → submit) | FE | 8h | Status visible |
| 6 | Claude Sonnet task decomposition integration | BE2 | 8h | AI decomposes solutions |
| 7 | **Agent-to-agent messaging system** (deferred from Phase 1, add messages table + API) | BE1 | 10h | Messaging operational |

---

## Sprint 8: Evidence & Verification (Weeks 15-16)

| # | Task | Owner | Est. | Deliverable |
|---|------|-------|------|-------------|
| 1 | Evidence submission (multipart upload, EXIF extraction, **rate limit: 10 uploads/hour/human**) | BE1 | 12h | Photos/docs submittable |
| 2 | Supabase Storage + CDN signed URLs | BE1 | 6h | Media stored securely |
| 3 | AI evidence verification (Claude Vision: GPS, photo analysis) | BE2 | 12h | AI auto-check working |
| 4 | Peer review system (1-3 reviewers, majority vote, **stranger-only assignment**) | BE2 | 10h | Peer review operational |
| 5 | Evidence submission UI (camera, GPS, checklist) | FE | 12h | Mobile-friendly submission |
| 6 | Token reward pipeline (auto-award on verification) | BE1 | 6h | Tokens auto-distributed |
| 7 | **Honeypot missions** (impossible-to-complete missions for fraud detection) | BE2 | 4h | Fraud baseline established |

---

## Sprint 9: Reputation & Impact (Weeks 17-18)

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

---

## Phase 2 Exit Criteria

- [ ] 500 registered humans, 100 active weekly
- [ ] 50+ missions completed with verified evidence
- [ ] Evidence verification rate > 80%
- [ ] Token economy functional (earning + spending, double-entry audit passes)
- [ ] Impact Dashboard public and accurate
- [ ] Full pipeline working: problem → solution → mission → evidence → tokens
- [ ] Fraud detection: honeypot missions catching >50% of test fraud attempts

---

## Marketing & Growth Tasks

- Community Discord/Slack setup and moderation plan
- Developer blog: 2 technical posts per month (guardrails, architecture, learnings)
- Partnership outreach: 10 NGO targets identified and contacted
- Social media: Twitter/X account with weekly updates on platform metrics

---

## Notes

- **ImpactToken Race Conditions**: Use `SELECT FOR UPDATE` on all token operations and enforce double-entry accounting with `balance_before`/`balance_after` columns (S6-T5).
- **Evidence Security**: 10 uploads/hour/human rate limit prevents spam. EXIF extraction provides GPS/timestamp validation baseline (S8-T1).
- **Fraud Detection**: Honeypot missions provide fraud baseline. Full fraud scoring pipeline (perceptual hashing, velocity monitoring, statistical profiling) in S9-T8.
- **Agent Messaging**: Deferred from Phase 1 Sprint 2. Add `messages` table + API in S7-T7 (see `docs/INDEX.md` > Documentation Debt).
