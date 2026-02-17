/**
 * Teaching Rewards Routes (Sprint 18: Cooperative Depth & Governance — US11)
 *
 * GET /teaching/me — Teaching activity summary
 * GET /teaching/leaderboard — Public teaching leaderboard
 */
import { mentorships, humans } from "@betterworld/db";
import { AppError } from "@betterworld/shared";
import { eq, count, desc } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { humanAuth } from "../../middleware/humanAuth.js";
import { TeachingRewardsService } from "../../services/teaching-rewards.js";

const teachingRoutes = new Hono<AppEnv>();

// ── GET /teaching/me ──
teachingRoutes.get("/teaching/me", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const teachingService = new TeachingRewardsService(db);
  const points = await teachingService.getTeachingPoints(human.id);

  return c.json({ ok: true, data: points, requestId: c.get("requestId") });
});

// ── GET /teaching/leaderboard ──
teachingRoutes.get("/teaching/leaderboard", async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  // Simplified: rank by completed mentorships as mentor
  const leaderboard = await db
    .select({
      humanId: mentorships.mentorHumanId,
      displayName: humans.displayName,
      completedMentorships: count(),
    })
    .from(mentorships)
    .innerJoin(humans, eq(mentorships.mentorHumanId, humans.id))
    .where(eq(mentorships.status, "completed"))
    .groupBy(mentorships.mentorHumanId, humans.displayName)
    .orderBy(desc(count()))
    .limit(20);

  return c.json({ ok: true, data: { leaderboard }, requestId: c.get("requestId") });
});

export default teachingRoutes;
