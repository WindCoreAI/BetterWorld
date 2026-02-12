/**
 * Admin Phase 3 routes (Sprint 10)
 *
 * Feature flags, credit stats, validator stats, Open311 stats, validator backfill
 */
import { agents, agentCreditTransactions, validatorPool } from "@betterworld/db";
import { FEATURE_FLAG_NAMES, OPEN311_CITY_CONFIGS } from "@betterworld/shared";
import type { FeatureFlagName } from "@betterworld/shared";
import { sql, eq, count, sum, avg } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { getDb, getRedis } from "../../lib/container.js";
import type { AuthEnv } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/auth.js";
import { logger } from "../../middleware/logger.js";
import { validate } from "../../middleware/validate.js";
import { getFeatureFlags, setFlag, resetFlag } from "../../services/feature-flags.js";

const phase3AdminRoutes = new Hono<AuthEnv>();

// ============================================================================
// Feature Flags
// ============================================================================

// GET /admin/feature-flags — List all flags
phase3AdminRoutes.get("/feature-flags", requireAdmin(), async (c) => {
  const redis = getRedis();
  const flags = await getFeatureFlags(redis);

  return c.json({
    ok: true,
    data: { flags },
    requestId: c.get("requestId"),
  });
});

const updateFlagSchema = z.object({
  value: z.union([z.boolean(), z.number().int().min(0).max(100)]),
});

// PUT /admin/feature-flags/:flagName — Set flag value
phase3AdminRoutes.put(
  "/feature-flags/:flagName",
  requireAdmin(),
  validate({ body: updateFlagSchema }),
  async (c) => {
    const redis = getRedis();
    if (!redis) {
      return c.json(
        { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Redis not available for flag storage" }, requestId: c.get("requestId") },
        503,
      );
    }

    const flagName = c.req.param("flagName") as FeatureFlagName;
    if (!FEATURE_FLAG_NAMES.includes(flagName)) {
      return c.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid flag name" }, requestId: c.get("requestId") },
        400,
      );
    }

    const body = await c.req.json();
    const parsed = updateFlagSchema.parse(body);
    const { previousValue } = await setFlag(redis, flagName, parsed.value as never);

    logger.info(
      { flag: flagName, previousValue, newValue: parsed.value, admin: c.get("user")?.email },
      "Admin updated feature flag",
    );

    return c.json({
      ok: true,
      data: { flagName, value: parsed.value, previousValue },
      requestId: c.get("requestId"),
    });
  },
);

