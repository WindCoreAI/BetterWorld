/**
 * Account Deletion Worker (Sprint 20: Security Hardening)
 *
 * Daily cron at 3AM UTC — processes expired deletion requests.
 * Uses per-item error isolation and idempotency guards.
 */
import { accountDeletionRequests } from "@betterworld/db";
import { QUEUE_NAMES } from "@betterworld/shared";
import { Queue, Worker } from "bullmq";
import { and, eq, lte } from "drizzle-orm";
import Redis from "ioredis";
import pino from "pino";

import { initDb, getDb } from "../lib/container.js";
import { processExpiredDeletion } from "../services/account-deletion.service.js";

const logger = pino({ name: "account-deletion-worker" });

export function createAccountDeletionWorker(): Worker {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("REDIS_URL environment variable is required");

  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL environment variable is required");
  initDb(databaseUrl);

  // Create a queue to schedule the repeatable cron job
  const queue = new Queue(QUEUE_NAMES.ACCOUNT_DELETION, {
    connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    },
  });

  // Schedule daily cron at 3AM UTC
  queue
    .add(
      "process-expired-deletions",
      {},
      {
        repeat: {
          pattern: "0 3 * * *", // 3AM UTC daily
        },
      },
    )
    .catch((err) => {
      logger.error({ error: (err as Error).message }, "Failed to schedule deletion cron");
    });

  const worker = new Worker(
    QUEUE_NAMES.ACCOUNT_DELETION,
    async () => {
      const db = getDb();
      if (!db) {
        throw new Error("Database not initialized");
      }

      const now = new Date();

      // Find all expired pending requests
      const expiredRequests = await db
        .select({
          id: accountDeletionRequests.id,
          humanId: accountDeletionRequests.humanId,
        })
        .from(accountDeletionRequests)
        .where(
          and(
            eq(accountDeletionRequests.status, "pending"),
            lte(accountDeletionRequests.coolingOffExpiresAt, now),
          ),
        );

      logger.info(
        { count: expiredRequests.length },
        "Processing expired deletion requests",
      );

      let processed = 0;
      let errors = 0;

      for (const request of expiredRequests) {
        try {
          await processExpiredDeletion(db, request.id);
          processed++;
          logger.info(
            { requestId: request.id },
            "Deletion request processed successfully",
          );
        } catch (err) {
          errors++;
          logger.error(
            {
              requestId: request.id,
              error: err instanceof Error ? err.message : "Unknown",
            },
            "Failed to process deletion request — will retry next run",
          );
          // Per-item error isolation: continue processing other requests
        }
      }

      logger.info(
        { processed, errors, total: expiredRequests.length },
        "Deletion batch completed",
      );
    },
    {
      connection,
      concurrency: 1, // Process sequentially — deletion is sensitive
    },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Account deletion job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, error: err.message },
      "Account deletion job failed",
    );
  });

  worker.on("error", (err) => {
    logger.error({ error: err.message }, "Account deletion worker error");
  });

  const shutdown = async () => {
    logger.info("Shutting down account deletion worker...");
    await worker.close();
    await queue.close();
    await connection.quit();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info("Account deletion worker started (daily cron at 3AM UTC)");
  return worker;
}

// Start worker if running as standalone script
if (process.argv[1]?.includes("account-deletion-worker")) {
  createAccountDeletionWorker();
}
