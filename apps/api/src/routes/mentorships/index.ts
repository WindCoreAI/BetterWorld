/**
 * Mentorship Routes (Sprint 18: Cooperative Depth & Governance — US1)
 *
 * GET  /mentorships/suggestions — Get mentor suggestions for newcomers
 * POST /mentorships — Create mentorship request
 * POST /mentorships/:id/accept — Accept mentorship request
 * POST /mentorships/:id/decline — Decline mentorship request
 * POST /mentorships/:id/end — End active mentorship
 * POST /mentorships/:id/rate — Rate completed mentorship
 * GET  /mentorships/me — List my mentorships (cursor paginated)
 * GET  /mentorships/:id — Get mentorship detail
 */
import { mentorships, humans, humanProfiles, reputationScores } from "@betterworld/db";
import { createMentorshipSchema, rateMentorshipSchema, AppError } from "@betterworld/shared";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { humanAuth } from "../../middleware/humanAuth.js";
import { MentorshipMatchingService } from "../../services/mentorship-matching.js";
import { NotificationService } from "../../services/notification.service.js";

const mentorshipRoutes = new Hono<AppEnv>();

/** 30 days in milliseconds */
const MENTORSHIP_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

// ── GET /suggestions ──
mentorshipRoutes.get("/suggestions", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const matching = new MentorshipMatchingService(db);

  // Check if already has active mentorship
  const hasActive = await matching.hasActiveMentorship(human.id);
  if (hasActive) {
    return c.json({ ok: false, error: "ALREADY_HAS_MENTOR", message: "You already have an active mentorship" }, 403);
  }

  const suggestions = await matching.getSuggestions(human.id);
  if (suggestions.length === 0) {
    return c.json({ ok: false, error: "NO_SUGGESTIONS", message: "No mentor suggestions available at this time" }, 404);
  }

  return c.json({ ok: true, data: { suggestions }, requestId: c.get("requestId") });
});

// ── POST / — Create mentorship ──
mentorshipRoutes.post("/", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const body = await c.req.json();
  const parsed = createMentorshipSchema.parse(body);

  const matching = new MentorshipMatchingService(db);

  // Validate: mentee doesn't already have active mentorship
  const hasActive = await matching.hasActiveMentorship(human.id);
  if (hasActive) {
    return c.json({ ok: false, error: "ALREADY_HAS_MENTOR", message: "You already have an active mentorship" }, 400);
  }

  // Validate: mentor is eligible
  const isEligible = await matching.isMentorEligible(parsed.mentorHumanId);
  if (!isEligible) {
    return c.json({ ok: false, error: "MENTOR_NOT_ELIGIBLE", message: "Selected mentor is not eligible" }, 400);
  }

  // Validate: mentor not at capacity
  const menteeCount = await matching.getActiveMenteeCount(parsed.mentorHumanId);
  if (menteeCount >= 3) {
    return c.json({ ok: false, error: "MENTOR_AT_CAPACITY", message: "Mentor has reached maximum mentee count" }, 403);
  }

  // Get mentee's primary domain for the mentorship
  const [menteeProfile] = await db
    .select({ primaryDomain: humanProfiles.primaryDomain })
    .from(humanProfiles)
    .where(eq(humanProfiles.humanId, human.id))
    .limit(1);

  const domain = menteeProfile?.primaryDomain ?? "community_building";

  const expiresAt = new Date(Date.now() + MENTORSHIP_DURATION_MS);

  const [created] = await db
    .insert(mentorships)
    .values({
      mentorHumanId: parsed.mentorHumanId,
      menteeHumanId: human.id,
      domain,
      status: "pending",
      menteeAccepted: true, // Mentee initiated, so they accept
      mentorAccepted: false,
      expiresAt,
    })
    .returning();

  if (!created) throw new AppError("INTERNAL_ERROR", "Failed to create mentorship");

  // Notify mentor
  try {
    const notificationService = new NotificationService(db);
    await notificationService.create({
      recipientHumanId: parsed.mentorHumanId,
      type: "mentorship_request",
      message: `${human.displayName} would like you to be their mentor`,
      actorHumanId: human.id,
      referenceId: created.id,
      referenceType: "mentorship",
    });
  } catch {
    // Non-fatal
  }

  return c.json({
    ok: true,
    data: {
      id: created.id,
      mentorHumanId: created.mentorHumanId,
      menteeHumanId: created.menteeHumanId,
      domain: created.domain,
      status: created.status,
      menteeAccepted: created.menteeAccepted,
      mentorAccepted: created.mentorAccepted,
      expiresAt: created.expiresAt.toISOString(),
    },
    requestId: c.get("requestId"),
  }, 201);
});