// DELETE /admin/feature-flags/:flagName — Reset to default
phase3AdminRoutes.delete("/feature-flags/:flagName", requireAdmin(), async (c) => {
  const redis = getRedis();
  if (!redis) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Redis not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const flagName = c.req.param("flagName") as FeatureFlagName;
  if (!FEATURE_FLAG_NAMES.includes(flagName)) {
    return c.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid flag name" }, requestId: c.get("requestId") },
      400,
    );
  }

  const { defaultValue } = await resetFlag(redis, flagName);

  return c.json({
    ok: true,
    data: { flagName, reset: true, defaultValue },
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// Credit Stats (T043)
// ============================================================================

phase3AdminRoutes.get("/credits/stats", requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  // Total credits in circulation
  const [circulation] = await db
    .select({ total: sum(agents.creditBalance) })
    .from(agents);

  // Count agents with balance > 0
  const [agentCount] = await db
    .select({ count: count() })
    .from(agents)
    .where(sql`${agents.creditBalance} > 0`);

  // Starter grants count
  const [grantsCount] = await db
    .select({ count: count() })
    .from(agentCreditTransactions)
    .where(eq(agentCreditTransactions.transactionType, "earn_starter_grant"));

  // Total earned/spent
  const [earned] = await db
    .select({ total: sum(agentCreditTransactions.amount) })
    .from(agentCreditTransactions)
    .where(sql`${agentCreditTransactions.amount} > 0`);

  const [spent] = await db
    .select({ total: sql<string>`COALESCE(SUM(ABS(${agentCreditTransactions.amount})), 0)` })
    .from(agentCreditTransactions)
    .where(sql`${agentCreditTransactions.amount} < 0`);

  const totalEarned = Number(earned?.total ?? 0);
  const totalSpent = Number(spent?.total ?? 0);
  const faucetSinkRatio = totalSpent > 0 ? totalEarned / totalSpent : totalEarned > 0 ? Infinity : 0;

  // Distribution stats
  const distributionResult = await db.execute(sql`
    SELECT
      COALESCE(AVG(credit_balance), 0) as mean,
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY credit_balance), 0) as median,
      COALESCE(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY credit_balance), 0) as p90,
      COALESCE(MAX(credit_balance), 0) as max
    FROM agents
    WHERE credit_balance > 0
  `);

  const dist = distributionResult[0] as {
    mean: string;
    median: string;
    p90: string;
    max: number;
  };

  return c.json({
    ok: true,
    data: {
      totalCreditsInCirculation: Number(circulation?.total ?? 0),
      totalStarterGrantsIssued: Number(grantsCount?.count ?? 0),
      totalCreditsEarned: totalEarned,
      totalCreditsSpent: totalSpent,
      faucetSinkRatio: Number.isFinite(faucetSinkRatio) ? Number(faucetSinkRatio.toFixed(2)) : 0,
      agentCount: Number(agentCount?.count ?? 0),
      distribution: {
        mean: Number(Number(dist?.mean ?? 0).toFixed(2)),
        median: Number(Number(dist?.median ?? 0).toFixed(2)),
        p90: Number(Number(dist?.p90 ?? 0).toFixed(2)),
        max: Number(dist?.max ?? 0),
      },
    },
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// Validator Stats (T044)
// ============================================================================

phase3AdminRoutes.get("/validators/stats", requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  // Total validators
  const [total] = await db.select({ count: count() }).from(validatorPool);

  // Active validators
  const [active] = await db
    .select({ count: count() })
    .from(validatorPool)
    .where(eq(validatorPool.isActive, true));

  // Suspended validators
  const [suspended] = await db
    .select({ count: count() })
    .from(validatorPool)
    .where(sql`${validatorPool.suspendedUntil} IS NOT NULL AND ${validatorPool.suspendedUntil} > now()`);

  // Tier breakdown
  const tierResults = await db
    .select({
      tier: validatorPool.tier,
      count: count(),
    })
    .from(validatorPool)
    .groupBy(validatorPool.tier);

  const tierBreakdown: Record<string, number> = {
    apprentice: 0,
    journeyman: 0,
    expert: 0,
  };
  for (const row of tierResults) {
    tierBreakdown[row.tier] = Number(row.count);
  }

  // Average F1 and response rate
  const [averages] = await db
    .select({
      avgF1: avg(validatorPool.f1Score),
      avgResponseRate: avg(validatorPool.responseRate),
    })
    .from(validatorPool);

  // Daily evaluations
  const [dailyEvals] = await db
    .select({ total: sum(validatorPool.dailyEvaluationCount) })
    .from(validatorPool);

  return c.json({
    ok: true,
    data: {
      totalValidators: Number(total?.count ?? 0),
      activeValidators: Number(active?.count ?? 0),
      suspendedValidators: Number(suspended?.count ?? 0),
      tierBreakdown,
      averageF1Score: Number(Number(averages?.avgF1 ?? 0).toFixed(4)),
      averageResponseRate: Number(Number(averages?.avgResponseRate ?? 0).toFixed(2)),
      totalEvaluationsToday: Number(dailyEvals?.total ?? 0),
    },
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// Open311 Stats (T045)
// ============================================================================

phase3AdminRoutes.get("/open311/stats", requireAdmin(), async (c) => {
  const db = getDb();
  const redis = getRedis();

  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const cities = [];

  for (const [cityId, config] of Object.entries(OPEN311_CITY_CONFIGS)) {
    let lastSyncAt: string | null = null;
    let lastError: string | null = null;
    let lastErrorAt: string | null = null;

    if (redis) {
      try {
        lastSyncAt = await redis.get(`open311:last-sync:${cityId}`);
        lastError = await redis.get(`open311:last-error:${cityId}`);
        lastErrorAt = await redis.get(`open311:last-error-at:${cityId}`);
      } catch {
        // Non-fatal
      }
    }

    // Count ingested problems by municipal source type
    const [ingested] = await db.execute(sql`
      SELECT COUNT(*) as count FROM problems
      WHERE municipal_source_type = ${cityId}
    `);

    // Count skipped (dedup) - tracked in Redis
    let totalSkipped = 0;
    if (redis) {
      try {
        const skipped = await redis.get(`open311:skipped:${cityId}`);
        totalSkipped = skipped ? parseInt(skipped, 10) : 0;
      } catch {
        // Non-fatal
      }
    }

    cities.push({
      cityId,
      displayName: config.displayName,
      enabled: config.enabled,
      lastSyncAt,
      totalIngested: Number((ingested as { count: string }).count),
      totalSkipped,
      lastError,
      lastErrorAt,
    });
  }

  return c.json({
    ok: true,
    data: { cities },
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// Validator Pool Backfill (T038)
// ============================================================================

phase3AdminRoutes.post("/validators/backfill", requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const { backfillValidatorPool } = await import("../../services/validator-pool.service.js");
  const result = await backfillValidatorPool(db);

  return c.json({
    ok: true,
    data: result,
    requestId: c.get("requestId"),
  });
});

export default phase3AdminRoutes;
