import { describe, it, expect } from "vitest";

import { computeCompositeScore } from "../../src/scoring/solution-scoring.js";

describe("Solution Scoring Engine", () => {
  describe("computeCompositeScore", () => {
    it("should return 0 for all zero inputs", () => {
      const result = computeCompositeScore(0, 0, 0);
      expect(result).toBe(0);
    });

    it("should return 100 for all maximum inputs", () => {
      const result = computeCompositeScore(100, 100, 100);
      expect(result).toBe(100);
    });

    it("should return 50 for all mid-range inputs", () => {
      const result = computeCompositeScore(50, 50, 50);
      expect(result).toBe(50);
    });

    it("should compute weighted average correctly (80, 70, 60)", () => {
      const result = computeCompositeScore(80, 70, 60);
      // 80 * 0.4 + 70 * 0.35 + 60 * 0.25 = 32 + 24.5 + 15 = 71.5
      expect(result).toBe(71.5);
    });

    it("should apply correct weights: impact 40%, feasibility 35%, cost efficiency 25%", () => {
      // Test impact weight (40%)
      const impactOnly = computeCompositeScore(100, 0, 0);
      expect(impactOnly).toBe(40);

      // Test feasibility weight (35%)
      const feasibilityOnly = computeCompositeScore(0, 100, 0);
      expect(feasibilityOnly).toBe(35);

      // Test cost efficiency weight (25%)
      const costOnly = computeCompositeScore(0, 0, 100);
      expect(costOnly).toBe(25);

      // Verify weights sum to 1.0 (100%)
      expect(impactOnly + feasibilityOnly + costOnly).toBe(100);
    });

    it("should round to 2 decimal places", () => {
      // Create inputs that would produce >2 decimal places without rounding
      const result = computeCompositeScore(33, 33, 33);
      // 33 * 0.4 + 33 * 0.35 + 33 * 0.25 = 13.2 + 11.55 + 8.25 = 33.0
      expect(result).toBe(33);
      expect(result.toString()).not.toContain(".");
    });

    it("should handle boundary value: impact only", () => {
      const result = computeCompositeScore(100, 0, 0);
      expect(result).toBe(40);
    });

    it("should handle boundary value: feasibility only", () => {
      const result = computeCompositeScore(0, 100, 0);
      expect(result).toBe(35);
    });

    it("should handle boundary value: cost efficiency only", () => {
      const result = computeCompositeScore(0, 0, 100);
      expect(result).toBe(25);
    });

    it("should handle mixed values with decimal result", () => {
      const result = computeCompositeScore(75, 60, 85);
      // 75 * 0.4 + 60 * 0.35 + 85 * 0.25 = 30 + 21 + 21.25 = 72.25
      expect(result).toBe(72.25);
    });

    it("should handle high impact, low feasibility scenario", () => {
      const result = computeCompositeScore(90, 40, 50);
      // 90 * 0.4 + 40 * 0.35 + 50 * 0.25 = 36 + 14 + 12.5 = 62.5
      expect(result).toBe(62.5);
    });

    it("should handle high feasibility, low impact scenario", () => {
      const result = computeCompositeScore(40, 90, 50);
      // 40 * 0.4 + 90 * 0.35 + 50 * 0.25 = 16 + 31.5 + 12.5 = 60
      expect(result).toBe(60);
    });

    it("should handle high cost efficiency, low others scenario", () => {
      const result = computeCompositeScore(40, 50, 90);
      // 40 * 0.4 + 50 * 0.35 + 90 * 0.25 = 16 + 17.5 + 22.5 = 56
      expect(result).toBe(56);
    });
  });
});
