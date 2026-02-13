/**
 * Admin Phase 3 routes (Sprint 10)
 *
 * Feature flags, credit stats, validator stats, Open311 stats, validator backfill
 */
import { agents, agentCreditTransactions, economicHealthSnapshots, observations, peerEvaluations, spotChecks, validatorPool } from "@betterworld/db";
import { FEATURE_FLAG_NAMES, OPEN311_CITY_CONFIGS } from "@betterworld/shared";
import type { FeatureFlagName } from "@betterworld/shared";
import { and, sql, eq, gte, desc, count, sum, avg } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { getDb, getRedis } from "../../lib/container.js";
import type { AuthEnv } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/auth.js";
import { logger } from "../../middleware/logger.js";
import { validate } from "../../middleware/validate.js";
import { getFeatureFlags, getFlag, setFlag, resetFlag } from "../../services/feature-flags.js";

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

// ============================================================================
// Production Shift Status (Sprint 12 — T023)
// ============================================================================

// eslint-disable-next-line complexity
phase3AdminRoutes.get("/production-shift/status", requireAdmin(), async (c) => {
  const db = getDb();
  const redis = getRedis();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE" as const, message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const fromDate = c.req.query("fromDate") || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]!;
  const toDate = c.req.query("toDate") || new Date().toISOString().split("T")[0]!;
  const fromTs = new Date(fromDate);
  const toTs = new Date(toDate + "T23:59:59.999Z");

  // Current traffic percentage
  const trafficPct = await getFlag(redis, "PEER_VALIDATION_TRAFFIC_PCT");

  // Routing stats from guardrail_evaluations in the date range
  const routingStats = await db.execute(sql`
    SELECT
      COUNT(*) as total_submissions,
      COUNT(*) FILTER (WHERE routing_decision = 'peer_consensus') as peer_routed,
      COUNT(*) FILTER (WHERE routing_decision = 'layer_b') as layer_b_routed
    FROM guardrail_evaluations
    WHERE created_at >= ${fromTs} AND created_at <= ${toTs}
  `);

  const stats = (routingStats as Array<Record<string, string>>)[0] ?? {};
  const totalSubmissions = Number(stats.total_submissions ?? 0);
  const peerRouted = Number(stats.peer_routed ?? 0);
  const layerBRouted = Number(stats.layer_b_routed ?? 0);
  const actualPeerPct = totalSubmissions > 0 ? (peerRouted / totalSubmissions) * 100 : 0;

  // Consensus failures (escalated + expired) for peer-routed items
  const failureStats = await db.execute(sql`
    SELECT
      COUNT(*) as failures,
      COALESCE(AVG(consensus_latency_ms), 0) as avg_latency
    FROM consensus_results
    WHERE created_at >= ${fromTs} AND created_at <= ${toTs}
  `);
  const fStats = (failureStats as Array<Record<string, string>>)[0] ?? {};

  const consensusFailureStats = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM consensus_results
    WHERE created_at >= ${fromTs} AND created_at <= ${toTs}
      AND decision IN ('escalated', 'expired')
  `);
  const consensusFailures = Number((consensusFailureStats as Array<Record<string, string>>)[0]?.count ?? 0);

  // Tier breakdown
  const tierStats = await db.execute(sql`
    SELECT
      trust_tier,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE routing_decision = 'peer_consensus') as peer_routed,
      COUNT(*) FILTER (WHERE routing_decision = 'layer_b') as layer_b_routed
    FROM guardrail_evaluations
    WHERE created_at >= ${fromTs} AND created_at <= ${toTs}
    GROUP BY trust_tier
  `);

  const byTier: Record<string, { total: number; peerRouted: number; layerBRouted: number }> = {
    verified: { total: 0, peerRouted: 0, layerBRouted: 0 },
    new: { total: 0, peerRouted: 0, layerBRouted: 0 },
  };

  for (const row of tierStats as Array<Record<string, string>>) {
    const tier = row.trust_tier === "verified" ? "verified" : "new";
    byTier[tier] = {
      total: Number(row.total ?? 0),
      peerRouted: Number(row.peer_routed ?? 0),
      layerBRouted: Number(row.layer_b_routed ?? 0),
    };
  }

  // Pending peer evaluations (for rollback readiness)
  const [pendingEvals] = await db
    .select({ count: count() })
    .from(peerEvaluations)
    .where(eq(peerEvaluations.status, "pending"));

  return c.json({
    ok: true,
    data: {
      trafficPercentage: trafficPct,
      routingEnabled: trafficPct > 0,
      routing: {
        totalSubmissions,
        peerConsensusRouted: peerRouted,
        layerBRouted,
        actualPeerPercentage: Number(actualPeerPct.toFixed(2)),
        consensusFailures,
        fallbackToLayerB: consensusFailures,
        avgConsensusLatencyMs: Number(Number(fStats.avg_latency ?? 0).toFixed(0)),
      },
      byTier,
      rollbackReadiness: {
        ready: true,
        pendingPeerEvaluations: Number(pendingEvals?.count ?? 0),
      },
      period: { from: fromDate, to: toDate },
    },
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// Production Shift Traffic Control (Sprint 12 — T024)
// ============================================================================

const setTrafficSchema = z.object({
  percentage: z.number().int().min(0).max(100),
  reason: z.string().min(10).max(500),
});

phase3AdminRoutes.put(
  "/production-shift/traffic",
  requireAdmin(),
  validate({ body: setTrafficSchema }),
  async (c) => {
    const db = getDb();
    const redis = getRedis();
    if (!redis) {
      return c.json(
        { ok: false, error: { code: "SERVICE_UNAVAILABLE" as const, message: "Redis not available" }, requestId: c.get("requestId") },
        503,
      );
    }

    const body = await c.req.json();
    const parsed = setTrafficSchema.parse(body);

    // Safety gate: if enabling peer routing (>0%), check shadow agreement rate
    if (parsed.percentage > 0) {
      try {
        const { getAgreementStats } = await import("../../services/agreement-stats.js");
        if (db) {
          const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]!;
          const toDate = new Date().toISOString().split("T")[0]!;
          const stats = await getAgreementStats(db, redis, fromDate, toDate);
          const agreementRate = stats.overall.agreementRate;

          if (agreementRate < 80 && stats.overall.totalSubmissions > 0) {
            return c.json(
              {
                ok: false,
                error: {
                  code: "PRECONDITION_FAILED" as const,
                  message: `Cannot enable peer routing: shadow mode agreement rate is ${agreementRate.toFixed(1)}%, minimum required is 80%`,
                },
                requestId: c.get("requestId"),
              },
              409,
            );
          }
        }
      } catch (err) {
        // If we can't check agreement rate, log warning but allow the change
        logger.warn(
          { error: (err as Error).message },
          "Could not verify shadow agreement rate — proceeding with traffic change",
        );
      }
    }

    const previousPct = await getFlag(redis, "PEER_VALIDATION_TRAFFIC_PCT");
    await setFlag(redis, "PEER_VALIDATION_TRAFFIC_PCT", parsed.percentage);

    const admin = c.get("user");
    logger.info(
      {
        previousPercentage: previousPct,
        newPercentage: parsed.percentage,
        reason: parsed.reason,
        admin: admin?.email,
      },
      "Production shift traffic updated",
    );

    return c.json({
      ok: true,
      data: {
        previousPercentage: previousPct,
        newPercentage: parsed.percentage,
        effectiveAt: new Date().toISOString(),
        reason: parsed.reason,
        rollbackAvailable: true,
      },
      requestId: c.get("requestId"),
    });
  },
);

// ============================================================================
// Production Shift Dashboard (Sprint 12 — T036)
// ============================================================================

// eslint-disable-next-line complexity
phase3AdminRoutes.get("/production-shift/dashboard", requireAdmin(), async (c) => {
  const db = getDb();
  const redis = getRedis();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE" as const, message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const fromDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Traffic routing stats (24h)
  const [routingRow] = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE routing_decision = 'peer_consensus') as peer_count,
      COUNT(*) FILTER (WHERE routing_decision = 'layer_b') as layer_b_count
    FROM guardrail_evaluations
    WHERE created_at >= ${fromDate}
  `);
  const routing = routingRow as Record<string, string>;

  // False negative rate from spot checks (24h)
  const [spotCheckRow] = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE agrees = false) as disagreements,
      COUNT(*) FILTER (WHERE disagreement_type = 'false_negative') as false_negatives
    FROM spot_checks
    WHERE created_at >= ${fromDate}
  `);
  const sc = spotCheckRow as Record<string, string>;
  const spotTotal = Number(sc?.total ?? 0);
  const falseNegativeRate = spotTotal > 0 ? (Number(sc?.false_negatives ?? 0) / spotTotal) * 100 : 0;

  // Consensus latency stats (24h)
  const [latencyRow] = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      COALESCE(AVG(consensus_latency_ms), 0) as avg_ms,
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY consensus_latency_ms), 0) as p50,
      COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY consensus_latency_ms), 0) as p95,
      COUNT(*) FILTER (WHERE decision IN ('escalated', 'expired')) as quorum_failures
    FROM consensus_results
    WHERE created_at >= ${fromDate}
  `);
  const lat = latencyRow as Record<string, string>;

  // Validator response rates
  const [validatorRow] = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_active = true) as active,
      COALESCE(AVG(response_rate), 0) as avg_response_rate
    FROM validator_pool
  `);
  const val = validatorRow as Record<string, string>;

  // Economic health (latest snapshot)
  const [latestSnapshot] = await db
    .select()
    .from(economicHealthSnapshots)
    .orderBy(desc(economicHealthSnapshots.createdAt))
    .limit(1);

  const trafficPct = await getFlag(redis, "PEER_VALIDATION_TRAFFIC_PCT");

  return c.json({
    ok: true,
    data: {
      trafficPercentage: trafficPct,
      routing: {
        totalSubmissions: Number(routing?.total ?? 0),
        peerCount: Number(routing?.peer_count ?? 0),
        layerBCount: Number(routing?.layer_b_count ?? 0),
      },
      falseNegativeRate: Number(falseNegativeRate.toFixed(2)),
      consensus: {
        total: Number(lat?.total ?? 0),
        avgLatencyMs: Number(Number(lat?.avg_ms ?? 0).toFixed(0)),
        p50LatencyMs: Number(Number(lat?.p50 ?? 0).toFixed(0)),
        p95LatencyMs: Number(Number(lat?.p95 ?? 0).toFixed(0)),
        quorumFailures: Number(lat?.quorum_failures ?? 0),
      },
      validators: {
        total: Number(val?.total ?? 0),
        active: Number(val?.active ?? 0),
        avgResponseRate: Number(Number(val?.avg_response_rate ?? 0).toFixed(2)),
      },
      economicHealth: latestSnapshot
        ? {
            faucetSinkRatio: Number(latestSnapshot.faucetSinkRatio),
            hardshipRate: Number(latestSnapshot.hardshipRate),
            medianBalance: Number(latestSnapshot.medianBalance),
            alertTriggered: latestSnapshot.alertTriggered,
            snapshotAt: latestSnapshot.createdAt.toISOString(),
          }
        : null,
    },
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// Production Shift Alerts (Sprint 12 — T037)
// ============================================================================

phase3AdminRoutes.get("/production-shift/alerts", requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE" as const, message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const limitParam = Number(c.req.query("limit") ?? 20);
  const limit = Math.min(Math.max(limitParam, 1), 100);

  // Economic health alerts
  const healthAlerts = await db
    .select({
      id: economicHealthSnapshots.id,
      type: sql<string>`'economic_health'`,
      alertDetails: economicHealthSnapshots.alertDetails,
      faucetSinkRatio: economicHealthSnapshots.faucetSinkRatio,
      hardshipRate: economicHealthSnapshots.hardshipRate,
      createdAt: economicHealthSnapshots.createdAt,
    })
    .from(economicHealthSnapshots)
    .where(eq(economicHealthSnapshots.alertTriggered, true))
    .orderBy(desc(economicHealthSnapshots.createdAt))
    .limit(limit);

  // Consensus latency violations (p95 > 60s = 60000ms)
  const latencyViolations = await db.execute(sql`
    SELECT id, submission_id, submission_type, consensus_latency_ms, decision, created_at
    FROM consensus_results
    WHERE consensus_latency_ms > 60000
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);

  // Spot check disagreements
  const disagreements = await db
    .select({
      id: spotChecks.id,
      submissionId: spotChecks.submissionId,
      submissionType: spotChecks.submissionType,
      peerDecision: spotChecks.peerDecision,
      layerBDecision: spotChecks.layerBDecision,
      disagreementType: spotChecks.disagreementType,
      adminReviewed: spotChecks.adminReviewed,
      createdAt: spotChecks.createdAt,
    })
    .from(spotChecks)
    .where(eq(spotChecks.agrees, false))
    .orderBy(desc(spotChecks.createdAt))
    .limit(limit);

  return c.json({
    ok: true,
    data: {
      economicHealthAlerts: healthAlerts.map((a) => ({
        id: a.id,
        type: "economic_health",
        details: a.alertDetails,
        faucetSinkRatio: Number(a.faucetSinkRatio),
        hardshipRate: Number(a.hardshipRate),
        createdAt: a.createdAt.toISOString(),
      })),
      latencyViolations: (latencyViolations as Array<Record<string, unknown>>).map((v) => ({
        id: v.id,
        submissionId: v.submission_id,
        submissionType: v.submission_type,
        latencyMs: Number(v.consensus_latency_ms),
        decision: v.decision,
        createdAt: v.created_at,
      })),
      spotCheckDisagreements: disagreements.map((d) => ({
        id: d.id,
        submissionId: d.submissionId,
        submissionType: d.submissionType,
        peerDecision: d.peerDecision,
        layerBDecision: d.layerBDecision,
        disagreementType: d.disagreementType,
        adminReviewed: d.adminReviewed,
        createdAt: d.createdAt.toISOString(),
      })),
    },
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// Decision Gate (Sprint 12 — T038)
// ============================================================================

// eslint-disable-next-line complexity
phase3AdminRoutes.get("/production-shift/decision-gate", requireAdmin(), async (c) => {
  const db = getDb();
  const redis = getRedis();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE" as const, message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  // 1. Credit economy functional — check both spend and earn records exist
  const [spendCount] = await db
    .select({ count: count() })
    .from(agentCreditTransactions)
    .where(sql`${agentCreditTransactions.amount} < 0`);
  const [earnCount] = await db
    .select({ count: count() })
    .from(agentCreditTransactions)
    .where(sql`${agentCreditTransactions.amount} > 0`);
  const creditEconomyFunctional = Number(spendCount?.count ?? 0) > 0 && Number(earnCount?.count ?? 0) > 0;

  // 2. >= 50% peer validation — current traffic flag
  const trafficPct = await getFlag(redis, "PEER_VALIDATION_TRAFFIC_PCT");
  const peerValidationSufficient = trafficPct >= 50;

  // 3. >= 20 hyperlocal problems — problems with open311 or observation source
  const [hyperlocalCount] = await db.execute(sql`
    SELECT COUNT(*) as count FROM problems
    WHERE municipal_source_type IS NOT NULL OR source = 'observation'
  `);
  const hyperlocalProblems = Number((hyperlocalCount as Record<string, string>).count ?? 0);
  const hyperlocalSufficient = hyperlocalProblems >= 20;

  // 4. No P0 bugs — manual, default pending
  // Check Redis for admin-set value
  let noP0Bugs: boolean | null = null;
  if (redis) {
    try {
      const val = await redis.get("decision-gate:no-p0-bugs");
      if (val !== null) noP0Bugs = val === "true";
    } catch { /* non-fatal */ }
  }

  // 5. API p95 < 500ms — manual/prometheus, default pending
  let apiPerformance: boolean | null = null;
  if (redis) {
    try {
      const val = await redis.get("decision-gate:api-performance");
      if (val !== null) apiPerformance = val === "true";
    } catch { /* non-fatal */ }
  }

  // 6. 90%+ deliverables — manual, default pending
  let deliverablesComplete: boolean | null = null;
  if (redis) {
    try {
      const val = await redis.get("decision-gate:deliverables");
      if (val !== null) deliverablesComplete = val === "true";
    } catch { /* non-fatal */ }
  }

  const criteria = [
    { id: "credit_economy", label: "Credit economy functional", status: creditEconomyFunctional ? "pass" : "fail", auto: true, value: `Spend: ${spendCount?.count ?? 0}, Earn: ${earnCount?.count ?? 0}` },
    { id: "peer_validation", label: ">=50% peer validation", status: peerValidationSufficient ? "pass" : "fail", auto: true, value: `${trafficPct}%` },
    { id: "hyperlocal_problems", label: ">=20 hyperlocal problems", status: hyperlocalSufficient ? "pass" : "fail", auto: true, value: `${hyperlocalProblems} problems` },
    { id: "no_p0_bugs", label: "No P0 bugs", status: noP0Bugs === null ? "pending" : noP0Bugs ? "pass" : "fail", auto: false, value: noP0Bugs === null ? "Not assessed" : noP0Bugs ? "Confirmed" : "Issues found" },
    { id: "api_performance", label: "API p95 < 500ms", status: apiPerformance === null ? "pending" : apiPerformance ? "pass" : "fail", auto: false, value: apiPerformance === null ? "Not assessed" : apiPerformance ? "Within target" : "Exceeds target" },
    { id: "deliverables", label: "90%+ deliverables", status: deliverablesComplete === null ? "pending" : deliverablesComplete ? "pass" : "fail", auto: false, value: deliverablesComplete === null ? "Not assessed" : deliverablesComplete ? "Complete" : "Incomplete" },
  ];

  const passCount = criteria.filter((c) => c.status === "pass").length;
  const ready = passCount >= 5;

  return c.json({
    ok: true,
    data: {
      criteria,
      summary: { passed: passCount, total: criteria.length, ready },
      recommendation: ready
        ? "All critical gates passed. Phase 3 production shift is ready to proceed."
        : `${passCount}/${criteria.length} gates passed. Need ${5 - passCount} more to proceed.`,
    },
    requestId: c.get("requestId"),
  });
});

// PUT /admin/production-shift/decision-gate/:criterionId — Set manual criterion
const setGateCriterionSchema = z.object({
  status: z.enum(["pass", "fail", "pending"]),
});

phase3AdminRoutes.put(
  "/production-shift/decision-gate/:criterionId",
  requireAdmin(),
  validate({ body: setGateCriterionSchema }),
  async (c) => {
    const redis = getRedis();
    if (!redis) {
      return c.json(
        { ok: false, error: { code: "SERVICE_UNAVAILABLE" as const, message: "Redis not available" }, requestId: c.get("requestId") },
        503,
      );
    }

    const criterionId = c.req.param("criterionId");
    const manualCriteria = ["no_p0_bugs", "api_performance", "deliverables"];
    if (!manualCriteria.includes(criterionId)) {
      return c.json(
        { ok: false, error: { code: "VALIDATION_ERROR" as const, message: "Only manual criteria can be set" }, requestId: c.get("requestId") },
        400,
      );
    }

    const body = await c.req.json();
    const parsed = setGateCriterionSchema.parse(body);

    const keyMap: Record<string, string> = {
      no_p0_bugs: "decision-gate:no-p0-bugs",
      api_performance: "decision-gate:api-performance",
      deliverables: "decision-gate:deliverables",
    };

    if (parsed.status === "pending") {
      await redis.del(keyMap[criterionId]!);
    } else {
      await redis.set(keyMap[criterionId]!, parsed.status === "pass" ? "true" : "false");
    }

    return c.json({
      ok: true,
      data: { criterionId, status: parsed.status },
      requestId: c.get("requestId"),
    });
  },
);

// ============================================================================
// Economic Health Detail (Sprint 12 — T039)
// ============================================================================

phase3AdminRoutes.get("/production-shift/economic-health", requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE" as const, message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const limitParam = Number(c.req.query("limit") ?? 20);
  const limit = Math.min(Math.max(limitParam, 1), 100);
  const cursor = c.req.query("cursor");

  // Faucet/sink breakdown by type (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const faucetSink = await db.execute(sql`
    SELECT
      transaction_type,
      SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as faucet,
      SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as sink,
      COUNT(*) as tx_count
    FROM agent_credit_transactions
    WHERE created_at >= ${sevenDaysAgo}
    GROUP BY transaction_type
    ORDER BY tx_count DESC
  `);

  // Hardship agents (cursor-paginated)
  const hardshipConditions = [sql`${agents.creditBalance} < ${10}`];
  if (cursor) {
    hardshipConditions.push(sql`${agents.id} > ${cursor}`);
  }

  const hardshipAgents = await db
    .select({
      id: agents.id,
      username: agents.username,
      creditBalance: agents.creditBalance,
      createdAt: agents.createdAt,
    })
    .from(agents)
    .where(and(...hardshipConditions))
    .orderBy(agents.id)
    .limit(limit + 1);

  const hasMore = hardshipAgents.length > limit;
  const items = hasMore ? hardshipAgents.slice(0, limit) : hardshipAgents;
  const nextCursor = hasMore ? items[items.length - 1]!.id : null;

  // Balance distribution percentiles
  const [distribution] = await db.execute(sql`
    SELECT
      COALESCE(PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY credit_balance), 0) as p10,
      COALESCE(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY credit_balance), 0) as p25,
      COALESCE(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY credit_balance), 0) as p50,
      COALESCE(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY credit_balance), 0) as p75,
      COALESCE(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY credit_balance), 0) as p90,
      COALESCE(AVG(credit_balance), 0) as mean,
      COALESCE(MIN(credit_balance), 0) as min,
      COALESCE(MAX(credit_balance), 0) as max
    FROM agents
  `);
  const dist = distribution as Record<string, string>;

  // Daily trend from snapshots (last 7 days)
  const dailyTrend = await db
    .select({
      id: economicHealthSnapshots.id,
      periodStart: economicHealthSnapshots.periodStart,
      periodEnd: economicHealthSnapshots.periodEnd,
      faucetSinkRatio: economicHealthSnapshots.faucetSinkRatio,
      hardshipRate: economicHealthSnapshots.hardshipRate,
      medianBalance: economicHealthSnapshots.medianBalance,
      alertTriggered: economicHealthSnapshots.alertTriggered,
      createdAt: economicHealthSnapshots.createdAt,
    })
    .from(economicHealthSnapshots)
    .where(gte(economicHealthSnapshots.createdAt, sevenDaysAgo))
    .orderBy(desc(economicHealthSnapshots.createdAt))
    .limit(168); // 7 days * 24 hours

  return c.json({
    ok: true,
    data: {
      faucetSinkBreakdown: (faucetSink as Array<Record<string, string>>).map((row) => ({
        transactionType: row.transaction_type,
        faucet: Number(row.faucet ?? 0),
        sink: Number(row.sink ?? 0),
        txCount: Number(row.tx_count ?? 0),
      })),
      hardshipAgents: {
        items: items.map((a) => ({
          id: a.id,
          username: a.username,
          creditBalance: a.creditBalance,
          createdAt: a.createdAt.toISOString(),
        })),
        hasMore,
        nextCursor,
      },
      balanceDistribution: {
        p10: Number(Number(dist?.p10 ?? 0).toFixed(2)),
        p25: Number(Number(dist?.p25 ?? 0).toFixed(2)),
        p50: Number(Number(dist?.p50 ?? 0).toFixed(2)),
        p75: Number(Number(dist?.p75 ?? 0).toFixed(2)),
        p90: Number(Number(dist?.p90 ?? 0).toFixed(2)),
        mean: Number(Number(dist?.mean ?? 0).toFixed(2)),
        min: Number(dist?.min ?? 0),
        max: Number(dist?.max ?? 0),
      },
      dailyTrend: dailyTrend.map((s) => ({
        faucetSinkRatio: Number(s.faucetSinkRatio),
        hardshipRate: Number(s.hardshipRate),
        medianBalance: Number(s.medianBalance),
        alertTriggered: s.alertTriggered,
        timestamp: s.createdAt.toISOString(),
      })),
    },
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// Privacy Processing Stats (Sprint 12 — T063)
// ============================================================================

phase3AdminRoutes.get("/privacy/stats", requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") }, 503);
  }

  const [stats] = await db
    .select({
      total: sql<string>`COUNT(*)`,
      pending: sql<string>`SUM(CASE WHEN ${observations.privacyProcessingStatus} = 'pending' THEN 1 ELSE 0 END)`,
      processing: sql<string>`SUM(CASE WHEN ${observations.privacyProcessingStatus} = 'processing' THEN 1 ELSE 0 END)`,
      completed: sql<string>`SUM(CASE WHEN ${observations.privacyProcessingStatus} = 'completed' THEN 1 ELSE 0 END)`,
      quarantined: sql<string>`SUM(CASE WHEN ${observations.privacyProcessingStatus} = 'quarantined' THEN 1 ELSE 0 END)`,
    })
    .from(observations);

  const total = Number(stats?.total ?? 0);
  const completed = Number(stats?.completed ?? 0);
  const completionRate = total > 0 ? completed / total : 0;

  return c.json({
    ok: true,
    data: {
      total,
      pending: Number(stats?.pending ?? 0),
      processing: Number(stats?.processing ?? 0),
      completed,
      quarantined: Number(stats?.quarantined ?? 0),
      completionRate: Number(completionRate.toFixed(4)),
    },
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// Privacy Retry (Sprint 12 — T064)
// ============================================================================

phase3AdminRoutes.put("/privacy/:observationId/retry", requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") }, 503);
  }

  const observationId = c.req.param("observationId");

  // Validate UUID
  const uuidParsed = z.string().uuid().safeParse(observationId);
  if (!uuidParsed.success) {
    return c.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid observation ID" }, requestId: c.get("requestId") }, 422);
  }

  const [obs] = await db
    .select({
      id: observations.id,
      privacyProcessingStatus: observations.privacyProcessingStatus,
    })
    .from(observations)
    .where(eq(observations.id, observationId))
    .limit(1);

  if (!obs) {
    return c.json({ ok: false, error: { code: "NOT_FOUND", message: "Observation not found" }, requestId: c.get("requestId") }, 404);
  }

  if (obs.privacyProcessingStatus !== "quarantined") {
    return c.json({ ok: false, error: { code: "CONFLICT", message: "Only quarantined observations can be retried" }, requestId: c.get("requestId") }, 409);
  }

  // Reset to pending and re-enqueue
  await db
    .update(observations)
    .set({
      privacyProcessingStatus: "pending",
      updatedAt: new Date(),
    })
    .where(eq(observations.id, observationId));

  // Enqueue for reprocessing
  try {
    const { QUEUE_NAMES } = await import("@betterworld/shared");
    const { Queue } = await import("bullmq");
    const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
    const queue = new Queue(QUEUE_NAMES.PRIVACY_PROCESSING, {
      connection: { url: redisUrl, lazyConnect: true },
    });
    await queue.add("process", { observationId }, {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
    });
    await queue.close();
  } catch {
    // Queue not available - still reset status
  }

  logger.info({ observationId }, "Privacy processing retry enqueued");

  return c.json({
    ok: true,
    data: { observationId, newStatus: "pending" },
    requestId: c.get("requestId"),
  });
});

export default phase3AdminRoutes;
