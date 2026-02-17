---
description: Run Playwright E2E test suites from e2e/suites/ with structured reporting, failure screenshots, and auto-fix capability. Supports running by suite name or --full for all. For local validation before production deployment.
handoffs:
  - label: Regenerate Failing Tests
    agent: generate-e2e
    prompt: Regenerate the test files that failed — check the flow plans and component source for updated selectors
    send: false
  - label: Full Validation Pipeline
    agent: validate-dev
    prompt: Run the full validation pipeline (lint, typecheck, test, build) with --e2e flag
    send: false
---

## User Input

```text
$ARGUMENTS
```

## Goal

Run Playwright E2E test suites from `e2e/suites/` and report results in a structured format. Supports running individual suites, multiple suites, or all suites. Includes pre-flight checks, structured reporting, and an optional auto-fix loop for failing tests.

These tests are for **local validation before production deployment** — they are NOT run in GitHub Actions CI.

## Argument Parsing

| Argument | Effect |
|----------|--------|
| (empty) | List available suites and ask which to run |
| `--suite auth` | Run single suite |
| `--suite auth,missions,social` | Run multiple suites (comma-separated) |
| `--full` | Run all suites in `e2e/suites/` |
| `--fix` | Enable auto-fix loop (analyze failures, fix tests, re-run; max 3 iterations) |
| `--headed` | Run with browser visible for debugging |
| `--golden-path` | Also run the golden-path test (default: suites only) |
| `--list` | List available suites without running |

Flags can be combined: `--suite auth,missions --fix --headed`

## Execution Steps

### Step 0: Pre-flight Checks

Run these checks before executing any tests. Report each check's status.

1. **Suites exist**: Verify `e2e/suites/` directory contains `.spec.ts` files.
   ```bash
   ls e2e/suites/*.spec.ts 2>/dev/null | wc -l
   ```
   If zero files found: tell user to run `/generate-e2e` first and stop.

2. **Playwright installed**: Verify Playwright browsers are available.
   ```bash
   pnpm exec playwright --version
   ```
   If missing: run `pnpm exec playwright install chromium`.

3. **Database accessible**: Verify PostgreSQL is reachable.
   ```bash
   docker exec betterworld-postgres pg_isready -U betterworld 2>/dev/null
   ```
   If Docker is not running or container not found: warn user that DB-dependent tests may fail.

4. **API server reachable**: Check health endpoint.
   ```bash
   curl -sf http://localhost:4000/healthz
   ```
   If not reachable: ask user if they want to start it with `pnpm dev:api`.

5. **Web server reachable**: Check frontend.
   ```bash
   curl -sf http://localhost:3000 -o /dev/null
   ```
   If not reachable: ask user if they want to start it with `pnpm dev:web`.

   Note: Playwright config has `webServer` entries that auto-start servers, but only if they're not already running. If both are down, Playwright will start them automatically. The pre-flight checks are informational.

Report pre-flight results:
```
## Pre-flight Checks

| Check | Status |
|-------|--------|
| Test suites found | ✅ N files |
| Playwright browsers | ✅ v1.58.2 |
| PostgreSQL | ✅ Running |
| API server (4000) | ✅ Healthy |
| Web server (3000) | ✅ Running |
```

### Step 1: Discover Available Suites

List all `.spec.ts` files in `e2e/suites/`:

```bash
ls e2e/suites/*.spec.ts
```

If `$ARGUMENTS` is empty, present the list and ask which suite(s) to run using AskUserQuestion.

If `--list` flag, just display the list and stop.

### Step 2: Build the Command

Based on arguments, construct the Playwright command:

```bash
# Single suite
pnpm exec playwright test --project=suites e2e/suites/auth.spec.ts

# Multiple suites
pnpm exec playwright test --project=suites e2e/suites/auth.spec.ts e2e/suites/missions.spec.ts

# All suites (--full)
pnpm exec playwright test --project=suites

# With headed mode
pnpm exec playwright test --project=suites --headed

# Also include golden-path
pnpm exec playwright test
```

