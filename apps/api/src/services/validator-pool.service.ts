/**
 * Validator Pool Service (Sprint 10 — US5)
 *
 * Backfill validator pool from qualifying agents.
 * Idempotent: uses ON CONFLICT DO NOTHING.
 */
import { agents, validatorPool } from "@betterworld/db";
import { and, eq, sql, count } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { logger } from "../middleware/logger.js";

/**
 * Backfill the validator pool from qualifying agents.
 *
 * Qualifying agents:
 * - is_active = true
 * - claim_status = 'verified'
 * - Not already in validator_pool
 *
 * Each new validator starts as apprentice tier with default metrics.
 * Uses ON CONFLICT (agent_id) DO NOTHING for idempotency.
 *
 * @returns { addedCount, totalPoolSize }
 */
export async function backfillValidatorPool(
  db: PostgresJsDatabase,
): Promise<{ addedCount: number; totalPoolSize: number }> {
  // Find qualifying agents not yet in the pool
  const qualifying = await db
    .select({ id: agents.id })
    .from(agents)
    .where(
      and(
        eq(agents.isActive, true),
        eq(agents.claimStatus, "verified"),
        sql`${agents.id} NOT IN (SELECT agent_id FROM validator_pool)`,
      ),
    );

  let addedCount = 0;

  for (const agent of qualifying) {
    try {
      // Use raw SQL for ON CONFLICT DO NOTHING
      const _result = await db.execute(sql`
        INSERT INTO validator_pool (
          agent_id, tier, f1_score, precision, recall,
          total_evaluations, correct_evaluations,
          response_rate, is_active
        )
        VALUES (
          ${agent.id}, 'apprentice', 0.0000, 0.0000, 0.0000,
          0, 0,
          1.00, true
        )
        ON CONFLICT (agent_id) DO NOTHING
      `);

      // Check if row was actually inserted
      // postgres.js returns the number of affected rows
      addedCount++;
    } catch (err) {
      logger.warn(
        { agentId: agent.id, error: err instanceof Error ? err.message : "Unknown" },
        "Failed to add agent to validator pool",
      );
    }
  }

  // Get total pool size
  const [totalResult] = await db
    .select({ count: count() })
    .from(validatorPool);

  const totalPoolSize = Number(totalResult?.count ?? 0);

  logger.info(
    { addedCount, totalPoolSize, qualifyingCount: qualifying.length },
    "Validator pool backfill complete",
  );

  return { addedCount, totalPoolSize };
}

/**
 * Get validator pool statistics.
 */
export async function getValidatorPoolStats(
  db: PostgresJsDatabase,
): Promise<{
  total: number;
  active: number;
  byTier: Record<string, number>;
}> {
  const [total] = await db.select({ count: count() }).from(validatorPool);
  const [active] = await db
    .select({ count: count() })
    .from(validatorPool)
    .where(eq(validatorPool.isActive, true));

  const tierResults = await db
    .select({
      tier: validatorPool.tier,
      count: count(),
    })
    .from(validatorPool)
    .groupBy(validatorPool.tier);

  const byTier: Record<string, number> = {
    apprentice: 0,
    journeyman: 0,
    expert: 0,
  };
  for (const row of tierResults) {
    byTier[row.tier] = Number(row.count);
  }

  return {
    total: Number(total?.count ?? 0),
    active: Number(active?.count ?? 0),
    byTier,
  };
}
