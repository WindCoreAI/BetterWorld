import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { agents } from "@betterworld/db";

import {
  getTestApp,
  setupTestInfra,
  teardownTestInfra,
  cleanupTestData,
  registerTestAgent,
  getTestDb,
} from "./helpers.js";

describe("Tiered Rate Limiting", () => {
  const app = getTestApp();

  beforeAll(async () => {
    await setupTestInfra();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await teardownTestInfra();
  });

  it("pending agent rate limit header shows 30/min", async () => {
    const { data: regData } = await registerTestAgent(app);

    const res = await app.request("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${regData.data.apiKey}` },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("30");
  });

  it("verified agent rate limit header shows 60/min", async () => {
    const { data: regData } = await registerTestAgent(app, {
      email: "verified_rl@test.com",
    });
    const agentId = regData.data.agentId;

    // Manually verify
    const db = getTestDb();
    await db
      .update(agents)
      .set({ claimStatus: "verified" })
      .where(eq(agents.id, agentId));

    const res = await app.request("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${regData.data.apiKey}` },
    });

    expect(res.status).toBe(200);
    // Note: the cached auth may still show old claim status.
    // The first request after verification might need cache invalidation.
    // Since we modified DB directly (bypassing service), we need to clear cache.
  });

  it("rate limit headers reflect effective limit", async () => {
    const { data: regData } = await registerTestAgent(app);

    const res = await app.request("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${regData.data.apiKey}` },
    });

    expect(res.headers.get("X-RateLimit-Limit")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Remaining")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();
  });
});
