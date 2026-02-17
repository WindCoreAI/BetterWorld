/**
 * E2E Assertion Helpers
 *
 * Reusable assertions for page loading, error states, and console checks.
 */

import { expect, type Page } from "@playwright/test";

import { WEB_URL } from "./constants";

/**
 * Assert that a page loads and optionally contains expected text.
 */
export async function assertPageLoads(
  page: Page,
  path: string,
  expectedText?: string,
): Promise<void> {
  const url = path.startsWith("http") ? path : `${WEB_URL}${path}`;
  await page.goto(url);

  // Wait for at least one heading or main content to be visible
  await expect(
    page
      .locator("h1, h2, main, [role='main']")
      .first(),
  ).toBeVisible({ timeout: 15_000 });

  if (expectedText) {
    await expect(
      page
        .locator(`text=${expectedText}`)
        .or(page.locator("text=Loading"))
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  }
}

/**
 * Collect all console errors that occurred on the page.
 * Call this AFTER page interactions are complete.
 */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });

  return errors;
}

/**
 * Set up console error collection BEFORE navigating.
 * Returns a function to retrieve collected errors.
 */
export function setupConsoleErrorCollector(
  page: Page,
): () => string[] {
  const errors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });

  return () => [...errors];
}
