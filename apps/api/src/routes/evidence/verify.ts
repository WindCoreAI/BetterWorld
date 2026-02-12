/**
 * Evidence Verification Routes (Sprint 8: Evidence Verification)
 *
 * GET /api/v1/evidence/:evidenceId/status - Verification status
 * POST /api/v1/evidence/:evidenceId/appeal - Appeal rejected evidence
 */

import { evidence, verificationAuditLog } from "@betterworld/db";
import { AppError } from "@betterworld/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../../app.js";
import { getDb, getRedis } from "../../lib/container.js";
import { getSignedUrl } from "../../lib/storage.js";
import { parseUuidParam } from "../../lib/validation.js";
import { humanAuth } from "../../middleware/humanAuth.js";

const verifyRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// GET /api/v1/evidence/:evidenceId/status - Verification status
// ---------------------------------------------------------------------------
verifyRoutes.get("/:evidenceId/status", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const evidenceId = parseUuidParam(c.req.param("evidenceId"), "evidenceId");
  const human = c.get("human");

  const [row] = await db
    .select({
      submittedByHumanId: evidence.submittedByHumanId,
      verificationStage: evidence.verificationStage,
      aiVerificationScore: evidence.aiVerificationScore,
      aiVerificationReasoning: evidence.aiVerificationReasoning,
      peerReviewCount: evidence.peerReviewCount,
      peerReviewsNeeded: evidence.peerReviewsNeeded,
      peerVerdict: evidence.peerVerdict,
      finalVerdict: evidence.finalVerdict,
      finalConfidence: evidence.finalConfidence,
      rewardTransactionId: evidence.rewardTransactionId,
    })
    .from(evidence)
    .where(eq(evidence.id, evidenceId))
    .limit(1);

  if (!row) {
    throw new AppError("NOT_FOUND", "Evidence not found");
  }

  if (row.submittedByHumanId !== human.id) {
    throw new AppError("FORBIDDEN", "Access denied");
  }

  return c.json({
    ok: true,
    data: {
      verificationStage: row.verificationStage,
      aiVerificationScore: row.aiVerificationScore ? Number(row.aiVerificationScore) : null,
      aiVerificationReasoning: row.aiVerificationReasoning,
      peerReviewCount: row.peerReviewCount,
      peerReviewsNeeded: row.peerReviewsNeeded,
      peerVerdict: row.peerVerdict,
      finalVerdict: row.finalVerdict,
      finalConfidence: row.finalConfidence ? Number(row.finalConfidence) : null,
      rewardAmount: null, // Populated by reward distribution
    },
    requestId: c.get("requestId"),
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/evidence/:evidenceId/appeal - Appeal rejected evidence
// ---------------------------------------------------------------------------
const appealSchema = z.object({
  reason: z.string().min(20).max(2000),
});

verifyRoutes.post("/:evidenceId/appeal", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const evidenceId = parseUuidParam(c.req.param("evidenceId"), "evidenceId");
  const human = c.get("human");

  // Rate limit: 3 appeals per day (fail-closed)
  const redis = getRedis();
  if (!redis) {
    throw new AppError("SERVICE_UNAVAILABLE", "Rate limiting unavailable");
  }
  const appealKey = `rate:evidence:appeal:${human.id}`;
  const count = await redis.get(appealKey);
  if (count && parseInt(count, 10) >= 3) {
    throw new AppError("RATE_LIMITED", "Appeal rate limit exceeded (3/day)");
  }

  const body = await c.req.json();
  const parsed = appealSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid appeal", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const [row] = await db
    .select({
      id: evidence.id,
      submittedByHumanId: evidence.submittedByHumanId,
      finalVerdict: evidence.finalVerdict,
      verificationStage: evidence.verificationStage,
    })
    .from(evidence)
    .where(eq(evidence.id, evidenceId))
    .limit(1);

  if (!row) {
    throw new AppError("NOT_FOUND", "Evidence not found");
  }

  if (row.submittedByHumanId !== human.id) {
    throw new AppError("FORBIDDEN", "Only the evidence owner can appeal");
  }

  if (row.finalVerdict !== "rejected") {
    throw new AppError("FORBIDDEN", "Only rejected evidence can be appealed");
  }

  if (row.verificationStage === "appealed" || row.verificationStage === "admin_review") {
    throw new AppError("CONFLICT", "Evidence has already been appealed");
  }

  // Update evidence
  await db
    .update(evidence)
    .set({
      verificationStage: "appealed",
      finalVerdict: null,
      updatedAt: new Date(),
    })
    .where(eq(evidence.id, evidenceId));

  // Create audit log entry
  await db.insert(verificationAuditLog).values({
    evidenceId,
    decisionSource: "human", // Appeal comes from the submitter
    decision: "escalated",
    reasoning: parsed.data.reason,
    decidedByHumanId: human.id,
    metadata: { type: "appeal" },
  });

  // Increment rate limit
  const incrCount = await redis.incr(appealKey);
  if (incrCount === 1) {
    await redis.expire(appealKey, 86400); // 24 hours
  }

  return c.json(
    {
      ok: true,
      data: {
        evidenceId,
        newStage: "appealed" as const,
      },
      requestId: c.get("requestId"),
    },
    201,
  );
});

// ---------------------------------------------------------------------------
// GET /api/v1/evidence/:evidenceId - Get evidence detail
// ---------------------------------------------------------------------------
verifyRoutes.get("/:evidenceId", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const evidenceId = parseUuidParam(c.req.param("evidenceId"), "evidenceId");
  const human = c.get("human");

  const [row] = await db
    .select()
    .from(evidence)
    .where(eq(evidence.id, evidenceId))
    .limit(1);

  if (!row) {
    throw new AppError("NOT_FOUND", "Evidence not found");
  }

  // Owner or admin access check
  if (row.submittedByHumanId !== human.id && human.role !== "admin") {
    throw new AppError("FORBIDDEN", "Access denied");
  }

  // Generate signed URLs
  const contentUrl = row.contentUrl ? await getSignedUrl(row.contentUrl) : null;
  const thumbnailUrl = row.thumbnailUrl ? await getSignedUrl(row.thumbnailUrl) : null;

  return c.json({
    ok: true,
    data: {
      ...row,
      contentUrl,
      thumbnailUrl,
      latitude: row.latitude ? Number(row.latitude) : null,
      longitude: row.longitude ? Number(row.longitude) : null,
      aiVerificationScore: row.aiVerificationScore ? Number(row.aiVerificationScore) : null,
      peerAverageConfidence: row.peerAverageConfidence ? Number(row.peerAverageConfidence) : null,
      finalConfidence: row.finalConfidence ? Number(row.finalConfidence) : null,
    },
    requestId: c.get("requestId"),
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/evidence/pairs/:pairId - Get before/after evidence pair (T056)
// ---------------------------------------------------------------------------
verifyRoutes.get("/pairs/:pairId", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const pairId = parseUuidParam(c.req.param("pairId"), "pairId");
  const human = c.get("human");

  const rows = await db
    .select({
      id: evidence.id,
      missionId: evidence.missionId,
      photoSequenceType: evidence.photoSequenceType,
      contentUrl: evidence.contentUrl,
      thumbnailUrl: evidence.thumbnailUrl,
      latitude: evidence.latitude,
      longitude: evidence.longitude,
      capturedAt: evidence.capturedAt,
      verificationStage: evidence.verificationStage,
      aiVerificationScore: evidence.aiVerificationScore,
      aiVerificationReasoning: evidence.aiVerificationReasoning,
      finalVerdict: evidence.finalVerdict,
      finalConfidence: evidence.finalConfidence,
      submittedByHumanId: evidence.submittedByHumanId,
      createdAt: evidence.createdAt,
    })
    .from(evidence)
    .where(eq(evidence.pairId, pairId));

  if (rows.length === 0) {
    throw new AppError("NOT_FOUND", "Evidence pair not found");
  }

  // IDOR protection
  if (rows.some((r) => r.submittedByHumanId !== human.id) && human.role !== "admin") {
    throw new AppError("FORBIDDEN", "Access denied");
  }

  const beforePhoto = rows.find((r) => r.photoSequenceType === "before");
  const afterPhoto = rows.find((r) => r.photoSequenceType === "after");

  // GPS distance between before and after (meters)
  let gpsDistanceMeters: number | null = null;
  if (
    beforePhoto?.latitude && beforePhoto?.longitude &&
    afterPhoto?.latitude && afterPhoto?.longitude
  ) {
    const lat1 = Number(beforePhoto.latitude);
    const lng1 = Number(beforePhoto.longitude);
    const lat2 = Number(afterPhoto.latitude);
    const lng2 = Number(afterPhoto.longitude);
    // Haversine in meters
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    gpsDistanceMeters = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  // Sign URLs
  const signRow = async (row: typeof rows[0]) => ({
    ...row,
    contentUrl: row.contentUrl ? await getSignedUrl(row.contentUrl) : null,
    thumbnailUrl: row.thumbnailUrl ? await getSignedUrl(row.thumbnailUrl) : null,
    latitude: row.latitude ? Number(row.latitude) : null,
    longitude: row.longitude ? Number(row.longitude) : null,
    aiVerificationScore: row.aiVerificationScore ? Number(row.aiVerificationScore) : null,
    finalConfidence: row.finalConfidence ? Number(row.finalConfidence) : null,
  });

  return c.json({
    ok: true,
    data: {
      pairId,
      before: beforePhoto ? await signRow(beforePhoto) : null,
      after: afterPhoto ? await signRow(afterPhoto) : null,
      gpsDistanceMeters,
      pairComplete: !!(beforePhoto && afterPhoto),
    },
    requestId: c.get("requestId"),
  });
});

export default verifyRoutes;
