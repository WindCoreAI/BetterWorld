/**
 * Peer Review Integration Tests (Sprint 8 -- T026)
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
      leftJoin: vi.fn().mockReturnValue({ where: whereFn, orderBy: orderByFn, limit: limitFn }),
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
      execute: vi.fn().mockResolvedValue([]),
    })),
  })),
  getRedis: vi.fn(() => ({
    get: vi.fn().mockResolvedValue(null),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue("OK"),
  })),
}));

const MOCK_HUMAN = {
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  email: "reviewer@example.com",
  displayName: "Reviewer",
  role: "human",
};

vi.mock("../../../src/middleware/humanAuth.js", () => ({
  humanAuth: () => {
    return async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
      c.set("human", MOCK_HUMAN);
      await next();
    };
  },
}));

vi.mock("../../../src/lib/reward-helpers.js", () => ({
  distributeEvidenceReward: vi.fn().mockResolvedValue(null),
  distributePeerReviewReward: vi.fn().mockResolvedValue({ rewardAmount: 2, transactionId: "tx-1" }),
}));

vi.mock("../../../src/lib/evidence-helpers.js", () => ({
  haversineDistance: vi.fn().mockReturnValue(100),
}));

describe("Peer Review Routes", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDbReturning.mockReset();
    resetDbChain();

    const { default: peerReviewRoutes } = await import("../../routes/peer-reviews/index.js");
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/api/v1/peer-reviews", peerReviewRoutes);
    app.onError(errorHandler);
  });

  describe("GET /pending", () => {
    it("should return pending reviews", async () => {
      const res = await app.request("/api/v1/peer-reviews/pending");
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; data: { reviews: unknown[] } };
      expect(body.ok).toBe(true);
      expect(body.data.reviews).toBeDefined();
    });
  });

  describe("GET /history", () => {
    it("should return review history", async () => {
      const res = await app.request("/api/v1/peer-reviews/history");
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; data: { reviews: unknown[] } };
      expect(body.ok).toBe(true);
      expect(body.data.reviews).toBeDefined();
    });
  });

  describe("POST /:evidenceId/vote", () => {
    it("should reject invalid evidence UUID", async () => {
      const res = await app.request("/api/v1/peer-reviews/not-a-uuid/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verdict: "approve",
          confidence: 0.85,
          reasoning: "This evidence looks good and matches the mission requirements",
        }),
      });
      expect(res.status).toBe(422);
    });

    it("should reject vote on non-existent evidence", async () => {
      const res = await app.request(
        "/api/v1/peer-reviews/11111111-2222-3333-4444-555555555555/vote",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            verdict: "approve",
            confidence: 0.85,
            reasoning: "This evidence looks good and matches the mission requirements",
          }),
        },
      );
      expect(res.status).toBe(404);
    });

    it("should reject invalid vote body", async () => {
      const res = await app.request(
        "/api/v1/peer-reviews/11111111-2222-3333-4444-555555555555/vote",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            verdict: "invalid",
            confidence: 2.0,
            reasoning: "too short",
          }),
        },
      );
      expect(res.status).toBe(422);
    });
  });
});
