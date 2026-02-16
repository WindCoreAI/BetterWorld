/**
 * Activity Tracker (Sprint 16: Social Fabric Foundation)
 *
 * Updates lastActiveAt on human profiles and detects comebacks.
 * Comeback: lastActiveAt was 7+ days ago -> notify followers via care-moment worker.
 */
import { humanProfiles } from "@betterworld/db";
import { QUEUE_NAMES } from "@betterworld/shared";
import { Queue } from "bullmq";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";

import { getRedis } from "./container.js";

const logger = pino({ name: "activity-tracker" });

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Update lastActiveAt for a human. If they've been inactive for 7+ days,
 * emit a comeback notification event (event-driven per T059, meets SC-009 30s SLA).
 *
 * Called from humanAuth middleware on every authenticated request.
 * Uses Redis to debounce — only checks/updates once per 5 minutes per human.
 */
export async function trackActivity(
  db: PostgresJsDatabase,
  humanId: string,
): Promise<void> {
  try {
    // Debounce: skip if we already tracked this human in the last 5 minutes
    const redis = getRedis();
    if (redis) {
      const key = `activity:tracked:${humanId}`;
      const alreadyTracked = await redis.get(key);
      if (alreadyTracked) return;
      await redis.set(key, "1", "EX", 300); // 5-minute TTL
    }

    // Get current lastActiveAt
    const [profile] = await db
      .select({ lastActiveAt: humanProfiles.lastActiveAt })
      .from(humanProfiles)
      .where(eq(humanProfiles.humanId, humanId))
      .limit(1);

    if (!profile) return;

    const now = new Date();

    // Check for comeback: 7+ days inactive
    if (profile.lastActiveAt) {
      const timeSinceActive = now.getTime() - profile.lastActiveAt.getTime();
      if (timeSinceActive >= SEVEN_DAYS_MS) {
        // Emit comeback event to care-moment worker
        try {
          if (redis) {
            const queue = new Queue(QUEUE_NAMES.CARE_MOMENTS, { connection: redis });
            await queue.add("comeback-notification", {
              type: "comeback_notification",
              returningHumanId: humanId,
            });
            await queue.close();
          }
        } catch {
          // Non-fatal
        }
        logger.info({ humanId }, "Comeback detected");
      }
    }

    // Update lastActiveAt
    await db
      .update(humanProfiles)
      .set({ lastActiveAt: now, updatedAt: now })
      .where(eq(humanProfiles.humanId, humanId));
  } catch (err) {
    // Non-fatal: activity tracking failure should not break authentication
    logger.warn({ humanId, error: (err as Error).message }, "Activity tracking failed");
  }
}
