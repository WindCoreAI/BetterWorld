/**
 * Auth Routes Index (Sprint 6)
 *
 * Applies IP-based rate limiting to sensitive auth endpoints
 * to prevent brute-force and mass-registration attacks.
 */

import { Hono } from "hono";
import { createMiddleware } from "hono/factory";

import login from "./login.js";
import logout from "./logout.js";
import oauth from "./oauth.js";
import refresh from "./refresh.js";
import register from "./register.js";
import resendCode from "./resendCode.js";
import verifyEmail from "./verifyEmail.js";
import { logger } from "../../middleware/logger.js";

const auth = new Hono();

/**
 * IP-based rate limiter for auth endpoints.
 * Uses a separate Redis key namespace from the global rate limiter.
 */
function authRateLimit(opts: { limit: number; windowSec: number; prefix: string }) {
  return createMiddleware(async (c, next) => {
    const { getRedis } = await import("../../lib/container.js");
    const redis = getRedis();
    if (!redis) {
      // Degraded mode — allow requests if Redis is down
      await next();
      return;
    }

    const ip = c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ?? "unknown";
    const key = `auth:rl:${opts.prefix}:${ip}`;
    const now = Date.now();
    const windowMs = opts.windowSec * 1000;

    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, now - windowMs);
    pipeline.zcard(key);
    pipeline.zadd(key, now, `${now}:${Math.random()}`);
    pipeline.expire(key, opts.windowSec + 1);

    const results = await pipeline.exec();
    const count = (results?.[1]?.[1] as number) ?? 0;

    if (count >= opts.limit) {
      logger.warn({ ip, prefix: opts.prefix, count }, "Auth rate limit exceeded");
      c.header("Retry-After", String(opts.windowSec));
      return c.json(
        { ok: false, error: { code: "RATE_LIMITED" as const, message: "Too many attempts. Please try again later." }, requestId: c.get("requestId") },
        429,
      );
    }

    await next();
  });
}

// Apply rate limits to sensitive endpoints
// Login: 5 attempts per 5 minutes per IP
auth.use("/login/*", authRateLimit({ limit: 5, windowSec: 300, prefix: "login" }));
// Register: 3 accounts per 5 minutes per IP
auth.use("/register/*", authRateLimit({ limit: 3, windowSec: 300, prefix: "register" }));
// Verify email: 10 attempts per 5 minutes per IP (6-digit brute-force protection)
auth.use("/verify-email/*", authRateLimit({ limit: 10, windowSec: 300, prefix: "verify" }));

// Email/Password routes
auth.route("/register", register);
auth.route("/verify-email", verifyEmail);
auth.route("/resend-code", resendCode);
auth.route("/login", login);
auth.route("/refresh", refresh);
auth.route("/logout", logout);

// OAuth routes
auth.route("/oauth", oauth);

export default auth;
