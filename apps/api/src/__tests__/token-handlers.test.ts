import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../app.js";
import { errorHandler } from "../middleware/error-handler.js";
import { requestId } from "../middleware/request-id.js";

// ── Mock types ───────────────────────────────────────────────────

interface MockTransaction {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

// ── Mocks ────────────────────────────────────────────────────────

const mockTxSelect = vi.fn();
const mockTxInsert = vi.fn();
const mockTxUpdate = vi.fn();
const mockTxReturning = vi.fn();
const mockTxForUpdate = vi.fn();

function createMockTx(): MockTransaction {
  // Chain: select().from().where().for("update").limit()
  const limitFn = vi.fn();
  mockTxForUpdate.mockReturnValue({ limit: limitFn });
  const whereFn = vi.fn().mockReturnValue({ for: mockTxForUpdate, limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  mockTxSelect.mockReturnValue({ from: fromFn });

  // Chain: insert().values().returning()
  const valuesFn = vi.fn().mockReturnValue({ returning: mockTxReturning });
  mockTxInsert.mockReturnValue({ values: valuesFn });

  // Chain: update().set().where()
  const setFn = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  mockTxUpdate.mockReturnValue({ set: setFn });

  return {
    select: mockTxSelect,
    insert: mockTxInsert,
    update: mockTxUpdate,
  };
}

// Mock container — db.transaction() calls the callback with mockTx
const mockTx = createMockTx();
const mockTransaction = vi.fn(async (cb: (tx: MockTransaction) => Promise<unknown>) => cb(mockTx));

const mockDbSelect = vi.fn();
const mockRedisGet = vi.fn();
const mockRedisSetex = vi.fn();

vi.mock("../../src/lib/container.js", () => ({
  getDb: vi.fn(() => ({
    transaction: mockTransaction,
    select: mockDbSelect,
  })),
  getRedis: vi.fn(() => ({
    get: mockRedisGet,
    setex: mockRedisSetex,
  })),
}));

// Mock humanAuth to bypass JWT verification in handler tests
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

// ── Helpers ──────────────────────────────────────────────────────

interface SuccessBody {
  ok: true;
  data: {
    transaction: { id: string; amount: number; balanceBefore: number; balanceAfter: number };
    newBalance: number;
  };
  requestId: string;
}

interface ErrorBody {
  ok: false;
  error: { code: string; message: string };
  requestId: string;
}

// ── Tests ────────────────────────────────────────────────────────

describe("Token Routes", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSetex.mockResolvedValue("OK");

    // Reset the mock transaction chain for each test
    const limitFn = vi.fn();
    mockTxForUpdate.mockReturnValue({ limit: limitFn });
    const whereFn = vi.fn().mockReturnValue({ for: mockTxForUpdate, limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    mockTxSelect.mockReturnValue({ from: fromFn });

    const valuesFn = vi.fn().mockReturnValue({ returning: mockTxReturning });
    mockTxInsert.mockReturnValue({ values: valuesFn });

    const setFn = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    mockTxUpdate.mockReturnValue({ set: setFn });

    // Dynamically import routes after mocks are set up
    const tokenRoutes = (await import("../routes/tokens/index.js")).default;
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/tokens", tokenRoutes);
    app.onError(errorHandler);
  });

  describe("POST /tokens/orientation-reward", () => {
    it("returns reward with correct double-entry fields", async () => {
      // Mock: user has 0 balance
      const limitFn = vi.fn();
      // First call returns user balance, second returns profile
      limitFn
        .mockResolvedValueOnce([{ tokenBalance: "0" }])  // user balance
        .mockResolvedValueOnce([{ humanId: "user-123", orientationCompletedAt: null, totalTokensEarned: 0 }]); // profile

      mockTxForUpdate.mockReturnValue({ limit: limitFn });
      const whereFn = vi.fn().mockReturnValue({ for: mockTxForUpdate, limit: limitFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      mockTxSelect.mockReturnValue({ from: fromFn });

      // Mock transaction insert returning
      const mockTxn = {
        id: "txn-1",
        humanId: "user-123",
        amount: 10,
        balanceBefore: 0,
        balanceAfter: 10,
        transactionType: "earn_orientation",
      };
      mockTxReturning.mockResolvedValue([mockTxn]);

      const res = await app.request("/tokens/orientation-reward", {
        method: "POST",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      expect(body.data.newBalance).toBe(10);
      expect(body.data.transaction.balanceBefore).toBe(0);
      expect(body.data.transaction.balanceAfter).toBe(10);
      expect(body.data.transaction.amount).toBe(10);
    });

    it("rejects duplicate orientation reward claim", async () => {
      const limitFn = vi.fn();
      limitFn
        .mockResolvedValueOnce([{ tokenBalance: "10" }])
        .mockResolvedValueOnce([{
          humanId: "user-123",
          orientationCompletedAt: new Date(), // Already claimed
          totalTokensEarned: 10,
        }]);

      mockTxForUpdate.mockReturnValue({ limit: limitFn });
      const whereFn = vi.fn().mockReturnValue({ for: mockTxForUpdate, limit: limitFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      mockTxSelect.mockReturnValue({ from: fromFn });

      const res = await app.request("/tokens/orientation-reward", {
        method: "POST",
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("REWARD_ALREADY_CLAIMED");
    });

    it("returns 404 when profile does not exist", async () => {
      const limitFn = vi.fn();
      limitFn
        .mockResolvedValueOnce([{ tokenBalance: "0" }])
        .mockResolvedValueOnce([]); // No profile

      mockTxForUpdate.mockReturnValue({ limit: limitFn });
      const whereFn = vi.fn().mockReturnValue({ for: mockTxForUpdate, limit: limitFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      mockTxSelect.mockReturnValue({ from: fromFn });

      const res = await app.request("/tokens/orientation-reward", {
        method: "POST",
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("PROFILE_NOT_FOUND");
    });
  });

  describe("POST /tokens/spend", () => {
    it("deducts tokens and records correct double-entry fields", async () => {
      const limitFn = vi.fn();
      limitFn.mockResolvedValueOnce([{ tokenBalance: "50" }]); // User has 50

      mockTxForUpdate.mockReturnValue({ limit: limitFn });
      const whereFn = vi.fn().mockReturnValue({ for: mockTxForUpdate, limit: limitFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      mockTxSelect.mockReturnValue({ from: fromFn });

      const mockTxn = {
        id: "txn-2",
        humanId: "user-123",
        amount: -10,
        balanceBefore: 50,
        balanceAfter: 40,
        transactionType: "spend_vote",
      };
      mockTxReturning.mockResolvedValue([mockTxn]);

      const res = await app.request("/tokens/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: 10,
          type: "spend_vote",
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      expect(body.data.newBalance).toBe(40);
      expect(body.data.transaction.amount).toBe(-10);
      expect(body.data.transaction.balanceBefore).toBe(50);
      expect(body.data.transaction.balanceAfter).toBe(40);
    });

    it("rejects spend when balance is insufficient", async () => {
      // Mock the transaction to throw INSUFFICIENT_BALANCE
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

    it("returns cached response for duplicate idempotency key", async () => {
      const cachedResponse = JSON.stringify({
        ok: true,
        data: { transaction: { id: "txn-cached" }, newBalance: 40 },
      });
      mockRedisGet.mockResolvedValueOnce(cachedResponse);

      const res = await app.request("/tokens/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: 10,
          type: "spend_vote",
          idempotencyKey: "test-key-123",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect((body as { ok: boolean }).ok).toBe(true);
      // Should not have started a transaction
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("rejects invalid spend type", async () => {
      const res = await app.request("/tokens/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: 10,
          type: "invalid_type",
        }),
      });

      // Zod validation should reject it
      expect(res.status).toBe(400);
    });

    it("rejects non-positive amount", async () => {
      const res = await app.request("/tokens/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: 0,
          type: "spend_vote",
        }),
      });

      expect(res.status).toBe(400);
    });
  });
});
