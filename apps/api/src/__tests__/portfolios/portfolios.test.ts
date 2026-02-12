/**
 * Portfolio Routes Unit Tests (Sprint 9: Reputation & Impact)
 *
 * Tests covering:
 *   GET /:humanId         — Get public portfolio (visibility check, stats aggregation)
 *   PATCH /me/visibility  — Toggle portfolio visibility (auth required)
 *
 * No auth required for GET (but checks visibility).
 * PATCH requires humanAuth.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../../app.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { requestId } from "../../middleware/request-id.js";

// ── Mock infrastructure ────────────────────────────────────────────

const mockDbSelect = vi.fn();
const mockDbSelectDistinct = vi.fn();
const mockDbUpdate = vi.fn();

vi.mock("../../../src/lib/container.js", () => ({
  getDb: vi.fn(() => ({
    select: mockDbSelect,
    selectDistinct: mockDbSelectDistinct,
    update: mockDbUpdate,
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

const OTHER_HUMAN_ID = "11111111-2222-3333-4444-555555555555";

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

function selectWhereChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
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

function joinSelectWhereChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

// ── Test Suites ─────────────────────────────────────────────────────

describe("Portfolio Routes", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDbSelect.mockReset();
    mockDbSelectDistinct.mockReset();
    mockDbUpdate.mockReset();

    const portfolioRoutes = (
      await import("../../routes/portfolios/index.js")
    ).default;
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/portfolios", portfolioRoutes);
    app.onError(errorHandler);
  });

  // ── GET /:humanId ──────────────────────────────────────────────

  describe("GET /:humanId", () => {
    it("should return public portfolio with all stats", async () => {
      const now = new Date();
      const humanRow = {
        id: OTHER_HUMAN_ID,
        displayName: "Public User",
        avatarUrl: "https://example.com/avatar.jpg",
        portfolioVisibility: "public",
        createdAt: now,
      };

      // Query 1: human lookup
      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([humanRow]));

      // Query 2: reputation score
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          {
            totalScore: "250.00",
            currentTier: "advocate",
            tierMultiplier: "2.00",
          },
        ]),
      );

      // Query 3: streak
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          { currentStreak: 10, longestStreak: 21 },
        ]),
      );

      // Query 4: mission count
      mockDbSelect.mockReturnValueOnce(
        selectWhereChain([{ count: 8 }]),
      );

      // Query 5: endorsement count
      mockDbSelect.mockReturnValueOnce(
        selectWhereChain([{ count: 3 }]),
      );

      // Query 6: completed missions (join)
      const missionRow = {
        id: "mission-1",
        title: "Clean Beach",
        domain: "environmental_protection",
        updatedAt: now,
      };
      mockDbSelect.mockReturnValueOnce(
        joinSelectWhereOrderByLimitChain([missionRow]),
      );

      // Query 7: distinct domains
      mockDbSelectDistinct.mockReturnValueOnce(
        joinSelectWhereChain([
          { domain: "environmental_protection" },
          { domain: "education" },
        ]),
      );

      const res = await app.request(
        `/portfolios/${OTHER_HUMAN_ID}`,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{
        humanId: string;
        displayName: string;
        avatarUrl: string | null;
        reputation: {
          totalScore: number;
          tier: string;
          tierMultiplier: number;
        };
        stats: {
          missionsCompleted: number;
          domainsContributed: number;
          currentStreak: number;
          longestStreak: number;
          endorsementsReceived: number;
        };
        missions: Array<{
          id: string;
          title: string;
          domain: string;
          completedAt: string;
        }>;
        visibility: string;
        joinedAt: string;
      }>;
      expect(body.ok).toBe(true);
      expect(body.data.humanId).toBe(OTHER_HUMAN_ID);
      expect(body.data.displayName).toBe("Public User");
      expect(body.data.avatarUrl).toBe("https://example.com/avatar.jpg");
      expect(body.data.reputation.totalScore).toBe(250);
      expect(body.data.reputation.tier).toBe("advocate");
      expect(body.data.reputation.tierMultiplier).toBe(2.0);
      expect(body.data.stats.missionsCompleted).toBe(8);
      expect(body.data.stats.domainsContributed).toBe(2);
      expect(body.data.stats.currentStreak).toBe(10);
      expect(body.data.stats.longestStreak).toBe(21);
      expect(body.data.stats.endorsementsReceived).toBe(3);
      expect(body.data.missions).toHaveLength(1);
      expect(body.data.missions[0]!.title).toBe("Clean Beach");
      expect(body.data.visibility).toBe("public");
    });

    it("should return 404 when human not found", async () => {
      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([]));

      const res = await app.request(
        `/portfolios/${OTHER_HUMAN_ID}`,
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toContain("Human not found");
    });

    it("should return 403 when portfolio is private and not owner", async () => {
      const humanRow = {
        id: OTHER_HUMAN_ID,
        displayName: "Private User",
        avatarUrl: null,
        portfolioVisibility: "private",
        createdAt: new Date(),
      };

      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([humanRow]));

      const res = await app.request(
        `/portfolios/${OTHER_HUMAN_ID}`,
      );

      expect(res.status).toBe(403);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toContain("private");
    });

    it("should return defaults when no reputation or streak data", async () => {
      const humanRow = {
        id: OTHER_HUMAN_ID,
        displayName: "New User",
        avatarUrl: null,
        portfolioVisibility: "public",
        createdAt: new Date(),
      };

      // human lookup
      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([humanRow]));
      // reputation (empty)
      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([]));
      // streak (empty)
      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([]));
      // mission count
      mockDbSelect.mockReturnValueOnce(
        selectWhereChain([{ count: 0 }]),
      );
      // endorsement count
      mockDbSelect.mockReturnValueOnce(
        selectWhereChain([{ count: 0 }]),
      );
      // completed missions
      mockDbSelect.mockReturnValueOnce(
        joinSelectWhereOrderByLimitChain([]),
      );
      // distinct domains
      mockDbSelectDistinct.mockReturnValueOnce(
        joinSelectWhereChain([]),
      );

      const res = await app.request(
        `/portfolios/${OTHER_HUMAN_ID}`,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{
        reputation: {
          totalScore: number;
          tier: string;
          tierMultiplier: number;
        };
        stats: {
          currentStreak: number;
          longestStreak: number;
        };
      }>;
      expect(body.data.reputation.totalScore).toBe(0);
      expect(body.data.reputation.tier).toBe("newcomer");
      expect(body.data.reputation.tierMultiplier).toBe(1.0);
      expect(body.data.stats.currentStreak).toBe(0);
      expect(body.data.stats.longestStreak).toBe(0);
    });
  });

  // ── PATCH /me/visibility ───────────────────────────────────────

  describe("PATCH /me/visibility", () => {
    it("should toggle visibility to private", async () => {
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const res = await app.request("/portfolios/me/visibility", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: "private" }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{
        visibility: string;
        updatedAt: string;
      }>;
      expect(body.ok).toBe(true);
      expect(body.data.visibility).toBe("private");
      expect(body.data.updatedAt).toBeDefined();
    });

    it("should toggle visibility to public", async () => {
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const res = await app.request("/portfolios/me/visibility", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: "public" }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{
        visibility: string;
      }>;
      expect(body.data.visibility).toBe("public");
    });

    it("should reject invalid visibility value", async () => {
      const res = await app.request("/portfolios/me/visibility", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: "hidden" }),
      });

      // Zod parse() throws ZodError which is not AppError, resulting in 500
      expect(res.status).toBe(500);
    });

    it("should reject missing visibility field", async () => {
      const res = await app.request("/portfolios/me/visibility", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      // Zod parse() throws ZodError which is not AppError, resulting in 500
      expect(res.status).toBe(500);
    });
  });
});
