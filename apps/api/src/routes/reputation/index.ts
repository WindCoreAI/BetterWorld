/**
 * Reputation Routes (Sprint 9: Reputation & Impact)
 *
 * GET /reputation/me — My reputation score + breakdown
 * GET /reputation/:humanId — Public reputation for a human
 * GET /reputation/me/history — Reputation change history
 * POST /reputation/endorsements — Endorse a peer
 * GET /reputation/tiers — All tier definitions
 */
import {
  endorsements,
  humans,
  reputationHistory,
  reputationScores,
} from "@betterworld/db";
import {
  endorsementCreateSchema,
  REPUTATION_DECAY,
  reputationHistoryQuerySchema,
  REPUTATION_TIERS,
  TIER_ORDER,
  type ReputationTierName,
} from "@betterworld/shared";
import { and, count, desc, eq, gte, lt } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import {
  ensureReputationRow,
  getNextTierInfo,
  updateReputation,
} from "../../lib/reputation-engine.js";
import { humanAuth } from "../../middleware/humanAuth.js";

const reputationRoutes = new Hono<AppEnv>();

// ────────────────── GET /reputation/tiers ──────────────────

reputationRoutes.get("/tiers", async (c) => {
  const db = getDb();
  if (!db)
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  // Get human count per tier
  const tierCounts = await db
    .select({
      tier: reputationScores.currentTier,
      count: count(),
    })
    .from(reputationScores)
    .groupBy(reputationScores.currentTier);

  const countMap = new Map(tierCounts.map((t) => [t.tier, Number(t.count)]));

  const tiers = TIER_ORDER.map((name) => {
    const tier = REPUTATION_TIERS[name];
    return {
      name: tier.name,
      displayName: tier.displayName,
      minScore: tier.minScore,
      multiplier: tier.multiplier,
      privileges: [...tier.privileges],
      humanCount: countMap.get(name) ?? 0,
    };
  });

  return c.json({
    ok: true,
    data: tiers,
    requestId: c.get("requestId"),
  });
});

// ────────────────── GET /reputation/me ──────────────────

reputationRoutes.get("/me", humanAuth(), async (c) => {
  const db = getDb();
  if (!db)
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const human = c.get("human");
  await ensureReputationRow(db, human.id);

  const [scoreRow] = await db
    .select()
    .from(reputationScores)
    .where(eq(reputationScores.humanId, human.id))
    .limit(1);

  if (!scoreRow) {
    return c.json({ ok: false, error: { code: "NOT_FOUND", message: "Reputation data not found" } }, 404);
  }

  const tier = scoreRow.currentTier as ReputationTierName;
  const totalScore = Number(scoreRow.totalScore);

  const gracePeriodActive = !!scoreRow.gracePeriodStart;
  const gracePeriodExpiry = scoreRow.gracePeriodStart
    ? new Date(
        scoreRow.gracePeriodStart.getTime() +
          REPUTATION_DECAY.gracePeriodDays * 24 * 60 * 60 * 1000,
      ).toISOString()
    : null;

  return c.json({
    ok: true,
    data: {
      humanId: human.id,
      totalScore,
      tier,
      tierMultiplier: Number(scoreRow.tierMultiplier),
      breakdown: {
        missionQuality: Number(scoreRow.missionQualityScore),
        peerAccuracy: Number(scoreRow.peerAccuracyScore),
        streak: Number(scoreRow.streakScore),
        endorsements: Number(scoreRow.endorsementScore),
      },
      nextTier: getNextTierInfo(tier, totalScore),
      gracePeriod: {
        active: gracePeriodActive,
        expiresAt: gracePeriodExpiry,
        previousTier: scoreRow.gracePeriodTier ?? null,
      },
      lastActivityAt: scoreRow.lastActivityAt?.toISOString() ?? null,
    },
    requestId: c.get("requestId"),
  });
});

// ────────────────── GET /reputation/me/history ──────────────────

reputationRoutes.get("/me/history", humanAuth(), async (c) => {
  const db = getDb();
  if (!db)
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const human = c.get("human");
  const query = reputationHistoryQuerySchema.parse(c.req.query());

  const conditions = [eq(reputationHistory.humanId, human.id)];
  if (query.cursor) {
    // Use cursor as the last ID seen
    const [cursorRow] = await db
      .select({ createdAt: reputationHistory.createdAt })
      .from(reputationHistory)
      .where(eq(reputationHistory.id, query.cursor))
      .limit(1);

    if (cursorRow) {
      conditions.push(lt(reputationHistory.createdAt, cursorRow.createdAt));
    }
  }
  if (query.event_type) {
    conditions.push(eq(reputationHistory.eventType, query.event_type));
  }

  const rows = await db
    .select()
    .from(reputationHistory)
    .where(and(...conditions))
    .orderBy(desc(reputationHistory.createdAt))
    .limit(query.limit + 1);

  const hasMore = rows.length > query.limit;
  const data = rows.slice(0, query.limit);

  return c.json({
    ok: true,
    data: data.map((r) => ({
      id: r.id,
      scoreBefore: Number(r.scoreBefore),
      scoreAfter: Number(r.scoreAfter),
      delta: Number(r.delta),
      eventType: r.eventType,
      eventSourceType: r.eventSourceType,
      tierBefore: r.tierBefore,
      tierAfter: r.tierAfter,
      metadata: r.metadata,
      createdAt: r.createdAt.toISOString(),
    })),
    meta: {
      cursor: hasMore ? data[data.length - 1]?.id ?? null : null,
      hasMore,
    },
    requestId: c.get("requestId"),
  });
});

