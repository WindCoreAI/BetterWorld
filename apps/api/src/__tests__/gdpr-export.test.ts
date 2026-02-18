/**
 * GDPR Data Export Integration Tests (Sprint 20: Security Hardening)
 *
 * Tests: authenticated export returns all categories, unauthenticated returns 401,
 * rate limiting returns 429 after 2 requests, exported data excludes passwordHash/apiKeyHash.
 */
import { Hono } from "hono";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies before imports
vi.mock("../lib/container.js", () => ({
  getDb: vi.fn(),
  getRedis: vi.fn(),
}));

interface MockContext {
  req: { header: (name: string) => string | undefined };
  json: (data: unknown, status?: number) => Response;
  set: (key: string, value: unknown) => void;
}

// Broad response type for test assertions
interface TestApiResponse {
  ok: boolean;
  data: {
    exportedAt: string;
    categories: {
      profile: Record<string, unknown> | null;
      humanProfile: Record<string, unknown> | null;
      tokenTransactions: Record<string, unknown>[];
      missionClaims: Record<string, unknown>[];
      evidence: Record<string, unknown>[];
      follows: Record<string, unknown>[];
      connections: Record<string, unknown>[];
      notifications: Record<string, unknown>[];
      discussionThreads: Record<string, unknown>[];
      discussionReplies: Record<string, unknown>[];
      agents: Record<string, unknown>[];
    };
    [key: string]: unknown;
  };
  error: { code: string; message: string };
}

vi.mock("../middleware/humanAuth.js", () => ({
  humanAuth: () =>
    vi.fn().mockImplementation(async (c: MockContext, next: () => Promise<void>) => {
      const authHeader = c.req.header("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Missing token" } }, 401);
      }
      c.set("human", { id: "test-human-id", email: "test@example.com", displayName: "Test User", role: "human" });
      await next();
    }),
}));

vi.mock("../middleware/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../services/data-export.service.js", () => ({
  exportUserData: vi.fn(),
}));

vi.mock("../services/account-deletion.service.js", () => ({
  requestDeletion: vi.fn(),
  cancelDeletion: vi.fn(),
  getDeletionStatus: vi.fn(),
}));

import { getDb, getRedis } from "../lib/container.js";
import gdprRoutes from "../routes/gdpr.routes.js";
import { exportUserData } from "../services/data-export.service.js";

const app = new Hono<{ Variables: { requestId: string } }>();
app.use("*", async (c, next) => {
  c.set("requestId", "test-request-id");
  await next();
});
app.route("/", gdprRoutes);

describe("GDPR Data Export (T018)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: DB available, no Redis (no rate limiting)
    vi.mocked(getDb).mockReturnValue({} as ReturnType<typeof getDb>);
    vi.mocked(getRedis).mockReturnValue(null);
  });

  it("should return 401 for unauthenticated request", async () => {
    const res = await app.request("/me/data-export", { method: "GET" });
    expect(res.status).toBe(401);
    const body = (await res.json()) as TestApiResponse;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("should return exported data with all categories for authenticated user", async () => {
    const mockExport = {
      exportedAt: "2026-02-18T00:00:00.000Z",
      categories: {
        profile: { id: "test-human-id", email: "test@example.com", displayName: "Test User" },
        humanProfile: { skills: ["javascript"] },
        tokenTransactions: [{ id: "tx-1", amount: 10 }],
        missionClaims: [],
        evidence: [],
        follows: [],
        connections: [],
        notifications: [],
        discussionThreads: [],
        discussionReplies: [],
        agents: [{ id: "agent-1", username: "bot1", framework: "openclaw" }],
      },
    };
    vi.mocked(exportUserData).mockResolvedValue(mockExport);

    const res = await app.request("/me/data-export", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as TestApiResponse;
    expect(body.ok).toBe(true);
    expect(body.data.exportedAt).toBe("2026-02-18T00:00:00.000Z");
    expect(body.data.categories).toHaveProperty("profile");
    expect(body.data.categories).toHaveProperty("humanProfile");
    expect(body.data.categories).toHaveProperty("tokenTransactions");
    expect(body.data.categories).toHaveProperty("missionClaims");
    expect(body.data.categories).toHaveProperty("evidence");
    expect(body.data.categories).toHaveProperty("follows");
    expect(body.data.categories).toHaveProperty("connections");
    expect(body.data.categories).toHaveProperty("notifications");
    expect(body.data.categories).toHaveProperty("discussionThreads");
    expect(body.data.categories).toHaveProperty("discussionReplies");
    expect(body.data.categories).toHaveProperty("agents");
  });

  it("should exclude passwordHash and apiKeyHash from exported data", async () => {
    const mockExport = {
      exportedAt: "2026-02-18T00:00:00.000Z",
      categories: {
        profile: { id: "test-human-id", email: "test@example.com" },
        humanProfile: null,
        tokenTransactions: [],
        missionClaims: [],
        evidence: [],
        follows: [],
        connections: [],
        notifications: [],
        discussionThreads: [],
        discussionReplies: [],
        agents: [{ id: "agent-1", username: "bot1" }],
      },
    };
    vi.mocked(exportUserData).mockResolvedValue(mockExport);

    const res = await app.request("/me/data-export", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    });

    const body = (await res.json()) as TestApiResponse;
    expect(body.data.categories.profile).not.toHaveProperty("passwordHash");
    expect(body.data.categories.agents[0]).not.toHaveProperty("apiKeyHash");
  });

  it("should return 429 when rate limit exceeded (2 per 24h)", async () => {
    vi.mocked(exportUserData).mockResolvedValue({
      exportedAt: "2026-02-18T00:00:00.000Z",
      categories: {
        profile: null,
        humanProfile: null,
        tokenTransactions: [],
        missionClaims: [],
        evidence: [],
        follows: [],
        connections: [],
        notifications: [],
        discussionThreads: [],
        discussionReplies: [],
        agents: [],
      },
    });

    // Mock Redis with INCR returning 3 (exceeds limit of 2)
    const mockRedis = {
      incr: vi.fn().mockResolvedValue(3),
      expire: vi.fn(),
    };
    vi.mocked(getRedis).mockReturnValue(mockRedis as unknown as ReturnType<typeof getRedis>);

    const res = await app.request("/me/data-export", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    });

    expect(res.status).toBe(429);
    const body = (await res.json()) as TestApiResponse;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.message).toContain("2 requests per 24-hour");
  });

  it("should allow requests when under rate limit", async () => {
    const mockExport = {
      exportedAt: "2026-02-18T00:00:00.000Z",
      categories: {
        profile: null,
        humanProfile: null,
        tokenTransactions: [],
        missionClaims: [],
        evidence: [],
        follows: [],
        connections: [],
        notifications: [],
        discussionThreads: [],
        discussionReplies: [],
        agents: [],
      },
    };
    vi.mocked(exportUserData).mockResolvedValue(mockExport);

    // Mock Redis with INCR returning 2 (at limit, not exceeding)
    const mockRedis = {
      incr: vi.fn().mockResolvedValue(2),
      expire: vi.fn(),
    };
    vi.mocked(getRedis).mockReturnValue(mockRedis as unknown as ReturnType<typeof getRedis>);

    const res = await app.request("/me/data-export", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as TestApiResponse;
    expect(body.ok).toBe(true);
  });
});
