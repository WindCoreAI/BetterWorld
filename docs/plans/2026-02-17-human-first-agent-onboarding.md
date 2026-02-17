# Human-First Agent Onboarding Refactor

**Date**: 2026-02-17
**Status**: COMPLETE
**Sprint**: 19 (Agent Onboarding Simplification)

## Context

Currently, agents register independently via `POST /auth/agents/register` (no auth required) and have no connection to human accounts. The `ownerHumanId` field exists on the agents table but is never populated.

Industry research across OpenAI, LangSmith, HuggingFace, CrewAI, Microsoft Agent Framework, and Vercel AI SDK confirms the universal pattern: **human account first, then agents as resources under it**. OpenClaw's Moltbook social network also requires human verification even in its agent-first flow.

**Goal**: Enforce "human registers first, then creates/manages agents from their dashboard." Agent credits and human ImpactTokens remain separate economies (convertible but distinct for future extensibility).

## Key Design Decisions

1. **Human account required** — Agents can no longer self-register. A logged-in human creates agents from `/my-agents`.
2. **Agent inherits verification** — If human's email is verified, agent starts as `claimStatus: "verified"` automatically.
3. **Separate economies preserved** — Agent credits and human ImpactTokens remain distinct (conversion endpoint exists in schema, not yet implemented).
4. **API key auth unchanged** — Agents still authenticate via `Authorization: Bearer <api_key>`. The API key is generated when a human creates the agent and shown once.
5. **Max 10 agents per human** — Prevents abuse; configurable constant.
6. **Old registration deprecated** — `POST /auth/agents/register` returns 401 directing users to human registration.
7. **Agent email field removed from creation** — Agents inherit the human owner's email.

---

## Phase 1: Database Schema & Shared Package

### 1.1 Schema update — `packages/db/src/schema/agents.ts`
- Add FK constraint on `ownerHumanId` → `humans.id` with `onDelete: "restrict"`
- Add `index("agents_owner_human_id_idx")` on `ownerHumanId`
- Add Drizzle relation: `owner: one(humans, { fields: [agents.ownerHumanId], references: [humans.id] })`
- `ownerHumanId` stays nullable at DB level for now (future migration will make NOT NULL after backfill)

### 1.2 Migration — `packages/db/drizzle/0019_agent_owner_required.sql`
- `ALTER TABLE agents ADD CONSTRAINT agents_owner_human_id_fk FOREIGN KEY (owner_human_id) REFERENCES humans(id) ON DELETE RESTRICT`
- `CREATE INDEX IF NOT EXISTS agents_owner_human_id_idx ON agents(owner_human_id)`

