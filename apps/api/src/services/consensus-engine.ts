/* eslint-disable complexity */
/**
 * Consensus Engine Service (Sprint 11 — T009)
 *
 * Computes weighted consensus from validator evaluations.
 * Uses pg_advisory_xact_lock for idempotency.
 */
import {
  consensusResults,
  flaggedContent,
  guardrailEvaluations,
  peerEvaluations,
  problems,
  solutions,
  debates,
  missions,
  validatorPool,
} from "@betterworld/db";
import { and, eq, inArray, sql } from "drizzle-orm";
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
  id: string | null;
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

    // 5. Batch-fetch validator tiers (eliminates N+1)
    const validatorIds = [...new Set(completedEvals.map((e) => e.validatorId))];
    const validators = await tx
      .select({ id: validatorPool.id, tier: validatorPool.tier })
      .from(validatorPool)
      .where(inArray(validatorPool.id, validatorIds));
    const tierMap = new Map(validators.map((v) => [v.id, v.tier]));

    // Compute weighted votes
    let weightedApprove = 0;
    let weightedReject = 0;
    let weightedEscalate = 0;

    for (const evaluation of completedEvals) {
      const tierWeight = TIER_WEIGHTS[tierMap.get(evaluation.validatorId) ?? "apprentice"] ?? 1.0;
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

    // Sprint 12: Production routing — apply consensus decision to guardrail evaluation
    // When routing_decision is 'peer_consensus', the consensus result IS the production decision
    try {
      await applyProductionConsensus(tx, submissionId, submissionType, decision, layerBDecision || null);
    } catch (err) {
      logger.warn(
        { submissionId, error: (err as Error).message },
        "Failed to apply production consensus (non-blocking — may be shadow mode)",
      );
    }

    // Sprint 12: Distribute validation rewards to participating validators
    try {
      const { distributeRewards } = await import("./validation-reward.service.js");
      const { getRedis } = await import("../lib/container.js");
      const redis = getRedis();
      await distributeRewards(tx as PostgresJsDatabase, redis, result.id ?? submissionId, submissionId, submissionType);
    } catch (err) {
      logger.warn(
        { submissionId, error: (err as Error).message },
        "Failed to distribute validation rewards (non-blocking)",
      );
    }

    // Sprint 12: Spot check — enqueue Layer B verification for 5% of peer-validated submissions
    try {
      const { shouldSpotCheck, getSpotCheckQueue } = await import("./spot-check.service.js");
      if (shouldSpotCheck(submissionId)) {
        const { getRedis: getR } = await import("../lib/container.js");
        const r = getR();
        if (r) {
          const spotCheckQueue = getSpotCheckQueue(r);
          await spotCheckQueue.add("spot-check", {
            submissionId,
            submissionType,
            content: "",
            domain: "",
            peerDecision: decision,
            peerConfidence: result.confidence,
          });
          logger.info({ submissionId }, "Spot check enqueued");
        }
      }
    } catch (err) {
      logger.warn(
        { submissionId, error: (err as Error).message },
        "Failed to enqueue spot check (non-blocking)",
      );
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

/**
 * Sprint 12: Apply peer consensus decision to guardrail evaluation and content status.
 *
 * Only applies when the guardrail evaluation's routing_decision is 'peer_consensus'.
 * On consensus failure (escalated/expired), falls back to the stored Layer B result.
 */
async function applyProductionConsensus(
  tx: PostgresJsDatabase,
  submissionId: string,
  submissionType: string,
  consensusDecision: "approved" | "rejected" | "escalated" | "expired",
  layerBDecision: string | null,
): Promise<void> {
  // Find the guardrail evaluation for this submission that was routed to peer consensus
  const [evaluation] = await tx
    .select({
      id: guardrailEvaluations.id,
      routingDecision: guardrailEvaluations.routingDecision,
      agentId: guardrailEvaluations.agentId,
      contentType: guardrailEvaluations.contentType,
    })
    .from(guardrailEvaluations)
    .where(
      and(
        eq(guardrailEvaluations.contentId, submissionId),
        eq(guardrailEvaluations.routingDecision, "peer_consensus"),
      ),
    )
    .limit(1);

  if (!evaluation) {
    // Not a production-routed submission (shadow mode) — nothing to do
    return;
  }

  // Determine final decision: use consensus result, or fall back to Layer B on failure
  let finalDecision: "approved" | "rejected" | "flagged";

  if (consensusDecision === "approved" || consensusDecision === "rejected") {
    finalDecision = consensusDecision;
  } else {
    // Consensus failure (escalated/expired) — fall back to Layer B
    if (layerBDecision === "approved" || layerBDecision === "rejected" || layerBDecision === "flagged") {
      finalDecision = layerBDecision;
    } else {
      finalDecision = "flagged"; // Ultimate fallback
    }

    logger.info(
      { submissionId, consensusDecision, layerBFallback: finalDecision },
      "Consensus failure — falling back to Layer B decision",
    );
  }

  // Update guardrail evaluation with final decision
  await tx
    .update(guardrailEvaluations)
    .set({
      finalDecision,
      completedAt: new Date(),
    })
    .where(eq(guardrailEvaluations.id, evaluation.id));

  // Update content status
  const contentType = evaluation.contentType;
  switch (contentType) {
    case "problem":
      await tx.update(problems).set({ guardrailStatus: finalDecision }).where(eq(problems.id, submissionId));
      break;
    case "solution":
      await tx.update(solutions).set({ guardrailStatus: finalDecision }).where(eq(solutions.id, submissionId));
      break;
    case "debate":
      await tx.update(debates).set({ guardrailStatus: finalDecision }).where(eq(debates.id, submissionId));
      break;
    case "mission":
      await tx.update(missions).set({ guardrailStatus: finalDecision }).where(eq(missions.id, submissionId));
      break;
  }

  // If flagged, create flagged_content entry for admin review
  if (finalDecision === "flagged") {
    await tx.insert(flaggedContent).values({
      evaluationId: evaluation.id,
      contentId: submissionId,
      contentType,
      agentId: evaluation.agentId,
      status: "pending_review",
    });
  }

  logger.info(
    { submissionId, evaluationId: evaluation.id, consensusDecision, finalDecision },
    "Production consensus applied to guardrail evaluation",
  );
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

  const [inserted] = await tx
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
    .onConflictDoNothing()
    .returning({ id: consensusResults.id });

  return {
    id: inserted?.id ?? null,
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
