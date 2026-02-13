/**
 * Rate Adjustment Service (Sprint 13 — Phase 3 Integration)
 *
 * Automatically adjusts validation reward and submission cost multipliers
 * based on the faucet/sink ratio of the agent credit economy. Includes
 * circuit breaker protection when ratios are extreme for consecutive days.
 */
import { rateAdjustments, agentCreditTransactions } from "@betterworld/db";
import {
  RATE_ADJUSTMENT_STEP,
  RATE_ADJUSTMENT_CAP,
  FAUCET_SINK_UPPER,
  FAUCET_SINK_LOWER,
  CIRCUIT_BREAKER_RATIO,
  CIRCUIT_BREAKER_DAYS,
} from "@betterworld/shared";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type Redis from "ioredis";

import { getFlag, setFlag } from "./feature-flags.js";
import { logger } from "../middleware/logger.js";

// ── Constants ────────────────────────────────────────────────
const MULTIPLIER_MIN = 0.01;
const MULTIPLIER_MAX = 5.0;
const CIRCUIT_BREAKER_SORTED_SET = "circuit:ratio:daily";
const CIRCUIT_BREAKER_MAX_ENTRIES = 30;

// ── Types ────────────────────────────────────────────────────

export interface RateAdjustmentResult {
  adjustmentType: "increase" | "decrease" | "none";
  faucetSinkRatio: number;
  rewardMultiplierBefore: number;
  rewardMultiplierAfter: number;
  costMultiplierBefore: number;
  costMultiplierAfter: number;
  changePercent: number;
  circuitBreakerActive: boolean;
}

export interface CircuitBreakerStatus {
  active: boolean;
  ratio?: number;
  consecutiveDays?: number;
}

// ── Core Functions ───────────────────────────────────────────

/**
 * Calculate the faucet/sink ratio from agent credit transactions
 * over a trailing window of `periodDays` days.
 *
 * Faucet = sum of positive amounts (earn_* transactions)
 * Sink = sum of absolute negative amounts (spend_* transactions)
 */
export async function calculateFaucetSinkRatio(
  db: PostgresJsDatabase,
  periodDays = 7,
): Promise<number> {
  const periodStart = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  const [result] = await db
    .select({
      faucetTotal: sql<string>`COALESCE(SUM(CASE WHEN ${agentCreditTransactions.amount} > 0 THEN ${agentCreditTransactions.amount} ELSE 0 END), 0)`,
      sinkTotal: sql<string>`COALESCE(ABS(SUM(CASE WHEN ${agentCreditTransactions.amount} < 0 THEN ${agentCreditTransactions.amount} ELSE 0 END)), 0)`,
    })
    .from(agentCreditTransactions)
    .where(sql`${agentCreditTransactions.createdAt} >= ${periodStart}`);

  const faucet = Number(result?.faucetTotal ?? 0);
  const sink = Number(result?.sinkTotal ?? 0);

  if (faucet === 0 && sink === 0) {
    return 1.0;
  }

  if (sink === 0) {
    return Infinity;
  }

  return faucet / sink;
}

/**
 * Apply a rate adjustment based on the current faucet/sink ratio.
 *
 * - ratio > FAUCET_SINK_UPPER (1.15): "decrease" — too many credits entering
 *   → lower rewards, raise costs
 * - ratio < FAUCET_SINK_LOWER (0.85): "increase" — too many credits leaving
 *   → raise rewards, lower costs
 * - otherwise: "none" — economy is healthy
 */
