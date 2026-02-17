/**
 * Admin Moderator Management Routes (Sprint 18: Cooperative Depth & Governance — US3)
 *
 * GET  /admin/moderator/eligible — List eligible moderator candidates
 * POST /admin/moderator/:humanId/approve — Approve moderator
 * POST /admin/moderator/:humanId/revoke — Revoke moderator status
 */
import { humans } from "@betterworld/db";
import { moderatorApprovalSchema, AppError } from "@betterworld/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { humanAuth } from "../../middleware/humanAuth.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";
import { ModeratorEligibilityService } from "../../services/moderator-eligibility.js";
import { NotificationService } from "../../services/notification.service.js";

const adminModeratorRoutes = new Hono<AppEnv>();

// ── GET /admin/moderator/eligible — List eligible moderator candidates ──
adminModeratorRoutes.get("/admin/moderator/eligible", humanAuth(), requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const eligibilityService = new ModeratorEligibilityService(db);
  const { newlyEligible, shouldRevoke } = await eligibilityService.scanEligibility();

  return c.json({
    ok: true,
    data: { eligible: newlyEligible, shouldRevoke },
    requestId: c.get("requestId"),
  });
});

// ── POST /admin/moderator/:humanId/approve — Approve moderator ──
adminModeratorRoutes.post("/admin/moderator/:humanId/approve", humanAuth(), requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const humanId = c.req.param("humanId");
  const body = await c.req.json();
  const parsed = moderatorApprovalSchema.parse(body);

  // Verify human exists
  const [human] = await db
    .select({ id: humans.id, displayName: humans.displayName, isModerator: humans.isModerator })
    .from(humans)
    .where(eq(humans.id, humanId))
    .limit(1);

  if (!human) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Human not found" }, 404);
  }

  if (human.isModerator) {
    return c.json({ ok: false, error: "ALREADY_MODERATOR", message: "Already a moderator" }, 400);
  }

  // Approve moderator
  await db
    .update(humans)
    .set({
      isModerator: true,
      moderatorSince: new Date(),
      moderatorDomains: parsed.domains,
      updatedAt: new Date(),
    })
    .where(eq(humans.id, humanId));

  // Notify
  try {
    const notificationService = new NotificationService(db);
    await notificationService.create({
      recipientHumanId: humanId,
      type: "moderator_approved",
      message: `You have been approved as a community moderator for ${parsed.domains.join(", ")}!`,
      referenceId: humanId,
      referenceType: "human",
    });
  } catch { /* non-fatal */ }

  return c.json({
    ok: true,
    data: { humanId, isModerator: true, domains: parsed.domains },
    requestId: c.get("requestId"),
  });
});

// ── POST /admin/moderator/:humanId/revoke — Revoke moderator status ──
adminModeratorRoutes.post("/admin/moderator/:humanId/revoke", humanAuth(), requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const humanId = c.req.param("humanId");

  const [human] = await db
    .select({ id: humans.id, isModerator: humans.isModerator })
    .from(humans)
    .where(eq(humans.id, humanId))
    .limit(1);

  if (!human) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Human not found" }, 404);
  }

  if (!human.isModerator) {
    return c.json({ ok: false, error: "NOT_MODERATOR", message: "Not a moderator" }, 400);
  }

  await db
    .update(humans)
    .set({
      isModerator: false,
      moderatorDomains: [],
      updatedAt: new Date(),
    })
    .where(eq(humans.id, humanId));

  // Notify
  try {
    const notificationService = new NotificationService(db);
    await notificationService.create({
      recipientHumanId: humanId,
      type: "moderator_revoked",
      message: "Your moderator status has been revoked.",
      referenceId: humanId,
      referenceType: "human",
    });
  } catch { /* non-fatal */ }

  return c.json({
    ok: true,
    data: { humanId, isModerator: false },
    requestId: c.get("requestId"),
  });
});

export default adminModeratorRoutes;
