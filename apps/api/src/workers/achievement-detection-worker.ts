/**
 * Achievement Detection Worker (Sprint 18: Cooperative Depth & Governance — US10)
 *
 * Weekly cron (Sun 3 AM UTC): scans for cooperative achievements.
 * Detects cross-city bridges, domain sweeps, first responders, etc.
 */
import { Worker, Queue, type Job } from "bullmq";
import Redis from "ioredis";
import pino from "pino";

import { initDb, getDb } from "../lib/container.js";
import { CooperativeAchievementsService } from "../services/cooperative-achievements.js";

const logger = pino({ name: "achievement-detection-worker" });

const QUEUE_NAME = "achievement-detection";

export interface AchievementDetectionJobData {
  type: "weekly_scan";
}

async function processWeeklyScan(): Promise<{ detected: number }> {
  const db = getDb();
  if (!db) throw new Error("Database not initialized");

  const service = new CooperativeAchievementsService(db);
  return service.detectAll();
}

export function createAchievementDetectionWorker(): Worker {
  const DATABASE_URL = process.env.DATABASE_URL ?? "";
  initDb(DATABASE_URL);

  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

  const worker = new Worker<AchievementDetectionJobData>(
    QUEUE_NAME,
    async (job: Job<AchievementDetectionJobData>) => {
      logger.info({ jobId: job.id, type: job.data.type }, "Processing achievement detection");

      if (job.data.type === "weekly_scan") {
        const result = await processWeeklyScan();
        logger.info(result, "Achievement detection complete");
        return result;
      }

      logger.warn({ type: job.data.type }, "Unknown job type");
    },
    {
      connection,
      concurrency: 1,
      limiter: { max: 1, duration: 60_000 },
    },
  );

  // Weekly cron: Sunday 3 AM UTC
  const queue = new Queue(QUEUE_NAME, { connection });
  queue
    .upsertJobScheduler(
      "achievement-detection-weekly",
      { pattern: "0 3 * * 0" },
      {
        name: "achievement-detection-weekly",
        data: { type: "weekly_scan" },
        opts: {
          removeOnComplete: { count: 4 },
          removeOnFail: { count: 12 },
          attempts: 2,
          backoff: { type: "exponential", delay: 30_000 },
        },
      },
    )
    .catch((err) => {
      logger.error({ error: (err as Error).message }, "Failed to register repeatable job");
    });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Achievement detection job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, error: err.message },
      "Achievement detection job failed",
    );
  });

  logger.info("Achievement detection worker started");
  return worker;
}
