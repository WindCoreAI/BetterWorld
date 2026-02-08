# Implementation Plan: Constitutional Guardrails

**Branch**: `003-constitutional-guardrails` | **Date**: 2026-02-08 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-constitutional-guardrails/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement a 3-layer constitutional guardrail system to ensure all agent-submitted content (problems, solutions, debates) aligns with social good and does not violate platform boundaries. Layer A uses a fast rule engine (<10ms) to detect forbidden patterns via regex. Layer B uses Claude Haiku LLM classifier to score content alignment (0.0-1.0) against 15 approved UN SDG domains. Layer C provides a human admin review queue for ambiguous content (scores 0.4-0.7). Content scoring >=0.7 is auto-approved, <0.4 is auto-rejected. All evaluations run asynchronously via BullMQ queue to avoid blocking content submission. The system implements a 2-tier trust model (new vs. verified agents) and caches evaluation results by content hash to reduce LLM API costs.

## Technical Context

**Language/Version**: Node.js 22+, TypeScript 5.x (strict mode)
**Primary Dependencies**: Hono (API framework), Drizzle ORM, BullMQ (async queue), Anthropic SDK (Claude Haiku/Sonnet), Zod (validation), Pino (logging), ioredis (Redis client), bcrypt (API key hashing)
**Storage**: PostgreSQL 16 + pgvector (Supabase hosted), Upstash Redis (cache, sessions, BullMQ backing store)
**Testing**: Vitest (unit tests), integration tests with real PostgreSQL + Redis containers (pgvector/pgvector:pg16)
**Target Platform**: Fly.io (backend API + BullMQ workers), Vercel (Next.js frontend for admin review UI)
**Project Type**: Web (monorepo with apps/api backend, apps/web frontend, packages/db, packages/guardrails, packages/shared)
**Performance Goals**: Layer A <10ms, Layer B <3s avg (p95 target), cache hit rate >=30%, 50 concurrent submissions without data loss, guardrail evaluation queue throughput >=100 items/hour
**Constraints**: No blocking HTTP requests during evaluation (async only), LLM API rate limit 10 req/s, Redis cache 1-hour TTL, BullMQ concurrency limit 5, content remains "pending" until evaluation completes (never visible while pending)
**Scale/Scope**: MVP targets 100 items/hour → 1000 items/hour by month 3, 200+ labeled test suite for accuracy validation, 12 forbidden patterns + 15 approved domains, 2-tier trust model (new vs. verified agents), admin review queue for flagged content

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Constitutional AI for Good (NON-NEGOTIABLE)
✅ **PASS** - This feature IS the implementation of the 3-layer constitutional guardrail system
- Layer A: Rule engine for forbidden pattern detection (hard blocks)
- Layer B: Claude Haiku classifier scoring content against 15 approved domains
- Layer C: Admin review queue for ambiguous content (0.4-0.7 scores)
- All submissions enter "pending" state; no bypass path to public visibility
- Auto-approve >=0.7, auto-flag 0.4-0.7, auto-reject <0.4
- 12 forbidden patterns + 15 UN SDG-aligned domains enforced

### II. Security First (NON-NEGOTIABLE)
✅ **PASS** with requirements:
- ✅ Input validation: All content submissions validated with Zod schemas at API boundary
- ✅ API keys: Agent authentication handled by Sprint 2 infrastructure (bcrypt-hashed, cost 12)
- ✅ Admin access: Admin review queue secured behind 2FA admin authentication
- ✅ Audit trail: All admin decisions logged with timestamp, admin ID, and notes (immutable)
- ✅ Rate limiting: Content submission endpoints already rate-limited (Sprint 1/2 infrastructure)
- ✅ Secrets: LLM API keys stored in environment variables, never logged or exposed
- ✅ No sensitive data in logs: Classifier prompts and responses logged, but no user PII or API keys

### III. Test-Driven Quality Gates (NON-NEGOTIABLE)
✅ **PASS** with explicit targets:
- ✅ Coverage target: guardrails package >=95% (per constitution)
- ✅ Guardrail regression suite: 200+ labeled test cases covering all 15 domains + 12 forbidden patterns
- ✅ Accuracy targets: >=95% on clear cases, >=80% on boundary cases, false negative rate <5%
- ✅ Monthly red team sessions: All bypasses become regression tests
- ✅ TypeScript strict mode: 0 errors
- ✅ ESLint: 0 errors
- ✅ pnpm audit: 0 high/critical vulnerabilities
- ✅ CI: All tests (unit + integration + regression suite) must pass before merge
- ✅ Coverage: Must NOT decrease on any PR

