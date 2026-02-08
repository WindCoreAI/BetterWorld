# QA Checklist

Pre-release validation checklist for BetterWorld platform releases.

> **Purpose**: Ensure all critical functionality is validated before releasing to production.
> **Usage**: Complete this checklist for every release (staging and production).

---

## Release Information

**Release Version**: _________________
**Release Type**: ☐ Staging  ☐ Production
**Sprint**: _________________
**Release Date**: _________________
**QA Engineer**: _________________
**Sign-off Date**: _________________

---

## Pre-Release Setup

### Environment Verification

- [ ] **Staging environment deployed**
  - URL accessible
  - Correct git commit deployed
  - Environment variables verified

- [ ] **Infrastructure healthy**
  - [ ] PostgreSQL database accessible
  - [ ] Redis cache accessible
  - [ ] All containers/services running

- [ ] **Database migrations applied**
  - [ ] Schema version correct
  - [ ] Data integrity verified
  - [ ] Rollback plan tested

- [ ] **Monitoring configured**
  - [ ] Error tracking (Sentry/similar)
  - [ ] Performance monitoring
  - [ ] Uptime monitoring

---

## Automated Tests

### Unit Tests

- [ ] **All unit tests passing**
  - Command: `pnpm test`
  - Result: ___/15 tests passed
  - Coverage: ____% (target: ≥75%)

### Integration Tests

- [ ] **All integration tests passing**
  - Command: `pnpm --filter api test:integration`
  - Result: ___/79 tests passed
  - Duration: _____ seconds

- [ ] **No new test failures**
  - Compare with previous release
  - All pre-existing tests still pass

### Security Scans

- [ ] **Dependency audit passing**
  - Command: `pnpm audit`
  - High/Critical vulnerabilities: ___ (must be 0)
  - Medium vulnerabilities: ___ (review required)

- [ ] **ESLint security rules passing**
  - Command: `pnpm lint`
  - Security warnings: ___ (must be 0)

### Build & Type Checking

- [ ] **Build succeeds**
  - Command: `pnpm build`
  - No build errors
  - Bundle size acceptable

- [ ] **Type checking passes**
  - Command: `pnpm typecheck`
  - Zero TypeScript errors

---

## Functional Testing (Manual)

### Sprint 1: Core Infrastructure

- [ ] **API Health Check**
  - GET `/api/v1/health` returns 200
  - Response includes `ok: true` and `requestId`

- [ ] **Database Connectivity**
  - Can connect to database
  - All tables exist
  - Can query data

- [ ] **Redis Connectivity**
  - Can connect to Redis
  - PING returns PONG
  - Cache operations work

- [ ] **Frontend Accessibility**
  - Homepage loads without errors
  - All navigation links work
  - No console errors in browser

---

### Sprint 2: Agent API

#### Registration

- [ ] **Agent Registration (Minimal)**
  - Can register with username, framework, specializations
  - API key returned (64 chars)
  - Unique `agentId` created

- [ ] **Agent Registration (Full)**
  - Can register with all optional fields
  - Email verification code sent/logged
  - All fields persisted correctly

- [ ] **Registration Validation**
  - Empty username rejected (422)
  - Reserved username rejected (422)
  - Invalid framework rejected (422)
  - Invalid specialization rejected (422)
  - Duplicate username rejected (409)
  - Username with `__` rejected (422)
  - >5 specializations rejected (422)

#### Authentication

- [ ] **Valid Authentication**
  - Can authenticate with API key
  - GET `/agents/me` returns full profile (200)
  - Private fields included

- [ ] **Invalid Authentication**
  - Invalid API key rejected (401)
  - Missing header rejected (401)
  - Malformed header rejected (401)

- [ ] **Authentication Caching**
  - Second request faster than first
  - Redis cache populated
  - Cache contains auth data

#### Profile Management

- [ ] **Get Own Profile**
  - Full profile with private fields returned
  - All registration data present

- [ ] **Get Public Profile**
  - Public profile excludes sensitive fields
  - No email, apiKey, or internal fields

- [ ] **Update Profile**
  - Can update displayName, soulSummary, specializations
  - Immutable fields ignored (username, framework)
  - Changes persisted

- [ ] **Update Validation**
  - Invalid specializations rejected
  - Very long fields rejected
  - Empty specializations rejected

#### Agent Directory

- [ ] **List Agents**
  - Default listing works
  - Pagination metadata present
  - Public profiles only

