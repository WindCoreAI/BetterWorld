# Feature Specification: Phase 3 Integration (Sprint 13)

**Feature Branch**: `014-phase3-integration`
**Created**: 2026-02-13
**Status**: Draft
**Input**: User description: "Sprint 13: Phase 3 Integration - dispute resolution, dynamic rate adjustment, evidence review economy, domain specialization, pattern aggregation, Denver expansion, cross-city dashboard, offline PWA, hybrid quorum, local validator bonuses"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Dispute Resolution (Priority: P1)

An agent validator who believes a consensus decision was incorrect can formally challenge it by staking credits. An administrator reviews the dispute and renders a verdict. If the challenger is correct, they recover their stake plus a bonus. If incorrect, they lose their stake. Repeated frivolous disputes result in a temporary suspension from the dispute system.

**Why this priority**: Dispute resolution is essential for accountability in the peer validation system. Without it, incorrect consensus decisions have no correction mechanism, eroding trust in the platform.

**Independent Test**: Can be fully tested by having a validator file a dispute against a consensus result, an admin reviewing it, and verifying the correct credit outcome (refund + bonus or forfeiture).

**Acceptance Scenarios**:

1. **Given** a completed consensus decision, **When** a validator stakes credits to dispute it, **Then** the dispute is recorded with status `open`, the validator's stated reasoning, and stake is deducted from their balance.
2. **Given** an open dispute, **When** an administrator reviews and rules in favor of the challenger, **Then** the dispute status transitions to `upheld` and the challenger receives their stake back plus a bonus.
3. **Given** an open dispute, **When** an administrator reviews and rules against the challenger, **Then** the dispute status transitions to `dismissed` and the staked credits are forfeited.
4. **Given** a validator has filed 3+ dismissed disputes in the last 30 days, **When** they attempt to file another dispute, **Then** the system rejects it with a 60-day suspension notice.

---

### User Story 2 - Credit Economy Self-Regulation (Priority: P1)

The platform automatically monitors the ratio of credits entering the economy (faucets: starter grants, validation rewards) versus credits leaving (sinks: submission costs, dispute stakes lost). When the ratio drifts outside a healthy range, the system auto-adjusts reward and cost rates to bring the economy back into balance. A circuit breaker halts auto-adjustment if the imbalance becomes extreme.

**Why this priority**: A self-sustaining credit economy is a Phase 3 exit criterion. Without auto-regulation, manual intervention is needed to prevent inflation or deflation, which is unsustainable at scale.

**Independent Test**: Can be tested by simulating credit flow data with known faucet/sink ratios and verifying that the system triggers appropriate rate adjustments.

**Acceptance Scenarios**:

1. **Given** the faucet/sink ratio exceeds the upper threshold (>1.15), **When** the weekly adjustment runs, **Then** rewards decrease by 10% and costs increase by 10%.
2. **Given** the faucet/sink ratio falls below the lower threshold (<0.85), **When** the weekly adjustment runs, **Then** rewards increase by 10% and costs decrease by 10%.
3. **Given** the ratio is within the healthy range (0.85-1.15), **When** the weekly adjustment runs, **Then** no rate changes are made.
4. **Given** the ratio has exceeded 2.0 for 3 consecutive days, **When** the circuit breaker triggers, **Then** all auto-adjustments are paused and administrators are alerted.
5. **Given** any auto-adjustment, **Then** no single cycle changes rates by more than 20%.

---

### User Story 3 - Evidence Review Economy (Priority: P2)

Validators can now review mission evidence (photos, documents, links) submitted by humans, earning credits for each completed review. Validators with vision-analysis capabilities are prioritized for photo-heavy evidence. When insufficient peer reviewers are available, the system falls back to AI-assisted review.

**Why this priority**: Extending the validation economy to evidence review creates a new earning pathway for validators and reduces reliance on AI-only verification, improving accuracy through human judgment.

**Independent Test**: Can be tested by submitting mission evidence and verifying that qualified validators are assigned, complete reviews, and receive appropriate credit rewards.

**Acceptance Scenarios**:

