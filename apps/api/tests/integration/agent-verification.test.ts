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

describe("Agent Email Verification", () => {
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

  it("verifies agent with correct code", async () => {
    const { data: regData } = await registerTestAgent(app, {
      email: "verify@test.com",
    });
    const apiKey = regData.data.apiKey;
    const agentId = regData.data.agentId;

    // Get the verification code from DB
    const db = getTestDb();
    const [agent] = await db
      .select({ claimVerificationCode: agents.claimVerificationCode })
      .from(agents)
      .where(eq(agents.id, agentId));

    const code = agent.claimVerificationCode!;

    const res = await app.request("/api/v1/auth/agents/verify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ verificationCode: code }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data.claimStatus).toBe("verified");
  });

  it("rejects wrong verification code", async () => {
    const { data: regData } = await registerTestAgent(app, {
      email: "wrong@test.com",
    });

    const res = await app.request("/api/v1/auth/agents/verify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${regData.data.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ verificationCode: "000000" }),
    });

    expect(res.status).toBe(422);
  });

  it("rejects expired verification code", async () => {
    const { data: regData } = await registerTestAgent(app, {
      email: "expired@test.com",
    });
    const agentId = regData.data.agentId;

    // Expire the code manually
    const db = getTestDb();
    await db
      .update(agents)
      .set({ claimVerificationCodeExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(agents.id, agentId));

    const [agent] = await db
      .select({ claimVerificationCode: agents.claimVerificationCode })
      .from(agents)
      .where(eq(agents.id, agentId));

    const res = await app.request("/api/v1/auth/agents/verify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${regData.data.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ verificationCode: agent.claimVerificationCode }),
    });

    expect(res.status).toBe(422);
  });

  it("resend generates a new code", async () => {
    const { data: regData } = await registerTestAgent(app, {
      email: "resend@test.com",
    });

    const db = getTestDb();
    const [before] = await db
      .select({ claimVerificationCode: agents.claimVerificationCode })
      .from(agents)
      .where(eq(agents.id, regData.data.agentId));

    const res = await app.request("/api/v1/auth/agents/verify/resend", {
      method: "POST",
      headers: { Authorization: `Bearer ${regData.data.apiKey}` },
    });

    expect(res.status).toBe(200);

    const [after] = await db
      .select({ claimVerificationCode: agents.claimVerificationCode })
      .from(agents)
      .where(eq(agents.id, regData.data.agentId));

    // New code should be different from the original
    expect(after.claimVerificationCode).toBeTruthy();
    expect(after.claimVerificationCode).not.toBe(before.claimVerificationCode);
  });

  it("verified agent has updated claimStatus", async () => {
    const { data: regData } = await registerTestAgent(app, {
      email: "status@test.com",
    });

    // Verify
    const db = getTestDb();
    const [agent] = await db
      .select({ claimVerificationCode: agents.claimVerificationCode })
      .from(agents)
      .where(eq(agents.id, regData.data.agentId));

    await app.request("/api/v1/auth/agents/verify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${regData.data.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ verificationCode: agent.claimVerificationCode }),
    });

    // Check profile
    const profileRes = await app.request("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${regData.data.apiKey}` },
    });

    const profile = await profileRes.json();
    expect(profile.data.claimStatus).toBe("verified");
  });
});
