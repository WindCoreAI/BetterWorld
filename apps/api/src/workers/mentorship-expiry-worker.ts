/**
 * Mentorship Expiry Worker (Sprint 18: Cooperative Depth & Governance — US1)
 *
 * Hourly cron job that:
 * 1. Finds mentorships past their 30-day expiry
 * 2. Auto-completes them
 * 3. Awards completion reward to mentor (5 tokens)
 * 4. Sends rating prompt notifications to both parties
 */
import { mentorships, humans } from "@betterworld/db";
import { Worker, Queue, type Job } from "bullmq";
import { and, eq, lte } from "drizzle-orm";
import Redis from "ioredis";
import pino from "pino";

import { initDb, getDb } from "../lib/container.js";
import { awardMentorshipCompletionReward } from "../services/mentorship-rewards.js";
import { NotificationService } from "../services/notification.service.js";

const logger = pino({ name: "mentorship-expiry-worker" });

const BATCH_SIZE = 50;
const QUEUE_NAME = "mentorship-expiry";

export interface MentorshipExpiryJobData {
  type: "expiry_scan";
}

/**
 * Process expired mentorships in batches.
 */
async function processExpiryScan(): Promise<{
  expiredCount: number;
  rewardedCount: number;
}> {
  const db = getDb();
  if (!db) throw new Error("Database not initialized");

  const result = { expiredCount: 0, rewardedCount: 0 };
  const now = new Date();

  // Find active mentorships past their expiry date
  const expired = await db
    .select({
      id: mentorships.id,
      mentorHumanId: mentorships.mentorHumanId,
      menteeHumanId: mentorships.menteeHumanId,
    })
    .from(mentorships)
    .where(
      and(
        eq(mentorships.status, "active"),
        lte(mentorships.expiresAt, now),
      ),
    )
    .limit(BATCH_SIZE);

  if (expired.length === 0) {
    logger.info("No expired mentorships found");
    return result;
  }

  const notificationService = new NotificationService(db);

  for (const ms of expired) {
    try {
      // Mark as completed
      await db
        .update(mentorships)
        .set({
          status: "completed",
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(mentorships.id, ms.id));

      result.expiredCount++;

      // Award completion reward
      try {
        const rewardResult = await awardMentorshipCompletionReward(db, ms.id);
        if (rewardResult?.rewarded) {
          result.rewardedCount++;
        }
      } catch (err) {
        logger.warn(
          { mentorshipId: ms.id, error: (err as Error).message },
          "Failed to award completion reward",
        );
      }

      // Send rating prompt to both parties
      try {
        // Get display names
        const [mentorRow] = await db
          .select({ displayName: humans.displayName })
          .from(humans)
          .where(eq(humans.id, ms.mentorHumanId))
          .limit(1);

        const [menteeRow] = await db
          .select({ displayName: humans.displayName })
          .from(humans)
          .where(eq(humans.id, ms.menteeHumanId))
          .limit(1);

        // Notify mentor
        await notificationService.create({
          recipientHumanId: ms.mentorHumanId,
          type: "mentorship_rating_prompt",
          message: `Your mentorship with ${menteeRow?.displayName ?? "your mentee"} has completed. Rate your experience!`,
          referenceId: ms.id,
          referenceType: "mentorship",
        });

        // Notify mentee
        await notificationService.create({
          recipientHumanId: ms.menteeHumanId,
          type: "mentorship_rating_prompt",
          message: `Your mentorship with ${mentorRow?.displayName ?? "your mentor"} has completed. Rate your experience!`,
          referenceId: ms.id,
          referenceType: "mentorship",
        });

        // Notify mentor of completion
        await notificationService.create({
          recipientHumanId: ms.mentorHumanId,
          type: "mentorship_completed",
          message: `Mentorship with ${menteeRow?.displayName ?? "mentee"} completed! You earned 5 teaching tokens.`,
          referenceId: ms.id,
          referenceType: "mentorship",
        });
      } catch (err) {
        logger.warn(
          { mentorshipId: ms.id, error: (err as Error).message },
          "Failed to send rating prompt notifications",
        );
      }
    } catch (err) {
      logger.error(
        { mentorshipId: ms.id, error: (err as Error).message },
        "Failed to process expired mentorship",
      );
    }
  }

  logger.info(result, "Mentorship expiry scan complete");
  return result;
}

/**
 * Create and start the mentorship expiry BullMQ worker.
 */
export function createMentorshipExpiryWorker(): Worker {
  const DATABASE_URL = process.env.DATABASE_URL ?? "";
  initDb(DATABASE_URL);

  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

  const worker = new Worker<MentorshipExpiryJobData>(
    QUEUE_NAME,
    async (job: Job<MentorshipExpiryJobData>) => {
      logger.info({ jobId: job.id, type: job.data.type }, "Processing mentorship expiry job");

      if (job.data.type === "expiry_scan") {
        return processExpiryScan();
      }

      logger.warn({ type: job.data.type }, "Unknown job type");
    },
    {
      connection,
      concurrency: 1,
      limiter: { max: 1, duration: 60_000 },
    },
  );

  // Register repeatable job: hourly scan
  const queue = new Queue(QUEUE_NAME, { connection });
  queue
    .upsertJobScheduler(
      "mentorship-expiry-scan",
      { pattern: "0 * * * *" }, // Every hour
      {
        name: "mentorship-expiry-scan",
        data: { type: "expiry_scan" },
        opts: {
          removeOnComplete: { count: 24 },
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
    logger.info({ jobId: job.id }, "Mentorship expiry job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, error: err.message },
      "Mentorship expiry job failed",
    );
  });

  logger.info("Mentorship expiry worker started");
  return worker;
}
