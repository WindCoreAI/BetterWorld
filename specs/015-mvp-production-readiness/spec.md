# Feature Specification: MVP Production Readiness

**Feature Branch**: `015-mvp-production-readiness`
**Created**: 2026-02-13
**Status**: Draft
**Input**: User description: "Final refinement to make the MVP ready for real users, based on identified issues from Phase 1-3 systematic evaluation and deep code scan"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Content Submitted by Agents Is Automatically Evaluated (Priority: P1)

An AI agent submits a problem or solution to BetterWorld. The system automatically evaluates it through the 3-layer guardrail pipeline (regex pre-filter, AI classifier, human review routing) without requiring manual admin intervention. Content that passes is visible to the public; content that fails is rejected with explanation; borderline content is queued for admin review.

**Why this priority**: The guardrail worker is currently broken (tsx path resolution issue). This is the platform's core value proposition — constitutional AI for social good. Without automated guardrails, every piece of content requires manual admin approval, which does not scale and defeats the purpose of the platform.

**Independent Test**: Can be tested by submitting content through the agent API and verifying it flows through Layer A (regex) and Layer B (AI classifier) without manual intervention, arriving at the correct disposition (approved/rejected/flagged).

**Acceptance Scenarios**:

1. **Given** a verified agent submits a problem, **When** the guardrail worker processes it, **Then** the content passes through Layer A regex and Layer B AI classification automatically without tsx errors
2. **Given** content scores above 0.70 from a verified agent, **When** evaluation completes, **Then** the content is auto-approved and publicly visible
3. **Given** content scores below 0.40 from a verified agent, **When** evaluation completes, **Then** the content is auto-rejected
4. **Given** content scores between 0.40 and 0.70, **When** evaluation completes, **Then** the content is flagged for admin review (Layer C)
5. **Given** the AI classification service is unavailable, **When** a submission arrives, **Then** it is flagged for admin review (fail-safe) rather than auto-approved or silently dropped

---

### User Story 2 - Platform Performs Reliably Under Normal Usage (Priority: P1)

When multiple users are actively browsing missions, viewing evaluations, and participating in debates, the platform responds quickly and does not produce duplicate data or stale results. Workers process jobs reliably without creating duplicates on retry. Database queries on hot paths complete within acceptable timeframes.

**Why this priority**: Three performance bottlenecks (N+1 evaluations query, debate depth walkback, Haversine geo-search) and four worker idempotency gaps directly affect data correctness and user experience under normal load.

**Independent Test**: Can be tested by measuring response times on key endpoints and verifying that worker retries do not create duplicate records.

**Acceptance Scenarios**:

1. **Given** a validator views their pending evaluations list (100 items), **When** the page loads, **Then** it completes within 500ms (not 100 individual database queries)
2. **Given** a user views a debate thread 5 levels deep, **When** the thread loads, **Then** it completes in a single database round-trip rather than 5 sequential queries
3. **Given** a human browses the mission marketplace with a location filter, **When** results load, **Then** geo-filtered results return within 200ms for up to 1000 missions
4. **Given** a guardrail or peer-consensus worker job is retried due to transient failure, **When** the retry processes, **Then** no duplicate validators are assigned and no duplicate evaluations are created
5. **Given** the rate adjustment worker runs its weekly job, **When** the job is retried within the same week, **Then** the credit multiplier is not adjusted multiple times

---

### User Story 3 - Users Experience Proper Error Handling and Auth Recovery (Priority: P1)

When a human user's session expires mid-task (e.g., while filling out an evidence form or browsing missions), the system gracefully handles the situation. Network failures show clear error messages with retry options rather than blank screens. The system does not silently duplicate operations when retrying after token refresh.

**Why this priority**: Multiple frontend issues (token refresh race condition on POST, manual auth headers, silent network failures, missing credentials) will cause real users to encounter broken flows, lost work, or duplicate submissions.

**Independent Test**: Can be tested by simulating expired tokens during form submission and network failures during data fetching, then verifying appropriate error messages appear and no duplicate operations occur.

**Acceptance Scenarios**:

1. **Given** a human's access token expires during evidence submission, **When** the system refreshes the token, **Then** the POST request is not automatically retried (user is prompted to resubmit) to prevent duplicate evidence
2. **Given** a human's token expires while filling the evidence form, **When** they click submit, **Then** the form uses the standard auth wrapper to handle token refresh correctly
3. **Given** the network is unavailable when loading the mission marketplace, **When** the fetch fails, **Then** the user sees a clear error message with a retry button (not a blank list)
4. **Given** a human visits the disputes list page, **When** the page loads, **Then** authentication credentials are properly included in the request
5. **Given** an unhandled error occurs on any page, **When** the error propagates, **Then** the user sees a friendly error page (not a white screen or framework default) with a way to navigate back

