/**
 * Admin Shadow Mode Dashboard Routes (Sprint 11 — T031)
 *
 * GET /admin/shadow/agreement — Agreement statistics
 * GET /admin/shadow/latency — Latency statistics
 * GET /admin/shadow/validators — Validator pool overview
 */
import { spotChecks, validatorPool } from "@betterworld/db";
import { and, eq, desc, sql, count, avg } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { getDb, getRedis } from "../../lib/container.js";
import { parseUuidParam } from "../../lib/validation.js";
import type { AuthEnv } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/auth.js";
import {
  getAgreementStats,
  getLatencyStats,
  getShadowPipelineHealth,
} from "../../services/agreement-stats.js";

const shadowAdminRoutes = new Hono<AuthEnv>();

// ============================================================================
// GET /admin/shadow/agreement
// ============================================================================

shadowAdminRoutes.get("/shadow/agreement", requireAdmin(), async (c) => {
  const db = getDb();
  const redis = getRedis();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const fromDate = c.req.query("fromDate") || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]!;
  const toDate = c.req.query("toDate") || new Date().toISOString().split("T")[0]!;

  const stats = await getAgreementStats(db, redis, fromDate, toDate);

  // Include pipeline health
  let pipelineHealth = null;
  try {
    pipelineHealth = await getShadowPipelineHealth(db, redis, fromDate, toDate);
  } catch {
    // Non-fatal
  }

  return c.json({
    ok: true,
    data: {
      ...stats,
      pipelineHealth,
    },
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// GET /admin/shadow/latency
// ============================================================================

shadowAdminRoutes.get("/shadow/latency", requireAdmin(), async (c) => {
  const db = getDb();
  const redis = getRedis();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const fromDate = c.req.query("fromDate") || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]!;
  const toDate = c.req.query("toDate") || new Date().toISOString().split("T")[0]!;

  const stats = await getLatencyStats(db, redis, fromDate, toDate);

  return c.json({
    ok: true,
    data: stats,
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// GET /admin/shadow/validators
// ============================================================================

shadowAdminRoutes.get("/shadow/validators", requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const fromDate = c.req.query("fromDate") || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]!;

  // Total / active / suspended
  const [total] = await db.select({ count: count() }).from(validatorPool);
  const [active] = await db
    .select({ count: count() })
    .from(validatorPool)
    .where(eq(validatorPool.isActive, true));
  const [suspended] = await db
    .select({ count: count() })
    .from(validatorPool)
    .where(sql`${validatorPool.suspendedUntil} IS NOT NULL AND ${validatorPool.suspendedUntil} > now()`);

  // Tier breakdown
  const tierResults = await db
    .select({ tier: validatorPool.tier, count: count() })
    .from(validatorPool)
    .groupBy(validatorPool.tier);

  const byTier: Record<string, number> = { apprentice: 0, journeyman: 0, expert: 0 };
  for (const row of tierResults) {
    byTier[row.tier] = Number(row.count);
  }

  // With home regions
  const [withRegions] = await db
    .select({ count: count() })
    .from(validatorPool)
    .where(sql`${validatorPool.homeRegionName} IS NOT NULL`);

  // Averages
  const [averages] = await db
    .select({
      avgF1: avg(validatorPool.f1Score),
      avgResponseRate: avg(validatorPool.responseRate),
    })
    .from(validatorPool);

  // Tier changes since fromDate
  const fromDateObj = new Date(fromDate);
  const tierChanges = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE
        (from_tier = 'apprentice' AND to_tier = 'journeyman') OR
        (from_tier = 'journeyman' AND to_tier = 'expert')
      ) as promotions,
      COUNT(*) FILTER (WHERE
        (from_tier = 'expert' AND to_tier = 'journeyman') OR
        (from_tier = 'journeyman' AND to_tier = 'apprentice')
      ) as demotions
    FROM validator_tier_changes
    WHERE changed_at >= ${fromDateObj}
  `);

  const changes = (tierChanges as Array<Record<string, string>>)[0] ?? {};

  return c.json({
    ok: true,
    data: {
      total: Number(total?.count ?? 0),
      active: Number(active?.count ?? 0),
      suspended: Number(suspended?.count ?? 0),
      byTier,
      withHomeRegions: Number(withRegions?.count ?? 0),
      avgF1Score: Number(Number(averages?.avgF1 ?? 0).toFixed(4)),
      avgResponseRate: Number(Number(averages?.avgResponseRate ?? 0).toFixed(2)),
      tierChanges: {
        promotions: Number(changes.promotions ?? 0),
        demotions: Number(changes.demotions ?? 0),
        since: fromDate,
      },
    },
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// GET /admin/spot-checks/stats (Sprint 12 — T048)
// ============================================================================

shadowAdminRoutes.get("/spot-checks/stats", requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  // Overall agreement rate
  const [overall] = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE agrees = true) as agreements,
      COUNT(*) FILTER (WHERE agrees = false) as disagreements,
      COUNT(*) FILTER (WHERE disagreement_type = 'false_negative') as false_negatives,
      COUNT(*) FILTER (WHERE disagreement_type = 'false_positive') as false_positives,
      COUNT(*) FILTER (WHERE disagreement_type = 'missed_flag') as missed_flags,
      COUNT(*) FILTER (WHERE disagreement_type = 'over_rejection') as over_rejections
    FROM spot_checks
  `);
  const stats = overall as Record<string, string>;
  const total = Number(stats?.total ?? 0);
  const agreements = Number(stats?.agreements ?? 0);
  const agreementRate = total > 0 ? (agreements / total) * 100 : 0;

  // Breakdown by content type
  const byType = await db.execute(sql`
    SELECT
      submission_type,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE agrees = true) as agreements,
      COUNT(*) FILTER (WHERE agrees = false) as disagreements
    FROM spot_checks
    GROUP BY submission_type
  `);

  // Daily trend (last 7 days)
  const dailyTrend = await db.execute(sql`
    SELECT
      DATE(created_at) as day,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE agrees = true) as agreements,
      COUNT(*) FILTER (WHERE agrees = false) as disagreements
    FROM spot_checks
    WHERE created_at >= ${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)}
    GROUP BY DATE(created_at)
    ORDER BY day DESC
  `);

  return c.json({
    ok: true,
    data: {
      total,
      agreements,
      disagreements: Number(stats?.disagreements ?? 0),
      agreementRate: Number(agreementRate.toFixed(2)),
      disagreementBreakdown: {
        falseNegatives: Number(stats?.false_negatives ?? 0),
        falsePositives: Number(stats?.false_positives ?? 0),
        missedFlags: Number(stats?.missed_flags ?? 0),
        overRejections: Number(stats?.over_rejections ?? 0),
      },
      byContentType: (byType as Array<Record<string, string>>).map((row) => ({
        type: row.submission_type,
        total: Number(row.total ?? 0),
        agreements: Number(row.agreements ?? 0),
        disagreements: Number(row.disagreements ?? 0),
      })),
      dailyTrend: (dailyTrend as Array<Record<string, string>>).map((row) => ({
        day: row.day,
        total: Number(row.total ?? 0),
        agreements: Number(row.agreements ?? 0),
        disagreements: Number(row.disagreements ?? 0),
      })),
    },
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// GET /admin/spot-checks/disagreements (Sprint 12 — T049)
// ============================================================================

shadowAdminRoutes.get("/spot-checks/disagreements", requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const limitParam = Number(c.req.query("limit") ?? 20);
  const limit = Math.min(Math.max(limitParam, 1), 100);
  const cursor = c.req.query("cursor");
  const reviewed = c.req.query("reviewed");

  const conditions = [eq(spotChecks.agrees, false)];

  if (reviewed === "true") {
    conditions.push(eq(spotChecks.adminReviewed, true));
  } else if (reviewed === "false") {
    conditions.push(eq(spotChecks.adminReviewed, false));
  }

  if (cursor) {
    conditions.push(sql`${spotChecks.createdAt} < ${new Date(cursor)}`);
  }

  const rows = await db
    .select()
    .from(spotChecks)
    .where(and(...conditions))
    .orderBy(desc(spotChecks.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]!.createdAt.toISOString() : null;

  return c.json({
    ok: true,
    data: items.map((r) => ({
      id: r.id,
      submissionId: r.submissionId,
      submissionType: r.submissionType,
      peerDecision: r.peerDecision,
      peerConfidence: Number(r.peerConfidence),
      layerBDecision: r.layerBDecision,
      layerBAlignmentScore: Number(r.layerBAlignmentScore),
      agrees: r.agrees,
      disagreementType: r.disagreementType,
      adminReviewed: r.adminReviewed,
      adminVerdict: r.adminVerdict,
      createdAt: r.createdAt.toISOString(),
    })),
    meta: { hasMore, nextCursor, count: items.length },
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// PUT /admin/spot-checks/:id/review (Sprint 12 — T049)
// ============================================================================

const reviewVerdictSchema = z.object({
  verdict: z.enum(["peer_correct", "layer_b_correct", "inconclusive"]),
});

shadowAdminRoutes.put("/spot-checks/:id/review", requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const id = parseUuidParam(c.req.param("id"), "id");
  const body = await c.req.json();
  const parsed = reviewVerdictSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid verdict" }, requestId: c.get("requestId") },
      400,
    );
  }

  const [existing] = await db
    .select({ id: spotChecks.id })
    .from(spotChecks)
    .where(eq(spotChecks.id, id))
    .limit(1);

  if (!existing) {
    return c.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Spot check not found" }, requestId: c.get("requestId") },
      404,
    );
  }

  const [updated] = await db
    .update(spotChecks)
    .set({
      adminReviewed: true,
      adminVerdict: parsed.data.verdict,
    })
    .where(eq(spotChecks.id, id))
    .returning();

  return c.json({
    ok: true,
    data: {
      id: updated!.id,
      adminReviewed: true,
      adminVerdict: parsed.data.verdict,
    },
    requestId: c.get("requestId"),
  });
});

export default shadowAdminRoutes;
