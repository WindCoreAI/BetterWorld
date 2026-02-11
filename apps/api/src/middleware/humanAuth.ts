/**
 * Human JWT Authentication Middleware (Sprint 6)
 *
 * Verifies JWT access tokens (signed with jose) and attaches human to context.
 * Uses the container pattern for DB access and loadConfig for env validation.
 */

import { humans } from "@betterworld/db";
import { loadConfig } from "@betterworld/shared";
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import * as jose from "jose";

import type { AppEnv } from "../app.js";
import { logger } from "./logger.js";
import { getDb } from "../lib/container.js";

const getConfig = () => loadConfig();

export interface HumanContext {
  human: {
    id: string;
    email: string;
    displayName: string;
    role: string;
  };
}

/**
 * Middleware to verify JWT access token and attach human to context.
 * Usage: app.post("/route", humanAuth(), handler)
 */
export function humanAuth() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const authHeader = c.req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json(
        {
          ok: false,
          error: {
            code: "UNAUTHORIZED" as const,
            message: "Missing or invalid Authorization header",
          },
        },
        401,
      );
    }

    const token = authHeader.substring(7);

    try {
      const secret = new TextEncoder().encode(getConfig().JWT_SECRET);
      const { payload } = await jose.jwtVerify(token, secret);

      const userId = payload.userId as string;
      if (!userId) {
        return c.json(
          {
            ok: false,
            error: {
              code: "UNAUTHORIZED" as const,
              message: "Invalid token payload",
            },
          },
          401,
        );
      }

      const db = getDb();
      if (!db) {
        return c.json(
          {
            ok: false,
            error: {
              code: "SERVICE_UNAVAILABLE" as const,
              message: "Database not available",
            },
          },
          503,
        );
      }

      const [human] = await db
        .select({
          id: humans.id,
          email: humans.email,
          displayName: humans.displayName,
          role: humans.role,
          isActive: humans.isActive,
        })
        .from(humans)
        .where(eq(humans.id, userId))
        .limit(1);

      if (!human) {
        return c.json(
          {
            ok: false,
            error: {
              code: "UNAUTHORIZED" as const,
              message: "User not found",
            },
          },
          401,
        );
      }

      if (!human.isActive) {
        return c.json(
          {
            ok: false,
            error: {
              code: "FORBIDDEN" as const,
              message: "Account is deactivated",
            },
          },
          403,
        );
      }

      c.set("human", {
        id: human.id,
        email: human.email,
        displayName: human.displayName,
        role: human.role,
      });

      await next();
    } catch (error) {
      if (error instanceof jose.errors.JWTExpired) {
        return c.json(
          {
            ok: false,
            error: {
              code: "TOKEN_EXPIRED" as const,
              message: "Access token has expired. Please refresh.",
            },
          },
          401,
        );
      }

      logger.warn(
        { error: error instanceof Error ? error.message : "Unknown" },
        "Human auth token verification failed",
      );

      return c.json(
        {
          ok: false,
          error: {
            code: "UNAUTHORIZED" as const,
            message: "Invalid access token",
          },
        },
        401,
      );
    }
  });
}