// ── POST /:id/accept ──
// eslint-disable-next-line complexity
mentorshipRoutes.post("/:id/accept", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const mentorshipId = c.req.param("id");

  const [ms] = await db
    .select()
    .from(mentorships)
    .where(eq(mentorships.id, mentorshipId))
    .limit(1);

  if (!ms) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Mentorship not found" }, 404);
  }

  if (ms.status !== "pending") {
    return c.json({ ok: false, error: "INVALID_STATUS", message: "Mentorship is not in pending status" }, 400);
  }

  // Determine which party is accepting
  const isMentor = ms.mentorHumanId === human.id;
  const isMentee = ms.menteeHumanId === human.id;

  if (!isMentor && !isMentee) {
    return c.json({ ok: false, error: "FORBIDDEN", message: "You are not part of this mentorship" }, 403);
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (isMentor) updates.mentorAccepted = true;
  if (isMentee) updates.menteeAccepted = true;

  // Check if both will be accepted
  const bothAccepted = (isMentor && ms.menteeAccepted) || (isMentee && ms.mentorAccepted);
  if (bothAccepted) {
    updates.status = "active";
  }

  await db
    .update(mentorships)
    .set(updates)
    .where(eq(mentorships.id, mentorshipId));

  // Notify the other party
  try {
    const notificationService = new NotificationService(db);
    const recipientId = isMentor ? ms.menteeHumanId : ms.mentorHumanId;
    await notificationService.create({
      recipientHumanId: recipientId,
      type: "mentorship_accepted",
      message: `${human.displayName} accepted the mentorship`,
      actorHumanId: human.id,
      referenceId: mentorshipId,
      referenceType: "mentorship",
    });
  } catch {
    // Non-fatal
  }

  return c.json({
    ok: true,
    data: {
      id: mentorshipId,
      status: bothAccepted ? "active" : "pending",
      mentorAccepted: isMentor ? true : ms.mentorAccepted,
      menteeAccepted: isMentee ? true : ms.menteeAccepted,
    },
    requestId: c.get("requestId"),
  });
});

// ── POST /:id/decline ──
mentorshipRoutes.post("/:id/decline", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const mentorshipId = c.req.param("id");

  const [ms] = await db
    .select()
    .from(mentorships)
    .where(eq(mentorships.id, mentorshipId))
    .limit(1);

  if (!ms) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Mentorship not found" }, 404);
  }

  if (ms.mentorHumanId !== human.id && ms.menteeHumanId !== human.id) {
    return c.json({ ok: false, error: "FORBIDDEN", message: "You are not part of this mentorship" }, 403);
  }

  if (ms.status !== "pending") {
    return c.json({ ok: false, error: "INVALID_STATUS", message: "Can only decline pending mentorships" }, 400);
  }

  await db
    .update(mentorships)
    .set({ status: "terminated", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(mentorships.id, mentorshipId));

  return c.json({
    ok: true,
    data: { id: mentorshipId, status: "terminated" },
    requestId: c.get("requestId"),
  });
});

