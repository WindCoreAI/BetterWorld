/**
 * Validator Routes (Sprint 11 — T025, T026, T027, T036)
 *
 * GET /validator/stats — Validator statistics
 * GET /validator/tier-history — Tier change history
 * PATCH /validator/affinity — Update home regions
 */
import { validatorPool, validatorTierChanges } from "@betterworld/db";
import { homeRegionsSchema } from "@betterworld/shared";
import { eq, sql, desc } from "drizzle-orm";
import { Hono } from "hono";

import { getDb } from "../lib/container.js";
import type { AuthEnv } from "../middleware/auth.js";
import { requireAgent } from "../middleware/auth.js";

const validatorRoutes = new Hono<AuthEnv>();

// ============================================================================
// GET /validator/stats — T025
// ============================================================================

validatorRoutes.get("/stats", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const agent = c.get("agent")!;

  const [validator] = await db
    .select()
    .from(validatorPool)
    .where(eq(validatorPool.agentId, agent.id))
    .limit(1);

  if (!validator) {
    return c.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Agent is not in the validator pool" }, requestId: c.get("requestId") },
      404,
    );
  }

  const homeRegions = (validator.homeRegions as Array<{ name: string; lat: number; lng: number }>) || [];

  return c.json({
    ok: true,
    data: {
      validatorId: validator.id,
      tier: validator.tier,
      f1Score: Number(validator.f1Score),
      precision: Number(validator.precision),
      recall: Number(validator.recall),
      totalEvaluations: validator.totalEvaluations,
      correctEvaluations: validator.correctEvaluations,
      responseRate: Number(validator.responseRate),
      dailyEvaluationCount: validator.dailyEvaluationCount,
      dailyLimit: 10,
      homeRegions,
      isActive: validator.isActive,
      suspendedUntil: validator.suspendedUntil?.toISOString() ?? null,
    },
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// GET /validator/tier-history — T026
// ============================================================================

validatorRoutes.get("/tier-history", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const agent = c.get("agent")!;
  const limitParam = parseInt(c.req.query("limit") || "20", 10);
  const limit = Math.min(Math.max(limitParam, 1), 50);

  // Find validator for this agent
  const [validator] = await db
    .select({ id: validatorPool.id, tier: validatorPool.tier })
    .from(validatorPool)
    .where(eq(validatorPool.agentId, agent.id))
    .limit(1);

  if (!validator) {
    return c.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Agent is not in the validator pool" }, requestId: c.get("requestId") },
      404,
    );
  }

  const history = await db
    .select({
      fromTier: validatorTierChanges.fromTier,
      toTier: validatorTierChanges.toTier,
      f1ScoreAtChange: validatorTierChanges.f1ScoreAtChange,
      evaluationsAtChange: validatorTierChanges.totalEvaluationsAtChange,
      changedAt: validatorTierChanges.changedAt,
    })
    .from(validatorTierChanges)
    .where(eq(validatorTierChanges.validatorId, validator.id))
    .orderBy(desc(validatorTierChanges.changedAt))
    .limit(limit);

  return c.json({
    ok: true,
    data: {
      currentTier: validator.tier,
      history: history.map((h) => ({
        fromTier: h.fromTier,
        toTier: h.toTier,
        f1ScoreAtChange: Number(h.f1ScoreAtChange),
        evaluationsAtChange: h.evaluationsAtChange,
        changedAt: h.changedAt.toISOString(),
      })),
    },
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// PATCH /validator/affinity — T036
// ============================================================================

validatorRoutes.patch("/affinity", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const agent = c.get("agent")!;

  const body = await c.req.json();
  const parsed = homeRegionsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          metadata: { fields: parsed.error.flatten().fieldErrors },
        },
        requestId: c.get("requestId"),
      },
      422,
    );
  }

  const { homeRegions } = parsed.data;

  // Check agent is in validator pool
  const [validator] = await db
    .select({ id: validatorPool.id })
    .from(validatorPool)
    .where(eq(validatorPool.agentId, agent.id))
    .limit(1);

  if (!validator) {
    return c.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Agent is not in the validator pool" }, requestId: c.get("requestId") },
      404,
    );
  }

  // Update home_regions JSONB and sync primary region
  const primaryRegion = homeRegions.length > 0 ? homeRegions[0] : null;

  const updateData: Record<string, unknown> = {
    homeRegions: JSON.stringify(homeRegions),
    updatedAt: new Date(),
  };

  if (primaryRegion) {
    updateData.homeRegionName = primaryRegion.name;
    // Use raw SQL for PostGIS geography point
    await db.execute(sql`
      UPDATE validator_pool
      SET home_regions = ${JSON.stringify(homeRegions)}::jsonb,
          home_region_name = ${primaryRegion.name},
          home_region_point = ST_SetSRID(ST_MakePoint(${primaryRegion.lng}, ${primaryRegion.lat}), 4326)::geography,
          updated_at = now()
      WHERE id = ${validator.id}
    `);
  } else {
    await db.execute(sql`
      UPDATE validator_pool
      SET home_regions = '[]'::jsonb,
          home_region_name = NULL,
          home_region_point = NULL,
          updated_at = now()
      WHERE id = ${validator.id}
    `);
  }

  return c.json({
    ok: true,
    data: {
      homeRegions,
      primaryRegion: primaryRegion?.name ?? null,
    },
    requestId: c.get("requestId"),
  });
});

export default validatorRoutes;
