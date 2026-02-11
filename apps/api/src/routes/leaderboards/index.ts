/**
 * Leaderboard Routes (Sprint 9: Reputation & Impact)
 *
 * GET /leaderboards/:type — Get leaderboard entries
 * GET /leaderboards/:type/me — Get my rank in leaderboard
 */
import { leaderboardQuerySchema } from "@betterworld/shared";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb, getRedis } from "../../lib/container.js";
import {
  decodeCursor,
  encodeCursor,
  getLeaderboard,
  getUserRank,
} from "../../lib/leaderboard-cache.js";
import { humanAuth } from "../../middleware/humanAuth.js";

const leaderboardRoutes = new Hono<AppEnv>();

// ────────────────── GET /leaderboards/:type ──────────────────

leaderboardRoutes.get("/:type", async (c) => {
  const db = getDb();
  if (!db)
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const type = c.req.param("type");
  if (!["reputation", "impact", "tokens", "missions"].includes(type)) {
    return c.json({ ok: false, error: { code: "BAD_REQUEST", message: "Invalid leaderboard type" } }, 400);
  }

  const query = leaderboardQuerySchema.parse(c.req.query());
  const redis = getRedis();

  const offset = query.cursor ? decodeCursor(query.cursor) : 0;

  const { entries, cacheAge, total } = await getLeaderboard(
    db,
    redis,
    type,
    query.period,
    query.domain,
    query.location_scope,
    100, // fetch full set for slicing
  );

  const pageEntries = entries.slice(offset, offset + query.limit);
  const hasMore = offset + query.limit < entries.length;

  return c.json({
    ok: true,
    data: pageEntries,
    meta: {
      cursor: hasMore ? encodeCursor(offset + query.limit) : null,
      hasMore,
      total,
      cacheAge,
    },
    requestId: c.get("requestId"),
  });
});

// ────────────────── GET /leaderboards/:type/me ──────────────────

leaderboardRoutes.get("/:type/me", humanAuth(), async (c) => {
  const db = getDb();
  if (!db)
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const type = c.req.param("type");
  if (!["reputation", "impact", "tokens", "missions"].includes(type)) {
    return c.json({ ok: false, error: { code: "BAD_REQUEST", message: "Invalid leaderboard type" } }, 400);
  }

  const human = c.get("human");
  const redis = getRedis();

  const result = await getUserRank(db, redis, type, human.id);

  return c.json({
    ok: true,
    data: result,
    requestId: c.get("requestId"),
  });
});

export default leaderboardRoutes;
