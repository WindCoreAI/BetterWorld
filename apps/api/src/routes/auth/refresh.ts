/**
 * POST /auth/refresh - Refresh Access Token (Sprint 6)
 */

import { loadConfig } from "@betterworld/shared";
import { RefreshTokenSchema } from "@betterworld/shared/schemas/human";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import * as jose from "jose";

import type { AppEnv } from "../../app.js";
import { generateTokenPair } from "../../lib/auth-helpers.js";

const app = new Hono<AppEnv>();
const getConfig = () => loadConfig();

app.post("/", zValidator("json", RefreshTokenSchema), async (c) => {
  const { refreshToken } = c.req.valid("json");

  try {
    const secret = new TextEncoder().encode(getConfig().JWT_SECRET);
    const { payload } = await jose.jwtVerify(refreshToken, secret);

    if (payload.type !== "refresh") {
      return c.json(
        { ok: false, error: { code: "INVALID_TOKEN" as const, message: "Invalid refresh token" }, requestId: c.get("requestId") },
        401,
      );
    }

    const { getDb } = await import("../../lib/container.js");
    const db = getDb();
    if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE" as const, message: "Database not available" }, requestId: c.get("requestId") }, 503);

    const { eq } = await import("drizzle-orm");
    const { sessions } = await import("@betterworld/db");

    // Verify refresh token exists in sessions table (server-side revocation check)
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.refreshToken, refreshToken))
      .limit(1);

    if (!session) {
      return c.json({ ok: false, error: { code: "TOKEN_REVOKED" as const, message: "Refresh token has been revoked" }, requestId: c.get("requestId") }, 401);
    }

    const { accessToken, refreshToken: newRefresh, expiresIn } = await generateTokenPair(payload.userId as string);

    // Rotate refresh token in the session row
    await db
      .update(sessions)
      .set({
        refreshToken: newRefresh,
        refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, session.id));

    return c.json({
      ok: true,
      data: {
        accessToken,
        refreshToken: newRefresh,
        expiresIn,
      },
      requestId: c.get("requestId"),
    });
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      return c.json(
        { ok: false, error: { code: "TOKEN_EXPIRED" as const, message: "Refresh token has expired. Please log in again." }, requestId: c.get("requestId") },
        401,
      );
    }

    return c.json(
      { ok: false, error: { code: "INVALID_TOKEN" as const, message: "Invalid refresh token" }, requestId: c.get("requestId") },
      401,
    );
  }
});

export default app;
