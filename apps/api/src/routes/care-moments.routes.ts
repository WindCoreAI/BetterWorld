/**
 * Care Moments Routes (Sprint 16: Social Fabric Foundation)
 *
 * 2 endpoints: cheer and celebrate.
 */
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.js";
import { getDb } from "../lib/container.js";
import { humanAuth } from "../middleware/humanAuth.js";
import { CareMomentService, CareMomentError } from "../services/care-moment.service.js";

const careMomentRoutes = new Hono<AppEnv>();

const cheerSchema = z.object({
  targetHumanId: z.string().uuid(),
  notificationId: z.string().uuid().optional(),
  includeGift: z.boolean().default(false),
});

const celebrateSchema = z.object({
  targetHumanId: z.string().uuid(),
  milestoneType: z.enum(["mission_count", "tier_promotion", "streak_record"]),
  notificationId: z.string().uuid().optional(),
  includeGift: z.boolean().default(false),
});

// POST /care/cheer — Send a cheer
careMomentRoutes.post("/cheer", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);
  }

  const human = c.get("human");
  const body = await c.req.json();
  const parsed = cheerSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid request body" },
      requestId: c.get("requestId"),
    }, 400);
  }

  try {
    const service = new CareMomentService(db);
    const result = await service.sendCheer(
      human.id,
      human.displayName,
      parsed.data.targetHumanId,
      {
        notificationId: parsed.data.notificationId,
        includeGift: parsed.data.includeGift,
      },
    );

    return c.json({
      ok: true,
      data: result,
      requestId: c.get("requestId"),
    }, 201);
  } catch (err) {
    if (err instanceof CareMomentError) {
      const statusMap: Record<string, number> = {
        SELF_CHEER: 400,
        NOT_FOUND: 404,
        INSUFFICIENT_BALANCE: 400,
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

// POST /care/celebrate — Send a celebration
careMomentRoutes.post("/celebrate", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);
  }

  const human = c.get("human");
  const body = await c.req.json();
  const parsed = celebrateSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid request body" },
      requestId: c.get("requestId"),
    }, 400);
  }

  try {
    const service = new CareMomentService(db);
    const result = await service.sendCelebrate(
      human.id,
      human.displayName,
      parsed.data.targetHumanId,
      parsed.data.milestoneType,
      {
        notificationId: parsed.data.notificationId,
        includeGift: parsed.data.includeGift,
      },
    );

    return c.json({
      ok: true,
      data: result,
      requestId: c.get("requestId"),
    }, 201);
  } catch (err) {
    if (err instanceof CareMomentError) {
      const statusMap: Record<string, number> = {
        SELF_CELEBRATE: 400,
        NOT_FOUND: 404,
        INSUFFICIENT_BALANCE: 400,
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

export default careMomentRoutes;
