/**
 * Feed Event Processor Worker (Sprint 18: Cooperative Depth & Governance — US11)
 *
 * Every 15 minutes: prunes feed events older than 30 days.
 */
import { Worker, Queue, type Job } from "bullmq";
import Redis from "ioredis";
import pino from "pino";

import { initDb, getDb } from "../lib/container.js";
import { FeedScoringService } from "../services/feed-scoring.js";

const logger = pino({ name: "feed-event-processor-worker" });

const QUEUE_NAME = "feed-event-processor";

export interface FeedEventProcessorJobData {
  type: "prune";
}

async function processPrune(): Promise<{ deleted: number }> {
  const db = getDb();
  if (!db) throw new Error("Database not initialized");

  const service = new FeedScoringService(db);
  return service.pruneOldEvents();
}

export function createFeedEventProcessorWorker(): Worker {
  const DATABASE_URL = process.env.DATABASE_URL ?? "";
  initDb(DATABASE_URL);

  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

  const worker = new Worker<FeedEventProcessorJobData>(
    QUEUE_NAME,
    async (job: Job<FeedEventProcessorJobData>) => {
      logger.info({ jobId: job.id, type: job.data.type }, "Processing feed event task");

      if (job.data.type === "prune") {
        const result = await processPrune();
        logger.info(result, "Feed event pruning complete");
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

  // Every 15 minutes
  const queue = new Queue(QUEUE_NAME, { connection });
  queue
    .upsertJobScheduler(
      "feed-prune-schedule",
      { pattern: "*/15 * * * *" },
      {
        name: "feed-prune",
        data: { type: "prune" },
        opts: {
          removeOnComplete: { count: 48 },
          removeOnFail: { count: 48 },
          attempts: 2,
          backoff: { type: "exponential", delay: 30_000 },
        },
      },
    )
    .catch((err) => {
      logger.error({ error: (err as Error).message }, "Failed to register repeatable job");
    });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Feed event processor job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, error: err.message },
      "Feed event processor job failed",
    );
  });

  logger.info("Feed event processor worker started");
  return worker;
}
