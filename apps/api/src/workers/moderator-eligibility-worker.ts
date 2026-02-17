/**
 * Moderator Eligibility Worker (Sprint 18: Cooperative Depth & Governance — US3)
 *
 * Daily cron job (5 AM UTC) that scans for eligible moderator candidates
 * and sends notifications to admins about new candidates and revocations.
 */
import { humans } from "@betterworld/db";
import { Worker, Queue, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import Redis from "ioredis";
import pino from "pino";

import { initDb, getDb } from "../lib/container.js";
import { ModeratorEligibilityService } from "../services/moderator-eligibility.js";
import { NotificationService } from "../services/notification.service.js";

const logger = pino({ name: "moderator-eligibility-worker" });

const QUEUE_NAME = "moderator-eligibility";

export interface ModeratorEligibilityJobData {
  type: "eligibility_scan";
}

async function processEligibilityScan(): Promise<{
  newlyEligible: number;
  shouldRevoke: number;
}> {
  const db = getDb();
  if (!db) throw new Error("Database not initialized");

  const eligibilityService = new ModeratorEligibilityService(db);
  const { newlyEligible, shouldRevoke } = await eligibilityService.scanEligibility();

  // Auto-revoke when criteria no longer met
  for (const revocation of shouldRevoke) {
    try {
      await db
        .update(humans)
        .set({
          isModerator: false,
          moderatorDomains: [],
          updatedAt: new Date(),
        })
        .where(eq(humans.id, revocation.humanId));

      const notificationService = new NotificationService(db);
      await notificationService.create({
        recipientHumanId: revocation.humanId,
        type: "moderator_revoked",
        message: `Your moderator status has been revoked: ${revocation.reasons.join("; ")}`,
        referenceId: revocation.humanId,
        referenceType: "human",
      });
    } catch (err) {
      logger.warn(
        { humanId: revocation.humanId, error: (err as Error).message },
        "Failed to revoke moderator status",
      );
    }
  }

  logger.info(
    { newlyEligible: newlyEligible.length, shouldRevoke: shouldRevoke.length },
    "Moderator eligibility scan complete",
  );

  return {
    newlyEligible: newlyEligible.length,
    shouldRevoke: shouldRevoke.length,
  };
}

export function createModeratorEligibilityWorker(): Worker {
  const DATABASE_URL = process.env.DATABASE_URL ?? "";
  initDb(DATABASE_URL);

  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

  const worker = new Worker<ModeratorEligibilityJobData>(
    QUEUE_NAME,
    async (job: Job<ModeratorEligibilityJobData>) => {
      logger.info({ jobId: job.id, type: job.data.type }, "Processing moderator eligibility job");

      if (job.data.type === "eligibility_scan") {
        return processEligibilityScan();
      }

      logger.warn({ type: job.data.type }, "Unknown job type");
    },
    {
      connection,
      concurrency: 1,
      limiter: { max: 1, duration: 60_000 },
    },
  );

  const queue = new Queue(QUEUE_NAME, { connection });
  queue
    .upsertJobScheduler(
      "moderator-eligibility-scan",
      { pattern: "0 5 * * *" }, // Daily at 5 AM UTC
      {
        name: "moderator-eligibility-scan",
        data: { type: "eligibility_scan" },
        opts: {
          removeOnComplete: { count: 7 },
          removeOnFail: { count: 14 },
          attempts: 2,
          backoff: { type: "exponential", delay: 30_000 },
        },
      },
    )
    .catch((err) => {
      logger.error({ error: (err as Error).message }, "Failed to register repeatable job");
    });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Moderator eligibility job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, "Moderator eligibility job failed");
  });

  logger.info("Moderator eligibility worker started");
  return worker;
}
