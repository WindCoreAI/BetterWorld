/**
 * Problems E2E Test Suite
 *
 * Tests the problems board: browsing, detail view, domain filtering,
 * and agent-authenticated actions.
 *
 * Source flow: e2e/flows/problems.flow.md
 */

import { test, expect } from "@playwright/test";

import {
  registerAndLoginHuman,
  createTestAgent,
  type TestHuman,
  type TestAgent,
} from "../helpers/auth";
import {
  assertPageLoads,
  setupConsoleErrorCollector,
} from "../helpers/assertions";
import { API_URL, WEB_URL } from "../helpers/constants";
import { flushRateLimits } from "../helpers/db";
import { createTestProblem, waitForGuardrailApproval } from "../helpers/data-factory";

test.describe("Problems Suite", () => {
  test.beforeEach(() => {
    flushRateLimits();
  });

  let human: TestHuman;
  let agent: TestAgent;
  let problemId: string;

  // Setup: create a human, agent, and problem for testing
  test("setup: create human, agent, and test problem", async ({ request }) => {
    human = await registerAndLoginHuman(request, "problems");
    agent = await createTestAgent(request, human.accessToken, "problems");
    problemId = await createTestProblem(request, agent.apiKey);

    // Wait for guardrail to process
    await waitForGuardrailApproval(request, problemId, agent.apiKey);
  });

  // Scenario 1: Browse Problems List (Public)
  test("problems page loads with problem cards", async ({ page }) => {
    const getErrors = setupConsoleErrorCollector(page);

    await assertPageLoads(page, "/problems", "Problems");

    // Verify at least one heading visible
    await expect(page.locator("text=Problems").first()).toBeVisible({
      timeout: 10_000,
    });

    const errors = getErrors();
    expect(errors).toHaveLength(0);
  });

  // Scenario 2: View Problem Detail
  test("problem detail page loads via API", async ({ request }) => {
    test.skip(!problemId, "setup did not complete");
    const res = await request.get(
      `${API_URL}/api/v1/problems/${problemId}`,
      {
        headers: { Authorization: `Bearer ${agent.apiKey}` },
      },
    );
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data?.id).toBe(problemId);
    expect(json.data?.title).toBeDefined();
    expect(json.data?.domain).toBe("environmental_protection");
  });

  test("problem detail page loads in browser with key elements", async ({ page }) => {
    test.skip(!problemId, "setup did not complete");
    flushRateLimits();
    await page.goto(`${WEB_URL}/problems/${problemId}`);
    await expect(page.locator("h1").first()).toBeVisible({
      timeout: 15_000,
    });

    // Verify breadcrumb navigation
    await expect(
      page.locator('nav[aria-label="Breadcrumb"]'),
    ).toBeVisible({
      timeout: 10_000,
    });

    // Verify "Propose Solution" CTA button
    await expect(page.locator("text=Propose Solution")).toBeVisible({
      timeout: 10_000,
    });
  });

  // Scenario 3: Filter Problems by Domain
  test("problems API supports domain filtering", async ({ request }) => {
    const res = await request.get(
      `${API_URL}/api/v1/problems?domain=environmental_protection`,
    );
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });

  // Scenario 4: Problem Board with Agent Authentication (Report/My Problems)
  test("problems API mine filter returns agent's problems", async ({
    request,
  }) => {
    test.skip(!agent, "setup did not complete");
    const res = await request.get(
      `${API_URL}/api/v1/problems?mine=true`,
      {
        headers: { Authorization: `Bearer ${agent.apiKey}` },
      },
    );
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });
});
