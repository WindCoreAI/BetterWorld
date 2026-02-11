/**
 * Reputation Decay Worker (Sprint 9: Reputation & Impact)
 *
 * Daily BullMQ cron job that applies decay to inactive humans
 * and checks streak breaks.
 */
import { reputationScores, streaks } from "@betterworld/db";
import { QUEUE_NAMES } from "@betterworld/shared";
import { Worker, type Job } from "bullmq";
import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import Redis from "ioredis";
import pino from "pino";

import { initDb, getDb } from "../lib/container.js";
import { applyDecay } from "../lib/reputation-engine.js";
import { breakStreak } from "../lib/streak-tracker.js";

const logger = pino({ name: "reputation-decay-worker" });

const BATCH_SIZE = 100;

export interface DecayJobData {
  triggeredBy: "cron" | "manual";
}

export interface DecayResult {
  processedCount: number;
  decayedCount: number;
  streaksBrokenCount: number;
}

/**
 * Process reputation decay for all inactive humans.
 */
export async function processReputationDecay(
  dbOverride?: PostgresJsDatabase | null,
): Promise<DecayResult> {
  const db = dbOverride ?? getDb();
  if (!db) throw new Error("Database not initialized");

  const result: DecayResult = {
    processedCount: 0,
    decayedCount: 0,
    streaksBrokenCount: 0,
  };

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  logger.info("Starting reputation decay sweep");

  // Process inactive humans in batches
  let hasMore = true;
  let offset = 0;

  while (hasMore) {
    const inactiveHumans = await db
      .select({ humanId: reputationScores.humanId })
      .from(reputationScores)
      .where(
        and(
          lt(reputationScores.lastActivityAt, sevenDaysAgo),
          sql`${reputationScores.totalScore} > 0`,
        ),
      )
      .limit(BATCH_SIZE)
      .offset(offset);

    if (inactiveHumans.length === 0) {
      hasMore = false;
      break;
    }

    for (const { humanId } of inactiveHumans) {
      result.processedCount++;
      const { decayed } = await applyDecay(db, humanId);
      if (decayed) result.decayedCount++;
    }

    offset += BATCH_SIZE;
    if (inactiveHumans.length < BATCH_SIZE) hasMore = false;
  }

  // Check and break inactive streaks
  const _today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const staleStreaks = await db
    .select({ humanId: streaks.humanId, freezeActive: streaks.freezeActive })
    .from(streaks)
    .where(
      and(
        sql`${streaks.currentStreak} > 0`,
        isNotNull(streaks.lastActiveDate),
        lt(streaks.lastActiveDate, yesterday),
      ),
    )
    .limit(BATCH_SIZE * 10);

  for (const row of staleStreaks) {
    if (row.freezeActive) {
      // Consume freeze
      await db
        .update(streaks)
        .set({
          freezeActive: false,
          freezeAvailable: false,
          freezeLastUsedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(streaks.humanId, row.humanId));
      logger.info({ humanId: row.humanId }, "Streak freeze consumed by decay worker");
    } else {
      await breakStreak(db, row.humanId);
      result.streaksBrokenCount++;
    }
  }

  logger.info(result, "Reputation decay sweep complete");
  return result;
}

// ────────────────── Worker Initialization ──────────────────

export function createReputationDecayWorker(): Worker<DecayJobData> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("REDIS_URL environment variable is required");

  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL environment variable is required");
  initDb(databaseUrl);

  const worker = new Worker<DecayJobData>(
    QUEUE_NAMES.REPUTATION_DECAY,
    async (_job: Job<DecayJobData>) => {
      return processReputationDecay();
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Reputation decay job completed");
  });

  worker.on("failed", (job, err) => {
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 3;

    if (attemptsMade >= maxAttempts) {
      logger.error(
        { jobId: job?.id, attemptsMade, error: err.message },
        "DEAD LETTER: Reputation decay job exhausted all retries",
      );
    } else {
      logger.warn(
        { jobId: job?.id, attemptsMade, error: err.message },
        "Reputation decay job failed, will retry",
      );
    }
  });

  worker.on("error", (err) => {
    logger.error({ error: err.message }, "Reputation decay worker error");
  });

  const shutdown = async () => {
    logger.info("Shutting down reputation decay worker...");
    await worker.close();
    await connection.quit();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info({ cronSchedule: "0 0 * * *" }, "Reputation decay worker started");
  return worker;
}

// Start worker if running as standalone script
if (process.argv[1]?.includes("reputation-decay")) {
  createReputationDecayWorker();
}
