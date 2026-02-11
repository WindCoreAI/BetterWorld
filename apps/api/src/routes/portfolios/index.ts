/**
 * Portfolio Routes (Sprint 9: Reputation & Impact)
 *
 * GET /portfolios/:humanId — Get public portfolio
 * PATCH /portfolios/me/visibility — Toggle portfolio visibility
 */
import {
  endorsements,
  humans,
  missions,
  missionClaims,
  reputationScores,
  streaks,
} from "@betterworld/db";
import { portfolioVisibilitySchema } from "@betterworld/shared";
import { and, count, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { humanAuth } from "../../middleware/humanAuth.js";

const portfolioRoutes = new Hono<AppEnv>();

// ────────────────── GET /portfolios/:humanId ──────────────────

portfolioRoutes.get("/:humanId", async (c) => {
  const db = getDb();
  if (!db)
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const humanId = c.req.param("humanId");

  const [humanRow] = await db
    .select({
      id: humans.id,
      displayName: humans.displayName,
      avatarUrl: humans.avatarUrl,
      portfolioVisibility: humans.portfolioVisibility,
      createdAt: humans.createdAt,
    })
    .from(humans)
    .where(eq(humans.id, humanId))
    .limit(1);

  if (!humanRow) {
    return c.json({ ok: false, error: { code: "NOT_FOUND", message: "Human not found" } }, 404);
  }

  // Check visibility (allow owner)
  const authHuman = c.get("human") as { id: string } | undefined;
  if (
    humanRow.portfolioVisibility === "private" &&
    authHuman?.id !== humanRow.id
  ) {
    return c.json({ ok: false, error: { code: "FORBIDDEN", message: "Portfolio is private" } }, 403);
  }

  // Fetch reputation
  const [repRow] = await db
    .select()
    .from(reputationScores)
    .where(eq(reputationScores.humanId, humanId))
    .limit(1);

  // Fetch streak
  const [streakRow] = await db
    .select()
    .from(streaks)
    .where(eq(streaks.humanId, humanId))
    .limit(1);

  // Fetch stats
  const [missionCount] = await db
    .select({ count: count() })
    .from(missionClaims)
    .where(
      and(
        eq(missionClaims.humanId, humanId),
        eq(missionClaims.status, "verified"),
      ),
    );

  const [endorsementCount] = await db
    .select({ count: count() })
    .from(endorsements)
    .where(
      and(
        eq(endorsements.toHumanId, humanId),
        eq(endorsements.status, "active"),
      ),
    );

  // Fetch last 20 completed missions
  const completedMissions = await db
    .select({
      id: missions.id,
      title: missions.title,
      domain: missions.domain,
      updatedAt: missionClaims.updatedAt,
    })
    .from(missionClaims)
    .innerJoin(missions, eq(missionClaims.missionId, missions.id))
    .where(
      and(
        eq(missionClaims.humanId, humanId),
        eq(missionClaims.status, "verified"),
      ),
    )
    .orderBy(desc(missionClaims.updatedAt))
    .limit(20);

  // Get unique domains count
  const domainsResult = await db
    .selectDistinct({ domain: missions.domain })
    .from(missionClaims)
    .innerJoin(missions, eq(missionClaims.missionId, missions.id))
    .where(
      and(
        eq(missionClaims.humanId, humanId),
        eq(missionClaims.status, "verified"),
      ),
    );

  return c.json({
    ok: true,
    data: {
      humanId: humanRow.id,
      displayName: humanRow.displayName,
      avatarUrl: humanRow.avatarUrl ?? null,
      reputation: {
        totalScore: repRow ? Number(repRow.totalScore) : 0,
        tier: repRow?.currentTier ?? "newcomer",
        tierMultiplier: repRow ? Number(repRow.tierMultiplier) : 1.0,
      },
      stats: {
        missionsCompleted: missionCount?.count ?? 0,
        totalTokensEarned: 0, // Would need aggregation query
        domainsContributed: domainsResult.length,
        currentStreak: streakRow?.currentStreak ?? 0,
        longestStreak: streakRow?.longestStreak ?? 0,
        endorsementsReceived: endorsementCount?.count ?? 0,
      },
      missions: completedMissions.map((m) => ({
        id: m.id,
        title: m.title,
        domain: m.domain,
        thumbnailUrl: null,
        completedAt: m.updatedAt.toISOString(),
      })),
      visibility: humanRow.portfolioVisibility,
      joinedAt: humanRow.createdAt.toISOString(),
    },
    requestId: c.get("requestId"),
  });
});

// ────────────────── PATCH /portfolios/me/visibility ──────────────────

const visibilityBody = z.object({
  visibility: portfolioVisibilitySchema,
});

portfolioRoutes.patch("/me/visibility", humanAuth(), async (c) => {
  const db = getDb();
  if (!db)
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const human = c.get("human");
  const body = visibilityBody.parse(await c.req.json());

  await db
    .update(humans)
    .set({
      portfolioVisibility: body.visibility as "public" | "private",
      updatedAt: new Date(),
    })
    .where(eq(humans.id, human.id));

  return c.json({
    ok: true,
    data: {
      visibility: body.visibility,
      updatedAt: new Date().toISOString(),
    },
    requestId: c.get("requestId"),
  });
});

export default portfolioRoutes;
