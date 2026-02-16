/**
 * Impact Routes (Sprint 16: Social Fabric Foundation)
 *
 * 2 endpoints: impact chain (public), my ripple (authenticated).
 */
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.js";
import { getDb } from "../lib/container.js";
import { humanAuth } from "../middleware/humanAuth.js";
import { ImpactChainService } from "../services/impact-chain.service.js";

const impactRoutes = new Hono<AppEnv>();

// GET /impact/chain/:problemId — Public impact chain visualization
impactRoutes.get("/chain/:problemId", async (c) => {
  const db = getDb();
  if (!db) {
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);
  }

  const problemId = c.req.param("problemId");
  const parsed = z.string().uuid().safeParse(problemId);
  if (!parsed.success) {
    return c.json({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid problemId format" },
      requestId: c.get("requestId"),
    }, 400);
  }

  try {
    const service = new ImpactChainService(db);
    const chain = await service.getChain(parsed.data);

    return c.json({
      ok: true,
      data: chain,
      requestId: c.get("requestId"),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Problem not found") {
      return c.json({
        ok: false,
        error: { code: "NOT_FOUND", message: "Problem not found" },
        requestId: c.get("requestId"),
      }, 404);
    }
    throw err;
  }
});

// GET /impact/my-ripple — Personal ripple effect summary
impactRoutes.get("/my-ripple", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);
  }

  const human = c.get("human");
  const service = new ImpactChainService(db);
  const ripple = await service.getMyRipple(human.id);

  return c.json({
    ok: true,
    data: ripple,
    requestId: c.get("requestId"),
  });
});

export default impactRoutes;
