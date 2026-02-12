/**
 * Hyperlocal Scoring Engine (Sprint 10 — US6)
 *
 * Scale-adaptive scoring: hyperlocal problems (neighborhood/city scope) use
 * urgency + actionability weights, while global problems retain Phase 2 weights.
 *
 * Hyperlocal weights: urgency 0.30 + actionability 0.30 + feasibility 0.25 + communityDemand 0.15
 * Global weights:     impact 0.40 + feasibility 0.35 + costEfficiency 0.25
 */
import { HYPERLOCAL_SCORING_WEIGHTS, GLOBAL_SCORING_WEIGHTS } from "@betterworld/shared";

/**
 * Problem-like input for scoring.
 */
export interface ScorableProblem {
  geographicScope: string | null;
  localUrgency: string | null;
  actionability: string | null;
  observationCount: number;
  upvotes: number;
  // Phase 2 scoring fields (for global problems)
  alignmentScore: string | null;
  severity: string;
  // Sprint 12: Community attestation count (T069)
  confirmedAttestations?: number;
}

/**
 * Scoring result.
 */
export interface ScoringResult {
  score: number;
  weights: "hyperlocal" | "global";
  breakdown: Record<string, number>;
}

/**
 * Compute a problem's score using scale-adaptive weights.
 *
 * If geographicScope is "neighborhood" or "city", hyperlocal weights are used.
 * Otherwise, Phase 2 global weights are used.
 */
export function computeScore(problem: ScorableProblem): ScoringResult {
  const scope = problem.geographicScope?.toLowerCase() ?? "";

  if (scope === "neighborhood" || scope === "city") {
    return computeHyperlocalScore(problem);
  }

  return computeGlobalScore(problem);
}

/**
 * Hyperlocal scoring:
 * urgency(0.30) + actionability(0.30) + feasibility(0.25) + communityDemand(0.15)
 */
function computeHyperlocalScore(problem: ScorableProblem): ScoringResult {
  const urgency = urgencyScore(problem.localUrgency);
  const actionability = actionabilityScore(problem.actionability);
  const feasibility = feasibilityFromSeverity(problem.severity);
  const demand = communityDemandScore(problem);

  let score =
    urgency * HYPERLOCAL_SCORING_WEIGHTS.urgency +
    actionability * HYPERLOCAL_SCORING_WEIGHTS.actionability +
    feasibility * HYPERLOCAL_SCORING_WEIGHTS.feasibility +
    demand * HYPERLOCAL_SCORING_WEIGHTS.communityDemand;

  // Sprint 12 (T069): 10% urgency boost if 3+ confirmed attestations
  const attestationBoost = (problem.confirmedAttestations ?? 0) >= 3 ? 0.10 : 0;
  if (attestationBoost > 0) {
    score *= 1 + attestationBoost;
  }

  return {
    score: Math.round(score * 100) / 100,
    weights: "hyperlocal",
    breakdown: {
      urgency,
      actionability,
      feasibility,
      communityDemand: demand,
      attestationBoost,
    },
  };
}

/**
 * Global scoring (Phase 2 weights):
 * impact(0.40) + feasibility(0.35) + costEfficiency(0.25)
 */
function computeGlobalScore(problem: ScorableProblem): ScoringResult {
  const impact = impactFromAlignment(problem.alignmentScore);
  const feasibility = feasibilityFromSeverity(problem.severity);
  const costEfficiency = costEfficiencyFromSeverity(problem.severity);

  const score =
    impact * GLOBAL_SCORING_WEIGHTS.impact +
    feasibility * GLOBAL_SCORING_WEIGHTS.feasibility +
    costEfficiency * GLOBAL_SCORING_WEIGHTS.costEfficiency;

  return {
    score: Math.round(score * 100) / 100,
    weights: "global",
    breakdown: {
      impact,
      feasibility,
      costEfficiency,
    },
  };
}

/**
 * Map localUrgency string to a 0-100 score.
 *
 * immediate = 100
 * days = 75
 * weeks = 50
 * months = 25
 * null = 50 (default)
 */
export function urgencyScore(localUrgency: string | null): number {
  if (!localUrgency) return 50;

  const mapping: Record<string, number> = {
    immediate: 100,
    days: 75,
    weeks: 50,
    months: 25,
  };

  return mapping[localUrgency.toLowerCase()] ?? 50;
}

/**
 * Map actionability string to a 0-100 score.
 *
 * individual = 100
 * small_group = 75
 * organization = 50
 * institutional = 25
 * null = 50 (default)
 */
export function actionabilityScore(actionability: string | null): number {
  if (!actionability) return 50;

  const mapping: Record<string, number> = {
    individual: 100,
    small_group: 75,
    organization: 50,
    institutional: 25,
  };

  return mapping[actionability.toLowerCase()] ?? 50;
}

/**
 * Community demand score based on observation count and upvotes.
 *
 * Formula: min(100, observationCount * 10 + upvotes * 5)
 * This rewards problems with more community engagement.
 */
export function communityDemandScore(problem: Pick<ScorableProblem, "observationCount" | "upvotes">): number {
  const raw = problem.observationCount * 10 + problem.upvotes * 5;
  return Math.min(100, raw);
}

/**
 * Derive impact score from alignment score (for global problems).
 * Alignment score is 0-1 decimal; multiply by 100.
 * Default: 50 if no alignment score.
 */
function impactFromAlignment(alignmentScore: string | null): number {
  if (!alignmentScore) return 50;
  const val = parseFloat(alignmentScore);
  if (isNaN(val)) return 50;
  return Math.round(val * 100);
}

/**
 * Derive feasibility score from severity.
 * Lower severity = higher feasibility (easier to address).
 */
function feasibilityFromSeverity(severity: string): number {
  const mapping: Record<string, number> = {
    low: 90,
    medium: 70,
    high: 50,
    critical: 30,
  };
  return mapping[severity.toLowerCase()] ?? 50;
}

/**
 * Derive cost efficiency score from severity.
 * Lower severity = more cost-efficient typically.
 */
function costEfficiencyFromSeverity(severity: string): number {
  const mapping: Record<string, number> = {
    low: 85,
    medium: 65,
    high: 45,
    critical: 25,
  };
  return mapping[severity.toLowerCase()] ?? 50;
}
