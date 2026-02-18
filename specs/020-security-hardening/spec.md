# Feature Specification: Security Hardening Sprint

**Feature Branch**: `020-security-hardening`
**Created**: 2026-02-18
**Status**: Draft
**Input**: User description: "Focus on security enhancement, figure out what can have most improvement with limited investment"

## Context

BetterWorld's security research (see `docs/research/security/09-gap-analysis.md`) identified 29 gaps between current posture and industry best practices. This sprint selects the **highest-ROI items**: small-effort changes that deliver disproportionate security improvement.

### Selection Criteria

1. **Impact-per-hour-invested**: Prioritize items that address active industry attack vectors (PackageGate, Shai-Hulud, OpenClaw CSWSH), compliance requirements (GDPR), and architectural weaknesses (unvalidated LLM output).
2. **Zero additional runtime cost**: No new paid services, no new infrastructure, no increased API call volume. All improvements MUST use existing infrastructure (Fly.io, Supabase, Upstash, GitHub Actions) and existing tooling. No new SaaS subscriptions or third-party security products.
3. **No increased per-request latency**: Validation and checks must fit within existing request lifecycle without adding measurable overhead. Prefer compile-time/deploy-time checks over runtime checks where possible.

### Cost Efficiency Principle

Security improvements in this sprint MUST NOT increase operating costs. Specifically:
- **No new Claude API calls** — LLM output validation uses Zod schemas on existing responses, not additional AI calls
- **No new external services** — container scanning uses free-tier Trivy in CI (already runs on GitHub-hosted runners), not a paid scanning service
- **No new database tables for audit** — use existing logging infrastructure (Pino + Sentry) for security events
- **GDPR export uses existing queries** — aggregates data from existing tables, no new storage or compute
- **Account deletion uses a background worker** — reuses existing BullMQ infrastructure, no new queue system
- **WebSocket validation adds ~0.1ms** — Origin header check is a string comparison during handshake, negligible cost

Items deferred to future sprints: Argon2id migration, passkey/WebAuthn, BOLA test suite, prompt injection pre-detection layer, API response schema filtering, reviewer reliability scoring, concurrent session limiting, JWT key versioning.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - LLM Output Integrity (Priority: P1)

As a platform operator, I need all AI classifier responses validated before storage so that malformed or manipulated outputs from Claude cannot corrupt platform data or bypass guardrail decisions.

**Why this priority**: The 3-layer guardrail pipeline is the platform's core safety mechanism. If Claude returns malformed JSON (hallucinated fields, missing alignment_score, unexpected values), the data flows unvalidated into the database and affects content approval decisions. This is OWASP LLM05:2025 (Improper Output Handling).

**Independent Test**: Submit content through the guardrail pipeline with a mocked Claude response containing invalid/missing fields — verify the system rejects it gracefully instead of storing corrupted data.

**Acceptance Scenarios**:

1. **Given** the classifier returns a valid response with all required fields, **When** it is processed, **Then** the response is stored normally with no changes to existing behavior.
2. **Given** the classifier returns a response missing the `alignment_score` field, **When** it is processed, **Then** the system rejects the response, logs the anomaly, and routes the content to human review.
3. **Given** the classifier returns an `alignment_score` outside the 0-1 range, **When** it is processed, **Then** the system rejects the response and does not auto-approve or auto-reject the content.
4. **Given** the classifier returns unexpected extra fields not in the schema, **When** it is processed, **Then** extra fields are stripped before storage.
5. **Given** the vision verification service returns malformed confidence data, **When** evidence is processed, **Then** the system rejects the result and flags the evidence for manual review.

---

### User Story 2 - GDPR Data Access (Priority: P1)

As a human user, I need to export all personal data the platform holds about me so that I can exercise my right of access under GDPR Article 15.

**Why this priority**: Legal compliance requirement. GDPR Art. 15 requires that data controllers provide a copy of personal data within 30 days of request. Non-compliance carries fines up to 4% of annual revenue.

**Independent Test**: Log in as a human user, request data export, and verify the exported file contains all personal data (profile, tokens, missions, evidence, connections, notifications, discussions).

**Acceptance Scenarios**:

1. **Given** a logged-in human user, **When** they request a data export, **Then** the system generates a structured file containing all their personal data within 30 seconds.
2. **Given** a human user with extensive activity (missions, evidence, tokens, discussions), **When** they export data, **Then** the export includes data from all relevant areas: profile, token transactions, mission claims, evidence submissions, connections, follows, notifications, and discussion contributions.
3. **Given** a human user who owns agents, **When** they export data, **Then** the export includes agent metadata (name, creation date, status) but not API key hashes.
4. **Given** an unauthenticated request to the export endpoint, **When** the request is received, **Then** it is rejected with 401.
5. **Given** a user requests multiple exports in quick succession, **When** more than 2 requests are made within 24 hours, **Then** the system rate-limits with a friendly message explaining the cooldown period.

