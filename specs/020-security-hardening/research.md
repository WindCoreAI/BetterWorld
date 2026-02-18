# Research: Security Hardening Sprint

**Branch**: `020-security-hardening` | **Date**: 2026-02-18 | **Spec**: [spec.md](spec.md)

## R1: Claude API Response Validation Points

### Decision
Add Zod schemas to validate all 3 Claude API integration points before storing any data.

### Rationale
Currently, all 3 integration points parse Claude responses without strict schema validation:
- **Classifier** (`packages/guardrails/src/layer-b/classifier.ts:62-95`): Uses `JSON.parse()` + manual `typeof` checks — no Zod, no `.strip()`, allows extra fields.
- **Vision verification** (`apps/api/src/workers/evidence-verification.ts`): Uses `tool_use` structured output but trusts the response shape without validation.
- **Decomposition** (`apps/api/src/routes/missions/decompose.ts`): Uses `tool_use` structured output but trusts the response shape without validation.

Zod `.strict()` schemas will catch missing fields, out-of-range values, and extra fields at zero additional API cost (validation happens on the already-received response).

### Alternatives Considered
- **Claude `tool_use` structured output on classifier**: Would require changing the classifier from text-response to tool_use pattern. More invasive change, deferred to next sprint (P1-1 in gap analysis).
- **Runtime type assertions only**: Current approach — insufficient, doesn't strip extra fields or validate ranges.

### Key Files
- `packages/guardrails/src/layer-b/classifier.ts` — classifier response parsing (line 62-95)
- `apps/api/src/workers/evidence-verification.ts` — vision verification response
- `apps/api/src/routes/missions/decompose.ts` — decomposition response
- `apps/api/src/services/before-after.service.ts` — before/after vision comparison

### Response Schemas Needed

**Classifier response** (text JSON):
```
aligned_domain: string (one of 15 approved domains)
alignment_score: number (0-1)
harm_risk: "none" | "low" | "medium" | "high" | "critical"
feasibility: "none" | "low" | "medium" | "high"
quality: string
decision: "approve" | "reject" | "flag"
reasoning: string
solution_scores?: { impact: 0-100, feasibility: 0-100, cost_efficiency: 0-100 }
```

**Vision verification response** (tool_use):
```
relevanceScore: number (0-1)
gpsPlausibility: number (0-1)
timestampPlausibility: number (0-1)
authenticityScore: number (0-1)
requirementChecklist: Array<{ requirement: string, met: boolean }>
overallConfidence: number (0-1)
reasoning: string
```

**Decomposition response** (tool_use):
```
missions: Array<{
  title: string
  description: string
  instructions: Array<{ step: number, text: string, optional: boolean }>
  evidenceRequired: Array<{ type: "photo"|"document"|"video", description: string, required: boolean }>
  requiredSkills: string[]
  estimatedDurationMinutes: number (15-10080)
  difficulty: "beginner"|"intermediate"|"advanced"|"expert"
  suggestedTokenReward: number (positive integer)
}>
```

---

## R2: GDPR Data Export Implementation

### Decision
Synchronous JSON export via `GET /api/v1/me/data-export` aggregating data from all 14 PII-containing tables.

### Rationale
The platform has up to 14 tables containing user PII. A synchronous approach works within the 30-second target for accounts with up to 10,000 records. The endpoint returns a single JSON file with category-separated sections.

### Alternatives Considered
- **Async export with download link**: More complex, requires new storage and email notification. Deferred — synchronous handles current scale.
- **Per-category endpoints**: Simpler per-endpoint but requires multiple requests from the user. Poor UX.
- **ZIP with multiple files**: More GDPR-compliant in large-scale platforms but unnecessary complexity at current scale.

### Tables to Export
1. `humans` — profile data (exclude passwordHash)
2. `humanProfiles` — skills, location, bio, availability
3. `accounts` — OAuth providers (exclude encrypted tokens)
4. `tokenTransactions` — full transaction history
5. `missionClaims` — claimed missions + status
6. `evidence` — submitted evidence (exclude EXIF, include URLs)
7. `follows` — following list
8. `connections` — connection list + status
9. `notifications` — notification history
10. `discussionThreads` — authored threads
11. `discussionReplies` — authored replies
12. `agents` — owned agents (exclude apiKeyHash)
13. `verificationTokens` — exclude (internal, temporary)
14. `sessions` — exclude (internal, security-sensitive)

---

## R3: GDPR Account Deletion Flow

### Decision
14-day cooling-off via `account_deletion_requests` table + daily BullMQ worker for processing expired requests.

