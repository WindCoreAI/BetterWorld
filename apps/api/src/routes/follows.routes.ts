/**
 * Follow Routes (Sprint 16: Social Fabric Foundation)
 *
 * 6 endpoints: follow, unfollow, following list, followers list, status, counts.
 */
import { paginationQuerySchema } from "@betterworld/shared";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.js";
import { getDb } from "../lib/container.js";
import { humanAuth } from "../middleware/humanAuth.js";
import { FollowService, FollowError } from "../services/follow.service.js";
import { NotificationService } from "../services/notification.service.js";

const followRoutes = new Hono<AppEnv>();

const uuidSchema = z.string().uuid();

// POST /follows/:humanId — Follow a user
followRoutes.post("/:humanId", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);
  }

  const human = c.get("human");
  const humanId = c.req.param("humanId");

  const parsed = uuidSchema.safeParse(humanId);
  if (!parsed.success) {
    return c.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid humanId format" } }, 400);
  }

  try {
    const service = new FollowService(db);
    const result = await service.follow(human.id, humanId);

    // Send follow notification to target
    try {
      const notifService = new NotificationService(db);
      await notifService.create({
        recipientHumanId: humanId,
        type: "follow",
        message: `${human.displayName} started following you`,
        actorHumanId: human.id,
        referenceId: result.id,
        referenceType: "follow",
      });
    } catch {
      // Non-fatal: notification failure should not break the follow
    }

    return c.json({
      ok: true,
      data: {
        id: result.id,
        followingHumanId: result.followingHumanId,
        createdAt: result.createdAt.toISOString(),
      },
      requestId: c.get("requestId"),
    }, 201);
  } catch (err) {
    if (err instanceof FollowError) {
      const statusMap: Record<string, number> = {
        SELF_FOLLOW: 400,
        NOT_FOUND: 404,
        ALREADY_FOLLOWING: 409,
        FOLLOW_LIMIT_REACHED: 429,
      };
      const status = statusMap[err.code] ?? 400;
      return c.json({
        ok: false,
        error: { code: err.code, message: err.message },
        requestId: c.get("requestId"),
      }, status as 400);
    }
    throw err;
  }
});

// DELETE /follows/:humanId — Unfollow a user
followRoutes.delete("/:humanId", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);
  }

  const human = c.get("human");
  const humanId = c.req.param("humanId");

  try {
    const service = new FollowService(db);
    await service.unfollow(human.id, humanId);

    return c.json({
      ok: true,
      data: { unfollowed: true },
      requestId: c.get("requestId"),
    });
  } catch (err) {
    if (err instanceof FollowError && err.code === "NOT_FOUND") {
      return c.json({
        ok: false,
        error: { code: "NOT_FOUND", message: err.message },
        requestId: c.get("requestId"),
      }, 404);
    }
    throw err;
  }
});

// GET /follows/following — List humans I follow
followRoutes.get("/following", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);
  }

  const human = c.get("human");
  const query = c.req.query();
  const parsed = paginationQuerySchema.safeParse(query);
  if (!parsed.success) {
    return c.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid query parameters" } }, 400);
  }

  const service = new FollowService(db);
  const result = await service.getFollowing(human.id, {
    cursor: parsed.data.cursor,
    limit: parsed.data.limit,
  });

  return c.json({
    ok: true,
    data: result.items,
    meta: {
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
      count: result.items.length,
    },
    requestId: c.get("requestId"),
  });
});

// GET /follows/followers — List humans who follow me
followRoutes.get("/followers", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);
  }

  const human = c.get("human");
  const query = c.req.query();
  const parsed = paginationQuerySchema.safeParse(query);
  if (!parsed.success) {
    return c.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid query parameters" } }, 400);
  }

  const service = new FollowService(db);
  const result = await service.getFollowers(human.id, {
    cursor: parsed.data.cursor,
    limit: parsed.data.limit,
  });

  return c.json({
    ok: true,
    data: result.items,
    meta: {
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
      count: result.items.length,
    },
    requestId: c.get("requestId"),
  });
});

// GET /follows/status/:humanId — Check follow status
followRoutes.get("/status/:humanId", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);
  }

  const human = c.get("human");
  const humanId = c.req.param("humanId");

  const service = new FollowService(db);
  const status = await service.getStatus(human.id, humanId);

  return c.json({
    ok: true,
    data: {
      isFollowing: status.isFollowing,
      isFollowedBy: status.isFollowedBy,
      followingSince: status.followingSince?.toISOString() ?? null,
    },
    requestId: c.get("requestId"),
  });
});

// GET /follows/counts/:humanId — Get follow counts (public)
followRoutes.get("/counts/:humanId", async (c) => {
  const db = getDb();
  if (!db) {
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);
  }

  const humanId = c.req.param("humanId");

  const service = new FollowService(db);
  const counts = await service.getCounts(humanId);

  return c.json({
    ok: true,
    data: counts,
    requestId: c.get("requestId"),
  });
});

export default followRoutes;
