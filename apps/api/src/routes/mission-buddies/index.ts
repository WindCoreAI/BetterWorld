/**
 * Mission Buddies & Help Offer Routes (Sprint 18: Cooperative Depth & Governance — US2 & US4)
 *
 * Buddy invitation: POST /missions/:missionId/claims/:claimId/buddy
 * Buddy accept/decline: POST /missions/:missionId/claims/:claimId/buddy/accept|decline
 * Help offers: POST /claims/:claimId/help-offers, accept, decline, mark-contributing
 * Help request toggle: PATCH /claims/:claimId/help-request
 * Browse help requests: GET /missions/help-requests
 */
import { missionClaims, missionHelpOffers, connections, humans } from "@betterworld/db";
import { inviteBuddySchema, helpOfferSchema, AppError } from "@betterworld/shared";
import { and, eq, sql, desc } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { humanAuth } from "../../middleware/humanAuth.js";
import { NotificationService } from "../../services/notification.service.js";

const missionBuddyRoutes = new Hono<AppEnv>();

// ── POST /missions/:missionId/claims/:claimId/buddy — Invite buddy ──
missionBuddyRoutes.post("/missions/:missionId/claims/:claimId/buddy", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const claimId = c.req.param("claimId");
  const body = await c.req.json();
  const parsed = inviteBuddySchema.parse(body);

  // Verify claim ownership
  const [claim] = await db
    .select()
    .from(missionClaims)
    .where(and(eq(missionClaims.id, claimId), eq(missionClaims.humanId, human.id)))
    .limit(1);

  if (!claim) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Claim not found or not yours" }, 404);
  }

  if (claim.buddyHumanId) {
    return c.json({ ok: false, error: "ALREADY_HAS_BUDDY", message: "This claim already has a buddy" }, 400);
  }

  // Verify mutual connection
  const [conn] = await db
    .select()
    .from(connections)
    .where(
      and(
        sql`(
          (${connections.requesterHumanId} = ${human.id} AND ${connections.recipientHumanId} = ${parsed.buddyHumanId})
          OR
          (${connections.requesterHumanId} = ${parsed.buddyHumanId} AND ${connections.recipientHumanId} = ${human.id})
        )`,
        eq(connections.status, "accepted"),
      ),
    )
    .limit(1);

  if (!conn) {
    return c.json({ ok: false, error: "NOT_CONNECTED", message: "You must be connected to invite a buddy" }, 400);
  }

  // Set buddy
  await db
    .update(missionClaims)
    .set({
      buddyHumanId: parsed.buddyHumanId,
      buddyStatus: "pending",
      updatedAt: new Date(),
    })
    .where(eq(missionClaims.id, claimId));

  // Notify buddy
  try {
    const notificationService = new NotificationService(db);
    await notificationService.create({
      recipientHumanId: parsed.buddyHumanId,
      type: "buddy_invitation",
      message: `${human.displayName} invited you to co-complete a mission`,
      actorHumanId: human.id,
      referenceId: claimId,
      referenceType: "mission_claim",
    });
  } catch { /* non-fatal */ }

  return c.json({ ok: true, data: { claimId, buddyHumanId: parsed.buddyHumanId, buddyStatus: "pending" }, requestId: c.get("requestId") }, 201);
});

// ── POST /missions/:missionId/claims/:claimId/buddy/accept ──
missionBuddyRoutes.post("/missions/:missionId/claims/:claimId/buddy/accept", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const claimId = c.req.param("claimId");

  const [claim] = await db
    .select()
    .from(missionClaims)
    .where(and(eq(missionClaims.id, claimId), eq(missionClaims.buddyHumanId, human.id)))
    .limit(1);

  if (!claim) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Buddy invitation not found" }, 404);
  }

  if (claim.buddyStatus !== "pending") {
    return c.json({ ok: false, error: "INVALID_STATUS", message: "Invitation is not pending" }, 400);
  }

  await db
    .update(missionClaims)
    .set({ buddyStatus: "accepted", isBuddy: true, updatedAt: new Date() })
    .where(eq(missionClaims.id, claimId));

  // Notify claimer
  try {
    const notificationService = new NotificationService(db);
    await notificationService.create({
      recipientHumanId: claim.humanId,
      type: "buddy_accepted",
      message: `${human.displayName} accepted your buddy invitation`,
      actorHumanId: human.id,
      referenceId: claimId,
      referenceType: "mission_claim",
    });
  } catch { /* non-fatal */ }

  return c.json({ ok: true, data: { claimId, buddyStatus: "accepted" }, requestId: c.get("requestId") });
});

