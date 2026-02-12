/**
 * POST /auth/logout - Logout (Sprint 6)
 */

import { sessions } from "@betterworld/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { humanAuth } from "../../middleware/humanAuth";

const app = new Hono<AppEnv>();

app.post("/", humanAuth(), async (c) => {
  // Delete sessions for this user to invalidate refresh tokens
  const db = getDb();
  if (db) {
    const human = c.get("human");
    await db.delete(sessions).where(eq(sessions.userId, human.id));
  }

  return c.json({
    ok: true,
    data: {
      message: "Logged out successfully",
    },
    requestId: c.get("requestId"),
  });
});

export default app;
