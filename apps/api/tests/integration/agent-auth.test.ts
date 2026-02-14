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

describe("Agent Authentication", () => {
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

  it("authenticates with valid API key and returns 200", async () => {
    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;

    const res = await app.request("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data.id).toBe(regData.data.agentId);
  });

  it("returns 401 for invalid API key", async () => {
    const res = await app.request("/api/v1/agents/me", {
      headers: { Authorization: "Bearer invalid_key_here_with_enough_length" },
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.ok).toBe(false);
  });

  it("returns 401 for deactivated agent (FR-027 optionalAuth hardening)", async () => {
    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;

    // Deactivate the agent
    const db = getTestDb();
    await db
      .update(agents)
      .set({ isActive: false })
      .where(eq(agents.id, agentId));

    // FR-027: Global optionalAuth intercepts before requireAgent — deactivated
    // agent credentials are treated as invalid, returning 401 instead of 403
    const res = await app.request("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(res.status).toBe(401);
  });

  it("returns cached auth on second request", async () => {
    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;

    // First request — cache miss (DB lookup)
    const res1 = await app.request("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(res1.status).toBe(200);

    // Second request — should hit cache
    const res2 = await app.request("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(res2.status).toBe(200);
  });

  it("returns 401 for malformed bearer header", async () => {
    const res = await app.request("/api/v1/agents/me", {
      headers: { Authorization: "NotBearer something" },
    });

    // optionalAuth falls through to public, then requireAgent sees no auth
    expect(res.status).toBe(401);
  });
});
