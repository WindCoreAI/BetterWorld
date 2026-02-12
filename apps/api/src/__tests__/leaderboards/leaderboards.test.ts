/**
 * Leaderboard Routes Unit Tests (Sprint 9: Reputation & Impact)
 *
 * Tests covering:
 *   GET /:type     — Get leaderboard entries (public, cursor pagination)
 *   GET /:type/me  — Get my rank in leaderboard (auth required)
 *
 * Mocks leaderboard-cache helper functions.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../../app.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { requestId } from "../../middleware/request-id.js";

// ── Mock infrastructure ────────────────────────────────────────────

const mockDbSelect = vi.fn();

vi.mock("../../../src/lib/container.js", () => ({
  getDb: vi.fn(() => ({
    select: mockDbSelect,
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

// Mock leaderboard cache
const mockGetLeaderboard = vi.fn();
const mockGetUserRank = vi.fn();
const mockDecodeCursor = vi.fn();
const mockEncodeCursor = vi.fn();

vi.mock("../../../src/lib/leaderboard-cache.js", () => ({
  getLeaderboard: (...args: unknown[]) => mockGetLeaderboard(...args),
  getUserRank: (...args: unknown[]) => mockGetUserRank(...args),
  decodeCursor: (...args: unknown[]) => mockDecodeCursor(...args),
  encodeCursor: (...args: unknown[]) => mockEncodeCursor(...args),
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

interface ListBody<T = unknown> {
  ok: true;
  data: T[];
  meta: {
    cursor: string | null;
    hasMore: boolean;
    total: number;
    cacheAge: number;
  };
  requestId: string;
}

interface ErrorBody {
  ok: false;
  error: { code: string; message: string };
}

// ── Test data ───────────────────────────────────────────────────────

const MOCK_ENTRIES = [
  {
    rank: 1,
    humanId: "11111111-2222-3333-4444-555555555555",
    displayName: "Top User",
    avatarUrl: null,
    score: 500,
    tier: "champion",
  },
  {
    rank: 2,
    humanId: "22222222-3333-4444-5555-666666666666",
    displayName: "Second User",
    avatarUrl: null,
    score: 350,
    tier: "leader",
  },
  {
    rank: 3,
    humanId: "33333333-4444-5555-6666-777777777777",
    displayName: "Third User",
    avatarUrl: null,
    score: 200,
    tier: "advocate",
  },
];

// ── Test Suites ─────────────────────────────────────────────────────

describe("Leaderboard Routes", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetLeaderboard.mockReset();
    mockGetUserRank.mockReset();
    mockDecodeCursor.mockReset();
    mockEncodeCursor.mockReset();

    const leaderboardRoutes = (
      await import("../../routes/leaderboards/index.js")
    ).default;
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/leaderboards", leaderboardRoutes);
    app.onError(errorHandler);
  });

  // ── GET /:type ─────────────────────────────────────────────────

  describe("GET /:type", () => {
    it("should return reputation leaderboard entries", async () => {
      mockGetLeaderboard.mockResolvedValue({
        entries: MOCK_ENTRIES,
        cacheAge: 120,
        total: 3,
      });
      mockEncodeCursor.mockReturnValue(null);

      const res = await app.request("/leaderboards/reputation");

      expect(res.status).toBe(200);
      const body = (await res.json()) as ListBody<
        (typeof MOCK_ENTRIES)[0]
      >;
      expect(body.ok).toBe(true);
      expect(body.data).toHaveLength(3);
      expect(body.data[0]!.rank).toBe(1);
      expect(body.data[0]!.displayName).toBe("Top User");
      expect(body.data[0]!.score).toBe(500);
      expect(body.meta.total).toBe(3);
      expect(body.meta.cacheAge).toBe(120);
    });

    it("should support cursor pagination", async () => {
      // Simulate offset of 20
      mockDecodeCursor.mockReturnValue(20);
      // Return entries with offset slice (only 1 remaining)
      mockGetLeaderboard.mockResolvedValue({
        entries: [...MOCK_ENTRIES, ...MOCK_ENTRIES, ...MOCK_ENTRIES], // enough entries
        cacheAge: 60,
        total: 9,
      });
      mockEncodeCursor.mockReturnValue("encoded-cursor-40");

      const res = await app.request(
        "/leaderboards/reputation?cursor=some-cursor&limit=20",
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as ListBody<unknown>;
      expect(body.ok).toBe(true);
      expect(mockDecodeCursor).toHaveBeenCalledWith("some-cursor");
    });

    it("should return 400 for invalid leaderboard type", async () => {
      const res = await app.request("/leaderboards/invalid");

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("BAD_REQUEST");
      expect(body.error.message).toContain("Invalid leaderboard type");
    });

    it("should accept all valid leaderboard types", async () => {
      const types = ["reputation", "impact", "tokens", "missions"];

      for (const type of types) {
        mockGetLeaderboard.mockResolvedValue({
          entries: [],
          cacheAge: 0,
          total: 0,
        });

        const res = await app.request(`/leaderboards/${type}`);
        expect(res.status).toBe(200);
      }
    });

    it("should accept period and domain query parameters", async () => {
      mockGetLeaderboard.mockResolvedValue({
        entries: MOCK_ENTRIES,
        cacheAge: 0,
        total: 3,
      });

      const res = await app.request(
        "/leaderboards/reputation?period=month&domain=environmental_protection",
      );

      expect(res.status).toBe(200);
      // Verify getLeaderboard was called with the right params
      expect(mockGetLeaderboard).toHaveBeenCalledWith(
        expect.anything(), // db
        null, // redis (null)
        "reputation", // type
        "month", // period
        "environmental_protection", // domain
        "global", // location_scope default
        100, // fetch size
      );
    });
  });

  // ── GET /:type/me ──────────────────────────────────────────────

  describe("GET /:type/me", () => {
    it("should return my rank in the leaderboard", async () => {
      const myRank = {
        rank: 15,
        score: 120,
        total: 100,
        percentile: 85,
        context: [
          {
            rank: 14,
            humanId: "other-user-id",
            displayName: "Above Me",
            avatarUrl: null,
            score: 125,
          },
          {
            rank: 15,
            humanId: MOCK_HUMAN.id,
            displayName: MOCK_HUMAN.displayName,
            avatarUrl: null,
            score: 120,
          },
        ],
      };
      mockGetUserRank.mockResolvedValue(myRank);

      const res = await app.request("/leaderboards/reputation/me");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<typeof myRank>;
      expect(body.ok).toBe(true);
      expect(body.data.rank).toBe(15);
      expect(body.data.score).toBe(120);
      expect(body.data.percentile).toBe(85);
      expect(body.data.context).toHaveLength(2);
    });

    it("should return 400 for invalid leaderboard type", async () => {
      const res = await app.request("/leaderboards/invalid/me");

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("BAD_REQUEST");
    });

    it("should work for all valid leaderboard types", async () => {
      const types = ["reputation", "impact", "tokens", "missions"];

      for (const type of types) {
        mockGetUserRank.mockResolvedValue({
          rank: 1,
          score: 100,
          total: 10,
          percentile: 90,
          context: [],
        });

        const res = await app.request(`/leaderboards/${type}/me`);
        expect(res.status).toBe(200);
      }
    });
  });
});
