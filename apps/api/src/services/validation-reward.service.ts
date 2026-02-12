import { peerEvaluations, validatorPool } from "@betterworld/db";
import { VALIDATION_REWARDS } from "@betterworld/shared";
import { eq, and } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type Redis from "ioredis";

import { logger } from "../middleware/logger.js";
import { AgentCreditService } from "../services/agent-credit.service.js";
import { getFlag } from "../services/feature-flags.js";

type ContentType = "problem" | "solution" | "debate" | "mission";

/**
 * Distribute validation rewards to validators after consensus is reached.
 *
 * Rewards go to ALL validators who completed their evaluation (status='completed'),
 * regardless of whether they agreed with the consensus outcome.
 * Timed-out validators receive nothing.
 */
export async function distributeRewards(
  db: PostgresJsDatabase,
  redis: Redis | null,
  consensusResultId: string,
  submissionId: string,
  submissionType: string,
): Promise<{
  rewardsDistributed: number;
  totalCredits: number;
  validators: Array<{ validatorId: string; reward: number; tier: string }>;
}> {
  // 1. Check feature flag
  const enabled = await getFlag(redis, "VALIDATION_REWARDS_ENABLED");
  if (!enabled) {
    logger.info("Validation rewards disabled, skipping distribution");
    return { rewardsDistributed: 0, totalCredits: 0, validators: [] };
  }

  // 2. Query completed peer evaluations for this submission
  const completedEvals = await db
    .select({
      id: peerEvaluations.id,
      validatorId: peerEvaluations.validatorId,
      validatorAgentId: peerEvaluations.validatorAgentId,
      rewardCreditTransactionId: peerEvaluations.rewardCreditTransactionId,
    })
    .from(peerEvaluations)
    .where(
      and(
        eq(peerEvaluations.submissionId, submissionId),
        eq(
          peerEvaluations.submissionType,
          submissionType as ContentType,
        ),
        eq(peerEvaluations.status, "completed"),
      ),
    );

  if (completedEvals.length === 0) {
    logger.info(
      { consensusResultId, submissionId },
      "No completed evaluations found for reward distribution",
    );
    return { rewardsDistributed: 0, totalCredits: 0, validators: [] };
  }

  const creditService = new AgentCreditService(db);
  const results: Array<{ validatorId: string; reward: number; tier: string }> =
    [];
  let totalCredits = 0;

  // 3. For each completed evaluation, look up tier and distribute reward
  for (const evaluation of completedEvals) {
    // Skip if already rewarded (idempotency at the DB level)
    if (evaluation.rewardCreditTransactionId) {
      logger.debug(
        { evaluationId: evaluation.id },
        "Evaluation already rewarded, skipping",
      );
      continue;
    }

    // 3a. Look up validator tier
    const [validator] = await db
      .select({ tier: validatorPool.tier })
      .from(validatorPool)
      .where(eq(validatorPool.id, evaluation.validatorId))
      .limit(1);

    if (!validator) {
      logger.warn(
        { validatorId: evaluation.validatorId, evaluationId: evaluation.id },
        "Validator not found in pool, skipping reward",
      );
      continue;
    }

    const tier = validator.tier;

    // 3b. Compute reward from tier-based table (default to apprentice)
    const reward =
      VALIDATION_REWARDS[tier as keyof typeof VALIDATION_REWARDS] ??
      VALIDATION_REWARDS.apprentice;

    // 3c. Earn credits with idempotency key
    const idempotencyKey = `validation:${evaluation.id}`;
    try {
      const { transactionId } = await creditService.earnCredits(
        evaluation.validatorAgentId,
        reward,
        "earn_validation",
        consensusResultId,
        idempotencyKey,
        `Validation reward (${tier}) for ${submissionType} ${submissionId}`,
      );

      // 3d. Update peerEvaluations with the transaction ID
      await db
        .update(peerEvaluations)
        .set({ rewardCreditTransactionId: transactionId })
        .where(eq(peerEvaluations.id, evaluation.id));

      results.push({
        validatorId: evaluation.validatorAgentId,
        reward,
        tier,
      });
      totalCredits += reward;

      logger.info(
        {
          evaluationId: evaluation.id,
          validatorAgentId: evaluation.validatorAgentId,
          tier,
          reward,
          transactionId,
        },
        "Validation reward distributed",
      );
    } catch (error) {
      logger.error(
        {
          evaluationId: evaluation.id,
          validatorAgentId: evaluation.validatorAgentId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to distribute validation reward",
      );
      // Continue with remaining validators — partial distribution is acceptable
    }
  }

  logger.info(
    {
      consensusResultId,
      submissionId,
      rewardsDistributed: results.length,
      totalCredits,
    },
    "Validation reward distribution complete",
  );

  return {
    rewardsDistributed: results.length,
    totalCredits,
    validators: results,
  };
}
