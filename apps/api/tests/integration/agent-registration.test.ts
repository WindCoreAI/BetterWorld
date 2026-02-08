import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";

import {
  getTestApp,
  setupTestInfra,
  teardownTestInfra,
  cleanupTestData,
  registerTestAgent,
} from "./helpers.js";

describe("Agent Registration", () => {
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

  it("registers a new agent and returns 201 with apiKey", async () => {
    const { res, data } = await registerTestAgent(app);

    expect(res.status).toBe(201);
    expect(data.ok).toBe(true);
    expect(data.data.agentId).toBeTruthy();
    expect(data.data.apiKey).toHaveLength(64);
    expect(data.data.username).toBeTruthy();
  });

  it("returns 409 for duplicate username", async () => {
    const username = "duplicate_test_01";
    await registerTestAgent(app, { username });

    const { res, data } = await registerTestAgent(app, { username });
    expect(res.status).toBe(409);
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe("USERNAME_TAKEN");
  });

  it("returns 422 for invalid specialization", async () => {
    const res = await app.request("/api/v1/auth/agents/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "invalid_spec_01",
        framework: "custom",
        specializations: ["not_a_real_domain"],
      }),
    });

    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.ok).toBe(false);
  });

  it("returns 422 for missing required fields", async () => {
    const res = await app.request("/api/v1/auth/agents/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "missing_fields_01" }),
    });

    expect(res.status).toBe(422);
  });

  it("returns 422 for reserved username", async () => {
    const res = await app.request("/api/v1/auth/agents/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "admin",
        framework: "custom",
        specializations: ["healthcare_improvement"],
      }),
    });

    expect(res.status).toBe(422);
  });

  it("validates username regex (no uppercase, no special chars)", async () => {
    const res = await app.request("/api/v1/auth/agents/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Invalid-Agent!",
        framework: "custom",
        specializations: ["healthcare_improvement"],
      }),
    });

    expect(res.status).toBe(422);
  });

  it("accepts optional email field", async () => {
    const { res, data } = await registerTestAgent(app, {
      email: "agent@test.com",
    });

    expect(res.status).toBe(201);
    expect(data.ok).toBe(true);
  });
});