---

### User Story 3 - GDPR Account Deletion (Priority: P1)

As a human user, I need to delete my account and all personal data so that I can exercise my right to erasure under GDPR Article 17.

**Why this priority**: Legal compliance requirement. Combined with data export, this completes the core GDPR data subject rights. The 14-day cooling-off period prevents accidental irreversible deletion.

**Independent Test**: Log in, request account deletion, verify the cooling-off period, then confirm deletion and verify all PII is removed while anonymized contributions remain intact.

**Acceptance Scenarios**:

1. **Given** a logged-in human user, **When** they request account deletion, **Then** the system initiates a 14-day cooling-off period and sends a confirmation notification.
2. **Given** a user in the cooling-off period, **When** they log in within 14 days, **Then** they see a banner indicating pending deletion with an option to cancel.
3. **Given** a user in the cooling-off period, **When** they choose to cancel, **Then** the deletion is cancelled and their account returns to normal.
4. **Given** the 14-day cooling-off period has expired, **When** the system processes the deletion, **Then** all PII is permanently removed: name, email, location, skills, avatar, session tokens, OAuth tokens, notification content, and connection records.
5. **Given** a deleted user who contributed problems, solutions, or mission evidence, **When** their data is processed, **Then** their contributions are retained with the author replaced by a deterministic hash-based identifier (e.g., "Former User a3f8b2c1d4e9") to preserve platform integrity.
6. **Given** a human user who owns active agents, **When** they request account deletion, **Then** all owned agents are deactivated before the user's PII is removed.
7. **Given** a user with pending mission claims or active disputes, **When** they request deletion, **Then** the system informs them that active claims/disputes must be resolved first.

---

### User Story 4 - CI/CD Supply Chain Protection (Priority: P2)

As a platform operator, I need the CI/CD pipeline hardened against supply chain attacks so that build and deployment processes cannot be compromised via tampered GitHub Actions or vulnerable container images.

**Why this priority**: PackageGate (Jan 2026) and Shai-Hulud (Sep 2025) demonstrated that the JavaScript ecosystem is under active, sophisticated attack. Pinning actions by SHA and scanning images are trivial changes that block entire categories of attack.

**Independent Test**: Run the CI pipeline and verify that all GitHub Actions are pinned by SHA, container images are scanned for vulnerabilities, and pnpm version is verified as patched.

**Acceptance Scenarios**:

1. **Given** the CI workflow file, **When** any GitHub Action is referenced, **Then** it uses a full commit SHA (not a tag like `@v4`).
2. **Given** a built container image, **When** the CI pipeline runs, **Then** the image is scanned for vulnerabilities and the build fails if HIGH or CRITICAL severity issues are found.
3. **Given** the project's pnpm version, **When** CI runs, **Then** the version is verified to include patches for CVE-2025-69263 and CVE-2025-69264.
4. **Given** the project's dependency tree, **When** a dependency audit runs, **Then** packages affected by the Shai-Hulud compromise (specifically `debug` and `chalk`) are verified at known-clean versions.
5. **Given** the Dockerfile, **When** it is built, **Then** the container runs as a non-root user and includes a health check endpoint.

---

### User Story 5 - WebSocket Connection Security (Priority: P2)

As a platform operator, I need WebSocket connections validated against cross-site hijacking so that the real-time notification system cannot be exploited by malicious websites.

**Why this priority**: CVE-2026-25253 (CVSS 8.8) demonstrated one-click RCE through CSWSH in OpenClaw-compatible systems. BetterWorld serves SKILL.md for OpenClaw integration, making this directly relevant.

**Independent Test**: Attempt to establish a WebSocket connection from an unauthorized origin and verify it is rejected.

**Acceptance Scenarios**:

1. **Given** a WebSocket connection request from an origin in the CORS whitelist, **When** the handshake occurs, **Then** the connection is accepted.
2. **Given** a WebSocket connection request from an unauthorized origin, **When** the handshake occurs, **Then** the connection is rejected before any data is exchanged.
3. **Given** a WebSocket connection request with no Origin header, **When** the handshake occurs, **Then** the connection is rejected (prevents non-browser client bypassing).
4. **Given** an established WebSocket connection, **When** a message exceeds the size limit, **Then** the message is rejected and the connection remains open.

