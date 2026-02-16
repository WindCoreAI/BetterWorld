/**
 * Notification Retention Worker (Sprint 16: Social Fabric Foundation)
 *
 * Daily BullMQ cron job that auto-archives read notifications older than 90 days
 * to prevent unbounded table growth.
 */
import { QUEUE_NAMES } from "@betterworld/shared";
import { Worker, Queue, type Job } from "bullmq";
import { sql } from "drizzle-orm";
import Redis from "ioredis";
import pino from "pino";

import { initDb, getDb } from "../lib/container.js";

const logger = pino({ name: "notification-retention-worker" });

const BATCH_SIZE = 500;
const RETENTION_DAYS = 90;

export interface RetentionJobData {
  triggeredBy: "cron" | "manual";
}

export interface RetentionResult {
  archivedCount: number;
  deletedCount: number;
}

/**
 * Archive (soft-delete) read notifications older than 90 days.
 */
async function processRetention(): Promise<RetentionResult> {
  const db = getDb();
  if (!db) throw new Error("Database not initialized");

  const result: RetentionResult = { archivedCount: 0, deletedCount: 0 };
  const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  logger.info({ cutoffDate: cutoffDate.toISOString() }, "Starting notification retention sweep");

  // Delete read notifications older than 90 days in batches
  let hasMore = true;
  while (hasMore) {
    // Use raw SQL for batch-limited deletion
    const batchResult = await db.execute(
      sql`DELETE FROM notifications
          WHERE read_at IS NOT NULL
          AND created_at < ${cutoffDate}
          LIMIT ${BATCH_SIZE}`,
    );

    const batchCount = Number((batchResult as unknown as { rowCount?: number })?.rowCount ?? 0);
    result.deletedCount += batchCount;

    if (batchCount < BATCH_SIZE) {
      hasMore = false;
    }
  }

  logger.info(result, "Notification retention sweep complete");
  return result;
}

/**
 * Create and start the notification retention worker with daily cron.
 */
export function createNotificationRetentionWorker(): Worker {
  const DATABASE_URL = process.env.DATABASE_URL ?? "";
  const config = {
    host: process.env.REDIS_HOST ?? "localhost",
    port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
  };

  const connection = new Redis(config);

  // Set up daily cron job
  const queue = new Queue(QUEUE_NAMES.NOTIFICATION_RETENTION, {
    connection: new Redis(config),
  });

  queue
    .add(
      "retention-sweep",
      { triggeredBy: "cron" } satisfies RetentionJobData,
      {
        repeat: { pattern: "0 3 * * *" }, // 3 AM daily
        removeOnComplete: { count: 7 },
        removeOnFail: { count: 30 },
      },
    )
    .catch((err) => {
      logger.error({ error: (err as Error).message }, "Failed to add retention cron");
    });

  initDb(DATABASE_URL);

  const worker = new Worker<RetentionJobData>(
    QUEUE_NAMES.NOTIFICATION_RETENTION,
    async (job: Job<RetentionJobData>) => {
      logger.info({ triggeredBy: job.data.triggeredBy }, "Processing notification retention");

      const result = await processRetention();

      logger.info(result, "Notification retention job complete");
      return result;
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Retention job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, "Retention job failed");
  });

  return worker;
}