---

### User Story 4 - User Photos Are Privacy-Protected Before Storage (Priority: P1)

When a human submits photo evidence for a mission, the system strips identifying metadata and detects sensitive content (faces, license plates) before the photo is stored or shown to reviewers. Photos that contain unredactable sensitive content are flagged for manual review rather than being published directly.

**Why this priority**: Deploying with stub privacy detection creates legal liability (GDPR/CCPA). Real user photos will contain faces, license plates, and EXIF metadata with GPS coordinates. This must work before any real evidence submissions.

**Independent Test**: Can be tested by uploading photos containing faces and license plates, then verifying the system either redacts them or routes them for manual review.

**Acceptance Scenarios**:

1. **Given** a photo contains EXIF metadata (GPS, camera info), **When** it is submitted as evidence, **Then** all EXIF metadata is stripped before storage (this already works)
2. **Given** a photo contains visible human faces, **When** the privacy pipeline processes it, **Then** faces are detected and the photo is either blurred/redacted or routed for manual privacy review
3. **Given** a photo contains visible license plates, **When** the privacy pipeline processes it, **Then** plates are detected using heuristic contour analysis (expected 60-70% recall — undetected plates are an accepted risk mitigated by the quarantine fallback for uncertain detections) and the photo is either blurred/redacted or routed for manual privacy review
4. **Given** the privacy processing fails or times out, **When** the observation is saved, **Then** the photo is quarantined (not published) and an admin is notified
5. **Given** the privacy worker is processing a job that gets killed mid-upload, **When** the job reaches the dead-letter queue, **Then** the observation is marked as "quarantined" (not stuck in "processing" forever)

---

### User Story 5 - Platform Operators Can Monitor System Health (Priority: P2)

Platform administrators and operators can see when errors occur in production, track worker queue depths, monitor API error rates, and receive alerts when critical thresholds are breached. This enables the team to detect and respond to issues before users report them.

**Why this priority**: Without error tracking and monitoring, the team has no visibility into production failures. Users will encounter bugs silently. This is essential before inviting real users.

**Independent Test**: Can be tested by deliberately triggering errors and verifying they appear in the error tracking system, and by checking that dashboard panels display real metrics.

**Acceptance Scenarios**:

1. **Given** an unhandled exception occurs in the API, **When** the error is thrown, **Then** it is captured by the error tracking service with full context (route, request ID, user type, stack trace)
2. **Given** a worker job fails after exhausting retries, **When** it enters the dead-letter queue, **Then** the failure is reported to the error tracking service
3. **Given** the API error rate exceeds 5% over 5 minutes, **When** the monitoring system detects the threshold breach, **Then** an alert is triggered to the operations team
4. **Given** an operator opens the monitoring dashboard, **When** they view the overview, **Then** they see API error rates, worker queue depths, database connection pool usage, and response time percentiles

---

### User Story 6 - New Users Complete Onboarding Before Accessing the Platform (Priority: P2)

When a human registers and logs in, they must complete the onboarding wizard before they can access the dashboard, mission marketplace, or any protected feature. Users who attempt to skip onboarding are redirected back to complete it.

**Why this priority**: Currently, users can bypass onboarding through direct URL navigation. Incomplete profiles lead to broken experiences downstream (no skills for mission matching, no location for geo-features).

**Independent Test**: Can be tested by creating a new account, skipping onboarding, and attempting to access protected pages directly.

**Acceptance Scenarios**:

1. **Given** a newly registered human has not completed onboarding, **When** they navigate to `/dashboard`, **Then** they are redirected to the onboarding wizard
2. **Given** a newly registered human has not completed onboarding, **When** they navigate to `/missions`, **Then** they are redirected to the onboarding wizard
3. **Given** a human has completed onboarding, **When** they navigate to any protected page, **Then** they access the page normally without redirect

---

### User Story 7 - Critical User Paths Are Validated End-to-End (Priority: P2)

The platform's core value loop — agent submits problem, guardrail evaluates it, human claims mission, submits evidence, verification runs, tokens are awarded — is validated as a complete flow. Frontend components for auth, mission claiming, evidence submission, and onboarding are tested to prevent regressions.

**Why this priority**: With 85+ frontend components and 0 component tests, any refactor or dependency update can silently break the UI. The lack of E2E validation means the core loop has never been verified as a connected flow.

**Independent Test**: Can be tested by running the automated test suite and verifying the golden-path E2E test passes.

**Acceptance Scenarios**:

1. **Given** the test suite runs, **When** frontend component tests execute, **Then** critical components (auth forms, mission claim button, evidence form, onboarding wizard) pass their tests
2. **Given** the E2E test suite runs, **When** the golden-path test executes, **Then** the complete flow (agent register → submit problem → guardrail evaluation → human register → claim mission → submit evidence → verification → token award) completes successfully
3. **Given** actual test coverage is measured, **When** coverage reports are generated, **Then** the results are enforced against the project's defined thresholds in the CI pipeline

---

### User Story 8 - Security Configurations Prevent Misuse (Priority: P2)

The platform's authentication and access control configurations are hardened so that invalid tokens are properly rejected, CORS origins are validated against an explicit whitelist, and admin routes do not shadow each other. Sensitive data (emails, PII) is not logged in plaintext.

**Why this priority**: Several security configuration issues (optionalAuth silent fallback, unvalidated CORS origins, PII in logs, admin route overlap) could be exploited or cause data leaks once real users are on the platform.

**Independent Test**: Can be tested by sending requests with malformed tokens, unexpected origins, and checking log output for PII.

**Acceptance Scenarios**:

1. **Given** a request with a malformed authentication token hits a protected endpoint, **When** the auth middleware processes it, **Then** the request is rejected (not silently treated as public)
2. **Given** a request arrives with a CORS origin not on the whitelist, **When** the server processes it, **Then** the request is rejected with appropriate CORS headers
3. **Given** an admin performs a rate adjustment action, **When** the system logs the event, **Then** no PII (email address) appears in the log — only sanitized identifiers
4. **Given** multiple admin route groups are registered, **When** requests hit admin endpoints, **Then** no route shadowing occurs — each endpoint resolves to the correct handler

---

### Edge Cases

- What happens when the privacy detection service is unavailable? Photos should be quarantined, not published.
- What happens when Redis is down during rate limiting? Requests currently pass through (fail-open) — this is a documented design decision for availability.
- What happens when a worker job is retried 3 times and still fails? It enters the dead-letter queue with proper status marking (not stuck in "processing").
- What happens when a user has insufficient credits and tries to file a dispute? The dispute form should check balance and prevent submission.
- What happens when the offline PWA queue reaches MAX_RETRIES (10) for an observation? The observation should be removed from the queue and the user notified of permanent failure.
- What happens when the mission expiration worker runs on missions with active claims? Token refunds should be processed (currently a TODO in the codebase). **Out of scope for this sprint** — the mission expiration refund logic requires credit economy design decisions that are broader than this hardening sprint. Tracked for a future sprint.
- What happens when the frontend CSP header conflicts with script/style loading? The CSP policy must be tested with the actual deployed frontend to prevent breakage.

## Requirements *(mandatory)*

### Functional Requirements

**Guardrail Worker Fix**
- **FR-001**: System MUST resolve the path resolution issue in the guardrail worker so that the AI classification layer runs automatically in the worker process
- **FR-002**: System MUST process guardrail evaluations end-to-end without manual admin intervention for content that clearly passes or fails thresholds

**Performance Fixes**
- **FR-003**: System MUST batch-fetch submission details for pending evaluations in a small number of queries instead of one per evaluation
- **FR-004**: System MUST resolve debate thread depth in a single database operation instead of sequential per-level queries
- **FR-005**: System MUST use spatial indexing for mission geo-search instead of per-row trigonometric calculations
- **FR-006**: System MUST move debate pagination filtering to the database query instead of filtering after fetch

**Worker Reliability**
- **FR-007**: System MUST include idempotency guards on all worker job enqueues to prevent duplicate processing on retry — specifically: guardrail peer-consensus dispatch, fraud-scoring worker enqueue, and peer-consensus validator assignment
- **FR-008**: System MUST mark observations as "quarantined" when the privacy worker job reaches the dead-letter queue (not leave as "processing")
- **FR-009**: System MUST prevent the rate adjustment worker from applying multiplier changes multiple times within the same adjustment period
- **FR-010**: System MUST use the shared database connection pool in the municipal ingest worker instead of creating new connections per job
- **FR-011**: System MUST set job retention policies on all worker queues to prevent unbounded memory growth
- **FR-012**: System MUST wrap per-item processing in batch workers with error isolation so that one item's failure does not block the entire batch

**Frontend Error Handling & Auth**
- **FR-013**: System MUST NOT auto-retry non-idempotent requests (POST, PUT, PATCH, DELETE) after token refresh — user must explicitly retry
- **FR-014**: System MUST use the standard auth wrapper for evidence form submission instead of manual auth headers
- **FR-015**: System MUST display error messages with retry options when network requests fail on the mission marketplace page
- **FR-016**: System MUST include authentication credentials on all authenticated page fetches (including disputes list)
- **FR-017**: System MUST provide a global error boundary page for unhandled exceptions
- **FR-018**: System MUST provide a custom 404 page for invalid routes
- **FR-019**: System MUST check user credit balance before displaying the dispute filing form and disable submission if insufficient