---

### User Story 6 - Redis Data Hygiene (Priority: P2)

As a platform operator, I need all sensitive data in Redis to have explicit expiry times so that cached tokens, sessions, and PII are not retained indefinitely.

**Why this priority**: Redis is used for rate limiting, caching, feature flags, and session data. Any cached PII or token without TTL represents a retention violation and increases the blast radius of a Redis compromise (CVE-2025-49844 showed 75% of cloud Redis instances were vulnerable to RCE).

**Independent Test**: Audit all Redis SET/HSET operations and verify every key storing sensitive data has an explicit TTL.

**Acceptance Scenarios**:

1. **Given** any Redis key that stores authentication tokens, session data, or user PII, **When** the key is set, **Then** it has an explicit TTL no longer than 24 hours.
2. **Given** any Redis key used for caching non-sensitive data (feature flags, public metrics), **When** the key is set, **Then** it has an explicit TTL (acceptable range: 1 minute to 7 days depending on purpose).
3. **Given** a developer adds a new Redis SET operation, **When** it stores any sensitive data, **Then** CI or code review catches the missing TTL.

---

### Edge Cases

- What happens when Claude API is completely unavailable during content submission? System should queue content for retry, not store unvalidated placeholder data.
- What happens when a user requests data export for an account with 10,000+ token transactions? Export should paginate internally but deliver a single complete file.
- What happens when a deleted user is referenced in another user's connection history? The reference should show anonymized identifier, not null/broken.
- What happens when the container image scan finds a vulnerability in the base image that has no fix available? The build should warn (not fail) and the finding should be documented.
- What happens when all WebSocket connections from a user exceed the limit? New connections should be rejected with a clear error, existing connections remain stable.

## Requirements *(mandatory)*

### Functional Requirements

**LLM Output Validation**
- **FR-001**: System MUST validate all Claude classifier responses against a strict schema before storage, rejecting responses with missing required fields, out-of-range values, or incorrect types.
- **FR-002**: System MUST validate all Claude Vision verification responses against a strict schema before updating evidence status.
- **FR-002b**: System MUST validate all Claude Vision before/after comparison responses against a strict schema before storing improvement scores.
- **FR-003**: System MUST validate all Claude decomposition responses against a strict schema before creating missions.
- **FR-004**: When validation fails on any of the 4 Claude integration points (classifier, vision verification, before/after comparison, decomposition), the system MUST log the validation failure with the raw response for debugging and route the affected content to human review or return a graceful error — never store unvalidated data.

**GDPR Data Export**
- **FR-005**: System MUST provide an authenticated endpoint that returns all personal data for the requesting user as a single JSON file.
- **FR-006**: The data export MUST include 11 data categories: account data (email, name, role), profile data (skills, location, bio, availability), token transaction history, mission claims, evidence submissions (URLs, no EXIF), connections, follows, notifications, discussion threads, discussion replies, and owned agent metadata (name, framework, status — excluding API key hashes).
- **FR-007**: The data export MUST NOT include: hashed passwords, API key hashes, internal system IDs that are not user-facing, or other users' personal data.
- **FR-008**: The data export endpoint MUST be rate-limited to a maximum of 2 requests per 24-hour period per user.

**GDPR Account Deletion**
- **FR-009**: System MUST provide an authenticated endpoint to initiate account deletion with a 14-day cooling-off period.
- **FR-010**: System MUST allow users to cancel a pending deletion during the cooling-off period.
- **FR-011**: After the cooling-off period expires, the system MUST permanently delete all PII: name, email, location, skills, avatar URL, OAuth tokens, session tokens, notification content containing personal references, and connection records.
- **FR-012**: After deletion, user contributions (problems, solutions, evidence, reviews) and token transaction records MUST be retained with the author/userId replaced by a deterministic hash of the original user ID (stable, non-correlatable, consistent across all tables), preserving financial audit trail integrity.
- **FR-013**: System MUST deactivate all agents owned by a user before deleting the user's PII.
- **FR-014**: System MUST prevent deletion if the user has active mission claims or unresolved disputes, informing the user what must be resolved first.

**CI/CD Supply Chain Hardening**
- **FR-015**: All GitHub Actions in CI workflows MUST be referenced by full commit SHA, not version tags.
- **FR-016**: CI pipeline MUST scan built container images for vulnerabilities and fail the build on HIGH or CRITICAL severity findings.
- **FR-017**: CI pipeline MUST verify that the project's pnpm version includes patches for CVE-2025-69263 and CVE-2025-69264.
- **FR-018**: Both Dockerfiles (API and worker) MUST specify a non-root USER and include a HEALTHCHECK instruction.

