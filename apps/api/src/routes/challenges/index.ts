/**
 * Challenge Routes (Sprint 18: Cooperative Depth & Governance — US8)
 *
 * GET  /challenges — List active challenges (public)
 * GET  /challenges/:id — Challenge detail with live leaderboard
 * POST /challenges/:id/join — Join a challenge
 * GET  /challenges/:id/my-progress — Get personal progress
 * POST /admin/challenges — Create challenge (admin only)
 */
import { groupChallenges, challengeParticipants, humanProfiles } from "@betterworld/db";
import { createChallengeSchema, AppError } from "@betterworld/shared";
import { and, eq, desc } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { humanAuth } from "../../middleware/humanAuth.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";
import { ChallengeScoringService } from "../../services/challenge-scoring.js";

const challengeRoutes = new Hono<AppEnv>();

// ── GET /challenges — List active challenges ──
challengeRoutes.get("/challenges", async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const items = await db
    .select({
      id: groupChallenges.id,
      challengeType: groupChallenges.challengeType,
      title: groupChallenges.title,
      description: groupChallenges.description,
      groups: groupChallenges.groups,
      metric: groupChallenges.metric,
      targetValue: groupChallenges.targetValue,
      startDate: groupChallenges.startDate,
      endDate: groupChallenges.endDate,
      status: groupChallenges.status,
    })
    .from(groupChallenges)
    .where(eq(groupChallenges.status, "active"))
    .orderBy(desc(groupChallenges.startDate))
    .limit(20);

  return c.json({ ok: true, data: { items }, requestId: c.get("requestId") });
});

// ── GET /challenges/:id — Challenge detail with leaderboard ──
challengeRoutes.get("/challenges/:id", async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const id = c.req.param("id");

  const [challenge] = await db
    .select()
    .from(groupChallenges)
    .where(eq(groupChallenges.id, id))
    .limit(1);

  if (!challenge) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Challenge not found" }, 404);
  }

  const scoringService = new ChallengeScoringService(db);
  const leaderboard = await scoringService.getLeaderboard(id);

  return c.json({
    ok: true,
    data: { challenge, leaderboard },
    requestId: c.get("requestId"),
  });
});

// ── POST /challenges/:id/join — Join a challenge ──
challengeRoutes.post("/challenges/:id/join", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const challengeId = c.req.param("id");

  // Verify challenge exists and is active
  const [challenge] = await db
    .select({ id: groupChallenges.id, status: groupChallenges.status, groups: groupChallenges.groups })
    .from(groupChallenges)
    .where(eq(groupChallenges.id, challengeId))
    .limit(1);

  if (!challenge) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Challenge not found" }, 404);
  }

  if (challenge.status !== "active" && challenge.status !== "upcoming") {
    return c.json({ ok: false, error: "INVALID_STATUS", message: "Challenge not accepting participants" }, 400);
  }

  // Check if already joined
  const [existing] = await db
    .select({ id: challengeParticipants.id })
    .from(challengeParticipants)
    .where(
      and(
        eq(challengeParticipants.challengeId, challengeId),
        eq(challengeParticipants.humanId, human.id),
      ),
    )
    .limit(1);

  if (existing) {
    return c.json({ ok: false, error: "ALREADY_JOINED", message: "Already joined this challenge" }, 400);
  }

  // Get user's city for group assignment
  const [profile] = await db
    .select({ city: humanProfiles.city })
    .from(humanProfiles)
    .where(eq(humanProfiles.humanId, human.id))
    .limit(1);

  const groupValue = profile?.city ?? "global";

  await db.insert(challengeParticipants).values({
    challengeId,
    humanId: human.id,
    groupType: "city",
    groupValue,
    score: "0",
  });

  return c.json({
    ok: true,
    data: { challengeId, groupValue, score: 0 },
    requestId: c.get("requestId"),
  }, 201);
});

// ── GET /challenges/:id/my-progress ──
challengeRoutes.get("/challenges/:id/my-progress", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const challengeId = c.req.param("id");

  const [participant] = await db
    .select({
      score: challengeParticipants.score,
      groupType: challengeParticipants.groupType,
      groupValue: challengeParticipants.groupValue,
      joinedAt: challengeParticipants.joinedAt,
    })
    .from(challengeParticipants)
    .where(
      and(
        eq(challengeParticipants.challengeId, challengeId),
        eq(challengeParticipants.humanId, human.id),
      ),
    )
    .limit(1);

  if (!participant) {
    return c.json({ ok: false, error: "NOT_JOINED", message: "Not joined this challenge" }, 404);
  }

  return c.json({ ok: true, data: participant, requestId: c.get("requestId") });
});

// ── POST /admin/challenges — Create challenge ──
challengeRoutes.post("/admin/challenges", humanAuth(), requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const body = await c.req.json();
  const parsed = createChallengeSchema.parse(body);

  const [created] = await db
    .insert(groupChallenges)
    .values({
      challengeType: parsed.challengeType,
      title: parsed.title,
      description: parsed.description ?? null,
      groups: parsed.groups,
      metric: parsed.metric,
      targetValue: parsed.targetValue ?? null,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      status: "upcoming",
      createdByHumanId: human.id,
    })
    .returning();

  if (!created) throw new AppError("INTERNAL_ERROR", "Failed to create challenge");

  return c.json({
    ok: true,
    data: { id: created.id, status: "upcoming" },
    requestId: c.get("requestId"),
  }, 201);
});

export default challengeRoutes;
