/**
 * Connection Routes (Sprint 16: Social Fabric Foundation)
 *
 * 8 endpoints: request, accept, decline, remove, list, pending, suggestions, status.
 */
import { paginationQuerySchema } from "@betterworld/shared";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.js";
import { getDb } from "../lib/container.js";
import { humanAuth } from "../middleware/humanAuth.js";
import { ConnectionService, ConnectionError } from "../services/connection.service.js";
import { NotificationService } from "../services/notification.service.js";

const connectionRoutes = new Hono<AppEnv>();

const uuidSchema = z.string().uuid();

const listQuerySchema = paginationQuerySchema.extend({
  domain: z.string().optional(),
});

// POST /connections/:humanId — Send connection request
connectionRoutes.post("/:humanId", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const human = c.get("human");
  const targetId = c.req.param("humanId");

  const parsed = uuidSchema.safeParse(targetId);
  if (!parsed.success) {
    return c.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid humanId format" } }, 400);
  }

  try {
    const service = new ConnectionService(db);
    const result = await service.sendRequest(human.id, targetId);

    // Send notification
    try {
      const notifService = new NotificationService(db);
      if (result.status === "pending") {
        await notifService.create({
          recipientHumanId: targetId,
          type: "connection_request",
          message: `${human.displayName} sent you a connection request`,
          actorHumanId: human.id,
          referenceId: result.id,
          referenceType: "connection",
        });
      } else if (result.status === "accepted") {
        // Notify both parties for auto-accept
        await notifService.create({
          recipientHumanId: targetId,
          type: "connection_accepted",
          message: `You and ${human.displayName} are now connected`,
          actorHumanId: human.id,
          referenceId: result.id,
          referenceType: "connection",
        });
      }
    } catch {
      // Non-fatal
    }

    return c.json({
      ok: true,
      data: {
        id: result.id,
        recipientHumanId: result.recipientHumanId,
        status: result.status,
        createdAt: result.createdAt.toISOString(),
        ...(result.sharedDomains ? { sharedDomains: result.sharedDomains } : {}),
        ...(result.interactionCount !== undefined ? { interactionCount: result.interactionCount } : {}),
        ...(result.acceptedAt ? { acceptedAt: result.acceptedAt.toISOString() } : {}),
      },
      requestId: c.get("requestId"),
    }, 201);
  } catch (err) {
    if (err instanceof ConnectionError) {
      const statusMap: Record<string, number> = {
        SELF_CONNECTION: 400,
        NOT_FOUND: 404,
        ALREADY_CONNECTED: 409,
        COOLDOWN_ACTIVE: 429,
      };
      return c.json({
        ok: false,
        error: { code: err.code, message: err.message },
        requestId: c.get("requestId"),
      }, (statusMap[err.code] ?? 400) as 400);
    }
    throw err;
  }
});

// POST /connections/:id/accept — Accept connection request
connectionRoutes.post("/:id/accept", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const human = c.get("human");
  const connectionId = c.req.param("id");

  try {
    const service = new ConnectionService(db);
    const result = await service.accept(connectionId, human.id);

    // Notify the requester (the other person)
    try {
      const notifService = new NotificationService(db);
      await notifService.create({
        recipientHumanId: result.requesterHumanId,
        type: "connection_accepted",
        message: `${human.displayName} accepted your connection request`,
        actorHumanId: human.id,
        referenceId: result.id,
        referenceType: "connection",
      });
    } catch {
      // Non-fatal
    }

    return c.json({
      ok: true,
      data: {
        id: result.id,
        status: result.status,
        sharedDomains: result.sharedDomains,
        interactionCount: result.interactionCount,
        acceptedAt: result.acceptedAt?.toISOString() ?? null,
      },
      requestId: c.get("requestId"),
    });
  } catch (err) {
    if (err instanceof ConnectionError) {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        NOT_RECIPIENT: 403,
        NOT_PENDING: 409,
      };
      return c.json({
        ok: false,
        error: { code: err.code, message: err.message },
        requestId: c.get("requestId"),
      }, (statusMap[err.code] ?? 400) as 400);
    }
    throw err;
  }
});

// POST /connections/:id/decline — Decline connection request
connectionRoutes.post("/:id/decline", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const human = c.get("human");
  const connectionId = c.req.param("id");

  try {
    const service = new ConnectionService(db);
    await service.decline(connectionId, human.id);

    return c.json({
      ok: true,
      data: { declined: true },
      requestId: c.get("requestId"),
    });
  } catch (err) {
    if (err instanceof ConnectionError) {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        NOT_RECIPIENT: 403,
      };
      return c.json({
        ok: false,
        error: { code: err.code, message: err.message },
        requestId: c.get("requestId"),
      }, (statusMap[err.code] ?? 400) as 400);
    }
    throw err;
  }
});

// DELETE /connections/:id — Remove accepted connection
connectionRoutes.delete("/:id", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const human = c.get("human");
  const connectionId = c.req.param("id");

  try {
    const service = new ConnectionService(db);
    await service.remove(connectionId, human.id);

    return c.json({
      ok: true,
      data: { removed: true },
      requestId: c.get("requestId"),
    });
  } catch (err) {
    if (err instanceof ConnectionError) {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        NOT_PARTICIPANT: 403,
      };
      return c.json({
        ok: false,
        error: { code: err.code, message: err.message },
        requestId: c.get("requestId"),
      }, (statusMap[err.code] ?? 400) as 400);
    }
    throw err;
  }
});

// GET /connections — List accepted connections
connectionRoutes.get("/", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const human = c.get("human");
  const query = c.req.query();
  const parsed = listQuerySchema.safeParse(query);
  if (!parsed.success) {
    return c.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid query parameters" } }, 400);
  }

  const service = new ConnectionService(db);
  const result = await service.listAccepted(human.id, {
    cursor: parsed.data.cursor,
    limit: parsed.data.limit,
    domain: parsed.data.domain,
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

// GET /connections/pending — List pending requests received
connectionRoutes.get("/pending", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const human = c.get("human");
  const query = c.req.query();
  const parsed = paginationQuerySchema.safeParse(query);
  if (!parsed.success) {
    return c.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid query parameters" } }, 400);
  }

  const service = new ConnectionService(db);
  const result = await service.listPending(human.id, {
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

// GET /connections/suggestions — Algorithmic suggestions
connectionRoutes.get("/suggestions", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const human = c.get("human");
  const service = new ConnectionService(db);
  const suggestions = await service.getSuggestions(human.id);

  return c.json({
    ok: true,
    data: suggestions,
    requestId: c.get("requestId"),
  });
});

// GET /connections/status/:humanId — Check connection status
connectionRoutes.get("/status/:humanId", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const human = c.get("human");
  const targetId = c.req.param("humanId");

  const service = new ConnectionService(db);
  const status = await service.getStatus(human.id, targetId);

  return c.json({
    ok: true,
    data: status,
    requestId: c.get("requestId"),
  });
});

export default connectionRoutes;
