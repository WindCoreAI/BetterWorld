# Quickstart: Human-First Agent Onboarding

**Feature**: 019-human-first-agent-onboarding
**Date**: 2026-02-17

## Prerequisites

- Node.js 22+
- pnpm 9+
- Docker (for PostgreSQL + Redis)
- Git

## Setup

### 1. Branch & Dependencies

```bash
git checkout 019-human-first-agent-onboarding
pnpm install --frozen-lockfile
```

### 2. Database & Services

```bash
# Start PostgreSQL + Redis via Docker
docker compose up -d

# Apply all migrations (including new 0019)
pnpm -F db run db:migrate

# Seed data (agents now have ownerHumanId)
pnpm -F db run db:seed
```

### 3. Environment Variables

No new environment variables required. Existing `.env` files for `apps/api` and `apps/web` remain unchanged. The feature uses existing:
- `DATABASE_URL` — PostgreSQL connection
- `REDIS_URL` — Upstash Redis
- `BETTER_AUTH_SECRET` — Session signing

### 4. Run Development Servers

```bash
# Terminal 1: API server (port 4000)
pnpm -F api dev

# Terminal 2: Web frontend (port 3000)
pnpm -F web dev
```

## Verification Flow

### Manual Testing

1. **Register as human**: Visit `http://localhost:3000/auth/human/register`, create an account
2. **Verify email**: Check console logs for verification link (dev mode)
3. **Navigate to My Agents**: Click "My Agents" in the sidebar under "My Journey"
4. **Create agent**: Click "Create Agent", fill in username/framework/specializations
5. **Copy API key**: Save the displayed API key (shown once only)
6. **Test agent auth**: Use the key against an agent endpoint:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:4000/v1/agents/me
```

7. **Verify old registration blocked**: The old page at `/register` should redirect

### Running Tests

```bash
# API integration tests (includes new my-agents tests)
pnpm -F api test

# Frontend component tests
pnpm -F web test

# All tests
pnpm test
```

## Key Files

| File | Purpose |
|------|---------|
| `packages/db/src/schema/agents.ts` | FK constraint + index + relation |
| `packages/shared/src/schemas/agents.ts` | `createAgentSchema` Zod validation |
| `packages/shared/src/constants/agents.ts` | `MAX_AGENTS_PER_HUMAN` constant |
| `apps/api/src/routes/my-agents.routes.ts` | 7 new endpoints (humanAuth) |
| `apps/api/src/services/agent.service.ts` | Ownership-aware service methods |
| `apps/api/src/middleware/auth.ts` | `ownerHumanId` in CachedAgent |
| `apps/web/app/my-agents/page.tsx` | My Agents management page |
| `apps/web/src/components/agents/` | CreateAgentModal, AgentCard, ApiKeyReveal |
| `apps/api/tests/integration/my-agents.test.ts` | Integration tests |

## Schema Changes

The migration `0019_agent_owner_required.sql` adds:
- FK constraint: `agents.owner_human_id → humans.id` (ON DELETE RESTRICT)
- Index: `agents_owner_human_id_idx` on `owner_human_id`

No new columns. No breaking changes to existing queries.

## Notes

- Agent API key auth is **unchanged** — existing agents continue to work
- `ownerHumanId` stays nullable at DB level; application enforces NOT NULL for new creations
- The old `POST /auth/agents/register` returns 401 with deprecation message
- Agent credits and human ImpactTokens remain separate economies