// ── POST /missions/:missionId/claims/:claimId/buddy/decline ──
missionBuddyRoutes.post("/missions/:missionId/claims/:claimId/buddy/decline", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const claimId = c.req.param("claimId");

  const [claim] = await db
    .select()
    .from(missionClaims)
    .where(and(eq(missionClaims.id, claimId), eq(missionClaims.buddyHumanId, human.id)))
    .limit(1);

  if (!claim) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Buddy invitation not found" }, 404);
  }

  await db
    .update(missionClaims)
    .set({ buddyStatus: "declined", buddyHumanId: null, updatedAt: new Date() })
    .where(eq(missionClaims.id, claimId));

  // Notify claimer
  try {
    const notificationService = new NotificationService(db);
    await notificationService.create({
      recipientHumanId: claim.humanId,
      type: "buddy_declined",
      message: `${human.displayName} declined your buddy invitation`,
      actorHumanId: human.id,
      referenceId: claimId,
      referenceType: "mission_claim",
    });
  } catch { /* non-fatal */ }

  return c.json({ ok: true, data: { claimId, buddyStatus: "declined" }, requestId: c.get("requestId") });
});

// ── POST /claims/:claimId/help-offers — Offer help on a mission ──
missionBuddyRoutes.post("/claims/:claimId/help-offers", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const claimId = c.req.param("claimId");
  const body = await c.req.json();
  const parsed = helpOfferSchema.parse(body);

  // Verify claim exists and is active
  const [claim] = await db
    .select()
    .from(missionClaims)
    .where(eq(missionClaims.id, claimId))
    .limit(1);

  if (!claim) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Claim not found" }, 404);
  }

  if (claim.humanId === human.id) {
    return c.json({ ok: false, error: "CANNOT_HELP_SELF", message: "Cannot offer help on your own claim" }, 400);
  }

  // Create help offer
  const [created] = await db
    .insert(missionHelpOffers)
    .values({
      missionClaimId: claimId,
      helperHumanId: human.id,
      message: parsed.message,
      guardrailStatus: "pending",
    })
    .returning();

  if (!created) throw new AppError("INTERNAL_ERROR", "Failed to create help offer");

  // Notify claimer
  try {
    const notificationService = new NotificationService(db);
    await notificationService.create({
      recipientHumanId: claim.humanId,
      type: "help_offer_received",
      message: `${human.displayName} offered to help with your mission`,
      actorHumanId: human.id,
      referenceId: created.id,
      referenceType: "help_offer",
    });
  } catch { /* non-fatal */ }

  return c.json({ ok: true, data: { id: created.id, status: "pending" }, requestId: c.get("requestId") }, 201);
});

// ── POST /help-offers/:offerId/accept ──
missionBuddyRoutes.post("/help-offers/:offerId/accept", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const offerId = c.req.param("offerId");

  const [offer] = await db
    .select({
      id: missionHelpOffers.id,
      claimId: missionHelpOffers.missionClaimId,
      helperHumanId: missionHelpOffers.helperHumanId,
      status: missionHelpOffers.status,
    })
    .from(missionHelpOffers)
    .where(eq(missionHelpOffers.id, offerId))
    .limit(1);

  if (!offer) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Help offer not found" }, 404);
  }

  // Verify caller owns the claim
  const [claim] = await db
    .select({ humanId: missionClaims.humanId })
    .from(missionClaims)
    .where(eq(missionClaims.id, offer.claimId))
    .limit(1);

  if (!claim || claim.humanId !== human.id) {
    return c.json({ ok: false, error: "FORBIDDEN", message: "Only the claimer can accept help offers" }, 403);
  }

  await db
    .update(missionHelpOffers)
    .set({ status: "accepted", updatedAt: new Date() })
    .where(eq(missionHelpOffers.id, offerId));

  // Notify helper
  try {
    const notificationService = new NotificationService(db);
    await notificationService.create({
      recipientHumanId: offer.helperHumanId,
      type: "help_offer_accepted",
      message: `${human.displayName} accepted your help offer`,
      actorHumanId: human.id,
      referenceId: offerId,
      referenceType: "help_offer",
    });
  } catch { /* non-fatal */ }

  return c.json({ ok: true, data: { id: offerId, status: "accepted" }, requestId: c.get("requestId") });
});

