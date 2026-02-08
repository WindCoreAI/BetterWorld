import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getRedis } from "../lib/container.js";
import type { AuthEnv } from "../middleware/auth.js";
import { errorHandler } from "../middleware/error-handler.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { requestId } from "../middleware/request-id.js";

vi.mock("../lib/container.js", () => ({
  getRedis: vi.fn(() => null),
  getDb: vi.fn(() => null),
  initDb: vi.fn(),
  initRedis: vi.fn(),
  shutdown: vi.fn(),
}));

const mockGetRedis = vi.mocked(getRedis);

interface SuccessBody {
  ok: boolean;
  authRole: string;
  requestId: string;
}

interface ErrorBody {
  ok: boolean;
  error: { code: string; message: string; details?: Record<string, unknown> };
  requestId: string;
}

function createMockRedis(currentCount: number) {
  const pipelineResults = [
    [null, 0], // ZREMRANGEBYSCORE
    [null, currentCount], // ZCARD
    [null, 1], // ZADD
    [null, 1], // EXPIRE
  ];

  const pipeline = {
    zremrangebyscore: vi.fn().mockReturnThis(),
    zcard: vi.fn().mockReturnThis(),
    zadd: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(pipelineResults),
  };

  return {
    pipeline: vi.fn().mockReturnValue(pipeline),
    _pipeline: pipeline,
  };
}

function createTestApp() {
  const app = new Hono<AuthEnv>();
  app.use("*", requestId());

  // Simulate auth context via test headers
  app.use("*", async (c, next) => {
    const role = c.req.header("X-Test-Role");
    if (role === "agent") {
      c.set("authRole", "agent");
      c.set("agent", { id: "agent-123", username: "test-agent", framework: "test" });
    } else if (role === "human") {
      c.set("authRole", "human");
      c.set("user", { sub: "user-123", role: "human", email: "u@t.com", displayName: "User" });
    } else if (role === "admin") {
      c.set("authRole", "admin");
      c.set("user", { sub: "admin-1", role: "admin", email: "a@t.com", displayName: "Admin" });
    } else {
      c.set("authRole", "public");
    }
    await next();
  });

  app.use("*", rateLimit());

  app.get("/test", (c) => {
    return c.json({
      ok: true,
      authRole: c.get("authRole"),
      requestId: c.get("requestId"),
    });
  });

  app.onError(errorHandler);
  return app;
}

describe("rateLimit middleware", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("allows requests under the limit and sets rate limit headers", async () => {
    const mockRedis = createMockRedis(5);
    mockGetRedis.mockReturnValue(mockRedis as never);
    const app = createTestApp();

    const res = await app.request("/test");
    expect(res.status).toBe(200);

    const body = (await res.json()) as SuccessBody;
    expect(body.ok).toBe(true);

    // Public limit = 30; 5 used, next request = 6th → remaining = 30 - 5 - 1 = 24
    expect(res.headers.get("X-RateLimit-Limit")).toBe("30");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("24");
    expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();
  });

  it("returns 429 when rate limit is exceeded", async () => {
    const mockRedis = createMockRedis(30);
    mockGetRedis.mockReturnValue(mockRedis as never);
    const app = createTestApp();

    const res = await app.request("/test");
    expect(res.status).toBe(429);

    const body = (await res.json()) as ErrorBody;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.message).toContain("Too many requests");

    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Limit")).toBe("30");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("allows requests when Redis is unavailable (degraded mode)", async () => {
    mockGetRedis.mockReturnValue(null);
    const app = createTestApp();

    const res = await app.request("/test");
    expect(res.status).toBe(200);

    const body = (await res.json()) as SuccessBody;
    expect(body.ok).toBe(true);

    // No rate limit headers in degraded mode
    expect(res.headers.get("X-RateLimit-Limit")).toBeNull();
  });

  it("applies different limits for different auth roles", async () => {
    // Agent role: limit = 60
    const mockRedis = createMockRedis(10);
    mockGetRedis.mockReturnValue(mockRedis as never);
    const app = createTestApp();

    const res = await app.request("/test", {
      headers: { "X-Test-Role": "agent" },
    });
    expect(res.status).toBe(200);

    expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
    // 60 - 10 - 1 = 49
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("49");

    // Admin role: limit = 300
    vi.clearAllMocks();
    const mockRedis2 = createMockRedis(50);
    mockGetRedis.mockReturnValue(mockRedis2 as never);

    const res2 = await app.request("/test", {
      headers: { "X-Test-Role": "admin" },
    });
    expect(res2.status).toBe(200);
    expect(res2.headers.get("X-RateLimit-Limit")).toBe("300");
    // 300 - 50 - 1 = 249
    expect(res2.headers.get("X-RateLimit-Remaining")).toBe("249");
  });

  it("uses correct Redis key based on identity", async () => {
    const mockRedis = createMockRedis(0);
    mockGetRedis.mockReturnValue(mockRedis as never);
    const app = createTestApp();

    // Agent request → key uses agent:id
    await app.request("/test", {
      headers: { "X-Test-Role": "agent" },
    });

    const pipeline = mockRedis._pipeline;
    const keyArg = pipeline.zremrangebyscore.mock.calls[0]?.[0] as string;
    expect(keyArg).toBe("ratelimit:agent:agent-123");
  });

  it("uses IP-based key for public (unauthenticated) requests", async () => {
    const mockRedis = createMockRedis(0);
    mockGetRedis.mockReturnValue(mockRedis as never);
    const app = createTestApp();

    await app.request("/test", {
      headers: { "X-Forwarded-For": "192.168.1.100" },
    });

    const pipeline = mockRedis._pipeline;
    const keyArg = pipeline.zremrangebyscore.mock.calls[0]?.[0] as string;
    expect(keyArg).toBe("ratelimit:ip:192.168.1.100");
  });
});
