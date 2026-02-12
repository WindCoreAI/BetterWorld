/**
 * Spot Check Service (Sprint 12 — T045)
 *
 * 5% of peer-validated submissions are independently verified by Layer B.
 * Uses SHA-256(id + 'spot') mod 100 < 5 for deterministic selection.
 */
import { createHash } from "node:crypto";

import { spotChecks } from "@betterworld/db";
import { SPOT_CHECK_RATE, SPOT_CHECK_HASH_SEED } from "@betterworld/shared";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/**
 * Deterministically decide if a submission should be spot-checked.
 * Uses SHA-256(submissionId + 'spot') mod 100 < SPOT_CHECK_RATE (5%)
 */
export function shouldSpotCheck(submissionId: string): boolean {
  const hash = createHash("sha256")
    .update(submissionId + SPOT_CHECK_HASH_SEED)
    .digest("hex");
  const value = parseInt(hash.slice(0, 8), 16) % 100;
  return value < SPOT_CHECK_RATE;
}

/**
 * Classify disagreement type between peer and Layer B decisions.
 */
function classifyDisagreement(
  peerDecision: string,
  layerBDecision: string,
): string | null {
  if (peerDecision === "approved" && layerBDecision === "rejected") {
    return "false_negative"; // Peer approved but Layer B would reject
  }
  if (peerDecision === "rejected" && layerBDecision === "approved") {
    return "false_positive"; // Peer rejected but Layer B would approve
  }
  if (peerDecision === "approved" && layerBDecision === "flagged") {
    return "missed_flag"; // Peer approved but Layer B flagged for review
  }
  if (peerDecision === "rejected" && layerBDecision === "flagged") {
    return "over_rejection"; // Peer rejected, Layer B just flagged
  }
  return null; // Agree or unexpected combination
}

/**
 * Record a spot check result.
 */
export async function recordSpotCheck(
  db: PostgresJsDatabase,
  submissionId: string,
  submissionType: string,
  peerDecision: string,
  peerConfidence: number,
  layerBDecision: string,
  layerBScore: number,
): Promise<{ id: string; agrees: boolean; disagreementType: string | null }> {
  const agrees = (peerDecision === "approved" && layerBDecision === "approved") ||
    (peerDecision === "rejected" && (layerBDecision === "rejected" || layerBDecision === "flagged"));

  const disagreementType = agrees ? null : classifyDisagreement(peerDecision, layerBDecision);

  const [record] = await db
    .insert(spotChecks)
    .values({
      submissionId,
      submissionType: submissionType as "problem" | "solution" | "debate" | "mission",
      peerDecision: peerDecision as "approved" | "rejected" | "escalated" | "expired",
      peerConfidence: String(peerConfidence),
      layerBDecision: layerBDecision as "approved" | "rejected" | "flagged",
      layerBAlignmentScore: String(layerBScore),
      agrees,
      disagreementType,
    })
    .returning({ id: spotChecks.id });

  return { id: record!.id, agrees, disagreementType };
}
