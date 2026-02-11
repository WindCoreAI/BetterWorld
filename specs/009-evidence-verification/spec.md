# Feature Specification: Evidence Verification & Completion Workflow

**Feature Branch**: `009-evidence-verification`
**Created**: 2026-02-10
**Status**: Draft
**Input**: User description: "Sprint 8 — Evidence Verification & Completion Workflow"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Submit Evidence for a Claimed Mission (Priority: P1)

A human who has claimed and completed a real-world mission needs to submit proof of completion. They upload photos (before/after), provide their GPS location, and optionally attach documents. The system extracts metadata from their submissions, validates basic requirements (file type, size, GPS availability), and queues the evidence for verification.

**Why this priority**: Without evidence submission, there is no path to mission completion or token rewards. This is the entry point for the entire verification pipeline.

**Independent Test**: A human with an active mission claim can open the evidence submission page, upload a photo, see GPS auto-detected, review a pre-submission checklist, and submit. The evidence appears in the system with status "submitted."

**Acceptance Scenarios**:

1. **Given** a human with an active mission claim, **When** they upload a photo and submit evidence, **Then** the evidence is stored securely, metadata is extracted (GPS, timestamp), and status is set to "submitted."
2. **Given** a human submitting evidence, **When** the photo lacks GPS data, **Then** the system captures location via the browser's geolocation API as a fallback.
3. **Given** a human submitting evidence, **When** they exceed the upload rate limit (10/hour), **Then** the system rejects the submission with a clear message and retry guidance.
4. **Given** a human submitting evidence, **When** they upload an unsupported file type, **Then** the system rejects it with a list of accepted formats.
5. **Given** a human with no active mission claims, **When** they try to submit evidence, **Then** the system denies access and explains they must claim a mission first.

---

### User Story 2 - Automatic AI Verification of Evidence (Priority: P1)

After evidence is submitted, the platform automatically runs AI-powered verification. The AI checks whether the evidence matches the mission requirements: Is the photo relevant to the mission task? Does the GPS location match the mission location within tolerance? Is the timestamp plausible (within mission deadline)? The AI assigns a confidence score and the system makes a routing decision.

**Why this priority**: AI verification handles the majority (~70%) of cases automatically, enabling the platform to scale without requiring human review for every submission. Without it, all evidence would need manual review.

**Independent Test**: Submit evidence for a mission. The AI verification completes within 30 seconds. Clear-cut evidence (high quality, matching GPS) is auto-approved. Obviously fraudulent evidence (wrong location, stock photo) is auto-rejected. Ambiguous evidence is routed to peer review.

**Acceptance Scenarios**:

1. **Given** submitted evidence with clear GPS match and relevant photo, **When** AI verification runs, **Then** the evidence receives a high confidence score and is auto-approved.
2. **Given** submitted evidence with GPS 5km from mission location, **When** AI verification runs, **Then** the evidence receives a low confidence score and is auto-rejected.
3. **Given** submitted evidence with a matching but unclear photo, **When** AI verification produces an ambiguous score, **Then** the evidence is routed to peer review.
4. **Given** the AI verification service is temporarily unavailable, **When** evidence is submitted, **Then** the evidence is queued and retried automatically, with the human notified of the delay.
5. **Given** the daily AI verification budget is exceeded, **When** evidence is submitted, **Then** it is routed directly to peer review with a note that AI verification was skipped.

---

### User Story 3 - Peer Review of Ambiguous Evidence (Priority: P2)

When AI verification produces an ambiguous result, the evidence is assigned to 1-3 peer reviewers (other humans on the platform). Reviewers see the evidence alongside the mission requirements, vote to approve or reject with written reasoning, and earn a small token reward for reviewing. The system prevents collusion by ensuring reviewers are strangers to the submitter.

**Why this priority**: Peer review handles the ~20% of cases AI cannot decide with confidence. It provides a human judgment layer that catches nuance AI misses and builds community trust in the verification process.

**Independent Test**: Evidence flagged for peer review appears in a reviewer's queue. The reviewer can view the evidence (with image zoom), read mission requirements, and submit an approval or rejection with reasoning. Upon majority vote, the evidence status updates.

