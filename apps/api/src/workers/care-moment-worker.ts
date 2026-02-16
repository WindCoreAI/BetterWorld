/**
 * Care Moment Worker (Sprint 16: Social Fabric Foundation)
 *
 * BullMQ worker with two scheduled jobs:
 * 1. streak-break: hourly scan for humans with no activity for 20+ hours
 *    who have active streaks — notify their followers
 * 2. milestone: event-driven (queued by mission completion / tier promotion flows)
 *    — notify followers of the person who hit the milestone
 *
 * Comeback detection is event-driven (T059), not a scheduled job.
 */
import {
  follows,
  humans,
  humanProfiles,
} from "@betterworld/db";
import { QUEUE_NAMES } from "@betterworld/shared";
import { Worker, Queue, type Job } from "bullmq";
import { and, eq, lt, gt } from "drizzle-orm";
import Redis from "ioredis";
import pino from "pino";

import { initDb, getDb } from "../lib/container.js";
import { NotificationService } from "../services/notification.service.js";

const logger = pino({ name: "care-moment-worker" });

const BATCH_SIZE = 100;

export interface CareMomentJobData {
  type: "streak_break_scan" | "milestone_notification" | "comeback_notification";
  // For milestone_notification:
  humanId?: string;
  milestoneType?: string;
  milestoneValue?: string;
  // For comeback_notification:
  returningHumanId?: string;
}

/**
 * Scan for humans whose streaks are at risk (no activity for 20+ hours)
 * and notify their followers.
 */
async function processStreakBreakScan(): Promise<{
  scannedCount: number;
  notifiedCount: number;
}> {
  const db = getDb();
  if (!db) throw new Error("Database not initialized");

  const result = { scannedCount: 0, notifiedCount: 0 };
  const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000);

  // Find humans with active streaks who haven't been active in 20+ hours
  const atRiskHumans = await db
    .select({
      humanId: humanProfiles.humanId,
      displayName: humans.displayName,
      lastActiveAt: humanProfiles.lastActiveAt,
      streakDays: humanProfiles.streakDays,
    })
    .from(humanProfiles)
    .innerJoin(humans, eq(humanProfiles.humanId, humans.id))
    .where(
      and(
        gt(humanProfiles.streakDays, 0),
        lt(humanProfiles.lastActiveAt, twentyHoursAgo),
      ),
    )
    .limit(BATCH_SIZE);

  result.scannedCount = atRiskHumans.length;

  const notifService = new NotificationService(db);

  for (const human of atRiskHumans) {
    try {
      // Get followers of this human
      const followers = await db
        .select({ followerHumanId: follows.followerHumanId })
        .from(follows)
        .where(eq(follows.followingHumanId, human.humanId))
        .limit(50); // Cap at 50 notifications per at-risk human

      for (const follower of followers) {
        try {
          await notifService.create({
            recipientHumanId: follower.followerHumanId,
            type: "streak_warning",
            message: `${human.displayName}'s ${human.streakDays}-day streak is at risk! Send them a cheer.`,
            actorHumanId: human.humanId,
            referenceId: human.humanId,
            referenceType: "streak_warning",
            aggregationKey: `streak_warning:${human.humanId}`,
          });
          result.notifiedCount++;
        } catch {
          // Non-fatal: single notification failure should not break the scan
        }
      }
    } catch (err) {
      logger.error(
        { humanId: human.humanId, error: (err as Error).message },
        "Failed to process streak-break notification",
      );
    }
  }

  return result;
}

/**
 * Send milestone notifications to the followers of a human who hit a milestone.
 */
async function processMilestoneNotification(
  humanId: string,
  milestoneType: string,
  milestoneValue: string,
): Promise<{ notifiedCount: number }> {
  const db = getDb();
  if (!db) throw new Error("Database not initialized");

  const result = { notifiedCount: 0 };

  // Get human display name
  const [human] = await db
    .select({ displayName: humans.displayName })
    .from(humans)
    .where(eq(humans.id, humanId))
    .limit(1);

  if (!human) {
    logger.warn({ humanId }, "Human not found for milestone notification");
    return result;
  }

  const milestoneLabels: Record<string, string> = {
    mission_count: `completed ${milestoneValue} missions`,
    tier_promotion: `was promoted to ${milestoneValue}`,
    streak_record: `reached a ${milestoneValue}-day streak`,
  };
  const label = milestoneLabels[milestoneType] ?? `achieved ${milestoneType}`;

  // Get followers
  const followers = await db
    .select({ followerHumanId: follows.followerHumanId })
    .from(follows)
    .where(eq(follows.followingHumanId, humanId))
    .limit(100);

  const notifService = new NotificationService(db);

  for (const follower of followers) {
    try {
      await notifService.create({
        recipientHumanId: follower.followerHumanId,
        type: "milestone",
        message: `${human.displayName} ${label}! Celebrate their achievement.`,
        actorHumanId: humanId,
        referenceId: humanId,
        referenceType: "milestone",
        aggregationKey: `milestone:${humanId}:${milestoneType}`,
      });
      result.notifiedCount++;
    } catch {
      // Non-fatal
    }
  }

  return result;
}

