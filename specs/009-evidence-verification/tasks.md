# Tasks: Evidence Verification & Completion Workflow

**Input**: Design documents from `/specs/009-evidence-verification/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included — spec requires 25+ new tests covering evidence verification flow (SC-012).

**Organization**: Tasks grouped by user story. 7 user stories across 3 priority tiers (P1: US1-US2, P2: US3-US5, P3: US6-US7).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new dependencies, configure environment

- [X] T001 Install image processing and EXIF dependencies: `pnpm --filter @betterworld/api add sharp exifr blockhash-core` and `pnpm --filter @betterworld/api add -D @types/sharp`
- [X] T002 [P] Add new environment variables to `apps/api/src/config.ts` — SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_STORAGE_BUCKET, VISION_DAILY_BUDGET_CENTS, PEER_REVIEW_REWARD (with Zod validation)
- [X] T003 [P] Create local evidence storage directory `apps/api/storage/evidence/` and add to `.gitignore`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema, enums, and shared helpers that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Add new enums to `packages/db/src/schema/enums.ts` — `evidenceTypeEnum` (photo, video, document, text_report), `evidenceVerificationStageEnum` (pending, ai_processing, peer_review, verified, rejected, appealed, admin_review), `peerReviewVerdictEnum` (approve, reject). Extend `transactionTypeEnum` with `earn_evidence_verified`, `earn_peer_review`
- [X] T005 Create `packages/db/src/schema/evidence.ts` — evidence table (26 columns) with FKs to missions, missionClaims, humanProfiles, tokenTransactions. Indexes: idx_evidence_mission_id, idx_evidence_claim_id, idx_evidence_human_id, idx_evidence_stage, idx_evidence_pending (partial), idx_evidence_peer_review (partial). CHECK constraints: ai_score_range, peer_count_non_negative, peer_needed_positive, has_content. Relations: many-to-one missions/missionClaims/humanProfiles, one-to-many peerReviews/verificationAuditLog
- [X] T006 [P] Create `packages/db/src/schema/peerReviews.ts` — peerReviews table (8 columns) with FKs to evidence, humanProfiles, tokenTransactions. Unique constraint (evidenceId, reviewerHumanId). CHECK constraint: confidence_range (0-1). Indexes: idx_peer_reviews_evidence, idx_peer_reviews_reviewer
- [X] T007 [P] Create `packages/db/src/schema/reviewHistory.ts` — reviewHistory table (5 columns) with FKs to humanProfiles (reviewer + submitter), evidence. CHECK constraint: no_self_review_history (reviewerHumanId != submitterHumanId). Indexes: idx_review_history_reviewer, idx_review_history_submitter, idx_review_history_pair
- [X] T008 [P] Create `packages/db/src/schema/verificationAuditLog.ts` — verificationAuditLog table (9 columns) with FKs to evidence, humanProfiles (nullable). Indexes: idx_audit_evidence, idx_audit_source, idx_audit_created. JSONB metadata column with `{}` default
- [X] T009 Add `isHoneypot` boolean column (default false) to missions table in `packages/db/src/schema/missions.ts`
- [X] T010 Export new schemas from `packages/db/src/schema/index.ts` and register relations
- [X] T011 Generate and apply Drizzle migration: `pnpm --filter @betterworld/db drizzle-kit generate && pnpm --filter @betterworld/db drizzle-kit migrate`
- [X] T012 [P] Create `apps/api/src/lib/evidence-helpers.ts` — EXIF extraction (exifr: latitude, longitude, DateTimeOriginal, Make, Model), file validation (MIME allowlist, 10MB max), GPS distance calculation (Haversine), file type to evidenceType mapping, EXIF PII stripping (remove serial numbers, owner name)
- [X] T013 [P] Create `apps/api/src/lib/storage.ts` — Supabase Storage abstraction (upload file, generate signed URL, delete file) with filesystem fallback for local dev. Path convention: `evidence/{missionId}/{claimId}/{variant}/{filename}`. Signed URL expiry: 1hr upload, 24hr read
- [X] T014 [P] Create `apps/api/src/lib/image-processing.ts` — sharp utilities: WebP conversion, thumbnail generation (200x200), medium-resolution copy (1920x1080 max), image dimension validation

**Checkpoint**: Foundation ready — all 4 new tables + enums + helpers available. User story implementation can begin.

---

## Phase 3: User Story 1 — Submit Evidence for a Claimed Mission (Priority: P1)

**Goal**: Humans upload photos/documents for claimed missions. System extracts metadata, validates, stores securely, and queues for verification.

**Independent Test**: Human with active claim → upload photo → GPS auto-detected → evidence stored with status "pending" → BullMQ job queued.

### Tests for User Story 1

- [X] T015 [P] [US1] Integration test `apps/api/src/__tests__/evidence/evidence-submission.test.ts` — 8 tests: submit evidence (happy path), submit with GPS fallback, reject unsupported file type, reject oversized file, reject without active claim, reject expired mission, reject past deadline, rate limit (10/hr). Mock: sharp, exifr, storage upload, BullMQ

### Implementation for User Story 1

- [X] T016 [US1] Create evidence submission route POST `/api/v1/missions/:missionId/evidence` in `apps/api/src/routes/evidence/index.ts` — multipart FormData parsing (c.req.formData()), Zod validation (1-5 files, MIME allowlist, 10MB max, optional GPS + capturedAt), ownership check (human has active claim on mission, claim not past deadline, mission not expired), EXIF extraction via evidence-helpers, PII stripping, image processing (thumbnail + medium via sharp), upload to storage, create evidence DB record (verificationStage: "pending"), enqueue BullMQ job `evidence:ai-verify`, emit WebSocket `evidence:submitted`. Rate limit: 10/hr/human via Redis sliding window
- [X] T017 [US1] Create evidence list route GET `/api/v1/missions/:missionId/evidence` in `apps/api/src/routes/evidence/index.ts` — cursor pagination, owner sees own evidence only (IDOR protection), signed URLs for contentUrl/thumbnailUrl (1hr expiry)
- [X] T018 [US1] Create evidence detail route GET `/api/v1/evidence/:evidenceId` in `apps/api/src/routes/evidence/index.ts` — full evidence detail with verification status, owner-or-admin access check, signed URLs
- [X] T019 [US1] Register evidence routes in `apps/api/src/routes/index.ts` — mount at `/api/v1/missions/:missionId/evidence` and `/api/v1/evidence`

**Checkpoint**: Evidence submission pipeline complete. Photos upload, metadata extracted, evidence queued for AI verification.

---

## Phase 4: User Story 2 — Automatic AI Verification of Evidence (Priority: P1)

**Goal**: BullMQ worker analyzes evidence with Claude Vision, assigns confidence score, routes to auto-approve / auto-reject / peer review.

**Independent Test**: Submit evidence → worker picks up → Claude Vision scores → high confidence auto-approves, low auto-rejects, ambiguous routes to peer review.

### Tests for User Story 2

- [X] T020 [P] [US2] Integration test `apps/api/src/__tests__/evidence/evidence-verification.test.ts` — 7 tests: AI auto-approve (score >= 0.80), AI auto-reject (score < 0.50), route to peer review (0.50-0.80), budget exceeded fallback to peer review, worker retry on failure, audit log entry created, verification status endpoint. Mock: @anthropic-ai/sdk, Redis cost counter
- [X] T021 [P] [US2] Worker test `apps/api/src/__tests__/workers/evidence-worker.test.ts` — 5 tests: job processing happy path, Claude Vision tool_use response parsing, cost tracking (check-then-increment), dead letter on max retries, concurrent job handling

### Implementation for User Story 2

- [X] T022 [US2] Create evidence verification worker `apps/api/src/workers/evidence-verification.ts` — BullMQ worker on `evidence:ai-verify` queue. Flow: (1) fetch evidence + mission from DB, (2) check daily vision budget (Redis `cost:daily:vision:evidence`, GET first), (3) if over budget → route to peer review with audit note, (4) download evidence from storage, (5) call Claude Sonnet Vision with tool_use (forced `tool_choice: { type: "tool", name: "verify_evidence" }`), (6) parse structured output (relevanceScore, gpsPlausibility, timestampPlausibility, authenticityScore, requirementChecklist, overallConfidence, reasoning), (7) INCR cost counter only after success, (8) update evidence row (aiVerificationScore, aiVerificationReasoning, verificationStage), (9) route based on score: >= 0.80 → verified + trigger reward, < 0.50 → rejected, 0.50-0.80 → peer_review, (10) create audit log entry. Config: concurrency 3, 3 retries, exponential backoff, dead letter queue
- [X] T023 [US2] Create verification status route GET `/api/v1/evidence/:evidenceId/status` in `apps/api/src/routes/evidence/verify.ts` — return verificationStage, aiVerificationScore, aiVerificationReasoning, peerReviewCount, peerReviewsNeeded, peerVerdict, finalVerdict, finalConfidence, rewardAmount. Owner-only access
- [X] T024 [US2] Add `dev:worker:evidence` script to `apps/api/package.json` — runs evidence-verification worker via tsx
- [X] T025 [US2] Register verify routes in `apps/api/src/routes/index.ts`

**Checkpoint**: AI verification pipeline end-to-end. Evidence submitted → AI scores → auto-routes based on confidence thresholds.

---

## Phase 5: User Story 3 — Peer Review of Ambiguous Evidence (Priority: P2)

**Goal**: Evidence with ambiguous AI scores assigned to 1-3 stranger reviewers. Reviewers vote approve/reject. Majority verdict determines outcome.

**Independent Test**: Evidence in `peer_review` stage → appears in reviewer queue → reviewer submits vote → after 3 votes → verdict computed → evidence moves to verified/rejected.

### Tests for User Story 3

- [X] T026 [P] [US3] Integration test `apps/api/src/__tests__/evidence/peer-review.test.ts` — 10 tests: pending queue (happy path), vote approve, vote reject, majority verdict approve (2/3), majority verdict reject (2/3), no self-review, 2-hop exclusion enforcement, duplicate vote prevention, reviewer reward distribution (2 IT), confidence aggregation formula

### Implementation for User Story 3

- [X] T027 [US3] Create `apps/api/src/lib/peer-assignment.ts` — stranger-only assignment algorithm with 2-hop transitive exclusion. SQL query: exclude (1) self, (2) direct reviewer-submitter pairs, (3) 2-hop transitive chains via reviewHistory table. Edge case: if < 2 eligible reviewers → escalate to admin_review with audit note. Return up to 3 reviewer IDs ordered by RANDOM()
- [X] T028 [US3] Create peer review routes in `apps/api/src/routes/peer-reviews/index.ts`:
  - GET `/api/v1/peer-reviews/pending` — list evidence assigned to this reviewer, not yet voted. Include mission context (title, description truncated 300 chars), evidence URLs (signed 1hr), GPS comparison (Haversine distance). Cursor pagination
  - POST `/api/v1/peer-reviews/:evidenceId/vote` — Zod validation (verdict: approve/reject, confidence: 0-1, reasoning: 20-2000 chars). Checks: assigned reviewer, evidence in peer_review stage, no duplicate vote. Create peerReview record. If count >= peerReviewsNeeded: compute peerConfidence (confidence-weighted), compute finalConfidence (aiScore * 0.4 + peerConfidence * 0.6), set finalVerdict (>= 0.60 AND peerVerdict approve → verified, else rejected). Trigger reward if verified. Create reviewHistory entry. Create audit log entry. Rate limit: 30/hr/human
  - GET `/api/v1/peer-reviews/history` — list past votes by this human. Cursor pagination
- [X] T029 [US3] Integrate peer assignment into evidence verification worker — when routing to peer_review, call peer-assignment to select reviewers and create assignment records
- [X] T030 [US3] Register peer-review routes in `apps/api/src/routes/index.ts`

**Checkpoint**: Full peer review loop working. Ambiguous evidence → assigned to strangers → votes collected → verdict computed.

---

## Phase 6: User Story 4 — Earn Token Rewards on Verification (Priority: P2)

**Goal**: Auto-distribute ImpactTokens when evidence verified. Reward = mission.tokenReward * finalConfidence. Peer reviewers earn 2 IT per review.

**Independent Test**: Evidence verified → submitter balance increases by floor(reward * confidence) → transaction record with double-entry accounting.

### Tests for User Story 4

- [X] T031 [P] [US4] Integration test in `apps/api/src/__tests__/evidence/evidence-submission.test.ts` (extend) — 4 tests: evidence reward distribution (happy path, reward = floor(tokenReward * confidence)), peer review reward (2 IT), idempotency key prevents duplicate rewards, WebSocket events (evidence:verified, evidence:rejected)

### Implementation for User Story 4

- [X] T032 [US4] Create `apps/api/src/lib/reward-helpers.ts` — `distributeEvidenceReward(evidenceId)`: fetch evidence + mission, calculate reward = floor(mission.tokenReward * finalConfidence), min 1 IT. Transaction: BEGIN → SELECT humanProfiles FOR UPDATE → compute newBalance → UPDATE balance → INSERT tokenTransactions (type: earn_evidence_verified, idempotencyKey: `evidence-reward:{evidenceId}`, balanceBefore, balanceAfter) → UPDATE evidence (rewardTransactionId) → COMMIT. `distributePeerReviewReward(peerReviewId, reviewerHumanId)`: fixed 2 IT. Same double-entry pattern with idempotencyKey `peer-review-reward:{peerReviewId}`
- [X] T033 [US4] Integrate reward distribution into verification worker (auto-approve path) and peer review vote handler (final verdict path) — call `distributeEvidenceReward` when finalVerdict = "verified", call `distributePeerReviewReward` on each vote submission
- [X] T034 [US4] Emit WebSocket events — `evidence:verified` (missionId, evidenceId, humanId, rewardAmount, finalConfidence) and `evidence:rejected` (missionId, evidenceId, humanId, reason) via existing WebSocket infrastructure

**Checkpoint**: Complete reward loop. Evidence verified → tokens distributed → transaction recorded → human notified.

---

## Phase 7: User Story 5 — Evidence Submission UI (Mobile-First) (Priority: P2)

**Goal**: Mobile-optimized submission interface with camera capture, GPS detection, checklist, preview, and offline support.

**Independent Test**: Open on mobile → capture photo → GPS detected → checklist shows pass/fail → preview with map pin → submit → confirmation.

### Implementation for User Story 5

- [X] T035 [P] [US5] Create `apps/web/src/components/evidence/EvidenceSubmitForm.tsx` — camera capture (input type="file" accept="image/*" capture="environment"), gallery upload, GPS auto-detection (navigator.geolocation.getCurrentPosition), file preview (URL.createObjectURL), multiple file support (1-5), notes text area (max 2000 chars). Mobile-first responsive layout
- [X] T036 [P] [US5] Create `apps/web/src/components/evidence/GPSIndicator.tsx` — GPS status badge: detecting (spinner), detected (green check + coordinates), denied (warning + manual entry prompt), unavailable (info + EXIF fallback note)
- [X] T037 [P] [US5] Create `apps/web/src/components/evidence/EvidenceChecklist.tsx` — pre-submission checklist: photo clear? (always pass if file selected), GPS detected? (green/red based on GPS state), all requirements met? (parsed from mission.evidenceRequired), file size OK? (< 10MB check). Submit button disabled until minimum criteria met
- [X] T038 [P] [US5] Create `apps/web/src/components/evidence/EvidencePreview.tsx` — photo thumbnail preview, extracted GPS on map pin (Leaflet via next/dynamic), file metadata display (size, type, dimensions), captured-at timestamp
- [X] T039 [US5] Create `apps/web/app/missions/[id]/submit/page.tsx` — evidence submission page. Fetch mission detail + claim status. Compose EvidenceSubmitForm + GPSIndicator + EvidenceChecklist + EvidencePreview. Form submission via humanApi POST multipart. Success redirect to mission detail with status toast. Error handling with retry guidance
- [X] T040 [P] [US5] Create `apps/web/src/components/evidence/VerificationStatus.tsx` — timeline display: submitted → AI reviewing → peer review (X/3 votes) → verified/rejected. Poll GET `/api/v1/evidence/:id/status` every 10s while in non-terminal state. Show reward amount when verified

**Checkpoint**: Mobile-first evidence UI complete. Capture → validate → preview → submit → track status.

---

## Phase 8: User Story 6 — Fraud Detection via Honeypot Missions (Priority: P3)

**Goal**: 5 seeded impossible missions detect naive fraud. Submissions auto-rejected, fraud score incremented, account flagged at 3 strikes.

**Independent Test**: Submit evidence for honeypot → auto-reject → fraud score incremented in Redis → 3 strikes → account flagged.

### Tests for User Story 6

- [X] T041 [P] [US6] Integration test `apps/api/src/__tests__/evidence/evidence-submission.test.ts` (extend) — 3 tests: honeypot auto-reject, fraud score increment (Redis), account flag at 3 honeypot submissions

### Implementation for User Story 6

- [X] T042 [US6] Add honeypot detection to evidence submission route in `apps/api/src/routes/evidence/index.ts` — before queuing AI verification, check `mission.isHoneypot`. If true: set evidence `isHoneypotSubmission = true`, set verificationStage = "rejected", INCR Redis `fraud:honeypot:{humanId}`, if counter >= 3 flag account for admin review, create audit log entry (decisionSource: "system", decision: "rejected", reasoning: "Honeypot mission submission"). Return normal 201 response (don't reveal honeypot detection to user)
- [X] T043 [US6] Create honeypot seed script `packages/db/src/seed/honeypots.ts` — 5 impossible missions: (1) GPS in Pacific Ocean, (2) GPS in Antarctica, (3) future deadline (year 2099), (4) non-existent address, (5) physically impossible task (e.g., "Count all stars visible from downtown Manhattan"). Mark `isHoneypot: true`. Add `seed:honeypots` script to `packages/db/package.json`

**Checkpoint**: Honeypot fraud detection active. Impossible missions seeded, submissions detected and scored.

---

## Phase 9: User Story 7 — Verification Audit Trail & Dispute Resolution (Priority: P3)

**Goal**: Immutable audit log for all decisions. Appeals workflow. Admin dispute queue with binding decisions.

**Independent Test**: Evidence rejected → human sees reason → appeals → admin reviews with full context → approves/upholds → reward distributed or rejection finalized.

### Tests for User Story 7

- [X] T044 [P] [US7] Integration test `apps/api/src/__tests__/admin/disputes.test.ts` — 5 tests: list disputes (pending/resolved), resolve approve (reward distributed), resolve reject (final), appeal flow (reject → appeal → admin approve), audit log entries for all decisions

### Implementation for User Story 7

- [X] T045 [US7] Create appeal route POST `/api/v1/evidence/:evidenceId/appeal` in `apps/api/src/routes/evidence/verify.ts` — Zod validation (reason: 20-2000 chars). Checks: evidence finalVerdict = "rejected", not already appealed, owner only. Update verificationStage to "appealed", reset finalVerdict to null. Create audit log entry. Rate limit: 3 appeals/day/human. Emit WebSocket `evidence:appealed`
- [X] T046 [US7] Create admin dispute routes in `apps/api/src/routes/admin/disputes.ts`:
  - GET `/api/v1/admin/disputes` — list appealed evidence with full context (mission title, submitter name, appeal reason, AI score + reasoning, all peer reviews, evidence URLs signed 1hr, GPS comparison). Filter by status (pending/resolved). Cursor pagination. Admin-only auth
  - POST `/api/v1/admin/disputes/:evidenceId/resolve` — Zod validation (decision: approve/reject, reasoning: 10-5000 chars). Checks: evidence in appealed/admin_review stage, not already resolved. If approve: set verificationStage = "verified", finalVerdict = "verified", finalConfidence = 1.00, distribute full reward (mission.tokenReward * 1.00). If reject: set verificationStage = "rejected", finalVerdict = "rejected" (final). Create audit log entry with admin ID. Emit WebSocket event
- [X] T047 [US7] Register admin dispute routes in `apps/api/src/routes/index.ts`
- [X] T048 [P] [US7] Create `apps/web/app/reviews/page.tsx` — peer review queue page. List pending reviews (GET `/api/v1/peer-reviews/pending`). Each card: evidence image viewer (zoom), mission requirements, GPS comparison map, vote form (approve/reject + confidence slider + reasoning textarea). Submit vote. Show reward earned (2 IT toast)
- [X] T049 [P] [US7] Create `apps/web/src/components/reviews/ReviewCard.tsx` — evidence viewer with image zoom (CSS transform scale), mission context panel, GPS overlay map (Leaflet), vote form with confidence slider (0-100%), reasoning textarea (min 20 chars), submit button
- [X] T050 [P] [US7] Create `apps/web/src/components/reviews/ReviewQueue.tsx` — list of pending review cards with empty state. Show count badge. Link from dashboard
- [X] T051 [P] [US7] Create `apps/web/src/components/reviews/EvidenceViewer.tsx` — full-screen image viewer with pinch zoom (mobile), GPS overlay with mission pin + evidence pin + distance line, metadata panel (type, size, captured at)

**Checkpoint**: Full audit trail + disputes working. Every decision logged. Appeals flow through admin. Frontend review queue operational.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Integration, quality, and cross-story concerns

- [X] T052 Update `apps/web/src/components/dashboard/` — add evidence status cards (pending/verified/rejected count), recent verification activity, peer reviews completed count
- [X] T053 Run full test suite `pnpm test` — verify 810+ existing tests pass, 25+ new evidence tests pass (target: 835+ total)
- [X] T054 TypeScript strict check `pnpm typecheck` — zero errors across all packages
- [X] T055 ESLint check `pnpm lint` — zero errors
- [X] T056 [P] Update mission detail page `apps/web/app/missions/[id]/page.tsx` — add "Submit Evidence" button (visible when human has active claim), link to `/missions/[id]/submit`
- [X] T057 [P] Update human dashboard page — add "Pending Reviews" badge linking to `/reviews`
- [X] T058 Run quickstart.md validation — verify all setup steps work end-to-end in fresh environment

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001 for sharp/exifr) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 completion (schema + helpers)
- **US2 (Phase 4)**: Depends on US1 (evidence must exist to verify)
- **US3 (Phase 5)**: Depends on US2 (AI routing to peer review)
- **US4 (Phase 6)**: Depends on US2 + US3 (reward triggered by verification outcomes)
- **US5 (Phase 7)**: Depends on US1 routes (frontend calls submission API). Can run in parallel with US2-US4 backend work
- **US6 (Phase 8)**: Depends on US1 (honeypot check in submission route). Can run in parallel with US2-US5
- **US7 (Phase 9)**: Depends on US2 + US3 (audit entries from AI + peer decisions)
- **Polish (Phase 10)**: Depends on all desired user stories being complete

### Within Each User Story

- Tests written FIRST, ensure they FAIL before implementation
- Schema/models before helpers
- Helpers before routes
- Routes before worker integration
- Backend before frontend
- Core implementation before integration

### Parallel Opportunities

- **Phase 2**: T006, T007, T008 can run in parallel (independent schema files). T012, T013, T014 can run in parallel (independent helper files)
- **Phase 3-4 vs Phase 7**: Frontend (US5) can start once US1 routes exist, parallel with US2-US4 backend
- **Phase 8**: Honeypot detection (US6) can start once US1 exists, parallel with US3-US5
- **Phase 9**: T048-T051 (frontend review components) can run in parallel
- **Phase 10**: T052, T056, T057 can run in parallel

### Critical Path

```
T001 → T004 → T005 → T010 → T011 → T016 → T022 → T027/T028 → T032 → T045/T046
Setup   Enums   Schema  Export  Migrate  Submit   Worker   Peer     Reward   Disputes
                                         Route    AI       Review   Distrib  Admin
```

---

## Task Count Summary

| Phase | Tasks | Tests |
|-------|-------|-------|
| Phase 1: Setup | 3 | 0 |
| Phase 2: Foundational | 11 | 0 |
| Phase 3: US1 Evidence Submission | 5 | 8 tests in 1 file |
| Phase 4: US2 AI Verification | 6 | 12 tests in 2 files |
| Phase 5: US3 Peer Review | 5 | 10 tests in 1 file |
| Phase 6: US4 Token Rewards | 3 | 4 tests in 1 file |
| Phase 7: US5 Submission UI | 6 | 0 |
| Phase 8: US6 Honeypots | 3 | 3 tests in 1 file |
| Phase 9: US7 Audit & Disputes | 8 | 5 tests in 1 file |
| Phase 10: Polish | 7 | 0 |
| **Total** | **57** | **42 tests in 6 files** |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Total test target: 810 existing + 42 new = 852+ tests
