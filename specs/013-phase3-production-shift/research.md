# Research: Phase 3 — Production Shift

**Branch**: `013-phase3-production-shift` | **Date**: 2026-02-12

## R1: Traffic Routing — Hash-Based Deterministic Selection

**Decision**: Use `SHA-256(submission_id) mod 100 < traffic_pct` for deterministic routing.

**Rationale**: SHA-256 provides uniform distribution across the 0–99 range, ensuring the exact configured percentage of submissions route to peer consensus. Using the submission UUID as input guarantees the same submission always follows the same path (no flapping). This is the standard canary deployment technique used in feature flagging systems.

**Alternatives Considered**:
- Random selection (`Math.random() < pct/100`): Rejected — non-deterministic, same submission could route differently on retry, complicates debugging.
- Round-robin: Rejected — requires shared counter state across workers, doesn't guarantee percentage accuracy at low volumes.
- Modular arithmetic on auto-increment ID: Rejected — UUIDs are the primary key; no sequential IDs available.

**Implementation Notes**:
- Insert routing logic in `guardrail-worker.ts` at line ~266 (after Layer B decision, before shadow peer enqueue).
- When routed to peer consensus: set `guardrailEvaluations.routingDecision = 'peer_consensus'`, enqueue peer job, and **do not** apply Layer B finalDecision as production decision. Instead, hold in "pending" until consensus completes.
- When peer consensus completes: consensus-engine.ts updates `guardrailEvaluations.finalDecision` from consensus result.
- Fallback: if consensus fails (timeout/no quorum), fall back to Layer B result already computed and cached.

---

## R2: Submission Cost Integration Point

**Decision**: Deduct credits **before** enqueuing to the guardrail pipeline, in the content creation route handlers (problems.routes.ts, solutions.routes.ts, debates.routes.ts).

**Rationale**: Deducting at submission time (not after evaluation) ensures credits are consumed regardless of evaluation outcome. This prevents free-riding where agents submit content hoping it gets rejected and refunded. The pattern matches how traditional SaaS platforms charge for API calls regardless of success.

**Alternatives Considered**:
- Deduct after approval: Rejected — allows spam flooding with content that gets rejected for free.
- Deduct in guardrail worker: Rejected — async deduction creates race conditions where an agent submits 100 items before the first deduction processes.
- Reserve + commit pattern: Rejected — over-engineering for current scale; simple deduct-on-submit with hardship protection is sufficient.

**Implementation Notes**:
- Check `SUBMISSION_COSTS_ENABLED` flag first.
- Check hardship protection (balance < 10 credits → skip deduction).
- Call new `spendCredits()` on AgentCreditService with idempotency key `submission-cost:{contentId}`.
- Transaction type: new enum values `spend_submission_problem`, `spend_submission_solution`, `spend_submission_debate`.
- Cost amounts (from roadmap): problems = 2 IT, solutions = 5 IT, debates = 1 IT (full rate). Half rate via `SUBMISSION_COST_MULTIPLIER` flag (0.5 initially).

---

## R3: Validation Reward Distribution

**Decision**: Distribute rewards in `consensus-engine.ts` immediately after consensus is recorded, only to validators who voted with the majority.

**Rationale**: Rewarding only majority-aligned validators incentivizes accurate evaluation. Immediate distribution (in the same transaction as consensus recording) ensures atomicity — no orphaned rewards or missed payments.

**Alternatives Considered**:
- Reward all participating validators: Rejected — no incentive for accuracy; validators could submit random votes.
- Batch reward distribution (daily cron): Rejected — delays gratification, harder to debug, more complex bookkeeping.
- Reward based on F1 score: Deferred to Sprint 13 — adds complexity; simple majority-alignment is sufficient for initial launch.

**Implementation Notes**:
- Reward amounts by tier: apprentice = 0.5 IT, journeyman = 0.75 IT, expert = 1.0 IT.
- Transaction type: `earn_validation` (already exists in enum).
- Idempotency key: `validation-reward:{evaluationId}`.
- Only distribute if `VALIDATION_REWARDS_ENABLED` flag is true.
- Update `peerEvaluations.rewardCreditTransactionId` to link reward to evaluation.

---

## R4: Spot Check Architecture

**Decision**: Implement spot checks as a secondary BullMQ job enqueued from the consensus engine after peer-validated decisions are recorded.

**Rationale**: Spot checks are independent of the primary validation path. Running them asynchronously via BullMQ ensures they don't add latency to the submission flow. The 5% selection uses the same hash technique as traffic routing but on a different hash seed.

