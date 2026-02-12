/* eslint-disable complexity */
/**
 * F1 Score Tracker Service (Sprint 11 — T022, T023)
 *
 * Updates validator rolling F1/precision/recall metrics.
 * Manages tier promotion/demotion based on accuracy thresholds.
 */
import {
  validatorPool,
  validatorTierChanges,
} from "@betterworld/db";
import { eq, sql, desc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";

import { sendToAgent } from "../ws/feed.js";

const logger = pino({ name: "f1-tracker" });

const F1_ROLLING_WINDOW = 100;

const TIER_THRESHOLDS = {
  apprenticeToJourneyman: { f1: 0.85, minEvaluations: 50 },
  journeymanToExpert: { f1: 0.92, minEvaluations: 200 },
  expertDemotion: { f1: 0.92, minEvalsSinceChange: 30 },
  journeymanDemotion: { f1: 0.85, minEvalsSinceChange: 30 },
};

/**
 * Update a validator's F1 score, precision, and recall after an evaluation.
 *
 * Uses Layer B decision as ground truth proxy.
 * Binary classification: 'approved' vs 'rejected'/'flagged'.
 */
export async function updateValidatorMetrics(
  db: PostgresJsDatabase,
  validatorId: string,
  recommendation: string,
  layerBDecision: string,
): Promise<void> {
  // Query last 100 completed evaluations for this validator
  // that have corresponding consensus_results
  const recentEvals = await db.execute(sql`
    SELECT
      pe.recommendation,
      cr.layer_b_decision
    FROM peer_evaluations pe
    INNER JOIN consensus_results cr
      ON pe.submission_id = cr.submission_id
      AND pe.submission_type = cr.submission_type
    WHERE pe.validator_id = ${validatorId}
      AND pe.status = 'completed'
      AND cr.layer_b_decision IS NOT NULL
    ORDER BY pe.responded_at DESC
    LIMIT ${F1_ROLLING_WINDOW}
  `);

  const evaluations = recentEvals as unknown as Array<{ recommendation: string; layer_b_decision: string }>;

  if (evaluations.length === 0) {
    return;
  }

  // Compute TP, FP, FN
  // Binary: 'approved' = positive, 'rejected'/'flagged' = negative
  let tp = 0;
  let fp = 0;
  let fn = 0;

  for (const e of evaluations) {
    const validatorPositive = e.recommendation === "approved";
    const layerBPositive = e.layer_b_decision === "approved";

    if (validatorPositive && layerBPositive) {
      tp++;
    } else if (validatorPositive && !layerBPositive) {
      fp++;
    } else if (!validatorPositive && layerBPositive) {
      fn++;
    }
    // TN case: both negative — not needed for F1/precision/recall
  }

  // Compute precision, recall, F1
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  // Update validator_pool
  await db
    .update(validatorPool)
    .set({
      f1Score: String(f1.toFixed(4)),
      precision: String(precision.toFixed(4)),
      recall: String(recall.toFixed(4)),
      totalEvaluations: sql`${validatorPool.totalEvaluations} + 1`,
      correctEvaluations: sql`${validatorPool.correctEvaluations} + ${recommendation === layerBDecision ? 1 : 0}`,
      updatedAt: new Date(),
    })
    .where(eq(validatorPool.id, validatorId));

  logger.info(
    { validatorId, f1: f1.toFixed(4), precision: precision.toFixed(4), recall: recall.toFixed(4), totalInWindow: evaluations.length },
    "Validator metrics updated",
  );
}

/**
 * Check if a validator should be promoted or demoted based on their F1 score.
 */
export async function checkTierChange(
  db: PostgresJsDatabase,
  validatorId: string,
): Promise<void> {
  // Read current tier and metrics
  const [validator] = await db
    .select({
      id: validatorPool.id,
      agentId: validatorPool.agentId,
      tier: validatorPool.tier,
      f1Score: validatorPool.f1Score,
      totalEvaluations: validatorPool.totalEvaluations,
    })
    .from(validatorPool)
    .where(eq(validatorPool.id, validatorId))
    .limit(1);

  if (!validator) return;

  const f1 = Number(validator.f1Score);
  const totalEvals = validator.totalEvaluations;
  const currentTier = validator.tier;

  // Check evaluations since last tier change
  const [lastChange] = await db
    .select({ totalEvaluationsAtChange: validatorTierChanges.totalEvaluationsAtChange })
    .from(validatorTierChanges)
    .where(eq(validatorTierChanges.validatorId, validatorId))
    .orderBy(desc(validatorTierChanges.changedAt))
    .limit(1);

  const evalsSinceLastChange = lastChange
    ? totalEvals - lastChange.totalEvaluationsAtChange
    : totalEvals;

  let newTier: string | null = null;

  // Promotion checks
  if (currentTier === "apprentice" && f1 >= TIER_THRESHOLDS.apprenticeToJourneyman.f1 && totalEvals >= TIER_THRESHOLDS.apprenticeToJourneyman.minEvaluations) {
    newTier = "journeyman";
  } else if (currentTier === "journeyman" && f1 >= TIER_THRESHOLDS.journeymanToExpert.f1 && totalEvals >= TIER_THRESHOLDS.journeymanToExpert.minEvaluations) {
    newTier = "expert";
  }

  // Demotion checks (only if 30+ evals since last change to prevent oscillation)
  if (!newTier && evalsSinceLastChange >= TIER_THRESHOLDS.expertDemotion.minEvalsSinceChange) {
    if (currentTier === "expert" && f1 < TIER_THRESHOLDS.expertDemotion.f1) {
      newTier = "journeyman";
    } else if (currentTier === "journeyman" && f1 < TIER_THRESHOLDS.journeymanDemotion.f1) {
      newTier = "apprentice";
    }
  }

  if (!newTier || newTier === currentTier) return;

  // Update tier
  await db
    .update(validatorPool)
    .set({
      tier: newTier as "apprentice" | "journeyman" | "expert",
      updatedAt: new Date(),
    })
    .where(eq(validatorPool.id, validatorId));

  // Insert tier change record
  await db
    .insert(validatorTierChanges)
    .values({
      validatorId,
      fromTier: currentTier,
      toTier: newTier as "apprentice" | "journeyman" | "expert",
      f1ScoreAtChange: String(f1.toFixed(4)),
      totalEvaluationsAtChange: totalEvals,
    });

  // Send WebSocket notification
  const isPromotion = (
    (currentTier === "apprentice" && newTier === "journeyman") ||
    (currentTier === "journeyman" && newTier === "expert")
  );

  sendToAgent(validator.agentId, {
    type: "tier_change",
    data: {
      previousTier: currentTier,
      newTier,
      f1Score: f1,
      totalEvaluations: totalEvals,
      message: isPromotion
        ? `Congratulations! You've been promoted to ${newTier} validator.`
        : `Your tier has been adjusted to ${newTier} based on recent evaluation accuracy.`,
    },
  });

  logger.info(
    { validatorId, fromTier: currentTier, toTier: newTier, f1: f1.toFixed(4), totalEvals },
    `Validator tier ${isPromotion ? "promoted" : "demoted"}`,
  );
}
