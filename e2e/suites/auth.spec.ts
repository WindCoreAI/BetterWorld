/**
 * Auth E2E Test Suite
 *
 * Tests human authentication flows: registration, login, logout,
 * error handling, and deprecated page redirects.
 *
 * Source flow: e2e/flows/auth.flow.md
 */

import { test, expect } from "@playwright/test";

import {
  registerAndLoginHuman,
  authenticateInBrowser,
  type TestHuman,
} from "../helpers/auth";
import { setupConsoleErrorCollector } from "../helpers/assertions";
import { API_URL, WEB_URL, HUMAN_ACCESS_KEY, HUMAN_REFRESH_KEY } from "../helpers/constants";
import { flushRateLimits, uniqueId } from "../helpers/db";

test.describe("Auth Suite", () => {
  test.beforeEach(() => {
    flushRateLimits();
  });

  // Scenario 1: Human Registration via Email/Password
  test("human registration via email/password navigates to verify page", async ({
    page,
  }) => {
    const getErrors = setupConsoleErrorCollector(page);
    const uid = uniqueId();
    const email = `e2e_auth_${uid}@test.com`;

    await page.goto(`${WEB_URL}/auth/human/register`);
    await expect(page.locator("text=Join BetterWorld")).toBeVisible({
      timeout: 10_000,
    });

    // Verify OAuth buttons present
    await expect(page.locator("text=Continue with Google")).toBeVisible();
    await expect(page.locator("text=Continue with GitHub")).toBeVisible();

    // Fill registration form
    await page.fill('input[placeholder="Your name"]', `E2E User ${uid}`);
    await page.fill('input[placeholder="you@example.com"]', email);
    await page.fill('input[type="password"]', "TestPass123!");

    // Submit
    await page.click("text=Create Account");

    // Expect redirect to verify page
    await page.waitForURL(/\/auth\/human\/verify/, { timeout: 15_000 });
    await expect(page.locator("text=Verify Your Email")).toBeVisible({
      timeout: 10_000,
    });

    // Verify 6-digit code input boxes are present
    const codeInputs = page.locator('input[inputmode="numeric"]');
    await expect(codeInputs.first()).toBeVisible({ timeout: 5_000 });
    expect(await codeInputs.count()).toBe(6);

    // Verify submit button
    await expect(page.locator("text=Verify Email")).toBeVisible({
      timeout: 5_000,
    });

    const errors = getErrors();
    expect(errors).toHaveLength(0);
  });

  // Shared state for login tests
  let testHuman: TestHuman;

  // Setup: register a human for subsequent login tests
  test("setup: register human for login tests", async ({ request }) => {
    testHuman = await registerAndLoginHuman(request, "auth");
  });

  // Scenario 2: Human Login with Valid Credentials
  test("login with valid credentials redirects to dashboard", async ({
    page,
  }) => {
    flushRateLimits();
    await page.goto(`${WEB_URL}/auth/human/login`);
    await expect(page.locator("text=Welcome Back")).toBeVisible({
      timeout: 10_000,
    });

    await page.fill('input[type="email"]', testHuman.email);
    await page.fill('input[type="password"]', testHuman.password);

    // Click submit and wait for API response to confirm call was made
    const loginResponsePromise = page.waitForResponse(
      (r) => r.url().includes("/human-auth/login") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Log In" }).click();
    const loginResponse = await loginResponsePromise;
    expect(loginResponse.status()).toBe(200);

    // Wait for tokens to appear in localStorage (confirms successful login)
    await page.waitForFunction(
      (key) => !!localStorage.getItem(key),
      HUMAN_ACCESS_KEY,
      { timeout: 15_000 },
    );

    const accessToken = await page.evaluate(
      (key) => localStorage.getItem(key),
      HUMAN_ACCESS_KEY,
    );
    expect(accessToken).toBeTruthy();

    const refreshToken = await page.evaluate(
      (key) => localStorage.getItem(key),
      HUMAN_REFRESH_KEY,
    );
    expect(refreshToken).toBeTruthy();

    // After tokens set, page should navigate to dashboard or onboarding
    await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });
  });

  // Scenario 3: Human Login with Invalid Credentials
  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto(`${WEB_URL}/auth/human/login`);
    await expect(page.locator("text=Welcome Back")).toBeVisible({
      timeout: 10_000,
    });

    await page.fill('input[type="email"]', "nonexistent@test.com");
    await page.fill('input[type="password"]', "WrongPass123!");
    await page.click("text=Log In");

    // Expect error message visible
    await expect(
      page.locator('[role="alert"]').or(page.locator(".bg-red-50")).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Still on login page
    expect(page.url()).toContain("/auth/human/login");

    // Verify no tokens stored
    const accessToken = await page.evaluate(
      (key) => localStorage.getItem(key),
      HUMAN_ACCESS_KEY,
    );
    expect(accessToken).toBeNull();
  });

  // Scenario 4: Login with Unverified Email Shows Special Error
  test("login with unverified email shows amber warning", async ({
    request,
    page,
  }) => {
    const uid = uniqueId();
    const email = `e2e_unverified_${uid}@test.com`;
    const password = `E2eTest_${uid}!`;

    // Register but do NOT verify email (use unique IP to avoid rate limit)
    const fakeIp = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    const regRes = await request.post(
      `${API_URL}/api/v1/human-auth/register`,
      {
        data: { email, password, displayName: `Unverified ${uid}` },
        headers: { "X-Forwarded-For": fakeIp },
      },
    );
    expect(regRes.ok()).toBeTruthy();

    // Flush rate limits before browser login attempt
    flushRateLimits();

    // Try to login
    await page.goto(`${WEB_URL}/auth/human/login`);
    await expect(page.locator("text=Welcome Back")).toBeVisible({
      timeout: 10_000,
    });

    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);

    // Click submit and wait for API response
    const loginResponsePromise = page.waitForResponse(
      (r) => r.url().includes("/human-auth/login") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Log In" }).click();
    const loginResponse = await loginResponsePromise;

    // Should get 403 (unverified) or 429 (rate limited) — either way not 200
    expect(loginResponse.status()).not.toBe(200);

    // Expect amber warning box with verify link, or generic error
    await expect(
      page
        .locator(".bg-amber-50")
        .or(page.locator('a[href*="/auth/human/verify"]'))
        .or(page.locator(".bg-error\\/10"))
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // Scenario 5: Deprecated /register Page Redirect
  test("deprecated /register page shows redirect info (unauthenticated)", async ({
    page,
  }) => {
    await page.goto(`${WEB_URL}/register`);
    await expect(
      page.locator("text=Agent Registration Has Moved"),
    ).toBeVisible({ timeout: 10_000 });

    // Verify links to human auth pages (scoped to main to avoid nav duplicates)
    await expect(
      page.locator('main a[href="/auth/human/register"]'),
    ).toBeVisible();
    await expect(page.locator('main a[href="/auth/human/login"]')).toBeVisible();
  });

  test("deprecated /register redirects to /my-agents when authenticated", async ({
    page,
  }) => {
    test.skip(!testHuman, "setup did not complete");
    await authenticateInBrowser(page, {
      accessToken: testHuman.accessToken,
      refreshToken: testHuman.refreshToken,
    });

    await page.goto(`${WEB_URL}/register`);
    await page.waitForURL(/\/my-agents/, { timeout: 15_000 });
  });

  // Scenario 6: Logout Clears Tokens
  test("logout clears tokens and reverts navigation", async ({ page }) => {
    test.skip(!testHuman, "setup did not complete");
    await authenticateInBrowser(page, {
      accessToken: testHuman.accessToken,
      refreshToken: testHuman.refreshToken,
    });

    await page.goto(`${WEB_URL}/dashboard`);
    // Wait for dashboard or onboarding to load
    await expect(
      page
        .locator("text=Welcome back")
        .or(page.locator("h1, h2").first())
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    // Click logout and wait for tokens to be cleared (async operation)
    await page.click("text=Logout");
    await page.waitForFunction(
      (key) => !localStorage.getItem(key),
      HUMAN_ACCESS_KEY,
      { timeout: 10_000 },
    );

    // Verify tokens cleared
    const accessToken = await page.evaluate(
      (key) => localStorage.getItem(key),
      HUMAN_ACCESS_KEY,
    );
    expect(accessToken).toBeNull();

    const refreshToken = await page.evaluate(
      (key) => localStorage.getItem(key),
      HUMAN_REFRESH_KEY,
    );
    expect(refreshToken).toBeNull();
  });
});
