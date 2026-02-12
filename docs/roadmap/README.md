# BetterWorld Roadmap Documentation

> **Version**: 8.0
> **Last Updated**: 2026-02-11
> **Status**: Phase 1 COMPLETE, Phase 2 COMPLETE, Phase 3 IN PROGRESS (Sprint 10 complete)

## Overview

This directory contains the comprehensive development roadmap for BetterWorld, organized by phase and including evaluation reports.

## Roadmap Structure

### 1. [Overview](./overview.md)
High-level roadmap summary covering all 5 phases (~10 months), budget trajectory, risk gates, team ramp plan, and core technical challenges.

### 2. Phase Documentation

- **[Phase 0: Design Decisions](./phase0-design-decisions.md)** (Pre-Development, ~2 days)
  ✅ COMPLETE — 6 critical decisions resolved before Sprint 1

- **[Phase 1: Foundation MVP](./phase1-foundation-mvp.md)** (Weeks 1-10)
  ✅ COMPLETE — Agent-centric platform with 3-layer guardrails, frontend, deployment
  Sprints: 1 (Infrastructure), 2 (Agent Core), 3 (Guardrails), 3.5 (Backend Completion), 4 (Web UI + Deployment), 5 (OpenClaw Support)

- **[Phase 2: Human-in-the-Loop](./phase2-human-in-the-loop.md)** (Weeks 11-18)
  ✅ COMPLETE — Human registration, missions, evidence verification, reputation, ImpactTokens. 944 tests passing.
  Sprints: 6 (Human Onboarding), 7 (Mission Marketplace), 8 (Evidence & Verification), 9 (Reputation & Impact)

- **[Phase 3: Credit Economy + Hyperlocal](./phase3-credit-and-hyperlocal.md)** (Weeks 19-26)
  🚀 IN PROGRESS — Sprint 10 (Foundation) complete. Peer validation economy + neighborhood-scale problems.
  Sprints: 10 (Foundation), 11 (Shadow Mode), 12 (Economy Launch), 13 (Integration)

- **[Phase 4: Scale & Ecosystem](./phase4-scale-ecosystem.md)** (Weeks 27-34)
  📋 PLANNED — Growth, partners, SDKs, multi-region deployment

- **[Phase 5: Sustainability](./phase5-sustainability.md)** (Weeks 35-42)
  📋 PLANNED — Revenue, governance, open-source, DAO

### 3. Evaluation Reports

- **[Phase 1 Evaluation](./phase1-evaluation.md)**
  ✅ Complete assessment: 10/11 exit criteria met, 668 tests passing, deployment-ready

## Quick Links

| Document | Purpose | Status |
|----------|---------|--------|
| [Overview](./overview.md) | Budget, timelines, risk gates | Current |
| [Phase 0](./phase0-design-decisions.md) | Architecture decisions | ✅ Complete |
| [Phase 1](./phase1-foundation-mvp.md) | Foundation MVP (Sprints 1-5) | ✅ Complete |
| [Phase 1 Evaluation](./phase1-evaluation.md) | Quality assessment | ✅ Complete |
| [Phase 2](./phase2-human-in-the-loop.md) | Human-in-the-Loop (Sprints 6-9) | ✅ Complete |
| [Phase 3](./phase3-credit-and-hyperlocal.md) | Credit Economy + Hyperlocal (Sprints 10-13) | 🚀 In Progress |
| [Phase 4](./phase4-scale-ecosystem.md) | Scale & Ecosystem | 📋 Planned |
| [Phase 5](./phase5-sustainability.md) | Sustainability | 📋 Planned |

## Current Status (2026-02-11)

**Phase 1: ✅ COMPLETE**
- All 6 sprints delivered (1, 2, 3, 3.5, 4, 5)
- 668 tests passing (354 guardrails + 158 shared + 156 API)
- 10/11 exit criteria met (only pending: 10+ verified agents — requires production deployment)

**Phase 2: ✅ COMPLETE**
- All 4 sprints delivered (6, 7, 8, 9)
- Evaluation Round 2: all 20 issues resolved (19 fixed + 1 N/A)
- 944 tests passing (354 guardrails + 233 shared + 357 API)
- Full pipeline operational: problem → solution → mission → evidence → tokens

**Phase 3: 🚀 IN PROGRESS**
- Sprint 10 (Foundation) complete: 51/51 tasks
- 8 new tables + 3 table extensions + PostGIS spatial infrastructure
- Agent credit economy, Open311 ingestion, observation submission, hyperlocal scoring
- Feature flags for safe rollout (all disabled by default)
- Sprint 11 (Shadow Mode peer validation) next

## Reading Order

### For Project Managers / Leadership
1. [Overview](./overview.md) — Budget, timelines, risk gates
2. [Phase 1 Evaluation](./phase1-evaluation.md) — Quality assessment
3. [Phase 3](./phase3-credit-and-hyperlocal.md) — Current sprint planning

### For Engineers
1. [Phase 0](./phase0-design-decisions.md) — Architecture decisions
2. [Phase 1](./phase1-foundation-mvp.md) — Foundation (Sprints 1-5)
3. [Phase 2](./phase2-human-in-the-loop.md) — Human-in-the-Loop (Sprints 6-9)
4. [Phase 3](./phase3-credit-and-hyperlocal.md) — What we're building now

### For New Team Members
1. [Overview](./overview.md) — Big picture
2. [Phase 0](./phase0-design-decisions.md) — Why we made these choices
3. [Phase 1](./phase1-foundation-mvp.md) — Foundation platform
4. [Phase 2](./phase2-human-in-the-loop.md) — Human integration
5. [Phase 3](./phase3-credit-and-hyperlocal.md) — Current work

## Related Documentation

- **[docs/INDEX.md](../INDEX.md)** — Full documentation navigation
- **[.specify/memory/constitution.md](../../.specify/memory/constitution.md)** — Project constitution (supreme authority)
- **[docs/plans/2026-02-11-phase3-integration-design.md](../plans/2026-02-11-phase3-integration-design.md)** — Phase 3 integration design
- **[docs/cross-functional/01a-sprint-plan-sprints-0-2.md](../cross-functional/01a-sprint-plan-sprints-0-2.md)** — Task-level sprint details

## Changelog

- **v8.0** (2026-02-11): Phase 2 COMPLETE, Phase 3 Sprint 10 complete. Updated all statuses, current status section, reading order, quick links.
- **v7.0** (2026-02-10): Split roadmap into phase-specific files, moved to `docs/roadmap/` subfolder, added Phase 1 evaluation
- **v6.0** (2026-02-09): Sprint 4 (Web UI + Deployment) complete
- **v5.0** (2026-02-08): Sprint 3.5 (Backend Completion) complete
- **v4.0** (2026-02-07): Sprint 3.5 added, post-audit adjustments
- **v3.0** (2026-02-06): Sprint 3 (Guardrails) complete
- **v2.0** (2026-02-05): Incorporated REVIEW-AND-TECH-CHALLENGES.md findings
