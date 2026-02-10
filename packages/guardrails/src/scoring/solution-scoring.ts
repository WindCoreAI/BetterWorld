/**
 * Solution scoring weights (must sum to 1.0).
 * These weights define the relative importance of each dimension.
 */
export const SCORING_WEIGHTS = {
  IMPACT: 0.4,
  FEASIBILITY: 0.35,
  COST_EFFICIENCY: 0.25,
} as const;

/**
 * Solution scoring engine.
 * Computes a composite quality score from three dimensions:
 * - Impact (40%): Social good potential
 * - Feasibility (35%): Realistic and actionable
 * - Cost Efficiency (25%): Resource-appropriate
 *
 * All input scores are on 0-100 scale and will be clamped to valid range.
 */
export function computeCompositeScore(
  impact: number,
  feasibility: number,
  costEfficiency: number,
): number {
  // Clamp inputs to valid range [0, 100]
  const clamp = (v: number) => Math.max(0, Math.min(100, v));

  const composite =
    clamp(impact) * SCORING_WEIGHTS.IMPACT +
    clamp(feasibility) * SCORING_WEIGHTS.FEASIBILITY +
    clamp(costEfficiency) * SCORING_WEIGHTS.COST_EFFICIENCY;

  return Math.round(composite * 100) / 100;
}
