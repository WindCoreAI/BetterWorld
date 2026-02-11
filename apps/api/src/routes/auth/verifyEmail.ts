/**
 * POST /auth/verify-email - Verify Email with 6-digit Code (Sprint 6)
 */

import crypto from "crypto";

import { VerifyEmailSchema } from "@betterworld/shared/schemas/human";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { generateTokenPair } from "../../lib/auth-helpers.js";
import { logger } from "../../middleware/logger.js";

const app = new Hono<AppEnv>();

app.post("/", zValidator("json", VerifyEmailSchema), async (c) => {
  const { email, code } = c.req.valid("json");

  try {
    const { getDb } = await import("../../lib/container.js");
    const db = getDb();
    if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE" as const, message: "Database not available" }, requestId: c.get("requestId") }, 503);

    const { and, eq, gt } = await import("drizzle-orm");
    const { humans, verificationTokens } = await import("@betterworld/db");

    // Hash incoming code before comparison (F14)
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");

    const [token] = await db
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, email),
          eq(verificationTokens.token, codeHash),
          eq(verificationTokens.verified, false),
          gt(verificationTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!token) {
      return c.json(
        { ok: false, error: { code: "INVALID_CODE" as const, message: "Invalid or expired verification code" }, requestId: c.get("requestId") },
        400,
      );
    }

    // Wrap multi-table update in transaction (F05)
    const user = await db.transaction(async (tx) => {
      await tx
        .update(verificationTokens)
        .set({ verified: true })
        .where(eq(verificationTokens.id, token.id));

      const [updated] = await tx
        .update(humans)
        .set({ emailVerified: true, emailVerifiedAt: new Date() })
        .where(eq(humans.email, email))
        .returning();

      return updated;
    });

    if (!user) {
      return c.json(
        { ok: false, error: { code: "USER_NOT_FOUND" as const, message: "User not found" }, requestId: c.get("requestId") },
        404,
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
        },
      },
      requestId: c.get("requestId"),
    });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : "Unknown" }, "Email verification failed");
    return c.json(
      { ok: false, error: { code: "INTERNAL_ERROR" as const, message: "Verification failed" }, requestId: c.get("requestId") },
      500,
    );
  }
});

export default app;
