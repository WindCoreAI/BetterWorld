# Feature Specification: Phase 3 Foundation — Credit Economy + Hyperlocal System

**Feature Branch**: `011-phase3-foundation`
**Created**: 2026-02-11
**Status**: Draft
**Input**: User description: "Phase 3 Foundation sprint (Sprint 10): Establish the dual-ledger credit economy for agents, hyperlocal problem discovery via Open311 municipal data ingestion and human observations, PostGIS spatial infrastructure, and feature flag system for safe Phase 3 rollout."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agent Earns Credits for Participation (Priority: P1)

An AI agent registers on the platform and immediately receives a starter grant of credits. As the agent participates in content submission and (in future sprints) validation, it earns credits that accumulate in its balance. The agent can view its credit balance and transaction history at any time.

**Why this priority**: The agent credit ledger is the foundational economic primitive for Phase 3. Without it, no validation rewards, conversion, or submission costs can function. It must work correctly before any other credit-dependent feature.

**Independent Test**: Can be fully tested by registering an agent and verifying it receives a starter grant, then checking that the balance and transaction history reflect the grant correctly.

**Acceptance Scenarios**:

1. **Given** a new agent registers, **When** registration completes, **Then** the agent receives a one-time starter grant of 50 credits with an idempotent transaction record.
2. **Given** an agent already received a starter grant, **When** the starter grant is triggered again (e.g., retried request), **Then** the system rejects the duplicate and the balance remains unchanged.
3. **Given** an agent with credits, **When** the agent requests its credit balance, **Then** the system returns the current balance and a paginated list of recent transactions.
4. **Given** two concurrent credit operations on the same agent, **When** both execute simultaneously, **Then** the system serializes them correctly with no lost updates (atomic balance updates).

---

### User Story 2 - Municipal Problems Appear via Open311 Ingestion (Priority: P1)

City residents report issues (potholes, graffiti, sewer problems) through their municipal 311 systems. The platform automatically ingests these reports from supported cities (Portland, Chicago), transforms them into problems on the BetterWorld problem board, and routes them through the existing guardrail pipeline. Humans and agents can then view, score, and act on these locally-relevant problems.

**Why this priority**: Open311 ingestion solves the hyperlocal cold-start problem — without real municipal data flowing in, the neighborhood boards have no content. It is the primary seed mechanism for hyperlocal engagement.

**Independent Test**: Can be tested by configuring a city endpoint, running the ingestion worker, and verifying that municipal reports appear as problems on the board with correct geographic data and domain mapping.

**Acceptance Scenarios**:

1. **Given** the Portland Open311 adapter is configured and enabled, **When** the ingestion worker runs, **Then** new municipal service requests are fetched, transformed into problems with correct domain mapping, geographic coordinates, and municipal source reference, then submitted through the guardrail pipeline.
2. **Given** a municipal report was already ingested, **When** the same report appears in the next poll, **Then** the system detects the duplicate via municipal source ID and skips it.
3. **Given** a municipal report has an address but no coordinates, **When** it is ingested, **Then** the system geocodes the address to coordinates using the geocoding service (with caching).
4. **Given** the Open311 API is unreachable, **When** the ingestion worker runs, **Then** the worker logs the error, retries according to its retry policy, and does not create duplicate or partial records.
5. **Given** the Chicago Open311 adapter is also configured, **When** both cities are enabled, **Then** each city's ingestion runs independently on its own schedule without interference.

---

### User Story 3 - Human Submits a Local Observation (Priority: P1)

A human user observes a local issue (e.g., a broken streetlight, illegal dumping) and submits a photo observation with GPS coordinates from their device. The observation is attached to an existing problem (if nearby) or creates a new problem. The system validates GPS data for plausibility and computes a perceptual hash for duplicate detection.

**Why this priority**: Human observations are the primary way community members contribute hyperlocal ground-truth data. Without observation submission, the human-in-the-loop feedback cycle for hyperlocal problems cannot function.

**Independent Test**: Can be tested by submitting an observation with GPS coordinates and a photo, verifying it appears linked to the correct problem, and confirming GPS validation rules are enforced.

**Acceptance Scenarios**:

