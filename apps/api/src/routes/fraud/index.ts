/**
 * Admin Fraud Routes (Sprint 9: Reputation & Impact)
 *
 * GET /admin/fraud/queue — List flagged/suspended accounts
 * GET /admin/fraud/:humanId — Fraud detail for a human
 * POST /admin/fraud/:humanId/action — Take admin action
 * GET /admin/fraud/stats — Aggregate fraud statistics
 */
import {
  fraudAdminActions,
  fraudEvents,
  fraudScores,
  humans,
  reputationScores,
} from "@betterworld/db";
import { fraudAdminActionSchema, fraudQueueQuerySchema } from "@betterworld/shared";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { humanAuth } from "../../middleware/humanAuth.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";

const fraudRoutes = new Hono<AppEnv>();

// ────────────────── GET /admin/fraud/stats ──────────────────

fraudRoutes.get("/stats", humanAuth(), requireAdmin(), async (c) => {
  const db = getDb();
  if (!db)
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const [flagged] = await db
    .select({ count: count() })
    .from(fraudScores)
    .where(eq(fraudScores.status, "flagged"));

  const [suspended] = await db
    .select({ count: count() })
    .from(fraudScores)
    .where(eq(fraudScores.status, "suspended"));

  const [cleared] = await db
    .select({ count: count() })
    .from(fraudAdminActions)
    .where(eq(fraudAdminActions.action, "clear_flag"));

  const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [newFlags30d] = await db
    .select({ count: count() })
    .from(fraudScores)
    .where(
      and(
        eq(fraudScores.status, "flagged"),
        gte(fraudScores.flaggedAt, last30Days),
      ),
    );

  const detectionBreakdown = await db
    .select({
      type: fraudEvents.detectionType,
      count: count(),
    })
    .from(fraudEvents)
    .groupBy(fraudEvents.detectionType);

  return c.json({
    ok: true,
    data: {
      totalFlagged: flagged?.count ?? 0,
      totalSuspended: suspended?.count ?? 0,
      totalCleared: cleared?.count ?? 0,
      detectionBreakdown: detectionBreakdown.map((d) => ({
        type: d.type,
        count: Number(d.count),
      })),
      last30Days: {
        newFlags: newFlags30d?.count ?? 0,
      },
    },
    requestId: c.get("requestId"),
  });
});

// ────────────────── GET /admin/fraud/queue ──────────────────

