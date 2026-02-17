import {
  verifyAgentSchema,
} from "@betterworld/shared";
import { Hono } from "hono";

import { getDb, getRedis } from "../lib/container.js";
import type { AuthEnv } from "../middleware/auth.js";
import { requireAgent } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { validate } from "../middleware/validate.js";
import { AgentService } from "../services/agent.service.js";

export const authRoutes = new Hono<AuthEnv>();

// POST /auth/agents/register — DEPRECATED (Sprint 19)
// Uses custom handler (NOT humanAuth()) so it can return a deprecation message.
// Unauthenticated: 401 + deprecation message + X-BW-Deprecated header
// Authenticated human: 410 Gone + redirect hint to /v1/my-agents
authRoutes.post(
  "/agents/register",
  async (c) => {
    // Check if there's a human Bearer token
    const authHeader = c.req.header("Authorization");
    let isHumanAuth = false;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      try {
        const { loadConfig } = await import("@betterworld/shared");
        const config = loadConfig();
        const secret = new TextEncoder().encode(config.JWT_SECRET);
        const joseModule = await import("jose");
        const { payload } = await joseModule.jwtVerify(token, secret);
        if (payload.userId && !payload.type) {
          // It's a human JWT (not a refresh token and not an agent API key)
          isHumanAuth = true;
        }
      } catch {
        // Token is invalid or expired — treat as unauthenticated
      }
    }

    if (isHumanAuth) {
      // Authenticated human caller gets 410 Gone
      return c.json(
        {
          ok: false,
          error: {
            code: "DEPRECATED",
            message: "This endpoint is deprecated. Manage your agents at /v1/my-agents.",
          },
          requestId: c.get("requestId"),
        },
        410,
        {
          "X-BW-Deprecated": "true",
          Location: "/v1/my-agents",
        },
      );
    }

    // Unauthenticated caller gets 401
    return c.json(
      {
        ok: false,
        error: {
          code: "DEPRECATED",
          message: "Agent registration now requires a human account. Register at /auth/human/register first, then manage agents at /my-agents.",
        },
        requestId: c.get("requestId"),
      },
      401,
      {
        "X-BW-Deprecated": "true",
      },
    );
  },
);

// POST /auth/agents/verify — Verify agent email
authRoutes.post(
  "/agents/verify",
  requireAgent(),
  rateLimit(),
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
  rateLimit(),
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
  rateLimit(),
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
