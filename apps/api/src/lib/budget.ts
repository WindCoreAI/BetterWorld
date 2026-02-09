import pino from "pino";

import { getRedis } from "./container.js";

const logger = pino({ name: "budget" });

const DEFAULT_DAILY_CAP_CENTS = 1333; // $13.33/day = ~$400/month
const DEFAULT_ALERT_THRESHOLD_PCT = 80;

function getDailyCapCents(): number {
  return parseInt(process.env.AI_DAILY_BUDGET_CAP_CENTS || String(DEFAULT_DAILY_CAP_CENTS), 10);
}

function getAlertThresholdPct(): number {
  return parseInt(process.env.AI_BUDGET_ALERT_THRESHOLD_PCT || String(DEFAULT_ALERT_THRESHOLD_PCT), 10);
}

function getDailyKey(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD in UTC
  return `ai_cost:daily:${date}`;
}

function getHourlyKey(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const hour = now.getUTCHours().toString().padStart(2, "0");
  return `ai_cost:hourly:${date}:${hour}`;
}

/**
 * Check if the daily AI budget has remaining capacity.
 * Returns true if under cap, false if at or over.
 */
export async function checkBudgetAvailable(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true; // If Redis unavailable, allow (fail open)

  const dailyKey = getDailyKey();
  const current = await redis.get(dailyKey);
  const totalCents = current ? parseInt(current, 10) : 0;
  const capCents = getDailyCapCents();

  return totalCents < capCents;
}

/**
 * Record an AI API call cost and check alert thresholds.
 */
export async function recordAiCost(costCents: number): Promise<{ total: number; percentUsed: number }> {
  const redis = getRedis();
  if (!redis) return { total: 0, percentUsed: 0 };

  const dailyKey = getDailyKey();
  const hourlyKey = getHourlyKey();
  const capCents = getDailyCapCents();
  const alertPct = getAlertThresholdPct();

  // Atomic increment on daily key
  const total = await redis.incrby(dailyKey, costCents);

  // Set TTL if new key (48h for daily)
  const ttl = await redis.ttl(dailyKey);
  if (ttl === -1) {
    await redis.expire(dailyKey, 48 * 60 * 60);
  }

  // Increment hourly key
  await redis.incrby(hourlyKey, costCents);
  const hourlyTtl = await redis.ttl(hourlyKey);
  if (hourlyTtl === -1) {
    await redis.expire(hourlyKey, 25 * 60 * 60);
  }

  const percentUsed = (total / capCents) * 100;

  // Alert logging at thresholds
  if (percentUsed >= 100) {
    logger.error(
      { alertType: "budget", percentUsed: Math.round(percentUsed), dailyCapCents: capCents, totalCents: total },
      "BUDGET CAP REACHED — all new evaluations will bypass Layer B",
    );
  } else if (percentUsed >= alertPct) {
    logger.warn(
      { alertType: "budget", percentUsed: Math.round(percentUsed), dailyCapCents: capCents, totalCents: total },
      "Budget alert threshold reached",
    );
  } else if (percentUsed >= 50) {
    logger.info(
      { alertType: "budget", percentUsed: Math.round(percentUsed), dailyCapCents: capCents, totalCents: total },
      "Budget 50% usage",
    );
  }

  return { total, percentUsed };
}

/**
 * Get current daily usage for monitoring.
 */
export async function getDailyUsage(): Promise<{ totalCents: number; capCents: number; percentUsed: number }> {
  const redis = getRedis();
  const capCents = getDailyCapCents();

  if (!redis) return { totalCents: 0, capCents, percentUsed: 0 };

  const dailyKey = getDailyKey();
  const current = await redis.get(dailyKey);
  const totalCents = current ? parseInt(current, 10) : 0;
  const percentUsed = (totalCents / capCents) * 100;

  return { totalCents, capCents, percentUsed };
}
