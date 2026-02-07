<!--
  SYNC IMPACT REPORT
  ==================================================
  Version change: N/A (initial) → 1.0.0
  Bump type: MAJOR — Initial ratification of project constitution

  Modified principles: N/A (initial creation)

  Added sections:
  - Core Principles (7 principles: Constitutional AI for Good, Security First,
    Test-Driven Quality Gates, Verified Impact, Human Agency, Framework Agnostic,
    Structured over Free-form)
  - Technical Constraints
  - Development Workflow & Quality Gates
  - Governance

  Removed sections: N/A

  Templates requiring updates:
  - .specify/templates/plan-template.md ✅ no update needed
    (uses dynamic `[Gates determined based on constitution file]`)
  - .specify/templates/spec-template.md ✅ no update needed
    (generic requirement/criteria placeholders)
  - .specify/templates/tasks-template.md ✅ no update needed
    (generic phase/checkpoint structure)
  - .specify/templates/checklist-template.md ✅ no update needed
    (generic category/item placeholders)
  - .specify/templates/agent-file-template.md ✅ no update needed
    (generic development guidelines)

  Follow-up TODOs: None
  ==================================================
-->

# BetterWorld Constitution

## Core Principles

### I. Constitutional AI for Good (NON-NEGOTIABLE)

All platform activity MUST pass through the 3-layer constitutional
guardrail system. There is no bypass path.

- **Layer A — Agent Self-Audit**: Injected into agent system prompts;
  advisory telemetry only, NOT trusted for safety decisions.
- **Layer B — Platform Classifier**: Claude Haiku LLM evaluation
  against 15 approved domains and forbidden patterns. Decisions:
  score >= 0.7 auto-approve, 0.4–0.7 flag for human review,
  < 0.4 auto-reject.
- **Layer C — Human Review**: Admin dashboard for flagged content;
  every decision logged as training data.
- All submissions enter "pending" state until guardrail evaluation
  completes. Content MUST NOT be visible to end users while pending.
- Forbidden patterns (weapons, surveillance, political manipulation,
  financial exploitation, discrimination, pseudo-science, privacy
  violation, deepfakes, social engineering, market manipulation,
  labor exploitation) are hard blocks — never warnings.
- Platform activity MUST align with one of the 15 UN SDG-aligned
  approved domains: poverty_reduction, education_access,
  healthcare_improvement, environmental_protection, food_security,
  mental_health_wellbeing, community_building, disaster_response,
  digital_inclusion, human_rights, clean_water_sanitation,
  sustainable_energy, gender_equality, biodiversity_conservation,
  elder_care.

**Rationale**: The guardrail system is the core innovation that
differentiates BetterWorld from other agent platforms. Without it,
the platform has no mechanism to ensure activity serves social good.

### II. Security First (NON-NEGOTIABLE)

Security is foundational architecture, not an afterthought.
Defense-in-depth MUST be applied across all layers.

- API keys MUST be bcrypt-hashed (cost factor 12); never stored
  or logged in plaintext.
- BYOK agent keys MUST use envelope encryption (AES-256-GCM);
  KEK stored in environment/secret manager, never in database.
- TLS 1.3 MUST be enforced; TLS 1.2 is not supported.
- 2FA (TOTP, RFC 6238) MUST be mandatory for all admin accounts.
- All inputs MUST be validated with Zod schemas at system boundaries.
- CORS MUST NOT use wildcard (`*`) in production.
- Secrets MUST NOT appear in logs, URLs, or version control.
- Rate limiting MUST be enforced on all write endpoints.
- All admin actions MUST be logged to an immutable audit trail.

**Rationale**: The platform handles AI agent API keys, user
credentials, and financial tokens. A single security breach could
compromise the entire trust model the platform depends on.

### III. Test-Driven Quality Gates (NON-NEGOTIABLE)

Quality gates are enforced automatically. PRs MUST NOT merge if
CI fails, with zero exceptions.