// ── POST /help-offers/:offerId/decline ──
missionBuddyRoutes.post("/help-offers/:offerId/decline", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const offerId = c.req.param("offerId");

  const [offer] = await db
    .select({ id: missionHelpOffers.id, claimId: missionHelpOffers.missionClaimId, helperHumanId: missionHelpOffers.helperHumanId })
    .from(missionHelpOffers)
    .where(eq(missionHelpOffers.id, offerId))
    .limit(1);

  if (!offer) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Help offer not found" }, 404);
  }

  const [claim] = await db
    .select({ humanId: missionClaims.humanId })
    .from(missionClaims)
    .where(eq(missionClaims.id, offer.claimId))
    .limit(1);

  if (!claim || claim.humanId !== human.id) {
    return c.json({ ok: false, error: "FORBIDDEN", message: "Only the claimer can decline help offers" }, 403);
  }

  await db
    .update(missionHelpOffers)
    .set({ status: "declined", updatedAt: new Date() })
    .where(eq(missionHelpOffers.id, offerId));

  try {
    const notificationService = new NotificationService(db);
    await notificationService.create({
      recipientHumanId: offer.helperHumanId,
      type: "help_offer_declined",
      message: `Your help offer was declined`,
      actorHumanId: human.id,
      referenceId: offerId,
      referenceType: "help_offer",
    });
  } catch { /* non-fatal */ }

  return c.json({ ok: true, data: { id: offerId, status: "declined" }, requestId: c.get("requestId") });
});

// ── GET /claims/:claimId/help-offers ──
missionBuddyRoutes.get("/claims/:claimId/help-offers", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const claimId = c.req.param("claimId");

  const offers = await db
    .select({
      id: missionHelpOffers.id,
      helperHumanId: missionHelpOffers.helperHumanId,
      helperDisplayName: humans.displayName,
      message: missionHelpOffers.message,
      status: missionHelpOffers.status,
      isContributing: missionHelpOffers.isContributing,
      createdAt: missionHelpOffers.createdAt,
    })
    .from(missionHelpOffers)
    .innerJoin(humans, eq(missionHelpOffers.helperHumanId, humans.id))
    .where(eq(missionHelpOffers.missionClaimId, claimId))
    .orderBy(desc(missionHelpOffers.createdAt));

  return c.json({ ok: true, data: { offers }, requestId: c.get("requestId") });
});

// ── PATCH /claims/:claimId/help-request — Toggle help request ──
missionBuddyRoutes.patch("/claims/:claimId/help-request", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const claimId = c.req.param("claimId");
  const body = await c.req.json();

  const [claim] = await db
    .select()
    .from(missionClaims)
    .where(and(eq(missionClaims.id, claimId), eq(missionClaims.humanId, human.id)))
    .limit(1);

  if (!claim) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Claim not found or not yours" }, 404);
  }

  const helpRequested = body.helpRequested ?? !claim.helpRequested;
  const helpRequestNote = body.helpRequestNote ?? claim.helpRequestNote;

  await db
    .update(missionClaims)
    .set({ helpRequested, helpRequestNote, updatedAt: new Date() })
    .where(eq(missionClaims.id, claimId));

  return c.json({
    ok: true,
    data: { claimId, helpRequested, helpRequestNote },
    requestId: c.get("requestId"),
  });
});

export default missionBuddyRoutes;
