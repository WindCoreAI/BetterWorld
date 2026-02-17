/**
 * Endorsement Enhancement Routes (Sprint 18: Cooperative Depth & Governance — US11)
 *
 * PATCH /endorsements/:id/narrative — Add gratitude narrative (guardrail check)
 * POST  /endorsements/:id/feature — Feature narrative (max 3 per recipient)
 */
import { endorsements } from "@betterworld/db";
import { narrativeSchema, AppError } from "@betterworld/shared";
import { and, eq, count } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { humanAuth } from "../../middleware/humanAuth.js";

const endorsementRoutes = new Hono<AppEnv>();

// ── PATCH /endorsements/:id/narrative ──
endorsementRoutes.patch("/endorsements/:id/narrative", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const endorsementId = c.req.param("id");
  const body = await c.req.json();
  const parsed = narrativeSchema.parse(body);

  // Verify endorsement ownership (fromHumanId = endorser)
  const [endorsement] = await db
    .select({ id: endorsements.id, fromHumanId: endorsements.fromHumanId })
    .from(endorsements)
    .where(eq(endorsements.id, endorsementId))
    .limit(1);

  if (!endorsement) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Endorsement not found" }, 404);
  }

  if (endorsement.fromHumanId !== human.id) {
    return c.json({ ok: false, error: "FORBIDDEN", message: "Only the endorser can add a narrative" }, 403);
  }

  await db
    .update(endorsements)
    .set({
      narrative: parsed.narrative,
    })
    .where(eq(endorsements.id, endorsementId));

  return c.json({
    ok: true,
    data: { id: endorsementId, narrative: parsed.narrative },
    requestId: c.get("requestId"),
  });
});

// ── POST /endorsements/:id/feature ──
endorsementRoutes.post("/endorsements/:id/feature", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const endorsementId = c.req.param("id");

  const [endorsement] = await db
    .select({
      id: endorsements.id,
      toHumanId: endorsements.toHumanId,
      fromHumanId: endorsements.fromHumanId,
      isFeatured: endorsements.isFeatured,
      narrative: endorsements.narrative,
    })
    .from(endorsements)
    .where(eq(endorsements.id, endorsementId))
    .limit(1);

  if (!endorsement) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Endorsement not found" }, 404);
  }

  // Only the recipient can feature an endorsement
  if (endorsement.toHumanId !== human.id) {
    return c.json({ ok: false, error: "FORBIDDEN", message: "Only the recipient can feature endorsements" }, 403);
  }

  if (!endorsement.narrative) {
    return c.json({ ok: false, error: "NO_NARRATIVE", message: "Endorsement must have a narrative to be featured" }, 400);
  }

  // Check max 3 featured per recipient
  const [featuredCount] = await db
    .select({ count: count() })
    .from(endorsements)
    .where(
      and(
        eq(endorsements.toHumanId, human.id),
        eq(endorsements.isFeatured, true),
      ),
    );

  if ((featuredCount?.count ?? 0) >= 3 && !endorsement.isFeatured) {
    return c.json({ ok: false, error: "FEATURE_LIMIT", message: "Maximum 3 featured endorsements" }, 400);
  }

  const newFeatured = !endorsement.isFeatured;
  await db
    .update(endorsements)
    .set({ isFeatured: newFeatured })
    .where(eq(endorsements.id, endorsementId));

  return c.json({
    ok: true,
    data: { id: endorsementId, isFeatured: newFeatured },
    requestId: c.get("requestId"),
  });
});

export default endorsementRoutes;
