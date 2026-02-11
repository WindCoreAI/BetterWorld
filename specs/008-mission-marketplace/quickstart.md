# Quickstart: Mission Marketplace

**Branch**: `008-mission-marketplace`
**Estimated Effort**: ~100 hours (backend 60h + frontend 30h + testing 10h)

## Prerequisites

- Sprint 6 complete (human onboarding): OAuth auth, profiles, tokens, dashboard
- Phase 1 operational: agents, solutions, guardrails, BullMQ, WebSocket
- PostgreSQL with PostGIS extension enabled
- Claude Sonnet API key (`ANTHROPIC_API_KEY`)
- Message encryption key (`MESSAGE_ENCRYPTION_KEY` — 32-byte base64)

## New Dependencies

### Backend (apps/api)
```bash
# Already available: hono, drizzle-orm, bullmq, @anthropic-ai/sdk, ioredis
# No new backend dependencies needed
```

### Frontend (apps/web)
```bash
pnpm --filter @betterworld/web add leaflet react-leaflet leaflet.markercluster
pnpm --filter @betterworld/web add -D @types/leaflet @types/leaflet.markercluster
```

### Database
```bash
# PostGIS extension (one-time, in PostgreSQL)
CREATE EXTENSION IF NOT EXISTS postgis;
```

## Environment Variables (New)

```env
# Message encryption (required for Sprint 7)
MESSAGE_ENCRYPTION_KEY=<32-byte-base64-encoded-key>

# Claude Sonnet for decomposition (already configured for guardrails)
ANTHROPIC_API_KEY=<existing>
```

Generate encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Implementation Order

### Phase A: Database Foundation (Day 1-2)
1. Add new enums to `packages/db/src/schema/enums.ts`
2. Create `packages/db/src/schema/missions.ts`
3. Create `packages/db/src/schema/missionClaims.ts`
4. Create `packages/db/src/schema/messages.ts`
5. Run Drizzle migration: `pnpm --filter @betterworld/db drizzle-kit generate`
6. Create raw SQL migration for PostGIS geography column + GIST index
7. Apply: `pnpm --filter @betterworld/db drizzle-kit push`

### Phase B: Core API Routes (Day 3-5)
1. Create `packages/shared/src/schemas/missions.ts` (Zod validation)
2. Create `packages/shared/src/schemas/messages.ts` (Zod validation)
3. Create `apps/api/src/lib/geo-helpers.ts` (coordinate snapping, dynamic radius)
4. Create `apps/api/src/routes/missions/index.ts` (CRUD + list + claim)
5. Create `apps/api/src/routes/missions/decompose.ts` (Claude Sonnet integration)
6. Create `apps/api/src/routes/messages/index.ts` (messaging routes)
7. Mount routes in `apps/api/src/routes/v1.routes.ts`
8. Create `apps/api/src/workers/mission-expiration.ts` (BullMQ daily cron)

### Phase C: Frontend (Day 6-8)
1. Create `apps/web/src/components/ui/Map.tsx` (Leaflet wrapper, lazy-loaded)
2. Create mission components: MissionCard, MissionMap, MissionFilters, MissionClaimButton, MissionStatusBadge
3. Create `apps/web/app/missions/page.tsx` (marketplace dual view)
4. Create `apps/web/app/missions/[id]/page.tsx` (mission detail)
5. Update `apps/web/app/dashboard/page.tsx` (integrate real mission claims)

### Phase D: Testing (Day 9-10)
1. Mission CRUD + guardrail integration tests
2. Concurrent claim tests (10 simultaneous claims)
3. Max 3 active missions enforcement test
4. Decomposition + rate limit tests
5. Messaging + rate limit tests
6. Expiration job + refund tests
7. Geo-search integration tests

## Quick Verification

```bash
# Run existing tests (should all pass)
pnpm test

# Start dev environment
pnpm dev

# Test mission creation (after implementing)
curl -X POST http://localhost:4000/api/v1/missions \
  -H "Authorization: Bearer <agent-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "solutionId": "<approved-solution-id>",
    "title": "Document local river pollution levels",
    "description": "Visit the river and document current pollution...",
    "instructions": [{"step": 1, "text": "Go to the river bank", "optional": false}],
    "evidenceRequired": [{"type": "photo", "description": "Photo of water", "required": true}],
    "requiredSkills": ["photography"],
    "requiredLatitude": 45.5017,
    "requiredLongitude": -73.5673,
    "estimatedDurationMinutes": 60,
    "difficulty": "beginner",
    "tokenReward": 50,
    "maxClaims": 3,
    "expiresAt": "2026-03-01T00:00:00Z"
  }'
```

## Key Patterns to Follow

- **Guardrail integration**: Follow `solutions.routes.ts` pattern — insert with `pending`, enqueue evaluation
- **Token transactions**: Follow `tokens/index.ts` pattern — SELECT FOR UPDATE, double-entry
- **Cursor pagination**: Follow existing pattern — `limit + 1` trick, nextCursor
- **Auth middleware**: Use `requireAgent()` for agent routes, `humanAuth()` for human routes
- **Route typing**: Always `new Hono<AppEnv>()` for proper TypeScript inference
- **Error handling**: Use `AppError` class with error code constants
