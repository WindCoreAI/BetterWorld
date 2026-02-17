---
description: Generate Playwright E2E test files from UX flow plans. Reads flow scripts from e2e/flows/ and generates executable .spec.ts files in e2e/suites/ following golden-path patterns.
handoffs:
  - label: Run Tests
    agent: run-e2e
    prompt: Run the E2E test suites just generated
    send: false
  - label: Regenerate Flows
    agent: ux-flows
    prompt: Regenerate the UX flow plans to update test coverage
    send: false
---

## User Input

```text
$ARGUMENTS
```

## Goal

Read UX flow plans from `e2e/flows/` and generate executable Playwright test files in `e2e/suites/`. Generated tests follow the established golden-path patterns: sequential `test.describe` blocks, mixed API (`request`) and browser (`page`) interactions, shared state within describe blocks, and imports from `e2e/helpers/`.

## Argument Parsing

| Argument | Effect |
|----------|--------|
| (empty) or `--all` | Generate all suites from all available flows |
| `--from-flow auth` | Generate suite from specific flow file |
| `--from-flow auth,missions` | Generate from multiple flows (comma-separated) |
| `--suite auth` | Generate specific suite (same as --from-flow) |
| `--update <suite>` | Regenerate a specific suite (overwrites existing) |
| `--dry-run` | Show what would be generated without writing files |

## Execution Steps

### Step 1: Read Inputs

1. Read the specified flow file(s) from `e2e/flows/`. If none specified, read all `*.flow.md` files.
2. Read the golden-path test (`e2e/golden-path.test.ts`) as the **canonical pattern reference**.
3. Read the helpers (`e2e/helpers/`) to know available utilities:
   - `constants.ts` — `API_URL`, `WEB_URL`, `HUMAN_ACCESS_KEY`, `HUMAN_REFRESH_KEY`, `PG_CONTAINER`
   - `db.ts` — `uniqueId()`, `execSql()`
   - `auth.ts` — `registerAndLoginHuman()`, `loginHuman()`, `createTestAgent()`, `authenticateInBrowser()`
   - `data-factory.ts` — `createTestProblem()`, `createTestSolution()`, `waitForGuardrailApproval()`
   - `assertions.ts` — `assertPageLoads()`, `setupConsoleErrorCollector()`
4. Read relevant page components to understand actual DOM structure (for accurate selectors).

### Step 2: Generate Test Files

For each flow, generate a `.spec.ts` file in `e2e/suites/`. Follow these **mandatory code patterns**:

#### Import Pattern

```typescript
import { test, expect } from "@playwright/test";
import { registerAndLoginHuman, authenticateInBrowser } from "../helpers/auth";
import { uniqueId } from "../helpers/db";
import { assertPageLoads } from "../helpers/assertions";
import { API_URL, WEB_URL } from "../helpers/constants";
```

Only import what the specific suite needs. Do not add unused imports.

#### Test Structure Pattern

```typescript
test.describe("Auth Suite", () => {
  // Shared state for sequential tests that build on each other
  let humanToken: string;

  test("scenario name from flow", async ({ request, page }) => {
    // Use request for API calls
    // Use page for browser interactions
    // Use helpers for common operations
  });
});
```

#### Selector Strategy (Priority Order)

1. **Text content**: `page.locator("text=Join BetterWorld")` — most readable, matches golden-path pattern
2. **Heading elements**: `page.locator("h1, h2").first()` — for page load verification
3. **Role-based**: `page.getByRole("button", { name: "Create Account" })` — accessible and stable
4. **Label-based**: `page.getByLabel("Email")` — for form inputs
5. **Input attributes**: `page.locator('input[type="email"]')` — fallback for forms
6. **Test IDs**: `page.getByTestId("...")` — if available in source
7. **`.or()` chains**: For content that may show loading states (golden-path line 198 pattern)

**NEVER use**: Fragile CSS class selectors (Tailwind classes change), XPath, positional `.nth()`.

#### Auth Pattern

For tests that need authenticated browser sessions:

