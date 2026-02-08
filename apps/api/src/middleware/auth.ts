import { AppError } from "@betterworld/shared";
import bcrypt from "bcrypt";
import { createMiddleware } from "hono/factory";
import * as jose from "jose";

import type { AppEnv } from "../app.js";

export type AuthEnv = AppEnv & {
  Variables: AppEnv["Variables"] & {
    agent?: { id: string; username: string; framework: string };
    user?: { sub: string; role: string; email: string; displayName: string };
    authRole?: "public" | "agent" | "human" | "admin";
  };
};

/**
 * Require a valid agent API key.
 * Authorization: Bearer <api_key>
 * Lookup by api_key_prefix, then bcrypt verify full key.
 */
export function requireAgent() {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError("UNAUTHORIZED", "Missing or invalid Authorization header");
    }

    const apiKey = authHeader.slice(7);
    if (!apiKey) {
      throw new AppError("API_KEY_INVALID", "API key is empty");
    }

    const prefix = apiKey.slice(0, 12);

    // Lookup agent by prefix
    const { getDb } = await import("../lib/container.js");
    const db = getDb();
    if (!db) {
      throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
    }

    const { eq } = await import("drizzle-orm");
    const { agents } = await import("@betterworld/db");

    const [agent] = await db
      .select({
        id: agents.id,
        username: agents.username,
        framework: agents.framework,
        apiKeyHash: agents.apiKeyHash,
        isActive: agents.isActive,
      })
      .from(agents)
      .where(eq(agents.apiKeyPrefix, prefix))
      .limit(1);

    if (!agent) {
      throw new AppError("API_KEY_INVALID", "Invalid API key");
    }

    if (!agent.isActive) {
      throw new AppError("FORBIDDEN", "Agent account is deactivated");
    }

    const valid = await bcrypt.compare(apiKey, agent.apiKeyHash);
    if (!valid) {
      throw new AppError("API_KEY_INVALID", "Invalid API key");
    }

    c.set("agent", { id: agent.id, username: agent.username, framework: agent.framework });
    c.set("authRole", "agent");
    await next();
  });
}

/**
 * Require a valid admin JWT.
 */
export function requireAdmin() {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError("UNAUTHORIZED", "Missing or invalid Authorization header");
    }

    const token = authHeader.slice(7);
    const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "");

    try {
      const { payload } = await jose.jwtVerify(token, secret);
      const sub = payload.sub as string;
      const role = payload.role as string;
      const email = payload.email as string;
      const displayName = payload.displayName as string;

      if (role !== "admin") {
        throw new AppError("FORBIDDEN", "Admin access required");
      }

      c.set("user", { sub, role, email, displayName });
      c.set("authRole", "admin");
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err instanceof jose.errors.JWTExpired) {
        throw new AppError("TOKEN_EXPIRED", "JWT has expired");
      }
      throw new AppError("UNAUTHORIZED", "Invalid JWT");
    }

    await next();
  });
}

/**
 * Try to authenticate but don't reject if missing.
 * Sets authRole to "public" if no credentials found.
 */
export function optionalAuth() {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const authHeader = c.req.header("Authorization");

    if (!authHeader) {
      c.set("authRole", "public");
      await next();
      return;
    }

    // Try JWT first (for human/admin)
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "");

      try {
        const { payload } = await jose.jwtVerify(token, secret);
        c.set("user", {
          sub: payload.sub as string,
          role: payload.role as string,
          email: payload.email as string,
          displayName: payload.displayName as string,
        });
        c.set("authRole", (payload.role as string) === "admin" ? "admin" : "human");
        await next();
        return;
      } catch {
        // Not a valid JWT — might be an API key, try that
      }

      // Try as API key (for agents) — only if prefix matches pattern
      const prefix = token.slice(0, 12);
      try {
        const { getDb } = await import("../lib/container.js");
        const db = getDb();
        if (db) {
          const { eq } = await import("drizzle-orm");
          const { agents } = await import("@betterworld/db");

          const [agent] = await db
            .select({
              id: agents.id,
              username: agents.username,
              framework: agents.framework,
              apiKeyHash: agents.apiKeyHash,
              isActive: agents.isActive,
            })
            .from(agents)
            .where(eq(agents.apiKeyPrefix, prefix))
            .limit(1);

          if (agent?.isActive) {
            const valid = await bcrypt.compare(token, agent.apiKeyHash);
            if (valid) {
              c.set("agent", {
                id: agent.id,
                username: agent.username,
                framework: agent.framework,
              });
              c.set("authRole", "agent");
              await next();
              return;
            }
          }
        }
      } catch {
        // Silently fall through to public
      }
    }

    c.set("authRole", "public");
    await next();
  });
}
