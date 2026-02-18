/**
 * Solutions E2E Test Suite
 *
 * Tests the solutions board: browsing with scores, solution detail
 * with debates, and agent-authenticated My Solutions toggle.
 *
 * Source flow: e2e/flows/solutions.flow.md
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
import {
  createTestProblem,
  createTestSolution,
  forceApproveContent,
  waitForGuardrailApproval,
} from "../helpers/data-factory";

test.describe("Solutions Suite", () => {
  let human: TestHuman;
  let agent: TestAgent;
  let problemId: string;
  let solutionId: string;

  // Setup: create human, agent, problem, and solution
  test("setup: create human, agent, problem, and solution", async ({
    request,
  }) => {
    human = await registerAndLoginHuman(request, "solutions");
    agent = await createTestAgent(request, human.accessToken, "solutions");
    problemId = await createTestProblem(request, agent.apiKey);
    await waitForGuardrailApproval(request, problemId, agent.apiKey);
    solutionId = await createTestSolution(request, agent.apiKey, problemId);
    // Force-approve solution since guardrail worker isn't running in test env
    forceApproveContent("solutions", solutionId);
  });

  test.beforeEach(() => {
    flushRateLimits();
  });

  // Scenario 1: Browse Solutions with Scores
  test("solutions page loads with solution cards", async ({ page }) => {
    const getErrors = setupConsoleErrorCollector(page);

    await assertPageLoads(page, "/solutions", "Solutions");

    // Verify heading
    await expect(page.locator("text=Solutions").first()).toBeVisible({
      timeout: 10_000,
    });

    const errors = getErrors();
    expect(errors).toHaveLength(0);
  });

  // Scenario 2: View Solution Detail with Debates
  test("solution detail loads via API", async ({ request }) => {
    test.skip(!solutionId, "setup did not complete");
    const res = await request.get(
      `${API_URL}/api/v1/solutions/${solutionId}`,
      {
        headers: { Authorization: `Bearer ${agent.apiKey}` },
      },
    );
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data?.id).toBe(solutionId);
    expect(json.data?.title).toBeDefined();
    expect(json.data?.problemId).toBe(problemId);
  });

  test("solution detail page loads in browser with score breakdown", async ({ page }) => {
    test.skip(!solutionId, "setup did not complete");
    flushRateLimits();
    await page.goto(`${WEB_URL}/solutions/${solutionId}`);
    await expect(page.locator("h1").first()).toBeVisible({
      timeout: 15_000,
    });

    // Verify score breakdown section
    await expect(page.locator("text=Score Breakdown")).toBeVisible({
      timeout: 10_000,
    });

    // Verify debates section header
    await expect(page.locator("text=Debates").first()).toBeVisible({
      timeout: 10_000,
    });

    // Verify linked problem section
    await expect(
      page.locator("text=Linked Problem")
        .or(page.locator("text=LINKED PROBLEM"))
        .first(),
    ).toBeVisible({
      timeout: 10_000,
    });
  });

  // Scenario 3: Solutions with Agent Authentication (My Solutions Toggle)
  test("solutions API mine filter returns agent's solutions", async ({
    request,
  }) => {
    test.skip(!agent, "setup did not complete");
    const res = await request.get(`${API_URL}/api/v1/solutions?mine=true`, {
      headers: { Authorization: `Bearer ${agent.apiKey}` },
    });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBe(true);
    // API returns data as a direct array
    expect(Array.isArray(json.data)).toBe(true);
  });
});
