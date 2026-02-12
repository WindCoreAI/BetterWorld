/* eslint-disable complexity */
/**
 * Consensus Engine Service (Sprint 11 — T009)
 *
 * Computes weighted consensus from validator evaluations.
 * Uses pg_advisory_xact_lock for idempotency.
 */
import { consensusResults, peerEvaluations, validatorPool } from "@betterworld/db";
import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";

import { updateValidatorMetrics, checkTierChange } from "./f1-tracker.js";
import { broadcast } from "../ws/feed.js";

const logger = pino({ name: "consensus-engine" });

const TIER_WEIGHTS: Record<string, number> = {
  apprentice: 1.0,
  journeyman: 1.5,
  expert: 2.0,
};

const QUORUM_SIZE = parseInt(process.env.PEER_CONSENSUS_QUORUM_SIZE || "3", 10);
const APPROVE_THRESHOLD = parseFloat(process.env.PEER_CONSENSUS_APPROVE_THRESHOLD || "0.67");
const REJECT_THRESHOLD = parseFloat(process.env.PEER_CONSENSUS_REJECT_THRESHOLD || "0.67");

export interface ConsensusComputationResult {
  decision: "approved" | "rejected" | "escalated" | "expired";
  confidence: number;
  quorumSize: number;
  responsesReceived: number;
  weightedApprove: number;
  weightedReject: number;
  weightedEscalate: number;
  agreesWithLayerB: boolean | null;
  consensusLatencyMs: number | null;
  escalationReason: string | null;
}

/**
 * Compute consensus for a submission.
 *
 * Algorithm:
 * 1. Acquire advisory lock on submission ID
 * 2. Count completed evaluations
 * 3. If < quorum, return null
 * 4. Safety flag check → immediate escalation
 * 5. Weighted voting: weight = tier_weight × confidence
 * 6. Determine decision based on thresholds
 * 7. Insert consensus_results (idempotent via ON CONFLICT DO NOTHING)
 * 8. Cancel remaining pending evaluations
 */