// ────────────────── GET /reputation/:humanId ──────────────────

reputationRoutes.get("/:humanId", async (c) => {
  const db = getDb();
  if (!db)
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const humanId = c.req.param("humanId");

  // Check human exists and portfolio visibility
  const [humanRow] = await db
    .select({
      id: humans.id,
      displayName: humans.displayName,
      portfolioVisibility: humans.portfolioVisibility,
    })
    .from(humans)
    .where(eq(humans.id, humanId))
    .limit(1);

  if (!humanRow) {
    return c.json({ ok: false, error: { code: "NOT_FOUND", message: "Human not found" } }, 404);
  }

  if (humanRow.portfolioVisibility === "private") {
    return c.json({ ok: false, error: { code: "FORBIDDEN", message: "Profile is private" } }, 403);
  }

  const [scoreRow] = await db
    .select()
    .from(reputationScores)
    .where(eq(reputationScores.humanId, humanId))
    .limit(1);

  return c.json({
    ok: true,
    data: {
      humanId: humanRow.id,
      displayName: humanRow.displayName,
      totalScore: scoreRow ? Number(scoreRow.totalScore) : 0,
      tier: scoreRow?.currentTier ?? "newcomer",
      tierMultiplier: scoreRow ? Number(scoreRow.tierMultiplier) : 1.0,
      breakdown: {
        missionQuality: scoreRow ? Number(scoreRow.missionQualityScore) : 0,
        peerAccuracy: scoreRow ? Number(scoreRow.peerAccuracyScore) : 0,
        streak: scoreRow ? Number(scoreRow.streakScore) : 0,
        endorsements: scoreRow ? Number(scoreRow.endorsementScore) : 0,
      },
    },
    requestId: c.get("requestId"),
  });
});

// ────────────────── POST /reputation/endorsements ──────────────────

reputationRoutes.post("/endorsements", humanAuth(), async (c) => {
  const db = getDb();
  if (!db)
    return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } }, 503);

  const human = c.get("human");
  const body = endorsementCreateSchema.parse(await c.req.json());

  // Self-endorsement check
  if (body.toHumanId === human.id) {
    return c.json({ ok: false, error: { code: "BAD_REQUEST", message: "Cannot endorse yourself" } }, 400);
  }

  // Check target exists
  const [target] = await db
    .select({ id: humans.id })
    .from(humans)
    .where(eq(humans.id, body.toHumanId))
    .limit(1);

  if (!target) {
    return c.json({ ok: false, error: { code: "NOT_FOUND", message: "Human not found" } }, 404);
  }

  // Check duplicate
  const [existing] = await db
    .select({ id: endorsements.id })
    .from(endorsements)
    .where(
      and(
        eq(endorsements.fromHumanId, human.id),
        eq(endorsements.toHumanId, body.toHumanId),
      ),
    )
    .limit(1);

  if (existing) {
    return c.json({ ok: false, error: { code: "CONFLICT", message: "Already endorsed this human" } }, 409);
  }

  // Rate limit: 5/day
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [dayCount] = await db
    .select({ count: count() })
    .from(endorsements)
    .where(
      and(
        eq(endorsements.fromHumanId, human.id),
        gte(endorsements.createdAt, todayStart),
      ),
    );

  if ((dayCount?.count ?? 0) >= 5) {
    return c.json({
      ok: false,
      error: { code: "RATE_LIMITED", message: "Maximum 5 endorsements per day" },
    }, 429);
  }

  // Create endorsement
  const [endorsement] = await db
    .insert(endorsements)
    .values({
      fromHumanId: human.id,
      toHumanId: body.toHumanId,
      reason: body.reason,
    })
    .returning();

  // Trigger reputation recalculation for endorsed human
  try {
    await updateReputation(
      db,
      body.toHumanId,
      "endorsement",
      endorsement!.id,
      "endorsement",
    );
  } catch {
    // Non-fatal
  }

  return c.json(
    {
      ok: true,
      data: {
        id: endorsement!.id,
        fromHumanId: human.id,
        toHumanId: body.toHumanId,
        reason: body.reason,
        createdAt: endorsement!.createdAt.toISOString(),
      },
      requestId: c.get("requestId"),
    },
    201,
  );
});

export default reputationRoutes;
