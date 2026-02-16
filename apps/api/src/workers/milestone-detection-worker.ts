/**
 * Milestone Detection Worker (Sprint 17: Community Identity & Visible Growth)
 *
 * Daily cron (4 AM UTC): scans all domains and cities for milestone thresholds.
 * When milestone reached: sets reachedAt + bannerExpiresAt, creates notifications.
 */
import {
  groupMilestones,
  missions,
  problems,
  humanProfiles,
} from "@betterworld/db";
import { QUEUE_NAMES } from "@betterworld/shared";
import { Worker, Queue, type Job } from "bullmq";
import { and, eq, sql, count, isNull, gte } from "drizzle-orm";
import Redis from "ioredis";
import pino from "pino";

import { initDb, getDb } from "../lib/container.js";
import { NotificationService } from "../services/notification.service.js";

const logger = pino({ name: "milestone-detection-worker" });

export interface MilestoneDetectionJobData {
  type: "daily_scan";
}

type DbInstance = NonNullable<ReturnType<typeof getDb>>;

async function countMissionsCompleted(db: DbInstance, groupType: string, groupValue: string): Promise<number> {
  if (groupType === "domain") {
    const [r] = await db
      .select({ count: count() })
      .from(missions)
      .where(and(sql`${missions.domain} = ${groupValue}`, eq(missions.status, "verified")));
    return r?.count ?? 0;
  }
  const [r] = await db
    .select({ count: count() })
    .from(missions)
    .where(
      and(
        eq(missions.status, "verified"),
        sql`lower(${missions.requiredLocationName}) LIKE ${"%" + groupValue + "%"}`,
      ),
    );
  return r?.count ?? 0;
}

async function countProblemsResolved(db: DbInstance, groupType: string, groupValue: string): Promise<number> {
  if (groupType === "domain") {
    const [r] = await db
      .select({ count: count() })
      .from(problems)
      .where(and(sql`${problems.domain} = ${groupValue}`, eq(problems.status, "resolved")));
    return r?.count ?? 0;
  }
  const [r] = await db
    .select({ count: count() })
    .from(problems)
    .where(
      and(
        eq(problems.status, "resolved"),
        sql`lower(${problems.locationName}) LIKE ${"%" + groupValue + "%"}`,
      ),
    );
  return r?.count ?? 0;
}

async function countMembersJoined(db: DbInstance, groupType: string, groupValue: string): Promise<number> {
  if (groupType === "domain") {
    const [r] = await db
      .select({ count: count() })
      .from(humanProfiles)
      .where(sql`${humanProfiles.primaryDomain} = ${groupValue}`);
    return r?.count ?? 0;
  }
  const [r] = await db
    .select({ count: count() })
    .from(humanProfiles)
    .where(sql`lower(${humanProfiles.city}) LIKE ${"%" + groupValue + "%"}`);
  return r?.count ?? 0;
}

async function countPerfectWeek(db: DbInstance, groupType: string, groupValue: string): Promise<number> {
  if (groupType === "domain") {
    const [r] = await db
      .select({ count: count() })
      .from(humanProfiles)
      .where(
        and(
          sql`${humanProfiles.primaryDomain} = ${groupValue}`,
          gte(humanProfiles.streakDays, 7),
        ),
      );
    return r?.count ?? 0;
  }
  return 0;
}

async function computeMetric(
  db: ReturnType<typeof getDb>,
  groupType: "domain" | "city",
  groupValue: string,
  milestoneType: string,
): Promise<number> {
  if (!db) return 0;

  switch (milestoneType) {
    case "missions_completed":
      return countMissionsCompleted(db, groupType, groupValue);
    case "problems_resolved":
      return countProblemsResolved(db, groupType, groupValue);
    case "members_joined":
      return countMembersJoined(db, groupType, groupValue);
    case "perfect_week":
      return countPerfectWeek(db, groupType, groupValue);
    case "cross_city_solution":
      return 0;
    default:
      return 0;
  }
}