**Privacy Pipeline**
- **FR-020**: System MUST detect human faces in uploaded evidence photos using actual detection logic (not stubs)
- **FR-021**: System MUST detect license plates in uploaded evidence photos using actual detection logic (not stubs)
- **FR-022**: System MUST quarantine photos where privacy detection fails or detects sensitive content, routing them for manual review

**Onboarding Enforcement**
- **FR-023**: System MUST redirect users who have not completed onboarding to the onboarding wizard when they attempt to access protected pages

**Monitoring & Error Tracking**
- **FR-024**: System MUST capture and report all unhandled API exceptions to an error tracking service with request context
- **FR-025**: System MUST expose monitoring dashboards showing API error rates, worker queue depths, and database connection pool utilization
- **FR-026**: System MUST trigger alerts when API error rate exceeds 5% over a 5-minute rolling window, or when any single worker queue depth exceeds 100 waiting jobs

**Security Hardening**
- **FR-027**: System MUST reject requests with malformed or invalid authentication tokens on endpoints using optional auth (not silently fall through to public role)
- **FR-028**: System MUST validate CORS origins against an explicit whitelist
- **FR-029**: System MUST NOT log PII (email addresses) in plaintext — use sanitized identifiers
- **FR-030**: System MUST register admin route groups at distinct, non-overlapping paths to prevent route shadowing

**Testing Infrastructure**
- **FR-031**: System MUST include automated tests for critical frontend components (auth forms, mission claiming, evidence submission, onboarding wizard)
- **FR-032**: System MUST include an end-to-end test validating the complete golden-path flow (agent submit → guardrail → human claim → evidence → verification → tokens)
- **FR-033**: System MUST enforce test coverage thresholds defined in the project constitution as a CI gate
- **FR-034**: System MUST run dependency vulnerability scanning in the CI pipeline

**Cross-Cutting**
- **FR-035**: System MUST upgrade the Pino logging library in the guardrails package from v8 to v9 to align with the version used in all other packages, preventing behavior inconsistencies in structured log output

### Key Entities

- **Guardrail Evaluation**: A content assessment record tracking Layer A/B/C results, trust tier, routing decision, and final disposition
- **Worker Job**: An asynchronous processing unit with idempotency key, retry count, dead-letter handling, and retention policy
- **Privacy Processing Result**: A record of face/plate detection outcomes per evidence photo, including quarantine status
- **Monitoring Alert**: A triggered notification when a system health metric exceeds a defined threshold

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All agent-submitted content is automatically evaluated through the 3-layer guardrail pipeline within 10 seconds, without requiring manual admin intervention for clear pass/fail cases
- **SC-002**: The evaluations listing page loads within 500ms for validators with up to 100 pending evaluations
- **SC-003**: Geo-filtered mission marketplace queries return results within 200ms for up to 1000 missions
- **SC-004**: Worker job retries produce zero duplicate records (validators, evaluations, credit adjustments)
- **SC-005**: No uploaded evidence photo is publicly visible with unprocessed PII (faces, plates, EXIF metadata)
- **SC-006**: Users who have not completed onboarding cannot access any protected page — 100% redirect rate
- **SC-007**: All production errors are captured in the error tracking system within 30 seconds of occurrence
- **SC-008**: Frontend component tests cover all critical user flows (auth, onboarding, mission claiming, evidence submission)
- **SC-009**: The golden-path E2E test (agent → problem → guardrail → human → claim → evidence → verify → tokens) passes reliably in CI
- **SC-010**: Zero PII (email addresses, full names) appears in production log output
- **SC-011**: Network failures on any user-facing page show a clear error message with retry option — zero silent failures
- **SC-012**: CI pipeline enforces all defined test coverage thresholds and fails the build when coverage decreases

## Assumptions

- The guardrail worker path resolution issue is a build/bundling configuration problem (not an architectural flaw) that can be resolved without redesigning the worker
- Face and license plate detection can be implemented using established libraries or cloud vision services without significant architectural changes to the existing privacy pipeline
- The existing Prometheus /metrics endpoint provides sufficient data for monitoring dashboards — new metrics may need to be added for worker queue depths
- Error tracking will use a standard service that provides integration for both server-side and client-side error capture
- PostGIS is already available in the database (used by shadow mode and pattern aggregation features) and can be leveraged for mission geo-search
- The platform targets fewer than 1000 concurrent users for initial launch; performance optimizations are scoped accordingly
- Frontend testing uses the project's existing test infrastructure with appropriate DOM testing utilities
- The CSP header `default-src 'none'` will need to be adjusted for the actual frontend deployment — this is covered under testing the deployed frontend rather than as a separate requirement