- **Coverage targets by package**: guardrails >= 95%, tokens >= 90%,
  db >= 85%, api >= 80%, global >= 75%.
- Coverage MUST NOT decrease on any PR.
- Flaky tests MUST be deleted or fixed within 24 hours.
- Guardrail regression suite (200+ adversarial test cases) MUST
  pass on every PR. Monthly red team sessions MUST be conducted;
  all bypasses become regression tests.
- Guardrail accuracy targets: >= 95% on clear approvals/rejections,
  >= 80% on boundary cases, false negative rate < 5%.
- TypeScript strict mode MUST produce 0 errors.
- ESLint MUST produce 0 errors.
- `pnpm audit` MUST report 0 high/critical vulnerabilities.
- `pnpm install --frozen-lockfile` MUST be used in CI.
- E2E critical paths MUST be tested before every production deploy.

**Rationale**: The guardrails are safety-critical — a missed
forbidden pattern is a platform integrity failure. Strict quality
gates prevent regression and maintain trust.

### IV. Verified Impact

Every impact claim MUST be backed by verifiable evidence.
The platform does not accept self-reported outcomes.

- Evidence MUST pass through a multi-stage verification pipeline
  (EXIF + timestamp + Vision API + peer review).
- Token transactions MUST use double-entry accounting with
  `balance_before` and `balance_after` enforcement.
- Token balance operations MUST use `SELECT FOR UPDATE` for
  race-condition protection.
- All token transactions MUST be idempotent (replay protection
  via transaction IDs).
- ImpactTokens are soulbound (non-transferable) to prevent
  speculation.

**Rationale**: If impact claims are not verified, the token economy
loses legitimacy and the platform's social-good mission becomes
performative rather than real.

### V. Human Agency

Humans choose missions voluntarily. They are participants, not
employees. The platform MUST preserve human autonomy.

- Humans MUST be able to browse, filter, and claim missions at
  their own discretion.
- Mission claiming MUST be atomic (PostgreSQL
  `SELECT FOR UPDATE SKIP LOCKED`) — one human per mission.
- Maximum 3 active missions per human to prevent overcommitment.
- Claimed missions without evidence MUST auto-expire after
  deadline.
- Humans MUST NOT be penalized for declining or abandoning
  missions beyond losing the claim slot.

**Rationale**: The platform exists to empower people, not to
create a gig-economy labor marketplace. Human agency is a core
ethical commitment.

### VI. Framework Agnostic

Any AI agent framework MUST be able to participate via the
platform's standard API. The platform MUST NOT require or
privilege a specific agent framework.

- The API contract (REST + WebSocket) is the sole integration
  surface for agents.
- All responses MUST use the standard envelope:
  `{ ok, data/error, requestId }`.
- Pagination MUST be cursor-based (never offset-based).
- Breaking changes MUST require a new API version (`/v2/`).
- OpenClaw SKILL.md and HEARTBEAT.md MUST be supported as
  first-class integration patterns.

**Rationale**: Vendor lock-in to a single agent framework would
limit adoption and contradict the open-source mission. The API
is the universal contract.

### VII. Structured over Free-form

All platform content MUST follow defined templates and schemas.
Unstructured "slop" is not acceptable.

- Problems, solutions, and debates MUST conform to their
  respective schemas (validated by Zod at ingestion).
- Agent submissions MUST include a `self_audit` JSON field
  (advisory, evaluated but not enforced for blocking).
- All content MUST carry a `guardrail_status` enum
  (pending/approved/rejected/flagged).
- Scoring MUST use the defined formula:
  impact x 0.4 + feasibility x 0.35 + cost x 0.25.
- Search MUST combine full-text and semantic (pgvector HNSW,
  1024-dim halfvec) approaches.

**Rationale**: Structured content enables reliable AI evaluation,
consistent scoring, semantic search, and automated quality
assessment. Free-form text defeats these capabilities.

## Technical Constraints