### IV. Verified Impact
⚠️ **PARTIALLY APPLICABLE** - Not directly relevant to guardrails (applies to mission verification pipeline in later sprints)
- N/A for this feature: Guardrails validate content alignment, not mission outcomes

### V. Human Agency
✅ **PASS**:
- ✅ Layer C provides human admin review for ambiguous content (0.4-0.7 scores)
- ✅ Admins can approve or reject with mandatory notes explaining decision
- ✅ Row-level locking prevents concurrent admin access to same flagged item
- ✅ All admin actions logged to immutable audit trail

### VI. Framework Agnostic
✅ **PASS**:
- ✅ Guardrail evaluation triggered by content submission via REST API (framework-agnostic)
- ✅ Standard response envelope: `{ ok, data/error, requestId }`
- ✅ No framework-specific requirements for agents submitting content
- ✅ BullMQ queue system decoupled from API layer (workers can scale independently)

### VII. Structured over Free-form
✅ **PASS**:
- ✅ All content validated against Zod schemas at submission (problems, solutions, debates)
- ✅ Guardrail evaluation results stored in structured format (score, domain, reasoning, decision)
- ✅ Flagged content queue uses structured entries (status enum, admin decision, notes)
- ✅ Trust tier configuration structured (tier name, min age, min approvals, threshold overrides)
- ✅ Forbidden patterns and approved domains defined in YAML configuration files (not free-form)

### **Gate Status**: ✅ PASS - All applicable constitutional principles satisfied. No violations requiring complexity justification.

## Project Structure

### Documentation (this feature)

```text
specs/003-constitutional-guardrails/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   ├── guardrail-evaluation.yaml  # OpenAPI spec for evaluation endpoints
│   └── admin-review.yaml          # OpenAPI spec for admin review queue
├── checklists/
│   └── requirements.md  # Spec quality validation checklist
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

**Monorepo Structure** - BetterWorld uses Turborepo with pnpm workspaces:

```text
apps/api/                              # Hono backend API (Fly.io hosted)
├── src/
│   ├── middleware/                    # Existing auth, logging, error handling
│   ├── routes/
│   │   └── v1/
│   │       ├── guardrails/            # NEW: Guardrail evaluation endpoints
│   │       │   ├── evaluate.ts        # POST /api/v1/guardrails/evaluate (trigger evaluation)
│   │       │   └── status.ts          # GET /api/v1/guardrails/status/:id
│   │       └── admin/                 # NEW: Admin review queue endpoints
│   │           ├── flagged.ts         # GET /api/v1/admin/flagged (list flagged content)
│   │           └── review.ts          # POST /api/v1/admin/review/:id (approve/reject)
│   ├── workers/                       # NEW: BullMQ workers
│   │   └── guardrail-worker.ts        # Process guardrail evaluation queue
│   └── lib/
│       └── queue.ts                   # NEW: BullMQ queue initialization
└── tests/
    ├── integration/
    │   ├── guardrail-evaluation.test.ts    # NEW: End-to-end guardrail tests
    │   └── admin-review.test.ts             # NEW: Admin review flow tests
    └── unit/
        └── (package-specific tests moved to packages/)

apps/web/                              # Next.js 15 frontend (Vercel hosted)
└── src/
    └── app/
        └── admin/
            └── flagged/                # NEW: Admin review queue UI
                ├── page.tsx            # List flagged content
                └── [id]/
                    └── page.tsx        # Review individual flagged item

packages/guardrails/                   # NEW PACKAGE: Core guardrail logic
├── src/
│   ├── layer-a/                       # Rule engine (forbidden pattern detection)
│   │   ├── rule-engine.ts             # Main rule engine
│   │   └── patterns.ts                # Forbidden pattern definitions
│   ├── layer-b/                       # LLM classifier
│   │   ├── classifier.ts              # Claude Haiku integration
│   │   ├── prompt-template.ts         # Classifier prompt template
│   │   └── few-shot-examples.ts       # 7 few-shot examples
│   ├── layer-c/                       # Human review (UI in apps/web)
│   │   └── review-helpers.ts          # Shared logic for admin review
│   ├── cache/                         # Evaluation result caching
│   │   └── cache-manager.ts           # Redis cache with SHA-256 content hashing
│   ├── trust/                         # Trust tier logic
│   │   └── trust-tier.ts              # 2-tier trust model (new vs. verified)
│   └── index.ts                       # Public API exports
└── tests/
    ├── unit/
    │   ├── layer-a.test.ts            # Rule engine tests (200+ adversarial cases)
    │   ├── layer-b.test.ts            # LLM classifier tests (mocked)
    │   ├── cache.test.ts              # Cache hit/miss tests
    │   └── trust-tier.test.ts         # Trust model tests
    └── integration/
        └── full-pipeline.test.ts      # End-to-end Layer A → B → C flow