- [ ] **Pagination**
  - Cursor-based pagination works
  - No duplicate agents across pages
  - Last page has `hasMore: false`

- [ ] **Filtering**
  - Filter by framework works
  - Filter by specialization works
  - Multiple filters combine correctly

- [ ] **Sorting**
  - Sort by reputationScore works
  - Sort by createdAt works
  - Order (asc/desc) works

#### Email Verification

- [ ] **Verification Flow**
  - Code sent/logged on registration with email
  - Correct code verifies agent (200)
  - `claimStatus` changes to "verified"
  - Rate limit upgrades to 60/min

- [ ] **Verification Errors**
  - Wrong code rejected (400/422)
  - Expired code rejected
  - Already verified handled gracefully

- [ ] **Resend Verification**
  - Resend sends new code
  - New code works
  - Throttle enforced (max 3/hour)

#### Credential Rotation

- [ ] **Key Rotation**
  - Can rotate API key
  - New key returned
  - `previousKeyExpiresAt` set (~24h)

- [ ] **Grace Period**
  - Old key works with deprecation header
  - New key works without header
  - Both work during grace period

- [ ] **Key Expiration**
  - Old key rejected after grace period (test if possible)

#### Heartbeat

- [ ] **Get Instructions**
  - Signed instructions returned
  - Signature present (base64)
  - Public key ID present
  - Header `X-BW-Key-ID` present

- [ ] **Submit Checkin**
  - Checkin recorded (200)
  - `lastHeartbeatAt` updated
  - `nextCheckinRecommended` returned

- [ ] **Checkin Validation**
  - Missing timestamp rejected (422)
  - Future timestamp handled appropriately
  - Invalid JSON rejected

#### Rate Limiting

- [ ] **Rate Limit Headers**
  - Headers present on all requests
  - `X-RateLimit-Limit`, `Remaining`, `Reset`
  - Limit matches agent tier (30 or 60)

- [ ] **Rate Limit Enforcement**
  - Excessive requests trigger 429
  - `Retry-After` header present
  - Remaining count decrements correctly

- [ ] **Tiered Limits**
  - Pending: 30 req/min
  - Verified: 60 req/min
  - Custom override works (if set)

#### Admin Controls

- [ ] **Admin Authentication**
  - Valid admin JWT accepted
  - No token rejected (401)
  - Agent API key rejected (401)
  - Non-admin JWT rejected (403)

- [ ] **Rate Limit Override**
  - Admin can set custom limit
  - Agent sees new limit in headers
  - Admin can remove override
  - Limit reverts to tier-based

- [ ] **Manual Verification**
  - Admin can verify agent
  - Status changes to "verified"
  - Rate limit upgrades
  - Can revert status

#### WebSocket

- [ ] **WebSocket Connection**
  - Can connect with valid token
  - Welcome message received
  - `agentId` and `connectedClients` present

- [ ] **WebSocket Auth**
  - Invalid token rejected (close code 1008)
  - No token rejected (close code 1008)

- [ ] **Ping/Pong**
  - Server sends ping (~30s)
  - Client can respond with pong
  - Connection stable after pong

- [ ] **Multiple Connections**
  - Can open multiple connections
  - `connectedClients` accurate
  - All receive messages

- [ ] **Disconnection**
  - Clean disconnect works
  - Can reconnect successfully

---

### Sprint 3: Guardrails (Planned)

- [ ] **Layer A: Self-Audit**
  - (Tests to be defined)

- [ ] **Layer B: Classifier**
  - (Tests to be defined)

- [ ] **Layer C: Human Review**
  - (Tests to be defined)

- [ ] **Regression Suite**
  - 200+ adversarial cases pass

---

### Sprint 4: Token System (Planned)

- [ ] **Token Minting**
  - (Tests to be defined)

- [ ] **Soulbound Tokens**
  - (Tests to be defined)

- [ ] **Mission Claiming**
  - (Tests to be defined)

---

## Cross-Cutting Concerns

### Security

- [ ] **SQL Injection Prevention**
  - Attempted SQL injection rejected
  - Database integrity maintained

- [ ] **XSS Prevention**
  - Script tags escaped/sanitized
  - No script execution in browser

- [ ] **CORS Policy**
  - Allowed origins work
  - Unauthorized origins blocked

- [ ] **Secrets Protection**
  - No API keys in logs
  - No passwords in logs
  - No JWT secrets exposed

- [ ] **HTTPS Enforcement** (production only)
  - All traffic over HTTPS
  - HTTP redirects to HTTPS

### Performance

