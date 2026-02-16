/**
 * Network Routes (Sprint 16: Social Fabric Foundation)
 *
 * 2 endpoints: network summary, interaction history.
 */
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.js";
import { getDb } from "../lib/container.js";
import { humanAuth } from "../middleware/humanAuth.js";
import { NetworkService } from "../services/network.service.js";

const networkRoutes = new Hono<AppEnv>();

// GET /network/me — Personal network summary
networkRoutes.get("/me", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);
  }

  const human = c.get("human");
  const service = new NetworkService(db);
  const summary = await service.getNetworkSummary(human.id);

  return c.json({
    ok: true,
    data: summary,
    requestId: c.get("requestId"),
  });
});

// GET /network/me/interactions — Interaction history with a partner
networkRoutes.get("/me/interactions", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);
  }

  const human = c.get("human");
  const partnerId = c.req.query("partnerId");

  const parsed = z.string().uuid().safeParse(partnerId);
  if (!parsed.success) {
    return c.json({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "partnerId query parameter is required and must be a UUID" },
      requestId: c.get("requestId"),
    }, 400);
  }

  try {
    const service = new NetworkService(db);
    const history = await service.getInteractionHistory(human.id, parsed.data);

    return c.json({
      ok: true,
      data: history,
      requestId: c.get("requestId"),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Partner not found") {
      return c.json({
        ok: false,
        error: { code: "NOT_FOUND", message: "Partner not found" },
        requestId: c.get("requestId"),
      }, 404);
    }
    throw err;
  }
});

export default networkRoutes;