**Acceptance Scenarios**:

1. **Given** evidence routed to peer review, **When** the system assigns reviewers, **Then** it selects 1-3 humans who have no prior review relationship with the submitter (stranger-only).
2. **Given** a peer reviewer, **When** they open the review queue, **Then** they see the evidence (photo with zoom), mission requirements, GPS comparison, and a form to approve/reject with reasoning.
3. **Given** 2 out of 3 reviewers approve, **When** the last required vote is cast, **Then** the evidence is marked as verified and the submitter is notified.
4. **Given** a reviewer who has previously reviewed the submitter's evidence, **When** the system assigns reviewers, **Then** that reviewer is excluded (2-hop transitive exclusion prevents collusion chains).
5. **Given** a reviewer completes a review, **When** their vote is recorded, **Then** they earn a token reward for participating.

---

### User Story 4 - Earn Token Rewards on Verification (Priority: P2)

When evidence is verified (either by AI auto-approval or peer consensus), the submitting human automatically receives their mission's token reward. The reward amount is adjusted by the verification confidence -- high-confidence approvals earn the full reward, while borderline approvals earn a reduced amount. This incentivizes submitting clear, complete evidence.

**Why this priority**: Token rewards are the core incentive mechanism. Without automatic reward distribution, the mission completion loop is broken and humans have no reason to participate.

**Independent Test**: Submit evidence for a mission with a 100 IT reward. After AI auto-approval with 0.90 confidence, the human's token balance increases by 90 IT and a transaction record appears in their dashboard.

**Acceptance Scenarios**:

1. **Given** evidence is auto-approved with 0.90 confidence, **When** the reward is calculated, **Then** the human receives mission_reward x confidence (e.g., 100 IT x 0.90 = 90 IT).
2. **Given** evidence is approved by peer review, **When** the reward is calculated, **Then** the human receives mission_reward x average peer confidence score.
3. **Given** a reward is distributed, **When** the transaction is recorded, **Then** it follows double-entry accounting (balance_before, balance_after) and the human sees the breakdown on their dashboard.
4. **Given** evidence is rejected (AI or peer), **When** the decision is final, **Then** no tokens are distributed and the human is notified with the rejection reason.
5. **Given** a human earns tokens from a mission, **When** they view their dashboard, **Then** they see a notification with the amount earned and confidence breakdown.

---

### User Story 5 - Evidence Submission UI (Mobile-First) (Priority: P2)

Humans in the field need a mobile-optimized interface to submit evidence. The UI supports camera capture (for in-app photos), gallery upload, GPS auto-detection, a pre-submission checklist (photo quality, GPS detected, all requirements met), and evidence preview before final submission. The interface works offline and queues submissions for retry when connectivity is restored.

**Why this priority**: Many missions are executed in the field (rural areas, community events) where mobile is the primary device and connectivity may be unreliable. A poor mobile experience directly reduces mission completion rates.

**Independent Test**: Open the evidence submission page on a mobile device. Take a photo using the camera, see GPS detected, review the checklist, preview the submission, and submit. If offline, the submission is queued and sent when connectivity returns.

**Acceptance Scenarios**:

1. **Given** a human on a mobile device, **When** they open the evidence submission page, **Then** they can capture a photo directly using their camera or select from their gallery.
2. **Given** a human submitting evidence, **When** the page loads, **Then** their GPS location is auto-detected (with permission) and displayed as a verification indicator.
3. **Given** a human reviewing their submission, **When** they view the pre-submission checklist, **Then** they see items like "Photo clear?", "GPS detected?", "All requirements met?" with pass/fail indicators.
4. **Given** a human in an area with no connectivity, **When** they submit evidence, **Then** the submission is queued locally and automatically retried when connectivity returns.
5. **Given** a human reviewing evidence before submission, **When** they preview their upload, **Then** they see the photo, extracted GPS coordinates, and a map pin showing the detected location relative to the mission location.

---

### User Story 6 - Fraud Detection via Honeypot Missions (Priority: P3)

The platform maintains a set of impossible-to-complete "honeypot" missions (missions at impossible locations, with future deadlines, or physically impossible tasks). When a human submits evidence for a honeypot mission, their fraud score is incremented and the submission is auto-rejected. Repeated honeypot submissions lead to account flagging for admin review.

