/**
 * Attestation Service (Sprint 12 — T068)
 *
 * Community members attest to problem status (confirmed/resolved/not_found).
 * 3+ "confirmed" attestations boost urgency score by 10%.
 */
import { attestations } from "@betterworld/db";
import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { logger } from "../middleware/logger.js";

export interface AttestationCounts {
  confirmed: number;
  resolved: number;
  not_found: number;
  total: number;
}

/**
 * Submit an attestation for a problem.
 * Handles duplicate check via unique constraint (problemId, humanId).
 */
export async function submitAttestation(
  db: PostgresJsDatabase,
  problemId: string,
  humanId: string,
  statusType: "confirmed" | "resolved" | "not_found",
): Promise<{ id: string; counts: AttestationCounts }> {
  // Insert with ON CONFLICT to handle duplicate
  const [record] = await db
    .insert(attestations)
    .values({
      problemId,
      humanId,
      statusType,
    })
    .onConflictDoUpdate({
      target: [attestations.problemId, attestations.humanId],
      set: { statusType },
    })
    .returning({ id: attestations.id });

  logger.info(
    { problemId, humanId, statusType, attestationId: record!.id },
    "Attestation submitted",
  );

  const counts = await getAttestationCounts(db, problemId);

  return { id: record!.id, counts };
}

/**
 * Get attestation counts aggregated by status_type for a problem.
 */
export async function getAttestationCounts(
  db: PostgresJsDatabase,
  problemId: string,
): Promise<AttestationCounts> {
  const rows = await db
    .select({
      statusType: attestations.statusType,
      count: sql<string>`COUNT(*)`,
    })
    .from(attestations)
    .where(eq(attestations.problemId, problemId))
    .groupBy(attestations.statusType);

  const counts: AttestationCounts = {
    confirmed: 0,
    resolved: 0,
    not_found: 0,
    total: 0,
  };

  for (const row of rows) {
    const c = Number(row.count);
    if (row.statusType === "confirmed") counts.confirmed = c;
    else if (row.statusType === "resolved") counts.resolved = c;
    else if (row.statusType === "not_found") counts.not_found = c;
    counts.total += c;
  }

  return counts;
}

/**
 * Remove an attestation (user retracts their attestation).
 */
export async function removeAttestation(
  db: PostgresJsDatabase,
  problemId: string,
  humanId: string,
): Promise<boolean> {
  const result = await db
    .delete(attestations)
    .where(
      and(
        eq(attestations.problemId, problemId),
        eq(attestations.humanId, humanId),
      ),
    )
    .returning({ id: attestations.id });

  if (result.length > 0) {
    logger.info({ problemId, humanId }, "Attestation removed");
    return true;
  }
  return false;
}

/**
 * Get a user's own attestation for a problem (if any).
 */
export async function getUserAttestation(
  db: PostgresJsDatabase,
  problemId: string,
  humanId: string,
): Promise<{ id: string; statusType: string } | null> {
  const [row] = await db
    .select({
      id: attestations.id,
      statusType: attestations.statusType,
    })
    .from(attestations)
    .where(
      and(
        eq(attestations.problemId, problemId),
        eq(attestations.humanId, humanId),
      ),
    )
    .limit(1);

  return row ?? null;
}
