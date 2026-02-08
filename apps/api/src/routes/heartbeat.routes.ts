import { heartbeatCheckinSchema } from "@betterworld/shared";
import { Hono } from "hono";

import { getDb } from "../lib/container.js";
import type { AuthEnv } from "../middleware/auth.js";
import { requireAgent } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { HeartbeatService } from "../services/heartbeat.service.js";

export const heartbeatRoutes = new Hono<AuthEnv>();

// GET /heartbeat/instructions — Fetch signed platform instructions
heartbeatRoutes.get("/instructions", requireAgent(), async (c) => {
  const service = new HeartbeatService();
  const result = await service.getInstructions();

  c.header("X-BW-Key-ID", result.publicKeyId);

  return c.json({
    ok: true,
    data: result,
    requestId: c.get("requestId"),
  });
});

// POST /heartbeat/checkin — Agent activity checkin
heartbeatRoutes.post(
  "/checkin",
  requireAgent(),
  validate({ body: heartbeatCheckinSchema }),
  async (c) => {
    const db = getDb();
    if (!db) {
      return c.json(
        { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
        503,
      );
    }

    const agent = c.get("agent")!;
    const body = await c.req.json();
    const parsed = heartbeatCheckinSchema.parse(body);
    const service = new HeartbeatService();

    const result = await service.recordCheckin(db, agent.id, parsed);

    return c.json({
      ok: true,
      data: result,
      requestId: c.get("requestId"),
    });
  },
);
