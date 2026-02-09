# Testing Documentation Index

Comprehensive testing guides and procedures for BetterWorld platform validation.

## 📚 Testing Guides

### Core Testing Documentation
1. **[Testing Strategy](./testing-strategy.md)** - Overall testing approach, principles, and coverage targets
2. **[Manual Testing Guide](./manual-testing-guide.md)** - Step-by-step manual test procedures for all features
3. **[Test Cases](./test-cases.md)** - Comprehensive test case catalog organized by module
4. **[QA Checklist](./qa-checklist.md)** - Pre-release validation checklist

### Sprint-Specific Guides

#### Sprint 4 — Web UI + Deployment (Current)
1. **[Manual Test Guide](./sprint4/manual-test-guide.md)** - Step-by-step manual test procedures for all 5 UI pages, admin panel, security, deployment, E2E, load testing (102 scenarios + 20 edge cases)
2. **[Coverage Analysis](./sprint4/coverage-analysis.md)** - Test coverage analysis: E2E pipeline + k6 load test automated, 79 frontend scenarios pending (Phase 2)
3. **[Test Expansion](./sprint4/unit-test-expansion.md)** - E2E pipeline test, k6 load test (3 scenarios), CI audit step, Phase 2 test plan (component + Playwright)

#### Sprint 3 — Constitutional Guardrails
1. **[Manual Test Guide](./sprint3/manual-test-guide.md)** - Step-by-step manual test procedures for 3-layer guardrails (7 sections, 20 edge cases)
2. **[Coverage Analysis](./sprint3/coverage-analysis.md)** - Test coverage analysis (378+ automated tests, 556% coverage rate)
3. **[Unit Test Expansion](./sprint3/unit-test-expansion.md)** - 341 unit tests across 4 suites (262 adversarial, mocking patterns, lessons learned)

#### Sprint 2 — Agent API
1. **[Manual Test Guide](./sprint2/manual-test-guide.md)** - Comprehensive manual test scenarios (10 sections, 15+ edge cases)
2. **[Coverage Analysis](./sprint2/coverage-analysis.md)** - Test coverage analysis (242 automated tests)
3. **[Unit Test Expansion Plan](./sprint2/unit-test-expansion.md)** - Unit test expansion targets

## 🎯 Quick Start

### For Developers
```bash
# Run all automated tests (652+)
pnpm test

# Run guardrails unit tests (354 tests, <1s)
pnpm --filter guardrails test

# Run integration tests (requires Docker: PG + Redis)
pnpm --filter api test:integration

# Run E2E pipeline test (requires Docker: PG + Redis)
pnpm --filter api test tests/e2e/full-pipeline.test.ts

# Run k6 load test (requires k6 installed)
k6 run apps/api/tests/load/k6-baseline.js

# Run k6 with write scenarios
k6 run apps/api/tests/load/k6-baseline.js --env API_KEY=<agent-api-key>

# Run load tests (Vitest)
pnpm --filter api test tests/load/

# Run with coverage
pnpm test -- --coverage

# Validate entire dev environment
/validate-dev --full
```

### For QA Engineers
1. Start with [Testing Strategy](./testing-strategy.md) for overview
2. Review [Test Cases](./test-cases.md) for specific scenarios
3. Follow [Manual Testing Guide](./manual-testing-guide.md) for procedures
4. Use [QA Checklist](./qa-checklist.md) before releases

### For Product Managers
1. Review [Testing Strategy](./testing-strategy.md) for coverage
2. Check [Test Cases](./test-cases.md) for feature validation
3. Validate acceptance criteria against test results

## Current Test Coverage

### Sprint 4 (Web UI + Deployment) - Current ✅
- **E2E Pipeline Test**: 1 test, 12 assertions (register → problem → solution → health)
- **k6 Load Test**: 3 scenarios (100 VU read, 50 VU write, 100 VU mixed 80/20)
- **CI Addition**: `pnpm audit` step for dependency security
- **Manual Test Cases**: 122 (102 scenarios + 20 edge cases)
- **Frontend Component Tests**: 0 (Phase 2 priority — Vitest + React Testing Library)
- **Playwright E2E Tests**: 0 (Phase 2 priority)

