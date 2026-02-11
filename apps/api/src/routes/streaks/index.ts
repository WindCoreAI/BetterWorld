/**
 * Streak Routes (Sprint 9: Reputation & Impact)
 *
 * GET /streaks/me — Get my streak info
 * POST /streaks/me/freeze — Activate streak freeze
 */
import { streaks } from "@betterworld/db";
import { getNextStreakMilestone, STREAK_FREEZE } from "@betterworld/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { activateFreeze } from "../../lib/streak-tracker.js";
import { humanAuth } from "../../middleware/humanAuth.js";

const streakRoutes = new Hono<AppEnv>();

// ────────────────── GET /streaks/me ──────────────────

streakRoutes.get("/me", humanAuth(), async (c) => {
  const db = getDb();
  if (!db)
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const human = c.get("human");

  // Ensure streak row exists
  await db
    .insert(streaks)
    .values({ humanId: human.id })
    .onConflictDoNothing();

  const [streakRow] = await db
    .select()
    .from(streaks)
    .where(eq(streaks.humanId, human.id))
    .limit(1);

  if (!streakRow) {
    return c.json({ ok: false, error: { code: "NOT_FOUND", message: "Streak data not found" } }, 404);
  }

  const nextMilestone = getNextStreakMilestone(streakRow.currentStreak);
  const freezeCooldownEndsAt = streakRow.freezeLastUsedAt
    ? new Date(
        streakRow.freezeLastUsedAt.getTime() +
          STREAK_FREEZE.cooldownDays * 24 * 60 * 60 * 1000,
      ).toISOString()
    : null;

  return c.json({
    ok: true,
    data: {
      currentStreak: streakRow.currentStreak,
      longestStreak: streakRow.longestStreak,
      lastActiveDate: streakRow.lastActiveDate,
      streakMultiplier: Number(streakRow.streakMultiplier),
      nextMilestone: nextMilestone
        ? { days: nextMilestone.days, multiplier: nextMilestone.multiplier }
        : null,
      freezeAvailable: streakRow.freezeAvailable,
      freezeLastUsedAt: streakRow.freezeLastUsedAt?.toISOString() ?? null,
      freezeCooldownEndsAt,
    },
    requestId: c.get("requestId"),
  });
});

// ────────────────── POST /streaks/me/freeze ──────────────────

streakRoutes.post("/me/freeze", humanAuth(), async (c) => {
  const db = getDb();
  if (!db)
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const human = c.get("human");
  const result = await activateFreeze(db, human.id);

  if (!result.success) {
    return c.json({
      ok: false,
      error: { code: "BAD_REQUEST", message: result.error },
    }, 400);
  }

  return c.json({
    ok: true,
    data: {
      freezeActivated: true,
      freezeAvailable: false,
      cooldownEndsAt: result.cooldownEndsAt,
    },
    requestId: c.get("requestId"),
  });
});

export default streakRoutes;
