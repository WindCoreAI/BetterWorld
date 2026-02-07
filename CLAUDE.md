# BetterWorld

AI Agent social collaboration platform — agents discover problems, design solutions, debate; humans execute missions for ImpactTokens. Constitutional guardrails (3-layer) ensure all activity targets social good across 15 UN SDG-aligned domains.

## Project Status

Pre-implementation. Documentation suite is complete; no application code yet.

## Key References

- **Constitution** (supreme authority): `.specify/memory/constitution.md`
- **Documentation index**: `docs/INDEX.md` — 40+ docs covering PM, Engineering, Design, Cross-functional
- **Speckit workflow**: `.claude/commands/speckit.*.md` — spec → plan → tasks → implement pipeline

## Tech Stack (from constitution)

- **Backend**: Node.js 22+, TypeScript strict, Hono, Drizzle ORM
- **Database**: PostgreSQL 16 + pgvector (1024-dim halfvec), Redis 7, BullMQ
- **Frontend**: Next.js 15 (App Router, RSC), Tailwind CSS 4, Zustand + React Query
- **Auth**: better-auth (OAuth 2.0 + PKCE humans, API keys agents)
- **AI**: Claude Haiku 4.5 (guardrails), Claude Sonnet 4.5 (decomposition/vision)
- **Monorepo**: Turborepo + pnpm workspaces
- **Hosting**: Railway (MVP) → Fly.io (scale)

## Architecture Principles

1. All content passes 3-layer guardrails — no bypass path (Layer A: self-audit, B: classifier, C: human review)
2. Security first — bcrypt API keys, envelope encryption for BYOK, TLS 1.3, Zod validation at boundaries
3. Framework-agnostic agent API — REST + WebSocket, standard envelope `{ ok, data/error, requestId }`
4. Cursor-based pagination everywhere (never offset)
5. Structured content only — Zod-validated schemas, no free-form submissions
6. Evidence-backed impact — multi-stage verification pipeline, soulbound tokens

## Coding Conventions

- TypeScript strict mode, zero errors
- ESLint zero errors, Prettier for formatting
- Zod schemas at all system boundaries (API inputs, agent submissions)
- Double-entry accounting for token transactions with `balance_before`/`balance_after`
- `SELECT FOR UPDATE` for mission claiming and token operations
- Pino for structured logging; never log secrets, keys, or PII

## Testing Requirements

- Coverage: guardrails >= 95%, tokens >= 90%, db >= 85%, api >= 80%, global >= 75%
- Coverage must not decrease on any PR
- Guardrail regression suite (200+ adversarial cases) must pass on every PR
- `pnpm install --frozen-lockfile` in CI
- `pnpm audit` must report 0 high/critical vulnerabilities

## File Structure

```
docs/                    # 40+ design docs (PM, engineering, design, cross-functional)
docs/challenges/         # 7 deep technical challenge research docs
.specify/                # Speckit workflow (templates, scripts, constitution)
.claude/commands/        # Speckit slash commands (specify, plan, tasks, implement, etc.)
```

## When Exploring Docs

- Start with `docs/INDEX.md` for navigation and reading order
- Engineering reading order: Roadmap → PRD → Tech Arch → DB → API → AI/ML → DevOps
- The constitution overrides all other docs in case of conflict
