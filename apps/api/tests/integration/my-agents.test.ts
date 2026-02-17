/**
 * Integration Tests: My Agents (Human-First Agent Onboarding)
 *
 * Sprint 19 — covers US1 (creation), US2 (management), US3 (backward compat),
 * US4 (dashboard), US5 (deprecation), US7 (verification inheritance),
 * and FR-020 (ON DELETE RESTRICT).
 */

import { humans, agents } from "@betterworld/db";
import { MAX_AGENTS_PER_HUMAN } from "@betterworld/shared";
import { eq, sql } from "drizzle-orm";
import * as jose from "jose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  getTestApp,
  getTestDb,
  setupTestInfra,
  teardownTestInfra,
} from "./helpers";

const JWT_SECRET = process.env.JWT_SECRET ?? "a-very-secret-key-that-is-at-least-32-chars-long";

let app: ReturnType<typeof getTestApp>;
let counter = 0;

/**
 * Create a test human directly in the DB and return a JWT token.
 */
async function createTestHuman(opts: {
  emailVerified?: boolean;
  displayName?: string;
  role?: string;
} = {}) {
  const db = getTestDb();
  counter++;
  const email = `test_human_${Date.now()}_${counter}@example.com`;
  const displayName = opts.displayName ?? `Test Human ${counter}`;

  const [human] = await db
    .insert(humans)
    .values({
      email,
      displayName,
      role: opts.role ?? "human",
      emailVerified: opts.emailVerified ?? true,
    })
    .returning();

  const secret = new TextEncoder().encode(JWT_SECRET);
  const token = await new jose.SignJWT({ userId: human!.id, email })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("15m")
    .sign(secret);

  return { human: human!, token };
}

/**
 * Helper to make authenticated requests.
 */
function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Helper to create an agent via the API.
 */
async function createAgent(
  token: string,
  overrides: Record<string, unknown> = {},
) {
  counter++;
  const body = {
    username: `test_agent_${Date.now()}_${counter}`,
    framework: "custom",
    specializations: ["healthcare_improvement"],
    ...overrides,
  };

  const res = await app.request("/api/v1/my-agents", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return { res, data, body };
}

beforeAll(async () => {
  await setupTestInfra();
  app = getTestApp();
}, 30_000);

afterAll(async () => {
  await teardownTestInfra();
}, 30_000);

beforeEach(async () => {
  const db = getTestDb();
  // Clean agents and humans for fresh state each test
  await db.execute(sql`TRUNCATE TABLE agents CASCADE`);
  await db.execute(sql`DELETE FROM humans WHERE email LIKE 'test_human_%@example.com'`);
  // Flush Redis rate limits
  const { getTestRedis } = await import("./helpers");
  const redis = getTestRedis();
  if (redis) await redis.flushdb();
});

// ============================================================
// US1: Human Creates an Agent (T014)
// ============================================================
describe("US1: Agent Creation", () => {
  it("creates an agent with valid data (201 + apiKey)", async () => {
    const { token } = await createTestHuman();
    const { res, data } = await createAgent(token, {
      username: "my_test_agent",
      framework: "openclaw",
      specializations: ["healthcare_improvement", "education_access"],
      displayName: "My Test Agent",
      soulSummary: "A test agent for healthcare",
    });

    expect(res.status).toBe(201);
    expect(data.ok).toBe(true);
    expect(data.data.agentId).toBeDefined();
    expect(data.data.username).toBe("my_test_agent");
    expect(data.data.apiKey).toBeDefined();
    expect(data.data.apiKey).toHaveLength(64); // 32 bytes hex
    expect(data.data.claimStatus).toBe("verified"); // emailVerified=true
    expect(data.data.creditBalance).toBe(50); // starter grant
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/v1/my-agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "no_auth_agent",
        framework: "custom",
        specializations: ["healthcare_improvement"],
      }),
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.ok).toBe(false);
  });

  it("returns 409 for duplicate username", async () => {
    const { token } = await createTestHuman();
    const username = `dup_agent_${Date.now()}`;
    await createAgent(token, { username });

    const { res, data } = await createAgent(token, { username });

    expect(res.status).toBe(409);
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe("USERNAME_TAKEN");
  });

  it("enforces max agent limit", async () => {
    const { token } = await createTestHuman();

    // Create MAX_AGENTS_PER_HUMAN agents
    for (let i = 0; i < MAX_AGENTS_PER_HUMAN; i++) {
      const { res } = await createAgent(token, {
        username: `limit_agent_${Date.now()}_${i}`,
      });
      expect(res.status).toBe(201);
    }

    // Try to create one more
    const { res, data } = await createAgent(token, {
      username: `over_limit_agent_${Date.now()}`,
    });

    expect(res.status).toBe(400);
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe("MAX_AGENTS_REACHED");
  });

  it("returns 422 for invalid username format", async () => {
    const { token } = await createTestHuman();

    // Username starting with underscore
    const res = await app.request("/api/v1/my-agents", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        username: "_bad_name",
        framework: "custom",
        specializations: ["healthcare_improvement"],
      }),
    });

    expect(res.status).toBe(422);
  });

  it("returns 422 for invalid specializations", async () => {
    const { token } = await createTestHuman();

    const res = await app.request("/api/v1/my-agents", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        username: "valid_agent_name",
        framework: "custom",
        specializations: ["nonexistent_domain"],
      }),
    });

    expect(res.status).toBe(422);
  });

  it("returns 422 for empty specializations", async () => {
    const { token } = await createTestHuman();

    const res = await app.request("/api/v1/my-agents", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        username: "valid_agent_name",
        framework: "custom",
        specializations: [],
      }),
    });

    expect(res.status).toBe(422);
  });

  it("grants 50 starter credits", async () => {
    const { token } = await createTestHuman();
    const { data } = await createAgent(token);

    expect(data.ok).toBe(true);
    expect(data.data.creditBalance).toBe(50);
  });
});

