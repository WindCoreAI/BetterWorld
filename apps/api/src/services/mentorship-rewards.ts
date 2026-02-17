/**
 * Mentorship Rewards Service (Sprint 18: Cooperative Depth & Governance — US1)
 *
 * Token rewards for mentorship activities:
 * - 2 tokens per mentee mission completion (cap 20 per mentorship, per FR-004)
 * - 1 bonus token when mentee completes first mission
 * - 5 tokens at mentorship completion (teaching reward per FR-058)
 *
 * All token operations use double-entry accounting with SELECT FOR UPDATE
 * and idempotency keys.
 */
import { mentorships, humans, tokenTransactions } from "@betterworld/db";
import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";

const logger = pino({ name: "mentorship-rewards" });

/** Maximum tokens a mentor can earn per mentorship from mission guidance */
const MAX_GUIDANCE_TOKENS = 20;

/** Tokens per mentee mission completion */
const TOKENS_PER_MISSION = 2;

/** Bonus token for mentee's first mission */
const FIRST_MISSION_BONUS = 1;

/** Tokens awarded at mentorship completion */
const COMPLETION_REWARD = 5;

/**
 * Award tokens to a mentor when their mentee completes a mission.
 * Includes the first-mission bonus if applicable.
 */
export async function awardMentorMissionReward(
  db: PostgresJsDatabase,
  mentorshipId: string,
): Promise<{ rewarded: boolean; amount: number; firstMissionBonus: boolean } | null> {
  return db.transaction(async (tx) => {
    // Get mentorship details
    const [ms] = await tx
      .select({
        id: mentorships.id,
        mentorHumanId: mentorships.mentorHumanId,
        missionsGuided: mentorships.missionsGuided,
        tokensEarnedByMentor: mentorships.tokensEarnedByMentor,
        status: mentorships.status,
      })
      .from(mentorships)
      .where(eq(mentorships.id, mentorshipId))
      .limit(1);

    if (!ms || ms.status !== "active") {
      logger.warn({ mentorshipId }, "Mentorship not active, skipping reward");
      return null;
    }

    // Check cap
    if (ms.tokensEarnedByMentor >= MAX_GUIDANCE_TOKENS) {
      logger.info({ mentorshipId, earned: ms.tokensEarnedByMentor }, "Mentor token cap reached");
      return { rewarded: false, amount: 0, firstMissionBonus: false };
    }

    const isFirstMission = ms.missionsGuided === 0;
    let totalReward = TOKENS_PER_MISSION;

    // First mission bonus
    if (isFirstMission) {
      totalReward += FIRST_MISSION_BONUS;
    }

    // Don't exceed cap
    const remainingCap = MAX_GUIDANCE_TOKENS - ms.tokensEarnedByMentor;
    totalReward = Math.min(totalReward, remainingCap);

    if (totalReward <= 0) {
      return { rewarded: false, amount: 0, firstMissionBonus: false };
    }

    // Idempotency key per mission count to prevent double rewards
    const missionNumber = ms.missionsGuided + 1;
    const idempotencyKey = `mentorship-mission-reward:${mentorshipId}:${missionNumber}`;

    // Check idempotency
    const [existing] = await tx
      .select({ id: tokenTransactions.id })
      .from(tokenTransactions)
      .where(eq(tokenTransactions.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existing) {
      logger.info({ mentorshipId, idempotencyKey }, "Mission reward already distributed");
      return null;
    }

    // Lock mentor balance
    const balanceResult = await tx.execute(
      sql`SELECT id, token_balance FROM humans WHERE id = ${ms.mentorHumanId} FOR UPDATE`,
    );
    const humanRow = (balanceResult as unknown as Array<{ id: string; token_balance: string }>)[0];
    if (!humanRow) {
      logger.warn({ mentorHumanId: ms.mentorHumanId }, "Mentor not found");
      return null;
    }

    const currentBalance = parseInt(humanRow.token_balance, 10) || 0;
    const newBalance = currentBalance + totalReward;

    // Update balance
    await tx
      .update(humans)
      .set({
        tokenBalance: String(newBalance),
        updatedAt: new Date(),
      })
      .where(eq(humans.id, ms.mentorHumanId));

    // Create transaction record
    const txType = isFirstMission ? "earn_mentee_first_mission" : "earn_mentorship_bonus";
    await tx
      .insert(tokenTransactions)
      .values({
        humanId: ms.mentorHumanId,
        amount: totalReward,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        transactionType: txType,
        referenceId: mentorshipId,
        referenceType: "mentorship",
        description: isFirstMission
          ? `Mentorship bonus: mentee completed first mission (+${FIRST_MISSION_BONUS} bonus)`
          : `Mentorship guidance reward: mentee mission #${missionNumber}`,
        idempotencyKey,
      });

    // Update mentorship counters
    await tx
      .update(mentorships)
      .set({
        missionsGuided: missionNumber,
        tokensEarnedByMentor: ms.tokensEarnedByMentor + totalReward,
        updatedAt: new Date(),
      })
      .where(eq(mentorships.id, mentorshipId));

    logger.info(
      { mentorshipId, totalReward, isFirstMission, missionNumber },
      "Mentor mission reward distributed",
    );

    return { rewarded: true, amount: totalReward, firstMissionBonus: isFirstMission };
  });
}

/**
 * Award completion reward to mentor when mentorship completes (30-day lifecycle).
 */
export async function awardMentorshipCompletionReward(
  db: PostgresJsDatabase,
  mentorshipId: string,
): Promise<{ rewarded: boolean; amount: number } | null> {
  const idempotencyKey = `mentorship-completion:${mentorshipId}`;

  return db.transaction(async (tx) => {
    // Check idempotency
    const [existing] = await tx
      .select({ id: tokenTransactions.id })
      .from(tokenTransactions)
      .where(eq(tokenTransactions.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existing) {
      logger.info({ mentorshipId, idempotencyKey }, "Completion reward already distributed");
      return null;
    }

    const [ms] = await tx
      .select({
        mentorHumanId: mentorships.mentorHumanId,
        status: mentorships.status,
      })
      .from(mentorships)
      .where(eq(mentorships.id, mentorshipId))
      .limit(1);

    if (!ms) return null;

    // Lock mentor balance
    const balanceResult = await tx.execute(
      sql`SELECT id, token_balance FROM humans WHERE id = ${ms.mentorHumanId} FOR UPDATE`,
    );
    const humanRow = (balanceResult as unknown as Array<{ id: string; token_balance: string }>)[0];
    if (!humanRow) return null;

    const currentBalance = parseInt(humanRow.token_balance, 10) || 0;
    const newBalance = currentBalance + COMPLETION_REWARD;

    // Update balance
    await tx
      .update(humans)
      .set({
        tokenBalance: String(newBalance),
        updatedAt: new Date(),
      })
      .where(eq(humans.id, ms.mentorHumanId));

    // Create transaction
    await tx
      .insert(tokenTransactions)
      .values({
        humanId: ms.mentorHumanId,
        amount: COMPLETION_REWARD,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        transactionType: "earn_mentorship_completion",
        referenceId: mentorshipId,
        referenceType: "mentorship",
        description: "Teaching reward: mentorship completed successfully",
        idempotencyKey,
      });

    logger.info(
      { mentorshipId, mentorHumanId: ms.mentorHumanId, amount: COMPLETION_REWARD },
      "Mentorship completion reward distributed",
    );

    return { rewarded: true, amount: COMPLETION_REWARD };
  });
}