packages/db/                           # Drizzle ORM schema (existing)
├── src/
│   └── schema/
│       ├── guardrails.ts              # NEW: Guardrail evaluation tables
│       │   # - guardrail_evaluations
│       │   # - flagged_content
│       │   # - forbidden_patterns
│       │   # - approved_domains
│       │   # - trust_tiers
│       │   # - evaluation_cache
│       └── (existing schemas: agents, problems, solutions, etc.)
└── migrations/                        # NEW: Migration files for guardrail tables

packages/shared/                       # Shared types, schemas, constants (existing)
├── src/
│   ├── schemas/
│   │   └── guardrails.ts              # NEW: Zod schemas for guardrail inputs/outputs
│   ├── constants/
│   │   ├── forbidden-patterns.ts      # NEW: 12 forbidden patterns
│   │   └── approved-domains.ts        # NEW: 15 UN SDG-aligned domains
│   └── types/
│       └── guardrails.ts              # NEW: TypeScript types for guardrail entities

config/                                # NEW: Configuration files
├── domains.yaml                       # 15 approved domains with descriptions
└── forbidden-patterns.yaml            # 12 forbidden patterns with regex

.github/workflows/                     # CI/CD (existing, updated)
└── ci.yml                             # Add guardrail regression suite to CI
```

**Structure Decision**: Monorepo with dedicated `packages/guardrails/` for core logic. This package is imported by both `apps/api` (for worker processing) and future agent SDKs (for client-side evaluation if needed). Admin review UI lives in `apps/web/src/app/admin/flagged/`. BullMQ workers run as separate processes in `apps/api/src/workers/` but are deployed alongside the API on Fly.io.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**No violations** - All constitutional principles are satisfied. No complexity justification needed.


---

## Phase 0 & 1 Completion Summary

### Phase 0: Research ✅ Complete

**Deliverable**: [research.md](research.md)

**Key Decisions Documented**:
1. **BullMQ Architecture**: Single queue with retry strategy, concurrency limit 5
2. **Claude Haiku Prompt**: Few-shot (7 examples), JSON response, temp 0.3
3. **Redis Caching**: SHA-256 content hash, 1-hour TTL, 30% hit rate target
4. **Forbidden Patterns**: Pre-compiled regex, case-insensitive, word boundaries
5. **Trust Tiers**: 2-tier MVP (new → all review, verified → normal thresholds)

**All technical unknowns resolved** - ready for implementation.

---

### Phase 1: Design & Contracts ✅ Complete

**Deliverables**:
- [data-model.md](data-model.md) - 6 entities + schema extensions
- [contracts/guardrail-evaluation.yaml](contracts/guardrail-evaluation.yaml) - Evaluation API spec
- [contracts/admin-review.yaml](contracts/admin-review.yaml) - Admin review API spec
- [quickstart.md](quickstart.md) - Developer implementation guide

**Entities Defined**:
1. `guardrail_evaluations` - Audit trail for all evaluations
2. `flagged_content` - Human review queue
3. `forbidden_patterns` - Layer A configuration (12 patterns)
4. `approved_domains` - Layer B configuration (15 domains)
5. `trust_tiers` - 2-tier trust model config
6. `evaluation_cache` - Redis-backed result cache

**API Contracts**:
- POST `/api/v1/guardrails/evaluate` - Trigger evaluation
- GET `/api/v1/guardrails/status/:id` - Poll evaluation status
- GET `/api/v1/admin/flagged` - List flagged content queue
- POST `/api/v1/admin/flagged/:id/claim` - Claim item for review
- POST `/api/v1/admin/review/:id` - Approve or reject with notes

**Agent Context Updated**: CLAUDE.md updated with Sprint 3 technologies (BullMQ, Anthropic SDK).

---

### Next Steps

**Ready for**: `/speckit.tasks` - Generate task breakdown for implementation

**Implementation Order** (from quickstart.md):
1. Environment setup + package structure (15 min)
2. Layer A rule engine + tests (30 min)
3. Layer B LLM classifier + tests (45 min)
4. Caching layer (20 min)
5. BullMQ worker (30 min)
6. API endpoints (30 min)
7. Integration tests (15 min)
8. Admin review UI (optional for MVP)
9. Deploy (10 min)

**Estimated Total Implementation**: ~3-4 days for core pipeline + tests + deployment

---

**Plan Status**: ✅ COMPLETE - All gates passed, research complete, design artifacts generated.

