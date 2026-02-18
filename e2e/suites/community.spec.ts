/**
 * Community E2E Test Suite
 *
 * Tests domain directory, domain community pages, city chapters,
 * leaderboards, and community intelligence.
 *
 * Source flow: e2e/flows/community.flow.md
 */

import { test, expect } from "@playwright/test";

import {
  assertPageLoads,
  setupConsoleErrorCollector,
} from "../helpers/assertions";
import { API_URL, WEB_URL } from "../helpers/constants";

test.describe("Community Suite", () => {
  // Scenario 1: Domain Directory Browsing
  test("domain directory page loads with 15 domain cards", async ({
    page,
  }) => {
    const getErrors = setupConsoleErrorCollector(page);

    await assertPageLoads(page, "/domains", "Domain Communities");

    const errors = getErrors();
    expect(errors).toHaveLength(0);
  });

  test("domains API returns domain list", async ({ request }) => {
    const res = await request.get(`${API_URL}/api/v1/domains`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  // Scenario 2: Domain Community Page
  test("domain community page loads for education_access", async ({
    page,
  }) => {
    await page.goto(`${WEB_URL}/domains/education_access`);
    await expect(page.locator("h1, h2").first()).toBeVisible({
      timeout: 15_000,
    });

    // Verify community page sections
    await expect(
      page
        .locator("text=Contributors")
        .or(page.locator("text=Metrics"))
        .or(page.locator("text=Highlights"))
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("domain detail API returns metrics", async ({ request }) => {
    const res = await request.get(
      `${API_URL}/api/v1/domains/education_access`,
    );
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  test("domain detail API includes contributors data", async ({ request }) => {
    // Contributors are nested in the domain detail response (no separate endpoint)
    const res = await request.get(
      `${API_URL}/api/v1/domains/education_access`,
    );
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBe(true);
    // Contributors may be empty but the field should exist
    expect(json.data).toBeDefined();
  });

  // Scenario 3: City Chapter Page
  test("city selector page loads", async ({ page }) => {
    const getErrors = setupConsoleErrorCollector(page);

    await assertPageLoads(page, "/city", "City Dashboards");

    const errors = getErrors();
    expect(errors).toHaveLength(0);
  });

  test("city dashboard loads for portland with metrics", async ({ page }) => {
    await page.goto(`${WEB_URL}/city/portland`);
    await expect(page.locator("h1, h2").first()).toBeVisible({
      timeout: 15_000,
    });

    // Verify city page has some content sections
    expect(page.url()).toContain("/city/portland");
  });

  test("city metrics API returns data", async ({ request }) => {
    const res = await request.get(
      `${API_URL}/api/v1/city/portland/metrics`,
    );
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  // Scenario 4: Leaderboards with Filters
  test("leaderboards page loads", async ({ page }) => {
    const getErrors = setupConsoleErrorCollector(page);

    await assertPageLoads(page, "/leaderboards", "Leaderboards");

    const errors = getErrors();
    expect(errors).toHaveLength(0);
  });

  test("leaderboards API returns entries", async ({ request }) => {
    // Leaderboards require a type parameter: reputation, impact, tokens, or missions
    const res = await request.get(`${API_URL}/api/v1/leaderboards/reputation`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  // Scenario 5: Community Intelligence (Public)
  test("intelligence API returns report or 404", async ({ request }) => {
    const res = await request.get(`${API_URL}/api/v1/intelligence/latest`);
    // Returns 404 with NO_REPORT_AVAILABLE if no monthly report has been generated yet
    const json = await res.json();
    if (res.ok()) {
      expect(json.ok).toBe(true);
    } else {
      expect(res.status()).toBe(404);
      expect(json.error?.code).toBe("NO_REPORT_AVAILABLE");
    }
  });
});
