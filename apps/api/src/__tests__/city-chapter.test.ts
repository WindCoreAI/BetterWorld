/**
 * City Chapter Routes API Tests (Sprint 17: Community Identity & Visible Growth)
 *
 * Tests GET /cities/:citySlug/chapter — City chapter data.
 * Covers: valid city, invalid city 404, and standard API envelope format.
 */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../app.js";
import { requestId } from "../middleware/request-id.js";

// ── Mock infrastructure ────────────────────────────────────────

const mockGetChapter = vi.fn();

vi.mock("../../src/services/city-chapter.service.js", () => ({
  CityChapterService: vi.fn().mockImplementation(() => ({
    getChapter: mockGetChapter,
  })),
}));

vi.mock("../../src/lib/container.js", () => ({
  getDb: vi.fn(() => ({})),
  getRedis: vi.fn(() => null),
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

interface ErrorBody {
  ok: false;
  error: { code: string; message: string };
  requestId: string;
}

// ── Tests ───────────────────────────────────────────────────

describe("City Chapter Routes (Sprint 17)", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const cityChapterRoutes = (await import("../routes/cities/chapter.js")).default;
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/cities", cityChapterRoutes);
  });

  // ── GET /cities/:citySlug/chapter ─────────────────────────

  describe("GET /cities/:citySlug/chapter — City chapter detail", () => {
    it("returns 200 with chapter data for a valid city", async () => {
      const chapter = {
        slug: "sanfrancisco",
        displayName: "San Francisco, CA",
        tagline: "Bay Area builds better communities",
        metrics: {
          totalProblems: 25,
          totalObservations: 12,
          activeLocalValidators: 8,
          missionsCompleted: 15,
          activeParticipants: 30,
        },
        heatmap: [
          { lat: 37.7749, lng: -122.4194, intensity: 0.8 },
        ],
        milestones: [
          {
            id: "m-1",
            milestoneType: "missions_completed",
            targetValue: 10,
            currentValue: 15,
            reachedAt: "2026-02-01T00:00:00.000Z",
          },
        ],
        recentMilestones: [
          {
            id: "m-1",
            milestoneType: "missions_completed",
            targetValue: 10,
            currentValue: 15,
            reachedAt: "2026-02-01T00:00:00.000Z",
            bannerExpiresAt: "2026-02-08T00:00:00.000Z",
          },
        ],
      };
      mockGetChapter.mockResolvedValueOnce(chapter);

      const res = await app.request("/cities/sanfrancisco/chapter");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      expect(body.ok).toBe(true);
      const data = body.data as Record<string, unknown>;
      expect(data.slug).toBe("sanfrancisco");
      expect(data.displayName).toBe("San Francisco, CA");
      expect(data.tagline).toBeTruthy();
      expect(data.metrics).toBeDefined();
      expect(data.heatmap).toBeDefined();
      expect(data.milestones).toBeDefined();
    });

    it("returns 404 CITY_NOT_FOUND for unknown city", async () => {
      mockGetChapter.mockResolvedValueOnce(null);

      const res = await app.request("/cities/nonexistent_city/chapter");

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("CITY_NOT_FOUND");
      expect(body.error.message).toContain("nonexistent_city");
    });

    it("includes requestId in response", async () => {
      mockGetChapter.mockResolvedValueOnce({
        slug: "newyork",
        displayName: "New York, NY",
        tagline: "Building a better New York",
        metrics: {},
        heatmap: [],
        milestones: [],
        recentMilestones: [],
      });

      const res = await app.request("/cities/newyork/chapter");

      const body = (await res.json()) as SuccessBody;
      expect(body.requestId).toBeDefined();
    });

    it("returns chapter with zero-state metrics", async () => {
      const chapter = {
        slug: "seattle",
        displayName: "Seattle, WA",
        tagline: "Seattle's community chapter",
        metrics: {
          totalProblems: 0,
          totalObservations: 0,
          activeLocalValidators: 0,
          missionsCompleted: 0,
          activeParticipants: 0,
        },
        heatmap: [],
        milestones: [],
        recentMilestones: [],
      };
      mockGetChapter.mockResolvedValueOnce(chapter);

      const res = await app.request("/cities/seattle/chapter");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody;
      const data = body.data as Record<string, unknown>;
      const metrics = data.metrics as Record<string, number>;
      expect(metrics.totalProblems).toBe(0);
      expect(metrics.missionsCompleted).toBe(0);
    });
  });
});