**Why this priority**: Fraud detection protects the integrity of the token economy and ensures honest participants are not disadvantaged. Honeypots are a cheap, effective first-line fraud detector that catches naive fraud attempts.

**Independent Test**: Seed 5 honeypot missions. A test user submits evidence for one. The submission is auto-rejected, the user's fraud score is incremented, and an audit log entry is created. After 3 honeypot submissions, the account is flagged.

**Acceptance Scenarios**:

1. **Given** a honeypot mission with GPS coordinates in the ocean, **When** a human submits evidence, **Then** the submission is auto-rejected and the human's fraud score is incremented.
2. **Given** a human who has triggered 3 or more honeypot submissions, **When** their fraud score is checked, **Then** their account is flagged for admin review.
3. **Given** a honeypot mission, **When** it appears in the marketplace, **Then** it is indistinguishable from real missions (no visible markers for humans).

---

### User Story 7 - Verification Audit Trail & Dispute Resolution (Priority: P3)

Every verification decision (AI and peer) is logged with full reasoning for transparency and dispute resolution. Humans can view the verification status of their submissions. Admins can review disputed verifications through a dedicated queue. The audit trail supports accountability and helps improve verification accuracy over time.

**Why this priority**: Transparency and accountability are essential for trust. Without an audit trail, disputed rejections cannot be investigated, and the verification system cannot be improved based on past decisions.

**Independent Test**: Submit evidence that gets auto-rejected. View the rejection reason in the dashboard. Appeal the decision. An admin sees the appeal in the dispute queue, reviews the AI reasoning and evidence, and makes a final decision.

**Acceptance Scenarios**:

1. **Given** any verification decision, **When** the decision is recorded, **Then** an audit log entry captures the decision source (AI or peer), confidence score, reasoning, and timestamp.
2. **Given** a human whose evidence was rejected, **When** they view their submission status, **Then** they see the rejection reason and an option to appeal.
3. **Given** a disputed verification, **When** an admin reviews it, **Then** they see the full evidence, AI reasoning, peer votes (if any), and can make a binding final decision (approve or uphold rejection).
4. **Given** an admin approves a previously rejected submission, **When** the decision is finalized, **Then** the human receives their token reward and the audit log records the override.

---

### Edge Cases

- What happens when a human submits evidence for a mission whose deadline has already passed?
- How does the system handle very large files (exceeding 10MB) gracefully?
- What happens if all eligible peer reviewers are excluded by the stranger-only algorithm (no valid reviewers available)?
- How does the system handle evidence submitted from a spoofed GPS location?
- What happens when a mission's location tolerance is very small (50m) but the GPS accuracy is low (25m)?
- What happens if the human submits evidence for a mission they did not claim?
- How does the system handle simultaneous peer reviews where reviewers submit votes at the same time?
- What happens when EXIF data is stripped (e.g., photo forwarded from messaging app)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow humans to submit evidence (photos, documents) for missions they have actively claimed.
- **FR-002**: System MUST extract and store metadata (GPS coordinates, timestamp, camera model) from submitted photos, stripping personally identifiable metadata (camera serial numbers, owner name) before storage.
- **FR-003**: System MUST rate-limit evidence uploads to 10 per hour per human to prevent spam and storage abuse.
- **FR-004**: System MUST validate submitted files against an allowlist of accepted formats (JPEG, PNG, HEIC for photos; PDF for documents; MP4, MOV for video) with a maximum file size of 10MB per upload.
- **FR-005**: System MUST verify evidence using AI (checking GPS proximity to mission location, timestamp plausibility, photo relevance to mission requirements) and assign a confidence score between 0.0 and 1.0.
- **FR-006**: System MUST route evidence based on AI confidence: auto-approve at 0.80 or above, auto-reject below 0.50, route to peer review between 0.50 and 0.80.
- **FR-007**: System MUST assign peer reviewers using a stranger-only algorithm with 2-hop transitive exclusion to prevent collusion.
- **FR-008**: System MUST distribute token rewards automatically upon evidence approval, calculated as mission reward multiplied by verification confidence.
- **FR-009**: System MUST record all verification decisions (AI and peer) in an audit log with reasoning, scores, and timestamps.
- **FR-010**: System MUST provide a mobile-first evidence submission interface with camera capture, GPS auto-detection, pre-submission checklist, and evidence preview.
- **FR-011**: System MUST support offline evidence submission with automatic retry when connectivity returns.
- **FR-012**: System MUST maintain honeypot missions that detect and score fraudulent submission attempts.
- **FR-013**: System MUST allow admins to review disputed verifications and make binding final decisions.
- **FR-014**: System MUST capture the human's live GPS location via the browser geolocation API as the primary location signal (falling back to photo EXIF GPS when available).
- **FR-015**: System MUST track the AI verification cost budget and fall back to peer-review-only when the daily budget is exceeded.
- **FR-016**: Peer reviewers MUST earn a token reward for completing reviews.
- **FR-017**: System MUST prevent humans from reviewing their own evidence or evidence from people they have a prior review relationship with (2-hop exclusion).
- **FR-018**: System MUST notify humans of verification outcomes (approved, rejected, under peer review) via the dashboard and optionally via real-time updates.
- **FR-019**: System MUST support an appeals workflow where humans can dispute rejected evidence, escalating to admin review.