1. **Given** a human submits mission evidence, **When** the system assigns reviewers, **Then** validators with relevant capabilities are prioritized.
2. **Given** a validator completes an evidence review, **When** the review is submitted, **Then** the validator earns credits at the evidence review rate.
3. **Given** fewer than the required number of peer reviewers are available, **When** an evidence review is needed, **Then** the system falls back to AI-assisted review.
4. **Given** a validator's capabilities profile, **When** evidence requiring vision analysis is submitted, **Then** vision-capable validators are prioritized in the assignment.

---

### User Story 4 - Domain Specialization (Priority: P2)

Validators who consistently demonstrate high accuracy (F1 score) in a specific domain over a meaningful number of evaluations earn a "specialist" designation for that domain. Specialists carry greater weight in consensus decisions within their specialty, improving the quality of domain-specific validation.

**Why this priority**: Domain expertise improves validation quality. Specialists who deeply understand environmental protection or public health can make more nuanced judgments than generalists.

**Independent Test**: Can be tested by tracking a validator's per-domain accuracy over evaluations and verifying specialist designation triggers at the correct threshold.

**Acceptance Scenarios**:

1. **Given** a validator completes 50+ evaluations in a domain with F1 score >= 0.90, **When** their scores are assessed, **Then** they earn "specialist" status for that domain.
2. **Given** a specialist participates in consensus for their specialty domain, **When** votes are weighted, **Then** their vote carries 1.5x the normal weight.
3. **Given** a specialist's F1 score drops below 0.85 in their specialty, **When** their status is reassessed, **Then** their specialist designation is revoked after a grace period.
4. **Given** a validator's domain scores, **When** viewing their profile, **Then** their specialist domains and current F1 scores are visible.

---

### User Story 5 - Hybrid Quorum for Hyperlocal Validation (Priority: P2)

For problems scoped to a city or neighborhood, the validator assignment algorithm ensures that at least 2 of the assigned validators are local (within 50km of the problem location) and 1 is a global validator providing an outside perspective. If insufficient local validators are available, the system gracefully degrades to all-global assignment. Local validators earn a bonus multiplier on their rewards to incentivize local participation.

**Why this priority**: Local context matters for hyperlocal problems. A pothole report is best validated by someone who can verify on the ground. The bonus incentivizes validators to set their home regions.

**Independent Test**: Can be tested by creating a hyperlocal problem and verifying the quorum composition (2 local + 1 global), and checking that local validators receive the bonus multiplier.

**Acceptance Scenarios**:

1. **Given** a hyperlocal problem (city/neighborhood scope), **When** validators are assigned, **Then** at least 2 local validators (within 50km) and 1 global validator are selected.
2. **Given** fewer than 2 local validators are available for a problem's area, **When** validators are assigned, **Then** the system uses 3 global validators instead.
3. **Given** a local validator completes a validation for a nearby problem, **When** rewards are distributed, **Then** they receive 1.5x the standard reward for their tier.
4. **Given** a global validator completes a validation for a hyperlocal problem, **When** rewards are distributed, **Then** they receive the standard reward for their tier.

---

### User Story 6 - Pattern Aggregation Engine (Priority: P3)

The system periodically analyzes hyperlocal problems to identify clusters of similar issues within a geographic area. When 5 or more problems cluster together (proximity + category match + description similarity), the system flags them as a "systemic issue" and generates a human-readable summary describing the pattern (e.g., "15 potholes reported along SE Hawthorne Boulevard").

**Why this priority**: Individual problem reports are useful, but identifying patterns transforms reactive reporting into proactive systemic analysis. City administrators benefit from seeing aggregated trends rather than individual complaints.

**Independent Test**: Can be tested by creating multiple similar problems in close proximity and verifying that the system identifies and summarizes the cluster.

**Acceptance Scenarios**:

1. **Given** 5+ problems within 1km sharing the same category, **When** the aggregation engine runs, **Then** a cluster is created linking these problems as a systemic issue.
2. **Given** a newly identified cluster, **When** the summary is generated, **Then** it includes the problem count, geographic area, category, and a human-readable description.
3. **Given** problems with similar descriptions but different categories, **When** the aggregation engine runs, **Then** they are not clustered together (category match is required).
4. **Given** an existing cluster, **When** new matching problems are reported in the area, **Then** the cluster is updated with the new problems and summary is refreshed.

---

### User Story 7 - Denver City Expansion (Priority: P3)

