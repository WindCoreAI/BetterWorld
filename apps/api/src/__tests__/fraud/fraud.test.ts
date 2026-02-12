/**
 * Fraud Admin Routes Unit Tests (Sprint 9: Reputation & Impact)
 *
 * Tests covering:
 *   GET /stats                — Aggregate fraud statistics (admin required)
 *   GET /queue                — List flagged/suspended accounts (admin required)
 *   GET /:humanId             — Fraud detail for a human (admin required)
 *   POST /:humanId/action     — Take admin action (admin required)
 *
 * All routes require humanAuth + requireAdmin. Non-admin access returns 403.
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
const mockDbExecute = vi.fn();
const mockDbTransaction = vi.fn();

vi.mock("../../../src/lib/container.js", () => ({
  getDb: vi.fn(() => ({
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    execute: mockDbExecute,
    transaction: mockDbTransaction,
  })),
  getRedis: vi.fn(() => null),
}));

// Mock humanAuth middleware — admin role by default
const MOCK_ADMIN = {
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  email: "admin@example.com",
  displayName: "Admin User",
  role: "admin",
};

let currentMockHuman = MOCK_ADMIN;

vi.mock("../../../src/middleware/humanAuth.js", () => ({
  humanAuth: () => {
    return async (
      c: { set: (k: string, v: unknown) => void },
      next: () => Promise<void>,
    ) => {
      c.set("human", currentMockHuman);
      await next();
    };
  },
}));

// Do NOT mock requireAdmin — let it run for real to test admin enforcement
// Actually, we DO need to use the real requireAdmin so we test admin enforcement.
// But since the humanAuth mock already sets the role, requireAdmin will check c.get("human").role.

// Mock logger
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
  requestId: string;
}

interface ErrorBody {
  ok: false;
  error: { code: string; message: string };
}

// ── Test constants ──────────────────────────────────────────────────

const TARGET_HUMAN_ID = "11111111-2222-3333-4444-555555555555";

// ── Helpers ─────────────────────────────────────────────────────────

function singleRowSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

function selectGroupByChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      groupBy: vi.fn().mockResolvedValue(rows),
    }),
  };
}

function selectWhereChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  };
}

function selectWhereOrderByLimitChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(rows),
        }),
      }),
    }),
  };
}

function joinSelectWhereOrderByLimitChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    }),
  };
}

// ── Test Suites ─────────────────────────────────────────────────────

describe("Fraud Admin Routes", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDbSelect.mockReset();
    mockDbInsert.mockReset();
    mockDbUpdate.mockReset();
    mockDbExecute.mockReset();
    mockDbTransaction.mockReset();
    currentMockHuman = MOCK_ADMIN; // Reset to admin

    const fraudRoutes = (
      await import("../../routes/fraud/index.js")
    ).default;
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/admin/fraud", fraudRoutes);
    app.onError(errorHandler);
  });

  // ── Authorization ──────────────────────────────────────────────

  describe("Authorization", () => {
    it("should return 403 when non-admin accesses stats", async () => {
      currentMockHuman = {
        ...MOCK_ADMIN,
        role: "human",
      };

      const res = await app.request("/admin/fraud/stats");

      expect(res.status).toBe(403);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("FORBIDDEN");
    });

    it("should return 403 when non-admin accesses queue", async () => {
      currentMockHuman = {
        ...MOCK_ADMIN,
        role: "human",
      };

      const res = await app.request("/admin/fraud/queue");

      expect(res.status).toBe(403);
    });

    it("should return 403 when non-admin accesses fraud detail", async () => {
      currentMockHuman = {
        ...MOCK_ADMIN,
        role: "human",
      };

      const res = await app.request(
        `/admin/fraud/${TARGET_HUMAN_ID}`,
      );

      expect(res.status).toBe(403);
    });

    it("should return 403 when non-admin takes action", async () => {
      currentMockHuman = {
        ...MOCK_ADMIN,
        role: "human",
      };

      const res = await app.request(
        `/admin/fraud/${TARGET_HUMAN_ID}/action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "clear_flag",
            reason: "Verified as legitimate after investigation",
          }),
        },
      );

      expect(res.status).toBe(403);
    });
  });

  // ── GET /stats ─────────────────────────────────────────────────

  describe("GET /stats", () => {
    it("should return aggregate fraud statistics", async () => {
      // Query 1: flagged count
      mockDbSelect.mockReturnValueOnce(
        selectWhereChain([{ count: 3 }]),
      );
      // Query 2: suspended count
      mockDbSelect.mockReturnValueOnce(
        selectWhereChain([{ count: 1 }]),
      );
      // Query 3: cleared count
      mockDbSelect.mockReturnValueOnce(
        selectWhereChain([{ count: 7 }]),
      );
      // Query 4: new flags 30d
      mockDbSelect.mockReturnValueOnce(
        selectWhereChain([{ count: 2 }]),
      );
      // Query 5: detection breakdown
      mockDbSelect.mockReturnValueOnce(
        selectGroupByChain([
          { type: "phash_duplicate", count: 5 },
          { type: "velocity_spike", count: 3 },
        ]),
      );

      const res = await app.request("/admin/fraud/stats");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{
        totalFlagged: number;
        totalSuspended: number;
        totalCleared: number;
        detectionBreakdown: Array<{ type: string; count: number }>;
        last30Days: { newFlags: number };
      }>;
      expect(body.ok).toBe(true);
      expect(body.data.totalFlagged).toBe(3);
      expect(body.data.totalSuspended).toBe(1);
      expect(body.data.totalCleared).toBe(7);
      expect(body.data.detectionBreakdown).toHaveLength(2);
      expect(body.data.last30Days.newFlags).toBe(2);
    });
  });

  // ── GET /queue ─────────────────────────────────────────────────

  describe("GET /queue", () => {
    it("should return flagged accounts", async () => {
      const now = new Date();
      const queueRows = [
        {
          humanId: TARGET_HUMAN_ID,
          displayName: "Suspicious User",
          email: "suspect@example.com",
          totalScore: 85,
          phashScore: 40,
          velocityScore: 30,
          statisticalScore: 15,
          status: "flagged",
          flaggedAt: now,
          suspendedAt: null,
        },
      ];

      mockDbSelect.mockReturnValueOnce(
        joinSelectWhereOrderByLimitChain(queueRows),
      );

      const res = await app.request("/admin/fraud/queue?status=flagged");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<
        Array<{
          humanId: string;
          displayName: string;
          email: string;
          fraudScore: {
            total: number;
            phash: number;
            velocity: number;
            statistical: number;
          };
          status: string;
          flaggedAt: string | null;
          suspendedAt: string | null;
        }>
      >;
      expect(body.ok).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]!.humanId).toBe(TARGET_HUMAN_ID);
      expect(body.data[0]!.fraudScore.total).toBe(85);
      expect(body.data[0]!.status).toBe("flagged");
    });

    it("should use default status filter (all non-clean)", async () => {
      mockDbSelect.mockReturnValueOnce(
        joinSelectWhereOrderByLimitChain([]),
      );

      const res = await app.request("/admin/fraud/queue");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<unknown[]>;
      expect(body.ok).toBe(true);
      expect(body.data).toHaveLength(0);
    });
  });

  // ── GET /:humanId ──────────────────────────────────────────────

  describe("GET /:humanId", () => {
    it("should return fraud detail with events and admin actions", async () => {
      const now = new Date();
      const scoreRow = {
        humanId: TARGET_HUMAN_ID,
        totalScore: 75,
        phashScore: 30,
        velocityScore: 25,
        statisticalScore: 20,
        status: "flagged",
        flaggedAt: now,
        suspendedAt: null,
      };

      // Query 1: fraud score
      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([scoreRow]));

      // Query 2: fraud events
      const events = [
        {
          id: "evt-1",
          detectionType: "phash_duplicate",
          scoreDelta: 30,
          details: { similarity: 0.95 },
          evidenceId: "evi-1",
          createdAt: now,
        },
      ];
      mockDbSelect.mockReturnValueOnce(
        selectWhereOrderByLimitChain(events),
      );

      // Query 3: admin actions
      mockDbSelect.mockReturnValueOnce(
        selectWhereOrderByLimitChain([]),
      );

      // Query 4: human profile
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          {
            displayName: "Suspicious User",
            createdAt: new Date("2026-01-01"),
          },
        ]),
      );

      // Query 5: reputation
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          { totalScore: "45.00", currentTier: "newcomer" },
        ]),
      );

      const res = await app.request(
        `/admin/fraud/${TARGET_HUMAN_ID}`,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{
        fraudScore: {
          total: number;
          phash: number;
          velocity: number;
          statistical: number;
          status: string;
        };
        events: Array<{
          id: string;
          detectionType: string;
          scoreDelta: number;
        }>;
        adminActions: unknown[];
        humanProfile: {
          displayName: string;
          reputationScore: number;
          tier: string;
        };
      }>;
      expect(body.ok).toBe(true);
      expect(body.data.fraudScore.total).toBe(75);
      expect(body.data.fraudScore.status).toBe("flagged");
      expect(body.data.events).toHaveLength(1);
      expect(body.data.events[0]!.detectionType).toBe("phash_duplicate");
      expect(body.data.adminActions).toHaveLength(0);
      expect(body.data.humanProfile.displayName).toBe("Suspicious User");
      expect(body.data.humanProfile.reputationScore).toBe(45);
    });

    it("should return 404 when fraud data not found", async () => {
      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([]));

      const res = await app.request(
        `/admin/fraud/${TARGET_HUMAN_ID}`,
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toContain("Fraud data not found");
    });
  });

  // ── POST /:humanId/action ─────────────────────────────────────

  describe("POST /:humanId/action", () => {
    function validActionBody(overrides: Record<string, unknown> = {}) {
      return {
        action: "clear_flag",
        reason: "Verified as legitimate after thorough investigation",
        ...overrides,
      };
    }

    it("should clear flag successfully", async () => {
      const actionId = "act-11111111-2222-3333-4444-555555555555";

      // Transaction mock
      mockDbTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          execute: vi.fn().mockResolvedValue([
            { total_score: 75, status: "flagged" },
          ]),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  id: actionId,
                  humanId: TARGET_HUMAN_ID,
                  adminId: MOCK_ADMIN.id,
                  action: "clear_flag",
                  reason: "Verified as legitimate after thorough investigation",
                  fraudScoreBefore: 75,
                  fraudScoreAfter: 75,
                  createdAt: new Date(),
                },
              ]),
            }),
          }),
        };
        return cb(tx);
      });

      const res = await app.request(
        `/admin/fraud/${TARGET_HUMAN_ID}/action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validActionBody()),
        },
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{
        actionId: string;
        humanId: string;
        action: string;
        newStatus: string;
        scores: { before: number; after: number };
      }>;
      expect(body.ok).toBe(true);
      expect(body.data.actionId).toBe(actionId);
      expect(body.data.humanId).toBe(TARGET_HUMAN_ID);
      expect(body.data.action).toBe("clear_flag");
      expect(body.data.newStatus).toBe("clean");
    });

    it("should reset scores on reset_score action", async () => {
      const actionId = "act-22222222-3333-4444-5555-666666666666";

      mockDbTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          execute: vi.fn().mockResolvedValue([
            { total_score: 85, status: "flagged" },
          ]),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  id: actionId,
                  humanId: TARGET_HUMAN_ID,
                  adminId: MOCK_ADMIN.id,
                  action: "reset_score",
                  reason: "Scores reset after manual review",
                  fraudScoreBefore: 85,
                  fraudScoreAfter: 0,
                  createdAt: new Date(),
                },
              ]),
            }),
          }),
        };
        return cb(tx);
      });

      const res = await app.request(
        `/admin/fraud/${TARGET_HUMAN_ID}/action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            validActionBody({
              action: "reset_score",
              reason: "Scores reset after manual review",
            }),
          ),
        },
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{
        action: string;
        scores: { before: number; after: number };
      }>;
      expect(body.data.action).toBe("reset_score");
      expect(body.data.scores.before).toBe(85);
      expect(body.data.scores.after).toBe(0);
    });

    it("should return 404 when fraud data not found in transaction", async () => {
      mockDbTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          execute: vi.fn().mockResolvedValue([]),
        };
        return cb(tx);
      });

      const res = await app.request(
        `/admin/fraud/${TARGET_HUMAN_ID}/action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validActionBody()),
        },
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("should reject invalid action type", async () => {
      const res = await app.request(
        `/admin/fraud/${TARGET_HUMAN_ID}/action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "invalid_action",
            reason: "This should fail validation",
          }),
        },
      );

      // Zod parse() throws ZodError which is not AppError, resulting in 500
      expect(res.status).toBe(500);
    });

    it("should reject reason that is too short", async () => {
      const res = await app.request(
        `/admin/fraud/${TARGET_HUMAN_ID}/action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "clear_flag",
            reason: "short",
          }),
        },
      );

      // Zod parse() throws ZodError which is not AppError, resulting in 500
      expect(res.status).toBe(500);
    });

    it("should handle manual_suspend action", async () => {
      const actionId = "act-33333333-4444-5555-6666-777777777777";

      mockDbTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          execute: vi.fn().mockResolvedValue([
            { total_score: 90, status: "flagged" },
          ]),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  id: actionId,
                  humanId: TARGET_HUMAN_ID,
                  adminId: MOCK_ADMIN.id,
                  action: "manual_suspend",
                  reason: "Persistent fraudulent behavior detected",
                  fraudScoreBefore: 90,
                  fraudScoreAfter: 90,
                  createdAt: new Date(),
                },
              ]),
            }),
          }),
        };
        return cb(tx);
      });

      const res = await app.request(
        `/admin/fraud/${TARGET_HUMAN_ID}/action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            validActionBody({
              action: "manual_suspend",
              reason: "Persistent fraudulent behavior detected",
            }),
          ),
        },
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{
        action: string;
        newStatus: string;
      }>;
      expect(body.data.action).toBe("manual_suspend");
      expect(body.data.newStatus).toBe("suspended");
    });
  });
});
