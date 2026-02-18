/**
 * Onboarding E2E Test Suite
 *
 * Tests the 5-step orientation wizard, onboarding guard redirects,
 * and profile creation flow.
 *
 * Source flow: e2e/flows/onboarding.flow.md
 */

import { test, expect } from "@playwright/test";

import {
  registerAndLoginHuman,
  authenticateInBrowser,
  type TestHuman,
} from "../helpers/auth";
import { setupConsoleErrorCollector } from "../helpers/assertions";
import { API_URL, WEB_URL } from "../helpers/constants";

test.describe("Onboarding Suite", () => {
  let human: TestHuman;

  test("setup: register human for onboarding tests", async ({ request }) => {
    human = await registerAndLoginHuman(request, "onboard");
  });

  // Scenario 1: Orientation Wizard Completion (5 Steps)
  test("complete 5-step orientation wizard and claim tokens", async ({
    page,
  }) => {
    const getErrors = setupConsoleErrorCollector(page);

    await authenticateInBrowser(page, {
      accessToken: human.accessToken,
      refreshToken: human.refreshToken,
    });

    await page.goto(`${WEB_URL}/onboarding`);

    // Wait for onboarding page to load
    await expect(page.locator("h1, h2").first()).toBeVisible({
      timeout: 15_000,
    });

    // Step 1: Constitution — click "Next: Explore Domains"
    const step1Next = page.locator("button", { hasText: "Next:" }).first();
    await expect(step1Next).toBeVisible({ timeout: 10_000 });
    await step1Next.click();
    await page.waitForTimeout(500);

    // Step 2: Domains — click "Next: How Missions Work"
    const step2Next = page.locator("button", { hasText: "Next:" }).first();
    await expect(step2Next).toBeVisible({ timeout: 10_000 });
    await step2Next.click();
    await page.waitForTimeout(500);

    // Step 3: Missions — click "Next: Evidence Standards"
    const step3Next = page.locator("button", { hasText: "Next:" }).first();
    await expect(step3Next).toBeVisible({ timeout: 10_000 });
    await step3Next.click();
    await page.waitForTimeout(500);

    // Step 4: Evidence — click "Next: ImpactTokens"
    const step4Next = page.locator("button", { hasText: "Next:" }).first();
    await expect(step4Next).toBeVisible({ timeout: 10_000 });
    await step4Next.click();
    await page.waitForTimeout(500);

    // Step 5: Tokens — click "Claim 10 ImpactTokens"
    const claimButton = page.locator("text=Claim 10 ImpactTokens");
    await expect(claimButton).toBeVisible({ timeout: 10_000 });
    await claimButton.click();

    // Expect redirect to dashboard after completion
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    const errors = getErrors();
    expect(errors).toHaveLength(0);
  });

  // Scenario 2: Onboarding Guard Redirects Unauthenticated Users
  test("unauthenticated access to /onboarding redirects to login", async ({
    page,
  }) => {
    // Clear tokens
    await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());

    await page.goto(`${WEB_URL}/onboarding`);
    await page.waitForURL(/\/auth\/human\/login/, { timeout: 15_000 });
    await expect(page.locator("text=Welcome Back")).toBeVisible({
      timeout: 10_000,
    });
  });

  // Scenario 3: Profile Creation
  test("profile creation page loads with form elements", async ({ page }) => {
    await authenticateInBrowser(page, {
      accessToken: human.accessToken,
      refreshToken: human.refreshToken,
    });

    await page.goto(`${WEB_URL}/auth/human/profile`);

    // Wait for profile page to load
    await expect(
      page
        .locator("text=Complete Your Profile")
        .or(page.locator("text=Edit Your Profile"))
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    // Verify key form elements are present
    // Bio textarea
    await expect(page.locator("textarea")).toBeVisible({ timeout: 5_000 });

    // Language toggle buttons (e.g., English)
    await expect(page.locator("text=English")).toBeVisible({ timeout: 5_000 });

    // Save/Create button
    await expect(
      page
        .locator("text=Create Profile")
        .or(page.locator("text=Save"))
        .first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  // Verify token balance after orientation via API
  test("orientation reward API grants 10 tokens", async ({ request }) => {
    const res = await request.get(`${API_URL}/api/v1/tokens/balance`, {
      headers: { Authorization: `Bearer ${human.accessToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBe(true);
    // Token balance should be >= 10 after orientation reward
    expect(json.data?.balance).toBeGreaterThanOrEqual(10);
  });
});
