/**
 * Notification Routes (Sprint 16: Social Fabric Foundation)
 *
 * 4 endpoints: list, unread count, mark read, mark all read.
 */
import { AppError, paginationQuerySchema } from "@betterworld/shared";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.js";
import { getDb } from "../lib/container.js";
import { humanAuth } from "../middleware/humanAuth.js";
import { NotificationService } from "../services/notification.service.js";

const notificationRoutes = new Hono<AppEnv>();

const listQuerySchema = paginationQuerySchema.extend({
  unreadOnly: z.enum(["true", "false"]).optional(),
  type: z.string().optional(),
});

// GET /notifications — List notifications
notificationRoutes.get("/", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const query = c.req.query();
  const parsed = listQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid query parameters");
  }

  const service = new NotificationService(db);
  const listOptions: Parameters<typeof service.list>[1] = {
    cursor: parsed.data.cursor,
    limit: parsed.data.limit,
    unreadOnly: parsed.data.unreadOnly === "true",
  };
  if (parsed.data.type) {
    // Safe cast: validated by Zod schema, service will filter unknown types
    (listOptions as Record<string, unknown>).type = parsed.data.type;
  }
  const result = await service.list(human.id, listOptions);

  return c.json({
    ok: true,
    data: result.notifications,
    meta: {
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
      count: result.notifications.length,
    },
    requestId: c.get("requestId"),
  });
});

// GET /notifications/unread-count — Unread count for badge
notificationRoutes.get("/unread-count", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const service = new NotificationService(db);
  const unreadCount = await service.getUnreadCount(human.id);

  return c.json({
    ok: true,
    data: { unreadCount },
    requestId: c.get("requestId"),
  });
});

// PATCH /notifications/:id/read — Mark single read
notificationRoutes.patch("/:id/read", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const notificationId = c.req.param("id");

  const service = new NotificationService(db);
  try {
    const found = await service.markRead(notificationId, human.id);
    if (!found) {
      throw new AppError("NOT_FOUND", "Notification not found");
    }
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_RECIPIENT") {
      throw new AppError("FORBIDDEN", "Not your notification");
    }
    throw err;
  }

  return c.json({
    ok: true,
    data: { marked: true },
    requestId: c.get("requestId"),
  });
});

// POST /notifications/read-all — Mark all as read
notificationRoutes.post("/read-all", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const service = new NotificationService(db);
  const markedCount = await service.markAllRead(human.id);

  return c.json({
    ok: true,
    data: { markedCount },
    requestId: c.get("requestId"),
  });
});

export default notificationRoutes;
