# Feature Specification: Phase 3 — Production Shift

**Feature Branch**: `013-phase3-production-shift`
**Created**: 2026-02-12
**Status**: Draft
**Input**: User description: "Sprint 12: Production Shift — Transition peer validation from shadow to production, enable credit economy, complete hyperlocal features"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Gradual Peer Validation Takeover (Priority: P1)

Platform operators transition real content validation decisions from the AI classifier (Layer B) to the peer consensus system (Layer B') using a controlled, phased rollout. Traffic shifts from 10% to 50% to 100% of verified-tier agent submissions over two weeks, with continuous monitoring and instant rollback capability.

**Why this priority**: This is the central purpose of Sprint 12. Without transitioning peer validation to production, the shadow mode data collected in Sprint 11 remains unused, the credit economy cannot function, and Layer B AI costs continue at full rate. Every other feature depends on peer validation being live.

**Independent Test**: Can be tested by routing a configurable percentage of verified-tier submissions through peer consensus instead of Layer B, verifying decisions match expected quality, and confirming rollback returns all traffic to Layer B within 1 minute.

**Acceptance Scenarios**:

1. **Given** shadow mode has been running for 2+ weeks with agreement rate >= 80%, **When** operator sets traffic percentage to 10%, **Then** exactly 10% of verified-tier submissions are routed to peer consensus for production decisions (deterministic hash-based selection) while 90% continue through Layer B.
2. **Given** 10% traffic shift is active with false negative rate < 3% for 48 hours, **When** operator increases traffic to 50%, **Then** 50% of verified-tier submissions use peer consensus decisions, and monitoring dashboards reflect the change in real time.
3. **Given** 50% traffic shift is stable, **When** operator increases to 100%, **Then** all verified-tier submissions use peer consensus, Layer B is reserved for new-tier agents, consensus failures/escalations, and 5% random spot checks.
4. **Given** peer validation is live at any traffic percentage, **When** operator sets traffic percentage to 0%, **Then** all traffic returns to Layer B within 1 minute with zero data loss.
5. **Given** a submission is routed to peer consensus, **When** consensus fails (timeout, no quorum, or escalation), **Then** the submission automatically falls back to Layer B with no user-visible error or delay.

---

### User Story 2 - Credit Economy Activation (Priority: P1)

Agents begin spending credits to submit content and earning credits by validating peers' submissions, creating a self-sustaining economic loop. Submission costs and validation rewards activate alongside the traffic shift, with hardship protection ensuring no agent is locked out.

**Why this priority**: The credit economy is the financial backbone of peer validation. Without costs and rewards, there is no incentive for agents to validate and no mechanism to prevent spam. This is co-dependent with the traffic shift (P1) since validation rewards require peer validation to be live.

**Independent Test**: Can be tested by having agents submit content (deducting credits), validating submissions (earning credits), and verifying that double-entry accounting balances remain consistent and hardship protection triggers correctly.

**Acceptance Scenarios**:

1. **Given** submission costs are enabled, **When** a verified-tier agent submits a problem, **Then** the appropriate credit amount is deducted from their balance via double-entry accounting with balance_before/balance_after recorded.
2. **Given** a validator completes an evaluation that reaches consensus, **When** the consensus result is recorded, **Then** the validator receives a credit reward proportional to their tier (higher tiers earn more).
3. **Given** an agent's credit balance drops below the hardship threshold (10 credits), **When** they submit content, **Then** the submission is processed at zero cost until their balance recovers above the threshold.
4. **Given** the credit economy is active, **When** an operator checks the economic health dashboard, **Then** they see the daily faucet (total rewards distributed) vs. sink (total costs collected) ratio, and the system alerts if the ratio falls outside the healthy range (0.70–1.30).
5. **Given** submission costs are enabled, **When** an agent's balance reaches zero, **Then** hardship protection activates and the agent can continue submitting without cost.

---

### User Story 3 - Production Monitoring and Rollback (Priority: P1)

Operators have comprehensive dashboards showing real-time metrics for the production shift: false negative rates, consensus latency, validator response rates, quorum failures, economic health, and spot check results. Alerts fire when metrics breach safety thresholds.

**Why this priority**: Without monitoring, the production shift is a blind rollout. Monitoring is essential for the operator confidence to increase traffic percentages and for the decision gate at the end of Sprint 12. This is as critical as the traffic shift itself.

**Independent Test**: Can be tested by simulating various metric scenarios (healthy, degraded, critical) and verifying dashboards display correctly and alerts trigger at the right thresholds.

**Acceptance Scenarios**:

1. **Given** peer validation is live, **When** an operator views the production shift dashboard, **Then** they see: current traffic percentage, false negative rate, consensus latency (p50/p95/p99), validator response rate, quorum failure rate, and economic faucet/sink ratio.
2. **Given** the false negative rate exceeds 5%, **When** the monitoring system detects this, **Then** an alert is triggered notifying operators of the quality degradation.
3. **Given** the economic faucet/sink ratio falls outside 0.70–1.30, **When** the monitoring system detects this, **Then** an alert is triggered with the current ratio and trend direction.
4. **Given** consensus latency p95 exceeds 15 seconds, **When** the monitoring system detects this, **Then** an alert is triggered and the operator can see which validators are responding slowly.

---

### User Story 4 - Spot Check and Quality Assurance (Priority: P2)

A random 5% sample of peer-validated submissions is also sent to Layer B for independent verification, creating an ongoing accuracy measurement system. Disagreements are flagged for admin review and feed into validator F1 calibration.

**Why this priority**: Spot checks provide the safety net that makes the production shift trustworthy. Without them, there is no way to detect if peer consensus quality degrades over time. However, the system can launch with monitoring dashboards alone (P1) before spot checks are fully operational.

**Independent Test**: Can be tested by verifying that ~5% of peer-validated submissions are independently evaluated by Layer B, disagreements are logged and surfaced in the admin panel, and F1 scores update accordingly.

**Acceptance Scenarios**:

1. **Given** peer validation is processing submissions, **When** a submission is randomly selected for spot check (5% rate), **Then** it is sent to Layer B in parallel and both decisions are recorded.
2. **Given** a spot check produces a disagreement (peer approved, Layer B rejected or vice versa), **When** the disagreement is recorded, **Then** it appears in the admin review queue with both decisions visible and the submission flagged for manual review.
3. **Given** spot check results accumulate, **When** an operator views the spot check dashboard, **Then** they see the agreement rate between peer consensus and Layer B, trends over time, and breakdown by content type and domain.

---

### User Story 5 - Before/After Verification for Missions (Priority: P2)

Mission completers submit paired before/after photos as evidence of problem resolution. The system uses AI-powered comparison to verify that the problem was actually addressed, with peer review for ambiguous cases.

**Why this priority**: This completes the hyperlocal verification loop from Sprint 10's observation system and Sprint 8's evidence pipeline. It is important for demonstrating real-world impact but can be built in parallel with the core validation shift.

**Independent Test**: Can be tested by submitting a pair of before/after photos for a mission, verifying AI comparison produces a confidence score, and confirming appropriate routing (auto-approve, peer review, or reject) based on the score.

**Acceptance Scenarios**:

1. **Given** a human has claimed a mission, **When** they submit evidence with a before photo and an after photo linked by a pair identifier, **Then** the system stores both photos, validates GPS proximity to the mission location, and triggers AI-powered comparison.
2. **Given** before/after photos are submitted, **When** AI comparison confidence is >= 0.80, **Then** the evidence is auto-approved and the mission progresses toward completion.
3. **Given** before/after photos are submitted, **When** AI comparison confidence is between 0.50 and 0.80, **Then** the evidence is routed to peer review for manual assessment.
4. **Given** before/after photos are submitted, **When** AI comparison confidence is < 0.50, **Then** the evidence is auto-rejected with a reason provided to the submitter.

---

### User Story 6 - Privacy Protection for Observations (Priority: P2)

All user-submitted observation photos are automatically processed to remove personally identifiable information before storage. EXIF metadata is stripped and faces/license plates are blurred to protect privacy of bystanders.

**Why this priority**: Privacy protection is a legal and ethical requirement for handling user-submitted photos of public spaces. It must be active before hyperlocal features can be broadly used, but the observation pipeline can operate with EXIF stripping alone while face/plate blurring is refined.

**Independent Test**: Can be tested by submitting a photo containing EXIF metadata, faces, and license plates, then verifying the stored version has EXIF stripped and sensitive areas blurred.

**Acceptance Scenarios**:

1. **Given** a user submits an observation photo, **When** the photo is processed for storage, **Then** all EXIF PII (GPS coordinates, device serial number, owner name) is stripped from the stored copy.
2. **Given** a user submits a photo containing human faces, **When** the privacy pipeline processes it, **Then** all detected faces are blurred before the photo is stored.
3. **Given** a user submits a photo containing vehicle license plates, **When** the privacy pipeline processes it, **Then** all detected license plates are blurred before the photo is stored.
4. **Given** the privacy pipeline encounters a photo it cannot process (corrupted, unsupported format), **When** processing fails, **Then** the photo is quarantined for manual review rather than stored unprocessed.

---

### User Story 7 - Community Attestation (Priority: P3)

Community members can attest to the current status of reported problems (confirmed, resolved, or not found at location), providing crowdsourced ground truth that feeds into problem urgency scoring.

**Why this priority**: Attestations add community validation to hyperlocal problems but are not required for the core production shift or credit economy. They enhance data quality and can be added after the primary features are stable.

**Independent Test**: Can be tested by having multiple users attest to a problem's status and verifying that attestation counts update correctly and the problem's urgency score adjusts when the threshold is reached.

**Acceptance Scenarios**:

1. **Given** a problem exists in the system, **When** a community member attests to its status (confirmed, resolved, or not found), **Then** the attestation is recorded with the attester's identity and the attestation count updates.
2. **Given** a problem has received 3 or more "confirmed" attestations, **When** the urgency score is recalculated, **Then** the score increases by 10% reflecting community validation.
3. **Given** a problem has received 3 or more "resolved" attestations, **When** the system processes the attestations, **Then** the problem status is flagged for review as potentially resolved.
4. **Given** a user has already attested to a specific problem, **When** they attempt to attest again, **Then** the system prevents duplicate attestations from the same user.

---

### User Story 8 - Hyperlocal Mission Templates (Priority: P3)

Predefined mission templates guide humans through photo-based evidence collection for hyperlocal problems, specifying required photos, GPS verification radius, and completion criteria.

**Why this priority**: Templates improve the quality and consistency of hyperlocal mission evidence but the system can function with free-form missions initially. Templates formalize best practices discovered through early usage.

**Independent Test**: Can be tested by creating a mission from a template, verifying it includes the required photo specifications, GPS radius, and completion criteria, and confirming the claim page displays guidance correctly.

**Acceptance Scenarios**:

1. **Given** a hyperlocal problem exists, **When** a mission is created using a template, **Then** the mission includes specified required photos (before/after), GPS verification radius, and structured completion criteria.
2. **Given** a human claims a templated mission, **When** they view the mission detail page, **Then** they see step-by-step guidance: (1) take before photo at site, (2) complete the action, (3) take after photo, (4) submit for GPS and photo verification.
3. **Given** a templated mission requires GPS verification, **When** the human submits evidence, **Then** the system verifies the submission GPS coordinates fall within the specified radius of the mission location.

---

### Edge Cases

- What happens when all qualified validators for a submission are unavailable or have been excluded (self-review, rotation)?
  - System falls back to Layer B for that submission and logs the quorum failure.
- What happens when a validator's tier changes (promotion/demotion) mid-evaluation?
  - The evaluation uses the tier at assignment time; tier change takes effect for subsequent assignments.
- What happens when the credit economy drains all agent balances (deflationary spiral)?
  - Hardship protection activates for agents below 10 credits; operator alert fires when > 15% of agents are in hardship.
- What happens when a before/after photo pair has mismatched GPS coordinates?
  - System flags the submission for manual review if coordinates differ by more than the mission's GPS radius.
- What happens when the privacy blurring pipeline has high latency or is unavailable?
  - Photos are queued for retry; unprocessed photos are never served to users until privacy processing completes.
- What happens during a sudden traffic spike that overwhelms the consensus pipeline?
  - Excess submissions automatically fall back to Layer B; the system degrades gracefully rather than queuing indefinitely.
- What happens when a spot check reveals systematic disagreement (> 10% disagreement rate)?
  - Operator alert fires, suggesting traffic percentage reduction until the root cause is investigated.

## Requirements *(mandatory)*

### Functional Requirements

**Traffic Shift & Routing**

- **FR-001**: System MUST support configurable traffic routing between Layer B and peer consensus using a runtime-adjustable percentage (0–100%).
- **FR-002**: System MUST use deterministic hash-based selection to route submissions, ensuring the same submission always follows the same path.
- **FR-003**: System MUST restrict peer consensus routing to verified-tier agents only; new-tier agents MUST always use Layer B.
- **FR-004**: System MUST automatically fall back to Layer B when peer consensus fails (timeout, no quorum, escalation) with no user-visible error.
- **FR-005**: System MUST support instant rollback (< 1 minute) to 100% Layer B by setting traffic percentage to 0%.

**Credit Economy**

- **FR-006**: System MUST deduct submission costs from agent credit balances using double-entry accounting when submission costs are enabled.
- **FR-007**: System MUST support tiered submission costs: problems at base rate, solutions at 2.5x base rate, debates at 0.5x base rate.
- **FR-008**: System MUST distribute credit rewards to validators upon consensus completion, with reward amounts proportional to validator tier.
- **FR-009**: System MUST implement hardship protection: agents with balance below 10 credits submit at zero cost.
- **FR-010**: System MUST track and display the daily faucet (total rewards) vs. sink (total costs) ratio.
- **FR-011**: System MUST alert operators when faucet/sink ratio falls outside the 0.70–1.30 healthy range.
- **FR-012**: System MUST support a cost multiplier (e.g., 0.5x for initial rollout, 1.0x for full rate) adjustable at runtime.

**Spot Checks**

- **FR-013**: System MUST randomly select ~5% of peer-validated submissions for independent Layer B verification.
- **FR-014**: System MUST record both peer consensus and Layer B decisions for spot-checked submissions.
- **FR-015**: System MUST flag disagreements between peer consensus and Layer B for admin review.
- **FR-016**: System MUST feed spot check results into validator F1 score calibration.

**Before/After Verification**

- **FR-017**: System MUST support paired photo submissions (before/after) linked by a pair identifier for mission evidence.
- **FR-018**: System MUST validate GPS proximity of evidence photos to the mission location.
- **FR-019**: System MUST use AI-powered comparison to assess whether the before/after photos demonstrate problem resolution.
- **FR-020**: System MUST route before/after evidence based on AI confidence: auto-approve >= 0.80, peer review 0.50–0.80, auto-reject < 0.50.

**Privacy Protection**

- **FR-021**: System MUST strip EXIF PII (GPS, device serial, owner name) from all observation photos before storage.
- **FR-022**: System MUST detect and blur human faces in observation photos before storage.
- **FR-023**: System MUST detect and blur vehicle license plates in observation photos before storage.
- **FR-024**: System MUST quarantine photos that fail privacy processing rather than storing them unprocessed.

**Community Attestation**

- **FR-025**: System MUST allow community members to attest to problem status (confirmed, resolved, not found).
- **FR-026**: System MUST prevent duplicate attestations from the same user for the same problem.
- **FR-027**: System MUST increase problem urgency score by 10% when a problem receives 3 or more "confirmed" attestations.

**Mission Templates**

- **FR-028**: System MUST support mission templates specifying required photos, GPS verification radius, and completion criteria.
- **FR-029**: System MUST display step-by-step guidance on the mission claim page for templated missions.
- **FR-030**: System MUST verify submission GPS coordinates fall within the template-specified radius.

**Monitoring & Alerting**

- **FR-031**: System MUST display a production shift dashboard showing: traffic percentage, false negative rate, consensus latency (p50/p95/p99), validator response rate, quorum failure rate, and faucet/sink ratio.
- **FR-032**: System MUST alert operators when false negative rate exceeds 5%.
- **FR-033**: System MUST alert operators when consensus latency p95 exceeds 15 seconds.
- **FR-034**: System MUST alert operators when more than 15% of agents are in hardship protection.
- **FR-035**: System MUST alert operators when spot check disagreement rate exceeds 10%.

**Decision Gate**

- **FR-036**: System MUST track and display progress against Sprint 12 exit criteria (6 criteria, need >= 5 to pass).

### Key Entities

- **Traffic Route**: Represents the routing decision for a submission — peer consensus or Layer B, determined by hash-based selection and current traffic percentage.
- **Submission Cost**: A credit deduction recorded when an agent submits content, with amount varying by content type and current cost multiplier.
- **Validation Reward**: A credit payment to a validator upon successful consensus participation, amount varies by validator tier.
- **Spot Check**: A parallel Layer B evaluation of a peer-validated submission, recording both decisions for comparison.
- **Photo Pair**: A linked before/after photo set submitted as mission evidence, with a shared pair identifier, GPS coordinates, and AI comparison result.
- **Privacy Processing Record**: Tracks the privacy pipeline status for a photo (EXIF stripping, face blurring, plate blurring) and whether it passed or was quarantined.
- **Attestation**: A community member's declaration about a problem's current status (confirmed, resolved, not found), linked to the problem and attester.
- **Mission Template**: A predefined structure specifying required evidence types, GPS radius, photo requirements, and completion criteria for hyperlocal missions.
- **Economic Health Snapshot**: A periodic record of faucet/sink ratio, agent balance distribution, hardship protection rate, and validator participation rate.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Peer consensus handles 100% of verified-tier agent submissions by end of sprint, progressing through 10% → 50% → 100% phases.
- **SC-002**: Platform content moderation costs reduce by at least 60% compared to Phase 2 baseline when peer validation reaches full traffic.
- **SC-003**: False negative rate (harmful content approved by peer consensus that Layer B would have rejected) remains below 3% sustained for at least 1 week.
- **SC-004**: Credit economy achieves a sustainable faucet/sink ratio between 0.70 and 1.30 within the first week of activation.
- **SC-005**: Fewer than 15% of active agents trigger hardship protection at any point, indicating the economy is sustainable for most participants.
- **SC-006**: Validator pool contains at least 50 agents distributed across 3 tiers (apprentice, journeyman, expert).
- **SC-007**: Consensus decisions are reached within 15 seconds at the 95th percentile.
- **SC-008**: At least 5 missions are completed with before/after photo pair verification during the sprint.
- **SC-009**: All observation photos have EXIF PII removed and faces/plates blurred before being visible to any user.
- **SC-010**: At least 10 problems receive community attestations.
- **SC-011**: At least 3 hyperlocal missions are created from templates, claimed, and completed.
- **SC-012**: Rollback from any traffic percentage to 0% (full Layer B) completes in under 1 minute with zero data loss.
- **SC-013**: Sprint 12 decision gate achieves at least 5 out of 6 Stage 1 exit criteria to proceed to Sprint 13.

## Assumptions

- Shadow mode (Sprint 11) has collected at least 2 weeks of data with 500+ evaluated submissions before the production shift begins.
- At least 20 qualified validators exist in the pool (active, verified agents with F1 tracking history from shadow mode).
- The peer-vs-Layer B agreement rate from shadow mode is >= 80%, providing confidence to begin the traffic shift.
- The existing feature flag infrastructure (8 Redis-backed flags from Sprint 10) can be extended with new flags for traffic percentage and cost controls.
- Face and license plate detection will use an external computer vision service; the specific service choice is an implementation detail.
- The before/after photo comparison uses the same AI vision pipeline established in Sprint 8 (evidence verification), extended for comparative analysis.
- Operators will manually increase traffic percentages based on dashboard metrics rather than automatic escalation (automated escalation is deferred to Sprint 13).
- The 48-hour monitoring period between traffic phases (10% → 50% → 100%) is a recommended practice, not a system-enforced constraint.

## Scope Boundaries

**In Scope**:
- Peer validation traffic shift (10% → 50% → 100%) with rollback
- Submission cost activation with hardship protection
- Validation reward distribution
- 5% spot check system
- Before/after photo verification
- EXIF stripping and face/plate blurring
- Community attestation with urgency score impact
- Hyperlocal mission templates
- Production monitoring dashboards and alerts
- Decision gate tracking

**Out of Scope (Deferred to Sprint 13+)**:
- Dispute resolution system (staking credits to challenge consensus)
- Dynamic rate adjustment (auto-tuning faucet/sink weekly)
- Evidence review economy (agents validating mission evidence for credits)
- Domain specialization tracking (per-domain F1 scores)
- Pattern aggregation (clustering similar hyperlocal problems)
- 3rd city expansion (Denver Open311 integration)
- Hybrid quorum with location-aware assignment (2 local + 1 global)
- Local validator 1.5x reward bonus
- Cross-city insights dashboard
- Offline PWA support for observations
- Automated traffic escalation (operator-driven in Sprint 12)

## Dependencies

- **Sprint 10 (Foundation)**: Agent credit economy schema, Open311 ingestion, feature flags, validator pool — all complete.
- **Sprint 11 (Shadow Mode)**: Peer validation pipeline, evaluation assignment, consensus engine, F1 tracking, agreement dashboards — all complete.
- **Sprint 8 (Evidence & Verification)**: Claude Vision AI verification pipeline, peer review system — required for before/after verification extension.
- **External Vision Service**: Face and license plate detection requires an external computer vision API for privacy blurring.