export async function applyRateAdjustment(
  db: PostgresJsDatabase,
  redis: Redis,
  ratio: number,
): Promise<RateAdjustmentResult> {
  // Read current multipliers from feature flags
  const currentReward = await getFlag(redis, "VALIDATION_REWARD_MULTIPLIER");
  const currentCost = await getFlag(redis, "SUBMISSION_COST_MULTIPLIER");

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Determine direction
  let adjustmentType: "increase" | "decrease" | "none";
  if (ratio > FAUCET_SINK_UPPER) {
    adjustmentType = "decrease";
  } else if (ratio < FAUCET_SINK_LOWER) {
    adjustmentType = "increase";
  } else {
    adjustmentType = "none";
  }

  // No adjustment needed — record audit and return
  if (adjustmentType === "none") {
    const displayRatio = Number.isFinite(ratio) ? ratio : 999.99;

    await db.insert(rateAdjustments).values({
      adjustmentType: "none",
      faucetSinkRatio: String(Number(displayRatio.toFixed(2))),
      rewardMultiplierBefore: String(currentReward),
      rewardMultiplierAfter: String(currentReward),
      costMultiplierBefore: String(currentCost),
      costMultiplierAfter: String(currentCost),
      changePercent: "0",
      circuitBreakerActive: false,
      periodStart,
      periodEnd,
      triggeredBy: "auto",
    });

    logger.info(
      { ratio: displayRatio, adjustmentType: "none" },
      "Rate adjustment: no change needed — economy healthy",
    );

    return {
      adjustmentType: "none",
      faucetSinkRatio: displayRatio,
      rewardMultiplierBefore: currentReward,
      rewardMultiplierAfter: currentReward,
      costMultiplierBefore: currentCost,
      costMultiplierAfter: currentCost,
      changePercent: 0,
      circuitBreakerActive: false,
    };
  }

  // Calculate step, capped at RATE_ADJUSTMENT_CAP
  const step = Math.min(RATE_ADJUSTMENT_STEP, RATE_ADJUSTMENT_CAP);

  let newReward: number;
  let newCost: number;

  if (adjustmentType === "decrease") {
    // Too many credits entering — lower rewards, raise costs
    newReward = currentReward * (1 - step);
    newCost = currentCost * (1 + step);
  } else {
    // Too many credits leaving — raise rewards, lower costs
    newReward = currentReward * (1 + step);
    newCost = currentCost * (1 - step);
  }

  // Clamp multipliers to [MULTIPLIER_MIN, MULTIPLIER_MAX]
  newReward = Math.max(MULTIPLIER_MIN, Math.min(MULTIPLIER_MAX, newReward));
  newCost = Math.max(MULTIPLIER_MIN, Math.min(MULTIPLIER_MAX, newCost));

  // Round to 4 decimal places
  newReward = Number(newReward.toFixed(4));
  newCost = Number(newCost.toFixed(4));

  // Update feature flags
  await setFlag(redis, "VALIDATION_REWARD_MULTIPLIER", newReward);
  await setFlag(redis, "SUBMISSION_COST_MULTIPLIER", newCost);

  const displayRatio = Number.isFinite(ratio) ? ratio : 999.99;
  const changePercent = step * 100;

  // Insert audit row
  await db.insert(rateAdjustments).values({
    adjustmentType,
    faucetSinkRatio: String(Number(displayRatio.toFixed(2))),
    rewardMultiplierBefore: String(currentReward),
    rewardMultiplierAfter: String(newReward),
    costMultiplierBefore: String(currentCost),
    costMultiplierAfter: String(newCost),
    changePercent: String(changePercent),
    circuitBreakerActive: false,
    periodStart,
    periodEnd,
    triggeredBy: "auto",
  });

  logger.info(
    {
      adjustmentType,
      ratio: displayRatio,
      rewardMultiplier: `${currentReward} -> ${newReward}`,
      costMultiplier: `${currentCost} -> ${newCost}`,
      changePercent,
    },
    "Rate adjustment applied",
  );

  return {
    adjustmentType,
    faucetSinkRatio: displayRatio,
    rewardMultiplierBefore: currentReward,
    rewardMultiplierAfter: newReward,
    costMultiplierBefore: currentCost,
    costMultiplierAfter: newCost,
    changePercent,
    circuitBreakerActive: false,
  };
}

/**
 * Check whether the circuit breaker should be activated.
 *
 * If the daily faucet/sink ratio has exceeded CIRCUIT_BREAKER_RATIO (2.0)
 * for CIRCUIT_BREAKER_DAYS (3) consecutive days, pause rate adjustments
 * and alert admins.
 */
export async function checkCircuitBreaker(
  _db: PostgresJsDatabase,
  redis: Redis,
): Promise<CircuitBreakerStatus> {
  // Read recent daily ratio snapshots from Redis sorted set
  const entries = await redis.zrevrange(
    CIRCUIT_BREAKER_SORTED_SET,
    0,
    CIRCUIT_BREAKER_DAYS - 1,
    "WITHSCORES",
  );

  // Parse entries: [value, score, value, score, ...]
  const ratios: number[] = [];
  for (let i = 0; i < entries.length; i += 2) {
    const ratioValue = Number(entries[i]);
    if (!isNaN(ratioValue)) {
      ratios.push(ratioValue);
    }
  }

  // Need at least CIRCUIT_BREAKER_DAYS entries to check
  if (ratios.length < CIRCUIT_BREAKER_DAYS) {
    return { active: false };
  }

  // Check if ALL exceed the threshold
  const allExceed = ratios
    .slice(0, CIRCUIT_BREAKER_DAYS)
    .every((r) => r > CIRCUIT_BREAKER_RATIO);

  if (!allExceed) {
    return { active: false };
  }

  // Activate circuit breaker
  await setFlag(redis, "RATE_ADJUSTMENT_PAUSED", true);

  const latestRatio = ratios[0]!;

  logger.warn(
    {
      consecutiveDays: CIRCUIT_BREAKER_DAYS,
      latestRatio,
      threshold: CIRCUIT_BREAKER_RATIO,
    },
    "CIRCUIT BREAKER ACTIVATED — rate adjustments paused",
  );

  return {
    active: true,
    ratio: latestRatio,
    consecutiveDays: CIRCUIT_BREAKER_DAYS,
  };
}

/**
 * Record a daily faucet/sink ratio snapshot in Redis for circuit breaker tracking.
 * Keeps only the last CIRCUIT_BREAKER_MAX_ENTRIES (30) entries.
 */
export async function recordDailyRatio(
  redis: Redis,
  ratio: number,
): Promise<void> {
  const timestamp = Date.now();
  const displayRatio = Number.isFinite(ratio) ? ratio : 999.99;

  // Add to sorted set with timestamp as score
  await redis.zadd(
    CIRCUIT_BREAKER_SORTED_SET,
    timestamp,
    String(displayRatio),
  );

  // Trim to keep only last CIRCUIT_BREAKER_MAX_ENTRIES
  await redis.zremrangebyrank(
    CIRCUIT_BREAKER_SORTED_SET,
    0,
    -(CIRCUIT_BREAKER_MAX_ENTRIES + 1),
  );
}
