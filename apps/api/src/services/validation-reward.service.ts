import { peerEvaluations, validatorPool } from "@betterworld/db";
import { VALIDATION_REWARDS } from "@betterworld/shared";
import { eq, and, inArray } from "drizzle-orm";
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

  // Filter out already-rewarded evaluations (idempotency)
  const unrewarded = completedEvals.filter((e) => {
    if (e.rewardCreditTransactionId) {
      logger.debug({ evaluationId: e.id }, "Evaluation already rewarded, skipping");
      return false;
    }
    return true;
  });

  if (unrewarded.length === 0) {
    return { rewardsDistributed: 0, totalCredits: 0, validators: [] };
  }

  // 3. Batch-fetch all validator tiers (eliminates N+1)
  const validatorIds = [...new Set(unrewarded.map((e) => e.validatorId))];
  const validators = await db
    .select({ id: validatorPool.id, tier: validatorPool.tier })
    .from(validatorPool)
    .where(inArray(validatorPool.id, validatorIds));

  const tierMap = new Map(validators.map((v) => [v.id, v.tier]));

  // 4. Distribute rewards using pre-fetched tiers
  for (const evaluation of unrewarded) {
    const tier = tierMap.get(evaluation.validatorId);
    if (!tier) {
      logger.warn(
        { validatorId: evaluation.validatorId, evaluationId: evaluation.id },
        "Validator not found in pool, skipping reward",
      );
      continue;
    }

    const reward =
      VALIDATION_REWARDS[tier as keyof typeof VALIDATION_REWARDS] ??
      VALIDATION_REWARDS.apprentice;

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
