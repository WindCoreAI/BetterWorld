import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";

import { verifySignature } from "../../src/lib/crypto.js";
import {
  getTestApp,
  setupTestInfra,
  teardownTestInfra,
  cleanupTestData,
  registerTestAgent,
} from "./helpers.js";

describe("Heartbeat", () => {
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

  it("instructions include all expected fields", async () => {
    const { data: regData } = await registerTestAgent(app);

    const res = await app.request("/api/v1/heartbeat/instructions", {
      headers: { Authorization: `Bearer ${regData.data.apiKey}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data.instructionsVersion).toBeTruthy();
    expect(data.data.instructions.checkProblems).toBe(true);
    expect(data.data.instructions.checkDebates).toBe(true);
    expect(data.data.instructions.contributeSolutions).toBe(true);
    expect(data.data.instructions.maxContributionsPerCycle).toBeGreaterThan(0);
    expect(data.data.instructions.minimumEvidenceSources).toBeGreaterThan(0);
    expect(data.data.signature).toBeTruthy();
    expect(data.data.publicKeyId).toBeTruthy();
    expect(res.headers.get("X-BW-Key-ID")).toBeTruthy();
  });

  it("Ed25519 signature is valid", async () => {
    const { data: regData } = await registerTestAgent(app);

    const res = await app.request("/api/v1/heartbeat/instructions", {
      headers: { Authorization: `Bearer ${regData.data.apiKey}` },
    });

    const data = await res.json();
    const { instructions, instructionsVersion, signature } = data.data;

    // Recreate the signed payload with deterministic key ordering
    const payload = JSON.stringify({ instructionsVersion, instructions }, (_key, value) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return Object.keys(value).sort().reduce<Record<string, unknown>>((sorted, k) => {
          sorted[k] = (value as Record<string, unknown>)[k];
          return sorted;
        }, {});
      }
      return value;
    });

    expect(verifySignature(payload, signature)).toBe(true);
  });

  it("tampered response fails verification", async () => {
    const { data: regData } = await registerTestAgent(app);

    const res = await app.request("/api/v1/heartbeat/instructions", {
      headers: { Authorization: `Bearer ${regData.data.apiKey}` },
    });

    const data = await res.json();
    const { instructions, instructionsVersion, signature } = data.data;

    // Tamper with the instructions
    const tampered = { ...instructions, maxContributionsPerCycle: 999 };
    const payload = JSON.stringify({ instructionsVersion, instructions: tampered }, (_key, value) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return Object.keys(value).sort().reduce<Record<string, unknown>>((sorted, k) => {
          sorted[k] = (value as Record<string, unknown>)[k];
          return sorted;
        }, {});
      }
      return value;
    });

    expect(verifySignature(payload, signature)).toBe(false);
  });

  it("checkin updates lastHeartbeatAt", async () => {
    const { data: regData } = await registerTestAgent(app);
    const apiKey = regData.data.apiKey;

    // Verify no heartbeat initially
    const profileBefore = await app.request("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const beforeData = await profileBefore.json();
    expect(beforeData.data.lastHeartbeatAt).toBeNull();

    // Submit checkin
    const res = await app.request("/api/v1/heartbeat/checkin", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        activitySummary: { problemsReviewed: 5 },
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.message).toBe("Checkin recorded");
    expect(data.data.nextCheckinRecommended).toBeTruthy();

    // Verify heartbeat timestamp updated
    const profileAfter = await app.request("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const afterData = await profileAfter.json();
    expect(afterData.data.lastHeartbeatAt).toBeTruthy();
  });

  it("checkin validates schema", async () => {
    const { data: regData } = await registerTestAgent(app);

    const res = await app.request("/api/v1/heartbeat/checkin", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${regData.data.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ invalid: "data" }),
    });

    expect(res.status).toBe(422);
  });
});