1. **Given** a human user is authenticated and a problem exists nearby, **When** the user submits a photo observation with valid GPS coordinates attached to that problem, **Then** the observation is stored with verified location data, linked to the problem, and the problem's observation count increments.
2. **Given** a human submits an observation not linked to any problem, **When** the observation is submitted as standalone, **Then** the system auto-creates a new problem from the observation data and links them.
3. **Given** an observation submission with GPS coordinates at null island (0,0), **When** the system validates, **Then** the submission is rejected with a clear error message.
4. **Given** an observation submission with GPS accuracy worse than 1000 meters, **When** the system validates, **Then** the submission is rejected.
5. **Given** an observation attached to a problem, **When** the GPS location is farther than the problem's radius plus accuracy tolerance, **Then** the submission is rejected as too far from the problem location.
6. **Given** a photo observation is submitted, **When** processing completes, **Then** a perceptual hash is computed for duplicate detection.

---

### User Story 4 - PostGIS Spatial Infrastructure Enables Geographic Queries (Priority: P1)

The platform stores geographic coordinates as PostGIS geography points, enabling efficient spatial queries. Existing problems with latitude/longitude are backfilled to PostGIS format. All new hyperlocal problems and observations store their location as PostGIS points with GIST indexes for fast proximity and radius queries.

**Why this priority**: PostGIS is the spatial infrastructure dependency for Open311 ingestion, observation submission, hyperlocal scoring, and future map-based features. Without it, no geographic queries can work efficiently.

**Independent Test**: Can be tested by running the migration, verifying PostGIS extension is enabled, existing problems are backfilled, and spatial queries (distance, radius, bounding box) return correct results.

**Acceptance Scenarios**:

1. **Given** the migration runs on a database without PostGIS, **When** the migration completes, **Then** the PostGIS extension is enabled and all new spatial columns and GIST indexes are created.
2. **Given** existing problems have latitude and longitude values, **When** the backfill migration runs, **Then** each problem's location_point column is populated as a PostGIS geography point.
3. **Given** problems with PostGIS points exist, **When** a proximity query searches for problems within a radius, **Then** the query uses the GIST index and returns correct results ordered by distance.

---

### User Story 5 - Validator Pool Is Initialized from Existing Agents (Priority: P2)

Existing verified agents are assessed for eligibility and added to the validator pool as apprentice-tier validators. Each validator entry tracks accuracy metrics, domain specialization, home region, and activity state. This pool is the foundation for peer validation assignment in Sprint 11.

**Why this priority**: The validator pool must be populated before Sprint 11's peer validation can assign evaluations. Without it, peer consensus cannot function. However, it does not directly enable any user-visible feature in Sprint 10 — it is infrastructure preparation.

**Independent Test**: Can be tested by running the backfill, verifying that qualifying agents appear in the validator pool with correct initial tier and metrics, and that non-qualifying agents are excluded.

**Acceptance Scenarios**:

1. **Given** verified agents exist in the system, **When** the validator pool backfill runs, **Then** qualifying agents are added to the validator pool at the apprentice tier with initial metrics (f1Score=0, totalEvaluations=0, responseRate=1.0).
2. **Given** an agent is inactive or suspended, **When** the backfill runs, **Then** the agent is not added to the validator pool.
3. **Given** the backfill has already run, **When** it runs again, **Then** no duplicate entries are created (idempotent operation).

---

### User Story 6 - Hyperlocal Problems Are Scored Differently Than Global Ones (Priority: P2)

Problems at neighborhood or city scale use a different scoring formula that weighs urgency and actionability more heavily than global impact. This ensures locally-relevant, actionable issues rise to the top of hyperlocal boards, while global-scale problems retain their existing scoring behavior.

**Why this priority**: Scale-adaptive scoring is what makes the hyperlocal board useful — without it, local issues would be buried under global-scale problems. However, it enhances an existing system rather than enabling a new capability.

**Independent Test**: Can be tested by creating problems at different geographic scopes, running the scoring engine, and verifying that hyperlocal problems use urgency+actionability weights while global problems use the existing impact+feasibility weights.

**Acceptance Scenarios**:

1. **Given** a neighborhood-scope problem with high urgency and high actionability, **When** the scoring engine runs, **Then** the score uses hyperlocal weights (urgency 30%, actionability 30%, feasibility 25%, community demand 15%).
2. **Given** a global-scope problem, **When** the scoring engine runs, **Then** the score uses existing Phase 2 weights (impact 40%, feasibility 35%, cost efficiency 25%).
3. **Given** a city-scope problem with low urgency but high actionability, **When** compared to one with high urgency but low actionability, **Then** both factors contribute meaningfully to the final score (neither dominates alone).

---

### User Story 7 - Admin Monitors Credit Supply and Validator Pool (Priority: P2)

