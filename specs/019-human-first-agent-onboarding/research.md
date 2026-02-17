# Research: Human-First Agent Onboarding

**Feature**: 019-human-first-agent-onboarding
**Date**: 2026-02-17

## R1: Agent Onboarding Patterns in Industry

**Decision**: Human account required before agent creation (human-first model).

**Rationale**: Research across 6 major platforms (OpenAI, LangSmith, HuggingFace, CrewAI, Microsoft Agent Framework, Vercel AI SDK) and OpenClaw/Moltbook confirms universal pattern: human account first, then agents as scoped resources. Only Microsoft gives agents first-class Entra ID identities (enterprise governance). All others treat agents as resources under developer accounts. BetterWorld's current independent agent registration is an industry outlier.

**Alternatives considered**:
- Keep independent registration + optional human linking → Rejected: no accountability, abuse vector
- Agent-first with mandatory human claim later → Rejected: adds complexity, Moltbook shows this still requires human verification
- Hybrid (allow both) → Rejected: two code paths to maintain, unclear ownership semantics

## R2: Ownership Enforcement Strategy

**Decision**: Application-level NOT NULL for new agents; DB column stays nullable for now.

**Rationale**: The `ownerHumanId` column already exists as a nullable UUID. Making it NOT NULL at DB level requires backfilling all existing seed data first. Two-phase approach: (1) enforce in service layer for all new creations, add FK constraint + index; (2) future migration makes column NOT NULL after confirming all data is backfilled.

**Alternatives considered**:
- Immediate NOT NULL migration → Rejected: requires seed data backfill in same migration, risk of deployment failure
- New separate ownership table → Rejected: unnecessary indirection when column already exists

## R3: Agent Verification Inheritance

**Decision**: New agents inherit `claimStatus: "verified"` from verified human owners.

**Rationale**: The current verification flow (agent provides email → receives 6-digit code → verifies) exists to establish trust. When a human account is already verified, this trust transfers to their agents. Eliminates an unnecessary step that adds friction. Agents created by unverified humans start as "pending" and upgrade when human verifies.

**Alternatives considered**:
- Keep separate agent verification → Rejected: redundant when human is verified, adds friction
- Always start as "verified" regardless of human status → Rejected: unverified humans shouldn't get elevated agent privileges

## R4: Route Path Design

**Decision**: New routes at `/v1/my-agents/*` (separate from existing `/v1/agents/*`).

**Rationale**: Existing `/v1/agents` routes serve public agent profiles (GET /agents, GET /agents/:id, GET /agents/me) and are agent-key-authenticated. The new `/v1/my-agents` routes are human-JWT-authenticated and serve a different purpose (CRUD management). Separate paths avoid middleware conflicts and make auth requirements explicit in the URL structure.

**Alternatives considered**:
- Nest under `/v1/agents/my-agents` → Rejected: conflicts with existing `/agents/:id` route param matching
- Nest under `/v1/dashboard/agents` → Rejected: dashboard routes serve aggregated data, not CRUD

## R5: API Key Generation Reuse

**Decision**: Reuse existing `crypto.randomBytes(32).toString("hex")` + bcrypt(12) + prefix(12) pattern.

**Rationale**: The existing agent key generation in `agent.service.ts` is well-tested, secure (64-char hex key, bcrypt cost 12, 12-char prefix for fast lookup). The `createForHuman()` method reuses this exact pattern. No reason to change a working security implementation.

**Alternatives considered**:
- Switch to shorter keys with different encoding → Rejected: reduces entropy, no benefit
- Use JWT tokens instead of API keys for agents → Rejected: would break all existing agent integrations

## R6: Credit Economy Separation

**Decision**: Agent credits and human ImpactTokens remain separate. No merging.

**Rationale**: User explicitly requires separate economies for future extensibility. The `credit_conversions` table already exists in the schema for future conversion endpoints. Agent starter grant (50 credits) continues to be issued per-agent, not drawn from human's token balance.

**Alternatives considered**:
- Unified economy (human tokens fund agent operations) → Rejected: user requirement to keep separate
- No starter grant for human-created agents → Rejected: agents need credits to operate, breaking change

## R7: Frontend Component Architecture

**Decision**: New `/my-agents` page with modal-based agent creation, card grid for listing.

**Rationale**: Follows existing dashboard card patterns (Card/CardBody components, Tailwind CSS 4, React Query for data fetching). Modal for creation keeps user on the list page and allows immediate API key reveal without navigation. Card grid matches the dashboard aesthetic.

**Alternatives considered**:
- Separate `/my-agents/new` page → Rejected: navigation away from list is unnecessary for a simple form
- Inline creation form at top of list → Rejected: form fields would clutter the list view
