import { describe, it, expect, vi, beforeEach } from "vitest";

import { getComparativeMetrics, getSingleMetric } from "../cross-city.service.js";

// ── Mock logger ──────────────────────────────────────────────
vi.mock("../../middleware/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("Cross-City Service", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getComparativeMetrics", () => {
    it("normalizes per-capita metrics correctly", async () => {
      // Mock db.execute for 3 raw SQL queries
      let executeCallCount = 0;
      mockDb = {
        execute: vi.fn().mockImplementation(() => {
          executeCallCount++;
          if (executeCallCount === 1) {
            // Problem counts by city
            return Promise.resolve([
              { city: "chicago", count: "274" },
              { city: "portland", count: "65" },
              { city: "denver", count: "71" },
            ]);
          }
          if (executeCallCount === 2) {
            // Observation counts by city
            return Promise.resolve([
              { city: "chicago", count: "150" },
              { city: "portland", count: "30" },
            ]);
          }
          // Validator counts by region
          return Promise.resolve([
            { region: "Chicago, IL", count: "10" },
            { region: "Portland, OR", count: "5" },
            { region: "Denver, CO", count: "3" },
          ]);
        }),
      };

      const result = await getComparativeMetrics(mockDb);

      expect(result.cities).toHaveLength(3);

      // Verify Chicago metrics
      const chicago = result.cities.find((c) => c.id === "chicago");
      expect(chicago).toBeDefined();
      expect(chicago!.problems).toBe(274);
      // Per 100K: 274 * (100_000 / 2_746_388) ~ 9.98
      expect(chicago!.problemsPerCapita).toBeGreaterThan(0);
      expect(chicago!.observations).toBe(150);
      expect(chicago!.validatorCount).toBe(10);

      // Verify Portland metrics
      const portland = result.cities.find((c) => c.id === "portland");
      expect(portland).toBeDefined();
      expect(portland!.problems).toBe(65);
      // Per 100K: 65 * (100_000 / 652_503) ~ 9.96
      expect(portland!.problemsPerCapita).toBeGreaterThan(0);

      // Portland per-capita should be similar to Chicago despite fewer raw problems
      // because population is much smaller
    });

    it("handles cities with zero data", async () => {
      let executeCallCount = 0;
      mockDb = {
        execute: vi.fn().mockImplementation(() => {
          executeCallCount++;
          if (executeCallCount === 1) {
            // Only chicago has problems
            return Promise.resolve([{ city: "chicago", count: "100" }]);
          }
          if (executeCallCount === 2) {
            return Promise.resolve([]); // No observations
          }
          return Promise.resolve([]); // No validators
        }),
      };

      const result = await getComparativeMetrics(mockDb);

      expect(result.cities).toHaveLength(3);

      const portland = result.cities.find((c) => c.id === "portland");
      expect(portland).toBeDefined();
      expect(portland!.problems).toBe(0);
      expect(portland!.problemsPerCapita).toBe(0);
      expect(portland!.observations).toBe(0);
      expect(portland!.validatorCount).toBe(0);
    });

    it("returns all configured cities even without data", async () => {
      mockDb = {
        execute: vi.fn().mockResolvedValue([]),
      };

      const result = await getComparativeMetrics(mockDb);

      // Should include all cities from OPEN311_CITY_CONFIGS
      expect(result.cities.length).toBeGreaterThanOrEqual(3);
      const cityIds = result.cities.map((c) => c.id);
      expect(cityIds).toContain("chicago");
      expect(cityIds).toContain("portland");
      expect(cityIds).toContain("denver");
    });
  });

  describe("getSingleMetric", () => {
    it("extracts problems_per_capita metric for all cities", async () => {
      let executeCallCount = 0;
      mockDb = {
        execute: vi.fn().mockImplementation(() => {
          executeCallCount++;
          if (executeCallCount === 1) {
            return Promise.resolve([
              { city: "chicago", count: "500" },
              { city: "portland", count: "100" },
            ]);
          }
          return Promise.resolve([]);
        }),
      };

      const result = await getSingleMetric(mockDb, "problems_per_capita");

      expect(result.metric).toBe("problems_per_capita");
      expect(result.cities.length).toBeGreaterThanOrEqual(2);

      const chicago = result.cities.find((c) => c.id === "chicago");
      expect(chicago).toBeDefined();
      expect(chicago!.value).toBeGreaterThan(0);
    });

    it("returns empty cities array for invalid metric", async () => {
      mockDb = {
        execute: vi.fn().mockResolvedValue([]),
      };

      const result = await getSingleMetric(mockDb, "invalid_metric");

      expect(result.metric).toBe("invalid_metric");
      expect(result.cities).toHaveLength(0);
    });
  });
});
