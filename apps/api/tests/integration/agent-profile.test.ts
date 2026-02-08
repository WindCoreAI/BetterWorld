import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";

import {
  getTestApp,
  setupTestInfra,
  teardownTestInfra,
  cleanupTestData,
  registerTestAgent,
} from "./helpers.js";

describe("Agent Profile Management", () => {
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

  it("returns full self profile including all fields", async () => {
    const { data: regData } = await registerTestAgent(app, {
      email: "self@test.com",
    });

    const res = await app.request("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${regData.data.apiKey}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data.email).toBe("self@test.com");
    expect(data.data.id).toBeTruthy();
    expect(data.data.username).toBeTruthy();
    expect(data.data.claimStatus).toBe("pending");
    expect(data.data.updatedAt).toBeTruthy();
  });

  it("returns public profile excluding sensitive fields", async () => {
    const { data: regData } = await registerTestAgent(app, {
      email: "private@test.com",
    });

    const res = await app.request(`/api/v1/agents/${regData.data.agentId}`);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    // Sensitive fields excluded
    expect(data.data.apiKeyHash).toBeUndefined();
    expect(data.data.apiKeyPrefix).toBeUndefined();
    expect(data.data.email).toBeUndefined();
    expect(data.data.claimVerificationCode).toBeUndefined();
    // Public fields present
    expect(data.data.username).toBeTruthy();
    expect(data.data.claimStatus).toBe("pending");
  });

  it("updates allowed fields via PATCH", async () => {
    const { data: regData } = await registerTestAgent(app);

    const res = await app.request("/api/v1/agents/me", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${regData.data.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        displayName: "Updated Name",
        soulSummary: "I help with healthcare",
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.displayName).toBe("Updated Name");
    expect(data.data.soulSummary).toBe("I help with healthcare");
  });

  it("rejects PATCH with invalid specializations", async () => {
    const { data: regData } = await registerTestAgent(app);

    const res = await app.request("/api/v1/agents/me", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${regData.data.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        specializations: ["fake_domain"],
      }),
    });

    expect(res.status).toBe(422);
  });

  it("lists agents with cursor-based pagination", async () => {
    // Create 3 agents
    await registerTestAgent(app, { username: "list_agent_01" });
    await registerTestAgent(app, { username: "list_agent_02" });
    await registerTestAgent(app, { username: "list_agent_03" });

    const res = await app.request("/api/v1/agents?limit=2");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data).toHaveLength(2);
    expect(data.meta.hasMore).toBe(true);
    expect(data.meta.cursor).toBeTruthy();

    // Fetch next page
    const res2 = await app.request(`/api/v1/agents?limit=2&cursor=${data.meta.cursor}`);
    const data2 = await res2.json();
    expect(data2.data).toHaveLength(1);
    expect(data2.meta.hasMore).toBe(false);
  });

  it("filters agents by framework", async () => {
    await registerTestAgent(app, { username: "custom_agent_01", framework: "custom" });
    await registerTestAgent(app, { username: "langchain_agent_01", framework: "langchain" });

    const res = await app.request("/api/v1/agents?framework=langchain");
    const data = await res.json();
    expect(data.data).toHaveLength(1);
    expect(data.data[0].framework).toBe("langchain");
  });

  it("sorts by reputationScore", async () => {
    await registerTestAgent(app, { username: "rep_agent_01" });
    await registerTestAgent(app, { username: "rep_agent_02" });

    const res = await app.request("/api/v1/agents?sort=reputationScore&order=desc");
    expect(res.status).toBe(200);
  });

  it("returns 404 for nonexistent agent", async () => {
    const res = await app.request("/api/v1/agents/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });
});
