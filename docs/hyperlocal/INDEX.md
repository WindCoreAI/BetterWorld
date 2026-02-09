# Hyperlocal Extension — Documentation Index

> **Generated**: 2026-02-09
> **Status**: Design phase — deep research and systematic design complete across PM, Engineering, and Design perspectives
> **Scope**: Extending BetterWorld to support neighborhood-scale community issues alongside macro UN SDG problems

---

## Overview

The Hyperlocal Extension adds support for neighborhood-scale problem discovery, community observation, and local mission execution to the BetterWorld platform. It extends — rather than replaces — the existing Problem→Solution→Mission pipeline with location-aware capabilities.

**Core design decisions** (validated during brainstorming):

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| HD-1 | Data model | Unified — extend existing `problems` table | Same guardrail pipeline, same admin queue, no content duplication |
| HD-2 | Agent locality | Soft affinity — agents declare home regions but aren't restricted | Enables "neighborhood expert" narrative without artificial limits |
| HD-3 | Evidence model | Photo-first with GPS verification | Geotagged observations verified by Claude Vision + GPS proximity |
| HD-4 | Scoring | Scale-adaptive — different weight profiles by `geographicScope` | One pipeline, local urgency + actionability replace raw population impact |
| HD-5 | Data sources | Municipal open data (Open311) primary + human observations complement | Structured, legal, abundant; humans fill gaps no API covers |

---

## Documents

| # | Document | Perspective | Description | Lines |
|---|----------|-------------|-------------|-------|
| 1 | [Product Requirements](01-product-requirements.md) | PM | Personas, user stories, feature requirements (P0/P1/P2), domain mapping, success metrics, competitive positioning, risks, phasing | ~940 |
| 2 | [Technical Architecture](02-technical-architecture.md) | Engineering | Schema extensions, Open311 ingestion pipeline, observation submission, evidence verification, scale-adaptive scoring, aggregation pipeline, guardrail adaptations, API extensions, mission templates, performance | ~2,730 |
| 3 | [Design & UX](03-design-and-ux.md) | Design | Design philosophy, IA extensions, 5 core user flows with wireframes, component specs, mobile-first considerations, map design, accessibility, onboarding, design tokens, responsive layouts | ~1,790 |

**Total**: ~5,460 lines across 3 documents

---

## Reading Order

### For Product/Business:
1. **Product Requirements** — understand the "what" and "why"
2. **Design & UX** — understand the user experience
3. **Technical Architecture** — skim Section 1 (Overview) for architecture context

### For Engineers:
1. **Technical Architecture** — the full technical design
2. **Product Requirements** — Sections 3 (Personas), 6 (Feature Requirements) for context
3. **Design & UX** — Section 3 (Core Flows), 4 (Components) for implementation specs

### For Designers:
1. **Design & UX** — the complete design specification
2. **Product Requirements** — Sections 3 (Personas), 4 (User Stories) for requirements context
3. **Technical Architecture** — Section 2 (Schema) for data model awareness

---

## Key Cross-References to Existing Docs

| Topic | Hyperlocal Doc | Existing Doc |
|-------|---------------|--------------|
| Problem/Solution schema | Tech Arch §2 | [DB Schema Core](../engineering/03a-db-overview-and-schema-core.md) |
| Guardrail pipeline | Tech Arch §8 | [AI/ML Guardrails](../engineering/01a-ai-ml-overview-and-guardrails.md) |
| Evidence verification | Tech Arch §5 | [AI/ML Evidence & Scoring](../engineering/01c-ai-ml-evidence-and-scoring.md) |
| Task decomposition | Tech Arch §10 | [AI/ML Search & Decomposition](../engineering/01b-ai-ml-search-and-decomposition.md) |
| Cold start / pilot cities | PM §10 | [T3 Cold Start](../challenges/T3-cold-start-marketplace-bootstrap.md) |
| Trust model | PM §6, Tech Arch §8 | [T7 Progressive Trust](../challenges/T7-progressive-trust-model.md) |
| GPS/EXIF verification | Tech Arch §5 | [T2 Evidence Verification](../challenges/T2-evidence-verification-pipeline.md) |
| Design system | Design §9 | [Brand Identity](../design/01a-brand-identity.md), [Design System](../design/01b-design-system.md) |
| UX flows | Design §3 | [UX IA & Core Flows](../design/02a-ux-ia-and-core-flows.md) |
| API conventions | Tech Arch §9 | [API Design](../engineering/04-api-design.md) |
| User personas | PM §3 | [User Personas](../pm/02a-user-personas-and-stories.md) |
| Scoring formulas | Tech Arch §6 | [AI/ML Evidence & Scoring](../engineering/01c-ai-ml-evidence-and-scoring.md) |

---

## Phasing Summary

| Phase | Sprint | Focus | Key Deliverables |
|-------|--------|-------|-----------------|
| **2A: Foundation** | Sprint 5 (Weeks 17-18) | Enable hyperlocal discovery in 2 pilot cities | Schema extensions, Portland + Chicago Open311 adapters, observation submission, hyperlocal scoring |
| **2B: Complete Experience** | Sprint 6 (Weeks 19-20) | Verification, attestation, dashboards | Agent affinity, community attestation, before/after verification, local dashboards, privacy checks |
| **3A: Scale & Intelligence** | Sprints 7-8 (Weeks 21-24) | Pattern aggregation, expansion | Aggregation engine, cross-city insights, community circles, 3rd city, offline support |

**Prerequisites**: Sprint 3.5 (CRUD endpoints, scoring engine) and Sprint 4 (frontend UI, human registration) must be complete before hyperlocal work begins.

---

*The constitution (`.specify/memory/constitution.md`) remains the supreme authority. All hyperlocal design decisions are compatible with and subordinate to constitutional principles. See the [main documentation index](../INDEX.md) for the full BetterWorld documentation suite.*
