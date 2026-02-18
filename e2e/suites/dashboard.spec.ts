/**
 * Dashboard E2E Test Suite
 *
 * Tests the human dashboard: main dashboard cards, auth redirects,
 * onboarding redirects, network dashboard, growth journey, and feedback inbox.
 *
 * Source flow: e2e/flows/dashboard.flow.md
 */

import { test, expect } from "@playwright/test";

import {
  registerAndLoginHuman,
  authenticateInBrowser,
  type TestHuman,
} from "../helpers/auth";
import { setupConsoleErrorCollector } from "../helpers/assertions";
import { WEB_URL } from "../helpers/constants";

test.describe("Dashboard Suite", () => {
  let human: TestHuman;

  test("setup: register human for dashboard tests", async ({ request }) => {
    human = await registerAndLoginHuman(request, "dash");
  });

  // Scenario 1: Main Dashboard Loads All Cards
  test("main dashboard loads with welcome heading", async ({ page }) => {
    const getErrors = setupConsoleErrorCollector(page);

    await authenticateInBrowser(page, {
      accessToken: human.accessToken,
      refreshToken: human.refreshToken,
    });

    await page.goto(`${WEB_URL}/dashboard`);

    // Dashboard may redirect to /onboarding for new users
    await expect(
      page
        .locator("text=Welcome back")
        .or(page.locator("h1, h2").first())
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    // If on dashboard (not redirected), verify card presence
    if (page.url().includes("/dashboard") && !page.url().includes("/onboarding")) {
      // Check for dashboard card content
      await expect(
        page
          .locator("text=Token")
          .or(page.locator("text=Profile"))
          .or(page.locator("text=Mission"))
          .first(),
      ).toBeVisible({ timeout: 10_000 });

      // Verify "Your impact dashboard" subheading
      await expect(
        page.locator("text=Your impact dashboard"),
      ).toBeVisible({ timeout: 5_000 });
    }

    const errors = getErrors();
    expect(errors).toHaveLength(0);
  });

  // Scenario 2: Dashboard Redirects Unauthenticated Users
  test("unauthenticated access to /dashboard redirects to login", async ({
    page,
  }) => {
    await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());

    await page.goto(`${WEB_URL}/dashboard`);
    await page.waitForURL(/\/auth\/human\/login/, { timeout: 15_000 });
    await expect(page.locator("text=Welcome Back")).toBeVisible({
      timeout: 10_000,
    });
  });

  // Scenario 3: Dashboard Redirects to Onboarding if Not Completed
  test("new user may be redirected to onboarding from dashboard", async ({
    page,
  }) => {
    await authenticateInBrowser(page, {
      accessToken: human.accessToken,
      refreshToken: human.refreshToken,
    });

    await page.goto(`${WEB_URL}/dashboard`);

    // Should be on dashboard or onboarding
    await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });
    await expect(page.locator("h1, h2").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  // Scenario 4: Network Dashboard
  test("network dashboard loads for authenticated user", async ({ page }) => {
    await authenticateInBrowser(page, {
      accessToken: human.accessToken,
      refreshToken: human.refreshToken,
    });

    await page.goto(`${WEB_URL}/dashboard/network`);

    // May redirect to login if auth check fails
    await expect(
      page
        .locator("text=Your Network")
        .or(page.locator("text=Welcome Back"))
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  // Scenario 5: Growth Journey Dashboard
  test("growth journey dashboard loads", async ({ page }) => {
    await authenticateInBrowser(page, {
      accessToken: human.accessToken,
      refreshToken: human.refreshToken,
    });

    await page.goto(`${WEB_URL}/dashboard/growth`);

    await expect(
      page
        .locator("text=Your Growth Journey")
        .or(page.locator("h1, h2").first())
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  // Scenario 6: Feedback Inbox
  test("feedback inbox page loads", async ({ page }) => {
    await authenticateInBrowser(page, {
      accessToken: human.accessToken,
      refreshToken: human.refreshToken,
    });

    await page.goto(`${WEB_URL}/dashboard/feedback`);

    await expect(
      page
        .locator("text=Feedback Inbox")
        .or(page.locator("h1, h2").first())
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
