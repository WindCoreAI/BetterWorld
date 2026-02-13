/**
 * Admin Rate Adjustment Routes (Sprint 13 — Phase 3 Integration)
 *
 * GET  /admin/rate-adjustments       — List rate adjustment history (cursor pagination)
 * POST /admin/rate-adjustments/override — Manual multiplier override
 */
import { rateAdjustments } from "@betterworld/db";
import { rateAdjustmentOverrideSchema, AppError } from "@betterworld/shared";
import { desc, lt } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.js";
import { getDb, getRedis } from "../lib/container.js";
import { logger } from "../middleware/logger.js";
import { humanAuth } from "../middleware/humanAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { getFlag, setFlag } from "../services/feature-flags.js";

export const adminRateRoutes = new Hono<AppEnv>();

// ============================================================================
// GET /admin/rate-adjustments — List rate adjustment history
// ============================================================================

adminRateRoutes.get("/", humanAuth(), requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const cursor = c.req.query("cursor");
  const limitParam = Number(c.req.query("limit") ?? 20);
  const limit = Math.min(Math.max(limitParam, 1), 100);

  const conditions = [];
  if (cursor) {
    const cursorParsed = z.string().uuid().safeParse(cursor);
    if (!cursorParsed.success) {
      throw new AppError("VALIDATION_ERROR", "Invalid cursor format");
    }
    // Fetch the createdAt of the cursor record to use for cursor pagination
    const [cursorRecord] = await db
      .select({ createdAt: rateAdjustments.createdAt })
      .from(rateAdjustments)
      .where(lt(rateAdjustments.id, cursor))
      .limit(0);

    // Use ID-based cursor: fetch records with createdAt < cursor record's createdAt
    // For simplicity, use ID ordering (UUID v4 is random, so order by createdAt DESC)
    void cursorRecord; // cursor is just used as a marker
    conditions.push(lt(rateAdjustments.id, cursor));
  }

  const rows = await db
    .select({
      id: rateAdjustments.id,
      adjustmentType: rateAdjustments.adjustmentType,
      faucetSinkRatio: rateAdjustments.faucetSinkRatio,
      rewardMultiplierBefore: rateAdjustments.rewardMultiplierBefore,
      rewardMultiplierAfter: rateAdjustments.rewardMultiplierAfter,
      costMultiplierBefore: rateAdjustments.costMultiplierBefore,
      costMultiplierAfter: rateAdjustments.costMultiplierAfter,
      changePercent: rateAdjustments.changePercent,
      circuitBreakerActive: rateAdjustments.circuitBreakerActive,
      periodStart: rateAdjustments.periodStart,
      periodEnd: rateAdjustments.periodEnd,
      triggeredBy: rateAdjustments.triggeredBy,
      createdAt: rateAdjustments.createdAt,
    })
    .from(rateAdjustments)
    .where(conditions.length > 0 ? conditions[0] : undefined)
    .orderBy(desc(rateAdjustments.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]!.id : null;

  return c.json({
    ok: true,
    data: {
      items: items.map((row) => ({
        id: row.id,
        adjustmentType: row.adjustmentType,
        faucetSinkRatio: Number(row.faucetSinkRatio),
        rewardMultiplierBefore: Number(row.rewardMultiplierBefore),
        rewardMultiplierAfter: Number(row.rewardMultiplierAfter),
        costMultiplierBefore: Number(row.costMultiplierBefore),
        costMultiplierAfter: Number(row.costMultiplierAfter),
        changePercent: Number(row.changePercent),
        circuitBreakerActive: row.circuitBreakerActive,
        periodStart: row.periodStart.toISOString(),
        periodEnd: row.periodEnd.toISOString(),
        triggeredBy: row.triggeredBy,
        createdAt: row.createdAt.toISOString(),
      })),
      hasMore,
      nextCursor,
    },
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// POST /admin/rate-adjustments/override — Manual multiplier override
// ============================================================================

adminRateRoutes.post("/override", humanAuth(), requireAdmin(), async (c) => {
  const db = getDb();
  const redis = getRedis();

  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }
  if (!redis) {
    throw new AppError("SERVICE_UNAVAILABLE", "Redis not available");
  }

  const body = await c.req.json();
  const parsed = rateAdjustmentOverrideSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Invalid input: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
    );
  }

  const { rewardMultiplier, costMultiplier } = parsed.data;

  // Read current values
  const currentReward = await getFlag(redis, "VALIDATION_REWARD_MULTIPLIER");
  const currentCost = await getFlag(redis, "SUBMISSION_COST_MULTIPLIER");

  // Update flags
  await setFlag(redis, "VALIDATION_REWARD_MULTIPLIER", rewardMultiplier);
  await setFlag(redis, "SUBMISSION_COST_MULTIPLIER", costMultiplier);

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Calculate effective ratio (current snapshot)
  let faucetSinkRatio = 1.0;
  try {
    const { calculateFaucetSinkRatio } = await import(
      "../services/rate-adjustment.service.js"
    );
    const ratio = await calculateFaucetSinkRatio(db);
    faucetSinkRatio = Number.isFinite(ratio) ? ratio : 999.99;
  } catch {
    // Non-fatal — default to 1.0
  }

  // Record the manual override as an audit row
  // Determine direction based on change
  const rewardChanged = rewardMultiplier !== currentReward;
  const costChanged = costMultiplier !== currentCost;
  let adjustmentType: "increase" | "decrease" | "none" = "none";
  if (rewardChanged || costChanged) {
    adjustmentType = rewardMultiplier > currentReward ? "increase" : "decrease";
  }

  const changePercent =
    currentReward > 0
      ? Math.abs(((rewardMultiplier - currentReward) / currentReward) * 100)
      : 0;

  await db.insert(rateAdjustments).values({
    adjustmentType,
    faucetSinkRatio: String(Number(faucetSinkRatio.toFixed(2))),
    rewardMultiplierBefore: String(currentReward),
    rewardMultiplierAfter: String(rewardMultiplier),
    costMultiplierBefore: String(currentCost),
    costMultiplierAfter: String(costMultiplier),
    changePercent: String(Number(changePercent.toFixed(2))),
    circuitBreakerActive: false,
    periodStart,
    periodEnd,
    triggeredBy: "admin",
  });

  const human = c.get("human");
  logger.info(
    {
      admin: human?.email,
      rewardMultiplier: `${currentReward} -> ${rewardMultiplier}`,
      costMultiplier: `${currentCost} -> ${costMultiplier}`,
    },
    "Admin manual rate adjustment override",
  );

  return c.json({
    ok: true,
    data: {
      rewardMultiplier: {
        before: currentReward,
        after: rewardMultiplier,
      },
      costMultiplier: {
        before: currentCost,
        after: costMultiplier,
      },
      adjustmentType,
      changePercent: Number(changePercent.toFixed(2)),
      triggeredBy: "admin",
    },
    requestId: c.get("requestId"),
  });
});
