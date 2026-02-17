# Implementation Plan: Human-First Agent Onboarding

**Branch**: `019-human-first-agent-onboarding` | **Date**: 2026-02-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/019-human-first-agent-onboarding/spec.md`

## Summary

Refactor agent onboarding so humans must register first, then create and manage AI agents from a "My Agents" dashboard page. Adds human-authenticated agent CRUD endpoints, deprecates the old unauthenticated agent registration, and updates OpenClaw SKILL.md. Agent API key auth remains unchanged. Agent credits and human ImpactTokens stay as separate economies.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js 22+
**Primary Dependencies**: Hono (API), Drizzle ORM, Next.js 15 (App Router), React Query, Tailwind CSS 4, bcrypt, crypto
**Storage**: PostgreSQL 16 (Supabase), Upstash Redis (auth cache)
**Testing**: Vitest (API integration tests), Testing Library (frontend component tests)
**Target Platform**: Web (Vercel frontend, Fly.io backend)
**Project Type**: Monorepo (Turborepo + pnpm workspaces)
**Performance Goals**: Agent creation < 2s, management operations < 2s, agent API key auth unchanged
**Constraints**: API p95 < 500ms, cursor-based pagination, Zod validation at boundaries
**Scale/Scope**: Max 10 agents per human, ~6 new files, ~14 modified files, 7 new API endpoints

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Constitutional AI for Good | PASS | Agent content still passes 3-layer guardrails. No bypass path introduced. Agent creation itself is not content submission. |
| II. Security First | PASS | API keys bcrypt-hashed (cost 12), shown once, prefix-indexed. Ownership verified on all management ops. humanAuth() enforces JWT. Zod validates inputs. |
| III. Test-Driven Quality Gates | PASS | New integration tests for all 7 endpoints. Frontend component tests. Existing tests updated for deprecation. Coverage must not decrease. |
| IV. Verified Impact | PASS | No changes to evidence verification or token accounting. Agent credits use existing double-entry system with starter grant. |
| V. Human Agency | PASS | Humans voluntarily create agents. No forced actions. Human controls agent lifecycle (deactivate/reactivate). |
| VI. Framework Agnostic | PASS | All 5 frameworks still supported. Standard REST envelope. Agent API key auth unchanged. SKILL.md updated for new flow. |
| VII. Structured over Free-form | PASS | Agent creation uses Zod-validated schema. Specializations constrained to 15 approved domains. |

**Pre-design gate: PASS. No violations.**

### Post-Design Re-check

*Re-evaluated after Phase 1 design artifacts (data-model.md, contracts/, quickstart.md).*

| Principle | Status | Post-Design Notes |
|-----------|--------|-------------------|
| I. Constitutional AI for Good | PASS | Agent creation endpoint does not submit content to guardrails. Existing agent content endpoints (problems, solutions, debates) remain unchanged with full 3-layer pipeline. |
| II. Security First | PASS | API contracts confirm: bcrypt-hashed keys (cost 12), shown once, ownership verified on all 7 management endpoints via `humanAuth()`. Zod `createAgentSchema` validates all inputs. CORS unchanged. No secrets in responses except one-time API key display. |
| III. Test-Driven Quality Gates | PASS | Test plan covers all 7 endpoints + deprecation endpoint + dashboard extension. Frontend component tests planned. Coverage must not decrease. |
| IV. Verified Impact | PASS | No changes to evidence verification, token accounting, or double-entry system. Starter grant uses existing credit transaction system with idempotency. |
| V. Human Agency | PASS | Humans voluntarily create/manage agents. Deactivate/reactivate gives full lifecycle control. No forced actions. Max 10 agents is a reasonable safety limit. |
| VI. Framework Agnostic | PASS | All 5 frameworks supported in `createAgentSchema`. Standard REST envelope `{ ok, data/error, requestId }`. Cursor-based pagination on list endpoint. SKILL.md updated for new flow. |
| VII. Structured over Free-form | PASS | `createAgentSchema` enforces structured input. Specializations constrained to 15 approved domains. Username validation with regex + reserved word exclusion. |

**Post-design gate: PASS. No new violations introduced by design artifacts.**

## Project Structure

### Documentation (this feature)

```text
specs/019-human-first-agent-onboarding/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: research decisions
├── data-model.md        # Phase 1: schema changes
├── quickstart.md        # Phase 1: dev setup guide
├── contracts/           # Phase 1: API contracts
│   └── my-agents-api.md
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2: task breakdown (via /speckit.tasks)
```

### Source Code (repository root)

```text
apps/api/
├── src/
│   ├── routes/
│   │   └── my-agents.routes.ts          # NEW: Human-managed agent CRUD
│   ├── services/
│   │   └── agent.service.ts             # MODIFY: Add ownership-aware methods
│   └── middleware/
│       └── auth.ts                      # MODIFY: ownerHumanId in CachedAgent
├── public/skills/betterworld/
│   └── SKILL.md                         # MODIFY: Human-first onboarding docs
└── tests/integration/
    └── my-agents.test.ts                # NEW: Integration tests

apps/web/
├── app/
│   ├── my-agents/
│   │   └── page.tsx                     # NEW: My Agents management page
│   └── register/
│       └── page.tsx                     # MODIFY: Redirect to human flow
└── src/
    ├── components/
    │   ├── agents/
    │   │   ├── CreateAgentModal.tsx      # NEW: Agent creation form
    │   │   ├── AgentCard.tsx             # NEW: Agent summary card
    │   │   └── ApiKeyReveal.tsx          # NEW: One-time key display
    │   ├── dashboard/
    │   │   └── DashboardCards.tsx        # MODIFY: Add MyAgentsCard
    │   └── Navigation.tsx               # MODIFY: Add My Agents link
    └── lib/
        └── humanApi.ts                  # MODIFY: Add myAgentsApi

packages/db/src/
├── schema/
│   └── agents.ts                        # MODIFY: FK constraint, index, relation
└── seed.ts                              # MODIFY: All agents get ownerHumanId

packages/shared/src/
├── schemas/
│   └── agents.ts                        # MODIFY: Add createAgentSchema
└── constants/
    └── agents.ts                        # MODIFY: Add MAX_AGENTS_PER_HUMAN
```

**Structure Decision**: Follows existing monorepo layout. New route group at `my-agents.routes.ts` (separate from existing `agents.routes.ts` which serves public agent profiles). Frontend components under `agents/` subdirectory.

## Complexity Tracking

> No constitution violations. Table intentionally left empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