async function processDailyScan(): Promise<{
  scannedCount: number;
  milestonesReached: number;
  notificationsCreated: number;
}> {
  const db = getDb();
  if (!db) throw new Error("Database not initialized");

  const result = { scannedCount: 0, milestonesReached: 0, notificationsCreated: 0 };

  // Get all unreached milestones
  const unreachedMilestones = await db
    .select()
    .from(groupMilestones)
    .where(isNull(groupMilestones.reachedAt));

  for (const milestone of unreachedMilestones) {
    result.scannedCount++;

    try {
      const currentValue = await computeMetric(
        db,
        milestone.groupType,
        milestone.groupValue,
        milestone.milestoneType,
      );

      // Update current value
      await db
        .update(groupMilestones)
        .set({
          currentValue,
          updatedAt: new Date(),
        })
        .where(eq(groupMilestones.id, milestone.id));

      // Check if threshold met
      if (currentValue >= milestone.targetValue) {
        const now = new Date();
        const bannerExpires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        await db
          .update(groupMilestones)
          .set({
            reachedAt: now,
            bannerExpiresAt: bannerExpires,
            currentValue,
            updatedAt: now,
          })
          .where(eq(groupMilestones.id, milestone.id));

        result.milestonesReached++;

        // Notify group members (recent 30-day activity)
        try {
          const notifService = new NotificationService(db);
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

          // Get active members in this group
          let memberIds: string[] = [];

          if (milestone.groupType === "domain") {
            const members = await db
              .select({ humanId: humanProfiles.humanId })
              .from(humanProfiles)
              .where(
                and(
                  sql`${humanProfiles.primaryDomain} = ${milestone.groupValue}`,
                  gte(humanProfiles.lastActiveAt, thirtyDaysAgo),
                ),
              )
              .limit(100);
            memberIds = members.map((m) => m.humanId);
          } else {
            const members = await db
              .select({ humanId: humanProfiles.humanId })
              .from(humanProfiles)
              .where(
                and(
                  sql`lower(${humanProfiles.city}) LIKE ${"%" + milestone.groupValue + "%"}`,
                  gte(humanProfiles.lastActiveAt, thirtyDaysAgo),
                ),
              )
              .limit(100);
            memberIds = members.map((m) => m.humanId);
          }

          for (const memberId of memberIds) {
            try {
              await notifService.create({
                recipientHumanId: memberId,
                type: "milestone_celebration",
                message: `${milestone.groupValue} reached ${milestone.targetValue} ${milestone.milestoneType.replace(/_/g, " ")}!`,
                referenceId: milestone.id,
                referenceType: "group_milestone",
                aggregationKey: `milestone:${milestone.id}`,
              });
              result.notificationsCreated++;
            } catch {
              // Non-fatal per-notification
            }
          }
        } catch (err) {
          logger.error(
            { milestoneId: milestone.id, error: (err as Error).message },
            "Failed to send milestone notifications",
          );
        }
      }
    } catch (err) {
      // Per-item error isolation
      logger.error(
        { milestoneId: milestone.id, error: (err as Error).message },
        "Failed to process milestone",
      );
    }
  }

  return result;
}

export function createMilestoneDetectionWorker(): Worker {
  const config = {
    host: process.env.REDIS_HOST ?? "localhost",
    port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
  };

  const connection = new Redis(config);
  const queue = new Queue(QUEUE_NAMES.MILESTONE_DETECTION, { connection: new Redis(config) });

  // Daily cron at 4 AM UTC
  queue
    .add(
      "daily-scan",
      { type: "daily_scan" } satisfies MilestoneDetectionJobData,
      {
        repeat: { pattern: "0 4 * * *" },
        removeOnComplete: { count: 7 },
        removeOnFail: { count: 30 },
      },
    )
    .catch((err) => {
      logger.error({ error: (err as Error).message }, "Failed to add milestone-detection cron");
    });

  const DATABASE_URL = process.env.DATABASE_URL ?? "";
  initDb(DATABASE_URL);

  const worker = new Worker<MilestoneDetectionJobData>(
    QUEUE_NAMES.MILESTONE_DETECTION,
    async (job: Job<MilestoneDetectionJobData>) => {
      logger.info({ jobId: job.id }, "Processing milestone detection");
      const result = await processDailyScan();
      logger.info(result, "Milestone detection complete");
      return result;
    },
    {
      connection,
      concurrency: 1,
      limiter: { max: 1, duration: 60_000 },
    },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Milestone detection job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, error: err.message },
      "Milestone detection job failed",
    );
  });

  return worker;
}
