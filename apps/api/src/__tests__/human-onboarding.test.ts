/**
 * Human Onboarding Flow Tests (Sprint 6 — SC-014)
 *
 * 16 tests covering: registration, verification, login, profile,
 * orientation reward, token spending, dashboard, and edge cases.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../app.js";
import { errorHandler } from "../middleware/error-handler.js";
import { requestId } from "../middleware/request-id.js";

// ── Mock infrastructure ────────────────────────────────────────────

// DB chainable mocks
const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbReturning = vi.fn();

// Transaction mocks
const mockTxSelect = vi.fn();
const mockTxInsert = vi.fn();
const mockTxUpdate = vi.fn();
const mockTxReturning = vi.fn();
const mockTxForUpdate = vi.fn();

function resetDbChain() {
  const limitFn = vi.fn().mockResolvedValue([]);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn, for: mockTxForUpdate });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn, limit: limitFn });
  mockDbSelect.mockReturnValue({ from: fromFn });

  const valuesReturningFn = vi.fn().mockReturnValue({ returning: mockDbReturning });
  mockDbInsert.mockReturnValue({ values: valuesReturningFn });

  const setFn = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  mockDbUpdate.mockReturnValue({ set: setFn });

  return { limitFn, whereFn, fromFn };
}

function resetTxChain() {
  const limitFn = vi.fn().mockResolvedValue([]);
  mockTxForUpdate.mockReturnValue({ limit: limitFn });
  const whereFn = vi.fn().mockReturnValue({ for: mockTxForUpdate, limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  mockTxSelect.mockReturnValue({ from: fromFn });

  const valuesFn = vi.fn().mockReturnValue({ returning: mockTxReturning });
  mockTxInsert.mockReturnValue({ values: valuesFn });

  const setFn = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  mockTxUpdate.mockReturnValue({ set: setFn });

  return { limitFn };
}

const mockTransaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
  cb({ select: mockTxSelect, insert: mockTxInsert, update: mockTxUpdate }),
);

// Redis mocks
const mockRedisGet = vi.fn().mockResolvedValue(null);
const mockRedisSetex = vi.fn().mockResolvedValue("OK");
const mockRedisDel = vi.fn().mockResolvedValue(1);
const mockRedisPipeline = vi.fn().mockReturnValue({
  zremrangebyscore: vi.fn().mockReturnThis(),
  zcard: vi.fn().mockReturnThis(),
  zadd: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([[null, 0], [null, 0], [null, 1], [null, 1]]),
});

vi.mock("../../src/lib/container.js", () => ({
  getDb: vi.fn(() => ({
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    transaction: mockTransaction,
  })),
  getRedis: vi.fn(() => ({
    get: mockRedisGet,
    setex: mockRedisSetex,
    del: mockRedisDel,
    pipeline: mockRedisPipeline,
  })),
}));

// Mock bcrypt (slow in tests)
vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("$2b$12$mockedHashValue"),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

// Mock auth-helpers for token generation
vi.mock("../../src/lib/auth-helpers.js", () => ({
  generateTokenPair: vi.fn().mockResolvedValue({
    accessToken: "mock-access-token",
    refreshToken: "mock-refresh-token",
    expiresIn: 900,
  }),
}));

// Mock humanAuth middleware to bypass JWT verification
vi.mock("../../src/middleware/humanAuth.js", () => ({
  humanAuth: () => {
    return async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
      c.set("human", {
        id: "user-123",
        email: "test@example.com",
        displayName: "Test User",
        role: "human",
      });
      await next();
    };
  },
}));

// Mock logger
vi.mock("../../src/middleware/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock geocode to avoid real HTTP calls to Nominatim
vi.mock("@betterworld/shared/utils/geocode", () => ({
  geocodeLocation: vi.fn().mockResolvedValue(null),
  parsePostGISPoint: vi.fn().mockReturnValue(null),
}));

// ── Response types ──────────────────────────────────────────────────

interface SuccessBody<T = unknown> {
  ok: true;
  data: T;
  requestId: string;
}

interface ErrorBody {
  ok: false;
  error: { code: string; message: string };
  requestId: string;
}

// ── Test Suites ─────────────────────────────────────────────────────

describe("Human Onboarding Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset returning mocks to clear once-value queues (clearAllMocks only clears call tracking)
    mockDbReturning.mockReset();
    mockTxReturning.mockReset();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSetex.mockResolvedValue("OK");
    resetDbChain();
    resetTxChain();
  });

  // ── Registration ──────────────────────────────────────────────

  describe("POST /register — Email/Password Registration", () => {
    let app: Hono<AppEnv>;

    beforeEach(async () => {
      const registerRoutes = (await import("../routes/auth/register.js")).default;
      app = new Hono<AppEnv>();
      app.use("*", requestId());
      app.route("/register", registerRoutes);
      app.onError(errorHandler);
    });

    it("creates a new user and returns 201 with userId", async () => {
      const { limitFn } = resetDbChain();
      limitFn.mockResolvedValueOnce([]); // No existing user
      mockDbReturning.mockResolvedValueOnce([
        { id: "new-user-id", email: "new@example.com" },
      ]);

      const res = await app.request("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "new@example.com",
          password: "Abc12345",
          displayName: "New User",
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as SuccessBody<{ userId: string; email: string; message: string }>;
      expect(body.ok).toBe(true);
      expect(body.data.userId).toBe("new-user-id");
      expect(body.data.email).toBe("new@example.com");
      expect(body.data.message).toContain("Verification code sent");
    });

    it("returns 400 EMAIL_EXISTS for duplicate email", async () => {
      const { limitFn } = resetDbChain();
      limitFn.mockResolvedValueOnce([{ id: "existing-id" }]); // User exists

      const res = await app.request("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "existing@example.com",
          password: "Abc12345",
          displayName: "Existing User",
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("EMAIL_EXISTS");
    });

    it("rejects invalid password (too short)", async () => {
      const res = await app.request("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "short",
          displayName: "Test",
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  // ── Login ─────────────────────────────────────────────────────

  describe("POST /login — Email/Password Login", () => {
    let app: Hono<AppEnv>;

    beforeEach(async () => {
      const loginRoutes = (await import("../routes/auth/login.js")).default;
      app = new Hono<AppEnv>();
      app.use("*", requestId());
      app.route("/login", loginRoutes);
      app.onError(errorHandler);
    });

    it("returns access and refresh tokens on valid credentials", async () => {
      const { limitFn } = resetDbChain();
      limitFn.mockResolvedValueOnce([{
        id: "user-123",
        email: "test@example.com",
        passwordHash: "$2b$12$validHash",
        emailVerified: true,
        isActive: true,
        displayName: "Test User",
        avatarUrl: null,
      }]);
      // Mock session insert
      mockDbReturning.mockResolvedValueOnce([{ id: "session-1" }]);

      const res = await app.request("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "Abc12345",
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        user: { id: string; email: string };
      }>;
      expect(body.ok).toBe(true);
      expect(body.data.accessToken).toBeTruthy();
      expect(body.data.refreshToken).toBeTruthy();
      expect(body.data.expiresIn).toBe(900);
      expect(body.data.user.id).toBe("user-123");
    });

    it("returns 401 INVALID_CREDENTIALS for wrong password", async () => {
      const bcrypt = await import("bcrypt");
      (bcrypt.default.compare as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

      const { limitFn } = resetDbChain();
      limitFn.mockResolvedValueOnce([{
        id: "user-123",
        email: "test@example.com",
        passwordHash: "$2b$12$validHash",
        emailVerified: true,
        isActive: true,
      }]);

      const res = await app.request("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "WrongPassword1",
        }),
      });

      expect(res.status).toBe(401);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("INVALID_CREDENTIALS");
    });

    it("returns 403 EMAIL_NOT_VERIFIED before email verification", async () => {
      const { limitFn } = resetDbChain();
      limitFn.mockResolvedValueOnce([{
        id: "user-123",
        email: "test@example.com",
        passwordHash: "$2b$12$validHash",
        emailVerified: false, // Not verified
        isActive: true,
      }]);

      const res = await app.request("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "Abc12345",
        }),
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("EMAIL_NOT_VERIFIED");
    });

    it("returns 401 for non-existent user", async () => {
      const { limitFn } = resetDbChain();
      limitFn.mockResolvedValueOnce([]); // No user

      const res = await app.request("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "nonexistent@example.com",
          password: "Abc12345",
        }),
      });

      expect(res.status).toBe(401);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("INVALID_CREDENTIALS");
    });
  });

  // ── Profile ───────────────────────────────────────────────────

  describe("Profile CRUD", () => {
    let app: Hono<AppEnv>;

    beforeEach(async () => {
      const profileRoutes = (await import("../routes/profile/index.js")).default;
      app = new Hono<AppEnv>();
      app.use("*", requestId());
      app.route("/profile", profileRoutes);
      app.onError(errorHandler);
    });

    it("POST /profile creates profile with completeness score", async () => {
      const { limitFn } = resetDbChain();
      limitFn.mockResolvedValueOnce([]); // No existing profile

      const mockProfile = {
        humanId: "user-123",
        skills: ["TypeScript", "Design"],
        city: "San Francisco",
        country: "United States",
        languages: ["en"],
        profileCompletenessScore: 65,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockDbReturning.mockResolvedValueOnce([mockProfile]);

      const res = await app.request("/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skills: ["TypeScript", "Design"],
          city: "San Francisco",
          country: "United States",
          languages: ["en"],
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as SuccessBody<{ humanId: string; skills: string[] }>;
      expect(body.ok).toBe(true);
      expect(body.data.humanId).toBe("user-123");
    });

    it("POST /profile returns 400 for duplicate profile", async () => {
      const { limitFn } = resetDbChain();
      limitFn.mockResolvedValueOnce([{ humanId: "user-123" }]); // Profile exists

      const res = await app.request("/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skills: ["TypeScript"],
          city: "NYC",
          country: "US",
          languages: ["en"],
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("PROFILE_EXISTS");
    });

    it("GET /profile returns profile with completeness breakdown", async () => {
      const { limitFn } = resetDbChain();
      limitFn.mockResolvedValueOnce([{
        humanId: "user-123",
        skills: ["TypeScript", "Design"],
        city: "San Francisco",
        country: "United States",
        languages: ["en", "es"],
        availability: null,
        bio: "I build things",
        walletAddress: null,
        certifications: [],
        orientationCompletedAt: null,
        profileCompletenessScore: 65,
        location: null,
        serviceRadius: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      }]);

      const res = await app.request("/profile");
      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{ humanId: string; completeness: { score: number } }>;
      expect(body.ok).toBe(true);
      expect(body.data.humanId).toBe("user-123");
    });
  });

  // ── Token Operations ──────────────────────────────────────────

  describe("Token Operations", () => {
    let app: Hono<AppEnv>;

    beforeEach(async () => {
      const tokenRoutes = (await import("../routes/tokens/index.js")).default;
      app = new Hono<AppEnv>();
      app.use("*", requestId());
      app.route("/tokens", tokenRoutes);
      app.onError(errorHandler);
    });

    it("POST /tokens/orientation-reward credits 10 IT with double-entry", async () => {
      const { limitFn } = resetTxChain();
      limitFn
        .mockResolvedValueOnce([{ tokenBalance: "0" }])
        .mockResolvedValueOnce([{
          humanId: "user-123",
          orientationCompletedAt: null,
          totalTokensEarned: 0,
        }]);

      mockTxReturning.mockResolvedValue([{
        id: "txn-1",
        humanId: "user-123",
        amount: 10,
        balanceBefore: 0,
        balanceAfter: 10,
        transactionType: "earn_orientation",
      }]);

      const res = await app.request("/tokens/orientation-reward", {
        method: "POST",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{
        transaction: { amount: number; balanceBefore: number; balanceAfter: number };
        newBalance: number;
      }>;
      expect(body.ok).toBe(true);
      expect(body.data.newBalance).toBe(10);
      expect(body.data.transaction.balanceBefore).toBe(0);
      expect(body.data.transaction.balanceAfter).toBe(10);
    });

    it("POST /tokens/orientation-reward rejects duplicate claim", async () => {
      const { limitFn } = resetTxChain();
      limitFn
        .mockResolvedValueOnce([{ tokenBalance: "10" }])
        .mockResolvedValueOnce([{
          humanId: "user-123",
          orientationCompletedAt: new Date(),
          totalTokensEarned: 10,
        }]);

      const res = await app.request("/tokens/orientation-reward", {
        method: "POST",
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("REWARD_ALREADY_CLAIMED");
    });

    it("POST /tokens/spend deducts tokens correctly", async () => {
      const { limitFn } = resetTxChain();
      limitFn.mockResolvedValueOnce([{ tokenBalance: "50" }]);

      mockTxReturning.mockResolvedValue([{
        id: "txn-2",
        humanId: "user-123",
        amount: -5,
        balanceBefore: 50,
        balanceAfter: 45,
        transactionType: "spend_vote",
      }]);

      const res = await app.request("/tokens/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: 5,
          type: "spend_vote",
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as SuccessBody<{
        transaction: { amount: number; balanceBefore: number; balanceAfter: number };
        newBalance: number;
      }>;
      expect(body.ok).toBe(true);
      expect(body.data.newBalance).toBe(45);
      expect(body.data.transaction.amount).toBe(-5);
    });

    it("POST /tokens/spend rejects insufficient balance", async () => {
      mockTransaction.mockRejectedValueOnce(new Error("INSUFFICIENT_BALANCE"));

      const res = await app.request("/tokens/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: 100,
          type: "spend_vote",
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("INSUFFICIENT_BALANCE");
    });

    it("POST /tokens/spend returns cached response for duplicate idempotency key", async () => {
      const cachedResponse = JSON.stringify({
        ok: true,
        data: { transaction: { id: "txn-cached" }, newBalance: 45 },
      });
      mockRedisGet.mockResolvedValueOnce(cachedResponse);

      const res = await app.request("/tokens/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: 5,
          type: "spend_vote",
          idempotencyKey: "idempotent-key-1",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect((body as { ok: boolean }).ok).toBe(true);
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("GET /tokens/balance returns correct totals", async () => {
      // Route runs 3 parallel db.select() calls via Promise.all
      // Each needs its own mock chain (mockReturnValueOnce consumed in order)
      mockDbSelect
        // Query 1: user balance — .select().from(humans).where().limit(1)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ tokenBalance: "45" }]),
            }),
          }),
        })
        // Query 2: profile earned — .select().from(humanProfiles).where().limit(1)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ totalTokensEarned: 50 }]),
            }),
          }),
        })
        // Query 3: spent total — .select().from(tokenTransactions).where() (no .limit)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ total: 5 }]),
          }),
        });

      const res = await app.request("/tokens/balance");
      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{ balance: number; totalEarned: number; totalSpent: number }>;
      expect(body.ok).toBe(true);
      expect(body.data.balance).toBe(45);
      expect(body.data.totalEarned).toBe(50);
      expect(body.data.totalSpent).toBe(5);
    });
  });

  // ── Dashboard ─────────────────────────────────────────────────

  describe("GET /dashboard — Aggregated Data", () => {
    let app: Hono<AppEnv>;

    beforeEach(async () => {
      const dashboardRoutes = (await import("../routes/dashboard/index.js")).default;
      app = new Hono<AppEnv>();
      app.use("*", requestId());
      app.route("/dashboard", dashboardRoutes);
      app.onError(errorHandler);
    });

    it("returns aggregated user data in a single request", async () => {
      // Dashboard runs 3 parallel db.select() (Promise.all) + 1 sequential (recent activity)
      mockDbSelect
        // Query 1: user data — .select({...}).from(humans).where().limit(1)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{
                id: "user-123",
                email: "test@example.com",
                displayName: "Test User",
                avatarUrl: null,
                emailVerified: true,
                tokenBalance: "10",
                reputationScore: "0",
              }]),
            }),
          }),
        })
        // Query 2: profile — .select().from(humanProfiles).where().limit(1)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{
                humanId: "user-123",
                skills: ["TypeScript"],
                city: "SF",
                country: "US",
                languages: ["en"],
                bio: null,
                availability: null,
                walletAddress: null,
                certifications: [],
                orientationCompletedAt: new Date(),
                totalTokensEarned: 10,
                totalMissionsCompleted: 0,
                streakDays: 0,
                profileCompletenessScore: 50,
                location: null,
              }]),
            }),
          }),
        })
        // Query 3: spent total — .select({total}).from(tokenTransactions).where() (no .limit)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ total: 0 }]),
          }),
        })
        // Query 4: recent activity — .select().from(tokenTransactions).where().orderBy().limit(10)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        });

      const res = await app.request("/dashboard");
      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{
        user: { id: string };
        tokens: { balance: number };
        profile: { orientationCompleted: boolean };
      }>;
      expect(body.ok).toBe(true);
      expect(body.data.user.id).toBe("user-123");
      expect(body.data.tokens.balance).toBe(10);
      expect(body.data.profile.orientationCompleted).toBe(true);
    });
  });
});