**WebSocket Hardening**
- **FR-019**: WebSocket handshake MUST validate the Origin header against the CORS whitelist and reject connections from unauthorized origins.
- **FR-020**: WebSocket connections with no Origin header MUST be rejected.
- **FR-021**: WebSocket messages exceeding 64KB MUST be rejected.

**Redis Data Hygiene**
- **FR-022**: All Redis keys storing authentication tokens, session data, or user PII MUST have an explicit TTL no longer than 24 hours.
- **FR-023**: All Redis keys storing cached data MUST have an explicit TTL appropriate to their purpose (1 minute to 7 days).

**Cost Efficiency**
- **FR-024**: No security improvement in this sprint SHALL introduce new paid services, new infrastructure components, or new third-party subscriptions.
- **FR-025**: No security improvement SHALL increase per-request latency by more than 1ms on any endpoint.
- **FR-026**: No security improvement SHALL increase the number of external API calls (Claude, Open311, Nominatim) beyond what currently exists.

### Key Entities

- **Data Export Request**: Represents a user's request for data export — tracks status (pending, processing, completed, expired), creation time, and download expiry.
- **Account Deletion Request**: Represents a pending account deletion — tracks status (pending, cancelled, completed), initiation date, cooling-off expiry date, and the list of data categories to be purged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of Claude API responses (classifier, vision verification, before/after comparison, decomposition) are validated against strict schemas before any data is stored — zero unvalidated LLM outputs reach the database.
- **SC-002**: Human users can request and receive a complete personal data export within 30 seconds for accounts with up to 10,000 records.
- **SC-003**: Human users can initiate, cancel, and complete account deletion with full PII removal, with anonymized contributions remaining visible on the platform.
- **SC-004**: 100% of GitHub Actions in CI are pinned by commit SHA — zero tag-based references remain.
- **SC-005**: Every CI build includes a container image vulnerability scan that blocks deployment of images with HIGH/CRITICAL findings.
- **SC-006**: WebSocket connections from unauthorized origins are rejected 100% of the time during the handshake — no data is exchanged.
- **SC-007**: 100% of Redis keys storing sensitive data have explicit TTLs — zero sensitive keys exist without expiry.
- **SC-008**: All existing tests continue passing with zero regressions introduced by security changes.
- **SC-009**: The pnpm version and all dependencies affected by the Shai-Hulud attack are verified at known-clean versions.

## Assumptions

- Upstash Redis supports ACL configuration for restricting dangerous commands (if not, the Redis command restriction item will be documented and deferred).
- The `better-auth` library supports account deletion hooks or the deletion flow can be implemented at the application layer.
- GDPR data export can be generated synchronously for typical account sizes; very large accounts may need async generation in a future enhancement.
- The existing CI pipeline structure (GitHub Actions YAML) is the only CI configuration — no other CI systems are in use.
- Container image scanning with Trivy is compatible with the existing CI runner environment (GitHub-hosted runners).

## Clarifications

### Session 2026-02-18

- Q: What format should the GDPR data export use? → A: Single JSON file (one endpoint returns all data as JSON).
- Q: How should token transaction records be handled during account deletion? → A: Anonymize userId in transactions (same anonymized identifier as contributions), preserving the financial audit trail and double-entry integrity.
- Q: What format should the anonymized identifier use? → A: Deterministic hash of original user ID (stable, non-correlatable, consistent across all tables for the same deleted user).

## Scope Boundaries

**In scope**:
- LLM output validation (all 4 Claude integration points: classifier, vision verification, before/after comparison, decomposition)
- GDPR data export and account deletion
- CI/CD hardening (action pinning, image scanning, pnpm verification, Dockerfile improvements)
- WebSocket Origin validation
- Redis TTL audit and enforcement
- Shai-Hulud package audit

**Out of scope** (deferred to future sprints):
- Argon2id password hashing migration (P2 — requires transparent rehashing strategy)
- Passkey/WebAuthn support (P2 — large effort, 5-7 days)
- BOLA test suite (P1 — valuable but test-only, no user-facing change)
- Prompt injection pre-detection layer (P1 — complex, needs adversarial testing design)
- API response schema filtering (P2 — large effort, touches all endpoints)
- JWT key versioning (P2 — medium effort, no active vulnerability)
- Concurrent session limiting (P2 — medium effort, no active vulnerability)
- Reviewer reliability scoring (P2 — medium effort, long-term quality)
- Canary tokens in classifier prompts (P2 — deferred to next sprint)
- SBOM generation (P2 — deferred to next sprint)
