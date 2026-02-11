/**
 * Admin Dispute Resolution Tests (Sprint 8 -- T044)
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../../app.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { requestId } from "../../middleware/request-id.js";

const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbReturning = vi.fn();

function resetDbChain() {
  const limitFn = vi.fn().mockResolvedValue([]);
  const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
  const whereFn = vi.fn().mockReturnValue({
    limit: limitFn,
    orderBy: orderByFn,
    returning: mockDbReturning,
  });
  const fromFn = vi.fn().mockReturnValue({
    where: whereFn,
    limit: limitFn,
    orderBy: orderByFn,
    innerJoin: vi.fn().mockReturnValue({
      where: whereFn,
      orderBy: orderByFn,
      limit: limitFn,
      innerJoin: vi.fn().mockReturnValue({ where: whereFn, orderBy: orderByFn, limit: limitFn }),
    }),
  });
  mockDbSelect.mockReturnValue({ from: fromFn });
  mockDbInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({ returning: mockDbReturning }),
  });
  mockDbUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
}

vi.mock("../../../src/lib/container.js", () => ({
  getDb: vi.fn(() => ({
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    transaction: vi.fn(async (cb) => cb({
      select: mockDbSelect,
      insert: mockDbInsert,
      update: mockDbUpdate,
      execute: vi.fn().mockResolvedValue([{ id: "h1", token_balance: "100" }]),
    })),
  })),
  getRedis: vi.fn(() => null),
}));

const MOCK_ADMIN = {
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  email: "admin@example.com",
  displayName: "Admin",
  role: "admin",
};

vi.mock("../../../src/middleware/humanAuth.js", () => ({
  humanAuth: () => {
    return async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
      c.set("human", MOCK_ADMIN);
      await next();
    };
  },
}));

vi.mock("../../../src/lib/reward-helpers.js", () => ({
  distributeEvidenceReward: vi.fn().mockResolvedValue({ rewardAmount: 50, transactionId: "tx-1" }),
}));

describe("Admin Disputes", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDbReturning.mockReset();
    resetDbChain();

    const { default: disputeRoutes } = await import("../../routes/admin/disputes.js");
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/api/v1/admin/disputes", disputeRoutes);
    app.onError(errorHandler);
  });

  describe("GET /", () => {
    it("should list disputes for admin", async () => {
      const res = await app.request("/api/v1/admin/disputes");
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; data: { disputes: unknown[] } };
      expect(body.ok).toBe(true);
      expect(body.data.disputes).toBeDefined();
    });
  });

  describe("POST /:evidenceId/resolve", () => {
    it("should reject invalid evidence UUID", async () => {
      const res = await app.request("/api/v1/admin/disputes/not-a-uuid/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approve", reasoning: "Valid evidence, GPS offset acceptable" }),
      });
      expect(res.status).toBe(422);
    });

    it("should reject invalid decision", async () => {
      const res = await app.request(
        "/api/v1/admin/disputes/11111111-2222-3333-4444-555555555555/resolve",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "maybe", reasoning: "x" }),
        },
      );
      expect(res.status).toBe(422);
    });

    it("should return 404 for non-existent evidence", async () => {
      const res = await app.request(
        "/api/v1/admin/disputes/11111111-2222-3333-4444-555555555555/resolve",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "approve", reasoning: "Valid evidence with clear photo" }),
        },
      );
      expect(res.status).toBe(404);
    });
  });
});
