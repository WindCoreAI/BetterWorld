/**
 * Domain Specialization Service (Sprint 13 — Phase 3 Integration)
 *
 * Tracks validator accuracy per domain and manages specialist designation.
 * Specialists receive a weight multiplier in consensus calculations.
 *
 * Domain scores are stored in validatorPool.domainScores JSONB column.
 * Each domain entry: { evaluations, correct, f1, specialist, designatedAt }
 */
import { validatorPool } from "@betterworld/db";
import {
  SPECIALIST_F1_THRESHOLD,
  SPECIALIST_MIN_EVALUATIONS,
  SPECIALIST_REVOCATION_F1,
  SPECIALIST_GRACE_EVALUATIONS,
} from "@betterworld/shared";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { logger } from "../middleware/logger.js";

// ============================================================================
// Types
// ============================================================================

export interface DomainScore {
  evaluations: number;
  correct: number;
  f1: number;
  specialist: boolean;
  designatedAt: string | null;
}

export type DomainScores = Record<string, DomainScore>;

interface SpecialistCheckResult {
  specialist: boolean;
  promoted: boolean;
  revoked: boolean;
}

export interface ValidatorSpecialization {
  domain: string;
  evaluations: number;
  correct: number;
  f1: number;
  designatedAt: string | null;
}

// ============================================================================
// updateDomainScore
// ============================================================================

/**
 * Update a validator's accuracy score for a given domain.
 *
 * Recalculates the F1 metric (accuracy: correct/evaluations) and
 * checks for specialist promotion or revocation.
 */
export async function updateDomainScore(
  db: PostgresJsDatabase,
  validatorId: string,
  domain: string,
  isCorrect: boolean,
): Promise<{ domainScore: DomainScore; specialistStatus: SpecialistCheckResult }> {
  // 1. Read current domainScores JSONB
  const [validator] = await db
    .select({
      id: validatorPool.id,
      domainScores: validatorPool.domainScores,
    })
    .from(validatorPool)
    .where(eq(validatorPool.id, validatorId))
    .limit(1);

  if (!validator) {
    throw new Error(`Validator ${validatorId} not found`);
  }

  const domainScores = (validator.domainScores as DomainScores) ?? {};

  // 2. Get or create domain entry
  const existing = domainScores[domain];
  const entry: DomainScore = existing
    ? { ...existing }
    : {
        evaluations: 0,
        correct: 0,
        f1: 0,
        specialist: false,
        designatedAt: null,
      };

  // 3. Increment counters
  entry.evaluations += 1;
  if (isCorrect) {
    entry.correct += 1;
  }

  // 4. Recalculate F1 (accuracy metric: correct / evaluations)
  entry.f1 = entry.evaluations > 0 ? entry.correct / entry.evaluations : 0;

  // 5. Check specialist designation
  const specialistStatus = checkSpecialistDesignation(entry, domain);
  entry.specialist = specialistStatus.specialist;
  if (specialistStatus.promoted) {
    entry.designatedAt = new Date().toISOString();
  }
  if (specialistStatus.revoked) {
    entry.designatedAt = null;
  }

  // 6. Write back to JSONB
  const updatedScores = { ...domainScores, [domain]: entry };

  await db
    .update(validatorPool)
    .set({
      domainScores: updatedScores,
      updatedAt: new Date(),
    })
    .where(eq(validatorPool.id, validatorId));

  logger.info(
    {
      validatorId,
      domain,
      isCorrect,
      f1: entry.f1,
      specialist: entry.specialist,
      evaluations: entry.evaluations,
    },
    "Domain score updated",
  );

  return { domainScore: entry, specialistStatus };
}

// ============================================================================
// checkSpecialistDesignation
// ============================================================================

/**
 * Check whether a validator should be promoted to or revoked from specialist
 * status in a given domain.
 *
 * Promotion: evaluations >= SPECIALIST_MIN_EVALUATIONS AND f1 >= SPECIALIST_F1_THRESHOLD
 * Revocation: f1 < SPECIALIST_REVOCATION_F1 AND evaluations since designation > SPECIALIST_GRACE_EVALUATIONS
 */
function checkSpecialistDesignation(
  domainScore: DomainScore,
  domain: string,
): SpecialistCheckResult {
  const result: SpecialistCheckResult = {
    specialist: domainScore.specialist,
    promoted: false,
    revoked: false,
  };

  if (!domainScore.specialist) {
    // Check for promotion
    if (
      domainScore.evaluations >= SPECIALIST_MIN_EVALUATIONS &&
      domainScore.f1 >= SPECIALIST_F1_THRESHOLD
    ) {
      result.specialist = true;
      result.promoted = true;
      logger.info(
        {
          domain,
          f1: domainScore.f1,
          evaluations: domainScore.evaluations,
        },
        "Validator promoted to domain specialist",
      );
    }
  } else {
    // Check for revocation
    if (domainScore.f1 < SPECIALIST_REVOCATION_F1) {
      // Calculate evaluations since designation
      // Since we only have a total count, we approximate using the designatedAt timestamp.
      // For simplicity, use SPECIALIST_GRACE_EVALUATIONS as an absolute threshold:
      // if total evaluations exceeds the minimum + grace, revoke.
      const evalsSinceDesignation = domainScore.evaluations - SPECIALIST_MIN_EVALUATIONS;
      if (evalsSinceDesignation > SPECIALIST_GRACE_EVALUATIONS) {
        result.specialist = false;
        result.revoked = true;
        logger.info(
          {
            domain,
            f1: domainScore.f1,
            evalsSinceDesignation,
          },
          "Validator specialist status revoked",
        );
      }
    }
  }

  return result;
}

// ============================================================================
// getValidatorSpecializations
// ============================================================================

/**
 * Get all domains where a validator holds specialist status.
 */
export async function getValidatorSpecializations(
  db: PostgresJsDatabase,
  validatorId: string,
): Promise<ValidatorSpecialization[]> {
  const [validator] = await db
    .select({
      domainScores: validatorPool.domainScores,
    })
    .from(validatorPool)
    .where(eq(validatorPool.id, validatorId))
    .limit(1);

  if (!validator) {
    throw new Error(`Validator ${validatorId} not found`);
  }

  const domainScores = (validator.domainScores as DomainScores) ?? {};

  return Object.entries(domainScores)
    .filter(([, score]) => score.specialist === true)
    .map(([domain, score]) => ({
      domain,
      evaluations: score.evaluations,
      correct: score.correct,
      f1: score.f1,
      designatedAt: score.designatedAt,
    }));
}
