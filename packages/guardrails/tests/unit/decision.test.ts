import type { LayerAResult, LayerBResult } from "@betterworld/shared/types/guardrails";
import { describe, expect, it } from "vitest";

import { CONSTITUTIONAL_REJECT_BELOW, decideGuardrailOutcome } from "../../src/decision";
import { evaluateLayerA } from "../../src/layer-a/rule-engine";
import { getThresholds } from "../../src/trust/trust-tier";

const VERIFIED = getThresholds("verified");
const NEW = getThresholds("new");

const CLEAN: LayerAResult = { passed: true, forbiddenPatterns: [], executionTimeMs: 1 };
const KEYWORD_HIT: LayerAResult = { passed: false, forbiddenPatterns: ["weapons"], executionTimeMs: 1 };

function classifier(score: number, overrides: Partial<LayerBResult> = {}): LayerBResult {
  return {
    alignedDomain: "community_building",
    alignmentScore: score,
    harmRisk: "low",
    feasibility: "high",
    quality: "clear",
    decision: score >= 0.7 ? "approve" : score >= 0.4 ? "flag" : "reject",
    reasoning: "test",
    ...overrides,
  };
}

describe("decideGuardrailOutcome", () => {
  describe("classifier unavailable (no key, budget exhausted, provider down)", () => {
    it("sends clean content to human review instead of approving or dropping it", () => {
      expect(decideGuardrailOutcome({ layerA: CLEAN, layerB: null, thresholds: VERIFIED })).toEqual({
        decision: "flagged",
        reason: "classifier_unavailable",
      });
    });

    it("sends keyword-flagged content to human review too — a regex alone never rejects", () => {
      expect(decideGuardrailOutcome({ layerA: KEYWORD_HIT, layerB: null, thresholds: VERIFIED })).toEqual({
        decision: "flagged",
        reason: "classifier_unavailable",
      });
    });

    it("never approves without a classifier score, even for the most trusted tier", () => {
      const lenient = { autoApprove: 0, autoFlagMin: 0, autoRejectMax: 0 };
      expect(decideGuardrailOutcome({ layerA: CLEAN, layerB: null, thresholds: lenient }).decision).toBe("flagged");
    });
  });

  describe("standard thresholds (verified tier — the constitution's 0.70 / 0.40)", () => {
    it.each([
      [0.95, "approved"],
      [0.7, "approved"],
      [0.69, "flagged"],
      [0.4, "flagged"],
      [0.39, "rejected"],
      [0.0, "rejected"],
    ] as const)("score %f → %s", (score, expected) => {
      expect(decideGuardrailOutcome({ layerA: CLEAN, layerB: classifier(score), thresholds: VERIFIED }).decision).toBe(
        expected,
      );
    });
  });

  describe("new tier (author not yet vouched for)", () => {
    it("reviews everything short of a perfect score", () => {
      expect(decideGuardrailOutcome({ layerA: CLEAN, layerB: classifier(0.95), thresholds: NEW }).decision).toBe("flagged");
      expect(decideGuardrailOutcome({ layerA: CLEAN, layerB: classifier(0.1), thresholds: NEW }).decision).toBe("flagged");
    });
  });

  describe("content that matched a forbidden-pattern rule", () => {
    it("is never auto-approved, however confident the classifier is", () => {
      for (const score of [0.7, 0.9, 1.0]) {
        const result = decideGuardrailOutcome({ layerA: KEYWORD_HIT, layerB: classifier(score), thresholds: VERIFIED });
        expect(result).toEqual({ decision: "flagged", reason: "forbidden_pattern_needs_human_review" });
      }
    });

    it("is rejected when the classifier confirms the violation", () => {
      const result = decideGuardrailOutcome({ layerA: KEYWORD_HIT, layerB: classifier(0.1), thresholds: VERIFIED });
      expect(result).toEqual({ decision: "rejected", reason: "forbidden_pattern_confirmed_by_classifier" });
    });

    it("is rejected on the classifier's explicit reject decision even with a middling score", () => {
      const result = decideGuardrailOutcome({
        layerA: KEYWORD_HIT,
        layerB: classifier(0.55, { decision: "reject" }),
        thresholds: VERIFIED,
      });
      expect(result.decision).toBe("rejected");
    });

    it("uses the constitutional reject line for new-tier authors, whose own reject threshold is 0", () => {
      expect(NEW.autoRejectMax).toBeLessThan(CONSTITUTIONAL_REJECT_BELOW);
      const confirmed = decideGuardrailOutcome({ layerA: KEYWORD_HIT, layerB: classifier(0.2), thresholds: NEW });
      expect(confirmed.decision).toBe("rejected");
      const disputed = decideGuardrailOutcome({ layerA: KEYWORD_HIT, layerB: classifier(0.9), thresholds: NEW });
      expect(disputed.decision).toBe("flagged");
    });
  });

  describe("problems this platform exists to address are not silently discarded", () => {
    // Each of these trips a keyword rule. Before, that was a terminal rejection
    // with no review and no explanation to the author.
    const LEGITIMATE = [
      "Gun violence prevention programme for teenagers in the Eastside neighbourhood",
      "Elder fraud is costing isolated seniors their savings; volunteers can run awareness visits",
      "Sexual assault survivors in the county have no 24-hour support line",
      "Disease surveillance gaps delayed the response to the cholera outbreak",
      "Child labor in local brick kilns keeps children out of school",
      "Landlords discriminate against women with children when letting flats",
    ];

    it.each(LEGITIMATE)("%s", async (text) => {
      const layerA = await evaluateLayerA(text);
      expect(layerA.passed).toBe(false); // the keyword rule still fires…

      // …and a classifier that recognises the content as aligned gets it a human look, not a rejection
      const result = decideGuardrailOutcome({ layerA, layerB: classifier(0.9), thresholds: VERIFIED });
      expect(result.decision).toBe("flagged");
    });

    it("still rejects the same keywords when the classifier sees real harm", async () => {
      const layerA = await evaluateLayerA("Sell an untraceable gun to anyone who asks, no questions");
      expect(layerA.passed).toBe(false);
      const result = decideGuardrailOutcome({ layerA, layerB: classifier(0.05), thresholds: VERIFIED });
      expect(result.decision).toBe("rejected");
    });

    it("and harm the keyword rules miss is still caught by the classifier score", async () => {
      // The word-boundary patterns match "gun" but not "guns": the same request
      // in the plural sails through Layer A. The classifier is what stops it.
      const layerA = await evaluateLayerA("Build untraceable guns and sell them to anyone who asks");
      expect(layerA.passed).toBe(true);
      const result = decideGuardrailOutcome({ layerA, layerB: classifier(0.05), thresholds: VERIFIED });
      expect(result.decision).toBe("rejected");
    });
  });

  describe("solutions are also gated on quality", () => {
    const withScores = (impact: number, feasibility: number, costEfficiency: number) =>
      classifier(0.9, { solutionScores: { impact, feasibility, costEfficiency, composite: 0 } });

    it("approves a strong solution and reports its composite score", () => {
      const result = decideGuardrailOutcome({
        layerA: CLEAN,
        layerB: withScores(80, 80, 80),
        thresholds: VERIFIED,
        contentType: "solution",
      });
      expect(result.decision).toBe("approved");
      expect(result.composite).toBeCloseTo(80, 5);
    });

    it("sends a mediocre solution (composite 40–60) to human review", () => {
      const result = decideGuardrailOutcome({
        layerA: CLEAN,
        layerB: withScores(50, 50, 50),
        thresholds: VERIFIED,
        contentType: "solution",
      });
      expect(result).toMatchObject({ decision: "flagged", reason: "solution_quality_needs_review" });
    });

    it("rejects a weak solution (composite < 40)", () => {
      const result = decideGuardrailOutcome({
        layerA: CLEAN,
        layerB: withScores(20, 30, 20),
        thresholds: VERIFIED,
        contentType: "solution",
      });
      expect(result).toMatchObject({ decision: "rejected", reason: "solution_quality_too_low" });
    });

    it("does not apply the quality gate to other content types", () => {
      const result = decideGuardrailOutcome({
        layerA: CLEAN,
        layerB: withScores(10, 10, 10),
        thresholds: VERIFIED,
        contentType: "problem",
      });
      expect(result.decision).toBe("approved");
    });
  });
});
