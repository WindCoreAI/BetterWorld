/**
 * Dispute Resolution Service (Sprint 13)
 *
 * Handles filing, resolving, and suspension logic for consensus disputes.
 * Agents stake credits to challenge consensus decisions; admins resolve disputes.
 * Upheld disputes refund the stake + bonus; dismissed disputes forfeit stake and
 * may trigger suspension after repeated failures.
 */
import {
  disputes,
  consensusResults,
  validatorPool,
  peerEvaluations,
} from "@betterworld/db";
import {
  DISPUTE_STAKE_AMOUNT,
  DISPUTE_BONUS,
  DISPUTE_SUSPENSION_DAYS,
  DISPUTE_FAILURE_THRESHOLD,
  DISPUTE_FAILURE_WINDOW_DAYS,
} from "@betterworld/shared/constants/phase3";
import { AppError } from "@betterworld/shared";
import { eq, sql, and, desc, gte, count } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { AgentCreditService } from "./agent-credit.service.js";
import { logger } from "../middleware/logger.js";

// ============================================================================
// fileDispute — Stake credits and create a dispute against a consensus result
// ============================================================================

export async function fileDispute(
  db: PostgresJsDatabase,
  agentId: string,
  consensusId: string,
  reasoning: string,
): Promise<{
  id: string;
  consensusId: string;
  challengerAgentId: string;
  stakeAmount: number;
  reasoning: string;
  status: string;
  createdAt: Date;
}> {
  // 1. Check consensus exists and has a terminal status (approved/rejected)
  const [consensus] = await db
    .select({
      id: consensusResults.id,
      decision: consensusResults.decision,
      submissionId: consensusResults.submissionId,
    })
    .from(consensusResults)
    .where(eq(consensusResults.id, consensusId))
    .limit(1);

  if (!consensus) {
    throw new AppError("NOT_FOUND", "Consensus result not found");
  }

  if (consensus.decision !== "approved" && consensus.decision !== "rejected") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Can only dispute consensus results with terminal status (approved/rejected)",
    );
  }

  // 2. Check challenger is NOT one of the consensus participants
  //    (query peerEvaluations for this consensus's submissionId, join validatorPool to get agentId)
  const participants = await db
    .select({ agentId: peerEvaluations.validatorAgentId })
    .from(peerEvaluations)
    .where(eq(peerEvaluations.submissionId, consensus.submissionId));

  const participantIds = new Set(participants.map((p) => p.agentId));
  if (participantIds.has(agentId)) {
    throw new AppError(
      "FORBIDDEN",
      "Cannot dispute a consensus you participated in",
    );
  }

  // 3. Check no existing open dispute for same consensusId by same agent
  const [existingDispute] = await db
    .select({ id: disputes.id })
    .from(disputes)
    .where(
      and(
        eq(disputes.consensusId, consensusId),
        eq(disputes.challengerAgentId, agentId),
        eq(disputes.status, "open"),
      ),
    )
    .limit(1);

  if (existingDispute) {
    throw new AppError(
      "CONFLICT",
      "You already have an open dispute for this consensus result",
    );
  }

  // 4. Check validator not suspended
  const [validator] = await db
    .select({
      id: validatorPool.id,
      disputeSuspendedUntil: validatorPool.disputeSuspendedUntil,
    })
    .from(validatorPool)
    .where(eq(validatorPool.agentId, agentId))
    .limit(1);

  if (
    validator?.disputeSuspendedUntil &&
    validator.disputeSuspendedUntil > new Date()
  ) {
    throw new AppError(
      "FORBIDDEN",
      `Dispute filing suspended until ${validator.disputeSuspendedUntil.toISOString()}`,
    );
  }

  // 5. Spend DISPUTE_STAKE_AMOUNT credits
  const creditService = new AgentCreditService(db);
  const spendResult = await creditService.spendCredits(
    agentId,
    DISPUTE_STAKE_AMOUNT,
    "spend_dispute_stake",
    consensusId,
    `dispute:${consensusId}:${agentId}`,
    `Dispute stake: -${DISPUTE_STAKE_AMOUNT} credits for consensus ${consensusId}`,
  );

  // 6. If spend returns null, insufficient credits
  if (spendResult === null) {
    throw new AppError(
      "FORBIDDEN",
      "Insufficient credits to file dispute",
    );
  }

  // 7. Insert dispute row
  const [dispute] = await db
    .insert(disputes)
    .values({
      consensusId,
      challengerAgentId: agentId,
      stakeAmount: DISPUTE_STAKE_AMOUNT,
      stakeCreditTransactionId: spendResult.transactionId,
      reasoning,
      status: "open",
    })
    .returning({
      id: disputes.id,
      consensusId: disputes.consensusId,
      challengerAgentId: disputes.challengerAgentId,
      stakeAmount: disputes.stakeAmount,
      reasoning: disputes.reasoning,
      status: disputes.status,
      createdAt: disputes.createdAt,
    });

  logger.info(
    {
      disputeId: dispute!.id,
      agentId,
      consensusId,
      stakeAmount: DISPUTE_STAKE_AMOUNT,
    },
    "Dispute filed",
  );

  return dispute!;
}

