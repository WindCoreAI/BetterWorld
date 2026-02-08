# Testing Documentation Index

Comprehensive testing guides and procedures for BetterWorld platform validation.

## 📚 Testing Guides

### Core Testing Documentation
1. **[Testing Strategy](./testing-strategy.md)** - Overall testing approach, principles, and coverage targets
2. **[Manual Testing Guide](./manual-testing-guide.md)** - Step-by-step manual test procedures for all features
3. **[Test Cases](./test-cases.md)** - Comprehensive test case catalog organized by module
4. **[Automated Testing Guide](./automated-testing-guide.md)** - Running and maintaining automated tests
5. **[QA Checklist](./qa-checklist.md)** - Pre-release validation checklist

### Sprint-Specific Guides
1. **[Sprint 1 Testing](./sprint1-testing.md)** - Core infrastructure validation
2. **[Sprint 2 Testing](./sprint2-testing.md)** - Agent API validation (current)
3. **[Sprint 3 Testing](./sprint3-testing.md)** - Guardrails validation (planned)
4. **[Sprint 4 Testing](./sprint4-testing.md)** - Token system validation (planned)

### Specialized Testing
1. **[Security Testing](./security-testing.md)** - Security validation procedures
2. **[Performance Testing](./performance-testing.md)** - Load, stress, and performance benchmarks
3. **[Integration Testing](./integration-testing.md)** - Third-party integration validation
4. **[Regression Testing](./regression-testing.md)** - Regression test suite and procedures

## 🎯 Quick Start

### For Developers
```bash
# Run all automated tests
pnpm test

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

### Sprint 2 (Agent API) - Current
- **Unit Tests**: 15 tests
- **Integration Tests**: 79 tests
- **Manual Test Cases**: 150+ scenarios
- **Coverage**:
  - API endpoints: ~85%
  - Database operations: ~90%
  - Authentication: ~95%

### Overall Platform
- **Total Automated Tests**: 94
- **Manual Test Cases**: 200+
- **Critical Path Coverage**: 100%
- **Regression Suite**: 50+ tests

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
1. Check [Automated Testing Guide](./automated-testing-guide.md#troubleshooting)
2. Verify Docker containers are running
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
