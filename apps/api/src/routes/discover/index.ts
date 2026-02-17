/**
 * People Discovery Routes (Sprint 18: Cooperative Depth & Governance — US11)
 *
 * GET /discover/people — Browse and discover people with domain/city filters
 */
import { humans, humanProfiles, reputationScores } from "@betterworld/db";
import { AppError } from "@betterworld/shared";
import { and, eq, desc, sql } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { humanAuth } from "../../middleware/humanAuth.js";

const discoverRoutes = new Hono<AppEnv>();

// ── GET /discover/people ──
discoverRoutes.get("/discover/people", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const domain = c.req.query("domain");
  const city = c.req.query("city");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20"), 50);

  const conditions = [
    eq(humans.isActive, true),
    sql`${humans.id} != ${human.id}`,
  ];

  if (city) {
    conditions.push(eq(humanProfiles.city, city));
  }
  if (domain) {
    conditions.push(eq(humanProfiles.primaryDomain, domain as never));
  }

  const people = await db
    .select({
      id: humans.id,
      displayName: humans.displayName,
      avatarUrl: humans.avatarUrl,
      city: humanProfiles.city,
      primaryDomain: humanProfiles.primaryDomain,
      bio: humanProfiles.bio,
      tier: reputationScores.currentTier,
      totalMissionsCompleted: humanProfiles.totalMissionsCompleted,
    })
    .from(humans)
    .leftJoin(humanProfiles, eq(humans.id, humanProfiles.humanId))
    .leftJoin(reputationScores, eq(humans.id, reputationScores.humanId))
    .where(and(...conditions))
    .orderBy(desc(humanProfiles.totalMissionsCompleted))
    .limit(limit);

  return c.json({ ok: true, data: { people }, requestId: c.get("requestId") });
});

export default discoverRoutes;