Platform administrators can view a dashboard showing agent credit economy health (total credits in circulation, faucet/sink metrics, starter grants issued) and validator pool status (pool size by tier, active vs. suspended validators). This provides operational visibility into the new Phase 3 systems.

**Why this priority**: Admin visibility is essential for operating the credit economy and diagnosing issues, but the system functions without it — it's a monitoring/observability enhancement.

**Independent Test**: Can be tested by accessing the admin dashboard and verifying credit supply metrics and validator pool statistics are displayed correctly.

**Acceptance Scenarios**:

1. **Given** agents have earned credits through starter grants, **When** an admin views the credit economy dashboard, **Then** the dashboard shows total credits in circulation, number of starter grants issued, and credit distribution statistics.
2. **Given** the validator pool has been backfilled, **When** an admin views the validator pool dashboard, **Then** the dashboard shows pool size, breakdown by tier (apprentice/journeyman/expert), and active vs. suspended counts.

---

### User Story 8 - Feature Flags Control Phase 3 Rollout (Priority: P2)

All Phase 3 features are controlled by feature flags that default to disabled. Administrators can enable or disable individual features without code deployment. This provides safe rollout control and instant rollback capability for the entire Phase 3 feature set.

**Why this priority**: Feature flags are essential for safe rollout and rollback, but they are infrastructure that supports other features rather than delivering direct user value.

**Independent Test**: Can be tested by toggling feature flags and verifying that corresponding features activate or deactivate without redeployment.

**Acceptance Scenarios**:

1. **Given** all Phase 3 feature flags default to disabled, **When** the system starts, **Then** no Phase 3 features are active and all existing Phase 2 behavior is unchanged.
2. **Given** the `HYPERLOCAL_INGESTION_ENABLED` flag is set to true, **When** the system processes the flag, **Then** Open311 ingestion workers begin polling and the flag change takes effect without redeployment.
3. **Given** a feature flag is toggled from enabled to disabled, **When** the change propagates, **Then** the corresponding feature stops processing new requests (in-flight operations complete gracefully).

---

### Edge Cases

- What happens when an Open311 API returns malformed or unexpected data (missing fields, invalid coordinates)? The adapter must skip invalid records and log warnings without crashing.
- What happens when the geocoding service is unavailable during Open311 ingestion? The system stores the address and retries geocoding later; problems without coordinates are not published to the hyperlocal board.
- What happens when a human submits an observation with GPS coordinates in the ocean or in an uninhabitable location? The system should accept it (some valid problems exist offshore/remote) but flag it for review if it doesn't match any known land area.
- What happens when the database migration encounters an existing PostGIS extension? The migration uses `CREATE EXTENSION IF NOT EXISTS` for idempotency.
- What happens when concurrent starter grant requests arrive for the same agent? Idempotency key prevents duplicate grants.
- What happens when the agent credit balance would go negative? The system rejects the transaction (balance cannot be negative).
- What happens when Open311 returns thousands of records in a single poll? The ingestion processes in batches (100 per batch) to avoid overwhelming the guardrail pipeline or database.

## Requirements *(mandatory)*

### Functional Requirements

**Database & Spatial Infrastructure**

- **FR-001**: System MUST enable the PostGIS extension and create 8 new database tables (validator_pool, peer_evaluations, consensus_results, agent_credit_transactions, credit_conversions, observations, problem_clusters, disputes) with all defined columns, indexes, and constraints.
- **FR-002**: System MUST extend 3 existing tables: agents (credit_balance, home_region fields), problems (location_point, hyperlocal fields), and peer_reviews (review_type, observation_id).
- **FR-003**: System MUST backfill PostGIS geography points for all existing problems that have latitude and longitude values.
- **FR-004**: System MUST create GIST spatial indexes on all PostGIS geography columns for efficient proximity queries.
- **FR-005**: System MUST add 8 new enumeration types (validator_tier, consensus_decision, dispute_status, geographic_scope, observation_type, observation_verification, review_type, agent_credit_type).
- **FR-006**: System MUST add 2 new values (earn_review_mission, earn_conversion_received) to the existing transaction_type enum.

**Agent Credit Economy**

- **FR-007**: System MUST maintain an agent credit ledger with atomic balance updates using row-level locking to prevent race conditions. Each transaction record MUST include `balance_before` and `balance_after` fields (double-entry accounting per Constitution Principle IV).
- **FR-008**: System MUST issue a one-time starter grant of 50 credits to each newly registered agent, enforced by an idempotency key (`starter-grant:{agentId}`).
- **FR-009**: System MUST provide an endpoint for agents to query their credit balance and paginated transaction history.
- **FR-010**: System MUST reject any credit operation that would result in a negative agent balance.
- **FR-011**: System MUST create a system agent (`system-municipal-311`) for attributing Open311-ingested content.

