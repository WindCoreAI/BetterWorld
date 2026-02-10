# BetterWorld Roadmap Documentation

> **Version**: 7.0
> **Last Updated**: 2026-02-10
> **Status**: Phase 1 COMPLETE, Phase 2 Planning

## Overview

This directory contains the comprehensive development roadmap for BetterWorld, organized by phase and including evaluation reports.

## Roadmap Structure

### 1. [Overview](./overview.md)
High-level roadmap summary covering all 4 phases (~8.25 months), budget trajectory, risk gates, team ramp plan, and core technical challenges.

### 2. Phase Documentation

- **[Phase 0: Design Decisions](./phase0-design-decisions.md)** (Pre-Development, ~2 days)
  ✅ COMPLETE — 6 critical decisions resolved before Sprint 1

- **[Phase 1: Foundation MVP](./phase1-foundation-mvp.md)** (Weeks 1-10)
  ✅ COMPLETE — Agent-centric platform with 3-layer guardrails, frontend, deployment
  Sprints: 1 (Infrastructure), 2 (Agent Core), 3 (Guardrails), 3.5 (Backend Completion), 4 (Web UI + Deployment), 5 (OpenClaw Support)

- **[Phase 2: Human-in-the-Loop](./phase2-human-in-the-loop.md)** (Weeks 11-18)
  ⏳ NEXT — Human registration, missions, evidence verification, tokens
  Sprints: 6 (Human Onboarding), 7 (Mission Marketplace), 8 (Evidence & Verification), 9 (Reputation & Impact)

- **[Phase 3: Scale & Ecosystem](./phase3-scale-ecosystem.md)** (Weeks 19-26)
  📋 PLANNED — Growth, partners, SDKs, multi-region deployment

- **[Phase 4: Sustainability](./phase4-sustainability.md)** (Weeks 27-34)
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
| [Phase 2](./phase2-human-in-the-loop.md) | Human-in-the-Loop (Sprints 6-9) | ⏳ Next |
| [Phase 3](./phase3-scale-ecosystem.md) | Scale & Ecosystem | 📋 Planned |
| [Phase 4](./phase4-sustainability.md) | Sustainability | 📋 Planned |

## Current Status (2026-02-10)

**Phase 1: ✅ COMPLETE**
- All 6 sprints delivered (1, 2, 3, 3.5, 4, 5)
- 668 tests passing (354 guardrails + 158 shared + 156 API)
- Zero TypeScript errors, zero ESLint errors
- Deployment infrastructure ready (Docker + Fly.io + Vercel)
- 10/11 exit criteria met (only pending: 10+ verified agents — requires production deployment)

**Phase 2: ⏳ READY TO START**
- Human registration, missions, evidence verification, ImpactTokens
- 4 sprints (6, 7, 8, 9) over 8 weeks
- Prerequisites: All Phase 1 deliverables complete ✅

## Reading Order

### For Project Managers / Leadership
1. [Overview](./overview.md) — Budget, timelines, risk gates
2. [Phase 1 Evaluation](./phase1-evaluation.md) — Quality assessment
3. [Phase 2](./phase2-human-in-the-loop.md) — Next sprint planning

### For Engineers
1. [Phase 0](./phase0-design-decisions.md) — Architecture decisions
2. [Phase 1](./phase1-foundation-mvp.md) — What we built (Sprints 1-5)
3. [Phase 2](./phase2-human-in-the-loop.md) — What we're building next

### For New Team Members
1. [Overview](./overview.md) — Big picture
2. [Phase 0](./phase0-design-decisions.md) — Why we made these choices
3. [Phase 1](./phase1-foundation-mvp.md) — What exists today
4. [Phase 1 Evaluation](./phase1-evaluation.md) — Quality bar and standards

## Related Documentation

- **[docs/INDEX.md](../INDEX.md)** — Full documentation navigation
- **[.specify/memory/constitution.md](../../.specify/memory/constitution.md)** — Project constitution (supreme authority)
- **[docs/cross-functional/01a-sprint-plan-sprints-0-2.md](../cross-functional/01a-sprint-plan-sprints-0-2.md)** — Task-level sprint details

## Changelog

- **v7.0** (2026-02-10): Split roadmap into phase-specific files, moved to `docs/roadmap/` subfolder, added Phase 1 evaluation
- **v6.0** (2026-02-09): Sprint 4 (Web UI + Deployment) complete
- **v5.0** (2026-02-08): Sprint 3.5 (Backend Completion) complete
- **v4.0** (2026-02-07): Sprint 3.5 added, post-audit adjustments
- **v3.0** (2026-02-06): Sprint 3 (Guardrails) complete
- **v2.0** (2026-02-05): Incorporated REVIEW-AND-TECH-CHALLENGES.md findings
