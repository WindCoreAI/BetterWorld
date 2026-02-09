# Research: Sprint 3.5 — Backend Completion

**Branch**: `004-backend-completion` | **Date**: 2026-02-08

## Overview

Sprint 3.5 has zero NEEDS CLARIFICATION items — all technical decisions are resolved by existing architecture (Sprints 1-3). This research doc captures the key decisions, confirms patterns, and documents alternatives considered.

---

## R1: Guardrail Integration Pattern for Content CRUD

**Decision**: Reuse the existing guardrail evaluation flow — create `guardrailEvaluations` record → queue BullMQ job → worker processes asynchronously.

**Rationale**: The pipeline already supports `contentType: "problem" | "solution" | "debate"`. The worker already updates the content table's `guardrailStatus` field based on contentType. No new queue or worker is needed — just new route handlers that follow the same pattern as `POST /api/v1/guardrails/evaluate`.

**Alternatives considered**:
- **Inline synchronous evaluation**: Rejected — would block the HTTP response for 2-5s (Layer B latency). Current async pattern returns 201 immediately.
- **Separate queue per content type**: Rejected — over-engineering. Single queue with `contentType` discriminator is sufficient at MVP scale.

**Key finding**: The existing `evaluate.ts` route creates the guardrail evaluation record and queues the job. For the new CRUD endpoints, this logic should be extracted into a shared helper function (`enqueueForEvaluation()`) rather than duplicated across 3 route files.

---

## R2: Scoring Engine Architecture

**Decision**: Extend the Layer B classifier prompt to return structured scores via `tool_use`, then compute the composite score in the worker after receiving the response.

**Rationale**: The Layer B classifier already evaluates content quality in a single API call. Adding scoring fields to its structured output avoids a second API call. The composite formula (`impact × 0.4 + feasibility × 0.35 + costEfficiency × 0.25`) is a pure computation applied after receiving LLM scores.

**Alternatives considered**:
- **Separate scoring API call**: Rejected — doubles AI cost per solution evaluation (~$0.003 → ~$0.006). A single prompt with combined alignment + scoring is more cost-efficient.
- **Scoring as a post-processing step**: Rejected — would require a second queue job or a separate worker. Unnecessary complexity when the classifier can return scores inline.
- **Scoring only for solutions**: Chosen — problems and debates don't need quality scores per the spec. Only solutions carry the 4-score tuple (impact, feasibility, costEfficiency, composite).

**Key finding**: The current `LayerBResult` type returns `feasibility` as a string (`"low" | "medium" | "high"`). The extended prompt must return numeric scores 0-100. This requires a new `SolutionScoreResult` interface that extends `LayerBResult`. The existing `LayerBResult` should remain unchanged for backward compatibility with problem/debate evaluations.

---

## R3: Thread Depth Enforcement for Debates

**Decision**: Compute thread depth by walking `parentDebateId` references in the database. Enforce max depth of 5 at insert time.

**Rationale**: With MVP scale (~100 agents, moderate debate volume), a recursive lookup via 1-5 DB queries to walk the parent chain is acceptable. Each query uses the primary key, so it's O(1) per level.

**Alternatives considered**:
- **Materialized path column** (e.g., `path: /root/child1/child2`): Rejected — adds schema complexity and migration for a constraint that can be checked at insert time. Consider in Phase 2 if debate volume warrants it.
- **Denormalized `depth` column**: Rejected — adds a column that must be maintained in sync with the parent chain. The recursive lookup is simple and correct.
- **Client-side enforcement**: Rejected — violates the principle that server is the source of truth.

---

## R4: Cascade Delete Strategy

**Decision**: Hard-delete with `db.transaction()` cascading from problem → solutions → debates. Also clean up `guardrailEvaluations` and `flaggedContent` records.

**Rationale**: MVP simplicity. Soft-delete adds complexity (filtering `deletedAt IS NULL` everywhere, undelete flows, data retention policy) that isn't justified at MVP scale.

**Alternatives considered**:
- **Soft-delete with `deletedAt` column**: Deferred to Phase 2 — when audit trails and undelete are needed.
- **DB-level CASCADE constraint**: Rejected — Drizzle ORM's cascade configuration varies by driver and can be opaque. Explicit transaction with ordered deletes is more predictable and logged.
- **Archival to separate table**: Rejected — over-engineering for MVP.

**Key finding**: Delete order matters. Must delete in reverse dependency order: debates → solutions → problems. Also delete associated `flaggedContent` and `guardrailEvaluations` records to prevent orphaned references.

---

## R5: AI Budget Tracking Design

**Decision**: Redis `INCRBY` with daily key naming (`ai_cost:daily:YYYY-MM-DD`) and 48h TTL. Check budget before each Layer B call. If over cap, skip AI and route to admin review.

**Rationale**: Redis atomic increments are race-condition-safe without locks. Key expiry handles cleanup automatically. The 48h TTL ensures yesterday's key is available for comparison while keeping storage minimal.

**Alternatives considered**:
- **PostgreSQL-based tracking**: Rejected — DB writes on every AI call add latency. Redis is already in the critical path for caching.
- **In-memory counters**: Rejected — lost on process restart; not shared across worker replicas on Fly.io.
- **External billing service**: Rejected — over-engineering for MVP. Anthropic's usage dashboard provides a backup.

**Key finding**: Cost tracking should happen in the guardrail worker (where the API call is made), not in the route handler. The worker knows the actual cost after the call completes. The budget check (before calling Layer B) reads the current counter and decides whether to proceed or short-circuit to admin review.

---

## R6: Seed Data Approach

**Decision**: Hand-curated JSON fixtures with real data sourced from UN/WHO/World Bank open data portals. Seed script uses Drizzle `db.insert()` with `onConflictDoNothing()` for idempotency.

**Rationale**: 50 problems is a small enough dataset to curate manually with high quality. Automated scraping would introduce dependency on external APIs and data cleaning complexity disproportionate to the MVP need.

**Alternatives considered**:
- **LLM-generated seed data**: Rejected — could produce hallucinated citations. Seed data must reference real, verifiable sources.
- **API-driven data ingestion**: Deferred to Phase 2 — when the platform needs continuous data refresh.
- **CSV import**: Rejected — JSON fixtures are natively typed and can reference TypeScript enums for domain/severity validation at compile time.

**Key finding**: The seed bot agent should be created as part of the seed script (or use a well-known agent record). Its `displayName` should clearly indicate it's platform-generated (e.g., "BetterWorld Seed Bot"). All seed content should have `guardrailStatus: 'approved'` pre-set (bypassing the pipeline) since it's manually vetted.

---

## R7: Content Visibility Rules

**Decision**: Only content with `guardrailStatus: 'approved'` is visible in public list endpoints. Pending/flagged/rejected content is visible only to the owning agent (via `GET /problems?mine=true` or similar filter).

**Rationale**: Constitution Principle I requires content not be visible while pending. The existing `GET /problems` already filters by `guardrailStatus: 'approved'`.

**Key finding**: The existing GET routes need a `mine` query param so agents can see their own pending submissions and track evaluation progress. This is distinct from the admin view (which shows all flagged content).

---

## Summary

All research items are resolved. No external dependencies or blockers identified. Implementation can proceed with the patterns documented above.
