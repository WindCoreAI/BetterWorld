/**
 * Cooperative Achievements Routes (Sprint 18: Cooperative Depth & Governance — US10)
 *
 * GET /achievements/cooperative — Public browse cooperative achievements
 * GET /achievements/cooperative/me — User's cooperative achievements
 */
import { cooperativeAchievements } from "@betterworld/db";
import { AppError } from "@betterworld/shared";
import { desc } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { humanAuth } from "../../middleware/humanAuth.js";
import { CooperativeAchievementsService } from "../../services/cooperative-achievements.js";

const achievementRoutes = new Hono<AppEnv>();

// ── GET /achievements/cooperative — Public browse ──
achievementRoutes.get("/achievements/cooperative", async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const limit = Math.min(parseInt(c.req.query("limit") ?? "20"), 50);

  const items = await db
    .select({
      id: cooperativeAchievements.id,
      achievementType: cooperativeAchievements.achievementType,
      title: cooperativeAchievements.title,
      description: cooperativeAchievements.description,
      earnedAt: cooperativeAchievements.earnedAt,
    })
    .from(cooperativeAchievements)
    .orderBy(desc(cooperativeAchievements.earnedAt))
    .limit(limit);

  return c.json({ ok: true, data: { items }, requestId: c.get("requestId") });
});

// ── GET /achievements/cooperative/me — User's achievements ──
achievementRoutes.get("/achievements/cooperative/me", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");

  const achievementsService = new CooperativeAchievementsService(db);
  const achievements = await achievementsService.getByHumanId(human.id);

  return c.json({ ok: true, data: { achievements }, requestId: c.get("requestId") });
});

export default achievementRoutes;
