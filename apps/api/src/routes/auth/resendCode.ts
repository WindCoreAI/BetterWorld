/**
 * POST /auth/resend-code - Resend Verification Code (Sprint 6)
 */

import crypto from "crypto";

import { verificationTokens } from "@betterworld/db";
import { ResendCodeSchema } from "@betterworld/shared/schemas/human";
import { zValidator } from "@hono/zod-validator";
import { and, eq, gte } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb, getRedis } from "../../lib/container.js";
import { sendVerificationEmail } from "../../lib/email.js";
import { logger } from "../../middleware/logger.js";

const app = new Hono<AppEnv>();

app.post("/", zValidator("json", ResendCodeSchema), async (c) => {
  const { email } = c.req.valid("json");

  try {
    const db = getDb();
    const redis = getRedis();
    if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE" as const, message: "Database not available" }, requestId: c.get("requestId") }, 503);

    // Check throttle limit (3 resends per hour)
    if (redis) {
      const throttleKey = `resend:${email}`;
      const resendCount = await redis.get(throttleKey);

      if (resendCount && parseInt(resendCount, 10) >= 3) {
        return c.json(
          { ok: false, error: { code: "RATE_LIMIT_EXCEEDED" as const, message: "Too many resend requests. Try again in 1 hour." }, requestId: c.get("requestId") },
          429,
        );
      }
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [latestToken] = await db
      .select({ id: verificationTokens.id, resendCount: verificationTokens.resendCount })
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, email),
          eq(verificationTokens.verified, false),
          gte(verificationTokens.createdAt, oneHourAgo),
        ),
      )
      .orderBy(verificationTokens.createdAt)
      .limit(1);

    if (!latestToken) {
      return c.json(
        { ok: false, error: { code: "NO_PENDING_VERIFICATION" as const, message: "No pending verification found for this email" }, requestId: c.get("requestId") },
        404,
      );
    }

    const code = crypto.randomInt(100000, 999999).toString();

    // Send email BEFORE hashing (need plaintext code)
    await sendVerificationEmail(email, code);

    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await db.insert(verificationTokens).values({
      identifier: email,
      token: codeHash,
      expiresAt,
      verified: false,
      resendCount: latestToken.resendCount + 1,
    });

    // Update throttle counter
    if (redis) {
      const throttleKey = `resend:${email}`;
      const currentRaw = await redis.get(throttleKey);
      const currentCount = currentRaw ? parseInt(currentRaw, 10) : 0;
      await redis.setex(throttleKey, 3600, (currentCount + 1).toString());
    }

    return c.json({
      ok: true,
      data: { message: `New verification code sent to ${email}` },
      requestId: c.get("requestId"),
    });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : "Unknown" }, "Resend code failed");
    return c.json(
      { ok: false, error: { code: "INTERNAL_ERROR" as const, message: "Failed to resend code" }, requestId: c.get("requestId") },
      500,
    );
  }
});

export default app;
