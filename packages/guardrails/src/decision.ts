import type {
  ContentType,
  LayerAResult,
  LayerBResult,
} from "@betterworld/shared/types/guardrails";

import { computeCompositeScore } from "./scoring/solution-scoring";
import type { TrustTierThresholds } from "./trust/trust-tier";

export type GuardrailOutcome = "approved" | "flagged" | "rejected";

/**
 * Below this classifier score, content that also tripped a forbidden-pattern
 * rule is rejected outright, whatever the author's trust tier. It is the
 * constitution's reject line (score < 0.4).
 */
export const CONSTITUTIONAL_REJECT_BELOW = 0.4;

export interface GuardrailDecisionInput {
  layerA: LayerAResult;
  /** null when the classifier could not run (no key, budget exhausted, provider error). */
  layerB: LayerBResult | null;
  thresholds: TrustTierThresholds;
  contentType?: ContentType | string;
}

export interface GuardrailDecision {
  decision: GuardrailOutcome;
  /** Short machine-readable reason, stored with the evaluation for reviewers. */
  reason:
    | "classifier_unavailable"
    | "score_above_approve_threshold"
    | "score_in_review_band"
    | "score_below_reject_threshold"
    | "solution_quality_too_low"
    | "solution_quality_needs_review"
    | "forbidden_pattern_confirmed_by_classifier"
    | "forbidden_pattern_needs_human_review";
  /** Composite solution score, when the content is a solution with scores. */
  composite?: number;
}

/**
 * Combine Layer A (keyword rules) and Layer B (classifier) into one outcome.
 *
 * Invariants:
 *  - Nothing is approved without a classifier score at or above the author's
 *    approve threshold. No classifier → human review.
 *  - Content that matched a forbidden-pattern rule is NEVER auto-approved.
 *    If the classifier agrees it is a violation it is rejected; otherwise a
 *    human decides. A keyword alone no longer rejects: "gun violence
 *    prevention", "elder fraud" or "disease surveillance" are problems this
 *    platform exists to address, and a regex cannot tell them from the harm.
 */
export function decideGuardrailOutcome(input: GuardrailDecisionInput): GuardrailDecision {
  const { layerA, layerB, thresholds, contentType } = input;

  if (!layerB) {
    return { decision: "flagged", reason: "classifier_unavailable" };
  }

  const score = layerB.alignmentScore;

  if (!layerA.passed) {
    const rejectBelow = Math.max(thresholds.autoRejectMax, CONSTITUTIONAL_REJECT_BELOW);
    if (score < rejectBelow || layerB.decision === "reject") {
      return { decision: "rejected", reason: "forbidden_pattern_confirmed_by_classifier" };
    }
    return { decision: "flagged", reason: "forbidden_pattern_needs_human_review" };
  }

  let decision: GuardrailOutcome;
  let reason: GuardrailDecision["reason"];
  if (score >= thresholds.autoApprove) {
    decision = "approved";
    reason = "score_above_approve_threshold";
  } else if (score >= thresholds.autoRejectMax) {
    decision = "flagged";
    reason = "score_in_review_band";
  } else {
    decision = "rejected";
    reason = "score_below_reject_threshold";
  }

  // Solutions are additionally gated on their quality scores.
  let composite: number | undefined;
  if (contentType === "solution" && layerB.solutionScores) {
    const { impact, feasibility, costEfficiency } = layerB.solutionScores;
    composite = computeCompositeScore(impact, feasibility, costEfficiency);
    if (decision === "approved") {
      if (composite < 40) {
        decision = "rejected";
        reason = "solution_quality_too_low";
      } else if (composite < 60) {
        decision = "flagged";
        reason = "solution_quality_needs_review";
      }
    }
  }

  return composite === undefined ? { decision, reason } : { decision, reason, composite };
}
