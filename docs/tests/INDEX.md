# Testing Documentation Index

Comprehensive testing guides and procedures for BetterWorld platform validation.

## 📚 Testing Guides

### Core Testing Documentation
1. **[Testing Strategy](./testing-strategy.md)** - Overall testing approach, principles, and coverage targets
2. **[Manual Testing Guide](./manual-testing-guide.md)** - Step-by-step manual test procedures for all features
3. **[Test Cases](./test-cases.md)** - Comprehensive test case catalog organized by module
4. **[QA Checklist](./qa-checklist.md)** - Pre-release validation checklist

### Sprint-Specific Guides

#### Sprint 3 — Constitutional Guardrails (Current)
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
# Run all automated tests
pnpm test

# Run guardrails unit tests (341 tests, <1s)
pnpm --filter guardrails test

# Run guardrails integration tests (requires Docker: PG + Redis)
pnpm --filter api test:integration tests/integration/guardrail-evaluation.test.ts
pnpm --filter api test:integration tests/integration/admin-review.test.ts
pnpm --filter api test:integration tests/integration/trust-tier.test.ts

# Run load tests
pnpm --filter api test tests/load/

# Run integration tests only
pnpm --filter api test:integration

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

## 📊 Current Test Coverage

### Sprint 3 (Constitutional Guardrails) - Current ✅
- **Guardrails Unit Tests**: 341 tests (262 adversarial cases)
- **Schema Validation Tests**: 65 tests (all 9 guardrail Zod schemas)
- **API Utility Tests**: 35 tests (safeJsonParse, parseUuidParam, queue, worker metrics)
- **Shared Unit Tests**: 158 tests
- **API Unit Tests**: 105 tests
- **Integration Tests**: 16 guardrail + 3 trust tier + load tests
- **Load Tests**: 3 tests (50-concurrent, cache hit rate, throughput)
- **Execution Time**: <1s for all unit tests
- **Coverage**:
  - Guardrails package: ~95% (target: ≥95%)
  - Layer A (regex patterns): 100% (all 12 patterns, 262 adversarial cases)
  - Layer B (LLM classifier): 100% (36 tests with mocked Anthropic SDK)
  - Cache manager: 100% (hit/miss/error/TTL scenarios)
  - Trust tiers: 100% (27 boundary + threshold tests)
  - Validation schemas: 100% (65 tests covering all 9 schemas)
  - API utilities: 100% (safeJsonParse, parseUuidParam, queue singleton)

### Sprint 2 (Agent API) ✅
- **Unit Tests**: 163 tests (55% of codebase)
- **Integration Tests**: 79 tests
- **Total Automated**: 242 tests

### Overall Platform
- **Total Automated Tests**: 707+ (604 unit + 95 integration + 3 load)
- **Test Distribution**: 87% unit, 13% integration, <1% load
- **Manual Test Cases**: 200+
- **Critical Path Coverage**: 100%
- **Automation Rate**: 97%

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
- Full user flow testing
- Browser automation (Playwright)
- Slow execution (planned)
- **Location**: `apps/web/e2e/**/*.spec.ts` (planned)

### 4. Manual Tests
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