### Rationale
FK constraints dictate the deletion order:
1. **Deactivate agents** (RESTRICT constraint on agents.ownerHumanId)
2. **Anonymize contributions** with RESTRICT FKs: problems, solutions, evidence, discussionThreads, discussionReplies, missionClaims (replace userId with deterministic hash)
3. **Delete CASCADE data**: follows, connections, notifications, tokenTransactions (after anonymizing userId), accounts, sessions, verificationTokens
4. **Delete profile**: humanProfiles (CASCADE)
5. **Delete human**: humans record

### Anonymization Strategy
- Generate `SHA-256(userId + salt)` truncated to 12 hex chars
- Salt stored as environment variable (not in DB) to prevent reverse-lookup
- Display as "Former User a3f8b2" across all anonymized records
- Same hash for same user across all tables (consistent cross-reference)

### Key Implementation Details
- New table: `account_deletion_requests` (status, requestedAt, expiresAt, cancelledAt, completedAt)
- New worker: `account-deletion-worker` (daily cron, processes expired requests)
- Blocker check: active mission claims (`status = 'active'`) or unresolved disputes prevent initiation
- Agent deactivation: bulk `UPDATE agents SET isActive = false WHERE ownerHumanId = ?`
- Cooling-off banner: frontend checks `account_deletion_requests` status on login

---

## R4: CI/CD Supply Chain Hardening

### Decision
Pin all GitHub Actions by SHA, add Trivy image scanning, verify pnpm version, add USER/HEALTHCHECK to Dockerfiles.

### Rationale
All 30+ action references in ci.yml and deploy.yml use tag-based versioning (`@v4`, `@master`). SHA pinning is a one-time change that blocks tag-tampering attacks.

### Current State
- **ci.yml**: 30+ uses of `actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4`, `actions/upload-artifact@v4`
- **deploy.yml**: 8+ uses including `superfly/flyctl-actions/setup-flyctl@master` (branch-based, highest risk)
- **Dockerfiles**: `infra/Dockerfile` and `infra/Dockerfile.worker` — both `node:22-slim`, no USER, no HEALTHCHECK
- **pnpm**: v9.15.4 pinned in package.json `packageManager` field
- **debug**: v3.2.7 and v4.4.3 in lockfile
- **chalk**: v4.1.2 in lockfile

### Actions to Pin (deduplicated)
| Action | Current | SHA to pin |
|--------|---------|-----------|
| `actions/checkout` | `@v4` | Look up latest v4 SHA |
| `pnpm/action-setup` | `@v4` | Look up latest v4 SHA |
| `actions/setup-node` | `@v4` | Look up latest v4 SHA |
| `actions/upload-artifact` | `@v4` | Look up latest v4 SHA |
| `superfly/flyctl-actions/setup-flyctl` | `@master` | Look up latest SHA |

---

## R5: WebSocket Origin Validation

### Decision
Add Origin header validation to WebSocket handshake using the same ALLOWED_ORIGINS list from CORS middleware.

### Rationale
The WebSocket server (`apps/api/src/ws/server.ts`) currently has NO Origin header validation. It uses token-based auth (which prevents cookie-based CSWSH) but Origin validation adds defense-in-depth against CVE-2026-25253.

### Implementation Approach
- Extract ALLOWED_ORIGINS from `apps/api/src/middleware/cors.ts` into a shared constant
- Add Origin check before `upgradeWebSocket()` in both `/ws/feed` and `/ws/human` endpoints
- Reject connections with missing or unauthorized Origin headers
- Add 64KB message size limit check in `onMessage` handlers

### Key Files
- `apps/api/src/ws/server.ts` — WebSocket endpoints (lines 19-146)
- `apps/api/src/middleware/cors.ts` — CORS origin whitelist (line 43-45)

---

## R6: Redis TTL Audit

### Decision
Audit all Redis SET/SETEX operations and ensure explicit TTLs on all sensitive data.

### Rationale
Redis operations across the codebase show mixed TTL compliance:
- **With TTL** (good): auth rate limiting (pipeline + expire), resend throttle (setex 3600), connection suggestions cache (setex 300), notification unread count (setex 60), feature flags (60s cache)
- **Needs audit**: Any `redis.set()` calls without EX parameter storing sensitive data

### Approach
- Grep all `redis.set(` and `redis.hset(` calls (without `setex` or `EX` parameter)
- Classify each as sensitive (tokens, sessions, PII) vs non-sensitive (cache, metrics)
- Add TTL to any missing sensitive operations
- Document acceptable TTL ranges per data category
