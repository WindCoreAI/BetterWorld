/**
 * Operator (admin) access.
 *
 * The guardrail review queue is Layer C of the constitution, and it used to be
 * unreachable: it demanded a token with a `role: "admin"` claim that no
 * endpoint ever issued. An operator now signs in like anyone else and is
 * recognised by their account — stored role, or a verified email listed in
 * ADMIN_EMAILS.
 */
import { Hono } from "hono";
import * as jose from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "test-jwt-secret-minimum-32-characters-long-for-validation";

const mockLimit = vi.fn();
vi.mock("../../lib/container.js", () => ({
  getDb: vi.fn(() => ({
    select: () => ({ from: () => ({ where: () => ({ limit: mockLimit }) }) }),
  })),
  getRedis: vi.fn(() => null),
}));

vi.mock("../../lib/activity-tracker.js", () => ({
  trackActivity: vi.fn().mockResolvedValue(undefined),
}));

import type { AppEnv } from "../../app.js";
import { isOperatorAccount, requireAdmin as requireOperator } from "../../middleware/auth.js";
import type { AuthEnv } from "../../middleware/auth.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { humanAuth } from "../../middleware/humanAuth.js";
import { requestId } from "../../middleware/request-id.js";
import { requireAdmin as requireAdminRole } from "../../middleware/requireAdmin.js";

const HUMAN_ID = "11111111-2222-3333-4444-555555555555";

async function sign(payload: jose.JWTPayload, secret = SECRET, expiresIn = "15m") {
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(secret));
}

function human(overrides: Record<string, unknown> = {}) {
  return {
    id: HUMAN_ID,
    email: "person@example.org",
    displayName: "A Person",
    role: "human",
    isActive: true,
    emailVerified: true,
    ...overrides,
  };
}

/** The review-queue style route: guarded by the operator middleware alone. */
function queueApp() {
  const app = new Hono<AuthEnv>();
  app.use("*", requestId());
  app.get("/queue", requireOperator(), (c) => c.json({ ok: true, user: c.get("user"), role: c.get("authRole") }));
  app.onError(errorHandler);
  return app;
}

/** The dashboard style route: humanAuth() then the role check. */
function dashboardApp() {
  const app = new Hono<AppEnv>();
  app.use("*", requestId());
  app.get("/dash", humanAuth(), requireAdminRole(), (c) => c.json({ ok: true, human: c.get("human") }));
  app.onError(errorHandler);
  return app;
}

interface Requestable {
  request: (path: string, init?: RequestInit) => Response | Promise<Response>;
}

const call = async (app: Requestable, path: string, token?: string): Promise<Response> =>
  app.request(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

describe("isOperatorAccount", () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = "ops@example.org";
  });
  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
  });

  it("recognises a stored admin role", () => {
    expect(isOperatorAccount({ role: "admin", email: "x@example.org", emailVerified: false })).toBe(true);
  });

  it("recognises a verified email listed in ADMIN_EMAILS", () => {
    expect(isOperatorAccount({ role: "human", email: "Ops@Example.org", emailVerified: true })).toBe(true);
  });

  it("does not trust a listed email that has not been verified", () => {
    expect(isOperatorAccount({ role: "human", email: "ops@example.org", emailVerified: false })).toBe(false);
  });

  it("does not recognise anyone else", () => {
    expect(isOperatorAccount({ role: "human", email: "person@example.org", emailVerified: true })).toBe(false);
    expect(isOperatorAccount({ role: "moderator", email: "person@example.org", emailVerified: true })).toBe(false);
  });
});

