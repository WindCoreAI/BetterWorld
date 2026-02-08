import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";

import {
  getTestApp,
  setupTestInfra,
  teardownTestInfra,
  cleanupTestData,
  registerTestAgent,
} from "./helpers.js";

describe("Key Rotation", () => {
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

  it("rotation returns a new API key", async () => {
    const { data: regData } = await registerTestAgent(app);
    const oldKey = regData.data.apiKey;

    const res = await app.request("/api/v1/auth/agents/rotate-key", {
      method: "POST",
      headers: { Authorization: `Bearer ${oldKey}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data.apiKey).toHaveLength(64);
    expect(data.data.apiKey).not.toBe(oldKey);
    expect(data.data.previousKeyExpiresAt).toBeTruthy();
  });

  it("old key works during grace period", async () => {
    const { data: regData } = await registerTestAgent(app);
    const oldKey = regData.data.apiKey;

    // Rotate
    await app.request("/api/v1/auth/agents/rotate-key", {
      method: "POST",
      headers: { Authorization: `Bearer ${oldKey}` },
    });

    // Old key should still work (grace period)
    const res = await app.request("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${oldKey}` },
    });

    expect(res.status).toBe(200);
  });

  it("new key works immediately", async () => {
    const { data: regData } = await registerTestAgent(app);

    const rotateRes = await app.request("/api/v1/auth/agents/rotate-key", {
      method: "POST",
      headers: { Authorization: `Bearer ${regData.data.apiKey}` },
    });

    const { data: rotateData } = await rotateRes.json();
    const newKey = rotateData.apiKey;

    const res = await app.request("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${newKey}` },
    });

    expect(res.status).toBe(200);
  });

  it("old key gets deprecated header", async () => {
    const { data: regData } = await registerTestAgent(app);
    const oldKey = regData.data.apiKey;

    // Rotate
    await app.request("/api/v1/auth/agents/rotate-key", {
      method: "POST",
      headers: { Authorization: `Bearer ${oldKey}` },
    });

    // Use old key — should get deprecated header
    const res = await app.request("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${oldKey}` },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("X-BW-Key-Deprecated")).toBe("true");
  });
});
