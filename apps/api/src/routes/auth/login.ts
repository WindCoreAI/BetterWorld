/**
 * POST /auth/login - Email/Password Login (Sprint 6)
 */

import { LoginSchema } from "@betterworld/shared/schemas/human";
import { zValidator } from "@hono/zod-validator";
import bcrypt from "bcrypt";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { generateTokenPair } from "../../lib/auth-helpers.js";
import { logger } from "../../middleware/logger.js";

const app = new Hono<AppEnv>();

app.post("/", zValidator("json", LoginSchema), async (c) => {
  const { email, password } = c.req.valid("json");

  try {
    const { getDb } = await import("../../lib/container.js");
    const db = getDb();
    if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE" as const, message: "Database not available" }, requestId: c.get("requestId") }, 503);

    const { eq } = await import("drizzle-orm");
    const { humans } = await import("@betterworld/db");

    const [user] = await db
      .select()
      .from(humans)
      .where(eq(humans.email, email))
      .limit(1);

    if (!user || !user.passwordHash) {
      return c.json(
        { ok: false, error: { code: "INVALID_CREDENTIALS" as const, message: "Invalid email or password" }, requestId: c.get("requestId") },
        401,
      );
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      return c.json(
        { ok: false, error: { code: "INVALID_CREDENTIALS" as const, message: "Invalid email or password" }, requestId: c.get("requestId") },
        401,
      );
    }

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

    // Store session for token revocation support
    const { sessions } = await import("@betterworld/db");
    await db.insert(sessions).values({
      userId: user.id,
      sessionToken: accessToken,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      refreshToken,
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