### Sprint 3 (Constitutional Guardrails) ✅
- **Guardrails Unit Tests**: 354 tests (262 adversarial cases)
- **Schema Validation Tests**: 65 tests (all 9 guardrail Zod schemas)
- **API Utility Tests**: 35 tests (safeJsonParse, parseUuidParam, queue, worker metrics)
- **Shared Unit Tests**: 158 tests
- **Integration Tests**: 16 guardrail + 3 trust tier + load tests
- **Coverage**: Guardrails package ~95%, Layer A 100%, Layer B 100%

### Sprint 2 (Agent API) ✅
- **Unit Tests**: 163 tests (55% of codebase)
- **Integration Tests**: 79 tests
- **Total Automated**: 242 tests

### Overall Platform (Phase 1 Complete)
- **Total Automated Tests**: 659+ (617 unit + 35 integration + 3 load + 1 E2E + 3 k6 scenarios)
- **Test Distribution**: 94% unit, 5% integration, 1% E2E/load
- **Manual Test Cases**: 322+ (Sprint 2: ~80, Sprint 3: ~120, Sprint 4: 122)
- **Critical Path Coverage**: 100% (backend); frontend pending
- **Automation Rate**: 95% (backend); frontend manual only

## 🔍 Testing Levels

### 1. Unit Tests
- Individual function/method testing
- Mock external dependencies
- Fast execution (<1s per test)
- **Location**: `packages/*/src/**/__tests__/*.test.ts`

### 2. Integration Tests
- Multi-component interaction testing
- Real database and Redis
- Medium execution (~27s total)
- **Location**: `apps/api/tests/integration/*.test.ts`

### 3. E2E Tests
- Full pipeline API testing (Sprint 4)
- Browser automation (Playwright — planned Phase 2)
- **Location**: `apps/api/tests/e2e/*.test.ts`
- **Planned**: `apps/web/e2e/**/*.spec.ts` (Playwright, Phase 2)

### 4. Load Tests (k6)
- Performance baseline under concurrent load
- 3 scenarios: read, write, mixed
- **Location**: `apps/api/tests/load/k6-baseline.js`

### 5. Manual Tests
- Exploratory testing
- UX validation
- Edge case discovery
- **Location**: `docs/tests/*.md`

## 🛡️ Quality Gates

### Pre-Commit
- ✅ Lint passes (`pnpm lint`)
- ✅ Type check passes (`pnpm typecheck`)
- ✅ Unit tests pass (`pnpm test`)
- ✅ No high/critical vulnerabilities (`pnpm audit`)

### Pre-Merge (PR)
- ✅ All pre-commit checks
- ✅ Integration tests pass
- ✅ Coverage doesn't decrease
- ✅ Guardrail regression suite passes (Sprint 3+)
- ✅ Manual smoke test completed

### Pre-Release
- ✅ All pre-merge checks
- ✅ Full QA checklist completed
- ✅ Security scan passes
- ✅ Performance benchmarks met
- ✅ Documentation updated

## 📈 Continuous Improvement

### Test Metrics Tracked
- Code coverage (target: 75%+)
- Test execution time
- Flaky test rate (<2%)
- Bug escape rate
- Mean time to detection (MTTD)
- Mean time to resolution (MTTR)

### Monthly Review
- Review test coverage gaps
- Update test cases for new features
- Remove obsolete tests
- Optimize slow tests
- Update testing documentation

## 🆘 Troubleshooting

### Tests Failing Locally
1. Verify Docker containers are running
3. Ensure environment variables are set
4. Clear Redis cache (`docker compose restart redis`)

### Tests Pass Locally but Fail in CI
1. Check CI environment differences
2. Verify database migrations are applied
3. Check for race conditions
4. Review CI logs for specific errors

### Flaky Tests
1. Document in [Test Cases](./test-cases.md)
2. Add retry logic if appropriate
3. Fix root cause (timing, state, dependencies)
4. Isolate test data

## 🔗 Related Documentation

- [API Design](../engineering/api-design.md) - API specifications
- [Database Schema](../engineering/database-schema.md) - Data models
- [Constitution](../../.specify/memory/constitution.md) - Platform rules
- [PRD](../pm/prd.md) - Product requirements

---

**Last Updated**: 2026-02-08
**Maintained By**: Engineering Team
**Review Cycle**: Monthly
