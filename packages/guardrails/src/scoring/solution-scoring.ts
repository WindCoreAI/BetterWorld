/**
 * Solution scoring engine.
 * Computes a composite quality score from three dimensions:
 * - Impact (40%): Social good potential
 * - Feasibility (35%): Realistic and actionable
 * - Cost Efficiency (25%): Resource-appropriate
 *
 * All input scores are on 0-100 scale.
 */
export function computeCompositeScore(
  impact: number,
  feasibility: number,
  costEfficiency: number,
): number {
  const composite = impact * 0.4 + feasibility * 0.35 + costEfficiency * 0.25;
  return Math.round(composite * 100) / 100;
}
