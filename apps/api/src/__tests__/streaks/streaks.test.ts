/**
 * Streak Routes Unit Tests (Sprint 9: Reputation & Impact)
 *
 * Tests covering:
 *   GET /me         — Get my streak info (auth required)
 *   POST /me/freeze — Activate streak freeze (auth required)
 *
 * Mock pattern: humanAuth bypassed, DB chainable mocks,
 * streak-tracker.activateFreeze mocked.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../../app.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { requestId } from "../../middleware/request-id.js";

// ── Mock infrastructure ────────────────────────────────────────────

const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();

vi.mock("../../../src/lib/container.js", () => ({
  getDb: vi.fn(() => ({
    select: mockDbSelect,
    insert: mockDbInsert,
  })),
  getRedis: vi.fn(() => null),
}));

// Mock humanAuth middleware
const MOCK_HUMAN = {
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  email: "test@example.com",
  displayName: "Test Human",
  role: "human",
};

vi.mock("../../../src/middleware/humanAuth.js", () => ({
  humanAuth: () => {
    return async (
      c: { set: (k: string, v: unknown) => void },
      next: () => Promise<void>,
    ) => {
      c.set("human", MOCK_HUMAN);
      await next();
    };
  },
}));

// Mock streak tracker
const mockActivateFreeze = vi.fn();

vi.mock("../../../src/lib/streak-tracker.js", () => ({
  activateFreeze: (...args: unknown[]) => mockActivateFreeze(...args),
}));

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

function insertOnConflictChain() {
  return {
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

// ── Test Suites ─────────────────────────────────────────────────────

describe("Streak Routes", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDbSelect.mockReset();
    mockDbInsert.mockReset();
    mockActivateFreeze.mockReset();

    const streakRoutes = (
      await import("../../routes/streaks/index.js")
    ).default;
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/streaks", streakRoutes);
    app.onError(errorHandler);
  });

  // ── GET /me ────────────────────────────────────────────────────

  describe("GET /me", () => {
    it("should return streak info with multiplier and milestones", async () => {
      const streakRow = {
        humanId: MOCK_HUMAN.id,
        currentStreak: 7,
        longestStreak: 14,
        lastActiveDate: "2026-02-10",
        streakMultiplier: "1.20",
        freezeAvailable: true,
        freezeActive: false,
        freezeLastUsedAt: null,
      };

      // insert upsert mock
      mockDbInsert.mockReturnValueOnce(insertOnConflictChain());
      // select streak row
      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([streakRow]));

      const res = await app.request("/streaks/me");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{
        currentStreak: number;
        longestStreak: number;
        lastActiveDate: string;
        streakMultiplier: number;
        nextMilestone: { days: number; multiplier: number } | null;
        freezeAvailable: boolean;
        freezeLastUsedAt: string | null;
        freezeCooldownEndsAt: string | null;
      }>;
      expect(body.ok).toBe(true);
      expect(body.data.currentStreak).toBe(7);
      expect(body.data.longestStreak).toBe(14);
      expect(body.data.lastActiveDate).toBe("2026-02-10");
      expect(body.data.streakMultiplier).toBe(1.2);
      expect(body.data.freezeAvailable).toBe(true);
      expect(body.data.freezeLastUsedAt).toBeNull();
      expect(body.data.freezeCooldownEndsAt).toBeNull();
    });

    it("should return 404 when streak data not found", async () => {
      // insert upsert mock
      mockDbInsert.mockReturnValueOnce(insertOnConflictChain());
      // select returns empty
      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([]));

      const res = await app.request("/streaks/me");

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toContain("Streak data not found");
    });

    it("should show freeze cooldown when freeze was recently used", async () => {
      const freezeUsedAt = new Date("2026-02-08T12:00:00Z");
      const streakRow = {
        humanId: MOCK_HUMAN.id,
        currentStreak: 5,
        longestStreak: 10,
        lastActiveDate: "2026-02-10",
        streakMultiplier: "1.10",
        freezeAvailable: false,
        freezeActive: false,
        freezeLastUsedAt: freezeUsedAt,
      };

      mockDbInsert.mockReturnValueOnce(insertOnConflictChain());
      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([streakRow]));

      const res = await app.request("/streaks/me");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{
        freezeLastUsedAt: string | null;
        freezeCooldownEndsAt: string | null;
      }>;
      expect(body.data.freezeLastUsedAt).toBeDefined();
      expect(body.data.freezeCooldownEndsAt).toBeDefined();
    });
  });

  // ── POST /me/freeze ────────────────────────────────────────────

  describe("POST /me/freeze", () => {
    it("should activate freeze successfully", async () => {
      mockActivateFreeze.mockResolvedValue({
        success: true,
        cooldownEndsAt: "2026-03-10T12:00:00.000Z",
      });

      const res = await app.request("/streaks/me/freeze", {
        method: "POST",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{
        freezeActivated: boolean;
        freezeAvailable: boolean;
        cooldownEndsAt: string;
      }>;
      expect(body.ok).toBe(true);
      expect(body.data.freezeActivated).toBe(true);
      expect(body.data.freezeAvailable).toBe(false);
      expect(body.data.cooldownEndsAt).toBe("2026-03-10T12:00:00.000Z");
      expect(mockActivateFreeze).toHaveBeenCalledOnce();
    });

    it("should return 400 when freeze cannot be activated", async () => {
      mockActivateFreeze.mockResolvedValue({
        success: false,
        error: "No active streak to freeze",
      });

      const res = await app.request("/streaks/me/freeze", {
        method: "POST",
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("BAD_REQUEST");
      expect(body.error.message).toContain("No active streak to freeze");
    });

    it("should return 400 when on cooldown", async () => {
      mockActivateFreeze.mockResolvedValue({
        success: false,
        error: "Freeze not available (on cooldown until 2026-03-01T00:00:00.000Z)",
      });

      const res = await app.request("/streaks/me/freeze", {
        method: "POST",
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("BAD_REQUEST");
      expect(body.error.message).toContain("cooldown");
    });
  });
});
