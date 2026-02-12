/**
 * Evaluation Timeout Worker (Sprint 11 — T011)
 *
 * BullMQ repeating job (every 60s) that:
 * 1. Expires stale evaluations past their expiry time
 * 2. Creates escalated consensus for quorum timeout
 * 3. Resets daily evaluation counts once per day
 */
import { consensusResults, peerEvaluations } from "@betterworld/db";
import { QUEUE_NAMES } from "@betterworld/shared";
import { Queue, Worker } from "bullmq";
import { and, eq, sql, lt, count } from "drizzle-orm";
import Redis from "ioredis";
import pino from "pino";

import { initDb, getDb } from "../lib/container.js";

const logger = pino({ name: "evaluation-timeout" });

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://betterworld:betterworld_dev@localhost:5432/betterworld";

/**
 * Create the evaluation timeout BullMQ worker.
 */
export function createEvaluationTimeoutWorker(): Worker {
  const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

  initDb(DATABASE_URL);

  // Create the queue and add the repeating job
  const queue = new Queue(QUEUE_NAMES.EVALUATION_TIMEOUT, { connection: connection.duplicate() });
  queue.upsertJobScheduler(
    "evaluation-timeout-scheduler",
    { every: 60_000 }, // every 60 seconds
    { data: {} },
  ).catch((err) => {
    logger.error({ error: (err as Error).message }, "Failed to set up evaluation timeout scheduler");
  });

  const worker = new Worker(
    QUEUE_NAMES.EVALUATION_TIMEOUT,
    async () => {
      const db = getDb();
      if (!db) {
        logger.warn("Database not available, skipping timeout check");
        return;
      }

      // 1. Find and expire stale evaluations
      const expired = await db
        .update(peerEvaluations)
        .set({ status: "expired" })
        .where(
          and(
            eq(peerEvaluations.status, "pending"),
            lt(peerEvaluations.expiresAt, new Date()),
          ),
        )
        .returning({
          submissionId: peerEvaluations.submissionId,
          submissionType: peerEvaluations.submissionType,
        });

      if (expired.length > 0) {
        logger.info({ expiredCount: expired.length }, "Expired stale evaluations");
      }

      // 2. Check for quorum timeout on affected submissions
      const affectedSubmissions = new Map<string, string>();
      for (const { submissionId, submissionType } of expired) {
        const key = `${submissionId}:${submissionType}`;
        if (!affectedSubmissions.has(key)) {
          affectedSubmissions.set(key, submissionType);
        }
      }

      for (const [key] of affectedSubmissions) {
        const parts = key.split(":");
        const submissionId = parts[0]!;
        const submissionType = parts[1]!;

        // Check if there are still pending evaluations
        const [pendingResult] = await db
          .select({ count: count() })
          .from(peerEvaluations)
          .where(
            and(
              eq(peerEvaluations.submissionId, submissionId),
              eq(peerEvaluations.submissionType, submissionType as "problem" | "solution" | "debate" | "mission"),
              eq(peerEvaluations.status, "pending"),
            ),
          );

        const pendingCount = Number(pendingResult?.count ?? 0);

        // Check if quorum was met
        const [completedResult] = await db
          .select({ count: count() })
          .from(peerEvaluations)
          .where(
            and(
              eq(peerEvaluations.submissionId, submissionId),
              eq(peerEvaluations.submissionType, submissionType as "problem" | "solution" | "debate" | "mission"),
              eq(peerEvaluations.status, "completed"),
            ),
          );

        const completedCount = Number(completedResult?.count ?? 0);

        // If no pending and quorum not met, create escalated consensus
        if (pendingCount === 0 && completedCount < 3) {
          // Check if consensus already exists
          const [existing] = await db
            .select({ id: consensusResults.id })
            .from(consensusResults)
            .where(
              and(
                eq(consensusResults.submissionId, submissionId),
                eq(consensusResults.submissionType, submissionType as "problem" | "solution" | "debate" | "mission"),
              ),
            )
            .limit(1);

          if (!existing) {
            await db
              .insert(consensusResults)
              .values({
                submissionId,
                submissionType: submissionType as "problem" | "solution" | "debate" | "mission",
                decision: "escalated",
                confidence: "0.00",
                quorumSize: 0,
                responsesReceived: completedCount,
                weightedApprove: "0.0000",
                weightedReject: "0.0000",
                weightedEscalate: "0.0000",
                escalationReason: "quorum_timeout",
              })
              .onConflictDoNothing();

            logger.info(
              { submissionId, submissionType, completedCount },
              "Quorum timeout — created escalated consensus",
            );
          }
        }
      }

      // 3. Daily reset: reset daily_evaluation_count for validators
      const resetResult = await db.execute(sql`
        UPDATE validator_pool
        SET daily_evaluation_count = 0, daily_count_reset_at = now()
        WHERE daily_count_reset_at IS NULL
           OR daily_count_reset_at < date_trunc('day', now() AT TIME ZONE 'UTC')
      `);

      const resetCount = (resetResult as unknown[]).length;
      if (resetCount > 0) {
        logger.info({ resetCount }, "Daily evaluation count reset");
      }
    },
    { connection },
  );

  worker.on("completed", () => {
    // Quiet — runs every 60s
  });

  worker.on("failed", (job, err) => {
    logger.error({ error: err.message }, "Evaluation timeout job failed");
  });

  worker.on("error", (err) => {
    logger.error({ error: err.message }, "Worker error");
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down evaluation timeout worker...");
    await worker.close();
    await queue.close();
    await connection.quit();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info("Evaluation timeout worker started (60s interval)");

  return worker;
}

// Start worker if running as standalone script
if (process.argv[1]?.includes("evaluation-timeout")) {
  createEvaluationTimeoutWorker();
}