Denver is onboarded as the third city for municipal problem ingestion, joining Portland and Chicago. The system connects to Denver's civic reporting system and ingests reported issues (potholes, streetlights, graffiti, illegal dumping) using the same transformation pipeline as existing cities. Denver appears in the city selector and dashboards.

**Why this priority**: Expanding to a third city validates the platform's multi-city scalability and provides more data points for cross-city analysis.

**Independent Test**: Can be tested by triggering Denver ingestion and verifying that problems are created with correct categorization and appear in the Denver city dashboard.

**Acceptance Scenarios**:

1. **Given** the Denver data source is configured, **When** the ingestion job runs, **Then** problems are created with correct category mapping (potholes, streetlights, graffiti, illegal dumping).
2. **Given** Denver problems have been ingested, **When** a user views the city selector, **Then** Denver appears alongside Portland and Chicago.
3. **Given** a previously ingested Denver problem, **When** the ingestion job runs again, **Then** the duplicate is detected and not re-created.
4. **Given** Denver ingestion succeeds, **When** viewing the city dashboard, **Then** Denver metrics (problem counts, categories, resolution rates) are displayed.

---

### User Story 8 - Cross-City Insights Dashboard (Priority: P3)

Administrators and users can view a comparative dashboard showing side-by-side metrics across all operational cities. The dashboard includes problems per capita, average resolution time, category distribution, and validator density, enabling identification of best practices that can be replicated across cities.

**Why this priority**: Cross-city comparison enables data-driven decisions about resource allocation and identifies which approaches work best in different contexts.

**Independent Test**: Can be tested by having data from multiple cities and verifying that comparative charts render with correct data.

**Acceptance Scenarios**:

1. **Given** data from multiple cities, **When** viewing the cross-city dashboard, **Then** side-by-side comparison of key metrics is displayed.
2. **Given** city data at different scales, **When** viewing problems per capita, **Then** metrics are normalized by population for fair comparison.
3. **Given** category data from all cities, **When** viewing category distribution, **Then** a breakdown shows which problem types dominate in each city.
4. **Given** validator data, **When** viewing validator density, **Then** the number of active validators per city is displayed.

---

### User Story 9 - Offline Observation Support (Priority: P4)

Humans can submit observations (problem reports with photos and GPS) even when they have no internet connection. Observations are saved locally on the device and automatically uploaded when connectivity is restored. The app can be installed to the device's home screen for quick access.

**Why this priority**: Many social good problems occur in areas with poor connectivity. Offline support removes a significant barrier to participation and ensures no observations are lost.

**Independent Test**: Can be tested by disabling network connectivity, submitting an observation, re-enabling connectivity, and verifying the observation uploads successfully.

**Acceptance Scenarios**:

1. **Given** a human has no internet connectivity, **When** they submit an observation with photos and GPS, **Then** the observation is saved locally on the device.
2. **Given** observations are queued locally, **When** internet connectivity is restored, **Then** queued observations are automatically uploaded in order.
3. **Given** the web application, **When** a user visits it on a mobile device, **Then** they are prompted to install it to their home screen.
4. **Given** a failed upload attempt, **When** the system retries, **Then** it uses exponential backoff and does not lose the queued observation.
5. **Given** offline mode, **When** browsing problems, **Then** previously loaded problems are available for read-only viewing.

---

### Edge Cases

- What happens when a validator disputes their own consensus decision? The system prevents self-disputes.
- What happens when the credit economy circuit breaker activates during an active dispute? Existing disputes are processed normally; only new rate adjustments are paused.
- What happens when a specialist validator's accuracy drops in a single evaluation? Grace period prevents immediate revocation — sustained decline below threshold is required.
- What happens when pattern aggregation finds overlapping clusters? A problem belongs to at most one cluster; the most geographically tight cluster takes priority.
- What happens when Denver's municipal data source is temporarily unavailable? The ingestion job retries with backoff and alerts administrators after repeated failures.
- What happens when a device has queued observations but the user logs out? Queued observations persist and upload on next login.
- What happens when there are exactly 2 local validators but one is the submission's author? The author is excluded and the system recruits additional global validators.

## Requirements *(mandatory)*

### Functional Requirements

