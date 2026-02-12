/**
 * POST /auth/login - Email/Password Login (Sprint 6)
 */

import { humans, sessions } from "@betterworld/db";
import { LoginSchema } from "@betterworld/shared/schemas/human";
import { zValidator } from "@hono/zod-validator";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { generateTokenPair, hashToken } from "../../lib/auth-helpers.js";
import { getDb, getRedis } from "../../lib/container.js";
import { logger } from "../../middleware/logger.js";

const app = new Hono<AppEnv>();

type RedisLike = { get: (k: string) => Promise<string | null>; incr: (k: string) => Promise<number>; expire: (k: string, s: number) => Promise<unknown>; del: (k: string) => Promise<unknown> };

async function checkLoginRateLimit(redis: RedisLike | null, rateKey: string): Promise<boolean> {
  if (!redis) return false;
  try {
    const attempts = await redis.get(rateKey);
    return !!(attempts && parseInt(attempts, 10) >= 5);
  } catch {
    return false; // Fail open
  }
}

async function incrementLoginRateLimit(redis: RedisLike | null, rateKey: string): Promise<void> {
  if (!redis) return;
  try {
    const count = await redis.incr(rateKey);
    if (count === 1) await redis.expire(rateKey, 900);
  } catch { /* fail open */ }
}

async function clearLoginRateLimit(redis: RedisLike | null, rateKey: string): Promise<void> {
  if (!redis) return;
  try { await redis.del(rateKey); } catch { /* non-fatal */ }
}

app.post("/", zValidator("json", LoginSchema), async (c) => {
  const { email, password } = c.req.valid("json");

  try {
    const db = getDb();
    const redis = getRedis();
    if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE" as const, message: "Database not available" }, requestId: c.get("requestId") }, 503);

    const loginRateKey = `rate:login:${email}`;
    if (await checkLoginRateLimit(redis, loginRateKey)) {
      return c.json(
        { ok: false, error: { code: "RATE_LIMITED" as const, message: "Too many login attempts. Try again in 15 minutes." }, requestId: c.get("requestId") },
        429,
      );
    }

    const [user] = await db
      .select()
      .from(humans)
      .where(eq(humans.email, email))
      .limit(1);

    if (!user || !user.passwordHash) {
      await incrementLoginRateLimit(redis, loginRateKey);
      return c.json(
        { ok: false, error: { code: "INVALID_CREDENTIALS" as const, message: "Invalid email or password" }, requestId: c.get("requestId") },
        401,
      );
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      await incrementLoginRateLimit(redis, loginRateKey);
      return c.json(
        { ok: false, error: { code: "INVALID_CREDENTIALS" as const, message: "Invalid email or password" }, requestId: c.get("requestId") },
        401,
      );
    }

    await clearLoginRateLimit(redis, loginRateKey);

    if (!user.emailVerified) {
      return c.json(
        { ok: false, error: { code: "EMAIL_NOT_VERIFIED" as const, message: "Please verify your email before logging in" }, requestId: c.get("requestId") },
        403,
      );
    }

    if (!user.isActive) {
      return c.json(
        { ok: false, error: { code: "ACCOUNT_DEACTIVATED" as const, message: "Account is deactivated" }, requestId: c.get("requestId") },
        403,
      );
    }

    const { accessToken, refreshToken, expiresIn } = await generateTokenPair(user.id, user.email);

    await db.insert(sessions).values({
      userId: user.id,
      sessionToken: hashToken(accessToken),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      refreshToken: hashToken(refreshToken),
      refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return c.json({
      ok: true,
      data: {
        accessToken,
        refreshToken,
        expiresIn,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        },
      },
      requestId: c.get("requestId"),
    });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : "Unknown" }, "Login failed");
    return c.json(
      { ok: false, error: { code: "INTERNAL_ERROR" as const, message: "Login failed" }, requestId: c.get("requestId") },
      500,
    );
  }
});

export default app;
