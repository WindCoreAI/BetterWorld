/* eslint-disable complexity, max-lines-per-function */
import crypto from "crypto";

import { AppError, loadConfig } from "@betterworld/shared";
import type { ClaimStatus } from "@betterworld/shared";
import bcrypt from "bcrypt";
import { createMiddleware } from "hono/factory";
import * as jose from "jose";

import type { AppEnv } from "../app.js";
import { logger } from "./logger.js";

// Lazy-load config to avoid initialization errors in tests
const getConfig = () => loadConfig();

export type AuthEnv = AppEnv & {
  Variables: AppEnv["Variables"] & {
    agent?: {
      id: string;
      username: string;
      framework: string;
      claimStatus: ClaimStatus;
      rateLimitOverride: number | null;
    };
    user?: { sub: string; role: string; email: string; displayName: string };
    authRole?: "public" | "agent" | "human" | "admin";
  };
};

interface CachedAgent {
  id: string;
  username: string;
  framework: string;
  claimStatus: ClaimStatus;
  rateLimitOverride: number | null;
}

const AUTH_CACHE_TTL = 300; // 5 minutes

function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Require a valid agent API key.
 * Authorization: Bearer <api_key>
 * Check Redis cache first, fallback to DB prefix lookup + bcrypt verify.
 * Supports previous key during rotation grace period.
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

    const { getDb, getRedis } = await import("../lib/container.js");
    const db = getDb();
    const redis = getRedis();

    if (!db) {
      throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
    }

    // Check Redis cache first
    const cacheKey = `auth:${sha256(apiKey)}`;
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const agent: CachedAgent = JSON.parse(cached);
          c.set("agent", agent);
          c.set("authRole", "agent");
          await next();
          return;
        }
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : "Unknown", cacheKey },
          "Auth cache read failed, falling back to DB",
        );
      }
    }

    const prefix = apiKey.slice(0, 12);

    const { eq } = await import("drizzle-orm");
    const { agents } = await import("@betterworld/db");

    const { or } = await import("drizzle-orm");

    // Look up by current prefix OR previous prefix (for grace period)
    const [agent] = await db
      .select({
        id: agents.id,
        username: agents.username,
        framework: agents.framework,
        apiKeyHash: agents.apiKeyHash,
        isActive: agents.isActive,
        claimStatus: agents.claimStatus,
        rateLimitOverride: agents.rateLimitOverride,
        previousApiKeyHash: agents.previousApiKeyHash,
        previousApiKeyExpiresAt: agents.previousApiKeyExpiresAt,
      })
      .from(agents)
      .where(or(eq(agents.apiKeyPrefix, prefix), eq(agents.previousApiKeyPrefix, prefix)))
      .limit(1);

    if (!agent) {
      throw new AppError("API_KEY_INVALID", "Invalid API key");
    }

    if (!agent.isActive) {
      throw new AppError("FORBIDDEN", "Agent account is deactivated");
    }

    const valid = await bcrypt.compare(apiKey, agent.apiKeyHash);
    let isDeprecatedKey = false;

    if (!valid) {
      // Check if this is a previous key during grace period
      if (
        agent.previousApiKeyHash &&
        agent.previousApiKeyExpiresAt &&
        agent.previousApiKeyExpiresAt > new Date()
      ) {
        const previousValid = await bcrypt.compare(apiKey, agent.previousApiKeyHash);
        if (previousValid) {
          isDeprecatedKey = true;
        } else {
          throw new AppError("API_KEY_INVALID", "Invalid API key");
        }
      } else {
        throw new AppError("API_KEY_INVALID", "Invalid API key");
      }
    }

    if (isDeprecatedKey) {
      c.header("X-BW-Key-Deprecated", "true");
    }

    const agentData: CachedAgent = {
      id: agent.id,
      username: agent.username,
      framework: agent.framework,
      claimStatus: agent.claimStatus as ClaimStatus,
      rateLimitOverride: agent.rateLimitOverride,
    };

    // Cache the result
    if (redis) {
      try {
        await redis.setex(cacheKey, AUTH_CACHE_TTL, JSON.stringify(agentData));
        // Store reverse mapping for cache invalidation by agentId
        await redis.setex(`auth:agent:${agent.id}`, AUTH_CACHE_TTL, cacheKey);
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : "Unknown", agentId: agent.id },
          "Auth cache write failed",
        );
      }
    }

    c.set("agent", agentData);
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
    const secret = new TextEncoder().encode(getConfig().JWT_SECRET);

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
      const secret = new TextEncoder().encode(getConfig().JWT_SECRET);

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

      // Try as API key (for agents)
      const prefix = token.slice(0, 12);
      try {
        const { getDb, getRedis } = await import("../lib/container.js");
        const db = getDb();
        const redis = getRedis();

        // Check cache first
        const cacheKey = `auth:${sha256(token)}`;
        if (redis) {
          try {
            const cached = await redis.get(cacheKey);
            if (cached) {
              const agent: CachedAgent = JSON.parse(cached);
              c.set("agent", agent);
              c.set("authRole", "agent");
              await next();
              return;
            }
          } catch {
            // Cache miss, proceed to DB
          }
        }

        if (db) {
          const { eq, or } = await import("drizzle-orm");
          const { agents } = await import("@betterworld/db");

          const [agent] = await db
            .select({
              id: agents.id,
              username: agents.username,
              framework: agents.framework,
              apiKeyHash: agents.apiKeyHash,
              isActive: agents.isActive,
              claimStatus: agents.claimStatus,
              rateLimitOverride: agents.rateLimitOverride,
              previousApiKeyHash: agents.previousApiKeyHash,
              previousApiKeyExpiresAt: agents.previousApiKeyExpiresAt,
            })
            .from(agents)
            .where(or(eq(agents.apiKeyPrefix, prefix), eq(agents.previousApiKeyPrefix, prefix)))
            .limit(1);

          if (agent?.isActive) {
            let matched = false;
            let isDeprecated = false;
            const valid = await bcrypt.compare(token, agent.apiKeyHash);
            if (valid) {
              matched = true;
            } else if (
              agent.previousApiKeyHash &&
              agent.previousApiKeyExpiresAt &&
              agent.previousApiKeyExpiresAt > new Date()
            ) {
              const prevValid = await bcrypt.compare(token, agent.previousApiKeyHash);
              if (prevValid) {
                matched = true;
                isDeprecated = true;
              }
            }

            if (matched) {
              if (isDeprecated) {
                c.header("X-BW-Key-Deprecated", "true");
              }
              const agentData: CachedAgent = {
                id: agent.id,
                username: agent.username,
                framework: agent.framework,
                claimStatus: agent.claimStatus as ClaimStatus,
                rateLimitOverride: agent.rateLimitOverride,
              };

              // Cache
              if (redis) {
                try {
                  await redis.setex(cacheKey, AUTH_CACHE_TTL, JSON.stringify(agentData));
                  await redis.setex(`auth:agent:${agent.id}`, AUTH_CACHE_TTL, cacheKey);
                } catch {
                  // Non-fatal
                }
              }

              c.set("agent", agentData);
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
