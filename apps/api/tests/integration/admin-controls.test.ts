import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { SignJWT } from "jose";
import {
  getTestApp,
  setupTestInfra,
  teardownTestInfra,
  cleanupTestData,
  registerTestAgent,
} from "./helpers.js";

describe("Admin Controls", () => {
  const app = getTestApp();
  let adminToken: string;
  let agentId: string;
  let agentApiKey: string;

  beforeAll(async () => {
    await setupTestInfra();

    // Ensure JWT_SECRET is set for admin auth
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = "test-jwt-secret-for-admin-min-16-chars";
    }

    // Generate admin JWT
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    adminToken = await new SignJWT({ role: "admin", sub: "admin-user" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(secret);

    // Register a test agent for admin operations
    const { data: regData } = await registerTestAgent(app, {
      username: "admin_test_agent",
    });
    agentId = regData.data.agentId;
    agentApiKey = regData.data.apiKey;
  });

  afterEach(async () => {
    // Reset any overrides after each test
    await app.request(`/api/v1/admin/agents/${agentId}/rate-limit`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ limit: null }),
    });
  });

  afterAll(async () => {
    await teardownTestInfra();
  });

  describe("Rate Limit Override", () => {
    it("sets per-agent rate limit override", async () => {
      const res = await app.request(`/api/v1/admin/agents/${agentId}/rate-limit`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: 100 }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.data.agentId).toBe(agentId);
      expect(data.data.rateLimitOverride).toBe(100);
      expect(data.data.effectiveLimit).toBe(100);
    });

    it("agent requests reflect new rate limit", async () => {
      // Set override
      await app.request(`/api/v1/admin/agents/${agentId}/rate-limit`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: 100 }),
      });

      // Verify agent sees new limit
      const res = await app.request("/api/v1/agents/me", {
        headers: { Authorization: `Bearer ${agentApiKey}` },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Limit")).toBe("100");
    });

    it("removes rate limit override with null", async () => {
      // First set an override
      await app.request(`/api/v1/admin/agents/${agentId}/rate-limit`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: 100 }),
      });

      // Then remove it
      const res = await app.request(`/api/v1/admin/agents/${agentId}/rate-limit`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: null }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.rateLimitOverride).toBeNull();
      // Should fall back to tier-based limit (30 for pending)
      expect(data.data.effectiveLimit).toBe(30);
    });

    it("validates rate limit bounds (min 1, max 1000)", async () => {
      // Test min bound (0 should fail)
      const resMin = await app.request(`/api/v1/admin/agents/${agentId}/rate-limit`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: 0 }),
      });
      expect(resMin.status).toBe(422);

      // Test max bound (1001 should fail)
      const resMax = await app.request(`/api/v1/admin/agents/${agentId}/rate-limit`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: 1001 }),
      });
      expect(resMax.status).toBe(422);

      // Valid values should work
      const resValid = await app.request(`/api/v1/admin/agents/${agentId}/rate-limit`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: 1 }),
      });
      expect(resValid.status).toBe(200);
    });

    it("rejects agent API keys on admin routes", async () => {
      const res = await app.request(`/api/v1/admin/agents/${agentId}/rate-limit`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${agentApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: 100 }),
      });

      // Agent API keys aren't valid JWTs, so requireAdmin() returns 401
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.ok).toBe(false);
    });

    it("rejects requests without admin token", async () => {
      const res = await app.request(`/api/v1/admin/agents/${agentId}/rate-limit`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: 100 }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe("Manual Verification", () => {
    it("manually verifies an agent", async () => {
      const res = await app.request(`/api/v1/admin/agents/${agentId}/verification`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ claimStatus: "verified" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.data.agentId).toBe(agentId);
      expect(data.data.claimStatus).toBe("verified");
      expect(data.data.previousStatus).toBe("pending");
    });

    it("can revert verification status", async () => {
      // First verify
      await app.request(`/api/v1/admin/agents/${agentId}/verification`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ claimStatus: "verified" }),
      });

      // Then revert to pending
      const res = await app.request(`/api/v1/admin/agents/${agentId}/verification`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ claimStatus: "pending" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.claimStatus).toBe("pending");
      expect(data.data.previousStatus).toBe("verified");
    });

    it("validates claim status values", async () => {
      const res = await app.request(`/api/v1/admin/agents/${agentId}/verification`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ claimStatus: "invalid_status" }),
      });

      expect(res.status).toBe(422);
    });

    it("returns 404 for nonexistent agent", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const res = await app.request(`/api/v1/admin/agents/${fakeId}/verification`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ claimStatus: "verified" }),
      });

      expect(res.status).toBe(404);
    });
  });
});
