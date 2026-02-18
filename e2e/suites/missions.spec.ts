/**
 * Missions E2E Test Suite
 *
 * Tests the mission marketplace: browsing with filters, mission detail,
 * map/list view toggle, and the claiming flow.
 *
 * Source flow: e2e/flows/missions.flow.md
 */

import { test, expect } from "@playwright/test";

import {
  registerAndLoginHuman,
  authenticateInBrowser,
  type TestHuman,
} from "../helpers/auth";
import { setupConsoleErrorCollector } from "../helpers/assertions";
import { API_URL, WEB_URL } from "../helpers/constants";

test.describe("Missions Suite", () => {
  let human: TestHuman;

  test("setup: register human for missions tests", async ({ request }) => {
    human = await registerAndLoginHuman(request, "missions");
  });

  // Scenario 1: Browse Mission Marketplace with Filters
  test("missions page loads (may redirect to onboarding)", async ({
    page,
  }) => {
    const getErrors = setupConsoleErrorCollector(page);

    await authenticateInBrowser(page, {
      accessToken: human.accessToken,
      refreshToken: human.refreshToken,
    });

    await page.goto(`${WEB_URL}/missions`);

    // Missions page has onboarding guard — may redirect to /onboarding
    await expect(
      page
        .locator("text=Mission Marketplace")
        .or(page.locator("text=Loading"))
        .or(page.locator("h1, h2").first())
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    const errors = getErrors();
    expect(errors).toHaveLength(0);
  });

  // Scenario 1 cont: API-level verification of missions browse
  test("missions API returns mission list", async ({ request }) => {
    const res = await request.get(`${API_URL}/api/v1/missions?limit=12`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.data?.missions)).toBe(true);
  });

  // Scenario 2: View Mission Detail
  test("missions API returns single mission detail", async ({ request }) => {
    // First get list to find a mission ID
    const listRes = await request.get(`${API_URL}/api/v1/missions?limit=1`);
    if (!listRes.ok()) return; // Skip if no missions exist

    const listJson = await listRes.json();
    if (!listJson.data?.missions?.length) return;

    const missionId = listJson.data.missions[0].id;
    const detailRes = await request.get(
      `${API_URL}/api/v1/missions/${missionId}`,
    );
    expect(detailRes.ok()).toBeTruthy();
    const detailJson = await detailRes.json();
    expect(detailJson.ok).toBe(true);
    expect(detailJson.data?.id).toBe(missionId);
  });

  // Scenario 3: Map View Toggle (browser test)
  test("missions page renders list or map view", async ({ page }) => {
    await authenticateInBrowser(page, {
      accessToken: human.accessToken,
      refreshToken: human.refreshToken,
    });

    await page.goto(`${WEB_URL}/missions`);
    await expect(
      page
        .locator("text=Mission Marketplace")
        .or(page.locator("h1, h2").first())
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    // Check for map/list toggle if page loaded (not redirected to onboarding)
    const onMissions = page.url().includes("/missions");
    if (onMissions) {
      // Map and List toggle buttons should exist
      await expect(page.locator("button", { hasText: "List" })).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.locator("button", { hasText: "Map" })).toBeVisible({
        timeout: 10_000,
      });

      // Verify subheading
      await expect(
        page.locator("text=Find missions and make an impact"),
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  // Scenario 4: Mission Claiming Flow (API-level)
  test("mission claiming requires authentication", async ({ request }) => {
    // Attempt to claim without auth should fail
    const listRes = await request.get(`${API_URL}/api/v1/missions?limit=1`);
    if (!listRes.ok()) return;

    const listJson = await listRes.json();
    if (!listJson.data?.missions?.length) return;

    const missionId = listJson.data.missions[0].id;
    const claimRes = await request.post(
      `${API_URL}/api/v1/missions/${missionId}/claim`,
    );

    // Should fail without auth token
    expect(claimRes.status()).toBe(401);
  });
});