/**
 * Send comeback notifications to followers of a returning human.
 */
async function processComebackNotification(
  returningHumanId: string,
): Promise<{ notifiedCount: number }> {
  const db = getDb();
  if (!db) throw new Error("Database not initialized");

  const result = { notifiedCount: 0 };

  const [human] = await db
    .select({ displayName: humans.displayName })
    .from(humans)
    .where(eq(humans.id, returningHumanId))
    .limit(1);

  if (!human) return result;

  const followers = await db
    .select({ followerHumanId: follows.followerHumanId })
    .from(follows)
    .where(eq(follows.followingHumanId, returningHumanId))
    .limit(100);

  const notifService = new NotificationService(db);

  for (const follower of followers) {
    try {
      await notifService.create({
        recipientHumanId: follower.followerHumanId,
        type: "comeback",
        message: `${human.displayName} is back! Welcome them back to the community.`,
        actorHumanId: returningHumanId,
        referenceId: returningHumanId,
        referenceType: "comeback",
        aggregationKey: `comeback:${returningHumanId}`,
      });
      result.notifiedCount++;
    } catch {
      // Non-fatal
    }
  }

  return result;
}

/**
 * Create and start the care-moment worker with hourly cron for streak-break detection.
 */
export function createCareMomentWorker(): Worker {
  const DATABASE_URL = process.env.DATABASE_URL ?? "";
  const config = {
    host: process.env.REDIS_HOST ?? "localhost",
    port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
  };

  const connection = new Redis(config);

  // Set up scheduled cron job for streak-break scanning
  const queue = new Queue(QUEUE_NAMES.CARE_MOMENTS, { connection: new Redis(config) });

  // Add repeatable job: hourly streak-break scan
  queue
    .add(
      "streak-break-scan",
      { type: "streak_break_scan" } satisfies CareMomentJobData,
      {
        repeat: { pattern: "0 * * * *" }, // Every hour
        removeOnComplete: { count: 24 },
        removeOnFail: { count: 100 },
      },
    )
    .catch((err) => {
      logger.error({ error: (err as Error).message }, "Failed to add streak-break cron");
    });

  initDb(DATABASE_URL);

  const worker = new Worker<CareMomentJobData>(
    QUEUE_NAMES.CARE_MOMENTS,
    async (job: Job<CareMomentJobData>) => {
      const { type } = job.data;

      logger.info({ type, jobId: job.id }, "Processing care-moment job");

      switch (type) {
        case "streak_break_scan": {
          const result = await processStreakBreakScan();
          logger.info(result, "Streak-break scan complete");
          return result;
        }
        case "milestone_notification": {
          if (!job.data.humanId || !job.data.milestoneType) {
            throw new Error("Missing humanId or milestoneType for milestone notification");
          }
          const result = await processMilestoneNotification(
            job.data.humanId,
            job.data.milestoneType,
            job.data.milestoneValue ?? "",
          );
          logger.info(result, "Milestone notification complete");
          return result;
        }
        case "comeback_notification": {
          if (!job.data.returningHumanId) {
            throw new Error("Missing returningHumanId for comeback notification");
          }
          const result = await processComebackNotification(job.data.returningHumanId);
          logger.info(result, "Comeback notification complete");
          return result;
        }
        default:
          logger.warn({ type }, "Unknown care-moment job type");
      }
    },
    {
      connection,
      concurrency: 1,
      limiter: { max: 10, duration: 60_000 },
    },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, type: job.data.type }, "Care-moment job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, type: job?.data.type, error: err.message },
      "Care-moment job failed",
    );
  });

  return worker;
}
