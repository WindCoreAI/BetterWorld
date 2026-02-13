/**
 * Deterministic hash-based traffic routing.
 *
 * Uses SHA-256(submissionId) mod 100 to deterministically route
 * submissions to peer consensus or Layer B.
 * Same input always produces the same result (no flapping).
 */
import { createHash } from "node:crypto";

/**
 * Determine whether a submission should route to peer consensus.
 *
 * @param submissionId - UUID of the submission
 * @param trafficPct - Percentage (0-100) of traffic to route to peer consensus
 * @returns true if this submission should use peer consensus
 */
export function shouldRouteToPerConsensus(
  submissionId: string,
  trafficPct: number,
): boolean {
  if (trafficPct <= 0) return false;
  if (trafficPct >= 100) return true;

  const hash = createHash("sha256").update(submissionId).digest("hex");
  // Take first 8 hex chars (32 bits) for modular arithmetic
  const hashInt = parseInt(hash.substring(0, 8), 16);
  const bucket = hashInt % 100;

  return bucket < trafficPct;
}