// ============================================================================
// resolveDispute — Admin resolves a dispute (upheld or dismissed)
// ============================================================================

export async function resolveDispute(
  db: PostgresJsDatabase,
  disputeId: string,
  verdict: "upheld" | "dismissed",
  adminNotes: string,
  adminId: string,
): Promise<{
  id: string;
  status: string;
  adminDecision: string | null;
  adminNotes: string | null;
  stakeReturned: boolean;
  bonusPaid: boolean;
  resolvedAt: Date | null;
}> {
  // 1. Fetch dispute, verify status is "open" or "admin_review"
  const [dispute] = await db
    .select({
      id: disputes.id,
      challengerAgentId: disputes.challengerAgentId,
      stakeAmount: disputes.stakeAmount,
      status: disputes.status,
    })
    .from(disputes)
    .where(eq(disputes.id, disputeId))
    .limit(1);

  if (!dispute) {
    throw new AppError("NOT_FOUND", "Dispute not found");
  }

  if (dispute.status !== "open" && dispute.status !== "admin_review") {
    throw new AppError(
      "CONFLICT",
      `Dispute is already resolved with status: ${dispute.status}`,
    );
  }

  const creditService = new AgentCreditService(db);
  let stakeReturned = false;
  let bonusPaid = false;

  if (verdict === "upheld") {
    // 2a. Refund stake
    await creditService.earnCredits(
      dispute.challengerAgentId,
      dispute.stakeAmount,
      "earn_dispute_refund",
      disputeId,
      `dispute_refund:${disputeId}`,
      `Dispute upheld — stake refund: +${dispute.stakeAmount} credits`,
    );
    stakeReturned = true;

    // 2b. Pay bonus
    await creditService.earnCredits(
      dispute.challengerAgentId,
      DISPUTE_BONUS,
      "earn_dispute_bonus",
      disputeId,
      `dispute_bonus:${disputeId}`,
      `Dispute upheld — bonus: +${DISPUTE_BONUS} credits`,
    );
    bonusPaid = true;
  } else {
    // 3. Dismissed — stake forfeited. Check suspension threshold.
    await checkDisputeSuspension(db, dispute.challengerAgentId);
  }

  // 4. Update dispute record
  const [updated] = await db
    .update(disputes)
    .set({
      status: verdict,
      adminReviewerId: adminId,
      adminDecision: verdict,
      adminNotes,
      resolvedAt: new Date(),
      stakeReturned,
      bonusPaid,
    })
    .where(eq(disputes.id, disputeId))
    .returning({
      id: disputes.id,
      status: disputes.status,
      adminDecision: disputes.adminDecision,
      adminNotes: disputes.adminNotes,
      stakeReturned: disputes.stakeReturned,
      bonusPaid: disputes.bonusPaid,
      resolvedAt: disputes.resolvedAt,
    });

  logger.info(
    {
      disputeId,
      verdict,
      adminId,
      stakeReturned,
      bonusPaid,
      challengerAgentId: dispute.challengerAgentId,
    },
    "Dispute resolved",
  );

  return updated!;
}

// ============================================================================
// checkDisputeSuspension — Check and apply suspension if threshold reached
// ============================================================================

export async function checkDisputeSuspension(
  db: PostgresJsDatabase,
  agentId: string,
): Promise<{
  suspended: boolean;
  suspendedUntil: Date | null;
  dismissedCount: number;
}> {
  // 1. Query validator_pool for the agent
  const [validator] = await db
    .select({
      id: validatorPool.id,
      disputeSuspendedUntil: validatorPool.disputeSuspendedUntil,
    })
    .from(validatorPool)
    .where(eq(validatorPool.agentId, agentId))
    .limit(1);

  // 2. Check if already suspended
  if (
    validator?.disputeSuspendedUntil &&
    validator.disputeSuspendedUntil > new Date()
  ) {
    return {
      suspended: true,
      suspendedUntil: validator.disputeSuspendedUntil,
      dismissedCount: -1, // Already suspended, count not relevant
    };
  }

  // 3. Count dismissed disputes in the failure window
  const windowStart = new Date(
    Date.now() - DISPUTE_FAILURE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  const [result] = await db
    .select({ count: count() })
    .from(disputes)
    .where(
      and(
        eq(disputes.challengerAgentId, agentId),
        eq(disputes.status, "dismissed"),
        gte(disputes.createdAt, windowStart),
      ),
    );

  const dismissedCount = result?.count ?? 0;

  // 4. If threshold reached, apply suspension
  if (dismissedCount >= DISPUTE_FAILURE_THRESHOLD && validator) {
    const suspendedUntil = new Date(
      Date.now() + DISPUTE_SUSPENSION_DAYS * 24 * 60 * 60 * 1000,
    );

    await db
      .update(validatorPool)
      .set({ disputeSuspendedUntil: suspendedUntil })
      .where(eq(validatorPool.id, validator.id));

    logger.warn(
      {
        agentId,
        dismissedCount,
        suspendedUntil: suspendedUntil.toISOString(),
      },
      "Dispute suspension applied",
    );

    return {
      suspended: true,
      suspendedUntil,
      dismissedCount,
    };
  }

  return {
    suspended: false,
    suspendedUntil: null,
    dismissedCount,
  };
}