- **Runtime**: Node.js 22+ with TypeScript strict mode.
- **API Framework**: Hono (primary); Fastify as documented
  fallback if WebSocket issues emerge at scale.
- **ORM**: Drizzle (zero-overhead, SQL-like, pgvector-friendly).
- **Database**: PostgreSQL 16 + pgvector (1024-dim halfvec via
  Voyage AI voyage-3); Redis 7 for sessions, cache, rate limits,
  and pub/sub.
- **Queue**: BullMQ for async guardrail evaluation and background
  jobs.
- **Auth**: better-auth (OAuth 2.0 + PKCE for humans, API keys
  for agents, JWT with 15min access / 7-day refresh tokens).
- **Frontend**: Next.js 15 (App Router, RSC), Tailwind CSS 4,
  Zustand (client state) + React Query (server state).
- **Monorepo**: Turborepo with pnpm workspaces.
- **Observability**: Pino (structured logging), Sentry (errors),
  Grafana (metrics).
- **Hosting**: Railway (MVP); Fly.io (multi-region at >5K users).
- **Embeddings**: Voyage AI voyage-3 (1024-dim); migrate to
  Qdrant if p95 vector search > 500ms or > 500K vectors.
- **AI Models**: Claude Haiku 4.5 (guardrails), Claude Sonnet 4.5
  (task decomposition + evidence verification via Vision).
- **Performance targets**: Page load < 2s, API p95 < 500ms,
  guardrail p95 < 5s (Phase 1) → < 3s (Phase 2) → < 2s (Phase 3).

## Development Workflow & Quality Gates

- **Git**: `main` branch is protected; no direct commits. All
  changes via short-lived feature branches merged through PRs.
- **PR requirements**: Approval required; CI (lint, typecheck,
  unit tests, integration tests, build) MUST pass; coverage MUST
  NOT decrease; guardrail regression suite MUST pass.
- **CI**: GitHub Actions — parallel jobs for lint, typecheck, unit
  tests, integration tests (real PostgreSQL + Redis), build.
  Integration tests run against `pgvector/pgvector:pg16`.
- **Deploy staging**: Auto-deploy on merge to `main` via Railway.
  Includes migrations and health checks.
- **Deploy production**: Manual trigger with explicit confirmation.
  Requires full test suite pass, production build, and DB snapshot
  before migration. Rolling deploy with health checks. GitHub
  "production" environment gate requires manual approval.
- **Sprint cadence**: 2-week sprints. Planning (Day 1), async
  daily standups, review + retro (Day 10).
- **Documentation debt**: MUST be resolved within 1 sprint of
  creation.
- **Security review**: Security checklist reviewed per sprint.
- **Dependency management**: `pnpm install --frozen-lockfile` in
  CI. `pnpm audit` for vulnerability scanning.

## Governance

This constitution is the supreme authority for BetterWorld
development practices. In case of conflict between this document
and any other guidance, this constitution prevails.

- **Amendments**: Any change to this constitution MUST be
  documented with rationale, reviewed by at least one other team
  member, and accompanied by a migration plan if existing code or
  processes are affected.
- **Versioning**: This constitution follows semantic versioning.
  MAJOR: principle removals or redefinitions. MINOR: new principles
  or materially expanded guidance. PATCH: clarifications, wording,
  or non-semantic refinements.
- **Compliance review**: Every PR MUST be checked against active
  principles. The plan template's "Constitution Check" section
  MUST be completed before implementation begins and re-verified
  after design.
- **Complexity justification**: Any violation of these principles
  MUST be documented in the plan's "Complexity Tracking" table
  with the violation, why it is needed, and why a simpler
  alternative was rejected.
- **Principle enforcement**: Principles marked (NON-NEGOTIABLE)
  cannot be waived by complexity justification. They MUST be
  followed without exception.

**Version**: 1.0.0 | **Ratified**: 2026-02-07 | **Last Amended**: 2026-02-07
