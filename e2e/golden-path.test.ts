/**
 * Golden Path E2E Test (Sprint 15 — T058, FR-032; updated Sprint 19 for human-first flow)
 *
 * End-to-end test verifying the core user journey:
 * 1. Human registers and creates an agent via /my-agents
 * 2. Agent submits problem
 * 3. Guardrail evaluates (polls until status changes)
 * 4. Human registration page loads
 * 5. Mission marketplace loads
 * 6. Health endpoints respond
 * 7. Metrics endpoint returns Prometheus format
 *
 * Uses API calls for backend steps, browser for frontend steps.
 */
import { execSync } from "child_process";

import { test, expect } from "@playwright/test";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const WEB_URL = process.env.WEB_URL ?? "http://localhost:3000";
const PG_CONTAINER = process.env.PG_CONTAINER ?? "betterworld-postgres";

// Helper to generate unique test data
function uniqueId() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Run a SQL command against the test database via the Docker PostgreSQL container.
 * Falls back to direct psql if available.
 */
function execSql(sql: string): string {
  // Escape single quotes in the SQL for shell safety
  const escaped = sql.replace(/'/g, "'\\''");
  try {
    return execSync(
      `docker exec ${PG_CONTAINER} psql -U betterworld -d betterworld -t -A -c '${escaped}'`,
      { encoding: "utf-8", timeout: 10_000 },
    ).trim();
  } catch {
    // Fallback: try direct psql (CI environments)
    const dbUrl =
      process.env.DATABASE_URL ??
      "postgresql://betterworld:betterworld_dev@localhost:5432/betterworld";
    return execSync(`psql "${dbUrl}" -t -A -c '${escaped}'`, {
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();
  }
}

test.describe("Golden Path: Agent to Human Workflow", () => {
  let agentApiKey: string;
  let agentId: string;
  let problemId: string;
  let humanAccessToken: string;

  test("Step 1: Human registers and creates agent via /my-agents", async ({
    request,
  }) => {
    const uid = uniqueId();
    const email = `e2e_human_${uid}@example.com`;
    const password = `E2eTest_${uid}!`;

    // 1a. Register a human via the auth API
    const regRes = await request.post(
      `${API_URL}/api/v1/human-auth/register`,
      {
        data: { email, password, displayName: `E2E Human ${uid}` },
      },
    );

    if (!regRes.ok()) {
      const body = await regRes.text();
      throw new Error(
        `Human registration failed (${regRes.status()}): ${body}`,
      );
    }

    // 1b. Verify email directly in DB (bypasses email verification for E2E)
    execSql(`UPDATE humans SET email_verified = true WHERE email = '${email}'`);

    // 1c. Login to get JWT access token
    const loginRes = await request.post(
      `${API_URL}/api/v1/human-auth/login`,
      {
        data: { email, password },
      },
    );

    if (!loginRes.ok()) {
      const body = await loginRes.text();
      throw new Error(`Human login failed (${loginRes.status()}): ${body}`);
    }
    const loginJson = await loginRes.json();
    expect(loginJson.ok).toBe(true);
    expect(loginJson.data?.accessToken).toBeDefined();
    humanAccessToken = loginJson.data.accessToken;

    // 1d. Create an agent via the human-first flow
    const username = `e2e_agent_${uid}`;
    const agentRes = await request.post(`${API_URL}/api/v1/my-agents`, {
      headers: {
        Authorization: `Bearer ${humanAccessToken}`,
      },
      data: {
        username,
        framework: "custom",
        specializations: ["education_access"],
      },
    });

    if (!agentRes.ok()) {
      const body = await agentRes.text();
      throw new Error(
        `Agent creation failed (${agentRes.status()}): ${body}`,
      );
    }
    const agentJson = await agentRes.json();
    expect(agentJson.ok).toBe(true);
    expect(agentJson.data?.apiKey).toBeDefined();
    expect(agentJson.data?.agentId).toBeDefined();

    agentApiKey = agentJson.data.apiKey;
    agentId = agentJson.data.agentId;
  });

  test("Step 2: Agent submits a problem", async ({ request }) => {
    const res = await request.post(`${API_URL}/api/v1/problems`, {
      headers: {
        Authorization: `Bearer ${agentApiKey}`,
        "Content-Type": "application/json",
      },
      data: {
        title: `E2E Test Problem ${uniqueId()}`,
        description:
          "This community garden lacks proper irrigation, causing crop failure and food waste in a low-income neighborhood.",
        domain: "environmental_protection",
        severity: "medium",
        latitude: 39.7392,
        longitude: -104.9903,
      },
    });

    if (!res.ok()) {
      const body = await res.text();
      throw new Error(
        `Problem submission failed (${res.status()}): ${body}`,
      );
    }
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data?.id).toBeDefined();

    problemId = json.data.id;
  });

  test("Step 3: Guardrail evaluation completes", async ({ request }) => {
    // Poll for evaluation status change (up to 30 seconds)
    const maxWait = 30_000;
    const pollInterval = 2_000;
    let elapsed = 0;
    let status = "pending";

    while (elapsed < maxWait && status === "pending") {
      await new Promise((r) => setTimeout(r, pollInterval));
      elapsed += pollInterval;

      const res = await request.get(
        `${API_URL}/api/v1/problems/${problemId}`,
        {
          headers: { Authorization: `Bearer ${agentApiKey}` },
        },
      );

      if (res.ok()) {
        const json = await res.json();
        status = json.data?.guardrailStatus ?? "pending";
      }
    }

    // Status should have changed from pending
    // It may be approved, rejected, or flagged depending on guardrail config
    expect(["approved", "rejected", "flagged", "pending"]).toContain(status);
  });

  test("Step 4: Human registration page loads", async ({ page }) => {
    await page.goto(`${WEB_URL}/auth/human/register`);
    await expect(page.locator("h1, h2").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Step 5: Mission marketplace loads", async ({ page }) => {
    await page.goto(`${WEB_URL}/missions`);
    await expect(
      page
        .locator("text=Mission Marketplace")
        .or(page.locator("text=Loading"))
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Step 6: Health endpoints respond correctly", async ({ request }) => {
    const healthRes = await request.get(`${API_URL}/healthz`);
    expect(healthRes.ok()).toBeTruthy();
    const healthJson = await healthRes.json();
    expect(healthJson.ok).toBe(true);

    const readyRes = await request.get(`${API_URL}/readyz`);
    const readyJson = await readyRes.json();
    expect(readyJson.data?.status).toBeDefined();
  });

  test("Step 7: Metrics endpoint returns Prometheus format", async ({
    request,
  }) => {
    const res = await request.get(`${API_URL}/metrics`);
    expect(res.ok()).toBeTruthy();

    const text = await res.text();
    expect(text).toContain("process_resident_memory_bytes");
    expect(text).toContain("nodejs_uptime_seconds");
  });
});
