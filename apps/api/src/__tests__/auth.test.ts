import { Hono } from "hono";
import * as jose from "jose";
import { describe, expect, it } from "vitest";

import type { AuthEnv } from "../middleware/auth.js";
import { optionalAuth, requireAdmin } from "../middleware/auth.js";
import { errorHandler } from "../middleware/error-handler.js";
import { requestId } from "../middleware/request-id.js";

interface ErrorBody {
  ok: boolean;
  error: { code: string; message: string };
  requestId: string;
}

interface AdminBody {
  ok: boolean;
  user: { sub: string; role: string; email: string; displayName: string };
  requestId: string;
}

interface CheckBody {
  ok: boolean;
  authRole: string;
  user: { sub: string; role: string } | null;
  requestId: string;
}

const JWT_SECRET = "test-jwt-secret-minimum-16-chars";

async function createToken(
  payload: Record<string, unknown>,
  expiresIn = "15m",
): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresIn)
    .sign(secret);
}

function createAdminTestApp() {
  const app = new Hono<AuthEnv>();
  app.use("*", requestId());

  app.get("/admin", requireAdmin(), (c) => {
    return c.json({ ok: true, user: c.get("user"), requestId: c.get("requestId") });
  });

  app.onError(errorHandler);
  return app;
}

function createOptionalAuthTestApp() {
  const app = new Hono<AuthEnv>();
  app.use("*", requestId());
  app.use("*", optionalAuth());

  app.get("/check", (c) => {
    return c.json({
      ok: true,
      authRole: c.get("authRole"),
      user: c.get("user") ?? null,
      requestId: c.get("requestId"),
    });
  });

  app.onError(errorHandler);
  return app;
}

describe("requireAdmin middleware", () => {
  const app = createAdminTestApp();

  it("returns 401 when no authorization header", async () => {
    const res = await app.request("/admin");
    expect(res.status).toBe(401);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 for invalid JWT", async () => {
    const res = await app.request("/admin", {
      headers: { Authorization: "Bearer invalid-token" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 for expired JWT", async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    const token = await createToken(
      { sub: "user-1", role: "admin", email: "a@b.com", displayName: "Admin" },
      "0s",
    );
    // Wait a moment for expiry
    await new Promise((r) => setTimeout(r, 50));

    const res = await app.request("/admin", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("TOKEN_EXPIRED");
    process.env.JWT_SECRET = undefined;
  });

  it("returns 403 for non-admin JWT", async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    const token = await createToken({
      sub: "user-1",
      role: "human",
      email: "user@test.com",
      displayName: "User",
    });

    const res = await app.request("/admin", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("FORBIDDEN");
    process.env.JWT_SECRET = undefined;
  });

  it("allows admin JWT and attaches user to context", async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    const token = await createToken({
      sub: "admin-1",
      role: "admin",
      email: "admin@test.com",
      displayName: "Admin",
    });

    const res = await app.request("/admin", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminBody;
    expect(body.ok).toBe(true);
    expect(body.user.sub).toBe("admin-1");
    expect(body.user.role).toBe("admin");
    process.env.JWT_SECRET = undefined;
  });
});

describe("optionalAuth middleware", () => {
  const app = createOptionalAuthTestApp();

  it("sets authRole to public when no auth header", async () => {
    const res = await app.request("/check");
    expect(res.status).toBe(200);
    const body = (await res.json()) as CheckBody;
    expect(body.authRole).toBe("public");
    expect(body.user).toBeNull();
  });

  it("sets authRole to admin for admin JWT", async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    const token = await createToken({
      sub: "admin-1",
      role: "admin",
      email: "admin@test.com",
      displayName: "Admin",
    });

    const res = await app.request("/check", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as CheckBody;
    expect(body.authRole).toBe("admin");
    expect(body.user!.sub).toBe("admin-1");
    process.env.JWT_SECRET = undefined;
  });

  it("sets authRole to human for non-admin JWT", async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    const token = await createToken({
      sub: "user-1",
      role: "human",
      email: "user@test.com",
      displayName: "User",
    });

    const res = await app.request("/check", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as CheckBody;
    expect(body.authRole).toBe("human");
    process.env.JWT_SECRET = undefined;
  });
});
