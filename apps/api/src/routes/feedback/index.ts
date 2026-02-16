/**
 * Feedback Routes (Sprint 17: Community Identity & Visible Growth)
 *
 * GET /feedback — List feedback (cursor-paginated)
 * PATCH /feedback/:id/read — Mark feedback as read
 * GET /feedback/unread-count — Unread feedback count
 */
import { AppError, feedbackListQuerySchema } from "@betterworld/shared";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { humanAuth } from "../../middleware/humanAuth.js";
import { FeedbackService } from "../../services/feedback.service.js";

const feedbackRoutes = new Hono<AppEnv>();

// GET /feedback/unread-count — Unread count (must be before /:id)
feedbackRoutes.get("/unread-count", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const service = new FeedbackService(db);
  const unreadCount = await service.getUnreadCount(human.id, true);

  return c.json({
    ok: true,
    data: { unreadCount },
    requestId: c.get("requestId"),
  });
});

// GET /feedback — List feedback (cursor-paginated)
feedbackRoutes.get("/", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const query = c.req.query();
  const parsed = feedbackListQuerySchema.safeParse(query);
  if (!parsed.success) {
    return c.json(
      {
        ok: false,
        error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid query" },
        requestId: c.get("requestId"),
      },
      400,
    );
  }

  const service = new FeedbackService(db);
  const result = await service.listFeedback(human.id, true, {
    unreadOnly: parsed.data.unreadOnly,
    type: parsed.data.type,
    cursor: parsed.data.cursor,
    limit: parsed.data.limit,
  });

  return c.json({
    ok: true,
    data: result.items,
    meta: {
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
      unreadCount: result.unreadCount,
    },
    requestId: c.get("requestId"),
  });
});

// PATCH /feedback/:id/read — Mark as read (ownership check)
feedbackRoutes.patch("/:id/read", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const feedbackId = c.req.param("id");
  const service = new FeedbackService(db);

  const result = await service.markRead(feedbackId, human.id, true);

  if (!result) {
    return c.json(
      {
        ok: false,
        error: { code: "FEEDBACK_NOT_FOUND", message: "Feedback not found or not the recipient" },
        requestId: c.get("requestId"),
      },
      404,
    );
  }

  return c.json({
    ok: true,
    data: result,
    requestId: c.get("requestId"),
  });
});

export default feedbackRoutes;
