/**
 * Navigation E2E Test Suite
 *
 * Tests all public page loads, auth redirects, navigation dropdown groups,
 * admin nav hidden, mobile responsive, 404 page, and landing page content.
 *
 * Source flow: e2e/flows/navigation.flow.md
 */

import { test, expect } from "@playwright/test";

import {
  registerAndLoginHuman,
  authenticateInBrowser,
  type TestHuman,
} from "../helpers/auth";
import {
  assertPageLoads,
  setupConsoleErrorCollector,
} from "../helpers/assertions";
import { WEB_URL } from "../helpers/constants";
import { uniqueId } from "../helpers/db";

test.describe("Navigation Suite", () => {
  // Scenario 1: All Public Pages Load Without Errors
  const publicPages: Array<{ path: string; expectedText: string }> = [
    { path: "/", expectedText: "Build a Better World" },
    { path: "/problems", expectedText: "Problems" },
    { path: "/solutions", expectedText: "Solutions" },
    { path: "/activity", expectedText: "Activity Feed" },
    { path: "/domains", expectedText: "Domain Communities" },
    { path: "/city", expectedText: "City Dashboards" },
    { path: "/leaderboards", expectedText: "Leaderboards" },
    { path: "/impact", expectedText: "Impact Dashboard" },
    { path: "/discussions", expectedText: "Discussion Spaces" },
    { path: "/discover", expectedText: "Discover People" },
    { path: "/governance", expectedText: "Governance Dashboard" },
    { path: "/learning", expectedText: "Learning Pathways" },
    { path: "/case-studies", expectedText: "Case Study Library" },
    { path: "/docs/connect", expectedText: "Connect Your Agent" },
    { path: "/login", expectedText: "Welcome Back" },
    { path: "/register", expectedText: "Agent Registration Has Moved" },
    { path: "/auth/human/login", expectedText: "Welcome Back" },
    { path: "/auth/human/register", expectedText: "Join BetterWorld" },
  ];

  for (const { path, expectedText } of publicPages) {
    test(`public page loads: ${path}`, async ({ page }) => {
      const getErrors = setupConsoleErrorCollector(page);
      await assertPageLoads(page, path, expectedText);
      const errors = getErrors();
      expect(errors).toHaveLength(0);
    });
  }

  // Scenario 2: Authenticated Pages Redirect When Not Authenticated
  // Pages with explicit useEffect auth redirect
  const strictRedirectPages = [
    "/dashboard",
    "/onboarding",
    "/notifications",
    "/dashboard/network",
    "/auth/human/profile",
  ];

  for (const path of strictRedirectPages) {
    test(`protected page redirects to login: ${path}`, async ({ page }) => {
      await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => localStorage.clear());

      await page.goto(`${WEB_URL}${path}`);
      await page.waitForURL(/\/auth\/human\/login/, { timeout: 15_000 });
      await expect(page.locator("text=Welcome Back")).toBeVisible({
        timeout: 10_000,
      });
    });
  }

  // Pages without explicit auth guard — render page content or redirect
  const softProtectedPages = ["/dashboard/growth", "/dashboard/feedback"];

  for (const path of softProtectedPages) {
    test(`protected page loads or redirects: ${path}`, async ({ page }) => {
      await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => localStorage.clear());

      await page.goto(`${WEB_URL}${path}`);
      await expect(
        page
          .locator("text=Welcome Back")
          .or(page.locator("h1, h2").first())
          .first(),
      ).toBeVisible({ timeout: 15_000 });
    });
  }

  // /my-agents shows login CTA instead of hard redirect
  test("unauthenticated /my-agents shows login CTA", async ({ page }) => {
    await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());

    await page.goto(`${WEB_URL}/my-agents`);
    await expect(
      page
        .locator('a[href="/auth/human/login"]')
        .or(page.locator("text=Sign in"))
        .or(page.locator("text=Log in"))
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // Scenario 3: Navigation Dropdown Groups (Desktop — unauthenticated)
  test("navigation shows dropdown groups and auth buttons", async ({
    page,
  }) => {
    await page.goto(WEB_URL);
    await expect(page.locator("h1, h2").first()).toBeVisible({
      timeout: 15_000,
    });

    // Verify dropdown group triggers (scoped to nav to avoid landing page duplicates)
    await expect(page.locator("nav button:has-text('Explore')")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("nav button:has-text('Community')")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("nav button:has-text('My Journey')")).toBeVisible({
      timeout: 10_000,
    });

    // Verify auth section shows Login and Join (scoped to nav to avoid hero duplicates)
    await expect(
      page.locator('nav a[href="/auth/human/login"]'),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('nav a[href="/auth/human/register"]'),
    ).toBeVisible({ timeout: 10_000 });
  });

  // Scenario 3 cont: Authenticated navigation
  let human: TestHuman;

  test("setup: register human for nav auth tests", async ({ request }) => {
    human = await registerAndLoginHuman(request, "nav");
  });

  test("authenticated navigation shows dashboard link and logout", async ({
    page,
  }) => {
    await authenticateInBrowser(page, {
      accessToken: human.accessToken,
      refreshToken: human.refreshToken,
    });

    await page.goto(WEB_URL);
    await expect(page.locator("h1, h2").first()).toBeVisible({
      timeout: 15_000,
    });

    // Verify authenticated nav elements
    await expect(page.locator('a[href="/dashboard"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("text=Logout")).toBeVisible({
      timeout: 10_000,
    });
  });

  // Scenario 4: Admin Nav Hidden (Navigation renders null on /admin)
  test("admin page does not show main site navigation", async ({ page }) => {
    await page.goto(`${WEB_URL}/admin`);
    await expect(page.locator("h1, h2").first()).toBeVisible({
      timeout: 15_000,
    });

    // Main nav should NOT be visible — Navigation renders null on /admin
    // Instead, admin has its own layout with admin-specific links
    await expect(page.locator("text=Access Denied").or(page.locator("text=Admin Dashboard")).first()).toBeVisible({
      timeout: 10_000,
    });

    // Verify main site nav groups are NOT present
    const exploreNav = page.locator("nav >> text=Explore");
    expect(await exploreNav.count()).toBe(0);
  });

  // Scenario 5: Mobile Responsive Navigation
  test("mobile viewport shows hamburger menu", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto(WEB_URL);
    await expect(page.locator("text=Build a Better World")).toBeVisible({
      timeout: 15_000,
    });

    // Hamburger button should be visible on mobile
    const hamburger = page.locator('button[aria-label="Open menu"]');
    await expect(hamburger).toBeVisible({ timeout: 5_000 });

    // Desktop nav groups should be hidden
    // Click hamburger to open mobile menu
    await hamburger.click();

    // Mobile menu should show nav groups (use getByRole to avoid strict mode on "Explore")
    await expect(page.getByRole("button", { name: "Explore" })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: "Community" })).toBeVisible({ timeout: 5_000 });
  });

  // Scenario 6: 404 Not Found Page
  test("non-existent route shows 404 page", async ({ page }) => {
    const uid = uniqueId();
    await page.goto(`${WEB_URL}/this-page-does-not-exist-${uid}`);

    await expect(
      page
        .locator("text=Page not found")
        .or(page.locator("text=404"))
        .first(),
    ).toBeVisible({ timeout: 10_000 });

    // Verify navigation links present on 404 page
    await expect(
      page
        .locator("text=Go to Dashboard")
        .or(page.locator("text=Go home"))
        .first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  // Scenario 7: Landing Page Full Content
  test("landing page renders all major sections", async ({ page }) => {
    const getErrors = setupConsoleErrorCollector(page);

    await page.goto(WEB_URL);
    await expect(page.locator("text=Build a Better World")).toBeVisible({
      timeout: 15_000,
    });

    // Verify CTA buttons
    await expect(page.locator("text=Join as Human")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("text=Explore Problems")).toBeVisible({
      timeout: 10_000,
    });

    // Verify key sections
    await expect(page.locator("text=Why BetterWorld")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("text=How It Works")).toBeVisible({
      timeout: 10_000,
    });

    const errors = getErrors();
    expect(errors).toHaveLength(0);
  });
});
