/**
 * Rate Adjustment Worker (Sprint 13 — Phase 3 Integration)
 *
 * BullMQ repeatable worker that runs weekly (Sunday midnight UTC)
 * to automatically adjust validation reward and submission cost multipliers
 * based on the faucet/sink ratio of the agent credit economy.
 *
 * Includes circuit breaker protection: if the ratio exceeds 2.0 for 3
 * consecutive days, rate adjustments are paused and admins are alerted.
 */
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import pino from "pino";

import { initDb, getDb } from "../lib/container.js";
import { getFlag } from "../services/feature-flags.js";
import {
  calculateFaucetSinkRatio,
  applyRateAdjustment,
  checkCircuitBreaker,
  recordDailyRatio,
} from "../services/rate-adjustment.service.js";

const logger = pino({ name: "rate-adjustment-worker" });

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://betterworld:betterworld_dev@localhost:5432/betterworld";
const QUEUE_NAME = "rate-adjustment";

export function createRateAdjustmentWorker(): Worker {
  const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

  initDb(DATABASE_URL);

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      logger.info("Starting rate adjustment cycle...");

      const db = getDb();
      if (!db) {
        throw new Error("Database not initialized");
      }

      // 1. Check if dynamic rate adjustment is enabled
      const enabled = await getFlag(connection, "DYNAMIC_RATE_ADJUSTMENT_ENABLED");
      if (!enabled) {
        logger.info("Dynamic rate adjustment disabled — skipping");
        return { skipped: true, reason: "disabled" };
      }

      // 2. Check if rate adjustment is paused (circuit breaker)
      const paused = await getFlag(connection, "RATE_ADJUSTMENT_PAUSED");
      if (paused) {
        logger.warn("Rate adjustment paused (circuit breaker active) — skipping");
        return { skipped: true, reason: "paused" };
      }

      // 3. Calculate faucet/sink ratio
      const ratio = await calculateFaucetSinkRatio(db);
      logger.info({ ratio: Number.isFinite(ratio) ? ratio : "Infinity" }, "Faucet/sink ratio calculated");

      // 4. Record daily ratio for circuit breaker tracking
      await recordDailyRatio(connection, ratio);

      // 5. Check circuit breaker
      const cbStatus = await checkCircuitBreaker(db, connection);
      if (cbStatus.active) {
        logger.warn(
          { consecutiveDays: cbStatus.consecutiveDays, ratio: cbStatus.ratio },
          "Circuit breaker activated — rate adjustments paused",
        );
        return {
          skipped: false,
          circuitBreakerActivated: true,
          ratio: cbStatus.ratio,
          consecutiveDays: cbStatus.consecutiveDays,
        };
      }

      // 6. Apply rate adjustment
      const result = await applyRateAdjustment(db, connection, ratio);

      logger.info(
        {
          adjustmentType: result.adjustmentType,
          faucetSinkRatio: result.faucetSinkRatio,
          rewardMultiplier: `${result.rewardMultiplierBefore} -> ${result.rewardMultiplierAfter}`,
          costMultiplier: `${result.costMultiplierBefore} -> ${result.costMultiplierAfter}`,
          changePercent: result.changePercent,
        },
        "Rate adjustment cycle complete",
      );

      return {
        skipped: false,
        adjustmentType: result.adjustmentType,
        faucetSinkRatio: result.faucetSinkRatio,
        changePercent: result.changePercent,
      };
    },
    {
      connection,
      concurrency: 1,
    },
  );

  // Schedule repeatable job (weekly — Sunday midnight UTC)
  const schedulerConnection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  const schedulerQueue = new Queue(QUEUE_NAME, { connection: schedulerConnection });
  // FR-009: Use deterministic jobId based on ISO year-week to prevent duplicate runs
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
  const isoYearWeek = `${now.getFullYear()}-W${String(weekNumber).padStart(2, "0")}`;

  schedulerQueue
    .add(
      "weekly-adjustment",
      {},
      {
        jobId: `rate-adj-${isoYearWeek}`,
        repeat: { pattern: "0 0 * * 0" }, // Sunday midnight UTC
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 5 },
      },
    )
    .catch((err) => {
      logger.error(
        { error: (err as Error).message },
        "Failed to schedule repeatable job",
      );
    });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Rate adjustment job completed");
  });

  worker.on("failed", (job, err) => {
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 3;

    if (attemptsMade >= maxAttempts) {
      logger.error(
        { jobId: job?.id, attemptsMade, maxAttempts, error: err.message },
        "DEAD LETTER: Rate adjustment job exhausted all retries",
      );
    } else {
      logger.warn(
        { jobId: job?.id, attemptsMade, error: err.message },
        "Rate adjustment job failed, will retry",
      );
    }
  });

  worker.on("error", (err) => {
    logger.error({ error: err.message }, "Worker error");
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down rate adjustment worker...");
    await worker.close();
    await schedulerQueue.close();
    await connection.quit();
    await schedulerConnection.quit();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info("Rate adjustment worker started (weekly schedule — Sunday midnight UTC)");

  return worker;
}

// Start worker if running as standalone script
if (process.argv[1]?.includes("rate-adjustment")) {
  createRateAdjustmentWorker();
}
