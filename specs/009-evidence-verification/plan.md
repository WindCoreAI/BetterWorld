# Implementation Plan: Evidence Verification & Completion Workflow

**Branch**: `009-evidence-verification` | **Date**: 2026-02-10 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/009-evidence-verification/spec.md`

## Summary

Implement the evidence verification pipeline that closes the mission completion loop: humans submit proof (photos, GPS, documents) for claimed missions, the system verifies evidence through AI (Claude Vision) and peer review, and distributes ImpactToken rewards upon approval. This includes 5 new database tables, ~12 API routes, a BullMQ verification worker, mobile-first submission UI, peer review UI, and honeypot fraud detection.

## Technical Context

**Language/Version**: TypeScript 5.x strict mode, Node.js 22+
**Primary Dependencies**: Hono (API), Drizzle ORM, @anthropic-ai/sdk (Claude Vision), sharp (image processing), exifr (EXIF extraction), BullMQ (async jobs), jose (JWT), ioredis
**Storage**: PostgreSQL 16 (Supabase), Supabase Storage (evidence media), Upstash Redis (cache, rate limits, cost tracking)
**Testing**: Vitest (unit + integration), 810+ existing tests must pass, 25+ new tests
**Target Platform**: Web (Vercel frontend), Fly.io (API + workers)
**Project Type**: Monorepo (Turborepo + pnpm workspaces)
**Performance Goals**: AI verification < 30s, API p95 < 500ms, evidence upload < 5s for 10MB
**Constraints**: 10MB max upload, 10 uploads/hour/human, $37/day Vision API budget, offline-capable submission
**Scale/Scope**: ~500 evidence submissions/day at Phase 2 scale, 5K concurrent users

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Constitutional AI for Good | PASS | Evidence submissions pass through existing guardrail Layer A (text content) + new AI verification (photos). Evidence types map to 15 UN SDG domains via parent mission. |
| II. Security First | PASS | Supabase Storage signed URLs (1hr expiry), EXIF PII stripping, rate limiting (10/hr), Zod validation at all boundaries, audit trail for all decisions. No secrets in logs. |
| III. Test-Driven Quality Gates | PASS | 25+ new integration tests, all 810 existing tests preserved, TypeScript strict 0 errors, ESLint 0 errors. Coverage targets maintained. |
| IV. Verified Impact | PASS | **This sprint directly implements Principle IV.** Multi-stage pipeline: EXIF metadata → AI Vision → peer review. Double-entry token accounting with SELECT FOR UPDATE. Idempotent rewards. |
| V. Human Agency | PASS | Humans voluntarily submit evidence. Appeals workflow for disputed rejections. No penalty for incomplete submissions beyond losing claim slot (existing behavior). |
| VI. Framework Agnostic | PASS | Evidence API uses standard REST envelope `{ ok, data/error, requestId }`. Cursor-based pagination for review queues. No framework-specific integrations. |
| VII. Structured over Free-form | PASS | Evidence submissions follow defined schema (Zod-validated). Verification scores are structured (0.0-1.0 confidence). Audit log entries have defined format. |

**Gate Result**: ALL PASS. No violations. Proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/009-evidence-verification/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0: technology decisions
├── data-model.md        # Phase 1: entity schemas + state machines
├── quickstart.md        # Phase 1: local dev setup
├── contracts/           # Phase 1: API endpoint contracts
│   ├── evidence-submission.md
│   ├── evidence-verification.md
│   ├── peer-review.md
│   ├── token-rewards.md
│   └── admin-disputes.md
└── tasks.md             # Phase 2: implementation tasks (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/db/src/schema/
├── evidence.ts              # Evidence table + relations
├── peerReviews.ts           # Peer review votes table
├── reviewHistory.ts         # Reviewer-submitter pairs (2-hop exclusion)
├── verificationAuditLog.ts  # Immutable audit trail
└── enums.ts                 # + evidenceTypeEnum, evidenceVerificationStageEnum, peerReviewVerdictEnum

apps/api/src/
├── routes/
│   ├── evidence/
│   │   ├── index.ts         # POST submit, GET list, GET detail
│   │   └── verify.ts        # Verification status + appeals
│   ├── peer-reviews/
│   │   └── index.ts         # GET pending, POST vote, GET history
│   └── admin/
│       └── disputes.ts      # GET disputes queue, POST resolve
├── workers/
│   └── evidence-verification.ts  # BullMQ: AI verification + routing
├── lib/
│   ├── evidence-helpers.ts  # EXIF extraction, GPS validation, file validation
│   ├── peer-assignment.ts   # Stranger-only 2-hop exclusion algorithm
│   └── reward-helpers.ts    # Token reward calculation + distribution
└── __tests__/
    ├── evidence/
    │   ├── evidence-submission.test.ts
    │   ├── evidence-verification.test.ts
    │   └── peer-review.test.ts
    ├── workers/
    │   └── evidence-worker.test.ts
    └── admin/
        └── disputes.test.ts

apps/web/
├── app/
│   ├── missions/[id]/submit/page.tsx    # Evidence submission page
│   └── reviews/page.tsx                 # Peer review queue page
└── src/
    └── components/
        ├── evidence/
        │   ├── EvidenceSubmitForm.tsx    # Camera capture + upload
        │   ├── EvidencePreview.tsx       # Preview with map pin
        │   ├── EvidenceChecklist.tsx     # Pre-submission checklist
        │   ├── GPSIndicator.tsx          # GPS status badge
        │   └── VerificationStatus.tsx    # Status timeline
        └── reviews/
            ├── ReviewQueue.tsx           # Pending reviews list
            ├── ReviewCard.tsx            # Evidence viewer + vote form
            └── EvidenceViewer.tsx        # Image zoom + GPS overlay
```

**Structure Decision**: Follows existing monorepo pattern. Evidence routes parallel missions/ structure. Worker follows guardrail worker pattern. Frontend components in `src/components/evidence/` with pages in `app/missions/[id]/submit/`.

## Complexity Tracking

No constitution violations to justify.
