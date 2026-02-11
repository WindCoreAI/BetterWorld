# Quickstart: Evidence Verification & Completion Workflow

**Branch**: `009-evidence-verification`
**Date**: 2026-02-10

## Prerequisites

- Node.js 22+
- pnpm 9+
- Docker (for PostgreSQL + Redis)
- Supabase CLI (for Storage, or use local mock)

## Local Development Setup

### 1. Start infrastructure

```bash
# Start PostgreSQL + Redis (already configured from Sprint 1)
docker compose up -d postgres redis

# Verify services
docker compose ps
```

### 2. Install new dependencies

```bash
# Image processing + EXIF extraction
pnpm --filter @betterworld/api add sharp exifr blockhash-core

# Type definitions
pnpm --filter @betterworld/api add -D @types/sharp
```

### 3. Run database migration

```bash
# Generate migration from new schema files
pnpm --filter @betterworld/db drizzle-kit generate

# Apply migration
pnpm --filter @betterworld/db drizzle-kit migrate

# Verify tables exist
pnpm --filter @betterworld/db drizzle-kit studio
```

### 4. Environment variables

Add to `apps/api/.env`:

```bash
# Supabase Storage (evidence media uploads)
SUPABASE_URL=http://localhost:54321           # Local Supabase or remote
SUPABASE_SERVICE_KEY=your-service-key         # For server-side uploads
SUPABASE_STORAGE_BUCKET=evidence              # Bucket name

# Claude Vision (evidence verification)
ANTHROPIC_API_KEY=sk-ant-...                  # Already set from Sprint 3
VISION_DAILY_BUDGET_CENTS=3700                # $37/day cap (in cents)

# Peer review reward (ImpactTokens)
PEER_REVIEW_REWARD=2                          # IT per review (default)
```

### 5. Create Supabase Storage bucket (local dev)

For local development without Supabase, use the filesystem mock:

```bash
# Create local evidence storage directory
mkdir -p apps/api/storage/evidence
```

For Supabase (staging/production):
```bash
# Create bucket via Supabase dashboard or CLI
supabase storage create evidence --public=false
```

### 6. Seed honeypot missions

```bash
# Run seed script to insert 5 honeypot missions
pnpm --filter @betterworld/db seed:honeypots
```

### 7. Start development servers

```bash
# Terminal 1: API server (port 4000)
pnpm dev

# Terminal 2: Evidence verification worker
pnpm --filter @betterworld/api dev:worker:evidence

# Terminal 3: Web frontend (port 3000)
# Already starts with `pnpm dev` via Turborepo
```

## Testing

### Run all tests

```bash
# Run full test suite (should be 810+ existing + 25+ new)
pnpm test

# Run only evidence tests
pnpm --filter @betterworld/api test -- --grep "evidence"

# Run only peer review tests
pnpm --filter @betterworld/api test -- --grep "peer-review"
```

### Manual testing flow

1. **Register a human** (if not already done):
   - POST `/api/v1/auth/register` with email/password
   - Complete orientation for token balance

2. **Create a mission** (via agent API):
   - POST `/api/v1/missions` with evidence requirements

3. **Claim the mission** (as human):
   - POST `/api/v1/missions/:id/claim`

4. **Submit evidence**:
   - POST `/api/v1/missions/:id/evidence` with multipart form (photo + GPS)
   - Check status: GET `/api/v1/evidence/:id/status`

5. **Verify (worker processes automatically)**:
   - AI verification runs via BullMQ worker
   - If score 0.50-0.80: routed to peer review

6. **Peer review** (as different human):
   - GET `/api/v1/peer-reviews/pending`
   - POST `/api/v1/peer-reviews/:evidenceId/vote`

7. **Check reward**:
   - GET `/api/v1/tokens/balance`
   - GET `/api/v1/tokens/transactions`

### Test honeypot detection

1. Find a honeypot mission in the marketplace (they look like normal missions)
2. Claim it and submit evidence
3. Evidence should be auto-rejected
4. Check fraud score increment in admin panel

## Key Files

| Area | File | Purpose |
|------|------|---------|
| Schema | `packages/db/src/schema/evidence.ts` | Evidence table definition |
| Schema | `packages/db/src/schema/peerReviews.ts` | Peer review votes |
| Schema | `packages/db/src/schema/reviewHistory.ts` | 2-hop exclusion tracking |
| Schema | `packages/db/src/schema/verificationAuditLog.ts` | Audit trail |
| Routes | `apps/api/src/routes/evidence/index.ts` | Submit + list + detail |
| Routes | `apps/api/src/routes/evidence/verify.ts` | Status + appeals |
| Routes | `apps/api/src/routes/peer-reviews/index.ts` | Review queue + voting |
| Routes | `apps/api/src/routes/admin/disputes.ts` | Admin dispute resolution |
| Worker | `apps/api/src/workers/evidence-verification.ts` | AI verification + routing |
| Helpers | `apps/api/src/lib/evidence-helpers.ts` | EXIF, GPS, file validation |
| Helpers | `apps/api/src/lib/peer-assignment.ts` | Stranger-only algorithm |
| Helpers | `apps/api/src/lib/reward-helpers.ts` | Token reward distribution |
| Tests | `apps/api/src/__tests__/evidence/` | Integration tests |
| Frontend | `apps/web/app/missions/[id]/submit/page.tsx` | Submission page |
| Frontend | `apps/web/app/reviews/page.tsx` | Review queue page |

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `sharp` fails to install | Run `pnpm rebuild sharp` or check Node.js version ≥ 18 |
| EXIF extraction returns null | Photo may lack EXIF data (common with screenshots, messaging apps). Browser GPS fallback should activate. |
| Worker not processing jobs | Ensure Redis is running and `dev:worker:evidence` is started in separate terminal |
| Supabase Storage 403 | Check `SUPABASE_SERVICE_KEY` is set and bucket RLS policies allow uploads |
| Vision API rate limited | Check `VISION_DAILY_BUDGET_CENTS` and Redis counter `cost:daily:vision:evidence` |
