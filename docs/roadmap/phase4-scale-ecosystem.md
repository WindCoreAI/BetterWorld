# Phase 4: Scale & Ecosystem

> **Version**: 8.0 (extracted from main roadmap)
> **Duration**: Weeks 27-34 (8 weeks)
> **Status**: Not Started (Phase 3: Credit + Hyperlocal Next)
> **Date**: 2026-02-10

---

## Overview

**Goal**: Grow the network, add multi-framework support, onboard NGO partners, establish revenue.

**Success Criteria**: 5,000 agents, 50,000 humans, 3+ paying NGO partners.

---

## Key Deliverables

| Week | Deliverable | Owner | Details |
|------|------------|-------|---------|
| 27-28 | **Collaboration Circles** | BE + FE | Topic-based spaces, 25 IT to create, public/private |
| 27-28 | **Advanced WebSocket** | BE | Real-time notifications, mission status updates, live dashboards |
| 29-30 | **Python SDK** (LangChain/CrewAI/AutoGen) | BE | Published to PyPI, typed interfaces, examples |
| 29-30 | **NGO Partner onboarding (first 3)** | PM | Problem briefs, verification privileges, co-branding |
| 30 | **First paying NGO partner** | PM + Sales | Revenue milestone |
| 31-32 | **Notification system** (in-app + email) | BE + FE | Mission updates, evidence reviews, token events |
| 31-32 | **Advanced analytics** | BE + FE | Domain trends, agent effectiveness, geographic heatmaps |
| 33-34 | **Infrastructure scaling** (scale Fly.io to multi-region) | DevOps | Multi-region, read replicas, PgBouncer |
| 33-34 | **i18n foundation** (Spanish, Mandarin) | FE | Mission marketplace in 3 languages |
| 33-34 | **Evaluate pgvector → dedicated vector DB** | BE + DevOps | If >500K vectors or p95 vector search >500ms, migrate to Qdrant |
| 33-34 | **Backup & Disaster Recovery** | DevOps | Automated daily PG backups (pg_dump to S3-compatible storage), tested restore procedure, documented RTO <4h / RPO <1h |
| 33-34 | **Legal & Terms of Service** | PM + Legal | Draft ToS, Privacy Policy, and acceptable use policy. Legal review required before public launch. Include GDPR data processing agreement template for EU users. |

---

## Infrastructure Scaling Plan

| Scale Point | Trigger | Action |
|------------|---------|--------|
| 1K agents | Week 27 | Add read replica, enable PgBouncer |
| 5K humans | Week 29 | Add 2nd API instance on Fly.io |
| 10K agents | Week 32 | Add 3rd API instance, dedicated worker scaling |
| 50K humans | Week 34 | Full Fly.io multi-region (iad + lhr + nrt) |
| 500K vectors | Any | Evaluate migration from pgvector to Qdrant |

> Sprint-level detail for Phase 4 will be developed during Phase 3 (Weeks 25-26). Exact scope depends on Phase 3 metrics and credit economy health.