// ── POST /:id/end ──
mentorshipRoutes.post("/:id/end", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const mentorshipId = c.req.param("id");

  const [ms] = await db
    .select()
    .from(mentorships)
    .where(eq(mentorships.id, mentorshipId))
    .limit(1);

  if (!ms) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Mentorship not found" }, 404);
  }

  if (ms.mentorHumanId !== human.id && ms.menteeHumanId !== human.id) {
    return c.json({ ok: false, error: "FORBIDDEN", message: "You are not part of this mentorship" }, 403);
  }

  if (ms.status !== "active") {
    return c.json({ ok: false, error: "INVALID_STATUS", message: "Can only end active mentorships" }, 400);
  }

  const completedAt = new Date();

  await db
    .update(mentorships)
    .set({ status: "terminated", completedAt, updatedAt: new Date() })
    .where(eq(mentorships.id, mentorshipId));

  return c.json({
    ok: true,
    data: {
      id: mentorshipId,
      status: "terminated",
      completedAt: completedAt.toISOString(),
    },
    requestId: c.get("requestId"),
  });
});

// ── POST /:id/rate ──
mentorshipRoutes.post("/:id/rate", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const mentorshipId = c.req.param("id");
  const body = await c.req.json();
  const parsed = rateMentorshipSchema.parse(body);

  const [ms] = await db
    .select()
    .from(mentorships)
    .where(eq(mentorships.id, mentorshipId))
    .limit(1);

  if (!ms) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Mentorship not found" }, 404);
  }

  if (ms.mentorHumanId !== human.id && ms.menteeHumanId !== human.id) {
    return c.json({ ok: false, error: "FORBIDDEN", message: "You are not part of this mentorship" }, 403);
  }

  if (ms.status !== "completed" && ms.status !== "terminated") {
    return c.json({ ok: false, error: "INVALID_STATUS", message: "Can only rate completed/terminated mentorships" }, 400);
  }

  const isMentor = ms.mentorHumanId === human.id;

  // Check if already rated
  if (isMentor && ms.mentorRating !== null) {
    return c.json({ ok: false, error: "ALREADY_RATED", message: "You have already rated this mentorship" }, 400);
  }
  if (!isMentor && ms.menteeRating !== null) {
    return c.json({ ok: false, error: "ALREADY_RATED", message: "You have already rated this mentorship" }, 400);
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (isMentor) {
    updates.mentorRating = parsed.rating;
  } else {
    updates.menteeRating = parsed.rating;
  }

  await db
    .update(mentorships)
    .set(updates)
    .where(eq(mentorships.id, mentorshipId));

  return c.json({
    ok: true,
    data: {
      id: mentorshipId,
      mentorRating: isMentor ? parsed.rating : ms.mentorRating,
      menteeRating: !isMentor ? parsed.rating : ms.menteeRating,
    },
    requestId: c.get("requestId"),
  });
});

