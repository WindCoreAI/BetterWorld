/**
 * Fraud Scoring Worker (Sprint 9: Reputation & Impact)
 *
 * BullMQ worker triggered after evidence submission.
 * Runs pHash, velocity, and statistical checks.
 */
import { evidencePhashes } from "@betterworld/db";
import { QUEUE_NAMES, PHASH_THRESHOLDS, FRAUD_SCORE_DELTAS } from "@betterworld/shared";
import { Worker, type Job } from "bullmq";
import { desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import Redis from "ioredis";
import pino from "pino";

import { initDb, getDb, getRedis, initRedis } from "../lib/container.js";
import {
  checkVelocity,
  analyzeGpsVariance,
  analyzeApprovalRate,
  analyzeTimingPatterns,
  incrementFraudScore,
} from "../lib/fraud-detection.js";
import { calculatePhash, hammingDistance } from "../lib/phash.js";

const logger = pino({ name: "fraud-scoring-worker" });

export interface FraudScoringJobData {
  evidenceId: string;
  humanId: string;
  imageBuffer?: string; // Base64-encoded image buffer
}

/**
 * Process fraud scoring for a single evidence submission.
 */
// eslint-disable-next-line complexity
export async function processFraudScoring(
  jobData: FraudScoringJobData,
  dbOverride?: PostgresJsDatabase | null,
  redisOverride?: Redis | null,
): Promise<void> {
  const db = dbOverride ?? getDb();
  if (!db) throw new Error("Database not initialized");

  const redis = redisOverride ?? getRedis();
  const { evidenceId, humanId } = jobData;

  logger.info({ evidenceId, humanId }, "Starting fraud scoring");

  // 1. pHash duplicate detection (if image available)
  if (jobData.imageBuffer) {
    try {
      const imageBuffer = Buffer.from(jobData.imageBuffer, "base64");
      const phash = await calculatePhash(imageBuffer);

      // Store pHash
      await db
        .insert(evidencePhashes)
        .values({ evidenceId, humanId, phash })
        .onConflictDoNothing();

      // Compare against human's recent hashes
      const recentHashes = await db
        .select({ phash: evidencePhashes.phash, evidenceId: evidencePhashes.evidenceId })
        .from(evidencePhashes)
        .where(eq(evidencePhashes.humanId, humanId))
        .orderBy(desc(evidencePhashes.createdAt))
        .limit(50);

      for (const recent of recentHashes) {
        if (recent.evidenceId === evidenceId) continue;

        const distance = hammingDistance(phash, recent.phash);

        if (distance <= PHASH_THRESHOLDS.duplicate) {
          const delta =
            distance === 0
              ? FRAUD_SCORE_DELTAS.phashExactDuplicate
              : FRAUD_SCORE_DELTAS.phashNearDuplicate;

          await incrementFraudScore(
            db,
            humanId,
            distance === 0 ? "phash_exact_duplicate" : "phash_near_duplicate",
            delta,
            {
              matchedEvidenceId: recent.evidenceId,
              hammingDistance: distance,
            },
            evidenceId,
          );
          break; // Only report worst match
        } else if (distance <= PHASH_THRESHOLDS.suspicious) {
          await incrementFraudScore(
            db,
            humanId,
            "phash_suspicious",
            FRAUD_SCORE_DELTAS.phashSuspicious,
            {
              matchedEvidenceId: recent.evidenceId,
              hammingDistance: distance,
            },
            evidenceId,
          );
          break;
        }
      }
    } catch (err) {
      logger.warn({ evidenceId, error: (err as Error).message }, "pHash calculation failed");
    }
  }

  // 2. Velocity checks
  if (redis) {
    try {
      const velocityResults = await checkVelocity(redis, humanId);
      for (const result of velocityResults) {
        if (result.flagged) {
          await incrementFraudScore(
            db,
            humanId,
            `velocity_${result.window}_burst`,
            result.scoreDelta,
            {
              submissionCount: result.count,
              window: result.window,
            },
            evidenceId,
          );
        }
      }
    } catch (err) {
      logger.warn({ humanId, error: (err as Error).message }, "Velocity check failed");
    }
  }

  // 3. Statistical profiling
  try {
    const [gpsResult, approvalResult, timingResult] = await Promise.all([
      analyzeGpsVariance(db, humanId),
      analyzeApprovalRate(db, humanId),
      analyzeTimingPatterns(db, humanId),
    ]);

    for (const result of [gpsResult, approvalResult, timingResult]) {
      if (result?.flagged) {
        await incrementFraudScore(
          db,
          humanId,
          result.type,
          result.scoreDelta,
          result.details,
          evidenceId,
        );
      }
    }
  } catch (err) {
    logger.warn({ humanId, error: (err as Error).message }, "Statistical profiling failed");
  }

  logger.info({ evidenceId, humanId }, "Fraud scoring complete");
}

// ────────────────── Worker Initialization ──────────────────

export function createFraudScoringWorker(): Worker<FraudScoringJobData> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("REDIS_URL environment variable is required");

  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  initRedis(redisUrl);

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL environment variable is required");
  initDb(databaseUrl);

  const worker = new Worker<FraudScoringJobData>(
    QUEUE_NAMES.FRAUD_SCORING,
    async (job: Job<FraudScoringJobData>) => {
      await processFraudScoring(job.data);
    },
    {
      connection,
      concurrency: 3,
    },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Fraud scoring job completed");
  });

  worker.on("failed", (job, err) => {
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 3;

    if (attemptsMade >= maxAttempts) {
      logger.error(
        { jobId: job?.id, attemptsMade, error: err.message },
        "DEAD LETTER: Fraud scoring job exhausted all retries",
      );
    } else {
      logger.warn(
        { jobId: job?.id, attemptsMade, error: err.message },
        "Fraud scoring job failed, will retry",
      );
    }
  });

  worker.on("error", (err) => {
    logger.error({ error: err.message }, "Fraud scoring worker error");
  });

  const shutdown = async () => {
    logger.info("Shutting down fraud scoring worker...");
    await worker.close();
    await connection.quit();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info("Fraud scoring worker started");
  return worker;
}

// Start worker if running as standalone script
if (process.argv[1]?.includes("fraud-scoring")) {
  createFraudScoringWorker();
}
