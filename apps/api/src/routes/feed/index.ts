/**
 * Personalized Feed Routes (Sprint 18: Cooperative Depth & Governance — US11)
 *
 * GET /feed — Get personalized feed (humanAuth, cursor paginated)
 */
import { feedEvents, humans, follows } from "@betterworld/db";
import { AppError } from "@betterworld/shared";
import { and, eq, desc, sql } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { humanAuth } from "../../middleware/humanAuth.js";

const feedRoutes = new Hono<AppEnv>();

// ── GET /feed — Personalized feed ──
feedRoutes.get("/feed", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20"), 50);
  const cursor = c.req.query("cursor");

  // Get followed users for feed scoring
  const followedUsers = await db
    .select({ followedId: follows.followingHumanId })
    .from(follows)
    .where(eq(follows.followerHumanId, human.id))
    .limit(200);

  const followedIds = followedUsers.map((f) => f.followedId);

  // Build conditions
  const conditions = [];
  if (cursor) {
    conditions.push(sql`${feedEvents.createdAt} < (SELECT created_at FROM feed_events WHERE id = ${cursor})`);
  }

  // 30-day window
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  conditions.push(sql`${feedEvents.createdAt} >= ${thirtyDaysAgo}`);

  // Prioritize followed users' events, then global
  const items = await db
    .select({
      id: feedEvents.id,
      eventType: feedEvents.eventType,
      actorHumanId: feedEvents.actorHumanId,
      actorName: humans.displayName,
      targetId: feedEvents.targetId,
      targetType: feedEvents.targetType,
      domain: feedEvents.domain,
      city: feedEvents.city,
      createdAt: feedEvents.createdAt,
    })
    .from(feedEvents)
    .leftJoin(humans, eq(feedEvents.actorHumanId, humans.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(
      // Boost events from followed users
      followedIds.length > 0
        ? sql`CASE WHEN ${feedEvents.actorHumanId} IN ${followedIds} THEN 0 ELSE 1 END`
        : sql`1`,
      desc(feedEvents.createdAt),
    )
    .limit(limit + 1);

  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;

  return c.json({
    ok: true,
    data: {
      items: data,
      nextCursor: hasMore && data.length > 0 ? data[data.length - 1]!.id : null,
    },
    requestId: c.get("requestId"),
  });
});

export default feedRoutes;
