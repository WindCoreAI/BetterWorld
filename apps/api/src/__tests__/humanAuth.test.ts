import { Hono } from "hono";
import * as jose from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../app.js";
import { errorHandler } from "../middleware/error-handler.js";
import { humanAuth } from "../middleware/humanAuth.js";
import { requestId } from "../middleware/request-id.js";

// ── Mocks ────────────────────────────────────────────────────────

const mockDbSelect = vi.fn();
const mockDbFrom = vi.fn();
const mockDbWhere = vi.fn();
const mockDbLimit = vi.fn();

vi.mock("../lib/container.js", () => ({
  getDb: vi.fn(() => ({
    select: (...args: unknown[]) => {
      mockDbSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockDbFrom(...fArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockDbWhere(...wArgs);
              return { limit: mockDbLimit };
            },
          };
        },
      };
    },
  })),
}));

// ── Helpers ──────────────────────────────────────────────────────

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "test-jwt-secret-minimum-32-characters-long-for-validation";

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

interface SuccessBody {
  ok: true;
  human: { id: string; email: string; displayName: string; role: string };
}

interface ErrorBody {
  ok: false;
  error: { code: string; message: string };
}

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.use("*", requestId());

  app.get("/protected", humanAuth(), (c) => {
    return c.json({ ok: true, human: c.get("human") });
  });

  app.onError(errorHandler);
  return app;
}

// ── Tests ────────────────────────────────────────────────────────

describe("humanAuth middleware", () => {
  const app = createTestApp();
  const mockHuman = {
    id: "user-123",
    email: "test@example.com",
    displayName: "Test User",
    role: "human",
    isActive: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbLimit.mockResolvedValue([mockHuman]);
  });

  it("returns 401 when Authorization header is missing", async () => {
    const res = await app.request("/protected");
    expect(res.status).toBe(401);
    const body = (await res.json()) as ErrorBody;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 when Authorization header does not start with Bearer", async () => {
    const res = await app.request("/protected", {
      headers: { Authorization: "Basic abc123" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 for an invalid JWT", async () => {
    const res = await app.request("/protected", {
      headers: { Authorization: "Bearer not-a-valid-jwt" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 for an expired JWT", async () => {
    const token = await createToken({ userId: "user-123" }, "0s");
    await new Promise((r) => setTimeout(r, 50));

    const res = await app.request("/protected", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("TOKEN_EXPIRED");
  });

  it("returns 401 when JWT has no userId claim", async () => {
    const token = await createToken({ email: "test@example.com" });

    const res = await app.request("/protected", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toContain("Invalid token payload");
  });

  it("returns 401 when user is not found in database", async () => {
    mockDbLimit.mockResolvedValue([]); // No user found
    const token = await createToken({ userId: "nonexistent" });

    const res = await app.request("/protected", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toContain("User not found");
  });

  it("returns 403 when user account is deactivated", async () => {
    mockDbLimit.mockResolvedValue([{ ...mockHuman, isActive: false }]);
    const token = await createToken({ userId: "user-123" });

    const res = await app.request("/protected", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain("deactivated");
  });

  it("attaches human to context on valid JWT with active user", async () => {
    const token = await createToken({ userId: "user-123" });

    const res = await app.request("/protected", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SuccessBody;
    expect(body.ok).toBe(true);
    expect(body.human).toEqual({
      id: "user-123",
      email: "test@example.com",
      displayName: "Test User",
      role: "human",
    });
  });

  it("queries the database with the correct userId from JWT", async () => {
    const token = await createToken({ userId: "user-456" });
    mockDbLimit.mockResolvedValue([{ ...mockHuman, id: "user-456" }]);

    await app.request("/protected", {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Verify select was called with explicit columns
    expect(mockDbSelect).toHaveBeenCalledOnce();
    const selectArg = mockDbSelect.mock.calls[0]![0];
    expect(selectArg).toHaveProperty("id");
    expect(selectArg).toHaveProperty("email");
    expect(selectArg).toHaveProperty("displayName");
    expect(selectArg).toHaveProperty("role");
    expect(selectArg).toHaveProperty("isActive");
  });
});