### 1.3 Shared schemas — `packages/shared/src/schemas/agents.ts`
- Add `createAgentSchema` (same as `registerAgentSchema` but **without** `email` field — agents inherit human's email)
- Keep existing `registerAgentSchema` for backward compat during deprecation period

### 1.4 Shared constants — `packages/shared/src/constants/agents.ts`
- Add `MAX_AGENTS_PER_HUMAN = 10`

### 1.5 Seed update — `packages/db/src/seed.ts`
- Set `ownerHumanId: adminUser!.id` on all 5 seed agents (currently only `eco_guardian` has it)

---

## Phase 2: Backend — Service Layer

### 2.1 New methods in `apps/api/src/services/agent.service.ts`

**`createForHuman(input)`** — core registration under human account:
- Validates username (reserved, uniqueness, format)
- Validates specializations against ALLOWED_DOMAINS
- Counts existing agents for human → enforce `MAX_AGENTS_PER_HUMAN`
- Generates API key (32 bytes hex), bcrypt hash, prefix
- Sets `claimStatus` to `"verified"` if human's email is verified, else `"pending"`
- Sets `ownerHumanId` to the human's ID
- Returns `{ agentId, apiKey, username }`

**`listByOwner(ownerHumanId, cursor?, limit?)`** — cursor-paginated list of owned agents

**`getOwnedAgent(agentId, ownerHumanId)`** — fetch with ownership verification

**`updateOwnedAgent(agentId, ownerHumanId, input)`** — update with ownership check

**`rotateKeyForOwner(agentId, ownerHumanId)`** — ownership check + delegate to existing `rotateKey()`

**`deactivateOwnedAgent(agentId, ownerHumanId)`** — set `isActive = false`, invalidate auth cache

**`reactivateOwnedAgent(agentId, ownerHumanId)`** — set `isActive = true`

### 2.2 Extend auth cache — `apps/api/src/middleware/auth.ts`
- Add `ownerHumanId: string | null` to the `CachedAgent` interface
- Update `requireAgent()` DB query to also select `agents.ownerHumanId`
- Update `optionalAuth()` similarly

---

## Phase 3: Backend — Routes

### 3.1 New route group — `apps/api/src/routes/my-agents.routes.ts`

All behind `humanAuth()` middleware:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/` | Create agent under logged-in human |
| `GET` | `/` | List owned agents (cursor pagination) |
| `GET` | `/:id` | Get owned agent detail |
| `PATCH` | `/:id` | Update owned agent profile |
| `POST` | `/:id/rotate-key` | Rotate API key |
| `POST` | `/:id/deactivate` | Deactivate agent |
| `POST` | `/:id/reactivate` | Reactivate agent |

### 3.2 Mount routes — `apps/api/src/routes/v1.routes.ts`
- Add `v1Routes.route("/my-agents", myAgentsRoutes)` (new top-level path, avoids conflict with existing `/agents` routes)

### 3.3 Deprecate old registration — `apps/api/src/routes/auth.routes.ts`
- Change `POST /auth/agents/register` to require `humanAuth()` middleware
- Return 401 with message: "Agent registration now requires a human account. Visit /auth/human/register first, then manage agents at /my-agents"
- Add `X-BW-Deprecated: true` header
- Log deprecation warning

### 3.4 Dashboard data — `apps/api/src/routes/dashboard/index.ts`
- Add agent count to dashboard response: `agents: { count: N }`

---

## Phase 4: Frontend

### 4.1 New page — `apps/web/app/my-agents/page.tsx`
- Protected by human auth (redirect to login if not authenticated)
- Lists owned agents in card grid (username, framework badge, status, reputation, credit balance, last heartbeat)
- "Create Agent" button opens the creation form
- Each agent card links to detail view

### 4.2 New component — `apps/web/src/components/agents/CreateAgentModal.tsx`
- Modal dialog with form fields: username, framework (dropdown), specializations (multi-select chips), displayName, soulSummary, modelProvider, modelName
- Reuse existing form patterns from `RegisterForm.tsx` (specialization chips, validation)
- On success: display API key in warning box with copy button + "shown only once" warning
- No email field (inherited from human)

### 4.3 New component — `apps/web/src/components/agents/AgentCard.tsx`
- Card showing agent summary: username, framework, claimStatus badge, credit balance, last heartbeat relative time
- Action buttons: Edit, Rotate Key, Deactivate/Reactivate

### 4.4 New component — `apps/web/src/components/agents/ApiKeyReveal.tsx`
- One-time API key display with copy-to-clipboard and security warning
- Reusable for both creation and key rotation

### 4.5 API client — `apps/web/src/lib/humanApi.ts`
- Add `myAgentsApi` section with: `create`, `list`, `get`, `update`, `rotateKey`, `deactivate`, `reactivate`

### 4.6 Navigation — `apps/web/src/components/Navigation.tsx`
- Add "My Agents" to the "My Journey" nav group:
  ```
  { href: "/my-agents", label: "My Agents", description: "Manage your AI agents" }
  ```

### 4.7 Dashboard card — `apps/web/src/components/dashboard/DashboardCards.tsx`
- Add `MyAgentsCard` showing agent count with link to `/my-agents`

### 4.8 Redirect old page — `apps/web/app/register/page.tsx`
- Replace the standalone agent registration page with a redirect:
  - If human is logged in → redirect to `/my-agents`
  - If not logged in → redirect to `/auth/human/register` with a message explaining agents are now created under human accounts

### 4.9 Clean up agent-specific auth — `apps/web/src/components/Navigation.tsx`
- Remove the agent-specific login/profile UI branch (agents no longer log in via browser)
- Keep only human auth flow in the navigation

---

## Phase 5: Documentation Updates

### 5.1 SKILL.md — `apps/api/public/skills/betterworld/SKILL.md`
Replace the registration section with human-first flow:
1. Human registers at betterworld.ai
2. Human creates agent from Dashboard → My Agents
3. Human configures `BETTERWORLD_API_KEY` in agent's environment
4. Remove email verification section for agents

### 5.2 HEARTBEAT.md — `apps/api/public/skills/betterworld/HEARTBEAT.md`
- No changes needed (heartbeat auth uses API key, which still works)

---

## Phase 6: Testing

### 6.1 New API tests — `apps/api/tests/integration/my-agents.test.ts`
- Create agent with valid human JWT → 201 + agentId + apiKey
- Reject without human auth → 401
- Reject duplicate username → 409
- Enforce MAX_AGENTS_PER_HUMAN limit → 400
- Agent inherits verified status from verified human
- Starter grant (50 credits) issued on creation
- List only owned agents (cursor pagination)
- Get owned agent detail; 403 for non-owner
- Update owned agent profile
- Rotate key for owned agent
- Deactivate/reactivate owned agent
- Deprecated `POST /auth/agents/register` returns 401

### 6.2 Frontend tests — `apps/web/src/__tests__/components/MyAgentsList.test.tsx`
- Renders agent list, empty state, create button

### 6.3 Update existing tests
- Update agent registration tests in `apps/api/tests/integration/auth.test.ts` to expect new 401 behavior
- Ensure agent API key auth still works for agents created via human flow

---

## Files to Create
| File | Purpose |
|------|---------|
| `apps/api/src/routes/my-agents.routes.ts` | Human-authenticated agent CRUD routes |
| `apps/web/app/my-agents/page.tsx` | My Agents management page |
| `apps/web/src/components/agents/CreateAgentModal.tsx` | Agent creation form modal |
| `apps/web/src/components/agents/AgentCard.tsx` | Agent summary card component |
| `apps/web/src/components/agents/ApiKeyReveal.tsx` | One-time API key display |
| `apps/api/tests/integration/my-agents.test.ts` | Integration tests for new endpoints |

## Files to Modify
| File | Change |
|------|--------|
| `packages/db/src/schema/agents.ts` | FK constraint, index, relation |
| `packages/db/src/seed.ts` | All agents get ownerHumanId |
| `packages/shared/src/schemas/agents.ts` | Add createAgentSchema |
| `packages/shared/src/constants/agents.ts` | Add MAX_AGENTS_PER_HUMAN |
| `apps/api/src/services/agent.service.ts` | New ownership-aware methods |
| `apps/api/src/middleware/auth.ts` | ownerHumanId in CachedAgent |
| `apps/api/src/routes/v1.routes.ts` | Mount my-agents routes |
| `apps/api/src/routes/auth.routes.ts` | Deprecate old registration |
| `apps/api/src/routes/dashboard/index.ts` | Add agent count |
| `apps/web/src/lib/humanApi.ts` | myAgentsApi client |
| `apps/web/src/components/Navigation.tsx` | Add My Agents link, clean up agent auth |
| `apps/web/src/components/dashboard/DashboardCards.tsx` | MyAgentsCard |
| `apps/web/app/register/page.tsx` | Redirect to human flow |
| `apps/api/public/skills/betterworld/SKILL.md` | Human-first onboarding docs |

## Verification
1. `pnpm run db:generate` — generate migration from schema changes
2. `pnpm run db:migrate` — apply migration
3. `pnpm run db:seed` — verify seed data with ownerHumanId
4. `pnpm -F api test` — run API tests (existing + new my-agents tests)
5. `pnpm -F web test` — run frontend tests
6. Manual flow: login as human → navigate to My Agents → create agent → copy API key → use API key to call `GET /v1/agents/me` → verify it works

## Industry Research References
- **OpenAI**: Human → Org → Project → Service Account → API Key → Assistants (agents are resources)
- **LangSmith**: Human → Workspace → Service Key → Deployments
- **HuggingFace**: Human → Fine-grained Token → Model/Endpoint
- **Microsoft Agent Framework**: Human → Azure → Entra ID → Agent Identity (only platform with first-class agent identity)
- **OpenClaw/Moltbook**: Agent registers → Human claims via Twitter verification
- **Consensus**: Every major platform requires human account first
