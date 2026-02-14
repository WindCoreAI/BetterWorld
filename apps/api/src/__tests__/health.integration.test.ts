import * as jose from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { getRedis, initDb, initRedis, shutdown } from "../lib/container.js";

interface HealthBody {
  ok: boolean;
  requestId: string;
}

interface ReadyBody {
  status: string;
  checks: { database: string; redis: string };
  version: string;
  uptime: number;
}

interface ErrorBody {
  ok: boolean;
  error: { code: string; message: string };
  requestId: string;
}

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://betterworld:betterworld_dev@localhost:5432/betterworld";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret-for-ci-min-16-chars";

let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  initDb(DATABASE_URL);
  const redis = initRedis(REDIS_URL);
  await redis.connect();
  app = createApp();
});

afterAll(async () => {
  // Clean up rate limit keys created during tests
  const redis = getRedis();
  if (redis) {
    const keys = await redis.keys("ratelimit:*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
  await shutdown();
});

// ---------- Health Endpoints ----------

describe("Health Endpoints", () => {
  it("GET /healthz returns 200 with ok: true", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);

    const body = (await res.json()) as HealthBody;
    expect(body.ok).toBe(true);
    expect(body.requestId).toBeTruthy();
  });

  it("GET /readyz returns ready with real DB and Redis", async () => {
    const res = await app.request("/readyz");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { ok: boolean; data: ReadyBody; requestId: string };
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("ready");
    expect(body.data.checks.database).toBe("ok");
    expect(body.data.checks.redis).toBe("ok");
    expect(body.data.version).toBe("0.1.0");
    expect(typeof body.data.uptime).toBe("number");
  });

  it("GET /api/v1/health returns 200 with ok: true", async () => {
    const res = await app.request("/api/v1/health");
    expect(res.status).toBe(200);

    const body = (await res.json()) as HealthBody;
    expect(body.ok).toBe(true);
    expect(body.requestId).toBeTruthy();
  });
});

// ---------- 404 Handler ----------

describe("404 Handler", () => {
  it("returns structured error for unknown routes", async () => {
    const res = await app.request("/nonexistent-path");
    expect(res.status).toBe(404);

    const body = (await res.json()) as ErrorBody;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toContain("GET");
    expect(body.error.message).toContain("/nonexistent-path");
    expect(body.requestId).toBeTruthy();
  });
});

// ---------- Rate Limiting (Real Redis) ----------

describe("Rate Limiting with Real Redis", () => {
  it("sets rate limit headers on responses", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);

    const limit = res.headers.get("X-RateLimit-Limit");
    const remaining = res.headers.get("X-RateLimit-Remaining");
    const reset = res.headers.get("X-RateLimit-Reset");

    expect(limit).toBeTruthy();
    expect(Number(limit)).toBeGreaterThan(0);
    expect(remaining).toBeTruthy();
    expect(Number(remaining)).toBeGreaterThanOrEqual(0);
    expect(reset).toBeTruthy();
    expect(Number(reset)).toBeGreaterThan(0);
  });
});

// ---------- Auth — JWT Path ----------

describe("Auth — JWT via optionalAuth", () => {
  it("accepts requests with a valid JWT (sets auth context)", async () => {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const token = await new jose.SignJWT({
      sub: "user-integration-test",
      role: "human",
      email: "test@betterworld.dev",
      displayName: "Test User",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("5m")
      .sign(secret);

    const res = await app.request("/healthz", {
      headers: { Authorization: `Bearer ${token}` },
    });

    // optionalAuth does not reject — health endpoint still returns 200
    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthBody;
    expect(body.ok).toBe(true);
  });

  it("returns 401 for invalid JWT (FR-027 optionalAuth hardening)", async () => {
    const res = await app.request("/healthz", {
      headers: { Authorization: "Bearer invalid-token-string" },
    });

    // FR-027: optionalAuth returns 401 when credentials are present but invalid
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("falls through to public when no auth header is provided", async () => {
    const res = await app.request("/healthz");

    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthBody;
    expect(body.ok).toBe(true);
  });
});
