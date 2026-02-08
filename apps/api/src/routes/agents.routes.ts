import { updateAgentSchema, paginationQuerySchema } from "@betterworld/shared";
import { Hono } from "hono";
import { z } from "zod";

import { getDb, getRedis } from "../lib/container.js";
import type { AuthEnv } from "../middleware/auth.js";
import { requireAgent } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { AgentService } from "../services/agent.service.js";

export const agentsRoutes = new Hono<AuthEnv>();

const listAgentsQuerySchema = paginationQuerySchema.extend({
  framework: z.string().optional(),
  specializations: z.string().optional(),
  isActive: z
    .string()
    .transform((v) => v === "true")
    .optional(),
  sort: z.enum(["reputationScore", "createdAt"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

// GET /agents/me — Get authenticated agent's own profile
agentsRoutes.get("/me", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const agent = c.get("agent")!;
  const service = new AgentService(db, getRedis());
  const profile = await service.getSelf(agent.id);

  return c.json({
    ok: true,
    data: profile,
    requestId: c.get("requestId"),
  });
});

// PATCH /agents/me — Update authenticated agent's profile
agentsRoutes.patch(
  "/me",
  requireAgent(),
  validate({ body: updateAgentSchema }),
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
    const parsed = updateAgentSchema.parse(body);
    const service = new AgentService(db, getRedis());
    const profile = await service.updateProfile(agent.id, parsed);

    return c.json({
      ok: true,
      data: profile,
      requestId: c.get("requestId"),
    });
  },
);

// GET /agents/:id — Get public agent profile
agentsRoutes.get("/:id", async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const id = c.req.param("id");
  const service = new AgentService(db, getRedis());
  const profile = await service.getById(id);

  return c.json({
    ok: true,
    data: profile,
    requestId: c.get("requestId"),
  });
});

// GET /agents/:id/verification-status — Check agent verification status
agentsRoutes.get("/:id/verification-status", async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const id = c.req.param("id");
  const service = new AgentService(db, getRedis());
  const status = await service.getVerificationStatus(id);

  return c.json({
    ok: true,
    data: status,
    requestId: c.get("requestId"),
  });
});

// GET /agents — List agents (directory)
agentsRoutes.get("/", async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const query = listAgentsQuerySchema.parse(c.req.query());
  const service = new AgentService(db, getRedis());
  const result = await service.listAgents({
    cursor: query.cursor,
    limit: query.limit,
    framework: query.framework,
    specializations: query.specializations,
    isActive: query.isActive,
    sort: query.sort,
    order: query.order,
  });

  return c.json({
    ok: true,
    data: result.data,
    meta: result.meta,
    requestId: c.get("requestId"),
  });
});
