/**
 * Reputation Routes Unit Tests (Sprint 9: Reputation & Impact)
 *
 * Tests covering:
 *   GET /tiers          — List tier definitions with human counts
 *   GET /me             — My reputation score + breakdown (auth required)
 *   GET /me/history     — Reputation change history (cursor pagination, event_type filter)
 *   GET /:humanId       — Public reputation for a human
 *   POST /endorsements  — Endorse a peer (self-check, duplicate, rate limit)
 *
 * Follows the evidence-submission.test.ts pattern: import route directly,
 * mock humanAuth middleware to bypass JWT, mock DB with chainable mocks.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../../app.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { requestId } from "../../middleware/request-id.js";

// ── Mock infrastructure ────────────────────────────────────────────

const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbReturning = vi.fn();

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

// Mock reputation engine
const mockEnsureReputationRow = vi.fn().mockResolvedValue(undefined);
const mockGetNextTierInfo = vi.fn().mockReturnValue({
  name: "contributor",
  threshold: 100,
  progress: 50,
});
const mockUpdateReputation = vi.fn().mockResolvedValue(undefined);

vi.mock("../../../src/lib/reputation-engine.js", () => ({
  ensureReputationRow: (...args: unknown[]) => mockEnsureReputationRow(...args),
  getNextTierInfo: (...args: unknown[]) => mockGetNextTierInfo(...args),
  updateReputation: (...args: unknown[]) => mockUpdateReputation(...args),
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

interface _ListBody<T = unknown> {
  ok: true;
  data: T[];
  meta: { cursor: string | null; hasMore: boolean };
  requestId: string;
}

interface ErrorBody {
  ok: false;
  error: { code: string; message: string };
}

// ── Test constants ──────────────────────────────────────────────────

const MOCK_HUMAN_ID = MOCK_HUMAN.id;
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

function selectGroupByChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      groupBy: vi.fn().mockResolvedValue(rows),
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

function selectWhereChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  };
}

// ── Test Suites ─────────────────────────────────────────────────────

describe("Reputation Routes", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDbSelect.mockReset();
    mockDbInsert.mockReset();
    mockDbReturning.mockReset();

    const reputationRoutes = (
      await import("../../routes/reputation/index.js")
    ).default;
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/reputation", reputationRoutes);
    app.onError(errorHandler);
  });

  // ── GET /tiers ─────────────────────────────────────────────────

  describe("GET /tiers", () => {
    it("should return tier definitions with human counts", async () => {
      // Mock: tier counts from groupBy query
      mockDbSelect.mockReturnValueOnce(
        selectGroupByChain([
          { tier: "newcomer", count: 10 },
          { tier: "contributor", count: 5 },
        ]),
      );

      const res = await app.request("/reputation/tiers");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<
        Array<{
          name: string;
          displayName: string;
          minScore: number;
          multiplier: number;
          privileges: string[];
          humanCount: number;
        }>
      >;
      expect(body.ok).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
      // Should have newcomer with count 10
      const newcomer = body.data.find((t) => t.name === "newcomer");
      expect(newcomer).toBeDefined();
      expect(newcomer!.humanCount).toBe(10);
    });

    it("should return zero counts for tiers with no humans", async () => {
      mockDbSelect.mockReturnValueOnce(selectGroupByChain([]));

      const res = await app.request("/reputation/tiers");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<
        Array<{ name: string; humanCount: number }>
      >;
      expect(body.ok).toBe(true);
      body.data.forEach((t) => {
        expect(t.humanCount).toBe(0);
      });
    });
  });

  // ── GET /me ────────────────────────────────────────────────────

  describe("GET /me", () => {
    it("should return my reputation score and breakdown", async () => {
      const now = new Date();
      const scoreRow = {
        humanId: MOCK_HUMAN_ID,
        totalScore: "150.00",
        currentTier: "contributor",
        tierMultiplier: "1.50",
        missionQualityScore: "60.00",
        peerAccuracyScore: "45.00",
        streakScore: "30.00",
        endorsementScore: "15.00",
        gracePeriodStart: null,
        gracePeriodTier: null,
        lastActivityAt: now,
      };

      // ensureReputationRow already mocked
      // select reputation score
      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([scoreRow]));

      const res = await app.request("/reputation/me");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{
        humanId: string;
        totalScore: number;
        tier: string;
        tierMultiplier: number;
        breakdown: {
          missionQuality: number;
          peerAccuracy: number;
          streak: number;
          endorsements: number;
        };
        nextTier: { name: string; threshold: number; progress: number } | null;
        gracePeriod: {
          active: boolean;
          expiresAt: string | null;
          previousTier: string | null;
        };
        lastActivityAt: string | null;
      }>;
      expect(body.ok).toBe(true);
      expect(body.data.humanId).toBe(MOCK_HUMAN_ID);
      expect(body.data.totalScore).toBe(150);
      expect(body.data.tier).toBe("contributor");
      expect(body.data.tierMultiplier).toBe(1.5);
      expect(body.data.breakdown.missionQuality).toBe(60);
      expect(body.data.breakdown.peerAccuracy).toBe(45);
      expect(body.data.breakdown.streak).toBe(30);
      expect(body.data.breakdown.endorsements).toBe(15);
      expect(body.data.gracePeriod.active).toBe(false);
      expect(body.data.gracePeriod.expiresAt).toBeNull();
      expect(body.data.lastActivityAt).toBeDefined();
      expect(mockEnsureReputationRow).toHaveBeenCalledOnce();
    });

    it("should return 404 when reputation data not found", async () => {
      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([]));

      const res = await app.request("/reputation/me");

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toContain("Reputation data not found");
    });

    it("should show grace period when active", async () => {
      const gracePeriodStart = new Date("2026-01-15T00:00:00Z");
      const scoreRow = {
        humanId: MOCK_HUMAN_ID,
        totalScore: "80.00",
        currentTier: "newcomer",
        tierMultiplier: "1.00",
        missionQualityScore: "30.00",
        peerAccuracyScore: "20.00",
        streakScore: "20.00",
        endorsementScore: "10.00",
        gracePeriodStart,
        gracePeriodTier: "contributor",
        lastActivityAt: new Date(),
      };

      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([scoreRow]));

      const res = await app.request("/reputation/me");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{
        gracePeriod: {
          active: boolean;
          expiresAt: string | null;
          previousTier: string | null;
        };
      }>;
      expect(body.data.gracePeriod.active).toBe(true);
      expect(body.data.gracePeriod.expiresAt).toBeDefined();
      expect(body.data.gracePeriod.previousTier).toBe("contributor");
    });
  });

  // ── GET /me/history ────────────────────────────────────────────

  describe("GET /me/history", () => {
    it("should return reputation history with cursor pagination", async () => {
      const now = new Date();
      const historyRows = [
        {
          id: "hhhhhhhh-1111-2222-3333-444444444444",
          scoreBefore: "100.00",
          scoreAfter: "115.00",
          delta: "15.00",
          eventType: "mission_completion",
          eventSourceType: "mission",
          tierBefore: "newcomer",
          tierAfter: "newcomer",
          metadata: { missionId: "test-mission" },
          createdAt: now,
        },
      ];

      mockDbSelect.mockReturnValueOnce(
        selectWhereOrderByLimitChain(historyRows),
      );

      const res = await app.request("/reputation/me/history?limit=10");

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: true;
        data: Array<{
          id: string;
          scoreBefore: number;
          scoreAfter: number;
          delta: number;
          eventType: string;
          createdAt: string;
        }>;
        meta: { cursor: string | null; hasMore: boolean };
      };
      expect(body.ok).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]!.scoreBefore).toBe(100);
      expect(body.data[0]!.scoreAfter).toBe(115);
      expect(body.data[0]!.delta).toBe(15);
      expect(body.data[0]!.eventType).toBe("mission_completion");
      expect(body.meta.hasMore).toBe(false);
      expect(body.meta.cursor).toBeNull();
    });

    it("should set hasMore=true when more rows exist", async () => {
      // Return limit+1 rows to trigger hasMore
      const rows = Array.from({ length: 3 }, (_, i) => ({
        id: `hhhhhhhh-1111-2222-3333-${String(i).padStart(12, "0")}`,
        scoreBefore: "100.00",
        scoreAfter: "110.00",
        delta: "10.00",
        eventType: "endorsement",
        eventSourceType: "endorsement",
        tierBefore: "newcomer",
        tierAfter: "newcomer",
        metadata: null,
        createdAt: new Date(),
      }));

      mockDbSelect.mockReturnValueOnce(
        selectWhereOrderByLimitChain(rows),
      );

      const res = await app.request("/reputation/me/history?limit=2");

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: true;
        data: unknown[];
        meta: { cursor: string | null; hasMore: boolean };
      };
      expect(body.data).toHaveLength(2);
      expect(body.meta.hasMore).toBe(true);
      expect(body.meta.cursor).toBeDefined();
    });
  });

  // ── GET /:humanId ──────────────────────────────────────────────

  describe("GET /:humanId", () => {
    it("should return public reputation for a human", async () => {
      const humanRow = {
        id: OTHER_HUMAN_ID,
        displayName: "Other Human",
        portfolioVisibility: "public",
      };
      const scoreRow = {
        totalScore: "200.00",
        currentTier: "contributor",
        tierMultiplier: "1.50",
        missionQualityScore: "80.00",
        peerAccuracyScore: "50.00",
        streakScore: "40.00",
        endorsementScore: "30.00",
      };

      // Query 1: human lookup
      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([humanRow]));
      // Query 2: reputation score
      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([scoreRow]));

      const res = await app.request(`/reputation/${OTHER_HUMAN_ID}`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{
        humanId: string;
        displayName: string;
        totalScore: number;
        tier: string;
        breakdown: {
          missionQuality: number;
          peerAccuracy: number;
          streak: number;
          endorsements: number;
        };
      }>;
      expect(body.ok).toBe(true);
      expect(body.data.humanId).toBe(OTHER_HUMAN_ID);
      expect(body.data.displayName).toBe("Other Human");
      expect(body.data.totalScore).toBe(200);
      expect(body.data.tier).toBe("contributor");
      expect(body.data.breakdown.missionQuality).toBe(80);
    });

    it("should return 404 when human not found", async () => {
      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([]));

      const res = await app.request(`/reputation/${OTHER_HUMAN_ID}`);

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toContain("Human not found");
    });

    it("should return 403 when profile is private", async () => {
      const humanRow = {
        id: OTHER_HUMAN_ID,
        displayName: "Private Human",
        portfolioVisibility: "private",
      };

      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([humanRow]));

      const res = await app.request(`/reputation/${OTHER_HUMAN_ID}`);

      expect(res.status).toBe(403);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toContain("private");
    });

    it("should return defaults when no reputation score exists", async () => {
      const humanRow = {
        id: OTHER_HUMAN_ID,
        displayName: "New Human",
        portfolioVisibility: "public",
      };

      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([humanRow]));
      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([]));

      const res = await app.request(`/reputation/${OTHER_HUMAN_ID}`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<{
        totalScore: number;
        tier: string;
        tierMultiplier: number;
      }>;
      expect(body.data.totalScore).toBe(0);
      expect(body.data.tier).toBe("newcomer");
      expect(body.data.tierMultiplier).toBe(1.0);
    });
  });

  // ── POST /endorsements ─────────────────────────────────────────

  describe("POST /endorsements", () => {
    function validEndorsementBody(overrides: Record<string, unknown> = {}) {
      return {
        toHumanId: OTHER_HUMAN_ID,
        reason: "Great contributor with excellent mission quality!",
        ...overrides,
      };
    }

    it("should create an endorsement successfully", async () => {
      const now = new Date();

      // Query 1: target exists
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([{ id: OTHER_HUMAN_ID }]),
      );
      // Query 2: no duplicate
      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([]));
      // Query 3: daily count < 5
      mockDbSelect.mockReturnValueOnce(
        selectWhereChain([{ count: 2 }]),
      );

      // Insert endorsement
      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "eeeeeeee-1111-2222-3333-444444444444",
              fromHumanId: MOCK_HUMAN_ID,
              toHumanId: OTHER_HUMAN_ID,
              reason: "Great contributor with excellent mission quality!",
              createdAt: now,
            },
          ]),
        }),
      });

      const res = await app.request("/reputation/endorsements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validEndorsementBody()),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as SuccessBody<{
        id: string;
        fromHumanId: string;
        toHumanId: string;
        reason: string;
        createdAt: string;
      }>;
      expect(body.ok).toBe(true);
      expect(body.data.fromHumanId).toBe(MOCK_HUMAN_ID);
      expect(body.data.toHumanId).toBe(OTHER_HUMAN_ID);
      expect(body.data.reason).toBe(
        "Great contributor with excellent mission quality!",
      );
    });

    it("should reject self-endorsement", async () => {
      const res = await app.request("/reputation/endorsements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          validEndorsementBody({ toHumanId: MOCK_HUMAN_ID }),
        ),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("BAD_REQUEST");
      expect(body.error.message).toContain("Cannot endorse yourself");
    });

    it("should return 404 when target human not found", async () => {
      // Query 1: target not found
      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([]));

      const res = await app.request("/reputation/endorsements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validEndorsementBody()),
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toContain("Human not found");
    });

    it("should return 409 when duplicate endorsement", async () => {
      // Query 1: target exists
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([{ id: OTHER_HUMAN_ID }]),
      );
      // Query 2: duplicate exists
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([
          { id: "existing-endorsement-id" },
        ]),
      );

      const res = await app.request("/reputation/endorsements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validEndorsementBody()),
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("CONFLICT");
      expect(body.error.message).toContain("Already endorsed");
    });

    it("should return 429 when daily endorsement limit exceeded", async () => {
      // Query 1: target exists
      mockDbSelect.mockReturnValueOnce(
        singleRowSelectChain([{ id: OTHER_HUMAN_ID }]),
      );
      // Query 2: no duplicate
      mockDbSelect.mockReturnValueOnce(singleRowSelectChain([]));
      // Query 3: daily count = 5 (limit hit)
      mockDbSelect.mockReturnValueOnce(
        selectWhereChain([{ count: 5 }]),
      );

      const res = await app.request("/reputation/endorsements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validEndorsementBody()),
      });

      expect(res.status).toBe(429);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("RATE_LIMITED");
      expect(body.error.message).toContain("5 endorsements per day");
    });

    it("should reject invalid body (reason too short)", async () => {
      const res = await app.request("/reputation/endorsements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toHumanId: OTHER_HUMAN_ID, reason: "short" }),
      });

      // Zod validation error surfaces through error handler
      expect([422, 500]).toContain(res.status);
      const body = (await res.json()) as ErrorBody;
      expect(body.ok).toBe(false);
    });

    it("should reject missing required fields", async () => {
      const res = await app.request("/reputation/endorsements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      // Zod validation error surfaces through error handler
      expect([422, 500]).toContain(res.status);
      const body = (await res.json()) as ErrorBody;
      expect(body.ok).toBe(false);
    });
  });
});
