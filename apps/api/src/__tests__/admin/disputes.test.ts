/**
 * Admin Dispute Resolution Tests (Sprint 8 -- T044)
 *
 * Tests for:
 *   GET /api/v1/admin/disputes - List appealed evidence disputes
 *   POST /api/v1/admin/disputes/:evidenceId/resolve - Resolve dispute (approve/reject)
 *
 * Covers: happy paths, admin auth/RBAC, validation, edge cases (wrong stage, reward distribution)
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../../app.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { requestId } from "../../middleware/request-id.js";

// ── Mock infrastructure ────────────────────────────────────────────

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
    transaction: vi.fn(async (cb) =>
      cb({
        select: mockDbSelect,
        insert: mockDbInsert,
        update: mockDbUpdate,
        execute: vi.fn().mockResolvedValue([{ id: "h1", token_balance: "100" }]),
      }),
    ),
  })),
  getRedis: vi.fn(() => null),
}));

// ── Configurable auth mock ──────────────────────────────────────────

const MOCK_ADMIN = {
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  email: "admin@example.com",
  displayName: "Admin",
  role: "admin",
};

let currentMockHuman = { ...MOCK_ADMIN };

vi.mock("../../../src/middleware/humanAuth.js", () => ({
  humanAuth: () => {
    return async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
      c.set("human", currentMockHuman);
      await next();
    };
  },
}));

const mockDistributeReward = vi.fn().mockResolvedValue({ rewardAmount: 50, transactionId: "tx-1" });

vi.mock("../../../src/lib/reward-helpers.js", () => ({
  distributeEvidenceReward: (...args: unknown[]) => mockDistributeReward(...args),
}));

vi.mock("../../../src/lib/evidence-helpers.js", () => ({
  haversineDistance: vi.fn().mockReturnValue(150),
}));

// Suppress log noise
vi.mock("../../../src/middleware/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Response types ──────────────────────────────────────────────────

interface SuccessBody<T = unknown> {
  ok: true;
  data: T;
  meta?: { hasMore: boolean; count: number };
  requestId: string;
}

interface ErrorBody {
  ok: false;
  error: { code: string; message: string; details?: unknown };
  requestId: string;
}

// ── Test constants ──────────────────────────────────────────────────

const VALID_EVIDENCE_ID = "11111111-2222-3333-4444-555555555555";

/** Helper: create a select chain for a single-row lookup */
function singleRowSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

// ── Test suites ─────────────────────────────────────────────────────