```typescript
test.describe("Dashboard Suite", () => {
  let tokens: { accessToken: string; refreshToken: string };

  test("setup: register and login human", async ({ request }) => {
    const human = await registerAndLoginHuman(request, "dashboard");
    tokens = { accessToken: human.accessToken, refreshToken: human.refreshToken };
  });

  test("main dashboard loads with all cards", async ({ page }) => {
    await authenticateInBrowser(page, tokens);
    await page.goto(`${WEB_URL}/dashboard`);
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
  });
});
```

#### API Call Pattern

```typescript
test("creates a problem via API", async ({ request }) => {
  const res = await request.post(`${API_URL}/api/v1/problems`, {
    headers: {
      Authorization: `Bearer ${agentApiKey}`,
      "Content-Type": "application/json",
    },
    data: { /* fields from flow */ },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Problem creation failed (${res.status()}): ${body}`);
  }
  const json = await res.json();
  expect(json.ok).toBe(true);
});
```

#### Page Load Verification Pattern

```typescript
// Using the assertion helper
test("problems page loads", async ({ page }) => {
  await assertPageLoads(page, "/problems", "Problem");
});

// Or manual for more specific checks (golden-path style)
test("missions page loads", async ({ page }) => {
  await page.goto(`${WEB_URL}/missions`);
  await expect(
    page.locator("text=Mission Marketplace")
      .or(page.locator("text=Loading"))
      .first(),
  ).toBeVisible({ timeout: 10_000 });
});
```

### Step 3: Code Generation Rules

1. **Sequential tests**: All tests within a `test.describe` run sequentially (config is `fullyParallel: false`).
2. **Timeout on assertions**: Always set `{ timeout: 10_000 }` for `.toBeVisible()` and similar assertions.
3. **Error handling on API calls**: Always check `res.ok()` and throw with status + body on failure (golden-path pattern).
4. **No hardcoded URLs**: Always use `API_URL` and `WEB_URL` from constants.
5. **Self-contained suites**: Each suite sets up its own test data. Don't depend on data from other suites.
6. **Unique test data**: Use `uniqueId()` for emails, usernames, titles to prevent collisions.
7. **Clean TypeScript**: Strict mode compatible, no `any` types, proper imports.
8. **Use helpers over inline code**: If a helper exists for an operation, use it instead of writing inline.
9. **Comment the flow step**: Add a brief comment referencing which flow scenario the test implements.

### Step 4: Verify Generated Files

After writing each file, verify:
- All imported modules exist in `e2e/helpers/`
- No hardcoded localhost URLs
- TypeScript import paths are correct (relative from `e2e/suites/`)
- Each test has at least one `expect()` assertion

### Step 5: Report

Output a summary table:

```
## Generated E2E Test Suites

| Suite | File | Tests | Auth Setup | Source Flow |
|-------|------|-------|------------|-------------|
| Auth | e2e/suites/auth.spec.ts | 6 | Mixed | auth.flow.md |
| Onboarding | e2e/suites/onboarding.spec.ts | 3 | Yes | onboarding.flow.md |
| ... | ... | ... | ... | ... |

Total: N test files, M tests

## Run Commands

Run all suites:       pnpm e2e:suites
Run specific suite:   pnpm exec playwright test --project=suites e2e/suites/auth.spec.ts
Run with browser:     pnpm exec playwright test --project=suites --headed
```

## Operating Principles

- **Match golden-path style exactly**: The golden-path test is the canonical reference. Generated tests should look like they were written by the same developer.
- **Read components for selectors**: Don't guess selectors from flow descriptions. Read the actual component source to find stable, accessible selectors.
- **Prefer text-based locators**: `text=Join BetterWorld` is more readable and maintainable than CSS selectors, and it's what the golden-path uses.
- **Test behavior, not implementation**: Assert on visible text, navigation, and API responses — not internal state or CSS classes.
- **Keep tests focused**: One `test()` per scenario from the flow. Don't combine multiple scenarios into one test.
- **Setup tests are real tests**: The first test in a describe block often does auth setup. This is fine — it's the golden-path pattern (Step 1 does registration, subsequent tests use the token).
