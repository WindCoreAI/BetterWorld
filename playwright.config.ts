/**
 * Playwright Configuration (Sprint 15 — T059)
 *
 * E2E test configuration for golden-path and other browser tests.
 */
import { defineConfig, devices } from "@playwright/test";

const API_PORT = process.env.API_PORT ?? "4000";
const WEB_PORT = process.env.WEB_PORT ?? "3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // Run tests sequentially for golden-path
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 60_000,

  reporter: process.env.CI ? "github" : "html",

  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: [
    {
      command: "pnpm --filter @betterworld/api dev",
      port: Number(API_PORT),
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "pnpm --filter @betterworld/web dev",
      port: Number(WEB_PORT),
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