fraudRoutes.get("/queue", humanAuth(), requireAdmin(), async (c) => {
  const db = getDb();
  if (!db)
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const query = fraudQueueQuerySchema.parse(c.req.query());

  const conditions = [];
  if (query.status === "flagged") {
    conditions.push(eq(fraudScores.status, "flagged"));
  } else if (query.status === "suspended") {
    conditions.push(eq(fraudScores.status, "suspended"));
  } else {
    conditions.push(sql`${fraudScores.status} != 'clean'`);
  }

  const rows = await db
    .select({
      humanId: fraudScores.humanId,
      displayName: humans.displayName,
      email: humans.email,
      totalScore: fraudScores.totalScore,
      phashScore: fraudScores.phashScore,
      velocityScore: fraudScores.velocityScore,
      statisticalScore: fraudScores.statisticalScore,
      status: fraudScores.status,
      flaggedAt: fraudScores.flaggedAt,
      suspendedAt: fraudScores.suspendedAt,
    })
    .from(fraudScores)
    .innerJoin(humans, eq(fraudScores.humanId, humans.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(fraudScores.totalScore))
    .limit(query.limit);

  return c.json({
    ok: true,
    data: rows.map((r) => ({
      humanId: r.humanId,
      displayName: r.displayName,
      email: r.email,
      fraudScore: {
        total: r.totalScore,
        phash: r.phashScore,
        velocity: r.velocityScore,
        statistical: r.statisticalScore,
      },
      status: r.status,
      flaggedAt: r.flaggedAt?.toISOString() ?? null,
      suspendedAt: r.suspendedAt?.toISOString() ?? null,
    })),
    requestId: c.get("requestId"),
  });
});

// ────────────────── GET /admin/fraud/:humanId ──────────────────

fraudRoutes.get("/:humanId", humanAuth(), requireAdmin(), async (c) => {
  const db = getDb();
  if (!db)
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const humanId = c.req.param("humanId");

  const [scoreRow] = await db
    .select()
    .from(fraudScores)
    .where(eq(fraudScores.humanId, humanId))
    .limit(1);

  if (!scoreRow) {
    return c.json({ ok: false, error: { code: "NOT_FOUND", message: "Fraud data not found" } }, 404);
  }

  // Get events
  const events = await db
    .select()
    .from(fraudEvents)
    .where(eq(fraudEvents.humanId, humanId))
    .orderBy(desc(fraudEvents.createdAt))
    .limit(50);

  // Get admin actions
  const actions = await db
    .select()
    .from(fraudAdminActions)
    .where(eq(fraudAdminActions.humanId, humanId))
    .orderBy(desc(fraudAdminActions.createdAt))
    .limit(20);

  // Get human profile summary
  const [humanRow] = await db
    .select({
      displayName: humans.displayName,
      createdAt: humans.createdAt,
    })
    .from(humans)
    .where(eq(humans.id, humanId))
    .limit(1);

  const [repRow] = await db
    .select({
      totalScore: reputationScores.totalScore,
      currentTier: reputationScores.currentTier,
    })
    .from(reputationScores)
    .where(eq(reputationScores.humanId, humanId))
    .limit(1);

  return c.json({
    ok: true,
    data: {
      fraudScore: {
        total: scoreRow.totalScore,
        phash: scoreRow.phashScore,
        velocity: scoreRow.velocityScore,
        statistical: scoreRow.statisticalScore,
        status: scoreRow.status,
        flaggedAt: scoreRow.flaggedAt?.toISOString() ?? null,
        suspendedAt: scoreRow.suspendedAt?.toISOString() ?? null,
      },
      events: events.map((e) => ({
        id: e.id,
        detectionType: e.detectionType,
        scoreDelta: e.scoreDelta,
        details: e.details,
        evidenceId: e.evidenceId,
        createdAt: e.createdAt.toISOString(),
      })),
      adminActions: actions.map((a) => ({
        id: a.id,
        action: a.action,
        reason: a.reason,
        scoreBefore: a.fraudScoreBefore,
        scoreAfter: a.fraudScoreAfter,
        adminId: a.adminId,
        createdAt: a.createdAt.toISOString(),
      })),
      humanProfile: {
        displayName: humanRow?.displayName ?? "Unknown",
        joinedAt: humanRow?.createdAt?.toISOString() ?? null,
        reputationScore: repRow ? Number(repRow.totalScore) : 0,
        tier: repRow?.currentTier ?? "newcomer",
      },
    },
    requestId: c.get("requestId"),
  });
});

// ────────────────── POST /admin/fraud/:humanId/action ──────────────────

fraudRoutes.post("/:humanId/action", humanAuth(), requireAdmin(), async (c) => {
  const db = getDb();
  if (!db)
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const admin = c.get("human");
  const humanId = c.req.param("humanId");
  const body = fraudAdminActionSchema.parse(await c.req.json());

  return db.transaction(async (tx) => {
    const result = await tx.execute(
      sql`SELECT total_score, status FROM fraud_scores WHERE human_id = ${humanId} FOR UPDATE`,
    );
    const scoreRow = (
      result as unknown as Array<{ total_score: number; status: string }>
    )[0];

    if (!scoreRow) {
      return c.json({ ok: false, error: { code: "NOT_FOUND", message: "Fraud data not found" } }, 404);
    }

    const scoreBefore = scoreRow.total_score;
    let scoreAfter = scoreBefore;
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    switch (body.action) {
      case "clear_flag":
        updates.status = "clean";
        updates.flaggedAt = null;
        break;
      case "reset_score":
        updates.totalScore = 0;
        updates.phashScore = 0;
        updates.velocityScore = 0;
        updates.statisticalScore = 0;
        updates.status = "clean";
        updates.flaggedAt = null;
        updates.suspendedAt = null;
        scoreAfter = 0;
        break;
      case "manual_suspend":
        updates.status = "suspended";
        updates.suspendedAt = new Date();
        break;
      case "unsuspend":
        updates.status = "clean";
        updates.suspendedAt = null;
        updates.flaggedAt = null;
        updates.totalScore = 0;
        updates.phashScore = 0;
        updates.velocityScore = 0;
        updates.statisticalScore = 0;
        scoreAfter = 0;
        break;
    }

    await tx
      .update(fraudScores)
      .set(updates)
      .where(eq(fraudScores.humanId, humanId));

    // Log admin action
    const [actionRow] = await tx
      .insert(fraudAdminActions)
      .values({
        humanId,
        adminId: admin.id,
        action: body.action,
        reason: body.reason,
        fraudScoreBefore: scoreBefore,
        fraudScoreAfter: scoreAfter,
      })
      .returning();

    return c.json({
      ok: true,
      data: {
        actionId: actionRow!.id,
        humanId,
        action: body.action,
        newStatus: updates.status ?? scoreRow.status,
        scores: {
          before: scoreBefore,
          after: scoreAfter,
        },
      },
      requestId: c.get("requestId"),
    });
  });
});

export default fraudRoutes;