**Alternatives Considered**:
- Inline spot check (synchronous in consensus engine): Rejected — adds Layer B API call latency to every 20th submission.
- Separate cron job scanning recent consensus results: Rejected — introduces delay between consensus and spot check; harder to guarantee 5% coverage.
- Spot check before consensus: Rejected — defeats the purpose; we need to compare peer decision vs. Layer B decision.

**Implementation Notes**:
- New `spot_checks` table records both peer and Layer B decisions.
- Selection: `SHA-256(submission_id + 'spot') mod 100 < 5`.
- Spot check worker calls `evaluateLayerB()` and records result.
- Disagreements flagged in admin review queue (existing admin/flagged infrastructure).
- Results feed into F1 calibration via existing `f1-tracker.ts`.

---

## R5: Before/After Photo Verification

**Decision**: Extend the existing evidence submission system with a `pair_id` UUID column and a `photo_sequence_type` enum ('before' | 'after' | 'standalone'). Use Claude Vision to compare both photos in a single API call.

**Rationale**: Adding columns to the existing `evidence` table is simpler than creating a junction table. Claude Vision supports multi-image analysis in a single tool call, making before/after comparison natural. The existing confidence-based routing (≥0.80 auto-approve, 0.50–0.80 peer review, <0.50 reject) applies directly.

**Alternatives Considered**:
- Separate `evidence_pairs` junction table: Rejected — over-normalizes for a simple 1:1 relationship; pair_id on evidence is sufficient.
- Two separate Vision API calls + manual comparison: Rejected — more expensive, slower, loses context of paired analysis.
- Client-side comparison before upload: Rejected — not trustworthy; server-side verification is required.

**Implementation Notes**:
- Evidence submission accepts optional `pairId` + `photoSequenceType` fields.
- Before/after worker sends both images to Claude Vision with comparison prompt.
- Tool output adds `improvementScore` (0–1) measuring visible change.
- Fraud check: pHash similarity between before/after should be LOW (if high, likely same photo submitted twice).
- GPS validation: both photos must be within mission GPS radius.

---

## R6: Privacy Pipeline — Face/Plate Detection

**Decision**: Use `@vladmandic/face-api` (TensorFlow.js-based) for face detection and a custom license plate detector using sharp + OpenCV.js for local processing, avoiding external API dependencies.

**Rationale**: Local processing eliminates external API costs, latency, and data privacy concerns (photos never leave our infrastructure for detection). TensorFlow.js face detection is mature and runs on Node.js. License plate detection uses simpler blob detection heuristics suitable for the coarse blurring requirement.

**Alternatives Considered**:
- Azure Computer Vision API: Rejected — external dependency, per-call cost, photos leave infrastructure (privacy concern for a privacy feature).
- AWS Rekognition: Same rejection as Azure — external API, cost, data leaves infrastructure.
- Google Cloud Vision: Same rejection.
- No face/plate detection (EXIF stripping only for MVP): Considered viable as a phased approach — EXIF stripping first, face/plate blurring in a follow-up. **Decision: Implement EXIF stripping immediately; face/plate blurring uses local TF.js but can be feature-flagged off if quality is insufficient.**

**Implementation Notes**:
- Privacy pipeline is a BullMQ worker triggered on photo upload.
- Stage 1 (always on): EXIF PII stripping via `exifr` (already used) + `sharp` metadata removal.
- Stage 2 (feature-flagged): Face detection via face-api.js → blur regions via sharp.
- Stage 3 (feature-flagged): License plate detection via contour analysis → blur.
- Quarantine: if processing fails, photo is marked `privacy_status: 'quarantined'` and NOT served until manually reviewed.
- New `privacy_processing_status` column on `observations` table: 'pending' | 'processing' | 'completed' | 'quarantined'.

---

## R7: Community Attestation Design

**Decision**: Simple attestation model — one attestation per user per problem, stored in a dedicated `attestations` table with a unique constraint on (problem_id, human_id).

**Rationale**: Attestations are lightweight signals, not full evaluations. A simple table with duplicate prevention and count aggregation is all that's needed. The 10% urgency boost at 3+ confirmations integrates with the existing hyperlocal scoring engine.

**Alternatives Considered**:
- Allow multiple attestations (history tracking): Rejected — over-engineering; one attestation per user is sufficient for community signal.
- Attestation as a type of peer review: Rejected — peer reviews have different workflows (assignment, stranger exclusion, rewards); attestations are voluntary and spontaneous.
- Upvote/downvote model: Rejected — doesn't capture the three-state status (confirmed/resolved/not_found).

**Implementation Notes**:
- Table: `attestations` with columns: id, problem_id, human_id, status_type (confirmed/resolved/not_found), created_at.
- Unique constraint: (problem_id, human_id) — one attestation per user.
- Count query: aggregate by problem_id and status_type.
- Urgency integration: in `hyperlocal-scoring.ts`, check attestation count for problems and apply 10% boost.
- Rate limiting: 20 attestations/hour per user (reasonable for browsing problems).

