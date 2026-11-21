/* eslint-disable complexity, max-lines-per-function */
import crypto from "crypto";

import { AppError, isAdminEmail, loadConfig } from "@betterworld/shared";
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
      ownerHumanId: string | null;
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
  ownerHumanId: string | null;
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
        ownerHumanId: agents.ownerHumanId,
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
      ownerHumanId: agent.ownerHumanId,
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
 * Whether a human account is an operator: either its stored role is "admin",
 * or its verified email is listed in ADMIN_EMAILS.
 */
export function isOperatorAccount(human: {
  role: string;
  email: string;
  emailVerified: boolean;
}): boolean {
  if (human.role === "admin") return true;
  return human.emailVerified && isAdminEmail(human.email);
}

/**
 * Require an operator.
 *
 * Accepts the access token of a signed-in human who is an operator (see
 * isOperatorAccount) — so the person running an instance reviews content with
 * their normal login. Tokens that carry an explicit `role: "admin"` claim are
 * still accepted for service-to-service use.
 *
 * Until this accepted normal sign-ins there was no way to obtain a token the
 * review queue would accept: no endpoint ever issued one.
 */
export function requireAdmin() {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError("UNAUTHORIZED", "Missing or invalid Authorization header");
    }

    const token = authHeader.slice(7);
    const secret = new TextEncoder().encode(getConfig().JWT_SECRET);

    let payload: jose.JWTPayload;
    try {
      ({ payload } = await jose.jwtVerify(token, secret));
    } catch (err) {
      if (err instanceof jose.errors.JWTExpired) {
        throw new AppError("TOKEN_EXPIRED", "JWT has expired");
      }
      throw new AppError("UNAUTHORIZED", "Invalid JWT");
    }

    // Service token with an explicit admin role claim
    if (payload.role === "admin" && typeof payload.sub === "string") {
      c.set("user", {
        sub: payload.sub,
        role: "admin",
        email: payload.email as string,
        displayName: payload.displayName as string,
      });
      c.set("authRole", "admin");
      await next();
      return;
    }

    // Signed-in human: look the account up and check it is an operator
    const userId = typeof payload.userId === "string" ? payload.userId : undefined;
    if (!userId || payload.type === "refresh") {
      throw new AppError("FORBIDDEN", "Admin access required");
    }

    const { getDb } = await import("../lib/container.js");
    const db = getDb();
    if (!db) {
      throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
    }

    const { eq } = await import("drizzle-orm");
    const { humans } = await import("@betterworld/db");
    const [human] = await db
      .select({
        id: humans.id,
        email: humans.email,
        displayName: humans.displayName,
        role: humans.role,
        isActive: humans.isActive,
        emailVerified: humans.emailVerified,
      })
      .from(humans)
      .where(eq(humans.id, userId))
      .limit(1);

    if (!human || !human.isActive) {
      throw new AppError("UNAUTHORIZED", "Account not found or deactivated");
    }
    if (!isOperatorAccount(human)) {
      throw new AppError("FORBIDDEN", "Admin access required");
    }

    c.set("user", {
      sub: human.id,
      role: "admin",
      email: human.email,
      displayName: human.displayName,
    });
    c.set("authRole", "admin");
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
        if (payload.type === "refresh") {
          // Refresh tokens are only valid at the refresh endpoint.
          throw new Error("refresh token presented as access token");
        }
        c.set("user", {
          // Human access tokens carry `userId`, not `sub`. Without this fallback
          // every signed-in human shared one identity ("undefined") — and with it
          // one rate-limit bucket for the whole platform.
          sub: (payload.sub ?? payload.userId) as string,
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
              ownerHumanId: agents.ownerHumanId,
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
                ownerHumanId: agent.ownerHumanId,
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
        // DB/Redis lookup error — reject with 401 since header was present
      }

      // FR-027: Authorization header was present but both JWT and API key failed.
      // Return 401 instead of falling through to public role.
      return c.json(
        {
          ok: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid or expired credentials",
          },
          requestId: c.get("requestId"),
        },
        401,
      );
    }

    // No Authorization header at all → public access
    c.set("authRole", "public");
    await next();
  });
}
