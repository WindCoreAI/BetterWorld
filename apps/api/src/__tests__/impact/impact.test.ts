/**
 * Impact Dashboard Routes Unit Tests (Sprint 9: Reputation & Impact)
 *
 * Tests covering:
 *   GET /dashboard  — Public aggregate metrics (cache + fallback)
 *   GET /heatmap    — Mission density heatmap data (cache + fallback + bounds filter)
 *
 * No auth required. Uses Redis cache with DB fallback.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../../app.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { requestId } from "../../middleware/request-id.js";

// ── Mock infrastructure ────────────────────────────────────────────

const mockDbSelect = vi.fn();

// Keep track of which Redis mock to return
let mockRedisValue: unknown = null;

vi.mock("../../../src/lib/container.js", () => ({
  getDb: vi.fn(() => ({
    select: mockDbSelect,
  })),
  getRedis: vi.fn(() => mockRedisValue),
}));

// Mock metrics aggregator
const mockAggDashboard = vi.fn();
const mockAggHeatmap = vi.fn();
const mockGetCachedDashboard = vi.fn();
const mockGetCachedHeatmap = vi.fn();

vi.mock("../../../src/lib/metrics-aggregator.js", () => ({
  aggregateDashboardMetrics: (...args: unknown[]) =>
    mockAggDashboard(...args),
  aggregateHeatmapData: (...args: unknown[]) => mockAggHeatmap(...args),
  getCachedDashboard: (...args: unknown[]) =>
    mockGetCachedDashboard(...args),
  getCachedHeatmap: (...args: unknown[]) =>
    mockGetCachedHeatmap(...args),
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

interface _ErrorBody {
  ok: false;
  error: { code: string; message: string };
}

// ── Test data ───────────────────────────────────────────────────────

const MOCK_DASHBOARD = {
  totals: {
    missionsCompleted: 42,
    impactTokensDistributed: 1500,
    activeHumans: 100,
    problemsReported: 45,
    solutionsProposed: 30,
  },
  domainBreakdown: [
    {
      domain: "environmental_protection",
      missionCount: 15,
      tokenTotal: 500,
      humanCount: 30,
    },
  ],
  recentActivity: {
    missionsThisWeek: 5,
    missionsThisMonth: 18,
    newHumansThisMonth: 12,
  },
  lastUpdatedAt: "2026-02-10T12:00:00.000Z",
};

const MOCK_HEATMAP = [
  { lat: 40.7, lng: -74.0, intensity: 1.0, count: 10 },
  { lat: 51.5, lng: -0.1, intensity: 0.5, count: 5 },
  { lat: 35.7, lng: 139.7, intensity: 0.3, count: 3 },
];

// ── Test Suites ─────────────────────────────────────────────────────

describe("Impact Dashboard Routes", () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRedisValue = null; // Default: no Redis
    mockAggDashboard.mockReset();
    mockAggHeatmap.mockReset();
    mockGetCachedDashboard.mockReset();
    mockGetCachedHeatmap.mockReset();

    const impactRoutes = (
      await import("../../routes/impact/index.js")
    ).default;
    app = new Hono<AppEnv>();
    app.use("*", requestId());
    app.route("/impact", impactRoutes);
    app.onError(errorHandler);
  });

  // ── GET /dashboard ─────────────────────────────────────────────

  describe("GET /dashboard", () => {
    it("should return cached dashboard when Redis available", async () => {
      mockRedisValue = { get: vi.fn() }; // Simulate Redis available
      mockGetCachedDashboard.mockResolvedValue(MOCK_DASHBOARD);

      const res = await app.request("/impact/dashboard");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<typeof MOCK_DASHBOARD>;
      expect(body.ok).toBe(true);
      expect(body.data.totals.missionsCompleted).toBe(42);
      expect(body.data.totals.activeHumans).toBe(100);
      expect(body.data.domainBreakdown).toHaveLength(1);
      expect(body.data.recentActivity.missionsThisWeek).toBe(5);
      expect(mockGetCachedDashboard).toHaveBeenCalledOnce();
      expect(mockAggDashboard).not.toHaveBeenCalled();
    });

    it("should fall back to live query when no cache", async () => {
      mockRedisValue = { get: vi.fn() };
      mockGetCachedDashboard.mockResolvedValue(null);
      mockAggDashboard.mockResolvedValue(MOCK_DASHBOARD);

      const res = await app.request("/impact/dashboard");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<typeof MOCK_DASHBOARD>;
      expect(body.ok).toBe(true);
      expect(body.data.totals.missionsCompleted).toBe(42);
      expect(mockGetCachedDashboard).toHaveBeenCalledOnce();
      expect(mockAggDashboard).toHaveBeenCalledOnce();
    });

    it("should fall back to live query when Redis not available", async () => {
      mockRedisValue = null; // No Redis
      mockAggDashboard.mockResolvedValue(MOCK_DASHBOARD);

      const res = await app.request("/impact/dashboard");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<typeof MOCK_DASHBOARD>;
      expect(body.ok).toBe(true);
      expect(body.data.totals.missionsCompleted).toBe(42);
      expect(mockGetCachedDashboard).not.toHaveBeenCalled();
      expect(mockAggDashboard).toHaveBeenCalledOnce();
    });
  });

  // ── GET /heatmap ───────────────────────────────────────────────

  describe("GET /heatmap", () => {
    it("should return cached heatmap data", async () => {
      mockRedisValue = { get: vi.fn() };
      mockGetCachedHeatmap.mockResolvedValue(MOCK_HEATMAP);

      const res = await app.request("/impact/heatmap");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<typeof MOCK_HEATMAP>;
      expect(body.ok).toBe(true);
      expect(body.data).toHaveLength(3);
      expect(body.data[0]!.lat).toBe(40.7);
      expect(body.data[0]!.intensity).toBe(1.0);
      expect(mockGetCachedHeatmap).toHaveBeenCalledOnce();
    });

    it("should filter cached heatmap by bounds", async () => {
      mockRedisValue = { get: vi.fn() };
      mockGetCachedHeatmap.mockResolvedValue(MOCK_HEATMAP);

      // Only include the NYC point (lat: 40.7, lng: -74.0)
      const res = await app.request(
        "/impact/heatmap?sw_lat=40&sw_lng=-75&ne_lat=41&ne_lng=-73",
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<typeof MOCK_HEATMAP>;
      expect(body.ok).toBe(true);
      // Only NYC point should be within bounds
      expect(body.data).toHaveLength(1);
      expect(body.data[0]!.lat).toBe(40.7);
    });

    it("should fall back to live query when no cache", async () => {
      mockRedisValue = { get: vi.fn() };
      mockGetCachedHeatmap.mockResolvedValue(null);
      mockAggHeatmap.mockResolvedValue(MOCK_HEATMAP);

      const res = await app.request("/impact/heatmap");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<typeof MOCK_HEATMAP>;
      expect(body.ok).toBe(true);
      expect(body.data).toHaveLength(3);
      expect(mockAggHeatmap).toHaveBeenCalledOnce();
    });

    it("should fall back to live query when Redis not available", async () => {
      mockRedisValue = null;
      mockAggHeatmap.mockResolvedValue(MOCK_HEATMAP);

      const res = await app.request("/impact/heatmap");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<typeof MOCK_HEATMAP>;
      expect(body.ok).toBe(true);
      expect(mockGetCachedHeatmap).not.toHaveBeenCalled();
      expect(mockAggHeatmap).toHaveBeenCalledOnce();
    });

    it("should accept period parameter", async () => {
      mockRedisValue = { get: vi.fn() };
      mockGetCachedHeatmap.mockResolvedValue(MOCK_HEATMAP);

      const res = await app.request("/impact/heatmap?period=week");

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessBody<unknown>;
      expect(body.ok).toBe(true);
      // Period is passed to getCachedHeatmap
      expect(mockGetCachedHeatmap).toHaveBeenCalledWith(
        expect.anything(),
        "week",
      );
    });
  });
});
