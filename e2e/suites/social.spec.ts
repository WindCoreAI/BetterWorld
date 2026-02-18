/**
 * Social E2E Test Suite
 *
 * Tests discussion spaces, thread creation, notifications,
 * and people discovery features.
 *
 * Source flow: e2e/flows/social.flow.md
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
import { API_URL, WEB_URL } from "../helpers/constants";
import { uniqueId } from "../helpers/db";

test.describe("Social Suite", () => {
  let human: TestHuman;

  test("setup: register human for social tests", async ({ request }) => {
    human = await registerAndLoginHuman(request, "social");
  });

  // Scenario 1: View Discussion Spaces Index
  test("discussion spaces page loads with domain and city sections", async ({
    page,
  }) => {
    const getErrors = setupConsoleErrorCollector(page);

    await assertPageLoads(page, "/discussions", "Discussion Spaces");

    // Verify domain discussions section
    await expect(page.locator("text=Domain Discussions")).toBeVisible({
      timeout: 10_000,
    });

    // Verify city discussions section
    await expect(page.locator("text=City Discussions")).toBeVisible({
      timeout: 10_000,
    });

    const errors = getErrors();
    expect(errors).toHaveLength(0);
  });

  // Scenario 2: View Discussion Board (Domain)
  test("domain discussion board loads with heading", async ({ page }) => {
    await page.goto(`${WEB_URL}/discussions/domain/education_access`);
    await expect(page.locator("h1, h2").first()).toBeVisible({
      timeout: 15_000,
    });

    // Verify it's a discussion board page (not a redirect)
    expect(page.url()).toContain("/discussions/domain/education_access");
  });

  // Scenario 3: Create Discussion Thread (Authenticated)
  test("create discussion thread via API", async ({ request }) => {
    const uid = uniqueId();
    const res = await request.post(
      `${API_URL}/api/v1/discussions/threads`,
      {
        headers: {
          Authorization: `Bearer ${human.accessToken}`,
          "Content-Type": "application/json",
        },
        data: {
          scopeType: "domain",
          scopeValue: "education_access",
          title: `E2E Test Discussion ${uid}`,
          content:
            "This is an E2E test discussion thread with enough content to pass validation.",
        },
      },
    );
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`Thread creation failed (${res.status()}): ${body}`);
    }
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data?.id).toBeDefined();
  });

  // Scenario 4: Thread list via API
  test("discussion threads API returns thread list", async ({ request }) => {
    test.skip(!human, "setup did not complete");
    const res = await request.get(
      `${API_URL}/api/v1/discussions/threads?scopeType=domain&scopeValue=education_access`,
      {
        headers: { Authorization: `Bearer ${human.accessToken}` },
      },
    );
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBe(true);
    // API returns data as a direct array, not nested under a "threads" key
    expect(Array.isArray(json.data)).toBe(true);
  });

  // Scenario 5: Notification Bell and Center
  test("notifications page loads for authenticated user", async ({ page }) => {
    test.skip(!human, "setup did not complete");
    await authenticateInBrowser(page, {
      accessToken: human.accessToken,
      refreshToken: human.refreshToken,
    });

    await page.goto(`${WEB_URL}/notifications`);
    await expect(
      page
        .locator("text=Notifications")
        .or(page.locator("h1, h2").first())
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("notifications API returns unread count", async ({ request }) => {
    test.skip(!human, "setup did not complete");
    const res = await request.get(
      `${API_URL}/api/v1/notifications/unread-count`,
      {
        headers: { Authorization: `Bearer ${human.accessToken}` },
      },
    );
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(typeof json.data?.unreadCount).toBe("number");
  });

  // Scenario 6: People Discovery
  test("discover people page loads", async ({ page }) => {
    await assertPageLoads(page, "/discover", "Discover People");
  });
});