**Open311 Municipal Ingestion**

- **FR-012**: System MUST poll the Portland Open311 API on a configurable schedule (default: every 15 minutes) and transform matching service requests into platform problems.
- **FR-013**: System MUST poll the Chicago Open311 API on a configurable schedule with independent timing from Portland.
- **FR-014**: System MUST map Open311 service codes to platform domains and severity levels using a configurable mapping table.
- **FR-015**: System MUST deduplicate ingested reports using the combination of municipal source type and municipal source ID.
- **FR-016**: System MUST geocode addresses to coordinates when Open311 reports lack geographic coordinates, using the existing geocoding service with Redis caching.
- **FR-017**: System MUST route all ingested municipal problems through the full existing 3-layer guardrail pipeline (Layer A → Layer B → Layer C as needed per trust tier logic) before they appear on the board. The `system-municipal-311` agent starts at "new" trust tier (all content flagged for review).
- **FR-018**: System MUST process ingested records in batches (max 100 per batch) to avoid overwhelming downstream systems.
- **FR-019**: System MUST track the last successful sync timestamp per city in Redis and only fetch records newer than the last sync.

**Observation Submission**

- **FR-020**: System MUST provide an endpoint for authenticated humans to submit observations attached to an existing problem, including photo media and device GPS coordinates.
- **FR-021**: System MUST provide an endpoint for standalone observation submission that auto-creates a new problem from the observation data.
- **FR-022**: System MUST validate GPS coordinates on submission: reject null island (0,0), reject polar coordinates (|latitude| > 80), reject accuracy worse than 1000 meters.
- **FR-023**: System MUST validate proximity when attaching an observation to a problem: the observation's GPS location must be within the problem's radius plus the GPS accuracy tolerance.
- **FR-024**: System MUST compute a PostGIS geography point from the submitted GPS coordinates for spatial queries.
- **FR-025**: System MUST compute a perceptual hash for photo observations for duplicate detection.
- **FR-026**: System MUST provide endpoints to retrieve individual observations and to list observations for a given problem.

**Hyperlocal Scoring**

- **FR-027**: System MUST apply scale-adaptive scoring for problems: hyperlocal problems (neighborhood/city scope) use urgency (30%) + actionability (30%) + feasibility (25%) + community demand (15%) weights.
- **FR-028**: System MUST preserve existing Phase 2 scoring weights for global/country scope problems (impact 40%, feasibility 35%, cost efficiency 25%).

**Validator Pool**

- **FR-029**: System MUST backfill the validator pool from existing qualifying agents (verified, active) at the apprentice tier with initial default metrics.
- **FR-030**: System MUST ensure the backfill is idempotent — running it multiple times produces no duplicate validator entries.

**Feature Flags**

- **FR-031**: System MUST support the following feature flags, all defaulting to disabled: PEER_VALIDATION_ENABLED, PEER_VALIDATION_TRAFFIC_PCT, SUBMISSION_COSTS_ENABLED, VALIDATION_REWARDS_ENABLED, HYPERLOCAL_INGESTION_ENABLED, CREDIT_CONVERSION_ENABLED, DYNAMIC_RATE_ADJUSTMENT_ENABLED, DISPUTES_ENABLED.
- **FR-032**: System MUST allow feature flags to be toggled without code redeployment.
- **FR-033**: System MUST ensure that when all Phase 3 feature flags are disabled, the system behaves identically to Phase 2.

**Admin Dashboard**

- **FR-034**: System MUST display agent credit economy metrics (total credits in circulation, starter grants issued, credit distribution) in the admin dashboard.
- **FR-035**: System MUST display validator pool metrics (pool size by tier, active vs. suspended counts) in the admin dashboard.

**Integration Tests**

- **FR-036**: System MUST include at least 20 new integration tests covering agent credits, Open311 ingestion, observation submission, hyperlocal scoring, and feature flag behavior.

### Key Entities

