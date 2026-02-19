# Quickstart: Security Hardening Sprint

**Branch**: `020-security-hardening` | **Date**: 2026-02-18 | **Spec**: [spec.md](spec.md)

## What This Sprint Does

Applies 6 high-ROI security improvements using only existing infrastructure:

1. **LLM Output Validation** — Zod schemas on all 3 Claude API integration points
2. **GDPR Data Export** — `GET /api/v1/me/data-export` returning all user PII as JSON
3. **GDPR Account Deletion** — 14-day cooling-off flow with PII removal + anonymization
4. **CI/CD Hardening** — SHA-pinned actions, Trivy image scanning, Dockerfile improvements
5. **WebSocket Origin Validation** — CSWSH protection via Origin header checks
6. **Redis TTL Enforcement** — Explicit expiry on all sensitive Redis keys

## Prerequisites

- Local dev environment running (PostgreSQL, Redis, API server)
- Existing test suite passing (`pnpm test`)
- Access to `.github/workflows/` for CI changes

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data export format | Single JSON file | Simple, one endpoint, sufficient at current scale |
| Deletion anonymization | SHA-256(userId + salt), 12 hex chars | Deterministic, non-correlatable, consistent across tables |
| Token transactions on deletion | Anonymize userId (not delete) | Preserves double-entry audit trail integrity |
| Cooling-off period | 14 days | Industry standard, prevents accidental deletion |
| Deletion processing | Daily BullMQ cron worker | Reuses existing worker infrastructure |
| Container scanning | Trivy (free tier in CI) | Zero cost, GitHub-hosted runner compatible |

## New Files to Create

### Shared Schemas
- `packages/shared/src/schemas/classifier-response.ts` — Zod schema for Layer B classifier output
- `packages/shared/src/schemas/vision-verification-response.ts` — Zod schema for Claude Vision output
- `packages/shared/src/schemas/decomposition-response.ts` — Zod schema for mission decomposition output

### Database
- `packages/db/src/schema/account-deletion-requests.ts` — New table schema
- `packages/db/src/migrations/0020_security_hardening.ts` — Migration (enum + table + indexes)

### API Routes
- `apps/api/src/routes/gdpr.routes.ts` — 3 GDPR endpoints (export, request deletion, cancel deletion)

### Services
- `apps/api/src/services/data-export.service.ts` — Aggregates PII from 12 tables
- `apps/api/src/services/account-deletion.service.ts` — Manages deletion lifecycle

### Workers
- `apps/api/src/workers/account-deletion-worker.ts` — Daily cron processing expired requests

### WebSocket
- Modify `apps/api/src/ws/server.ts` — Add Origin validation + message size limits

### CI/CD
- Modify `.github/workflows/ci.yml` — SHA-pin actions, add Trivy scan, pnpm version check
- Modify `.github/workflows/deploy.yml` — SHA-pin actions
- Modify `infra/Dockerfile` — Add USER + HEALTHCHECK
- Modify `infra/Dockerfile.worker` — Add USER + HEALTHCHECK

## Files to Modify

### LLM Output Validation
- `packages/guardrails/src/layer-b/classifier.ts` — Replace manual typeof checks with Zod `.strict().parse()`
- `apps/api/src/workers/evidence-verification.ts` — Add Zod validation on Vision response
- `apps/api/src/routes/missions/decompose.ts` — Add Zod validation on decomposition response
- `apps/api/src/services/before-after.service.ts` — Add Zod validation on before/after comparison

### WebSocket
- `apps/api/src/ws/server.ts` — Origin validation, message size limit (64KB)
- `apps/api/src/middleware/cors.ts` — Extract ALLOWED_ORIGINS to shared constant

### Redis
- Audit all `redis.set()` calls without TTL — add explicit expiry to any storing sensitive data

## Development Order

1. **Shared schemas first** — Create Zod schemas in `packages/shared/` (no dependencies)
2. **LLM validation** — Wire schemas into classifier, vision, decomposition (tests existing)
3. **DB migration** — Create `account_deletion_requests` table
4. **GDPR endpoints** — Data export + deletion request + cancellation
5. **Deletion worker** — Daily cron for processing expired requests
6. **WebSocket hardening** — Origin validation + message size
7. **CI/CD hardening** — SHA pins, Trivy, Dockerfile improvements
8. **Redis TTL audit** — Find and fix missing TTLs
9. **Integration tests** — Cover all new endpoints and validation paths

## Cost Verification

Before merging, verify:
- [ ] Zero new paid services or infrastructure
- [ ] Zero new Claude API calls (validation is on existing responses)
- [ ] Zero new npm dependencies (Zod already in project)
- [ ] Per-request latency increase < 1ms (Zod parse is ~0.1ms, Origin check is ~0.01ms)
- [ ] All existing tests still passing
