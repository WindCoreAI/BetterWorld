/**
 * Growth Routes API Tests (Sprint 17: Community Identity & Visible Growth)
 *
 * Tests GET /growth/me — Authenticated participant's growth journey.
 * Covers: authenticated success, zero-state, and standard API envelope format.
 */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../app.js";
import { requestId } from "../middleware/request-id.js";

// ── Mock infrastructure ────────────────────────────────────────

const mockGetGrowthJourney = vi.fn();

vi.mock("../../src/services/growth-journey.service.js", () => ({
  GrowthJourneyService: vi.fn().mockImplementation(() => ({
    getGrowthJourney: mockGetGrowthJourney,
  })),
}));

vi.mock("../../src/lib/container.js", () => ({
  getDb: vi.fn(() => ({})),
  getRedis: vi.fn(() => null),
}));

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

vi.mock("../../src/middleware/logger.js", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Response types ──────────────────────────────────────────

interface SuccessBody<T = unknown> {
  ok: true;
  data: T;
  requestId: string;
}

// ── Tests ───────────────────────────────────────────────────

describe("Growth Routes (Sprint 17)", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const growthRoutes = (await import("../routes/growth/index.js")).default;
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/growth", growthRoutes);
  });

  // ── GET /growth/me ────────────────────────────────────────

  describe("GET /growth/me — Growth journey data", () => {
    it("returns 200 with full growth journey data", async () => {
      const journey = {
        reputationTrend: [
          { date: "2026-01-15", score: 150, tier: "contributor" },
          { date: "2026-02-15", score: 350, tier: "contributor" },
        ],
        currentTier: {
          tier: "contributor",
          score: 350,
          nextTier: "advocate",
          nextTierThreshold: 500,
          progressPercent: 62.5,
        },
        skills: {
          evidenceQuality: { current: 0.85, previous30d: 0.80, trend: "up" },
          reviewAccuracy: { current: 0.72, previous30d: 0.72, trend: "stable" },
          missionCompletionRate: { current: 0.90, previous30d: 0.85, trend: "up" },
        },
        domainExpertise: [
          { domain: "clean_water", missionsCompleted: 5, f1Score: 0.88 },
          { domain: "education_access", missionsCompleted: 3, f1Score: null },
        ],
        personalMilestones: [
          { type: "first_mission", value: "Completed first mission", date: "2026-01-10T00:00:00.000Z" },
        ],
        nextGoals: [
          { type: "tier_progress", description: "Reach Advocate tier (150 more points)", progressPercent: 62.5 },
        ],
      };
      mockGetGrowthJourney.mockResolvedValueOnce(journey);

      const res = await app.request("/growth/me");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      const data = body.data as Record<string, unknown>;
      expect(data.currentTier).toBeDefined();
      expect(data.reputationTrend).toBeDefined();
      expect(data.skills).toBeDefined();
      expect(data.domainExpertise).toBeDefined();
      expect(data.nextGoals).toBeDefined();
    });

    it("calls service with authenticated user ID", async () => {
      mockGetGrowthJourney.mockResolvedValueOnce({
        reputationTrend: [],
        currentTier: { tier: "newcomer", score: 0, nextTier: "contributor", nextTierThreshold: 100, progressPercent: 0 },
        skills: {
          evidenceQuality: { current: 0, previous30d: 0, trend: "stable" },
          reviewAccuracy: { current: 0, previous30d: 0, trend: "stable" },
          missionCompletionRate: { current: 0, previous30d: 0, trend: "stable" },
        },
        domainExpertise: [],
        personalMilestones: [],
        nextGoals: [],
      });

      await app.request("/growth/me");

      expect(mockGetGrowthJourney).toHaveBeenCalledWith("user-123");
    });

    it("returns zero-state for new user", async () => {
      const zeroState = {
        reputationTrend: [],
        currentTier: {
          tier: "newcomer",
          score: 0,
          nextTier: "contributor",
          nextTierThreshold: 100,
          progressPercent: 0,
        },
        skills: {
          evidenceQuality: { current: 0, previous30d: 0, trend: "stable" },
          reviewAccuracy: { current: 0, previous30d: 0, trend: "stable" },
          missionCompletionRate: { current: 0, previous30d: 0, trend: "stable" },
        },
        domainExpertise: [],
        personalMilestones: [],
        nextGoals: [
          { type: "first_mission", description: "Complete your first mission", progressPercent: 0 },
        ],
      };
      mockGetGrowthJourney.mockResolvedValueOnce(zeroState);

      const res = await app.request("/growth/me");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      const data = body.data as Record<string, unknown>;
      const tier = data.currentTier as Record<string, unknown>;
      expect(tier.tier).toBe("newcomer");
      expect(tier.score).toBe(0);
      expect((data.reputationTrend as unknown[]).length).toBe(0);
    });

    it("includes requestId in response envelope", async () => {
      mockGetGrowthJourney.mockResolvedValueOnce({
        reputationTrend: [],
        currentTier: { tier: "newcomer", score: 0, nextTier: "contributor", nextTierThreshold: 100, progressPercent: 0 },
        skills: { evidenceQuality: { current: 0, previous30d: 0, trend: "stable" }, reviewAccuracy: { current: 0, previous30d: 0, trend: "stable" }, missionCompletionRate: { current: 0, previous30d: 0, trend: "stable" } },
        domainExpertise: [],
        personalMilestones: [],
        nextGoals: [],
      });

      const res = await app.request("/growth/me");

      const body = (await res.json()) as SuccessBody;
      expect(body.requestId).toBeDefined();
      expect(typeof body.requestId).toBe("string");
    });
  });
});
