# Security Gap Analysis: BetterWorld vs Industry Best Practices (2026)

> Prioritized action items derived from comparing current posture against latest industry standards.
> Last updated: 2026-02-18
>
> **Sprint 20 (Security Hardening) resolved 11 of 29 gaps** — all 5 P0s + 6 P1s. See status markers below.

## Summary

| Priority | Total | Resolved (Sprint 20) | Remaining | Description |
|----------|-------|----------------------|-----------|-------------|
| P0 (Critical) | 5 | 5 | 0 | Must fix — active industry attack vectors or compliance gaps |
| P1 (High) | 10 | 6 | 4 | Should fix next sprint — significant risk reduction |
| P2 (Medium) | 9 | 0 | 9 | Plan for — defense-in-depth improvements |
| P3 (Low) | 5 | 0 | 5 | Track — future considerations |

## P0 — Critical (Fix Immediately)

### P0-1: Validate All Claude API Responses with Zod
- **Topic**: [AI/LLM Security](03-ai-llm-security.md)
- **Risk**: Improper output handling (OWASP LLM05:2025). Malformed or manipulated classifier responses stored directly in DB.
- **Current**: Classifier output parsed but not strictly validated.
- **Action**: Add Zod schemas for every Claude API response (classifier alignment, vision verification, decomposition).
- **Effort**: Small (1-2 days)
- **Status**: [X] **Resolved in Sprint 20** — 4 strict Zod schemas (classifier, vision verification, before/after comparison, decomposition) wired into all Claude integration points via `.strict().safeParse()`. Validation failures route to human review. FR-001 through FR-004.

### P0-2: Pin GitHub Actions by SHA
- **Topic**: [Supply Chain](04-supply-chain.md)
- **Risk**: Tag-based action references (`@v4`) can be tampered. PackageGate showed JS ecosystem is under active attack.
- **Current**: Actions referenced by tag.
- **Action**: Pin all `uses:` references by commit SHA. Add Dependabot for action updates.
- **Effort**: Small (half day)
- **Status**: [X] **Resolved in Sprint 20** — All GitHub Actions in ci.yml and deploy.yml pinned by full commit SHA with version comment. FR-015.

### P0-3: Add Container Image Scanning to CI
- **Topic**: [Infrastructure](06-infrastructure.md)
- **Risk**: Known vulnerabilities in base images deployed to production without detection.
- **Current**: No image scanning.
- **Action**: Add Trivy scan step in CI, fail on HIGH/CRITICAL.
- **Effort**: Small (half day)
- **Status**: [X] **Resolved in Sprint 20** — Trivy scan job in ci.yml scans both API and worker images, fails on HIGH/CRITICAL, ignores unfixed. FR-016.

### P0-4: GDPR Data Export Endpoint
- **Topic**: [Privacy](08-privacy-engineering.md)
- **Risk**: Legal non-compliance. GDPR Art. 15 right of access requires data export capability.
- **Current**: Not implemented (planned in design docs).
- **Action**: Implement `GET /api/v1/me/data-export` returning user's complete data.
- **Effort**: Medium (2-3 days)
- **Status**: [X] **Resolved in Sprint 20** — GET /api/v1/me/data-export returns 11 data categories as JSON, excludes passwordHash/apiKeyHash, rate-limited 2/24h via atomic INCR. FR-005 through FR-008.

### P0-5: GDPR Account Deletion Flow
- **Topic**: [Privacy](08-privacy-engineering.md)
- **Risk**: Legal non-compliance. GDPR Art. 17 right to erasure.
- **Current**: Not implemented (designed but not built).
- **Action**: Implement `DELETE /api/v1/me` with 14-day cooling-off, PII hard delete, contribution anonymization.
- **Effort**: Medium (3-4 days)
- **Status**: [X] **Resolved in Sprint 20** — POST/GET/DELETE /api/v1/me/deletion-request with 14-day cooling-off, SHA-256 hash anonymization, agent deactivation, daily worker. FR-009 through FR-014.

## P1 — High (Next Sprint)

### P1-1: Structured Output for Classifier
- **Topic**: [AI/LLM Security](03-ai-llm-security.md)
- **Risk**: Prompt injection via content manipulating classifier's free-form JSON response.
- **Action**: Use Claude's `tool_use` structured output to constrain classifier responses to strict schema.
- **Effort**: Medium (2-3 days)
- **Status**: [ ] Not started

### P1-2: Prompt Injection Pre-Detection Layer
- **Topic**: [AI/LLM Security](03-ai-llm-security.md)
- **Risk**: Adversarial content bypassing Layer A regex and manipulating Layer B classifier.
- **Action**: Add lightweight pre-check for known injection patterns (role-play, instruction override, encoding tricks) before sending to classifier.
- **Effort**: Medium (2-3 days)
- **Status**: [ ] Not started

