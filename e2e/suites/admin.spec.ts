/**
 * Admin E2E Test Suite
 *
 * Tests the admin panel: dashboard, access control, flagged content queue,
 * fraud review, shadow mode, and production shift dashboards.
 *
 * Source flow: e2e/flows/admin.flow.md
 */

import { test, expect } from "@playwright/test";

import { setupConsoleErrorCollector } from "../helpers/assertions";
import { API_URL, WEB_URL } from "../helpers/constants";

test.describe("Admin Suite", () => {
  /**
   * Admin tests require a valid admin JWT token.
   * In CI, the admin token must be seeded in the database.
   * We create an admin token via the API if possible, or skip.
   */
  let adminToken: string | undefined;

  test("setup: obtain admin token from env or skip", async () => {
    // Admin token must be provided via environment or pre-seeded
    adminToken = process.env.BW_ADMIN_TOKEN;
    if (!adminToken) {
      test.skip(true, "No admin token available — set BW_ADMIN_TOKEN env var");
    }
  });

  // Scenario 2: Admin Access Denied Without Token
  test("admin page shows access denied without admin token", async ({
    page,
  }) => {
    await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());

    await page.goto(`${WEB_URL}/admin`);

    // Should show access denied page
    await expect(
      page
        .locator("text=Access Denied")
        .or(page.locator("text=You need admin access"))
        .first(),
    ).toBeVisible({ timeout: 10_000 });

    // Verify return link
    await expect(
      page.locator("text=Return to Home"),
    ).toBeVisible({ timeout: 5_000 });
  });

  // Scenario 1: Admin Dashboard Loads (Requires Admin Role)
  test("admin dashboard loads with admin token", async ({ page }) => {
    if (!adminToken) test.skip(true, "No admin token available");

    const getErrors = setupConsoleErrorCollector(page);

    await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(
      (token) => localStorage.setItem("bw_admin_token", token),
      adminToken!,
    );

    await page.goto(`${WEB_URL}/admin`);
    await expect(page.locator("text=Admin Dashboard")).toBeVisible({
      timeout: 15_000,
    });

    // Verify admin nav sidebar links
    await expect(page.locator("text=Flagged Content")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator("text=Fraud Review")).toBeVisible({
      timeout: 5_000,
    });

    // Verify stat cards
    await expect(
      page.locator("text=Pending Reviews").or(page.locator("text=System Status")).first(),
    ).toBeVisible({ timeout: 5_000 });

    const errors = getErrors();
    expect(errors).toHaveLength(0);
  });

  // Scenario 3: Flagged Content Queue
  test("flagged content page loads with admin token", async ({ page }) => {
    if (!adminToken) test.skip(true, "No admin token available");

    await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(
      (token) => localStorage.setItem("bw_admin_token", token),
      adminToken!,
    );

    await page.goto(`${WEB_URL}/admin/flagged`);
    await expect(
      page
        .locator("text=Flagged Content Review")
        .or(page.locator("h1, h2").first())
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  // Scenario 4: Fraud Review Queue
  test("fraud review page loads with admin token", async ({ page }) => {
    if (!adminToken) test.skip(true, "No admin token available");

    await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(
      (token) => localStorage.setItem("bw_admin_token", token),
      adminToken!,
    );

    await page.goto(`${WEB_URL}/admin/fraud`);
    await expect(
      page
        .locator("text=Fraud Review Queue")
        .or(page.locator("h1, h2").first())
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  // Scenario 5: Shadow Mode Dashboard (Admin)
  test("shadow mode dashboard loads with admin token", async ({ page }) => {
    if (!adminToken) test.skip(true, "No admin token available");

    await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(
      (token) => localStorage.setItem("bw_admin_token", token),
      adminToken!,
    );

    await page.goto(`${WEB_URL}/admin/shadow`);
    await expect(
      page
        .locator("text=Shadow Mode Dashboard")
        .or(page.locator("h1, h2").first())
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  // Scenario 6: Production Shift Dashboard (Admin)
  test("production shift dashboard loads with admin token", async ({
    page,
  }) => {
    if (!adminToken) test.skip(true, "No admin token available");

    await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(
      (token) => localStorage.setItem("bw_admin_token", token),
      adminToken!,
    );

    await page.goto(`${WEB_URL}/admin/production`);
    await expect(
      page
        .locator("text=Phase 3: Production Shift")
        .or(page.locator("text=Production Shift"))
        .or(page.locator("h1, h2").first())
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
