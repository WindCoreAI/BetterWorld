import { describe, it, expect, vi, beforeEach } from "vitest";

import { findClusters, generateClusterSummary } from "../pattern-aggregation.js";

// ── Mock logger ──────────────────────────────────────────────
vi.mock("../../middleware/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Test data ────────────────────────────────────────────────

function makeProblem(id: string, title: string, locationPoint: string | null = "POINT(-87.6 41.8)") {
  return {
    id,
    title,
    description: `Description for ${title}`,
    domain: "environmental_protection",
    locationName: "Near City Hall",
    latitude: "41.8781",
    longitude: "-87.6298",
    locationPoint,
  };
}

describe("Pattern Aggregation Service", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("findClusters", () => {
    it("forms a cluster when >= 5 nearby problems exist", async () => {
      const problems = [
        makeProblem("p1", "Pothole 1"),
        makeProblem("p2", "Pothole 2"),
        makeProblem("p3", "Pothole 3"),
        makeProblem("p4", "Pothole 4"),
        makeProblem("p5", "Pothole 5"),
      ];

      // First select: fetch recent problems
      const recentProblemsResult = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(problems),
          }),
        }),
      });

      // groupByProximity: for each problem, find neighbors
      // Each problem query returns all 5 (they're all within radius)
      const neighborResult = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(problems),
        }),
      });

      // Existing clusters query
      const existingClustersResult = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      // Insert cluster
      const insertValuesReturning = vi.fn().mockResolvedValue([{ id: "cluster-1" }]);
      const insertValues = vi.fn().mockReturnValue({ returning: insertValuesReturning });
      const insertFn = vi.fn().mockReturnValue({ values: insertValues });

      let selectCallCount = 0;
      mockDb = {
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) return recentProblemsResult();
          if (selectCallCount === 2) return neighborResult();
          return existingClustersResult();
        }),
        insert: insertFn,
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      const result = await findClusters(mockDb, "environmental_protection", "chicago");

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]!.memberCount).toBeGreaterThanOrEqual(5);
      expect(result[0]!.isNew).toBe(true);
    });

    it("flags cluster as systemic when memberCount >= 5", async () => {
      const problems = Array.from({ length: 7 }, (_, i) =>
        makeProblem(`p${i}`, `Issue ${i}`),
      );

      // First select: fetch recent problems
      const recentProblemsResult = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(problems),
          }),
        }),
      });

      // groupByProximity: all within radius
      const neighborResult = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(problems),
        }),
      });

      // No existing clusters
      const existingClustersResult = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      // Insert returns cluster
      const insertFn = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "cluster-systemic" }]),
        }),
      });

      let selectCallCount = 0;
      mockDb = {
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) return recentProblemsResult();
          if (selectCallCount === 2) return neighborResult();
          return existingClustersResult();
        }),
        insert: insertFn,
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      const result = await findClusters(mockDb, "environmental_protection", "chicago");

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]!.isSystemic).toBe(true);
    });

    it("returns empty when fewer than 5 problems exist", async () => {
      // Only 3 problems — below CLUSTER_MIN_SIZE threshold
      const fewProblems = [
        makeProblem("p1", "Issue 1"),
        makeProblem("p2", "Issue 2"),
        makeProblem("p3", "Issue 3"),
      ];

      const recentProblemsResult = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(fewProblems),
          }),
        }),
      });

      mockDb = {
        select: vi.fn().mockReturnValue(recentProblemsResult()),
      };

      const result = await findClusters(mockDb, "environmental_protection", "chicago");

      expect(result).toHaveLength(0);
    });

    it("each problem belongs to only one cluster (single membership)", async () => {
      // Two distinct groups: 5 near location A, 5 near location B
      const groupA = Array.from({ length: 5 }, (_, i) =>
        makeProblem(`a${i}`, `Group A Issue ${i}`, "POINT(-87.6 41.8)"),
      );
      const groupB = Array.from({ length: 5 }, (_, i) =>
        makeProblem(`b${i}`, `Group B Issue ${i}`, "POINT(-87.9 42.0)"),
      );
      const allProblems = [...groupA, ...groupB];

      // First select: all problems
      const recentProblemsResult = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(allProblems),
          }),
        }),
      });

      // For groupByProximity: first problem finds groupA, after visiting groupA,
      // first unvisited problem finds groupB
      let neighborCallCount = 0;
      const neighborResult = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            neighborCallCount++;
            if (neighborCallCount === 1) return Promise.resolve(groupA);
            return Promise.resolve(groupB);
          }),
        }),
      }));

      // No existing clusters
      const existingClustersResult = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      // Insert returns different cluster IDs
      let insertCount = 0;
      const insertFn = vi.fn().mockImplementation(() => ({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockImplementation(() => {
            insertCount++;
            return Promise.resolve([{ id: `cluster-${insertCount}` }]);
          }),
        }),
      }));

      let selectCallCount = 0;
      mockDb = {
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) return recentProblemsResult();
          if (selectCallCount === 2 || selectCallCount === 4) return neighborResult();
          return existingClustersResult();
        }),
        insert: insertFn,
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      const result = await findClusters(mockDb, "environmental_protection", "chicago");

      // Each cluster should have distinct member IDs
      if (result.length >= 2) {
        const ids1 = new Set(result[0]!.memberProblemIds);
        const ids2 = new Set(result[1]!.memberProblemIds);
        const overlap = [...ids1].filter((id) => ids2.has(id));
        expect(overlap).toHaveLength(0);
      }
    });
  });

  describe("generateClusterSummary", () => {
    it("returns summary with problem count and titles", () => {
      const problems = [
        { title: "Pothole on Main St", description: "Big hole", locationName: "Main St" },
        { title: "Crack on Oak Ave", description: "Surface crack", locationName: "Oak Ave" },
        { title: "Sinkhole near park", description: "Dangerous", locationName: "Central Park" },
      ];

      const summary = generateClusterSummary(problems);

      expect(summary).toContain("3");
      expect(summary).toContain("Pothole on Main St");
      expect(summary).toContain("Main St");
    });

    it("handles empty input", () => {
      const summary = generateClusterSummary([]);
      expect(summary).toBe("Empty cluster");
    });

    it("truncates long title lists", () => {
      const problems = Array.from({ length: 10 }, (_, i) => ({
        title: `Issue ${i}`,
        description: `Description ${i}`,
        locationName: null,
      }));

      const summary = generateClusterSummary(problems);

      expect(summary).toContain("10");
      expect(summary).toContain("and");
      expect(summary).toContain("more");
    });
  });
});