Add `--reporter=line` for parseable terminal output (default). The HTML report is always generated for detailed failure analysis.

### Step 3: Execute Tests

Run the command with a **5-minute timeout** per suite (300000ms).

```bash
pnpm exec playwright test --project=suites [files] --reporter=line 2>&1
```

Capture the full output including:
- Test names and pass/fail status
- Error messages and stack traces
- Duration per test and total

### Step 4: Report Results

Parse the output and present structured results:

```
## E2E Test Results

| Suite | Tests | Passed | Failed | Skipped | Duration |
|-------|-------|--------|--------|---------|----------|
| auth | 6 | 5 | 1 | 0 | 12.3s |
| navigation | 11 | 11 | 0 | 0 | 8.5s |
| dashboard | 4 | 4 | 0 | 0 | 6.2s |
| **Total** | **21** | **20** | **1** | **0** | **27.0s** |

**Result**: ❌ 1 failure in auth suite
```

If all pass:
```
**Result**: ✅ All N tests passed — ready for production deployment
```

### Step 5: Failure Analysis

For each failing test, provide detailed analysis:

```
### Failures

#### auth.spec.ts > Auth Suite > login with invalid credentials shows error
**Error**: expect(locator).toBeVisible()
  Locator: text=Invalid email or password
  Expected: visible
  Received: <element not found>

**What likely went wrong**: The error message text may have changed in the component, or the error element uses a different display pattern.

**Suggested fix**: Read `apps/web/src/app/auth/human/login/page.tsx` to check the actual error display pattern.
```

If screenshots were captured (Playwright saves them on failure by default):
```
**Screenshot**: test-results/auth-Suite-login-with-invalid-credentials/test-failed-1.png
```

### Step 6: Auto-Fix Loop (if `--fix` flag)

When tests fail and `--fix` is specified:

1. **Read the failure output** — error message, expected vs actual, screenshot path
2. **Read the failing test file** — understand what the test expects
3. **Read the relevant page component** — check current DOM structure, text content, selectors
4. **Identify the issue** — categorize as:
   - Stale selector (text changed, element restructured)
   - Timing issue (element loads slower than expected)
   - API response changed (different field names or status codes)
   - Auth issue (token not set correctly)
   - Missing prerequisite (test data not created)
5. **Fix the test file** — apply minimal, targeted fix
6. **Re-run only the failing suite** — not all suites
7. **Repeat** up to 3 times per failing test

After fix loop completes, report:

```
## Fixes Applied

| File | Test | Issue | Fix |
|------|------|-------|-----|
| auth.spec.ts | login error display | Selector stale | Updated `text=Invalid email` to `text=Login failed` |

Total files modified: 1
Fix iterations: 2 (passed on 2nd attempt)
```

### Step 7: Final Summary

```
## Summary

| Metric | Value |
|--------|-------|
| Suites run | 3 |
| Total tests | 15 |
| Passed | 15 |
| Failed | 0 |
| Fixed (auto) | 1 |
| Duration | 34.2s |
| Result | ✅ All passing |

### Quick Commands

Re-run failed:    pnpm exec playwright test --project=suites --last-failed
Run all suites:   pnpm e2e:suites
View HTML report:  pnpm exec playwright show-report
```

## Operating Principles

- **Pre-flight before execution**: Always verify infrastructure is ready before running tests. Don't waste time on tests that will fail due to missing servers.
- **Structured output**: Every run produces a parseable summary table. The user should know the result at a glance.
- **Minimal fix scope**: When auto-fixing, only change what's needed to make the test pass. Don't refactor, don't add features, don't improve surrounding code.
- **Read before fixing**: Always read the failing test AND the page component source before applying any fix. Understand why it failed.
- **Max 3 fix iterations**: Don't loop endlessly. After 3 attempts, report the remaining failure for manual investigation.
- **Preserve test intent**: When fixing a selector or assertion, ensure the test still validates the same user behavior. Don't weaken assertions just to make them pass.
- **Report actionable info**: Every failure should include enough context for the user (or `/generate-e2e`) to understand and resolve it.
