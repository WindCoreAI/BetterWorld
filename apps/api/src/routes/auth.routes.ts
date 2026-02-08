import {
  registerAgentSchema,
  verifyAgentSchema,
} from "@betterworld/shared";
import { Hono } from "hono";

import { getDb, getRedis } from "../lib/container.js";
import type { AuthEnv } from "../middleware/auth.js";
import { requireAgent } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { AgentService } from "../services/agent.service.js";

export const authRoutes = new Hono<AuthEnv>();

// POST /auth/agents/register — Register a new agent (no auth required)
authRoutes.post(
  "/agents/register",
  validate({ body: registerAgentSchema }),
  async (c) => {
    const db = getDb();
    if (!db) {
      return c.json(
        { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
        503,
      );
    }

    const body = await c.req.json();
    const parsed = registerAgentSchema.parse(body);
    const service = new AgentService(db, getRedis());

    const result = await service.register(parsed);

    // If email was provided and verification code generated, log it in dev
    if (result.verificationCode) {
      const { getEmailService } = await import("../services/email.service.js");
      const emailService = getEmailService();
      await emailService.sendVerificationCode(
        parsed.email!,
        result.verificationCode,
        parsed.username,
      );
    }

    return c.json(
      {
        ok: true,
        data: {
          agentId: result.agentId,
          apiKey: result.apiKey,
          username: result.username,
        },
        requestId: c.get("requestId"),
      },
      201,
    );
  },
);

// POST /auth/agents/verify — Verify agent email
authRoutes.post(
  "/agents/verify",
  requireAgent(),
  validate({ body: verifyAgentSchema }),
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
    const parsed = verifyAgentSchema.parse(body);
    const service = new AgentService(db, getRedis());

    const result = await service.verifyEmail(agent.id, parsed.verificationCode);

    return c.json({
      ok: true,
      data: result,
      requestId: c.get("requestId"),
    });
  },
);

// POST /auth/agents/verify/resend — Resend verification code
authRoutes.post(
  "/agents/verify/resend",
  requireAgent(),
  async (c) => {
    const db = getDb();
    if (!db) {
      return c.json(
        { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
        503,
      );
    }

    const agent = c.get("agent")!;
    const service = new AgentService(db, getRedis());

    const result = await service.resendVerificationCode(agent.id);

    // Send the code
    const { getEmailService } = await import("../services/email.service.js");
    const emailService = getEmailService();
    await emailService.sendVerificationCode(
      result.email,
      result.verificationCode,
      agent.username,
    );

    return c.json({
      ok: true,
      data: {
        message: "Verification code sent",
        expiresIn: result.expiresIn,
      },
      requestId: c.get("requestId"),
    });
  },
);

// POST /auth/agents/rotate-key — Rotate API key
authRoutes.post(
  "/agents/rotate-key",
  requireAgent(),
  async (c) => {
    const db = getDb();
    if (!db) {
      return c.json(
        { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
        503,
      );
    }

    const agent = c.get("agent")!;
    const service = new AgentService(db, getRedis());

    const result = await service.rotateKey(agent.id);

    return c.json({
      ok: true,
      data: {
        apiKey: result.apiKey,
        previousKeyExpiresAt: result.previousKeyExpiresAt.toISOString(),
      },
      requestId: c.get("requestId"),
    });
  },
);
