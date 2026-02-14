/**
 * Privacy Worker (Sprint 12 — T061)
 *
 * BullMQ worker that processes observation photos through the privacy pipeline:
 * downloads photo, strips EXIF, optionally blurs faces/plates, uploads processed
 * version, updates privacy_processing_status.
 */
import { observations } from "@betterworld/db";
import { QUEUE_NAMES } from "@betterworld/shared";
import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import Redis from "ioredis";
import pino from "pino";

import { initDb, getDb, getRedis } from "../lib/container.js";
import { uploadFile, getSignedUrl } from "../lib/storage.js";
import { getFlag } from "../services/feature-flags.js";
import { processPhoto } from "../services/privacy-pipeline.js";

const logger = pino({ name: "privacy-worker" });

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://betterworld:betterworld_dev@localhost:5432/betterworld";

export interface PrivacyJobData {
  observationId: string;
}

export function createPrivacyWorker(): Worker<PrivacyJobData> {
  const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

  initDb(DATABASE_URL);

  const worker = new Worker<PrivacyJobData>(
    QUEUE_NAMES.PRIVACY_PROCESSING,
    async (job: Job<PrivacyJobData>) => {
      const { observationId } = job.data;

      logger.info({ observationId, jobId: job.id }, "Processing privacy pipeline");

      const db = getDb();
      if (!db) throw new Error("Database not initialized");

      // Fetch observation
      const [obs] = await db
        .select({
          id: observations.id,
          mediaUrl: observations.mediaUrl,
          privacyProcessingStatus: observations.privacyProcessingStatus,
        })
        .from(observations)
        .where(eq(observations.id, observationId))
        .limit(1);

      if (!obs) {
        logger.warn({ observationId }, "Observation not found, skipping");
        return { skipped: true, reason: "not_found" };
      }

      if (obs.privacyProcessingStatus === "completed") {
        logger.info({ observationId }, "Already processed, skipping");
        return { skipped: true, reason: "already_processed" };
      }

      if (!obs.mediaUrl) {
        // No media to process — mark as completed
        await db
          .update(observations)
          .set({
            privacyProcessingStatus: "completed",
            updatedAt: new Date(),
          })
          .where(eq(observations.id, observationId));
        return { skipped: true, reason: "no_media" };
      }

      // Mark as processing
      await db
        .update(observations)
        .set({
          privacyProcessingStatus: "processing",
          updatedAt: new Date(),
        })
        .where(eq(observations.id, observationId));

      // Download photo
      let photoBuffer: Buffer;
      try {
        const signedUrl = await getSignedUrl(obs.mediaUrl, 600);
        const resp = await fetch(signedUrl);
        if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
        photoBuffer = Buffer.from(await resp.arrayBuffer());
      } catch (err) {
        logger.error(
          { observationId, error: (err as Error).message },
          "Failed to download observation media",
        );
        await db
          .update(observations)
          .set({
            privacyProcessingStatus: "quarantined",
            updatedAt: new Date(),
          })
          .where(eq(observations.id, observationId));
        return { error: "download_failed" };
      }

      // Check blur feature flag (defaults to true via Zod schema)
      let blurEnabled = true;
      try {
        const redis = getRedis();
        blurEnabled = await getFlag(redis, "PRIVACY_BLUR_ENABLED");
      } catch {
        // Default to true — fail-safe: blur PII when flag read fails
      }

      // Run privacy pipeline
      const result = await processPhoto(photoBuffer, blurEnabled);

      if (result.status === "quarantined") {
        await db
          .update(observations)
          .set({
            privacyProcessingStatus: "quarantined",
            updatedAt: new Date(),
          })
          .where(eq(observations.id, observationId));

        logger.warn(
          { observationId, reason: result.quarantineReason },
          "Observation quarantined by privacy pipeline",
        );
        return { quarantined: true, reason: result.quarantineReason };
      }

      // Upload processed photo (overwrite original path)
      try {
        await uploadFile(obs.mediaUrl, result.buffer, "image/jpeg");
      } catch (err) {
        logger.error(
          { observationId, error: (err as Error).message },
          "Failed to upload processed photo",
        );
        await db
          .update(observations)
          .set({
            privacyProcessingStatus: "quarantined",
            updatedAt: new Date(),
          })
          .where(eq(observations.id, observationId));
        return { error: "upload_failed" };
      }

      // Mark as completed
      await db
        .update(observations)
        .set({
          privacyProcessingStatus: "completed",
          updatedAt: new Date(),
        })
        .where(eq(observations.id, observationId));

      logger.info(
        {
          observationId,
          exifStripped: result.metadata.exifStripped,
          facesBlurred: result.metadata.facesBlurred,
          platesBlurred: result.metadata.platesBlurred,
        },
        "Privacy processing completed",
      );

      return {
        observationId,
        status: "completed",
        metadata: result.metadata,
      };
    },
    {
      connection,
      concurrency: 3,
    },
  );

  worker.on("completed", (job) => {
    logger.info(
      { jobId: job.id, observationId: job.data.observationId },
      "Privacy job completed",
    );
  });

  worker.on("failed", async (job, err) => {
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 3;

    if (attemptsMade >= maxAttempts) {
      // FR-008: Dead-letter handler — quarantine observation when all retries exhausted
      logger.error(
        {
          jobId: job?.id,
          observationId: job?.data?.observationId,
          attemptsMade,
          error: err.message,
        },
        "DEAD LETTER: Privacy job exhausted all retries — quarantining observation",
      );

      if (job?.data?.observationId) {
        try {
          const db = getDb();
          if (db) {
            await db
              .update(observations)
              .set({
                privacyProcessingStatus: "quarantined",
                updatedAt: new Date(),
              })
              .where(eq(observations.id, job.data.observationId));

            logger.info(
              { observationId: job.data.observationId },
              "Observation quarantined after dead-letter",
            );
          }
        } catch (quarantineErr) {
          logger.error(
            {
              observationId: job.data.observationId,
              error: (quarantineErr as Error).message,
            },
            "Failed to quarantine observation after dead-letter",
          );
        }
      }
    } else {
      logger.warn(
        {
          jobId: job?.id,
          observationId: job?.data?.observationId,
          attemptsMade,
          error: err.message,
        },
        "Privacy job failed, will retry",
      );
    }
  });

  worker.on("error", (err) => {
    logger.error({ error: err.message }, "Privacy worker error");
  });

  const shutdown = async () => {
    logger.info("Shutting down privacy worker...");
    await worker.close();
    await connection.quit();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info("Privacy worker started");
  return worker;
}

if (process.argv[1]?.includes("privacy-worker")) {
  createPrivacyWorker();
}
