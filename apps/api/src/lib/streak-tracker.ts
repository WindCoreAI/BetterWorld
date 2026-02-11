/**
 * Streak Tracker (Sprint 9: Reputation & Impact)
 *
 * Tracks consecutive-day activity streaks with freeze support.
 */
import { streaks } from "@betterworld/db";
import { getStreakMultiplier, STREAK_FREEZE } from "@betterworld/shared";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";

const logger = pino({ name: "streak-tracker" });

/**
 * Format a date as YYYY-MM-DD string.
 */
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Get yesterday's date string.
 */
function getYesterday(today: string): string {
  const d = new Date(today + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return formatDate(d);
}

/**
 * Record activity for a human on a given date.
 * - If consecutive day (lastActiveDate == yesterday): increment streak
 * - If same day: no change
 * - If gap > 1 day and freeze active: consume freeze, keep streak
 * - If gap > 1 day and no freeze: reset streak to 1
 */
export async function recordActivity(
  db: PostgresJsDatabase,
  humanId: string,
  date?: Date,
): Promise<{ currentStreak: number; multiplier: number }> {
  const today = formatDate(date ?? new Date());
  const yesterday = getYesterday(today);

  // Ensure streak row exists
  await db
    .insert(streaks)
    .values({ humanId })
    .onConflictDoNothing();

  const [streakRow] = await db
    .select()
    .from(streaks)
    .where(eq(streaks.humanId, humanId))
    .limit(1);

  if (!streakRow) {
    // Should not happen after insert, but handle gracefully
    return { currentStreak: 1, multiplier: 1.0 };
  }

  const lastActive = streakRow.lastActiveDate;

  // Same day — no change
  if (lastActive === today) {
    return {
      currentStreak: streakRow.currentStreak,
      multiplier: Number(streakRow.streakMultiplier),
    };
  }

  let newStreak: number;

  if (lastActive === yesterday) {
    // Consecutive day
    newStreak = streakRow.currentStreak + 1;
  } else if (lastActive && lastActive < yesterday) {
    // Gap > 1 day
    if (streakRow.freezeActive) {
      // Consume freeze, keep streak
      newStreak = streakRow.currentStreak + 1;
      await db
        .update(streaks)
        .set({
          freezeActive: false,
          freezeAvailable: false,
          freezeLastUsedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(streaks.humanId, humanId));

      logger.info({ humanId }, "Streak freeze consumed");
    } else {
      // Break streak
      newStreak = 1;
    }
  } else {
    // First activity ever or null lastActiveDate
    newStreak = 1;
  }

  const multiplier = getStreakMultiplier(newStreak);
  const longestStreak = Math.max(streakRow.longestStreak, newStreak);

  await db
    .update(streaks)
    .set({
      currentStreak: newStreak,
      longestStreak,
      lastActiveDate: today,
      streakMultiplier: String(multiplier),
      updatedAt: new Date(),
    })
    .where(eq(streaks.humanId, humanId));

  logger.info(
    { humanId, currentStreak: newStreak, multiplier },
    "Streak activity recorded",
  );

  return { currentStreak: newStreak, multiplier };
}

/**
 * Activate streak freeze for a human.
 */
export async function activateFreeze(
  db: PostgresJsDatabase,
  humanId: string,
): Promise<
  | { success: true; cooldownEndsAt: string }
  | { success: false; error: string }
> {
  const [streakRow] = await db
    .select()
    .from(streaks)
    .where(eq(streaks.humanId, humanId))
    .limit(1);

  if (!streakRow) {
    return { success: false, error: "No streak data found" };
  }

  if (streakRow.currentStreak === 0) {
    return { success: false, error: "No active streak to freeze" };
  }

  // Check cooldown
  if (streakRow.freezeLastUsedAt) {
    const cooldownMs = STREAK_FREEZE.cooldownDays * 24 * 60 * 60 * 1000;
    const cooldownEnds =
      streakRow.freezeLastUsedAt.getTime() + cooldownMs;
    if (Date.now() < cooldownEnds) {
      return {
        success: false,
        error: `Freeze not available (on cooldown until ${new Date(cooldownEnds).toISOString()})`,
      };
    }
  }

  const cooldownEndsAt = new Date(
    Date.now() + STREAK_FREEZE.cooldownDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  await db
    .update(streaks)
    .set({
      freezeActive: true,
      updatedAt: new Date(),
    })
    .where(eq(streaks.humanId, humanId));

  logger.info({ humanId }, "Streak freeze activated");
  return { success: true, cooldownEndsAt };
}

/**
 * Break streak for inactive humans (used by decay worker).
 */
export async function breakStreak(
  db: PostgresJsDatabase,
  humanId: string,
): Promise<void> {
  await db
    .update(streaks)
    .set({
      currentStreak: 0,
      streakMultiplier: "1.00",
      freezeActive: false,
      updatedAt: new Date(),
    })
    .where(eq(streaks.humanId, humanId));

  logger.info({ humanId }, "Streak broken due to inactivity");
}
