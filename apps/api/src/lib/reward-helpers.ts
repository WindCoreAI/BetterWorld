/**
 * Token Reward Distribution (Sprint 8: Evidence Verification)
 *
 * Double-entry accounting with SELECT FOR UPDATE and idempotency keys.
 */

import { evidence, humans, tokenTransactions, missions } from "@betterworld/db";
import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";

const logger = pino({ name: "reward-helpers" });

/**
 * Distribute evidence verification reward to the submitter.
 * Reward = floor(mission.tokenReward * finalConfidence), minimum 1 IT.
 */
export async function distributeEvidenceReward(
  db: PostgresJsDatabase,
  evidenceId: string,
): Promise<{ rewardAmount: number; transactionId: string } | null> {
  const idempotencyKey = `evidence-reward:${evidenceId}`;

  return db.transaction(async (tx) => {
    // Check idempotency
    const [existing] = await tx
      .select({ id: tokenTransactions.id })
      .from(tokenTransactions)
      .where(eq(tokenTransactions.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existing) {
      logger.info({ evidenceId, idempotencyKey }, "Evidence reward already distributed (idempotent)");
      return null;
    }

    // Fetch evidence + mission data
    const [evidenceRow] = await tx
      .select({
        submittedByHumanId: evidence.submittedByHumanId,
        finalConfidence: evidence.finalConfidence,
        missionId: evidence.missionId,
      })
      .from(evidence)
      .where(eq(evidence.id, evidenceId))
      .limit(1);

    if (!evidenceRow || !evidenceRow.finalConfidence) {
      logger.warn({ evidenceId }, "Cannot distribute reward: evidence not found or no confidence");
      return null;
    }

    const [mission] = await tx
      .select({ tokenReward: missions.tokenReward, title: missions.title })
      .from(missions)
      .where(eq(missions.id, evidenceRow.missionId))
      .limit(1);

    if (!mission) {
      logger.warn({ missionId: evidenceRow.missionId }, "Cannot distribute reward: mission not found");
      return null;
    }

    const confidence = Number(evidenceRow.finalConfidence);
    const rewardAmount = Math.max(1, Math.floor(mission.tokenReward * confidence));

    // Lock human balance row
    const balanceResult = await tx.execute(
      sql`SELECT id, token_balance FROM humans WHERE id = ${evidenceRow.submittedByHumanId} FOR UPDATE`,
    );
    const humanRow = (balanceResult as unknown as Array<{ id: string; token_balance: string }>)[0];
    if (!humanRow) {
      logger.warn({ humanId: evidenceRow.submittedByHumanId }, "Human not found for reward");
      return null;
    }

    const currentBalance = parseFloat(humanRow.token_balance);
    const newBalance = currentBalance + rewardAmount;

    // Update balance
    await tx
      .update(humans)
      .set({
        tokenBalance: String(newBalance),
        updatedAt: new Date(),
      })
      .where(eq(humans.id, evidenceRow.submittedByHumanId));

    // Create transaction record
    const [txn] = await tx
      .insert(tokenTransactions)
      .values({
        humanId: evidenceRow.submittedByHumanId,
        amount: rewardAmount,
        balanceBefore: Math.round(currentBalance),
        balanceAfter: Math.round(newBalance),
        transactionType: "earn_evidence_verified",
        referenceId: evidenceId,
        referenceType: "evidence",
        description: `Reward for verified evidence on mission: ${mission.title}`,
        idempotencyKey,
      })
      .returning();

    // Update evidence with reward transaction ID
    await tx
      .update(evidence)
      .set({
        rewardTransactionId: txn!.id,
        updatedAt: new Date(),
      })
      .where(eq(evidence.id, evidenceId));

    logger.info({ evidenceId, rewardAmount, humanId: evidenceRow.submittedByHumanId }, "Evidence reward distributed");
    return { rewardAmount, transactionId: txn!.id };
  });
}

/**
 * Distribute peer review reward to the reviewer.
 * Fixed 2 IT per review.
 */
export async function distributePeerReviewReward(
  db: PostgresJsDatabase,
  peerReviewId: string,
  reviewerHumanId: string,
  evidenceId: string,
): Promise<{ rewardAmount: number; transactionId: string } | null> {
  const rewardAmount = parseInt(process.env.PEER_REVIEW_REWARD || "2", 10);
  const idempotencyKey = `peer-review-reward:${peerReviewId}`;

  return db.transaction(async (tx) => {
    // Check idempotency
    const [existing] = await tx
      .select({ id: tokenTransactions.id })
      .from(tokenTransactions)
      .where(eq(tokenTransactions.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existing) {
      logger.info({ peerReviewId, idempotencyKey }, "Peer review reward already distributed");
      return null;
    }

    // Lock human balance row
    const balanceResult = await tx.execute(
      sql`SELECT id, token_balance FROM humans WHERE id = ${reviewerHumanId} FOR UPDATE`,
    );
    const humanRow = (balanceResult as unknown as Array<{ id: string; token_balance: string }>)[0];
    if (!humanRow) {
      logger.warn({ reviewerHumanId }, "Reviewer not found for reward");
      return null;
    }

    const currentBalance = parseFloat(humanRow.token_balance);
    const newBalance = currentBalance + rewardAmount;

    // Update balance
    await tx
      .update(humans)
      .set({
        tokenBalance: String(newBalance),
        updatedAt: new Date(),
      })
      .where(eq(humans.id, reviewerHumanId));

    // Create transaction record
    const [txn] = await tx
      .insert(tokenTransactions)
      .values({
        humanId: reviewerHumanId,
        amount: rewardAmount,
        balanceBefore: Math.round(currentBalance),
        balanceAfter: Math.round(newBalance),
        transactionType: "earn_peer_review",
        referenceId: peerReviewId,
        referenceType: "peer_review",
        description: `Reward for peer review on evidence: ${evidenceId}`,
        idempotencyKey,
      })
      .returning();

    logger.info({ peerReviewId, rewardAmount, reviewerHumanId }, "Peer review reward distributed");
    return { rewardAmount, transactionId: txn!.id };
  });
}