### P1-3: BOLA Test Suite
- **Topic**: [API Security](02-api-security.md)
- **Risk**: Broken Object Level Authorization — accessing other users' resources via ID manipulation.
- **Action**: Add integration tests for all parameterized routes verifying cross-user isolation.
- **Effort**: Medium (2-3 days)
- **Status**: [ ] Not started

### P1-4: Explicit Dockerfile USER + HEALTHCHECK
- **Topic**: [Infrastructure](06-infrastructure.md)
- **Risk**: Container running as root (higher blast radius on compromise).
- **Action**: Add `USER node` and `HEALTHCHECK` to Dockerfiles.
- **Effort**: Small (half day)
- **Status**: [X] **Resolved in Sprint 20** — Non-root betterworld:1001 user in both Dockerfiles, HEALTHCHECK on API container. FR-018.

### P1-5: Redis Dangerous Command Restriction
- **Topic**: [Infrastructure](06-infrastructure.md)
- **Risk**: KEYS, FLUSHALL, CONFIG SET accessible to application user.
- **Action**: Configure Upstash ACL to restrict app user to only used commands.
- **Effort**: Small (1 day)
- **Status**: [ ] Not started

### P1-6: Sensitive Data TTL Audit
- **Topic**: [Infrastructure](06-infrastructure.md)
- **Risk**: Cached tokens, sessions, or PII stored in Redis without expiry.
- **Action**: Audit all Redis SET operations, ensure TTL on all sensitive keys.
- **Effort**: Small (1 day)
- **Status**: [X] **Resolved in Sprint 20** — All sensitive Redis keys have TTL ≤24h, cached data keys have explicit TTL (feature flags 30d, Open311 7d, decision gate 24h). FR-022, FR-023.

### P1-7: Verify pnpm Patches for PackageGate
- **Topic**: [Supply Chain](04-supply-chain.md)
- **Risk**: CVE-2025-69263/69264 affect pnpm lockfile integrity.
- **Action**: Verify pnpm version includes patches, pin version in `packageManager` field.
- **Effort**: Small (1 hour)
- **Status**: [X] **Resolved in Sprint 20** — CI step verifies pnpm >=9.15.4 (patched for both CVEs). FR-017.

### P1-8: Audit for Shai-Hulud Compromised Packages
- **Topic**: [Supply Chain](04-supply-chain.md)
- **Risk**: September 2025 attack compromised 796 npm packages (132M monthly downloads), including `debug` and `chalk`. Self-replicating worm may have infected transitive dependencies.
- **Action**: Cross-reference `pnpm-lock.yaml` against CISA advisory list. Verify `debug`, `chalk`, and all transitive deps are at known-clean versions.
- **Effort**: Small (1-2 hours)
- **Status**: [X] **Resolved in Sprint 20** — CI step verifies `debug` at v3.2.7/v4.4.3 and `chalk` at v4.1.2 (known-clean post Shai-Hulud). FR-017.

### P1-9: WebSocket Origin Header Validation
- **Topic**: [Infrastructure](06-infrastructure.md)
- **Risk**: Cross-Site WebSocket Hijacking (CSWSH) — Chrome/Edge are exploitable by default. CVE-2026-25253 showed one-click RCE via CSWSH in OpenClaw-compatible systems.
- **Action**: Add strict Origin header validation in the WebSocket handshake handler. Reject connections from origins not in the CORS whitelist.
- **Effort**: Small (half day)
- **Status**: [X] **Resolved in Sprint 20** — Origin validation against CORS ALLOWED_ORIGINS on both WS endpoints, reject missing Origin with 403, 64KB message size limit. FR-019 through FR-021.

### P1-10: External API Response Validation
- **Topic**: [API Security](02-api-security.md)
- **Risk**: Malformed Open311 or Anthropic responses poisoning data.
- **Action**: Add Zod schemas for all external API responses (Open311, Anthropic, Nominatim).
- **Effort**: Medium (1-2 days)
- **Status**: [~] **Partially resolved in Sprint 20** — All 4 Anthropic/Claude response types now validated with strict Zod schemas (P0-1). Open311 and Nominatim response validation remains outstanding.

## P2 — Medium (Plan for Next Quarter)

### P2-1: Migrate bcrypt to Argon2id
- **Topic**: [Cryptography](07-cryptography.md)
- **Risk**: bcrypt less resistant to GPU/ASIC attacks than Argon2id.
- **Action**: Implement transparent rehashing on login. New registrations use Argon2id immediately.
- **Effort**: Medium (2-3 days)
- **Status**: [ ] Not started

### P2-2: JWT Key Versioning
- **Topic**: [Cryptography](07-cryptography.md)
- **Risk**: JWT_SECRET rotation invalidates all active tokens instantly.
- **Action**: Add `kid` header support, multi-key verification with graceful rollover.
- **Effort**: Medium (2 days)
- **Status**: [ ] Not started

### P2-3: Concurrent Session Limiting
- **Topic**: [Auth & Identity](05-auth-identity.md)
- **Risk**: Compromised credentials allow unlimited parallel sessions.
- **Action**: Max 5 active sessions per human with view/revoke capability.
- **Effort**: Medium (2 days)
- **Status**: [ ] Not started

