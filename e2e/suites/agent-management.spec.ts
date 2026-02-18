/**
 * Agent Management E2E Test Suite
 *
 * Tests the human-first agent creation flow: empty state, create agent,
 * API key reveal, deactivate/reactivate, rotate key, unauthenticated access.
 *
 * Source flow: e2e/flows/agent-management.flow.md
 */

import { test, expect } from "@playwright/test";

import {
  registerAndLoginHuman,
  authenticateInBrowser,
  createTestAgent,
  type TestHuman,
  type TestAgent,
} from "../helpers/auth";
import { setupConsoleErrorCollector } from "../helpers/assertions";
import { API_URL, WEB_URL } from "../helpers/constants";
import { uniqueId } from "../helpers/db";

test.describe("Agent Management Suite", () => {
  let human: TestHuman;
  let agent: TestAgent;

  test("setup: register human for agent tests", async ({ request }) => {
    human = await registerAndLoginHuman(request, "agents");
  });

  // Scenario 1: Empty Agents List with CTA
  test("empty agents list shows create agent CTA", async ({ page }) => {
    await authenticateInBrowser(page, {
      accessToken: human.accessToken,
      refreshToken: human.refreshToken,
    });

    await page.goto(`${WEB_URL}/my-agents`);
    await expect(page.locator("text=My Agents")).toBeVisible({
      timeout: 10_000,
    });

    // Verify create agent button is present
    await expect(page.locator("text=Create Agent")).toBeVisible({
      timeout: 10_000,
    });
  });

  // Scenario 2: Create New Agent via CreateAgentModal
  test("create agent via modal and see API key reveal", async ({ page }) => {
    const getErrors = setupConsoleErrorCollector(page);

    await authenticateInBrowser(page, {
      accessToken: human.accessToken,
      refreshToken: human.refreshToken,
    });

    await page.goto(`${WEB_URL}/my-agents`);
    await expect(page.locator("text=My Agents")).toBeVisible({
      timeout: 10_000,
    });

    // Click create agent
    await page.click("text=Create Agent");

    // Fill modal form
    const uid = uniqueId();
    const username = `e2eagent${uid}`;

    // Fill username (Input component generates id from label)
    const usernameInput = page.locator("#input-username");
    await usernameInput.fill(username);

    // Select at least one specialization
    await page.click("text=Education Access");

    // Submit
    const createButton = page.locator("button").filter({ hasText: "Create Agent" }).last();
    await expect(createButton).toBeEnabled({ timeout: 5_000 });
    await createButton.click();

    // Scenario 3: API Key One-Time Display (ApiKeyReveal)
    // Expect API key reveal panel to appear
    await expect(page.locator("text=Your Agent API Key")).toBeVisible({
      timeout: 15_000,
    });

    // Verify security warning
    await expect(
      page.locator("text=shown only once and cannot be retrieved later"),
    ).toBeVisible({ timeout: 5_000 });

    // Verify copy button and dismiss button
    await expect(page.locator("text=Copy Key")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator("text=I've saved it")).toBeVisible({
      timeout: 5_000,
    });

    const errors = getErrors();
    expect(errors).toHaveLength(0);
  });

  // Setup agent via API for deactivate/reactivate/rotate tests
  test("setup: create agent via API for management tests", async ({
    request,
  }) => {
    agent = await createTestAgent(request, human.accessToken, "mgmt");
  });

  // Scenario 4: Deactivate and Reactivate Agent
  test("deactivate and reactivate agent via API", async ({ request }) => {
    // Deactivate
    const deactivateRes = await request.post(
      `${API_URL}/api/v1/my-agents/${agent.agentId}/deactivate`,
      {
        headers: { Authorization: `Bearer ${human.accessToken}` },
      },
    );
    if (!deactivateRes.ok()) {
      const body = await deactivateRes.text();
      throw new Error(
        `Agent deactivation failed (${deactivateRes.status()}): ${body}`,
      );
    }
    const deactivateJson = await deactivateRes.json();
    expect(deactivateJson.ok).toBe(true);

    // Reactivate
    const reactivateRes = await request.post(
      `${API_URL}/api/v1/my-agents/${agent.agentId}/reactivate`,
      {
        headers: { Authorization: `Bearer ${human.accessToken}` },
      },
    );
    if (!reactivateRes.ok()) {
      const body = await reactivateRes.text();
      throw new Error(
        `Agent reactivation failed (${reactivateRes.status()}): ${body}`,
      );
    }
    const reactivateJson = await reactivateRes.json();
    expect(reactivateJson.ok).toBe(true);
  });

  // Scenario 5: Rotate API Key
  test("rotate agent API key returns new key", async ({ request }) => {
    const res = await request.post(
      `${API_URL}/api/v1/my-agents/${agent.agentId}/rotate-key`,
      {
        headers: { Authorization: `Bearer ${human.accessToken}` },
      },
    );
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`Key rotation failed (${res.status()}): ${body}`);
    }
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data?.apiKey).toBeDefined();

    // New key should be different from old key
    expect(json.data.apiKey).not.toBe(agent.apiKey);
  });

  // Scenario 6: Unauthenticated Access Shows Login CTA
  test("unauthenticated access to /my-agents shows login CTA", async ({
    page,
  }) => {
    // Clear tokens
    await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());

    await page.goto(`${WEB_URL}/my-agents`);

    // Should show login prompt, not agent list
    await expect(
      page
        .locator('a[href="/auth/human/login"]')
        .or(page.locator("text=Sign in"))
        .or(page.locator("text=Log in"))
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
