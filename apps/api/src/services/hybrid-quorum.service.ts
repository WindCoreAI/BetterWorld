/**
 * Hybrid Quorum Service (Sprint 13 — Phase 3 Integration)
 *
 * Assigns a mix of local (proximity-based) and global validators for
 * hyperlocal submissions. Falls back to global-only when insufficient
 * local validators are available.
 *
 * Algorithm:
 * 1. Hyperlocal (city/neighborhood scope): 2 local + 1 global validator
 * 2. Global scope: 3 global validators (no local/global distinction)
 * 3. Fallback: if <2 local available, assign 3 global validators
 */
import { peerEvaluations, validatorPool } from "@betterworld/db";
import {
  LOCAL_RADIUS_KM,
  LOCAL_QUORUM_SIZE,
  GLOBAL_QUORUM_SIZE,
} from "@betterworld/shared";
import { and, eq, ne, or, isNull, lt, sql, not, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { logger } from "../middleware/logger.js";

// ============================================================================
// Types
// ============================================================================

export interface HybridQuorumResult {
  localValidators: string[];
  globalValidators: string[];
  composition: "hybrid" | "global_only";
}

interface ValidatorCandidate {
  id: string;
  agentId: string;
  tier: string;
  homeRegionPoint: string | null;
}

// ============================================================================
// Main function
// ============================================================================

/**
 * Assign a hybrid quorum of local + global validators for a submission.
 *
 * @param db - Database connection
 * @param submissionId - The submission being evaluated
 * @param problemLocation - GPS coordinates { lat, lng } of the problem (null for global)
 * @param problemScope - Geographic scope: "global", "country", "city", "neighborhood"
 * @returns Assignment result with local/global validators and composition type
 */
export async function assignHybridQuorum(
  db: PostgresJsDatabase,
  submissionId: string,
  problemLocation: { lat: number; lng: number } | null,
  problemScope: string,
): Promise<HybridQuorumResult> {
  const isHyperlocal = problemScope === "city" || problemScope === "neighborhood";

  // Get the submission author to exclude from validators
  const existingEvals = await db
    .select({ validatorId: peerEvaluations.validatorId })
    .from(peerEvaluations)
    .where(eq(peerEvaluations.submissionId, submissionId));

  const alreadyAssignedIds = existingEvals.map((e) => e.validatorId);

  // Base conditions: active, not suspended, not already assigned
  const baseConditions = [
    eq(validatorPool.isActive, true),
    or(
      isNull(validatorPool.suspendedUntil),
      lt(validatorPool.suspendedUntil, new Date()),
    ),
  ];

  if (alreadyAssignedIds.length > 0) {
    baseConditions.push(not(inArray(validatorPool.id, alreadyAssignedIds)));
  }

  // ── Global scope: return standard 3 validators ──────────────────────
  if (!isHyperlocal || !problemLocation) {
    const globalCandidates = await db
      .select({
        id: validatorPool.id,
        agentId: validatorPool.agentId,
        tier: validatorPool.tier,
        homeRegionPoint: validatorPool.homeRegionPoint,
      })
      .from(validatorPool)
      .where(and(...baseConditions))
      .limit(20);

    const selected = shuffle(globalCandidates).slice(0, 3);

    logger.info(
      { submissionId, scope: problemScope, composition: "global_only", count: selected.length },
      "Hybrid quorum assigned (global scope)",
    );

    return {
      localValidators: [],
      globalValidators: selected.map((v) => v.id),
      composition: "global_only",
    };
  }

  // ── Hyperlocal scope: find local validators within LOCAL_RADIUS_KM ──
  const radiusMeters = LOCAL_RADIUS_KM * 1000;

  let localCandidates: ValidatorCandidate[] = [];
  try {
    localCandidates = await db
      .select({
        id: validatorPool.id,
        agentId: validatorPool.agentId,
        tier: validatorPool.tier,
        homeRegionPoint: validatorPool.homeRegionPoint,
      })
      .from(validatorPool)
      .where(
        and(
          ...baseConditions,
          sql`ST_DWithin(
            ${validatorPool.homeRegionPoint}::geography,
            ST_SetSRID(ST_MakePoint(${problemLocation.lng}, ${problemLocation.lat}), 4326)::geography,
            ${radiusMeters}
          )`,
        ),
      )
      .limit(20);
  } catch (err) {
    // PostGIS may not be available in test environments
    logger.warn(
      { error: err instanceof Error ? err.message : "Unknown", submissionId },
      "PostGIS query failed for local validators; falling back to global",
    );
  }

  // Exclude local validator IDs from global pool query
  const localIds = localCandidates.map((v) => v.id);

  // ── Fallback: if fewer than LOCAL_QUORUM_SIZE local, use 3 global ──
  if (localCandidates.length < LOCAL_QUORUM_SIZE) {
    logger.info(
      {
        submissionId,
        localAvailable: localCandidates.length,
        required: LOCAL_QUORUM_SIZE,
      },
      "Insufficient local validators; falling back to global-only quorum",
    );

    const fallbackConditions = [...baseConditions];
    const globalCandidates = await db
      .select({
        id: validatorPool.id,
        agentId: validatorPool.agentId,
        tier: validatorPool.tier,
        homeRegionPoint: validatorPool.homeRegionPoint,
      })
      .from(validatorPool)
      .where(and(...fallbackConditions))
      .limit(20);

    const selected = shuffle(globalCandidates).slice(0, 3);

    return {
      localValidators: [],
      globalValidators: selected.map((v) => v.id),
      composition: "global_only",
    };
  }

  // ── Hybrid assignment: 2 local + 1 global ──────────────────────────
  const selectedLocal = shuffle(localCandidates).slice(0, LOCAL_QUORUM_SIZE);

  // Get global validators (excluding local ones)
  const globalConditions = [...baseConditions];
  if (localIds.length > 0) {
    globalConditions.push(not(inArray(validatorPool.id, localIds)));
  }

  const globalCandidates = await db
    .select({
      id: validatorPool.id,
      agentId: validatorPool.agentId,
      tier: validatorPool.tier,
      homeRegionPoint: validatorPool.homeRegionPoint,
    })
    .from(validatorPool)
    .where(and(...globalConditions))
    .limit(20);

  const selectedGlobal = shuffle(globalCandidates).slice(0, GLOBAL_QUORUM_SIZE);

  logger.info(
    {
      submissionId,
      scope: problemScope,
      localCount: selectedLocal.length,
      globalCount: selectedGlobal.length,
      composition: "hybrid",
    },
    "Hybrid quorum assigned",
  );

  return {
    localValidators: selectedLocal.map((v) => v.id),
    globalValidators: selectedGlobal.map((v) => v.id),
    composition: "hybrid",
  };
}

// ============================================================================
// Helpers
// ============================================================================

/** Fisher-Yates shuffle */
function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  return result;
}