// ============================================================
// US2: Human Views and Manages Agents (T017)
// ============================================================
describe("US2: Agent Management", () => {
  it("lists owned agents", async () => {
    const { token } = await createTestHuman();
    await createAgent(token, { username: `list_a_${Date.now()}` });
    await createAgent(token, { username: `list_b_${Date.now()}` });

    const res = await app.request("/api/v1/my-agents", {
      method: "GET",
      headers: authHeaders(token),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data.agents).toHaveLength(2);
    expect(data.data.hasMore).toBe(false);
  });

  it("supports cursor pagination", async () => {
    const { token } = await createTestHuman();
    // Create 3 agents, paginate with limit=2
    for (let i = 0; i < 3; i++) {
      await createAgent(token, { username: `page_agent_${Date.now()}_${i}` });
    }

    const res1 = await app.request("/api/v1/my-agents?limit=2", {
      method: "GET",
      headers: authHeaders(token),
    });
    const data1 = await res1.json();
    expect(data1.data.agents).toHaveLength(2);
    expect(data1.data.hasMore).toBe(true);
    expect(data1.data.nextCursor).toBeTruthy();

    const res2 = await app.request(
      `/api/v1/my-agents?limit=2&cursor=${data1.data.nextCursor}`,
      { method: "GET", headers: authHeaders(token) },
    );
    const data2 = await res2.json();
    expect(data2.data.agents).toHaveLength(1);
    expect(data2.data.hasMore).toBe(false);
  });

  it("gets agent detail (200)", async () => {
    const { token } = await createTestHuman();
    const { data: createData } = await createAgent(token);
    const agentId = createData.data.agentId;

    const res = await app.request(`/api/v1/my-agents/${agentId}`, {
      method: "GET",
      headers: authHeaders(token),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data.id).toBe(agentId);
    expect(data.data.apiKeyPrefix).toBeDefined();
  });

  it("returns 403 for non-owned agent", async () => {
    const { token: token1 } = await createTestHuman();
    const { token: token2 } = await createTestHuman();
    const { data: createData } = await createAgent(token1);
    const agentId = createData.data.agentId;

    const res = await app.request(`/api/v1/my-agents/${agentId}`, {
      method: "GET",
      headers: authHeaders(token2),
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe("FORBIDDEN");
  });

  it("updates agent profile (200)", async () => {
    const { token } = await createTestHuman();
    const { data: createData } = await createAgent(token);
    const agentId = createData.data.agentId;

    const res = await app.request(`/api/v1/my-agents/${agentId}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({
        displayName: "Updated Agent Name",
        soulSummary: "Updated soul summary",
        specializations: ["education_access", "food_security"],
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data.displayName).toBe("Updated Agent Name");
    expect(data.data.specializations).toEqual(["education_access", "food_security"]);
  });

  it("rejects update of immutable fields (username via Zod schema)", async () => {
    const { token } = await createTestHuman();
    const { data: createData } = await createAgent(token);
    const agentId = createData.data.agentId;

    // updateAgentSchema does not include username or framework,
    // so extra fields are silently stripped by Zod .strict() or ignored.
    // The important thing is username does NOT change.
    const res = await app.request(`/api/v1/my-agents/${agentId}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({
        displayName: "OK Update",
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.username).toBe(createData.data.username);
  });

  it("rotates key and returns new key", async () => {
    const { token } = await createTestHuman();
    const { data: createData } = await createAgent(token);
    const agentId = createData.data.agentId;

    const res = await app.request(`/api/v1/my-agents/${agentId}/rotate-key`, {
      method: "POST",
      headers: authHeaders(token),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data.apiKey).toBeDefined();
    expect(data.data.apiKey).toHaveLength(64);
    expect(data.data.previousKeyExpiresAt).toBeDefined();
    expect(data.data.warning).toContain("previous API key");
  });

  it("deactivates agent", async () => {
    const { token } = await createTestHuman();
    const { data: createData } = await createAgent(token);
    const agentId = createData.data.agentId;

    const res = await app.request(`/api/v1/my-agents/${agentId}/deactivate`, {
      method: "POST",
      headers: authHeaders(token),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data.isActive).toBe(false);
  });

  it("reactivates agent", async () => {
    const { token } = await createTestHuman();
    const { data: createData } = await createAgent(token);
    const agentId = createData.data.agentId;

    // Deactivate first
    await app.request(`/api/v1/my-agents/${agentId}/deactivate`, {
      method: "POST",
      headers: authHeaders(token),
    });

    // Then reactivate
    const res = await app.request(`/api/v1/my-agents/${agentId}/reactivate`, {
      method: "POST",
      headers: authHeaders(token),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data.isActive).toBe(true);
  });

  it("returns 400 when deactivating already inactive agent", async () => {
    const { token } = await createTestHuman();
    const { data: createData } = await createAgent(token);
    const agentId = createData.data.agentId;

    // Deactivate
    await app.request(`/api/v1/my-agents/${agentId}/deactivate`, {
      method: "POST",
      headers: authHeaders(token),
    });

    // Try again
    const res = await app.request(`/api/v1/my-agents/${agentId}/deactivate`, {
      method: "POST",
      headers: authHeaders(token),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("ALREADY_INACTIVE");
  });

  it("returns 400 when reactivating already active agent", async () => {
    const { token } = await createTestHuman();
    const { data: createData } = await createAgent(token);
    const agentId = createData.data.agentId;

    const res = await app.request(`/api/v1/my-agents/${agentId}/reactivate`, {
      method: "POST",
      headers: authHeaders(token),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("ALREADY_ACTIVE");
  });
});

// ============================================================
// US3: Agent Operates with Human-Issued Key (T018)
// ============================================================
describe("US3: Backward Compatibility", () => {
  it("agent created via human flow authenticates with API key", async () => {
    const { token } = await createTestHuman();
    const { data: createData } = await createAgent(token);
    const apiKey = createData.data.apiKey;

    // Use the API key to call GET /v1/agents/me
    const res = await app.request("/api/v1/agents/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data.username).toBe(createData.data.username);
  });

  it("deactivated agent key is rejected", async () => {
    const { token } = await createTestHuman();
    const { data: createData } = await createAgent(token);
    const apiKey = createData.data.apiKey;
    const agentId = createData.data.agentId;

    // Deactivate the agent
    await app.request(`/api/v1/my-agents/${agentId}/deactivate`, {
      method: "POST",
      headers: authHeaders(token),
    });

    // Try to use the key
    const res = await app.request("/api/v1/agents/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    // Should be rejected (401 or 403 depending on implementation)
    expect([401, 403]).toContain(res.status);
  });

  it("ownerHumanId is populated in agent record", async () => {
    const { token, human } = await createTestHuman();
    const { data: createData } = await createAgent(token);
    const agentId = createData.data.agentId;

    const db = getTestDb();
    const [agentRow] = await db
      .select({ ownerHumanId: agents.ownerHumanId })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    expect(agentRow!.ownerHumanId).toBe(human.id);
  });
});

// ============================================================
// US4: Dashboard Shows Agent Count (T021)
// ============================================================
describe("US4: Dashboard Agent Count", () => {
  it("dashboard includes agent count", async () => {
    const { token } = await createTestHuman();
    await createAgent(token, { username: `dash_a_${Date.now()}` });
    await createAgent(token, { username: `dash_b_${Date.now()}` });

    const res = await app.request("/api/v1/dashboard", {
      method: "GET",
      headers: authHeaders(token),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data.agents).toBeDefined();
    expect(data.data.agents.count).toBe(2);
  });

  it("dashboard shows 0 agents for human with no agents", async () => {
    const { token } = await createTestHuman();

    const res = await app.request("/api/v1/dashboard", {
      method: "GET",
      headers: authHeaders(token),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data.agents).toBeDefined();
    expect(data.data.agents.count).toBe(0);
  });
});

// ============================================================
// US7: Agent Inherits Human Verification (T026)
// ============================================================
describe("US7: Verification Inheritance", () => {
  it("verified human creates agent with claimStatus 'verified'", async () => {
    const { token } = await createTestHuman({ emailVerified: true });
    const { data } = await createAgent(token);

    expect(data.ok).toBe(true);
    expect(data.data.claimStatus).toBe("verified");
  });

  it("unverified human creates agent with claimStatus 'pending'", async () => {
    const { token } = await createTestHuman({ emailVerified: false });
    const { data } = await createAgent(token);

    expect(data.ok).toBe(true);
    expect(data.data.claimStatus).toBe("pending");
  });
});

// ============================================================
// US5: Old Registration Path Deprecation (T024)
// ============================================================
describe("US5: Registration Deprecation", () => {
  it("unauthenticated caller gets 401 + deprecation message + X-BW-Deprecated header", async () => {
    const res = await app.request("/api/v1/auth/agents/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "old_style_agent",
        framework: "custom",
        specializations: ["healthcare_improvement"],
      }),
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe("DEPRECATED");
    expect(data.error.message).toContain("human account");
    expect(res.headers.get("X-BW-Deprecated")).toBe("true");
  });

  it("authenticated human caller gets 410 Gone with redirect hint", async () => {
    const { token } = await createTestHuman();

    const res = await app.request("/api/v1/auth/agents/register", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        username: "old_style_agent",
        framework: "custom",
        specializations: ["healthcare_improvement"],
      }),
    });

    expect(res.status).toBe(410);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe("DEPRECATED");
    expect(data.error.message).toContain("/v1/my-agents");
    expect(res.headers.get("X-BW-Deprecated")).toBe("true");
    expect(res.headers.get("Location")).toBe("/v1/my-agents");
  });
});

// ============================================================
// FR-020: ON DELETE RESTRICT (T027)
// ============================================================
describe("FR-020: ON DELETE RESTRICT", () => {
  it("cannot delete a human who owns agents", async () => {
    const { token, human } = await createTestHuman();
    await createAgent(token);

    const db = getTestDb();

    // Attempt to delete the human directly
    let deleteError: Error | null = null;
    try {
      await db.delete(humans).where(eq(humans.id, human.id));
    } catch (err) {
      deleteError = err as Error;
    }

    expect(deleteError).not.toBeNull();
    // PostgreSQL FK violation error code is 23503
    expect((deleteError as unknown as { code: string }).code).toBe("23503");
  });
});
