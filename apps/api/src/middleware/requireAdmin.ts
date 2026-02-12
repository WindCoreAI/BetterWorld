/**
 * Admin RBAC Middleware
 *
 * Enforces admin role on routes. Must be used AFTER humanAuth() in the
 * middleware chain so that `c.get("human")` is already populated.
 *
 * Usage: app.post("/admin/route", humanAuth(), requireAdmin(), handler)
 */

import { AppError } from "@betterworld/shared";
import { createMiddleware } from "hono/factory";

import type { AppEnv } from "../app.js";

/**
 * Middleware that rejects non-admin humans with 403 FORBIDDEN.
 * Assumes humanAuth() has already run and set `human` on context.
 */
export function requireAdmin() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const human = c.get("human");

    if (!human) {
      throw new AppError("UNAUTHORIZED", "Authentication required");
    }

    if (human.role !== "admin") {
      throw new AppError("FORBIDDEN", "Admin access required");
    }

    await next();
  });
}