// ── GET /me — List mentorships ──
mentorshipRoutes.get("/me", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const status = c.req.query("status") as string | undefined;
  const role = c.req.query("role") as string | undefined;
  const cursor = c.req.query("cursor");
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "20", 10), 1), 100);

  const conditions = [
    or(
      eq(mentorships.mentorHumanId, human.id),
      eq(mentorships.menteeHumanId, human.id),
    ),
  ];

  if (status && ["active", "pending", "completed", "terminated"].includes(status)) {
    conditions.push(eq(mentorships.status, status as "active" | "pending" | "completed" | "terminated"));
  }

  if (role === "mentor") {
    conditions.push(eq(mentorships.mentorHumanId, human.id));
  } else if (role === "mentee") {
    conditions.push(eq(mentorships.menteeHumanId, human.id));
  }

  if (cursor) {
    const [cursorTime, cursorId] = cursor.split("::");
    if (cursorTime && cursorId) {
      conditions.push(
        sql`(${mentorships.createdAt}, ${mentorships.id}) < (${cursorTime}, ${cursorId})`,
      );
    }
  }

  const rows = await db
    .select({
      id: mentorships.id,
      mentorHumanId: mentorships.mentorHumanId,
      menteeHumanId: mentorships.menteeHumanId,
      domain: mentorships.domain,
      status: mentorships.status,
      missionsGuided: mentorships.missionsGuided,
      tokensEarnedByMentor: mentorships.tokensEarnedByMentor,
      expiresAt: mentorships.expiresAt,
      createdAt: mentorships.createdAt,
    })
    .from(mentorships)
    .where(and(...conditions))
    .orderBy(desc(mentorships.createdAt), desc(mentorships.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const lastItem = items[items.length - 1];
  const nextCursor = hasMore && lastItem
    ? `${lastItem.createdAt.toISOString()}::${lastItem.id}`
    : null;

  // Batch-fetch display names for mentors and mentees
  const humanIds = new Set<string>();
  for (const item of items) {
    humanIds.add(item.mentorHumanId);
    humanIds.add(item.menteeHumanId);
  }
  const humanNames = new Map<string, string>();
  if (humanIds.size > 0) {
    const humanRows = await db
      .select({ id: humans.id, displayName: humans.displayName })
      .from(humans)
      .where(inArray(humans.id, [...humanIds]));
    for (const h of humanRows) {
      humanNames.set(h.id, h.displayName);
    }
  }

  return c.json({
    ok: true,
    data: {
      mentorships: items.map((m) => ({
        id: m.id,
        mentorHumanId: m.mentorHumanId,
        mentorDisplayName: humanNames.get(m.mentorHumanId) ?? "Unknown",
        menteeHumanId: m.menteeHumanId,
        menteeDisplayName: humanNames.get(m.menteeHumanId) ?? "Unknown",
        domain: m.domain,
        status: m.status,
        missionsGuided: m.missionsGuided,
        tokensEarnedByMentor: m.tokensEarnedByMentor,
        expiresAt: m.expiresAt.toISOString(),
        createdAt: m.createdAt.toISOString(),
      })),
      nextCursor,
    },
    requestId: c.get("requestId"),
  });
});

// ── GET /:id — Detail ──
mentorshipRoutes.get("/:id", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const mentorshipId = c.req.param("id");

  const [ms] = await db
    .select()
    .from(mentorships)
    .where(eq(mentorships.id, mentorshipId))
    .limit(1);

  if (!ms) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Mentorship not found" }, 404);
  }

  if (ms.mentorHumanId !== human.id && ms.menteeHumanId !== human.id) {
    return c.json({ ok: false, error: "FORBIDDEN", message: "You are not part of this mentorship" }, 403);
  }

  // Get display names and tiers
  const [mentorInfo] = await db
    .select({
      displayName: humans.displayName,
      currentTier: reputationScores.currentTier,
    })
    .from(humans)
    .leftJoin(reputationScores, eq(humans.id, reputationScores.humanId))
    .where(eq(humans.id, ms.mentorHumanId))
    .limit(1);

  const [menteeInfo] = await db
    .select({
      displayName: humans.displayName,
      currentTier: reputationScores.currentTier,
    })
    .from(humans)
    .leftJoin(reputationScores, eq(humans.id, reputationScores.humanId))
    .where(eq(humans.id, ms.menteeHumanId))
    .limit(1);

  return c.json({
    ok: true,
    data: {
      id: ms.id,
      mentorHumanId: ms.mentorHumanId,
      mentorDisplayName: mentorInfo?.displayName ?? "Unknown",
      mentorTier: mentorInfo?.currentTier ?? "newcomer",
      menteeHumanId: ms.menteeHumanId,
      menteeDisplayName: menteeInfo?.displayName ?? "Unknown",
      menteeTier: menteeInfo?.currentTier ?? "newcomer",
      domain: ms.domain,
      status: ms.status,
      missionsGuided: ms.missionsGuided,
      tokensEarnedByMentor: ms.tokensEarnedByMentor,
      mentorRating: ms.mentorRating,
      menteeRating: ms.menteeRating,
      expiresAt: ms.expiresAt.toISOString(),
      createdAt: ms.createdAt.toISOString(),
      completedAt: ms.completedAt?.toISOString() ?? null,
    },
    requestId: c.get("requestId"),
  });
});

export default mentorshipRoutes;
