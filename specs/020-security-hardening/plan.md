# Implementation Plan: Security Hardening Sprint

**Branch**: `020-security-hardening` | **Date**: 2026-02-18 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/020-security-hardening/spec.md`

## Summary

Apply 6 high-ROI security improvements targeting the most impactful gaps identified in the security gap analysis (29 gaps total, selecting items with highest impact-per-hour). All improvements use only existing infrastructure (Fly.io, Supabase, Upstash, GitHub Actions) with zero additional runtime cost:

1. **LLM Output Validation**: Add Zod `.strict()` schemas to validate all 4 Claude API integration points (classifier, vision verification, before/after comparison, decomposition) before storing any data — addresses OWASP LLM05:2025.
2. **GDPR Data Export**: Synchronous JSON export endpoint aggregating PII from 11 user-facing data categories.
3. **GDPR Account Deletion**: 14-day cooling-off deletion flow with SHA-256 hash anonymization, daily BullMQ worker, and FK-ordered data removal.
4. **CI/CD Supply Chain Hardening**: SHA-pin all GitHub Actions, add Trivy container scanning, verify pnpm version, harden Dockerfiles (USER + HEALTHCHECK).
5. **WebSocket Origin Validation**: CSWSH protection via Origin header check against shared CORS whitelist + 64KB message size limit.
6. **Redis TTL Enforcement**: Audit and fix all Redis keys storing sensitive data without explicit TTL.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js 22+
**Primary Dependencies**: Hono (API), Drizzle ORM, Zod (validation), BullMQ (workers), jose (JWT), bcrypt, ioredis, @hono/node-ws (WebSocket), @anthropic-ai/sdk (Claude)
**Storage**: PostgreSQL 16 + PostGIS (Supabase), Upstash Redis
**Testing**: Vitest (unit + integration), Playwright (E2E), k6 (load)
**Target Platform**: Fly.io (API + workers), Vercel (frontend), GitHub Actions (CI/CD)
**Project Type**: Monorepo (Turborepo + pnpm workspaces)
**Performance Goals**: Zero latency increase (Zod parse ~0.1ms, Origin check ~0.01ms), data export <30s for 10K records
**Constraints**: No new paid services (FR-024), no new external API calls (FR-026), <1ms per-request latency increase (FR-025)
**Scale/Scope**: 14 tables with PII, 4 Claude integration points, 30+ GitHub Action references, 2 Dockerfiles, 2 WebSocket endpoints

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Constitutional AI for Good | PASS | No guardrail bypass. LLM validation adds strictness to existing classifier output path — content still enters "pending" state. |
| II. Security First | PASS | This sprint directly implements Security First principle. Adds Zod validation at system boundaries, Origin validation on WebSocket, SHA pinning on CI, TTL enforcement on Redis. |
| III. Test-Driven Quality Gates | PASS | All changes will have integration tests. Coverage must not decrease. Existing guardrail regression suite (200+ adversarial cases) continues passing. |
| IV. Verified Impact | PASS | No changes to evidence verification pipeline logic — only adds Zod validation on Vision response shape. Double-entry accounting preserved during deletion (anonymized, not deleted). |
| V. Human Agency | PASS | Deletion is voluntary with 14-day cooling-off + cancel option. No penalty for not deleting. |
| VI. Framework Agnostic | PASS | No changes to agent API contract. Standard envelope `{ ok, data/error, requestId }` on new GDPR endpoints. |
| VII. Structured over Free-form | PASS | New Zod schemas enforce stricter structure on LLM outputs. New API endpoints use Zod validation. |

### Post-Design Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Constitutional AI for Good | PASS | Classifier validation rejects malformed responses → routes to human review (Layer C), maintaining 3-layer pipeline integrity. |
| II. Security First | PASS | 6 security improvements all align. CORS whitelist shared between HTTP CORS and WebSocket Origin. Anonymization salt in env variable (not DB). |
| III. Test-Driven Quality Gates | PASS | New tests: GDPR endpoints (export, deletion lifecycle), LLM validation (invalid/missing fields), WebSocket Origin rejection, deletion worker processing. CI adds Trivy scanning. |
| IV. Verified Impact | PASS | Token transactions anonymized (not deleted) during account deletion — preserves double-entry audit trail with balance_before/balance_after. |
| V. Human Agency | PASS | 14-day cooling-off with explicit cancel. Blocked if active mission claims or disputes — user informed of what to resolve. |
| VI. Framework Agnostic | PASS | New endpoints follow standard envelope. WebSocket Origin validation applies equally to all clients. |
| VII. Structured over Free-form | PASS | 4 new Zod strict schemas for Claude responses. Deletion request follows defined state machine (pending → cancelled/completed). |

**Gate Result**: ALL PASS — no violations, no complexity tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/020-security-hardening/
├── plan.md              # This file
├── research.md          # Phase 0: 6 research sections (R1-R6)
├── data-model.md        # Phase 1: account_deletion_requests table + Zod schemas
├── quickstart.md        # Phase 1: development guide
├── contracts/
│   └── gdpr-endpoints.yaml  # Phase 1: OpenAPI for GDPR endpoints
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
# New files
packages/shared/src/schemas/
├── classifier-response.ts              # Zod schema for Layer B classifier
├── vision-verification-response.ts     # Zod schema for Claude Vision
├── before-after-response.ts            # Zod schema for before/after comparison
└── decomposition-response.ts           # Zod schema for mission decomposition

packages/db/src/
├── schema/account-deletion-requests.ts # Drizzle table definition
└── ../drizzle/0020_security_hardening.sql

apps/api/src/
├── routes/gdpr.routes.ts               # 3 GDPR endpoints
├── services/data-export.service.ts     # PII aggregation from 11 data categories
├── services/account-deletion.service.ts # Deletion lifecycle management
└── workers/account-deletion-worker.ts  # Daily cron for expired requests

# Modified files
packages/guardrails/src/layer-b/classifier.ts    # +Zod validation
apps/api/src/workers/evidence-verification.ts     # +Zod validation
apps/api/src/routes/missions/decompose.ts         # +Zod validation
apps/api/src/services/before-after.service.ts     # +Zod validation
apps/api/src/ws/server.ts                         # +Origin validation, +message size limit
apps/api/src/middleware/cors.ts                    # Extract ALLOWED_ORIGINS constant
.github/workflows/ci.yml                          # SHA-pin + Trivy + pnpm verify
.github/workflows/deploy.yml                      # SHA-pin actions
infra/Dockerfile                                  # +USER +HEALTHCHECK
infra/Dockerfile.worker                           # +USER +HEALTHCHECK
```

**Structure Decision**: All changes fit within the existing monorepo structure. New shared schemas go in `packages/shared/src/schemas/`. New API routes/services/workers follow existing patterns in `apps/api/src/`. No new packages or projects needed.

## Complexity Tracking

> No constitution violations — table not needed.

No violations. All 7 principles pass both pre-design and post-design checks.
