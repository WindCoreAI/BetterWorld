# Testing Strategy

Comprehensive testing strategy for BetterWorld platform ensuring quality, security, and reliability.

---

## Executive Summary

**Purpose**: Define the testing approach, principles, and practices for delivering a high-quality, secure platform for social good.

**Key Principles**:
1. **Quality First**: No feature is complete without tests
2. **Shift Left**: Test early and often in development cycle
3. **Automation First**: Automate everything that can be automated
4. **Coverage Goals**: Maintain >= 75% overall code coverage
5. **Security**: Treat security testing as mandatory, not optional

**Current Status** (Sprint 2):
- ✅ 94 automated tests passing
- ✅ 82% automation rate
- ✅ CI/CD integration complete
- ✅ Manual test procedures documented

---

## Table of Contents

1. [Testing Pyramid](#testing-pyramid)
2. [Test Types](#test-types)
3. [Coverage Targets](#coverage-targets)
4. [Quality Gates](#quality-gates)
5. [Testing Workflow](#testing-workflow)
6. [Roles and Responsibilities](#roles-and-responsibilities)
7. [Tools and Infrastructure](#tools-and-infrastructure)
8. [Metrics and Reporting](#metrics-and-reporting)
9. [Continuous Improvement](#continuous-improvement)

---

## Testing Pyramid

We follow the testing pyramid approach with emphasis on unit and integration tests:

```
           /\
          /  \  E2E Tests (Planned)
         /____\  ~5% of tests
        /      \
       /  Inte- \  Integration Tests
      / gration \ ~35% of tests (79 tests)
     /___________\
    /             \
   /   Unit Tests  \  Unit Tests
  /_________________\ ~60% of tests (15 tests, growing)
```

**Rationale**:
- **Unit Tests** (60%): Fast, cheap, isolate failures quickly
- **Integration Tests** (35%): Catch integration issues, test real dependencies
- **E2E Tests** (5%): Validate critical user journeys, slow but high confidence

**Current Distribution** (Sprint 2):
- Unit: 15 tests (16%)
- Integration: 79 tests (84%)
- E2E: 0 tests (planned Sprint 3+)

**Target Distribution** (by Sprint 4):
- Unit: ~180 tests (60%)
- Integration: ~105 tests (35%)
- E2E: ~15 tests (5%)

---

## Test Types

### 1. Unit Tests

**Purpose**: Test individual functions/methods in isolation

**Characteristics**:
- Fast execution (<1s per test)
- No external dependencies (mock DB, Redis, APIs)
- High coverage of edge cases
- Run on every file save (watch mode)

**When to Write**:
- For all pure functions
- Business logic (guardrails, token calculations)
- Utility functions
- Validation schemas

**Example**:
```typescript
describe('validateUsername', () => {
  it('accepts valid username', () => {
    expect(validateUsername('test_agent_01')).toBe(true);
  });

  it('rejects username with consecutive underscores', () => {
    expect(validateUsername('test__agent')).toBe(false);
  });
});
```

**Location**: `packages/*/src/**/__tests__/*.test.ts`

---

### 2. Integration Tests

**Purpose**: Test multiple components working together with real dependencies

**Characteristics**:
- Medium execution (~27s total for all)
- Real database and Redis (Docker containers)
- Tests API endpoints, database queries, caching
- Run before commit and in CI

**When to Write**:
- For all API endpoints
- Database operations
- Authentication flows
- Rate limiting
- WebSocket connections

**Example**:
```typescript
it('registers agent and returns API key', async () => {
  const response = await app.request('/api/v1/auth/agents/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'test_agent_01',
      framework: 'openclaw',
      specializations: ['climate_action']
    })
  });

  expect(response.status).toBe(201);
  expect(data.data.apiKey).toHaveLength(64);
});
```

**Location**: `apps/api/tests/integration/**/*.test.ts`

---

### 3. E2E Tests (Planned)

**Purpose**: Test complete user journeys from browser perspective

**Characteristics**:
- Slow execution (1-2 min per test)
- Real browser (Playwright)
- Tests frontend + backend integration
- Run before releases

**When to Write**:
- For critical user flows (registration, mission completion)
- Visual regressions
- Cross-browser compatibility

**Planned Coverage**:
- Agent registration flow
- Problem discovery and filtering
- Solution submission with evidence
- Debate participation

**Location**: `apps/web/e2e/**/*.spec.ts` (planned)

---

### 4. Manual Tests

**Purpose**: Exploratory testing, usability validation, complex scenarios

**When to Perform**:
- Before each sprint demo
- Before releases
- When automated tests are impractical
- For UX/accessibility validation

**Documented In**: [Manual Testing Guide](./manual-testing-guide.md)

---

### 5. Security Tests

**Purpose**: Identify vulnerabilities and security issues

**Types**:
- **Static Analysis**: ESLint security rules, dependency scanning
- **Authentication/Authorization**: API key security, JWT validation
- **Input Validation**: SQL injection, XSS, CSRF prevention
- **Secrets Management**: No secrets in logs or code

**Tools**:
- `pnpm audit` - Dependency vulnerabilities
- ESLint security plugin
- Manual penetration testing (before releases)

**Frequency**:
- Static analysis: Every commit
- Dependency audit: Weekly + pre-release
- Manual pentesting: Before major releases

---

### 6. Performance Tests (Planned)

**Purpose**: Ensure system meets performance requirements

**Metrics**:
- API response time (p95 < 200ms)
- Database query time (p95 < 100ms)
- Concurrent users (target: 1000+)
- Throughput (requests/sec)

**Tools** (planned):
- k6 or Artillery for load testing
- Lighthouse for frontend performance
- pg_stat_statements for DB profiling

**Frequency**: Before major releases

---

## Coverage Targets

### Overall Coverage

| Component | Target | Current | Status |
|-----------|--------|---------|--------|
| **Global** | ≥75% | ~80% | ✅ On track |
| Guardrails | ≥95% | N/A | Sprint 3 |
| Token System | ≥90% | N/A | Sprint 4 |
| Database | ≥85% | ~90% | ✅ Exceeds |
| API | ≥80% | ~85% | ✅ Exceeds |
| Frontend | ≥70% | TBD | Sprint 3+ |

### Critical Path Coverage

**Critical paths must have 100% test coverage**:
- ✅ Agent registration
- ✅ Agent authentication
- ✅ API key management
- ✅ Rate limiting
- ⏳ Guardrail validation (Sprint 3)
- ⏳ Token minting (Sprint 4)
- ⏳ Mission claiming (Sprint 4)

---

## Quality Gates

### Pre-Commit (Local)

Developer must verify before committing:
```bash
# Required checks
pnpm lint              # ESLint passes, zero errors
pnpm typecheck         # TypeScript strict mode, zero errors
pnpm test              # All unit tests pass
pnpm audit             # Zero high/critical vulnerabilities
```

**Enforcement**: Git pre-commit hook (optional but recommended)

---

### Pre-Merge (Pull Request)

PR cannot merge unless:
- ✅ All commits pass pre-commit checks
- ✅ Integration tests pass
- ✅ Code coverage doesn't decrease
- ✅ At least 1 approval from code owner
- ✅ No merge conflicts
- ✅ CI/CD pipeline green

**CI Checks**:
```bash
pnpm install --frozen-lockfile  # Reproducible builds
pnpm lint                        # Linting
pnpm typecheck                   # Type checking
pnpm test                        # Unit tests
pnpm --filter api test:integration  # Integration tests
pnpm audit                       # Security audit
```

---

### Pre-Release

Before any release (staging or production):
- ✅ All pre-merge checks pass
- ✅ QA checklist completed ([see QA Checklist](./qa-checklist.md))
- ✅ Manual smoke test performed
- ✅ Security scan passes
- ✅ Performance benchmarks met (if applicable)
- ✅ Documentation updated
- ✅ Release notes prepared

**Additional for Production**:
- ✅ Staging environment validated
- ✅ Rollback plan documented
- ✅ Monitoring and alerts configured
- ✅ Database migrations tested
- ✅ Stakeholder approval

---

## Testing Workflow

### Development Workflow

```
┌─────────────┐
│ Write Code  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Write Tests │ (TDD or after implementation)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Run Tests   │ (pnpm test --watch)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Tests Pass? │──No──► Fix code/tests
└──────┬──────┘
       │ Yes
       ▼
┌─────────────┐
│ Lint & Type │ (pnpm lint && pnpm typecheck)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Commit      │ (pre-commit hook runs checks)
└─────────────┘
```

### Sprint Workflow

**Sprint Planning**:
1. Define acceptance criteria with testable scenarios
2. Estimate test effort (typically 20-30% of dev time)
3. Identify manual vs automated tests

**During Sprint**:
1. Write tests alongside code (TDD preferred)
2. Run tests frequently (watch mode)
3. Update test documentation as needed

**Sprint Review**:
1. Demo features with test results
2. Show test coverage report
3. Document any testing debt

**Sprint Retrospective**:
1. Review test quality (flaky tests, gaps)
2. Identify testing process improvements
3. Update testing strategy if needed

---

## Roles and Responsibilities

### Developers

**Responsibilities**:
- Write unit and integration tests for all code
- Achieve >= 75% coverage for new code
- Fix failing tests immediately
- Run tests before committing
- Review test coverage in PRs

**Skills Required**:
- Vitest/Jest
- Integration testing patterns
- Mocking and stubbing
- Test data management

---

### QA Engineers

**Responsibilities**:
- Design and execute manual test plans
- Perform exploratory testing
- Validate acceptance criteria
- Report and track bugs
- Maintain test documentation

**Skills Required**:
- Manual testing techniques
- Bug reporting
- Test case design
- Domain knowledge

---

### Tech Lead

**Responsibilities**:
- Review testing strategy quarterly
- Approve testing standards
- Resolve testing conflicts
- Monitor test metrics
- Champion quality culture

---

### DevOps

**Responsibilities**:
- Maintain CI/CD pipelines
- Configure test environments
- Monitor test execution times
- Optimize test infrastructure

---

## Tools and Infrastructure

### Test Frameworks

**JavaScript/TypeScript**:
- **Vitest**: Unit and integration tests (chosen for speed)
- **Playwright**: E2E tests (planned)
- **Supertest**: HTTP API testing (via Hono test client)

**Advantages of Vitest**:
- Fast execution (native ESM support)
- TypeScript first-class support
- Built-in coverage (v8)
- Compatible with Jest API
- Watch mode with HMR

---

### CI/CD

**GitHub Actions**:
```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
      redis:
        image: redis:7-alpine
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm --filter api test:integration
      - run: pnpm audit
```

---

### Test Data Management

**Strategies**:
1. **Fixtures**: Predefined test data (for consistent scenarios)
2. **Factories**: Generate test data dynamically (for variety)
3. **Cleanup**: Always clean up after tests (prevent test pollution)

**Example Factory**:
```typescript
export async function registerTestAgent(
  app: Hono,
  overrides = {}
) {
  const agent = {
    username: `test_${Date.now()}_${Math.random().toString(36)}`,
    framework: 'custom',
    specializations: ['healthcare_improvement'],
    ...overrides
  };

  const response = await app.request('/api/v1/auth/agents/register', {
    method: 'POST',
    body: JSON.stringify(agent)
  });

  return { response, agent };
}
```

---

### Test Environments

**Local Development**:
- Docker Compose (PostgreSQL + Redis)
- Environment variables from `.env` files
- Hot reload for rapid iteration

**CI Environment**:
- GitHub Actions runners
- Docker services (PostgreSQL + Redis)
- Parallel test execution (future optimization)

**Staging Environment** (planned):
- Deployed to Fly.io
- Real Supabase database
- Upstash Redis
- Manual testing before production

---

## Metrics and Reporting

### Key Metrics

**Code Coverage**:
- Overall: ≥75%
- New code: ≥80% (enforced in PR reviews)
- Critical paths: 100%

**Test Execution**:
- Unit tests: <10s total
- Integration tests: <30s total
- E2E tests: <5min total (when implemented)

**Quality Metrics**:
- Bug escape rate: <5% (bugs found in prod vs total bugs)
- Flaky test rate: <2%
- Test maintenance time: <10% of dev time

---

### Reporting

**Daily** (Automated):
- CI test results in PR checks
- Coverage reports in PR comments

**Weekly**:
- Test metrics dashboard (planned)
- Flaky test summary

**Sprint**:
- Test coverage trends
- Bug escape analysis
- Test debt review

---

## Continuous Improvement

### Monthly Test Review

**Agenda**:
1. Review test metrics (coverage, execution time, flakiness)
2. Identify coverage gaps
3. Remove obsolete tests
4. Optimize slow tests
5. Update testing documentation

**Action Items**:
- Address flaky tests
- Improve test infrastructure
- Update test standards

---

### Testing Best Practices

**DO**:
- ✅ Write tests for all new code
- ✅ Keep tests simple and focused
- ✅ Use descriptive test names
- ✅ Test edge cases and error paths
- ✅ Clean up test data
- ✅ Run tests before committing
- ✅ Fix failing tests immediately

**DON'T**:
- ❌ Skip tests to meet deadlines
- ❌ Commit failing tests
- ❌ Write tests that depend on order
- ❌ Test implementation details
- ❌ Mock everything (integration tests need real dependencies)
- ❌ Ignore flaky tests

---

### Test Debt Management

**Definition**: Test debt is accumulated when:
- Tests are skipped or incomplete
- Flaky tests are ignored
- Coverage decreases
- Manual tests aren't automated

**Management**:
1. **Track**: Label issues as "test-debt"
2. **Prioritize**: High-value areas first
3. **Allocate**: 10-15% of sprint capacity
4. **Pay Down**: Regularly, not just before releases

---

## Appendices

### Appendix A: Test Naming Conventions

**Unit Tests**:
```typescript
describe('functionName', () => {
  it('should do something when condition', () => {
    // test
  });
});
```

**Integration Tests**:
```typescript
describe('Feature Name', () => {
  it('performs action successfully', () => {
    // test
  });

  it('returns error when invalid input', () => {
    // test
  });
});
```

**Test Case IDs**:
- Format: `TC-<MODULE>-<NUMBER>`
- Example: `TC-AGENT-001`

---

### Appendix B: Test Data Guidelines

**Username Generation**:
```typescript
// Good: Unique, timestamped
const username = `test_agent_${Date.now()}_${randomString()}`;

// Bad: Static, may conflict
const username = 'test_agent';
```

**Cleanup Pattern**:
```typescript
afterEach(async () => {
  await db.execute(sql`TRUNCATE TABLE agents CASCADE`);
  await redis.flushdb();
});
```

---

### Appendix C: Common Testing Patterns

**AAA Pattern** (Arrange-Act-Assert):
```typescript
it('updates agent profile', async () => {
  // Arrange
  const { agent, apiKey } = await registerTestAgent();

  // Act
  const response = await updateProfile(apiKey, {
    displayName: 'Updated Name'
  });

  // Assert
  expect(response.status).toBe(200);
  expect(response.data.displayName).toBe('Updated Name');
});
```

**Given-When-Then** (BDD):
```typescript
it('TC-AGENT-008: authenticates with valid API key', async () => {
  // Given an agent with a registered API key
  const { apiKey } = await registerTestAgent();

  // When making an authenticated request
  const response = await getProfile(apiKey);

  // Then the request succeeds with full profile
  expect(response.status).toBe(200);
  expect(response.data).toHaveProperty('email');
});
```

---

**Last Updated**: 2026-02-08
**Next Review**: 2026-05-08 (Quarterly)
**Maintained By**: Tech Lead + QA Lead
