/**
 * Buddy Rewards Service (Sprint 18: Cooperative Depth & Governance — US2 & US4)
 *
 * Calculates and distributes reward splits for buddy and helper scenarios:
 * - Solo: 100% to claimer
 * - Buddy: 60% claimer / 40% buddy
 * - Helper: 75% claimer / 25% helper
 * - Buddy + Helper: 45% claimer / 30% buddy / 25% helper
 *
 * All operations use double-entry accounting with SELECT FOR UPDATE.
 */
import { humans, tokenTransactions } from "@betterworld/db";
import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";

const logger = pino({ name: "buddy-rewards" });

interface RewardSplit {
  humanId: string;
  amount: number;
  transactionType: string;
  description: string;
}

/**
 * Calculate reward splits based on participation type.
 */
export function calculateRewardSplits(
  totalReward: number,
  claimerHumanId: string,
  buddyHumanId?: string | null,
  helperHumanId?: string | null,
): RewardSplit[] {
  const splits: RewardSplit[] = [];

  if (buddyHumanId && helperHumanId) {
    // Buddy + Helper: 45/30/25
    const claimerAmount = Math.ceil(totalReward * 0.45);
    const buddyAmount = Math.floor(totalReward * 0.30);
    const helperAmount = totalReward - claimerAmount - buddyAmount;

    splits.push(
      { humanId: claimerHumanId, amount: claimerAmount, transactionType: "earn_mission", description: "Mission reward (buddy+helper split: 45%)" },
      { humanId: buddyHumanId, amount: buddyAmount, transactionType: "earn_buddy_split", description: "Buddy reward split (30%)" },
      { humanId: helperHumanId, amount: helperAmount, transactionType: "earn_helper_reward", description: "Helper reward (25%)" },
    );
  } else if (buddyHumanId) {
    // Buddy: 60/40
    const claimerAmount = Math.ceil(totalReward * 0.60);
    const buddyAmount = totalReward - claimerAmount;

    splits.push(
      { humanId: claimerHumanId, amount: claimerAmount, transactionType: "earn_mission", description: "Mission reward (buddy split: 60%)" },
      { humanId: buddyHumanId, amount: buddyAmount, transactionType: "earn_buddy_split", description: "Buddy reward split (40%)" },
    );
  } else if (helperHumanId) {
    // Helper: 75/25
    const claimerAmount = Math.ceil(totalReward * 0.75);
    const helperAmount = totalReward - claimerAmount;

    splits.push(
      { humanId: claimerHumanId, amount: claimerAmount, transactionType: "earn_mission", description: "Mission reward (with helper: 75%)" },
      { humanId: helperHumanId, amount: helperAmount, transactionType: "earn_helper_reward", description: "Helper reward (25%)" },
    );
  } else {
    // Solo: 100%
    splits.push(
      { humanId: claimerHumanId, amount: totalReward, transactionType: "earn_mission", description: "Mission reward (solo)" },
    );
  }

  return splits;
}

/**
 * Distribute reward splits with double-entry accounting.
 */
export async function distributeRewardSplits(
  db: PostgresJsDatabase,
  splits: RewardSplit[],
  referenceId: string,
  referenceType: string,
): Promise<Array<{ humanId: string; amount: number; transactionId: string }>> {
  const results: Array<{ humanId: string; amount: number; transactionId: string }> = [];

  await db.transaction(async (tx) => {
    for (const split of splits) {
      if (split.amount <= 0) continue;

      const idempotencyKey = `${referenceType}-split:${referenceId}:${split.humanId}:${split.transactionType}`;

      // Check idempotency
      const [existing] = await tx
        .select({ id: tokenTransactions.id })
        .from(tokenTransactions)
        .where(eq(tokenTransactions.idempotencyKey, idempotencyKey))
        .limit(1);

      if (existing) {
        results.push({ humanId: split.humanId, amount: split.amount, transactionId: existing.id });
        continue;
      }

      // Lock balance
      const balanceResult = await tx.execute(
        sql`SELECT id, token_balance FROM humans WHERE id = ${split.humanId} FOR UPDATE`,
      );
      const humanRow = (balanceResult as unknown as Array<{ id: string; token_balance: string }>)[0];
      if (!humanRow) continue;

      const currentBalance = parseInt(humanRow.token_balance, 10) || 0;
      const newBalance = currentBalance + split.amount;

      await tx
        .update(humans)
        .set({ tokenBalance: String(newBalance), updatedAt: new Date() })
        .where(eq(humans.id, split.humanId));

      const [txn] = await tx
        .insert(tokenTransactions)
        .values({
          humanId: split.humanId,
          amount: split.amount,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          transactionType: split.transactionType as never,
          referenceId,
          referenceType,
          description: split.description,
          idempotencyKey,
        })
        .returning({ id: tokenTransactions.id });

      if (txn) {
        results.push({ humanId: split.humanId, amount: split.amount, transactionId: txn.id });
      }
    }
  });

  logger.info({ referenceId, splits: results.length }, "Reward splits distributed");
  return results;
}
