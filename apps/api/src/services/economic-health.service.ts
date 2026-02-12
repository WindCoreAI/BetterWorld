/**
 * Economic Health Service (Sprint 12 — T034)
 *
 * Computes point-in-time snapshots of the credit economy:
 * faucet/sink ratio, hardship rate, median balance, active validators.
 * Alert thresholds flag unhealthy economic conditions for admin review.
 */
import { agents, agentCreditTransactions, validatorPool } from "@betterworld/db";
import { HARDSHIP_THRESHOLD } from "@betterworld/shared";
import { sql, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { logger } from "../middleware/logger.js";

// ── Alert Thresholds ──────────────────────────────────────────
const RATIO_LOW = 0.7;
const RATIO_HIGH = 1.3;
const HARDSHIP_RATE_ALERT = 0.15;

// ── Types ─────────────────────────────────────────────────────

export interface EconomicHealthSnapshot {
  periodStart: Date;
  periodEnd: Date;
  faucetTotal: number;
  sinkTotal: number;
  faucetSinkRatio: number;
  totalAgentCount: number;
  hardshipAgentCount: number;
  hardshipRate: number;
  medianBalance: number;
  activeValidatorCount: number;
  alertTriggered: boolean;
  alertReasons: string[];
}

// ── Core Function ─────────────────────────────────────────────

/**
 * Compute a snapshot of the credit economy for the last 24 hours.
 */
export async function computeSnapshot(
  db: PostgresJsDatabase,
): Promise<EconomicHealthSnapshot> {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000);

  // 1. Aggregate faucet (positive) and sink (negative) amounts
  const [txAgg] = await db
    .select({
      faucetTotal: sql<string>`COALESCE(SUM(CASE WHEN ${agentCreditTransactions.amount} > 0 THEN ${agentCreditTransactions.amount} ELSE 0 END), 0)`,
      sinkTotal: sql<string>`COALESCE(ABS(SUM(CASE WHEN ${agentCreditTransactions.amount} < 0 THEN ${agentCreditTransactions.amount} ELSE 0 END)), 0)`,
    })
    .from(agentCreditTransactions)
    .where(sql`${agentCreditTransactions.createdAt} >= ${periodStart}`);

  const faucetTotal = Number(txAgg?.faucetTotal ?? 0);
  const sinkTotal = Number(txAgg?.sinkTotal ?? 0);

  // 2. Faucet/sink ratio
  const rawRatio = sinkTotal === 0
    ? (faucetTotal === 0 ? 1.0 : Infinity)
    : faucetTotal / sinkTotal;
  const faucetSinkRatio = rawRatio === Infinity ? 999.99 : Number(rawRatio.toFixed(2));

  // 3. Hardship metrics
  const [agentCounts] = await db
    .select({
      totalAgentCount: sql<string>`COUNT(*)`,
      hardshipAgentCount: sql<string>`SUM(CASE WHEN ${agents.creditBalance} < ${HARDSHIP_THRESHOLD} THEN 1 ELSE 0 END)`,
    })
    .from(agents);

  const totalAgentCount = Number(agentCounts?.totalAgentCount ?? 0);
  const hardshipAgentCount = Number(agentCounts?.hardshipAgentCount ?? 0);
  const hardshipRate = totalAgentCount === 0 ? 0 : hardshipAgentCount / totalAgentCount;

  // 4. Median balance
  const [medianResult] = await db.execute(
    sql`SELECT COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY credit_balance), 0) AS median_balance FROM agents`,
  );
  const medianBalance = Number(
    (medianResult as Record<string, string | number> | undefined)?.median_balance ?? 0,
  );

  // 5. Active validators
  const [validatorResult] = await db
    .select({ activeValidatorCount: sql<string>`COUNT(*)` })
    .from(validatorPool)
    .where(eq(validatorPool.isActive, true));

  const activeValidatorCount = Number(validatorResult?.activeValidatorCount ?? 0);

  // 6. Alert evaluation
  const alertReasons: string[] = [];

  if (faucetSinkRatio < 999.99 && (faucetSinkRatio < RATIO_LOW || faucetSinkRatio > RATIO_HIGH)) {
    alertReasons.push(
      `Faucet/sink ratio ${faucetSinkRatio} outside healthy range [${RATIO_LOW}, ${RATIO_HIGH}]`,
    );
  }

  if (hardshipRate > HARDSHIP_RATE_ALERT) {
    alertReasons.push(
      `Hardship rate ${(hardshipRate * 100).toFixed(1)}% exceeds ${(HARDSHIP_RATE_ALERT * 100).toFixed(0)}% threshold (${hardshipAgentCount}/${totalAgentCount} agents)`,
    );
  }

  const alertTriggered = alertReasons.length > 0;

  logger.info(
    { faucetTotal, sinkTotal, faucetSinkRatio, hardshipRate: (hardshipRate * 100).toFixed(1) + "%", medianBalance, activeValidatorCount, alertTriggered },
    "Economic health snapshot computed",
  );

  return {
    periodStart,
    periodEnd,
    faucetTotal,
    sinkTotal,
    faucetSinkRatio,
    totalAgentCount,
    hardshipAgentCount,
    hardshipRate: Number(hardshipRate.toFixed(4)),
    medianBalance: Number(Number(medianBalance).toFixed(2)),
    activeValidatorCount,
    alertTriggered,
    alertReasons,
  };
}
