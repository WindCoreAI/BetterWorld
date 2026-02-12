/**
 * Admin Shadow Mode Dashboard Routes (Sprint 11 — T031)
 *
 * GET /admin/shadow/agreement — Agreement statistics
 * GET /admin/shadow/latency — Latency statistics
 * GET /admin/shadow/validators — Validator pool overview
 */
import { validatorPool } from "@betterworld/db";
import { eq, sql, count, avg } from "drizzle-orm";
import { Hono } from "hono";

import { getDb, getRedis } from "../../lib/container.js";
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

export default shadowAdminRoutes;