describe("review queue access (requireAdmin)", () => {
  beforeEach(() => {
    mockLimit.mockReset();
    process.env.JWT_SECRET = SECRET;
    process.env.ADMIN_EMAILS = "ops@example.org";
  });
  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
  });

  it("lets an operator in with their normal sign-in token", async () => {
    mockLimit.mockResolvedValue([human({ email: "ops@example.org" })]);
    const res = await call(queueApp(), "/queue", await sign({ userId: HUMAN_ID, email: "ops@example.org" }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { role: string; user: Record<string, string> };
    expect(body.role).toBe("admin");
    // The reviewer identity recorded on claims and reviews is the account id
    expect(body.user).toMatchObject({ sub: HUMAN_ID, role: "admin", email: "ops@example.org" });
  });

  it("lets an account with a stored admin role in, even with ADMIN_EMAILS unset", async () => {
    delete process.env.ADMIN_EMAILS;
    mockLimit.mockResolvedValue([human({ role: "admin" })]);
    const res = await call(queueApp(), "/queue", await sign({ userId: HUMAN_ID }));
    expect(res.status).toBe(200);
  });

  it("turns away an ordinary signed-in person", async () => {
    mockLimit.mockResolvedValue([human()]);
    const res = await call(queueApp(), "/queue", await sign({ userId: HUMAN_ID }));
    expect(res.status).toBe(403);
  });

  it("decides from the account, not from an email claim in the token", async () => {
    // The token says ops@…, the account says otherwise: the account wins.
    mockLimit.mockResolvedValue([human({ email: "person@example.org" })]);
    const res = await call(queueApp(), "/queue", await sign({ userId: HUMAN_ID, email: "ops@example.org" }));
    expect(res.status).toBe(403);
  });

  it("turns away a listed email that is not verified", async () => {
    mockLimit.mockResolvedValue([human({ email: "ops@example.org", emailVerified: false })]);
    const res = await call(queueApp(), "/queue", await sign({ userId: HUMAN_ID }));
    expect(res.status).toBe(403);
  });

  it("turns away a deactivated operator and an unknown account", async () => {
    mockLimit.mockResolvedValue([human({ email: "ops@example.org", isActive: false })]);
    expect((await call(queueApp(), "/queue", await sign({ userId: HUMAN_ID }))).status).toBe(401);

    mockLimit.mockResolvedValue([]);
    expect((await call(queueApp(), "/queue", await sign({ userId: HUMAN_ID }))).status).toBe(401);
  });

  it("does not accept a refresh token as an access token", async () => {
    mockLimit.mockResolvedValue([human({ email: "ops@example.org" })]);
    const res = await call(queueApp(), "/queue", await sign({ userId: HUMAN_ID, type: "refresh" }));
    expect(res.status).toBe(403);
    expect(mockLimit).not.toHaveBeenCalled();
  });

  it("rejects a missing, malformed, wrongly signed or expired token", async () => {
    const app = queueApp();
    expect((await call(app, "/queue")).status).toBe(401);
    expect((await call(app, "/queue", "not-a-jwt")).status).toBe(401);
    expect((await call(app, "/queue", await sign({ userId: HUMAN_ID }, "another-secret-that-is-32-characters-long"))).status).toBe(401);
    expect((await call(app, "/queue", await sign({ userId: HUMAN_ID }, SECRET, "-1m"))).status).toBe(401);
  });

  it("still accepts a service token that carries an explicit admin role claim", async () => {
    const res = await call(queueApp(), "/queue", await sign({ sub: "svc-1", role: "admin", email: "svc@example.org" }));
    expect(res.status).toBe(200);
    expect(mockLimit).not.toHaveBeenCalled();
  });
});

describe("admin dashboards (humanAuth + role check)", () => {
  beforeEach(() => {
    mockLimit.mockReset();
    process.env.JWT_SECRET = SECRET;
    process.env.ADMIN_EMAILS = "ops@example.org";
  });
  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
  });

  it("treats a verified ADMIN_EMAILS account as admin without a database change", async () => {
    mockLimit.mockResolvedValue([human({ email: "ops@example.org" })]);
    const res = await call(dashboardApp(), "/dash", await sign({ userId: HUMAN_ID }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { human: { role: string } };
    expect(body.human.role).toBe("admin");
  });

  it("keeps everyone else out", async () => {
    mockLimit.mockResolvedValue([human()]);
    expect((await call(dashboardApp(), "/dash", await sign({ userId: HUMAN_ID }))).status).toBe(403);

    mockLimit.mockResolvedValue([human({ email: "ops@example.org", emailVerified: false })]);
    expect((await call(dashboardApp(), "/dash", await sign({ userId: HUMAN_ID }))).status).toBe(403);
  });

  it("does not accept a refresh token as an access token", async () => {
    mockLimit.mockResolvedValue([human({ email: "ops@example.org" })]);
    const res = await call(dashboardApp(), "/dash", await sign({ userId: HUMAN_ID, type: "refresh" }));
    expect(res.status).toBe(401);
  });
});
