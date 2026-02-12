/**
 * Economic Health Worker (Sprint 12 — T035)
 *
 * BullMQ repeatable worker that runs hourly to compute economic health snapshots,
 * persist them to the economic_health_snapshots table, and log alerts when
 * thresholds are breached (faucet/sink outside 0.70–1.30, hardship rate > 15%).
 */
import { economicHealthSnapshots } from "@betterworld/db";
import { Worker } from "bullmq";
import Redis from "ioredis";
import pino from "pino";

import { initDb, getDb } from "../lib/container.js";
import { computeSnapshot } from "../services/economic-health.service.js";

const logger = pino({ name: "economic-health-worker" });

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://betterworld:betterworld_dev@localhost:5432/betterworld";
const QUEUE_NAME = "economic-health";

export function createEconomicHealthWorker(): Worker {
  const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

  initDb(DATABASE_URL);

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      logger.info("Computing economic health snapshot...");

      const db = getDb();
      if (!db) {
        throw new Error("Database not initialized");
      }

      const snapshot = await computeSnapshot(db);

      // Persist snapshot
      await db.insert(economicHealthSnapshots).values({
        periodStart: snapshot.periodStart,
        periodEnd: snapshot.periodEnd,
        totalFaucet: snapshot.faucetTotal,
        totalSink: snapshot.sinkTotal,
        faucetSinkRatio: String(snapshot.faucetSinkRatio),
        activeAgents: snapshot.totalAgentCount,
        hardshipCount: snapshot.hardshipAgentCount,
        hardshipRate: String(snapshot.hardshipRate),
        medianBalance: String(snapshot.medianBalance),
        totalValidators: snapshot.activeValidatorCount,
        alertTriggered: snapshot.alertTriggered,
        alertDetails: snapshot.alertReasons.length > 0 ? { reasons: snapshot.alertReasons } : null,
      });

      // Log alerts at warn level
      if (snapshot.alertTriggered) {
        for (const reason of snapshot.alertReasons) {
          logger.warn({ reason }, "ECONOMIC HEALTH ALERT");
        }
      }

      logger.info(
        {
          faucetSinkRatio: snapshot.faucetSinkRatio,
          hardshipRate: snapshot.hardshipRate,
          medianBalance: snapshot.medianBalance,
          alertTriggered: snapshot.alertTriggered,
        },
        "Economic health snapshot persisted",
      );

      return { alertTriggered: snapshot.alertTriggered, alertCount: snapshot.alertReasons.length };
    },
    {
      connection,
      concurrency: 1,
    },
  );

  // Set up repeatable job (hourly) via a dedicated Queue instance
  import("bullmq").then(({ Queue }) => {
    const schedulerQueue = new Queue(QUEUE_NAME, { connection: new Redis(REDIS_URL, { maxRetriesPerRequest: null }) });
    schedulerQueue.add("economic-health-snapshot", {}, {
      repeat: { pattern: "0 * * * *" }, // every hour
      removeOnComplete: { count: 24 },
      removeOnFail: { count: 10 },
    }).catch((err) => {
      logger.error({ error: (err as Error).message }, "Failed to schedule repeatable job");
    });
  });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Economic health job completed");
  });

  worker.on("failed", (job, err) => {
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 3;

    if (attemptsMade >= maxAttempts) {
      logger.error(
        { jobId: job?.id, attemptsMade, maxAttempts, error: err.message },
        "DEAD LETTER: Economic health job exhausted all retries",
      );
    } else {
      logger.warn(
        { jobId: job?.id, attemptsMade, error: err.message },
        "Economic health job failed, will retry",
      );
    }
  });

  worker.on("error", (err) => {
    logger.error({ error: err.message }, "Worker error");
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down economic health worker...");
    await worker.close();
    await connection.quit();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info("Economic health worker started (hourly schedule)");

  return worker;
}

// Start worker if running as standalone script
if (process.argv[1]?.includes("economic-health")) {
  createEconomicHealthWorker();
}