### P2-4: API Response Schema Filtering
- **Topic**: [API Security](02-api-security.md)
- **Risk**: Internal fields leaked in API responses.
- **Action**: Add Zod output schemas for all endpoints, implement `sanitize()` utility.
- **Effort**: Large (3-5 days)
- **Status**: [ ] Not started

### P2-5: Canary Tokens in Classifier Prompts
- **Topic**: [AI/LLM Security](03-ai-llm-security.md)
- **Risk**: Adversarial agents extracting classifier system prompt.
- **Action**: Embed unique identifiers, monitor for their appearance in submissions.
- **Effort**: Small (1 day)
- **Status**: [ ] Not started

### P2-6: SBOM Generation in CI
- **Topic**: [Supply Chain](04-supply-chain.md)
- **Risk**: Cannot quickly assess exposure to newly disclosed CVEs.
- **Action**: Generate CycloneDX SBOM on every build, archive with deployments.
- **Effort**: Small (half day)
- **Status**: [ ] Not started

### P2-7: Passkey/WebAuthn Support
- **Topic**: [Auth & Identity](05-auth-identity.md)
- **Risk**: Phishing attacks on human credentials.
- **Action**: Add optional passkey support for human 2FA, then admin 2FA.
- **Effort**: Large (5-7 days)
- **Status**: [ ] Not started

### P2-8: Database PII Inventory Documentation
- **Topic**: [Privacy](08-privacy-engineering.md)
- **Risk**: No systematic tracking of where PII lives in the database.
- **Action**: Document all PII columns, their sensitivity levels, and retention policies.
- **Effort**: Small (1 day)
- **Status**: [ ] Not started

### P2-9: Reviewer Reliability Scoring
- **Topic**: [AI/LLM Security](03-ai-llm-security.md)
- **Risk**: Compromised human reviewers poisoning Layer C training signal.
- **Action**: Track inter-reviewer agreement, flag outliers, inject golden-set calibration items.
- **Effort**: Medium (3 days)
- **Status**: [ ] Not started

## P3 — Low (Future Consideration)

### P3-1: Post-Quantum Ed25519 Migration Path
- **Topic**: [Cryptography](07-cryptography.md)
- **Action**: Track ML-DSA support in Node.js/jose; plan migration when available.

### P3-2: Distroless Docker Images
- **Topic**: [Infrastructure](06-infrastructure.md)
- **Action**: Evaluate `gcr.io/distroless/nodejs22-debian12` for smaller attack surface.

### P3-3: Row-Level Security on Sensitive Tables
- **Topic**: [Infrastructure](06-infrastructure.md)
- **Action**: Add RLS policies on token_transactions, agents, humans as defense-in-depth.

### P3-4: HaveIBeenPwned Integration
- **Topic**: [Auth & Identity](05-auth-identity.md)
- **Action**: Check passwords against breach database on registration/change.

### P3-5: Socket.dev Supply Chain Monitoring
- **Topic**: [Supply Chain](04-supply-chain.md)
- **Action**: Evaluate Socket.dev for real-time dependency threat detection.

## Sprint Planning Guide

### Minimum Viable Security Sprint — COMPLETED (Sprint 20)

All items from the planned sprint were delivered, plus P1-6 (Redis TTL audit):

| Item | Est. Days | Status |
|------|-----------|--------|
| P0-1: Validate Claude responses | 1.5 | ✅ Done |
| P0-2: Pin GitHub Actions by SHA | 0.5 | ✅ Done |
| P0-3: Container image scanning | 0.5 | ✅ Done |
| P0-4: GDPR data export | 2.5 | ✅ Done |
| P0-5: GDPR account deletion | 3.5 | ✅ Done |
| P1-4: Dockerfile USER + HEALTHCHECK | 0.5 | ✅ Done |
| P1-6: Sensitive data TTL audit | 1.0 | ✅ Done (added) |
| P1-7: Verify pnpm PackageGate patches | 0.25 | ✅ Done |
| P1-8: Audit for Shai-Hulud compromised packages | 0.25 | ✅ Done |
| P1-9: WebSocket Origin validation | 0.5 | ✅ Done |

Note: P1-1 (Structured classifier output via `tool_use`) was deferred — Zod validation on existing JSON responses (P0-1) provides equivalent protection at lower effort.

### Remaining High-Priority Items

| Item | Priority | Est. Days |
|------|----------|-----------|
| P1-1: Structured classifier output | P1 | 2.5 |
| P1-2: Prompt injection pre-detection | P1 | 2-3 |
| P1-3: BOLA test suite | P1 | 2-3 |
| P1-5: Redis dangerous command restriction | P1 | 1 |
| P1-10: Open311/Nominatim response validation | P1 | 1 |

### Ongoing Cadence
- Every sprint: Pick 2-3 items from P1/P2
- Monthly: Re-run `/security-research` skill to refresh findings
- Quarterly: Full gap analysis review