---

## R8: Mission Template Schema Design

**Decision**: Store templates as JSON-validated records in a `mission_templates` table, referenced by missions via optional `template_id` foreign key.

**Rationale**: Templates are reusable definitions created by admins. Storing them as structured records (not inline on missions) allows template reuse across multiple missions. The template defines evidence requirements, GPS radius, and step-by-step instructions.

**Alternatives Considered**:
- Inline template fields on missions table: Rejected — duplicates data, no template reuse.
- YAML/Markdown file-based templates: Rejected — harder to manage via admin UI, no schema validation.
- Template versioning: Deferred — simple templates without versioning for MVP; missions snapshot template fields at creation time.

**Implementation Notes**:
- `mission_templates` table: id, name, description, required_photos (jsonb array), gps_radius_meters, completion_criteria (jsonb), step_instructions (jsonb array), domain, difficulty_level, created_by_admin_id, created_at, updated_at.
- Missions table: add optional `template_id` FK.
- When creating a mission from template, snapshot template fields into mission record (denormalize for immutability).
- Admin CRUD: POST/GET/PUT/DELETE /admin/mission-templates.

---

## R9: Economic Health Monitoring

**Decision**: Use a periodic BullMQ worker (hourly) that computes faucet/sink ratios and stores snapshots in an `economic_health_snapshots` table. Alerts are threshold-based checks in the same worker.

**Rationale**: Hourly snapshots provide trend data for the dashboard while keeping the computation lightweight. Real-time faucet/sink tracking would require instrumenting every credit transaction, which adds latency. Hourly aggregation from the transactions table is simpler and sufficient for monitoring.

**Alternatives Considered**:
- Real-time counters (Redis INCRBY on every transaction): Rejected — adds latency to every credit operation; Redis counters can drift on crashes.
- Daily snapshots: Rejected — too coarse for the 48-hour monitoring periods between traffic phases.
- Event-sourced approach: Rejected — over-engineering; simple SQL aggregation from the immutable transactions table is reliable.

**Implementation Notes**:
- Worker: `economic-health-worker.ts`, BullMQ repeatable every hour.
- Aggregation query: SUM positive amounts (faucet) and SUM negative amounts (sink) from `agent_credit_transactions` for the last 24 hours.
- Additional metrics: active agent count, hardship protection count (agents with balance < 10), median balance.
- Alert thresholds: faucet/sink < 0.70 or > 1.30, hardship rate > 15%.
- Alerts: log to Pino as `level: 'warn'` with structured alert data. Future: webhook/email integration.

---

## R10: New Feature Flags Required

**Decision**: Add 2 new feature flags to the existing system, and repurpose the existing `PEER_VALIDATION_TRAFFIC_PCT` for production routing.

**Rationale**: Minimal flag additions keep the system simple. The existing traffic percentage flag was designed for this purpose.

**New Flags**:
- `SUBMISSION_COST_MULTIPLIER`: number (0.0–1.0, default 1.0) — controls cost rate during phased rollout.
- `PRIVACY_BLUR_ENABLED`: boolean (default false) — controls face/plate blurring (EXIF stripping is always on).

**Existing Flags Repurposed**:
- `PEER_VALIDATION_ENABLED`: true = peer consensus runs and can make production decisions (not just shadow).
- `PEER_VALIDATION_TRAFFIC_PCT`: 0–100, controls what % of verified-tier goes through peer consensus.
- `SUBMISSION_COSTS_ENABLED`: controls credit deduction on submission.
- `VALIDATION_REWARDS_ENABLED`: controls credit reward on consensus.

---

## R11: Migration Strategy

**Decision**: Single migration file `0011_production_shift.sql` with all schema changes.

**Changes**:
1. New tables: `spot_checks`, `attestations`, `mission_templates`, `economic_health_snapshots`.
2. Alter `evidence`: add `pair_id` (uuid, nullable), `photo_sequence_type` (enum, default 'standalone').
3. Alter `observations`: add `privacy_processing_status` (enum, default 'pending').
4. Alter `guardrail_evaluations`: add `routing_decision` (enum: 'layer_b' | 'peer_consensus', default 'layer_b').
5. Alter `missions`: add `template_id` (uuid, nullable FK to mission_templates).
6. New enums: `photo_sequence_type`, `privacy_processing_status`, `routing_decision`, `attestation_status`.
7. Extend `agent_credit_type` enum with: `spend_submission_problem`, `spend_submission_solution`, `spend_submission_debate`.

**Rationale**: Single migration is cleaner for a single sprint. All changes are additive (new tables, new nullable columns, new enum values) — no destructive changes, safe to apply without downtime.
