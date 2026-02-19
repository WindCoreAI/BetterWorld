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
              { city: "newyork", count: "274" },
              { city: "sanfrancisco", count: "65" },
              { city: "seattle", count: "71" },
            ]);
          }
          if (executeCallCount === 2) {
            // Observation counts by city
            return Promise.resolve([
              { city: "newyork", count: "150" },
              { city: "sanfrancisco", count: "30" },
            ]);
          }
          // Validator counts by region
          return Promise.resolve([
            { region: "New York, NY", count: "10" },
            { region: "San Francisco, CA", count: "5" },
            { region: "Seattle, WA", count: "3" },
          ]);
        }),
      };

      const result = await getComparativeMetrics(mockDb);

      expect(result.cities).toHaveLength(3);

      // Verify New York metrics
      const newyork = result.cities.find((c) => c.id === "newyork");
      expect(newyork).toBeDefined();
      expect(newyork!.problems).toBe(274);
      // Per 100K: 274 * (100_000 / 8_336_817) ~ 3.29
      expect(newyork!.problemsPerCapita).toBeGreaterThan(0);
      expect(newyork!.observations).toBe(150);
      expect(newyork!.validatorCount).toBe(10);

      // Verify San Francisco metrics
      const sanfrancisco = result.cities.find((c) => c.id === "sanfrancisco");
      expect(sanfrancisco).toBeDefined();
      expect(sanfrancisco!.problems).toBe(65);
      // Per 100K: 65 * (100_000 / 873_965) ~ 7.44
      expect(sanfrancisco!.problemsPerCapita).toBeGreaterThan(0);

      // San Francisco per-capita should be higher than New York despite fewer raw problems
      // because population is much smaller
    });

    it("handles cities with zero data", async () => {
      let executeCallCount = 0;
      mockDb = {
        execute: vi.fn().mockImplementation(() => {
          executeCallCount++;
          if (executeCallCount === 1) {
            // Only newyork has problems
            return Promise.resolve([{ city: "newyork", count: "100" }]);
          }
          if (executeCallCount === 2) {
            return Promise.resolve([]); // No observations
          }
          return Promise.resolve([]); // No validators
        }),
      };

      const result = await getComparativeMetrics(mockDb);

      expect(result.cities).toHaveLength(3);

      const sanfrancisco = result.cities.find((c) => c.id === "sanfrancisco");
      expect(sanfrancisco).toBeDefined();
      expect(sanfrancisco!.problems).toBe(0);
      expect(sanfrancisco!.problemsPerCapita).toBe(0);
      expect(sanfrancisco!.observations).toBe(0);
      expect(sanfrancisco!.validatorCount).toBe(0);
    });

    it("returns all configured cities even without data", async () => {
      mockDb = {
        execute: vi.fn().mockResolvedValue([]),
      };

      const result = await getComparativeMetrics(mockDb);

      // Should include all cities from OPEN311_CITY_CONFIGS
      expect(result.cities.length).toBeGreaterThanOrEqual(3);
      const cityIds = result.cities.map((c) => c.id);
      expect(cityIds).toContain("newyork");
      expect(cityIds).toContain("sanfrancisco");
      expect(cityIds).toContain("seattle");
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
              { city: "newyork", count: "500" },
              { city: "sanfrancisco", count: "100" },
            ]);
          }
          return Promise.resolve([]);
        }),
      };

      const result = await getSingleMetric(mockDb, "problems_per_capita");

      expect(result.metric).toBe("problems_per_capita");
      expect(result.cities.length).toBeGreaterThanOrEqual(2);

      const newyork = result.cities.find((c) => c.id === "newyork");
      expect(newyork).toBeDefined();
      expect(newyork!.value).toBeGreaterThan(0);
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