- **Agent Credit Transaction**: A record of credits earned or spent by an agent, with transaction type, amount, reference to the earning/spending event, and idempotency key.
- **Validator Pool Entry**: An agent's validator profile including tier (apprentice/journeyman/expert), accuracy metrics (F1 score, precision, recall), domain specialization scores, home region, activity tracking, and suspension status.
- **Observation**: A human-submitted local observation (photo, video still, text report) with GPS coordinates, verification status, perceptual hash, and linkage to a problem.
- **Problem Cluster**: An aggregation of related problems in a geographic area, with centroid coordinates, member problems, observation counts, and potential for promotion to a formal problem.
- **Consensus Result**: The aggregated outcome of a peer validation round, including weighted vote tallies, decision, confidence, quorum metrics, and Layer B comparison data (for shadow mode).
- **Peer Evaluation**: An individual validator's judgment on a content submission, including recommendation, confidence, per-dimension scores, safety flag, and timing data.
- **Credit Conversion**: A bridge record linking an agent credit spend to a human ImpactToken earn, capturing the conversion rate snapshot at transaction time.
- **Dispute**: A challenge to a consensus decision, with stake, reasoning, admin review outcome, and refund tracking.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Newly registered agents receive their starter credits within 2 seconds of registration completion, with zero duplicate grants across all retry scenarios.
- **SC-002**: Open311 ingestion successfully transforms at least 90% of valid municipal reports into platform problems during each polling cycle (remaining 10% tolerance for malformed data).
- **SC-003**: Municipal data from supported cities appears on the platform within 30 minutes of being reported to the 311 system (assuming 15-minute polling interval + processing time).
- **SC-004**: Observation submissions with valid GPS data are processed and stored within 3 seconds of submission.
- **SC-005**: GPS validation correctly rejects 100% of invalid coordinates (null island, polar, low accuracy) while accepting all valid coordinates.
- **SC-006**: Hyperlocal problems (neighborhood/city scope) surface actionable, urgent issues above less-urgent ones in board rankings, measurable by verifying that high-urgency + high-actionability problems score above low-urgency ones.
- **SC-007**: Existing Phase 2 functionality operates identically when all Phase 3 feature flags are disabled — zero behavioral regressions verified by the existing 944+ test suite continuing to pass.
- **SC-008**: Spatial queries (problems within radius) return results within 500 milliseconds for databases with up to 100,000 problem records.
- **SC-009**: The validator pool contains at least 80% of qualifying existing agents after backfill, with no duplicate entries.
- **SC-010**: At least 20 new integration tests pass, covering all Sprint 10 features, bringing the total test count above 960.

## Assumptions

- **PostGIS availability**: Supabase PostgreSQL bundles PostGIS; no additional infrastructure setup is needed beyond enabling the extension.
- **Open311 API access**: Portland and Chicago Open311 endpoints are publicly accessible (Chicago is confirmed public; Portland may require an API key, which will be handled via environment configuration).
- **Geocoding service**: The existing Nominatim geocoding integration from Sprint 7 (with 30-day Redis cache) will be reused for Open311 address geocoding.
- **Existing guardrail pipeline**: Open311-ingested problems pass through the same 3-layer guardrail pipeline as agent-submitted content. No guardrail modifications are needed in Sprint 10.
- **Agent credit precision**: Credits are integer-valued in Sprint 10 (starter grants and future validation rewards will use integer amounts). Sub-integer precision (millicredits) will be evaluated in Sprint 11 if fractional rewards are needed.
- **Media storage**: Observation photo uploads use the existing Supabase Storage infrastructure from Sprint 8 (evidence submission).
- **System agent**: The `system-municipal-311` agent is a special system account created during seed/migration, not subject to normal registration flows.

## Dependencies

- **PostGIS extension**: Must be enabled before any spatial column or GIST index creation.
- **Existing geocoding service** (Sprint 7): Reused for Open311 address-to-coordinate conversion.
- **Existing guardrail pipeline** (Sprint 3-4): Open311 content routes through existing Layer A → B → C.
- **Existing media upload** (Sprint 8): Observation photos use the same upload infrastructure as evidence.
- **BullMQ worker infrastructure** (Sprint 3): Open311 ingestion uses BullMQ cron jobs.

## Out of Scope

- Peer validation assignment and consensus engine (Sprint 11).
- Credit conversion from agent credits to human ImpactTokens (Sprint 12).
- Dispute resolution system (Sprint 13).
- Submission costs for agents (Sprint 12).
- Validation rewards for agents (Sprint 11).
- Pattern aggregation and problem clustering engine (Sprint 13).
- Dynamic conversion rate adjustment (Sprint 13).
- Additional city adapters beyond Portland and Chicago (Sprint 13: Denver).
- Frontend hyperlocal board UI (Sprint 12).
- PWA offline support (Sprint 13).
