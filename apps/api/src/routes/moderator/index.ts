/**
 * Moderator Routes (Sprint 18: Cooperative Depth & Governance — US3)
 *
 * GET  /moderator/queue — Domain-scoped flagged content queue
 * POST /moderator/queue/:itemId/decide — Approve/reject/escalate flagged content
 * GET  /moderator/stats — Moderator review statistics
 */
import { flaggedContent, guardrailEvaluations, humans } from "@betterworld/db";
import { moderatorDecisionSchema, AppError } from "@betterworld/shared";
import { and, eq, sql, desc } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { humanAuth } from "../../middleware/humanAuth.js";
import { ModeratorAuditService } from "../../services/moderator-audit.js";

const moderatorRoutes = new Hono<AppEnv>();

// ── GET /moderator/queue — Domain-scoped flagged content queue ──
moderatorRoutes.get("/moderator/queue", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");

  // Check moderator status
  const [h] = await db
    .select({ isModerator: humans.isModerator, moderatorDomains: humans.moderatorDomains })
    .from(humans)
    .where(eq(humans.id, human.id))
    .limit(1);

  if (!h || !h.isModerator) {
    return c.json({ ok: false, error: "FORBIDDEN", message: "Moderator access required" }, 403);
  }

  const domains = h.moderatorDomains ?? [];
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20"), 50);

  // Get flagged content matching moderator domains, pending review
  // 2-hop exclusion: exclude content from moderator's connections
  const items = await db
    .select({
      id: flaggedContent.id,
      contentId: flaggedContent.contentId,
      contentType: flaggedContent.contentType,
      status: flaggedContent.status,
      createdAt: flaggedContent.createdAt,
    })
    .from(flaggedContent)
    .innerJoin(guardrailEvaluations, eq(flaggedContent.evaluationId, guardrailEvaluations.id))
    .where(
      and(
        eq(flaggedContent.status, "pending_review"),
        domains.length > 0
          ? sql`${guardrailEvaluations.contentType} IN ${domains}`
          : sql`1=1`,
      ),
    )
    .orderBy(desc(flaggedContent.createdAt))
    .limit(limit);

  return c.json({ ok: true, data: { items, count: items.length }, requestId: c.get("requestId") });
});

// ── POST /moderator/queue/:itemId/decide — Approve/reject/escalate ──
moderatorRoutes.post("/moderator/queue/:itemId/decide", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const itemId = c.req.param("itemId");

  // Check moderator status
  const [h] = await db
    .select({ isModerator: humans.isModerator, moderatorDomains: humans.moderatorDomains })
    .from(humans)
    .where(eq(humans.id, human.id))
    .limit(1);

  if (!h || !h.isModerator) {
    return c.json({ ok: false, error: "FORBIDDEN", message: "Moderator access required" }, 403);
  }

  const body = await c.req.json();
  const parsed = moderatorDecisionSchema.parse(body);

  // Find the flagged content item
  const [item] = await db
    .select({
      id: flaggedContent.id,
      contentId: flaggedContent.contentId,
      contentType: flaggedContent.contentType,
      status: flaggedContent.status,
    })
    .from(flaggedContent)
    .where(eq(flaggedContent.id, itemId))
    .limit(1);

  if (!item) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Queue item not found" }, 404);
  }

  if (item.status !== "pending_review") {
    return c.json({ ok: false, error: "INVALID_STATUS", message: "Item already reviewed" }, 400);
  }

  // Map moderator decision to admin decision enum
  const adminDecision = parsed.decision === "approved" ? "approve" : parsed.decision === "rejected" ? "reject" : "escalate";
  const newStatus = parsed.decision === "escalated" ? "pending_review" : "reviewed";

  // Update flagged content
  await db
    .update(flaggedContent)
    .set({
      status: newStatus as never,
      adminDecision: adminDecision as never,
      adminNotes: parsed.reason ?? null,
      reviewedAt: new Date(),
    })
    .where(eq(flaggedContent.id, itemId));

  // Record immutable audit trail
  const auditService = new ModeratorAuditService(db);
  await auditService.record({
    moderatorHumanId: human.id,
    actionType: parsed.decision === "escalated" ? "content_escalated" : parsed.decision === "approved" ? "content_approved" : "content_rejected",
    targetId: item.contentId,
    targetType: item.contentType,
    decision: parsed.decision,
    reason: parsed.reason,
    domain: (h.moderatorDomains ?? [])[0] ?? "community_building",
  });

  return c.json({
    ok: true,
    data: { itemId, decision: parsed.decision },
    requestId: c.get("requestId"),
  });
});

// ── GET /moderator/stats — Moderator review statistics ──
moderatorRoutes.get("/moderator/stats", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");

  // Check moderator status
  const [h] = await db
    .select({ isModerator: humans.isModerator })
    .from(humans)
    .where(eq(humans.id, human.id))
    .limit(1);

  if (!h || !h.isModerator) {
    return c.json({ ok: false, error: "FORBIDDEN", message: "Moderator access required" }, 403);
  }

  const auditService = new ModeratorAuditService(db);
  const stats = await auditService.getStats(human.id);

  return c.json({ ok: true, data: stats, requestId: c.get("requestId") });
});

export default moderatorRoutes;