export async function computeConsensus(
  db: PostgresJsDatabase,
  submissionId: string,
  submissionType: string,
  layerBDecision?: string,
  layerBAlignmentScore?: number,
): Promise<ConsensusComputationResult | null> {
  // Use a transaction for the entire consensus computation
  return await db.transaction(async (tx) => {
    // 1. Acquire pg_advisory_xact_lock using hash of submissionId
    const lockHash = hashString(submissionId);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockHash})`);

    // Check if consensus already exists (idempotency)
    const [existing] = await tx
      .select({ id: consensusResults.id })
      .from(consensusResults)
      .where(
        and(
          eq(consensusResults.submissionId, submissionId),
          eq(consensusResults.submissionType, submissionType as "problem" | "solution" | "debate" | "mission"),
        ),
      )
      .limit(1);

    if (existing) {
      logger.info({ submissionId, submissionType }, "Consensus already computed, skipping");
      return null;
    }

    // 2. Count completed peer_evaluations for this submission
    const completedEvals = await tx
      .select({
        id: peerEvaluations.id,
        recommendation: peerEvaluations.recommendation,
        confidence: peerEvaluations.confidence,
        safetyFlagged: peerEvaluations.safetyFlagged,
        validatorId: peerEvaluations.validatorId,
        assignedAt: peerEvaluations.assignedAt,
      })
      .from(peerEvaluations)
      .where(
        and(
          eq(peerEvaluations.submissionId, submissionId),
          eq(peerEvaluations.submissionType, submissionType as "problem" | "solution" | "debate" | "mission"),
          eq(peerEvaluations.status, "completed"),
        ),
      );

    // 3. If < quorum, return null
    if (completedEvals.length < QUORUM_SIZE) {
      return null;
    }

    // 4. Check for safety flags → immediate escalation
    const hasSafetyFlag = completedEvals.some((e) => e.safetyFlagged);
    if (hasSafetyFlag) {
      const result = await insertConsensusResult(tx, {
        submissionId,
        submissionType,
        decision: "escalated",
        confidence: 1.0,
        quorumSize: completedEvals.length,
        responsesReceived: completedEvals.length,
        weightedApprove: 0,
        weightedReject: 0,
        weightedEscalate: 0,
        layerBDecision: layerBDecision || null,
        layerBAlignmentScore: layerBAlignmentScore ?? null,
        escalationReason: "safety_flag",
        firstAssignedAt: completedEvals[0]!.assignedAt,
      });

      // Cancel remaining pending evaluations
      await cancelPendingEvaluations(tx, submissionId, submissionType);

      // Broadcast consensus_reached event
      broadcastConsensusReached(submissionId, submissionType, "escalated", completedEvals.length, result.consensusLatencyMs);

      return result;
    }

    // 5. Compute weighted votes
    let weightedApprove = 0;
    let weightedReject = 0;
    let weightedEscalate = 0;

    for (const evaluation of completedEvals) {
      // Look up the validator's tier
      const [validator] = await tx
        .select({ tier: validatorPool.tier })
        .from(validatorPool)
        .where(eq(validatorPool.id, evaluation.validatorId))
        .limit(1);

      const tierWeight = TIER_WEIGHTS[validator?.tier ?? "apprentice"] ?? 1.0;
      const confidence = Number(evaluation.confidence ?? 0.5);
      const weight = tierWeight * confidence;

      switch (evaluation.recommendation) {
        case "approved":
          weightedApprove += weight;
          break;
        case "rejected":
          weightedReject += weight;
          break;
        case "flagged":
          weightedEscalate += weight;
          break;
      }
    }

    // 6. Determine consensus decision
    const totalWeight = weightedApprove + weightedReject + weightedEscalate;
    let decision: "approved" | "rejected" | "escalated";

    if (totalWeight === 0) {
      decision = "escalated";
    } else if (weightedApprove / totalWeight >= APPROVE_THRESHOLD) {
      decision = "approved";
    } else if (weightedReject / totalWeight >= REJECT_THRESHOLD) {
      decision = "rejected";
    } else {
      decision = "escalated";
    }

    // Determine agreement with Layer B
    let agreesWithLayerB: boolean | null = null;
    if (layerBDecision) {
      if (decision === "escalated") {
        agreesWithLayerB = layerBDecision === "flagged";
      } else {
        agreesWithLayerB = decision === layerBDecision;
      }
    }

    // 7. Insert consensus result
    const result = await insertConsensusResult(tx, {
      submissionId,
      submissionType,
      decision,
      confidence: totalWeight > 0 ? Math.max(weightedApprove, weightedReject, weightedEscalate) / totalWeight : 0,
      quorumSize: completedEvals.length,
      responsesReceived: completedEvals.length,
      weightedApprove,
      weightedReject,
      weightedEscalate,
      layerBDecision: layerBDecision || null,
      layerBAlignmentScore: layerBAlignmentScore ?? null,
      escalationReason: null,
      firstAssignedAt: completedEvals[0]!.assignedAt,
    });

    // 8. Cancel remaining pending evaluations
    await cancelPendingEvaluations(tx, submissionId, submissionType);

    // Broadcast consensus_reached event
    broadcastConsensusReached(submissionId, submissionType, decision, completedEvals.length, result.consensusLatencyMs);

    // T024: Update F1 metrics for each participating validator
    if (layerBDecision) {
      for (const evaluation of completedEvals) {
        if (evaluation.recommendation) {
          try {
            await updateValidatorMetrics(
              tx,
              evaluation.validatorId,
              evaluation.recommendation,
              layerBDecision,
            );
            await checkTierChange(tx, evaluation.validatorId);
          } catch (err) {
            logger.warn(
              { validatorId: evaluation.validatorId, error: (err as Error).message },
              "Failed to update validator F1 metrics (non-blocking)",
            );
          }
        }
      }
    }

    logger.info(
      {
        submissionId,
        submissionType,
        decision,
        agreesWithLayerB,
        responsesReceived: completedEvals.length,
        weightedApprove: weightedApprove.toFixed(4),
        weightedReject: weightedReject.toFixed(4),
        weightedEscalate: weightedEscalate.toFixed(4),
      },
      "Consensus computed",
    );

    return result;
  });
}

async function insertConsensusResult(
  tx: PostgresJsDatabase,
  data: {
    submissionId: string;
    submissionType: string;
    decision: string;
    confidence: number;
    quorumSize: number;
    responsesReceived: number;
    weightedApprove: number;
    weightedReject: number;
    weightedEscalate: number;
    layerBDecision: string | null;
    layerBAlignmentScore: number | null;
    escalationReason: string | null;
    firstAssignedAt: Date;
  },
): Promise<ConsensusComputationResult> {
  const consensusLatencyMs = Date.now() - data.firstAssignedAt.getTime();

  // Determine agreement with Layer B
  let agreesWithLayerB: boolean | null = null;
  if (data.layerBDecision) {
    if (data.decision === "escalated") {
      agreesWithLayerB = data.layerBDecision === "flagged";
    } else {
      agreesWithLayerB = data.decision === data.layerBDecision;
    }
  }

  const wasEarlyConsensus = data.responsesReceived < data.quorumSize;

  await tx
    .insert(consensusResults)
    .values({
      submissionId: data.submissionId,
      submissionType: data.submissionType as "problem" | "solution" | "debate" | "mission",
      decision: data.decision as "approved" | "rejected" | "escalated" | "expired",
      confidence: String(data.confidence.toFixed(2)),
      quorumSize: data.quorumSize,
      responsesReceived: data.responsesReceived,
      weightedApprove: String(data.weightedApprove.toFixed(4)),
      weightedReject: String(data.weightedReject.toFixed(4)),
      weightedEscalate: String(data.weightedEscalate.toFixed(4)),
      layerBDecision: data.layerBDecision as "approved" | "flagged" | "rejected" | null,
      layerBAlignmentScore: data.layerBAlignmentScore != null ? String(data.layerBAlignmentScore) : null,
      agreesWithLayerB,
      consensusLatencyMs,
      wasEarlyConsensus,
      escalationReason: data.escalationReason,
    })
    .onConflictDoNothing();

  return {
    decision: data.decision as "approved" | "rejected" | "escalated" | "expired",
    confidence: data.confidence,
    quorumSize: data.quorumSize,
    responsesReceived: data.responsesReceived,
    weightedApprove: data.weightedApprove,
    weightedReject: data.weightedReject,
    weightedEscalate: data.weightedEscalate,
    agreesWithLayerB,
    consensusLatencyMs,
    escalationReason: data.escalationReason,
  };
}

async function cancelPendingEvaluations(
  tx: PostgresJsDatabase,
  submissionId: string,
  submissionType: string,
): Promise<void> {
  await tx
    .update(peerEvaluations)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(peerEvaluations.submissionId, submissionId),
        eq(peerEvaluations.submissionType, submissionType as "problem" | "solution" | "debate" | "mission"),
        eq(peerEvaluations.status, "pending"),
      ),
    );
}

function broadcastConsensusReached(
  submissionId: string,
  submissionType: string,
  decision: string,
  responsesReceived: number,
  consensusLatencyMs: number | null,
): void {
  broadcast({
    type: "consensus_reached",
    data: {
      submissionId,
      submissionType,
      decision,
      responsesReceived,
      consensusLatencyMs,
    },
  });
}

/**
 * Simple string hash to int for pg_advisory_xact_lock.
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}
