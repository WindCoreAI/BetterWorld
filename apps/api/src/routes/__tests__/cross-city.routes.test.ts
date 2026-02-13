import { Hono } from "hono";
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { AppEnv } from "../../app.js";

// ── Mock modules ─────────────────────────────────────────────

const mockGetDb = vi.fn();
vi.mock("../../lib/container.js", () => ({
  getDb: () => mockGetDb(),
  getRedis: () => null,
}));

const mockGetComparativeMetrics = vi.fn();
const mockGetSingleMetric = vi.fn();
vi.mock("../../services/cross-city.service.js", () => ({
  getComparativeMetrics: (...args: unknown[]) => mockGetComparativeMetrics(...args),
  getSingleMetric: (...args: unknown[]) => mockGetSingleMetric(...args),
}));

vi.mock("../../middleware/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Helpers ──────────────────────────────────────────────────

async function jsonBody(res: Response): Promise<unknown> {
  return res.json();
}

// ── Test setup ───────────────────────────────────────────────

describe("Cross-City Routes", () => {
  let app: Hono<AppEnv>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDb: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockDb = {};
    mockGetDb.mockReturnValue(mockDb);

    // Create fresh Hono app per test
    app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("requestId", "test-req-id");
      await next();
    });

    // Import and mount routes
    const { default: crossCityRoutes } = await import("../cross-city.routes.js");
    app.route("/cross-city", crossCityRoutes);

    // Error handler for AppError
    app.onError((err, c) => {
      const code = (err as { code?: string }).code ?? "INTERNAL_ERROR";
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        VALIDATION_ERROR: 422,
        SERVICE_UNAVAILABLE: 503,
      };
      const status = statusMap[code] ?? 500;
      return c.json({ ok: false, error: { code, message: err.message } }, status as 404);
    });
  });

  describe("GET /cross-city/compare", () => {
    it("returns comparative metrics for all cities", async () => {
      mockGetComparativeMetrics.mockResolvedValue({
        cities: [
          {
            id: "chicago",
            name: "City of Chicago",
            problems: 274,
            problemsPerCapita: 9.98,
            observations: 150,
            validatorCount: 10,
            validatorDensity: 0.3642,
          },
          {
            id: "portland",
            name: "City of Portland",
            problems: 65,
            problemsPerCapita: 9.96,
            observations: 30,
            validatorCount: 5,
            validatorDensity: 0.7663,
          },
        ],
      });

      const res = await app.request("/cross-city/compare");
      expect(res.status).toBe(200);

      const body = await jsonBody(res) as {
        ok: boolean;
        data: { cities: Array<{ id: string; problemsPerCapita: number }> };
      };

      expect(body.ok).toBe(true);
      expect(body.data.cities).toHaveLength(2);
      expect(body.data.cities[0]!.id).toBe("chicago");
      expect(body.data.cities[0]!.problemsPerCapita).toBeGreaterThan(0);
    });

    it("returns 503 when database is unavailable", async () => {
      mockGetDb.mockReturnValue(null);

      const res = await app.request("/cross-city/compare");
      expect(res.status).toBe(503);
    });
  });

  describe("GET /cross-city/compare/:metric", () => {
    it("returns single metric detail", async () => {
      mockGetSingleMetric.mockResolvedValue({
        metric: "problems_per_capita",
        cities: [
          { id: "chicago", name: "City of Chicago", value: 9.98 },
          { id: "portland", name: "City of Portland", value: 9.96 },
        ],
      });

      const res = await app.request("/cross-city/compare/problems_per_capita");
      expect(res.status).toBe(200);

      const body = await jsonBody(res) as {
        ok: boolean;
        data: { metric: string; cities: Array<{ id: string; value: number }> };
      };

      expect(body.ok).toBe(true);
      expect(body.data.metric).toBe("problems_per_capita");
      expect(body.data.cities.length).toBeGreaterThanOrEqual(2);
    });

    it("returns 422 for invalid metric name", async () => {
      const res = await app.request("/cross-city/compare/invalid_metric_name");
      expect(res.status).toBe(422);

      const body = await jsonBody(res) as { ok: boolean; error: { code: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("supports all valid metric types", async () => {
      const validMetrics = [
        "problems_per_capita",
        "observations",
        "validator_density",
        "problems",
        "validator_count",
      ];

      for (const metric of validMetrics) {
        mockGetSingleMetric.mockResolvedValue({
          metric,
          cities: [{ id: "chicago", name: "City of Chicago", value: 42 }],
        });

        const res = await app.request(`/cross-city/compare/${metric}`);
        expect(res.status).toBe(200);
      }
    });
  });
});
