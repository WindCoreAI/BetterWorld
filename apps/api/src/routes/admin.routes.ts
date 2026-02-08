import { Hono } from "hono";
import { z } from "zod";

import { getDb, getRedis } from "../lib/container.js";
import type { AuthEnv } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { AgentService } from "../services/agent.service.js";

export const adminRoutes = new Hono<AuthEnv>();

const rateLimitSchema = z.object({
  limit: z.number().int().min(1).max(1000).nullable(),
});

const verificationSchema = z.object({
  claimStatus: z.enum(["pending", "verified"]),
});

// PUT /admin/agents/:id/rate-limit — Set per-agent rate limit override
adminRoutes.put(
  "/agents/:id/rate-limit",
  requireAdmin(),
  validate({ body: rateLimitSchema }),
  async (c) => {
    const db = getDb();
    if (!db) {
      return c.json(
        { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
        503,
      );
    }

    const agentId = c.req.param("id");
    const body = await c.req.json();
    const parsed = rateLimitSchema.parse(body);
    const service = new AgentService(db, getRedis());

    const result = await service.setRateLimitOverride(agentId, parsed.limit);

    return c.json({
      ok: true,
      data: result,
      requestId: c.get("requestId"),
    });
  },
);

// PATCH /admin/agents/:id/verification — Manually set agent verification status
adminRoutes.patch(
  "/agents/:id/verification",
  requireAdmin(),
  validate({ body: verificationSchema }),
  async (c) => {
    const db = getDb();
    if (!db) {
      return c.json(
        { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
        503,
      );
    }

    const agentId = c.req.param("id");
    const body = await c.req.json();
    const parsed = verificationSchema.parse(body);
    const service = new AgentService(db, getRedis());

    const result = await service.setVerificationStatus(agentId, parsed.claimStatus);

    return c.json({
      ok: true,
      data: result,
      requestId: c.get("requestId"),
    });
  },
);