**Dispute Resolution**
- **FR-001**: System MUST allow validators to file disputes against completed consensus decisions by staking 10 credits.
- **FR-002**: System MUST present disputed consensus decisions to administrators for review in a dedicated queue.
- **FR-003**: System MUST refund the 10-credit stake plus a 5-credit bonus when administrator rules in favor of the challenger.
- **FR-004**: System MUST forfeit the staked credits when administrator rules against the challenger.
- **FR-005**: System MUST suspend dispute filing for 60 days when a validator accumulates 3+ failed disputes within a 30-day window.
- **FR-006**: System MUST prevent validators from disputing their own consensus decisions.

**Credit Economy Self-Regulation**
- **FR-007**: System MUST calculate the faucet/sink ratio on a weekly basis using all credit transactions.
- **FR-008**: System MUST auto-adjust reward rates down 10% and cost rates up 10% when faucet/sink ratio exceeds 1.15.
- **FR-009**: System MUST auto-adjust reward rates up 10% and cost rates down 10% when faucet/sink ratio falls below 0.85.
- **FR-010**: System MUST cap any single adjustment cycle at a maximum 20% change.
- **FR-011**: System MUST activate a circuit breaker when the faucet/sink ratio exceeds 2.0 for 3 consecutive days, pausing all auto-adjustments and alerting administrators.
- **FR-012**: System MUST log all rate adjustments with before/after values for audit purposes.

**Evidence Review Economy**
- **FR-013**: System MUST allow qualified validators to review mission evidence and earn 1.5 credits per completed review.
- **FR-014**: System MUST track vision-analysis capability in each validator's profile.
- **FR-015**: System MUST prioritize vision-capable validators for evidence containing photos.
- **FR-016**: System MUST fall back to AI-assisted review when insufficient peer reviewers are available.

**Domain Specialization**
- **FR-017**: System MUST track per-domain F1 scores for each validator.
- **FR-018**: System MUST award "specialist" designation when a validator achieves F1 >= 0.90 across 50+ evaluations in a specific domain.
- **FR-019**: System MUST apply a 1.5x consensus weight multiplier for specialist validators voting within their specialty domain.
- **FR-020**: System MUST revoke specialist designation when a validator's domain F1 drops below 0.85, subject to a grace period.
- **FR-021**: System MUST display specialist domains and F1 scores on validator profiles.

**Hybrid Quorum & Local Bonuses**
- **FR-022**: System MUST assign 2 local validators (within 50km) and 1 global validator for hyperlocal problems (city/neighborhood scope).
- **FR-023**: System MUST gracefully degrade to 3 global validators when fewer than 2 local validators are available.
- **FR-024**: System MUST award local validators 1.5x the standard validation reward for their tier.
- **FR-025**: System MUST track local vs global validation counts in each validator's profile.

**Pattern Aggregation**
- **FR-026**: System MUST periodically cluster hyperlocal problems by proximity (<1km), category match, and description similarity (>85% similarity).
- **FR-027**: System MUST flag clusters of 5+ problems as "systemic issues."
- **FR-028**: System MUST generate human-readable summaries for each cluster describing the pattern, count, and geographic area.
- **FR-029**: System MUST update existing clusters when new matching problems are reported.
- **FR-030**: System MUST ensure each problem belongs to at most one cluster.

**Denver City Expansion**
- **FR-031**: System MUST ingest problems from Denver's civic reporting system for categories: potholes, streetlights, graffiti, illegal dumping.
- **FR-032**: System MUST apply the same transformation and deduplication pipeline as Portland and Chicago.
- **FR-033**: System MUST include Denver in the city selector and all city-scoped dashboards.

**Cross-City Dashboard**
- **FR-034**: System MUST display side-by-side metrics for all operational cities including problems per capita, resolution time, category distribution, and validator density.
- **FR-035**: System MUST normalize metrics by population for fair cross-city comparison.

**Offline Support**
- **FR-036**: System MUST allow humans to compose and save observations (photos + GPS) while offline.
- **FR-037**: System MUST automatically upload queued observations when connectivity is restored, using exponential backoff for retries.
- **FR-038**: System MUST allow the application to be installed to a device's home screen.
- **FR-039**: System MUST provide read-only access to previously loaded problems while offline.
- **FR-040**: System MUST persist queued observations across browser sessions and logouts.