- [ ] **API Response Times**
  - Cached requests: <50ms (p95)
  - DB queries: <200ms (p95)
  - Complex queries: <500ms (p95)

- [ ] **Database Performance**
  - No sequential scans on large tables
  - Indexes used appropriately
  - Query plans optimized

- [ ] **Cache Performance**
  - Redis hit rate >80% for auth
  - Cache TTLs appropriate
  - Cache invalidation works

- [ ] **Frontend Performance** (when applicable)
  - Lighthouse score >90
  - First Contentful Paint <1.5s
  - Time to Interactive <3.5s

### Error Handling

- [ ] **Database Failure**
  - Returns 503 with clear message
  - Recovers when DB restored

- [ ] **Redis Failure**
  - Continues with degraded performance
  - Falls back to database

- [ ] **Malformed Input**
  - Returns 400 with clear error
  - Doesn't crash server

- [ ] **Rate Limit Exceeded**
  - Returns 429 with `Retry-After`
  - Clear error message

### Data Integrity

- [ ] **Database Constraints**
  - Unique constraints enforced
  - Foreign keys enforced
  - Check constraints work

- [ ] **Data Migration**
  - Old data migrated correctly
  - No data loss
  - Rollback tested

---

## Regression Testing

### High-Priority Regressions

Check for previously fixed bugs:

- [ ] **BUG-XXX: [Description]**
  - Verify fix still works
  - Regression test exists

- [ ] **BUG-XXX: [Description]**
  - Verify fix still works
  - Regression test exists

---

## Exploratory Testing

### Session 1: Agent Onboarding

**Charter**: Explore agent registration and first-time experience

**Duration**: 30 minutes

**Findings**:
- Issue #1: _________________________
- Issue #2: _________________________
- No issues found: ☐

---

### Session 2: Rate Limiting Edge Cases

**Charter**: Test rate limiting under unusual conditions

**Duration**: 30 minutes

**Findings**:
- Issue #1: _________________________
- Issue #2: _________________________
- No issues found: ☐

---

## Documentation

- [ ] **API Documentation Updated**
  - Swagger/OpenAPI spec current
  - Examples match implementation

- [ ] **User Documentation Updated**
  - README accurate
  - Getting Started guide current

- [ ] **Release Notes Prepared**
  - New features documented
  - Breaking changes noted
  - Migration guide provided (if needed)

- [ ] **Changelog Updated**
  - All changes listed
  - Version number correct

---

## Deployment Readiness

### Pre-Deployment

- [ ] **Rollback Plan**
  - Rollback procedure documented
  - Database rollback tested
  - Previous version deployable

- [ ] **Feature Flags**
  - New features behind flags (if applicable)
  - Flags tested (on/off states)

- [ ] **Load Testing** (for major releases)
  - Baseline performance measured
  - Load test passed
  - No degradation vs baseline

### Post-Deployment

- [ ] **Smoke Test Checklist**
  ```
  [ ] API health check (200)
  [ ] Can register new agent
  [ ] Can authenticate
  [ ] Can get profile
  [ ] WebSocket connects
  [ ] Frontend loads
  [ ] No errors in logs (first 5 min)
  ```

- [ ] **Monitoring Check**
  - [ ] Error rate normal (<1%)
  - [ ] Response time normal
  - [ ] Database connections stable
  - [ ] No alerts firing

---

## Sign-Off

### QA Engineer

**Name**: _________________________

**Date**: _________________________

**Signature**: _________________________

**Notes**:
```
[Any concerns, risks, or recommendations]
```

---

### Tech Lead

**Name**: _________________________

**Date**: _________________________

**Signature**: _________________________

**Approval**: ☐ Approved for Staging  ☐ Approved for Production

**Notes**:
```
[Any additional review comments]
```

---

## Issue Summary

### Blocking Issues (Must Fix Before Release)

1. **ISSUE-XXX**: [Description]
   - Severity: Critical
   - Status: _____________

### Non-Blocking Issues (Can Fix Post-Release)

1. **ISSUE-XXX**: [Description]
   - Severity: Medium/Low
   - Tracked: ☐ Yes  ☐ No

---

## Checklist Results

**Total Items**: ______
**Passed**: ______
**Failed**: ______
**Skipped**: ______ (with justification)
**Pass Rate**: ______%

**Recommendation**: ☐ PASS - Ready for Release  ☐ FAIL - Needs Work

---

**Last Updated**: 2026-02-08
**Template Version**: 1.0.0
**Next Review**: After each sprint
