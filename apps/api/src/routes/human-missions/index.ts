/**
 * Human Mission Proposal Routes (Sprint 18: Cooperative Depth & Governance — US5)
 *
 * POST /missions/propose — Propose a human mission (advocate+ only)
 * POST /missions/:id/endorse — Endorse a proposed mission (activates at 3)
 * GET  /missions/proposed — List proposed missions
 */
import { missions, missionEndorsements, reputationScores } from "@betterworld/db";
import { humanMissionProposalSchema, AppError } from "@betterworld/shared";
import { and, eq, desc } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { humanAuth } from "../../middleware/humanAuth.js";
import { NotificationService } from "../../services/notification.service.js";

const humanMissionRoutes = new Hono<AppEnv>();

const ADVOCATE_PLUS_TIERS = ["advocate", "leader", "champion"];
const ENDORSEMENTS_TO_ACTIVATE = 3;

// ── POST /missions/propose — Propose a human mission ──
humanMissionRoutes.post("/missions/propose", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const body = await c.req.json();
  const parsed = humanMissionProposalSchema.parse(body);

  // Check advocate+ tier
  const [rep] = await db
    .select({ currentTier: reputationScores.currentTier })
    .from(reputationScores)
    .where(eq(reputationScores.humanId, human.id))
    .limit(1);

  const tier = rep?.currentTier ?? "newcomer";
  if (!ADVOCATE_PLUS_TIERS.includes(tier)) {
    return c.json({ ok: false, error: "INSUFFICIENT_TIER", message: "Advocate+ tier required to propose missions" }, 403);
  }

  // Create mission with pending_endorsement status
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30-day default expiry
  const [created] = await db
    .insert(missions)
    .values({
      title: parsed.title,
      description: parsed.description,
      domain: parsed.domain as never,
      difficulty: (parsed.difficulty ?? "intermediate") as never,
      estimatedDurationMinutes: parseInt(parsed.estimatedDuration ?? "60", 10) || 60,
      tokenReward: 5,
      proposedByHumanId: human.id,
      status: "pending_endorsement" as never,
      guardrailStatus: "pending",
      expiresAt,
    })
    .returning();

  if (!created) throw new AppError("INTERNAL_ERROR", "Failed to create mission");

  return c.json({
    ok: true,
    data: { id: created.id, status: "pending_endorsement", endorsementCount: 0 },
    requestId: c.get("requestId"),
  }, 201);
});

// ── POST /missions/:id/endorse — Endorse a proposed mission ──
humanMissionRoutes.post("/missions/:id/endorse", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const missionId = c.req.param("id");

  // Verify mission exists and is pending endorsement
  const [mission] = await db
    .select({
      id: missions.id,
      status: missions.status,
      proposedByHumanId: missions.proposedByHumanId,
      endorsementCount: missions.endorsementCount,
    })
    .from(missions)
    .where(eq(missions.id, missionId))
    .limit(1);

  if (!mission) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Mission not found" }, 404);
  }

  if (mission.status !== "pending_endorsement") {
    return c.json({ ok: false, error: "INVALID_STATUS", message: "Mission is not pending endorsement" }, 400);
  }

  // Cannot endorse own mission
  if (mission.proposedByHumanId === human.id) {
    return c.json({ ok: false, error: "CANNOT_ENDORSE_OWN", message: "Cannot endorse your own mission" }, 400);
  }

  // Check for duplicate endorsement
  const [existing] = await db
    .select({ id: missionEndorsements.id })
    .from(missionEndorsements)
    .where(
      and(
        eq(missionEndorsements.missionId, missionId),
        eq(missionEndorsements.humanId, human.id),
      ),
    )
    .limit(1);

  if (existing) {
    return c.json({ ok: false, error: "ALREADY_ENDORSED", message: "You already endorsed this mission" }, 400);
  }

  // Create endorsement
  await db.insert(missionEndorsements).values({
    missionId,
    humanId: human.id,
  });

  // Update endorsement count
  const newCount = (mission.endorsementCount ?? 0) + 1;
  const updateData: Record<string, unknown> = {
    endorsementCount: newCount,
    updatedAt: new Date(),
  };

  // Activate at 3 endorsements
  if (newCount >= ENDORSEMENTS_TO_ACTIVATE) {
    updateData.status = "active";
  }

  await db
    .update(missions)
    .set(updateData)
    .where(eq(missions.id, missionId));

  // Notify proposer
  try {
    if (mission.proposedByHumanId) {
      const notificationService = new NotificationService(db);
      await notificationService.create({
        recipientHumanId: mission.proposedByHumanId,
        type: "mission_endorsed",
        message: `${human.displayName} endorsed your proposed mission${newCount >= ENDORSEMENTS_TO_ACTIVATE ? " — it's now active!" : ` (${newCount}/${ENDORSEMENTS_TO_ACTIVATE})`}`,
        actorHumanId: human.id,
        referenceId: missionId,
        referenceType: "mission",
      });
    }
  } catch { /* non-fatal */ }

  return c.json({
    ok: true,
    data: {
      missionId,
      endorsementCount: newCount,
      activated: newCount >= ENDORSEMENTS_TO_ACTIVATE,
    },
    requestId: c.get("requestId"),
  });
});

// ── GET /missions/proposed — List proposed missions ──
humanMissionRoutes.get("/missions/proposed", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const limit = Math.min(parseInt(c.req.query("limit") ?? "20"), 50);
  const _cursor = c.req.query("cursor");

  const query = db
    .select({
      id: missions.id,
      title: missions.title,
      description: missions.description,
      domain: missions.domain,
      difficulty: missions.difficulty,
      status: missions.status,
      endorsementCount: missions.endorsementCount,
      proposedByHumanId: missions.proposedByHumanId,
      createdAt: missions.createdAt,
    })
    .from(missions)
    .where(eq(missions.status, "pending_endorsement"))
    .orderBy(desc(missions.createdAt))
    .limit(limit + 1);

  const rows = await query;
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return c.json({
    ok: true,
    data: {
      items,
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.id : null,
    },
    requestId: c.get("requestId"),
  });
});

export default humanMissionRoutes;