### Key Entities

- **Dispute**: A formal challenge to a consensus decision. Contains the disputed decision reference, challenger identity, stake amount, stated reason, admin verdict, and resolution timestamp.
- **Rate Adjustment**: A record of an automated credit economy adjustment. Contains the faucet/sink ratio, direction of adjustment, percentage change, and before/after rate values.
- **Evidence Review Assignment**: A work item linking a validator to mission evidence for review. Contains the evidence reference, assigned validator, capability match, review outcome, and credits earned.
- **Domain Specialization**: A per-domain qualification for a validator. Contains the domain, F1 score, evaluation count, specialist status, and designation/revocation timestamps.
- **Problem Cluster**: A group of geographically and thematically related problems. Contains the member problems, geographic center, radius, category, count, generated summary, and systemic issue flag.
- **City Configuration**: A set of parameters for ingesting data from a municipal system. Contains the city name, data source endpoint, category mappings, population, and sync metadata.
- **Offline Observation Queue**: A locally-stored collection of observations pending upload. Contains the observation data (photos, GPS, description), creation timestamp, upload status, and retry count.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Platform's AI verification costs are reduced by at least 80% compared to Phase 2 levels through peer validation replacing AI-only decisions.
- **SC-002**: Credit economy achieves self-sustaining balance with faucet/sink ratio between 0.85 and 1.15 for 2+ consecutive weeks.
- **SC-003**: Validator pool reaches 100+ agents distributed across all qualification tiers.
- **SC-004**: At least 3 disputes are filed and resolved within the first 2 weeks of availability.
- **SC-005**: At least 10 mission evidence submissions are reviewed by peer validators within the first 2 weeks.
- **SC-006**: At least 5 validators earn specialist designation in one or more domains.
- **SC-007**: Pattern aggregation identifies at least 3 systemic issues (clusters of 5+ similar problems).
- **SC-008**: Denver becomes operational with at least 10 problems ingested within 48 hours of activation.
- **SC-009**: Hyperlocal problems are assigned hybrid quorums (2 local + 1 global) when sufficient local validators exist.
- **SC-010**: Local validator bonus is correctly recorded in transaction logs for all qualifying validations.
- **SC-011**: Offline observations are successfully queued and uploaded with zero data loss across connectivity interruptions.
- **SC-012**: API p95 latency remains below 500ms and consensus p95 remains below 10s with all new features active.
- **SC-013**: 15+ new integration tests pass, covering all major features introduced in this sprint.
- **SC-014**: Zero type-safety or code quality errors across the codebase after integration.

## Assumptions

- Denver's civic reporting system follows the Open311 GeoReport v2 standard, consistent with Portland and Chicago.
- Population data for per-capita normalization is sourced from publicly available census data and updated manually.
- The 10-credit dispute stake amount and 5-credit bonus are initial values that may be adjusted based on usage patterns.
- Offline PWA functionality targets modern mobile browsers (Chrome, Safari, Firefox) with Service Worker and IndexedDB support.
- Description similarity for pattern aggregation uses semantic similarity (embedding cosine distance) rather than simple text matching.
- The 50km threshold for "local" validators is the initial radius and may be tuned based on geographic density.
- The faucet/sink ratio calculation uses a trailing 7-day window for stability.
- The circuit breaker's 3-day threshold for ratio >2.0 prevents premature activation from short-term fluctuations.

## Scope Boundaries

**In scope:**
- Dispute resolution with admin arbitration
- Automated credit economy balancing (weekly cycle)
- Evidence review by validators
- Per-domain F1 tracking and specialist designation
- Hybrid quorum assignment for hyperlocal problems
- Local validator reward bonuses
- Problem pattern clustering and systemic issue identification
- Denver Open311 integration
- Cross-city comparative dashboard
- Offline observation queuing via PWA

**Out of scope:**
- Automated dispute resolution without admin involvement (future enhancement)
- Real-time credit economy adjustments (weekly cadence is sufficient for Phase 3)
- Video evidence review (photos and documents only)
- Validator-to-validator dispute escalation
- Mobile native app (PWA approach only)
- Cities beyond Denver in this sprint
- Multi-language support for cluster summaries (English only)
- Peer-to-peer dispute mediation
