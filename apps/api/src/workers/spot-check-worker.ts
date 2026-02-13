/**
 * Spot Check Worker (Sprint 12 — T046)
 *
 * BullMQ worker that receives submissions selected for spot checking,
 * runs Layer B evaluation independently, compares with peer decision,
 * and records the result. Disagreements are flagged for admin review.
 */
import { QUEUE_NAMES } from "@betterworld/shared";
import { Worker, type Job } from "bullmq";
import Redis from "ioredis";
import pino from "pino";

import { initDb, getDb } from "../lib/container.js";
import { recordSpotCheck } from "../services/spot-check.service.js";

const logger = pino({ name: "spot-check-worker" });

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://betterworld:betterworld_dev@localhost:5432/betterworld";

export interface SpotCheckJobData {
  submissionId: string;
  submissionType: string;
  content: string;
  domain: string;
  peerDecision: string;
  peerConfidence: number;
}

export function createSpotCheckWorker(): Worker<SpotCheckJobData> {
  const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

  initDb(DATABASE_URL);

  const worker = new Worker<SpotCheckJobData>(
    QUEUE_NAMES.SPOT_CHECK,
    async (job: Job<SpotCheckJobData>) => {
      const { submissionId, submissionType, content, domain: _domain, peerDecision, peerConfidence } = job.data;

      logger.info(
        { submissionId, submissionType, peerDecision, jobId: job.id },
        "Processing spot check",
      );

      const db = getDb();
      if (!db) {
        throw new Error("Database not initialized");
      }

      // Run Layer B evaluation independently
      let layerBDecision = "approved";
      let layerBScore = 0.85;

      try {
        const { evaluateLayerB } = await import("@betterworld/guardrails");
        const layerBResult = await evaluateLayerB(content, submissionType as never);
        layerBDecision = layerBResult.decision;
        layerBScore = layerBResult.alignmentScore;
      } catch (err) {
        // If Layer B fails, log and skip (don't fail the job)
        logger.warn(
          { submissionId, error: (err as Error).message },
          "Layer B evaluation failed for spot check — skipping",
        );
        return { skipped: true, reason: "layer_b_failure" };
      }

      // Record spot check
      const result = await recordSpotCheck(
        db,
        submissionId,
        submissionType,
        peerDecision,
        peerConfidence,
        layerBDecision,
        layerBScore,
      );

      if (!result.agrees) {
        logger.warn(
          {
            submissionId,
            submissionType,
            peerDecision,
            layerBDecision,
            disagreementType: result.disagreementType,
            spotCheckId: result.id,
          },
          "SPOT CHECK DISAGREEMENT — flagged for admin review",
        );
      } else {
        logger.info(
          { submissionId, spotCheckId: result.id },
          "Spot check agrees with peer decision",
        );
      }

      return {
        spotCheckId: result.id,
        agrees: result.agrees,
        disagreementType: result.disagreementType,
      };
    },
    {
      connection,
      concurrency: 3,
    },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, submissionId: job.data.submissionId }, "Spot check job completed");
  });

  worker.on("failed", (job, err) => {
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 3;

    if (attemptsMade >= maxAttempts) {
      logger.error(
        { jobId: job?.id, submissionId: job?.data?.submissionId, attemptsMade, error: err.message },
        "DEAD LETTER: Spot check job exhausted all retries",
      );
    } else {
      logger.warn(
        { jobId: job?.id, submissionId: job?.data?.submissionId, attemptsMade, error: err.message },
        "Spot check job failed, will retry",
      );
    }
  });

  worker.on("error", (err) => {
    logger.error({ error: err.message }, "Worker error");
  });

  const shutdown = async () => {
    logger.info("Shutting down spot check worker...");
    await worker.close();
    await connection.quit();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info("Spot check worker started");

  return worker;
}

if (process.argv[1]?.includes("spot-check")) {
  createSpotCheckWorker();
}
