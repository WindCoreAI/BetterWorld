/**
 * My Agents Routes (Sprint 19 - Human-First Agent Onboarding)
 *
 * All 7 endpoints require humanAuth() middleware.
 * Humans create, list, view, update, rotate keys, deactivate, and reactivate agents.
 */

import { humans } from "@betterworld/db";
import { createAgentSchema, updateAgentSchema } from "@betterworld/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../app.js";
import { getDb, getRedis } from "../lib/container.js";
import { humanAuth } from "../middleware/humanAuth.js";
import { logger } from "../middleware/logger.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { validate } from "../middleware/validate.js";
import { AgentService } from "../services/agent.service.js";

const app = new Hono<AppEnv>();

// POST /my-agents — Create Agent
app.post(
  "/",
  humanAuth(),
  rateLimit(),
  validate({ body: createAgentSchema }),
  async (c) => {
    const db = getDb();
    if (!db) {
      return c.json(
        { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
        503,
      );
    }

    const human = c.get("human");
    const body = await c.req.json();
    const parsed = createAgentSchema.parse(body);
    const service = new AgentService(db, getRedis());

    // Check human's email verification status for FR-005
    const [humanRecord] = await db
      .select({ emailVerified: humans.emailVerified })
      .from(humans)
      .where(eq(humans.id, human.id))
      .limit(1);

    const emailVerified = humanRecord?.emailVerified ?? false;

    const result = await service.createForHuman(human.id, emailVerified, parsed);

    // Issue starter credit grant (fail gracefully per edge case 5)
    let creditBalance = 0;
    try {
      const { AgentCreditService } = await import("../services/agent-credit.service.js");
      const creditService = new AgentCreditService(db);
      await creditService.issueStarterGrant(result.agentId);
      creditBalance = 50;
    } catch (err) {
      logger.warn(
        { agentId: result.agentId, error: err instanceof Error ? err.message : "Unknown" },
        "Failed to issue starter grant during human agent creation",
      );
    }

    return c.json(
      {
        ok: true,
        data: {
          agentId: result.agentId,
          username: result.username,
          apiKey: result.apiKey,
          claimStatus: result.claimStatus,
          creditBalance,
        },
        requestId: c.get("requestId"),
      },
      201,
    );
  },
);

// GET /my-agents — List Owned Agents
app.get("/", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const human = c.get("human");
  const cursor = c.req.query("cursor") || undefined;
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "20", 10) || 20, 1), 50);

  const service = new AgentService(db, getRedis());
  const result = await service.listByOwner(human.id, cursor, limit);

  return c.json({
    ok: true,
    data: result,
    requestId: c.get("requestId"),
  });
});

// GET /my-agents/:id — Get Owned Agent Detail
app.get("/:id", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const human = c.get("human");
  const agentId = c.req.param("id");
  const service = new AgentService(db, getRedis());

  const result = await service.getOwnedAgent(agentId, human.id);

  return c.json({
    ok: true,
    data: result,
    requestId: c.get("requestId"),
  });
});

// PATCH /my-agents/:id — Update Owned Agent
app.patch(
  "/:id",
  humanAuth(),
  rateLimit(),
  validate({ body: updateAgentSchema }),
  async (c) => {
    const db = getDb();
    if (!db) {
      return c.json(
        { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
        503,
      );
    }

    const human = c.get("human");
    const agentId = c.req.param("id");
    const body = await c.req.json();
    const parsed = updateAgentSchema.parse(body);
    const service = new AgentService(db, getRedis());

    const result = await service.updateOwnedAgent(agentId, human.id, parsed);

    return c.json({
      ok: true,
      data: result,
      requestId: c.get("requestId"),
    });
  },
);

// POST /my-agents/:id/rotate-key — Rotate API Key
app.post("/:id/rotate-key", humanAuth(), rateLimit(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const human = c.get("human");
  const agentId = c.req.param("id");
  const service = new AgentService(db, getRedis());

  const result = await service.rotateKeyForOwner(agentId, human.id);

  return c.json({
    ok: true,
    data: {
      apiKey: result.apiKey,
      previousKeyExpiresAt: result.previousKeyExpiresAt.toISOString(),
      warning:
        "Your previous API key will remain valid until the expiration time shown. Update your agent configuration before then.",
    },
    requestId: c.get("requestId"),
  });
});

// POST /my-agents/:id/deactivate — Deactivate Agent
app.post("/:id/deactivate", humanAuth(), rateLimit(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const human = c.get("human");
  const agentId = c.req.param("id");
  const service = new AgentService(db, getRedis());

  const result = await service.deactivateOwnedAgent(agentId, human.id);

  return c.json({
    ok: true,
    data: result,
    requestId: c.get("requestId"),
  });
});

// POST /my-agents/:id/reactivate — Reactivate Agent
app.post("/:id/reactivate", humanAuth(), rateLimit(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const human = c.get("human");
  const agentId = c.req.param("id");
  const service = new AgentService(db, getRedis());

  const result = await service.reactivateOwnedAgent(agentId, human.id);

  return c.json({
    ok: true,
    data: result,
    requestId: c.get("requestId"),
  });
});

export default app;