### Key Entities

- **Evidence**: A submission by a human for a claimed mission, containing media files (photos, documents, videos), extracted metadata (GPS, timestamp), verification status, AI confidence score, and link to the mission claim.
- **Peer Review**: A vote by a reviewer on a piece of evidence, including verdict (approve/reject), confidence level, written reasoning, and the reviewer's identity. Multiple peer reviews form a consensus for a single evidence submission.
- **Review History**: A record of reviewer-submitter pairs that enforces stranger-only assignment. Used for 2-hop transitive exclusion queries.
- **Verification Audit Log**: An immutable record of every verification decision (AI or peer), capturing the decision source, score, reasoning, and outcome. Used for dispute resolution and system improvement.
- **Honeypot Mission**: A specially marked impossible-to-complete mission used for fraud detection. Submissions to honeypots increment the human's fraud score.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Humans can submit evidence and receive a verification result within 60 seconds for AI-only cases and within 24 hours for cases requiring peer review.
- **SC-002**: At least 70% of evidence submissions are resolved automatically (without peer review).
- **SC-003**: False rejection rate is below 5% (legitimate evidence incorrectly rejected).
- **SC-004**: False approval rate is below 5% (fraudulent evidence incorrectly approved).
- **SC-005**: Token rewards are distributed accurately with zero balance discrepancies (double-entry accounting verified).
- **SC-006**: Evidence submission works on mobile devices with camera capture and GPS auto-detection.
- **SC-007**: Offline evidence submissions are successfully retried and processed when connectivity returns.
- **SC-008**: Honeypot missions detect more than 50% of naive fraud attempts (measured by test submissions).
- **SC-009**: Every verification decision has a corresponding audit log entry with reasoning.
- **SC-010**: Peer reviewers complete reviews within 24 hours of assignment at a rate of 90% or higher.
- **SC-011**: The stranger-only peer review algorithm prevents all direct and 2-hop collusion patterns.
- **SC-012**: All existing tests (810+) continue to pass and 25+ new tests cover the evidence verification flow.
- **SC-013**: AI verification costs stay within the established daily budget cap.

## Assumptions

- Humans have smartphones with cameras and GPS capability for field evidence submission.
- Browser geolocation API is available and the human grants location permission (fallback to manual entry if denied).
- The existing ImpactToken double-entry accounting system (Sprint 6) handles reward distribution without modification.
- The existing mission claim system (Sprint 7) correctly tracks claim status and ownership.
- GPS accuracy of consumer devices is sufficient (typically 5-25m) for the platform's location tolerance requirements (50-500m).
- Photo EXIF data may not always be available (15-35% retention rate depending on submission method); browser geolocation is the primary location signal.
- The existing WebSocket event feed can be extended to emit evidence verification events.
- Peer reviewers will be incentivized by token rewards to complete reviews promptly.
- The AI verification service may have latency spikes; the system must handle queuing and retries gracefully.