describe("Admin Disputes", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDbReturning.mockReset();
    mockDistributeReward.mockReset();
    mockDistributeReward.mockResolvedValue({ rewardAmount: 50, transactionId: "tx-1" });
    resetDbChain();

    // Reset to admin user
    currentMockHuman = { ...MOCK_ADMIN };

    const { default: disputeRoutes } = await import("../../routes/admin/disputes.js");
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/api/v1/admin/disputes", disputeRoutes);
    app.onError(errorHandler);
  });

  // ── GET / — List disputes ────────────────────────────────────────

  describe("GET / — List disputes", () => {
    it("should list disputes for admin with empty result", async () => {
      const res = await app.request("/api/v1/admin/disputes");
      expect(res.status).toBe(200);

      const body = (await res.json()) as SuccessBody<{
        disputes: unknown[];
        nextCursor: string | null;
      }>;
      expect(body.ok).toBe(true);
      expect(body.data.disputes).toBeDefined();
      expect(body.data.disputes).toHaveLength(0);
      expect(body.data.nextCursor).toBeNull();
      expect(body.meta?.hasMore).toBe(false);
      expect(body.meta?.count).toBe(0);
    });

    it("should return 403 for non-admin user", async () => {
      currentMockHuman = {
        id: "cccccccc-dddd-eeee-ffff-000000000000",
        email: "human@example.com",
        displayName: "Regular Human",
        role: "human",
      };

      const res = await app.request("/api/v1/admin/disputes");
      expect(res.status).toBe(403);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toContain("Admin access required");
    });

    it("should accept status=resolved query parameter", async () => {
      const res = await app.request("/api/v1/admin/disputes?status=resolved");
      expect(res.status).toBe(200);

      const body = (await res.json()) as SuccessBody<{ disputes: unknown[] }>;
      expect(body.ok).toBe(true);
      expect(body.data.disputes).toBeDefined();
    });

    it("should accept limit query parameter", async () => {
      const res = await app.request("/api/v1/admin/disputes?limit=5");
      expect(res.status).toBe(200);

      const body = (await res.json()) as SuccessBody<{ disputes: unknown[] }>;
      expect(body.ok).toBe(true);
    });

    it("should reject invalid status query parameter", async () => {
      const res = await app.request("/api/v1/admin/disputes?status=invalid");
      expect(res.status).toBe(422);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should reject limit out of range", async () => {
      const res = await app.request("/api/v1/admin/disputes?limit=0");
      expect(res.status).toBe(422);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should reject invalid cursor UUID", async () => {
      const res = await app.request("/api/v1/admin/disputes?cursor=not-a-uuid");
      expect(res.status).toBe(422);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ── POST /:evidenceId/resolve — Resolve dispute ──────────────────

  describe("POST /:evidenceId/resolve — Resolve dispute", () => {
    it("should approve evidence dispute and distribute reward", async () => {
      // Evidence lookup: in appealed stage
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          {
            id: VALID_EVIDENCE_ID,
            verificationStage: "appealed",
            missionId: "22222222-3333-4444-5555-666666666666",
          },
        ]),
      );

      const res = await app.request(
        `/api/v1/admin/disputes/${VALID_EVIDENCE_ID}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: "approve",
            reasoning: "Evidence clearly shows mission completion with valid GPS data and timestamps.",
          }),
        },
      );

      expect(res.status).toBe(200);

      const body = (await res.json()) as SuccessBody<{
        evidenceId: string;
        decision: string;
        rewardDistributed: boolean;
        rewardAmount: number | null;
      }>;
      expect(body.ok).toBe(true);
      expect(body.data.evidenceId).toBe(VALID_EVIDENCE_ID);
      expect(body.data.decision).toBe("approve");
      expect(body.data.rewardDistributed).toBe(true);
      expect(body.data.rewardAmount).toBe(50);

      // Verify reward distribution was called
      expect(mockDistributeReward).toHaveBeenCalledOnce();
    });

    it("should reject evidence dispute without distributing reward", async () => {
      // Evidence lookup: in admin_review stage
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          {
            id: VALID_EVIDENCE_ID,
            verificationStage: "admin_review",
            missionId: "22222222-3333-4444-5555-666666666666",
          },
        ]),
      );

      const res = await app.request(
        `/api/v1/admin/disputes/${VALID_EVIDENCE_ID}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: "reject",
            reasoning: "The GPS location does not match the mission requirements, evidence appears to be from a different location.",
          }),
        },
      );

      expect(res.status).toBe(200);

      const body = (await res.json()) as SuccessBody<{
        evidenceId: string;
        decision: string;
        rewardDistributed: boolean;
        rewardAmount: number | null;
      }>;
      expect(body.ok).toBe(true);
      expect(body.data.evidenceId).toBe(VALID_EVIDENCE_ID);
      expect(body.data.decision).toBe("reject");
      expect(body.data.rewardDistributed).toBe(false);
      expect(body.data.rewardAmount).toBeNull();

      // Verify reward distribution was NOT called
      expect(mockDistributeReward).not.toHaveBeenCalled();
    });

    it("should return 403 for non-admin user resolving dispute", async () => {
      currentMockHuman = {
        id: "cccccccc-dddd-eeee-ffff-000000000000",
        email: "human@example.com",
        displayName: "Regular Human",
        role: "human",
      };

      const res = await app.request(
        `/api/v1/admin/disputes/${VALID_EVIDENCE_ID}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: "approve",
            reasoning: "This should not be allowed for non-admin users at all.",
          }),
        },
      );

      expect(res.status).toBe(403);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toContain("Admin access required");
    });

    it("should return 422 for invalid evidence UUID", async () => {
      const res = await app.request("/api/v1/admin/disputes/not-a-uuid/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "approve",
          reasoning: "Valid evidence, GPS offset acceptable for this type of mission.",
        }),
      });
      expect(res.status).toBe(422);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 422 for invalid decision value", async () => {
      const res = await app.request(
        `/api/v1/admin/disputes/${VALID_EVIDENCE_ID}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: "maybe",
            reasoning: "Not sure about this one, needs more review.",
          }),
        },
      );
      expect(res.status).toBe(422);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 422 for reasoning too short (< 10 chars)", async () => {
      const res = await app.request(
        `/api/v1/admin/disputes/${VALID_EVIDENCE_ID}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: "approve",
            reasoning: "ok",
          }),
        },
      );
      expect(res.status).toBe(422);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 422 for missing decision field", async () => {
      const res = await app.request(
        `/api/v1/admin/disputes/${VALID_EVIDENCE_ID}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reasoning: "This is a valid reasoning but missing the decision field.",
          }),
        },
      );
      expect(res.status).toBe(422);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 422 for missing reasoning field", async () => {
      const res = await app.request(
        `/api/v1/admin/disputes/${VALID_EVIDENCE_ID}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: "approve",
          }),
        },
      );
      expect(res.status).toBe(422);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 404 for non-existent evidence", async () => {
      // Evidence lookup returns empty
      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([]));

      const res = await app.request(
        `/api/v1/admin/disputes/${VALID_EVIDENCE_ID}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: "approve",
            reasoning: "Valid evidence with clear photo evidence of completion.",
          }),
        },
      );
      expect(res.status).toBe(404);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toContain("Evidence not found");
    });

    it("should return 409 when evidence is not in appealed or admin_review stage", async () => {
      // Evidence in "verified" stage (not appealable)
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          {
            id: VALID_EVIDENCE_ID,
            verificationStage: "verified",
            missionId: "22222222-3333-4444-5555-666666666666",
          },
        ]),
      );

      const res = await app.request(
        `/api/v1/admin/disputes/${VALID_EVIDENCE_ID}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: "reject",
            reasoning: "Attempting to resolve evidence that is already verified.",
          }),
        },
      );
      expect(res.status).toBe(409);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("CONFLICT");
      expect(body.error.message).toContain("not in appealed or admin_review stage");
    });

    it("should return 409 when evidence is in pending stage", async () => {
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          {
            id: VALID_EVIDENCE_ID,
            verificationStage: "pending",
            missionId: "22222222-3333-4444-5555-666666666666",
          },
        ]),
      );

      const res = await app.request(
        `/api/v1/admin/disputes/${VALID_EVIDENCE_ID}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: "approve",
            reasoning: "Cannot resolve pending evidence that has not been appealed.",
          }),
        },
      );
      expect(res.status).toBe(409);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("CONFLICT");
    });

    it("should return 409 when evidence is in peer_review stage", async () => {
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          {
            id: VALID_EVIDENCE_ID,
            verificationStage: "peer_review",
            missionId: "22222222-3333-4444-5555-666666666666",
          },
        ]),
      );

      const res = await app.request(
        `/api/v1/admin/disputes/${VALID_EVIDENCE_ID}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: "approve",
            reasoning: "Cannot resolve evidence that is still in peer review process.",
          }),
        },
      );
      expect(res.status).toBe(409);

      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("CONFLICT");
    });

    it("should handle admin_review stage evidence (allowed)", async () => {
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          {
            id: VALID_EVIDENCE_ID,
            verificationStage: "admin_review",
            missionId: "22222222-3333-4444-5555-666666666666",
          },
        ]),
      );

      const res = await app.request(
        `/api/v1/admin/disputes/${VALID_EVIDENCE_ID}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: "approve",
            reasoning: "Evidence in admin review stage is valid and should be approved.",
          }),
        },
      );
      expect(res.status).toBe(200);

      const body = (await res.json()) as SuccessBody<{
        evidenceId: string;
        decision: string;
      }>;
      expect(body.ok).toBe(true);
      expect(body.data.decision).toBe("approve");
    });

    it("should gracefully handle reward distribution failure", async () => {
      // Reward distribution throws
      mockDistributeReward.mockRejectedValue(new Error("Reward service unavailable"));

      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          {
            id: VALID_EVIDENCE_ID,
            verificationStage: "appealed",
            missionId: "22222222-3333-4444-5555-666666666666",
          },
        ]),
      );

      const res = await app.request(
        `/api/v1/admin/disputes/${VALID_EVIDENCE_ID}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: "approve",
            reasoning: "Evidence is valid even though reward distribution might fail.",
          }),
        },
      );

      // Should still succeed (reward failure is non-fatal)
      expect(res.status).toBe(200);

      const body = (await res.json()) as SuccessBody<{
        rewardDistributed: boolean;
        rewardAmount: number | null;
      }>;
      expect(body.ok).toBe(true);
      expect(body.data.rewardDistributed).toBe(false);
      expect(body.data.rewardAmount).toBeNull();
    });

    it("should handle null reward distribution result", async () => {
      mockDistributeReward.mockResolvedValue(null);

      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          {
            id: VALID_EVIDENCE_ID,
            verificationStage: "appealed",
            missionId: "22222222-3333-4444-5555-666666666666",
          },
        ]),
      );

      const res = await app.request(
        `/api/v1/admin/disputes/${VALID_EVIDENCE_ID}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: "approve",
            reasoning: "Evidence is valid and approved by admin after review.",
          }),
        },
      );

      expect(res.status).toBe(200);

      const body = (await res.json()) as SuccessBody<{
        rewardDistributed: boolean;
        rewardAmount: number | null;
      }>;
      expect(body.data.rewardDistributed).toBe(false);
      expect(body.data.rewardAmount).toBeNull();
    });
  });
});
