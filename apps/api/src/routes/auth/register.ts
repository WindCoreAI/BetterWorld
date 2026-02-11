/**
 * POST /auth/register - Email/Password Registration (Sprint 6)
 */

import crypto from "crypto";

import { RegisterSchema } from "@betterworld/shared/schemas/human";
import { zValidator } from "@hono/zod-validator";
import bcrypt from "bcrypt";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { sendVerificationEmail } from "../../lib/email.js";
import { logger } from "../../middleware/logger.js";

const app = new Hono<AppEnv>();

app.post("/", zValidator("json", RegisterSchema), async (c) => {
  const { email, password, displayName } = c.req.valid("json");

  try {
    const { getDb } = await import("../../lib/container.js");
    const db = getDb();
    if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE" as const, message: "Database not available" }, requestId: c.get("requestId") }, 503);

    const { eq } = await import("drizzle-orm");
    const { humans, verificationTokens } = await import("@betterworld/db");

    // Hash password first to prevent timing-based user enumeration (F23)
    const passwordHash = await bcrypt.hash(password, 12);

    const [existingUser] = await db
      .select({ id: humans.id })
      .from(humans)
      .where(eq(humans.email, email))
      .limit(1);

    if (existingUser) {
      return c.json(
        { ok: false, error: { code: "EMAIL_EXISTS" as const, message: "Email is already registered" }, requestId: c.get("requestId") },
        400,
      );
    }

    const [newUser] = await db
      .insert(humans)
      .values({
        email,
        passwordHash,
        displayName,
        role: "human",
        emailVerified: false,
      })
      .returning({ id: humans.id, email: humans.email });

    if (!newUser) {
      return c.json(
        { ok: false, error: { code: "INTERNAL_ERROR" as const, message: "Failed to create user" }, requestId: c.get("requestId") },
        500,
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
      resendCount: 0,
    });

    return c.json(
      {
        ok: true,
        data: {
          userId: newUser.id,
          email: newUser.email,
          message: `Verification code sent to ${email}`,
        },
        requestId: c.get("requestId"),
      },
      201,
    );
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : "Unknown" }, "Registration failed");
    return c.json(
      { ok: false, error: { code: "INTERNAL_ERROR" as const, message: "Registration failed" }, requestId: c.get("requestId") },
      500,
    );
  }
});

export default app;
