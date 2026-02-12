import { describe, it, expect } from "vitest";

import {
  computeScore,
  urgencyScore,
  actionabilityScore,
  communityDemandScore,
} from "../../src/services/hyperlocal-scoring.js";
import type { ScorableProblem } from "../../src/services/hyperlocal-scoring.js";

describe("Hyperlocal Scoring Engine (US6)", () => {
  // ============================================================================
  // Weight Selection
  // ============================================================================

  it("should use hyperlocal weights for neighborhood scope", () => {
    const problem: ScorableProblem = {
      geographicScope: "neighborhood",
      localUrgency: "immediate",
      actionability: "individual",
      observationCount: 5,
      upvotes: 10,
      alignmentScore: "0.80",
      severity: "medium",
    };

    const result = computeScore(problem);
    expect(result.weights).toBe("hyperlocal");
    expect(result.breakdown).toHaveProperty("urgency");
    expect(result.breakdown).toHaveProperty("actionability");
    expect(result.breakdown).toHaveProperty("feasibility");
    expect(result.breakdown).toHaveProperty("communityDemand");
  });

  it("should use hyperlocal weights for city scope", () => {
    const problem: ScorableProblem = {
      geographicScope: "city",
      localUrgency: "days",
      actionability: "small_group",
      observationCount: 2,
      upvotes: 3,
      alignmentScore: null,
      severity: "high",
    };

    const result = computeScore(problem);
    expect(result.weights).toBe("hyperlocal");
  });

  it("should use global weights for global scope", () => {
    const problem: ScorableProblem = {
      geographicScope: "global",
      localUrgency: null,
      actionability: null,
      observationCount: 0,
      upvotes: 100,
      alignmentScore: "0.90",
      severity: "critical",
    };

    const result = computeScore(problem);
    expect(result.weights).toBe("global");
    expect(result.breakdown).toHaveProperty("impact");
    expect(result.breakdown).toHaveProperty("feasibility");
    expect(result.breakdown).toHaveProperty("costEfficiency");
  });

  it("should use global weights for country scope", () => {
    const problem: ScorableProblem = {
      geographicScope: "country",
      localUrgency: null,
      actionability: null,
      observationCount: 0,
      upvotes: 50,
      alignmentScore: "0.75",
      severity: "medium",
    };

    const result = computeScore(problem);
    expect(result.weights).toBe("global");
  });

  it("should default to global weights when scope is null", () => {
    const problem: ScorableProblem = {
      geographicScope: null,
      localUrgency: null,
      actionability: null,
      observationCount: 0,
      upvotes: 0,
      alignmentScore: null,
      severity: "medium",
    };

    const result = computeScore(problem);
    expect(result.weights).toBe("global");
  });

  // ============================================================================
  // Urgency Mapping
  // ============================================================================

  it("should map urgency values correctly", () => {
    expect(urgencyScore("immediate")).toBe(100);
    expect(urgencyScore("days")).toBe(75);
    expect(urgencyScore("weeks")).toBe(50);
    expect(urgencyScore("months")).toBe(25);
    expect(urgencyScore(null)).toBe(50);
    expect(urgencyScore("unknown")).toBe(50);
  });

  // ============================================================================
  // Actionability Mapping
  // ============================================================================

  it("should map actionability values correctly", () => {
    expect(actionabilityScore("individual")).toBe(100);
    expect(actionabilityScore("small_group")).toBe(75);
    expect(actionabilityScore("organization")).toBe(50);
    expect(actionabilityScore("institutional")).toBe(25);
    expect(actionabilityScore(null)).toBe(50);
    expect(actionabilityScore("unknown")).toBe(50);
  });

  // ============================================================================
  // Community Demand
  // ============================================================================

  it("should compute community demand from observations and upvotes", () => {
    expect(communityDemandScore({ observationCount: 0, upvotes: 0 })).toBe(0);
    expect(communityDemandScore({ observationCount: 5, upvotes: 0 })).toBe(50);
    expect(communityDemandScore({ observationCount: 0, upvotes: 10 })).toBe(50);
    expect(communityDemandScore({ observationCount: 3, upvotes: 5 })).toBe(55);
  });

  it("should cap community demand at 100", () => {
    expect(communityDemandScore({ observationCount: 20, upvotes: 30 })).toBe(100);
  });

  // ============================================================================
  // Score Computation
  // ============================================================================

  it("should compute hyperlocal score with correct weights", () => {
    const problem: ScorableProblem = {
      geographicScope: "neighborhood",
      localUrgency: "immediate", // 100
      actionability: "individual", // 100
      observationCount: 10, // demand = 100
      upvotes: 0,
      alignmentScore: null,
      severity: "medium", // feasibility = 70
    };

    const result = computeScore(problem);
    // 100*0.30 + 100*0.30 + 70*0.25 + 100*0.15 = 30 + 30 + 17.5 + 15 = 92.5
    expect(result.score).toBe(92.5);
    expect(result.weights).toBe("hyperlocal");
  });

  it("should compute global score with correct weights", () => {
    const problem: ScorableProblem = {
      geographicScope: "global",
      localUrgency: null,
      actionability: null,
      observationCount: 0,
      upvotes: 0,
      alignmentScore: "1.00", // impact = 100
      severity: "low", // feasibility = 90, costEfficiency = 85
    };

    const result = computeScore(problem);
    // 100*0.40 + 90*0.35 + 85*0.25 = 40 + 31.5 + 21.25 = 92.75
    expect(result.score).toBe(92.75);
    expect(result.weights).toBe("global");
  });

  it("should return a score between 0 and 100", () => {
    // Minimum possible hyperlocal score
    const minProblem: ScorableProblem = {
      geographicScope: "neighborhood",
      localUrgency: "months", // 25
      actionability: "institutional", // 25
      observationCount: 0, // demand = 0
      upvotes: 0,
      alignmentScore: null,
      severity: "critical", // feasibility = 30
    };

    const minResult = computeScore(minProblem);
    expect(minResult.score).toBeGreaterThanOrEqual(0);
    expect(minResult.score).toBeLessThanOrEqual(100);

    // Maximum possible hyperlocal score
    const maxProblem: ScorableProblem = {
      geographicScope: "neighborhood",
      localUrgency: "immediate", // 100
      actionability: "individual", // 100
      observationCount: 10, // demand = 100
      upvotes: 10,
      alignmentScore: null,
      severity: "low", // feasibility = 90
    };

    const maxResult = computeScore(maxProblem);
    expect(maxResult.score).toBeGreaterThanOrEqual(0);
    expect(maxResult.score).toBeLessThanOrEqual(100);
  });
});
