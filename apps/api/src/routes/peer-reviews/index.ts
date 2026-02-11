/**
 * Peer Review Routes (Sprint 8: Evidence Verification)
 *
 * GET /api/v1/peer-reviews/pending - List pending reviews
 * POST /api/v1/peer-reviews/:evidenceId/vote - Submit vote
 * GET /api/v1/peer-reviews/history - List past votes
 */

import {
  evidence,
  peerReviews,
  missions,
  reviewHistory,
  verificationAuditLog,
} from "@betterworld/db";
import { AppError } from "@betterworld/shared";
import { and, eq, desc, lt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../../app.js";
import { getDb, getRedis } from "../../lib/container.js";
import { haversineDistance } from "../../lib/evidence-helpers.js";
import { distributeEvidenceReward, distributePeerReviewReward } from "../../lib/reward-helpers.js";
import { parseUuidParam } from "../../lib/validation.js";
import { humanAuth } from "../../middleware/humanAuth.js";
import { broadcast } from "../../ws/feed.js";

const peerReviewRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// GET /api/v1/peer-reviews/pending - List pending reviews
// ---------------------------------------------------------------------------
const pendingQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

peerReviewRoutes.get("/pending", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const query = c.req.query();
  const parsed = pendingQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid query parameters");
  }

  const { limit, cursor } = parsed.data;

  // Find evidence in peer_review stage that this human hasn't voted on yet
  // and where the human is NOT the submitter
  const conditions = [
    eq(evidence.verificationStage, "peer_review"),
  ];

  if (cursor) {
    const [cursorEvidence] = await db
      .select({ createdAt: evidence.createdAt })
      .from(evidence)
      .where(eq(evidence.id, cursor))
      .limit(1);
    if (cursorEvidence) {
      conditions.push(lt(evidence.createdAt, cursorEvidence.createdAt));
    }
  }

  const rows = await db
    .select({
      evidenceId: evidence.id,
      evidenceType: evidence.evidenceType,
      contentUrl: evidence.contentUrl,
      thumbnailUrl: evidence.thumbnailUrl,
      evidenceLatitude: evidence.latitude,
      evidenceLongitude: evidence.longitude,
      submittedByHumanId: evidence.submittedByHumanId,
      submittedAt: evidence.createdAt,
      missionId: evidence.missionId,
      missionTitle: missions.title,
      missionDescription: missions.description,
      missionLatitude: missions.requiredLatitude,
      missionLongitude: missions.requiredLongitude,
    })
    .from(evidence)
    .innerJoin(missions, eq(evidence.missionId, missions.id))
    .where(and(...conditions))
    .orderBy(desc(evidence.createdAt))
    .limit(limit + 1);

  // Filter: exclude own submissions and already-voted ones
  const filteredRows = [];
  for (const row of rows) {
    if (row.submittedByHumanId === human.id) continue;

    // Check if already voted
    const [existingVote] = await db
      .select({ id: peerReviews.id })
      .from(peerReviews)
      .where(
        and(
          eq(peerReviews.evidenceId, row.evidenceId),
          eq(peerReviews.reviewerHumanId, human.id),
        ),
      )
      .limit(1);

    if (!existingVote) {
      filteredRows.push(row);
    }

    if (filteredRows.length > limit) break;
  }

  const hasMore = filteredRows.length > limit;
  const items = hasMore ? filteredRows.slice(0, limit) : filteredRows;

  const reviews = items.map((row) => {
    const eLat = row.evidenceLatitude ? Number(row.evidenceLatitude) : null;
    const eLng = row.evidenceLongitude ? Number(row.evidenceLongitude) : null;
    const mLat = row.missionLatitude ? Number(row.missionLatitude) : null;
    const mLng = row.missionLongitude ? Number(row.missionLongitude) : null;

    let gpsDistanceMeters: number | null = null;
    if (eLat !== null && eLng !== null && mLat !== null && mLng !== null) {
      gpsDistanceMeters = Math.round(haversineDistance(eLat, eLng, mLat, mLng));
    }

    return {
      evidenceId: row.evidenceId,
      missionTitle: row.missionTitle,
      missionDescription: row.missionDescription.length > 300
        ? row.missionDescription.slice(0, 300) + "..."
        : row.missionDescription,
      evidenceType: row.evidenceType,
      contentUrl: row.contentUrl,
      thumbnailUrl: row.thumbnailUrl,
      missionLatitude: mLat,
      missionLongitude: mLng,
      evidenceLatitude: eLat,
      evidenceLongitude: eLng,
      gpsDistanceMeters,
      submittedAt: row.submittedAt,
    };
  });

  const lastItem = items[items.length - 1];

  return c.json({
    ok: true,
    data: {
      reviews,
      nextCursor: hasMore && lastItem ? lastItem.evidenceId : null,
    },
    meta: {
      hasMore,
      count: reviews.length,
    },
    requestId: c.get("requestId"),
  });
});


// --- Helper: Compute and apply final verdict ---

interface EvidenceRowForVerdict {
  missionId: string;
  submittedByHumanId: string;
  peerReviewsNeeded: number;
  aiVerificationScore: string | null;
}

async function computeAndApplyVerdict(
  db: ReturnType<typeof getDb>,
  evidenceId: string,
  newCount: number,
  evidenceRow: EvidenceRowForVerdict,
): Promise<void> {
  if (!db) return;
  if (newCount < evidenceRow.peerReviewsNeeded) return;

  const allReviews = await db
    .select({ verdict: peerReviews.verdict, confidence: peerReviews.confidence })
    .from(peerReviews)
    .where(eq(peerReviews.evidenceId, evidenceId));

  let weightedApprove = 0;
  let totalWeight = 0;
  for (const r of allReviews) {
    const conf = Number(r.confidence);
    totalWeight += conf;
    if (r.verdict === "approve") weightedApprove += conf;
  }

  const peerConfidence = totalWeight > 0 ? weightedApprove / totalWeight : 0;
  const peerVerdict = peerConfidence >= 0.5 ? "approved" : "rejected";
  const aiScore = evidenceRow.aiVerificationScore ? Number(evidenceRow.aiVerificationScore) : 0.5;
  const finalConfidence = aiScore * 0.4 + peerConfidence * 0.6;
  const finalVerdict = finalConfidence >= 0.6 && peerVerdict === "approved" ? "verified" : "rejected";
  const newStage = finalVerdict === "verified" ? "verified" : "rejected";

  await db.update(evidence).set({
    peerVerdict,
    peerAverageConfidence: String(peerConfidence.toFixed(2)),
    finalVerdict,
    finalConfidence: String(finalConfidence.toFixed(2)),
    verificationStage: newStage,
    updatedAt: new Date(),
  }).where(eq(evidence.id, evidenceId));

  await db.insert(verificationAuditLog).values({
    evidenceId,
    decisionSource: "peer",
    decision: finalVerdict === "verified" ? "approved" : "rejected",
    score: String(finalConfidence.toFixed(2)),
    reasoning: `Peer verdict: ${peerVerdict}, confidence: ${peerConfidence.toFixed(2)}, final: ${finalConfidence.toFixed(2)}`,
    metadata: { peerReviewCount: newCount, peerConfidence, aiScore, finalConfidence },
  });

  if (finalVerdict === "verified") {
    try { await distributeEvidenceReward(db, evidenceId); } catch { /* Non-fatal */ }
    broadcast({ type: "evidence:verified", data: { evidenceId, missionId: evidenceRow.missionId, humanId: evidenceRow.submittedByHumanId, finalConfidence } });
  } else {
    broadcast({ type: "evidence:rejected", data: { evidenceId, missionId: evidenceRow.missionId, humanId: evidenceRow.submittedByHumanId, reason: `Peer review verdict: ${peerVerdict}` } });
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/peer-reviews/:evidenceId/vote - Submit vote
// ---------------------------------------------------------------------------
const voteSchema = z.object({
  verdict: z.enum(["approve", "reject"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(20).max(2000),
});

peerReviewRoutes.post("/:evidenceId/vote", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const evidenceId = parseUuidParam(c.req.param("evidenceId"), "evidenceId");
  const human = c.get("human");

  // Rate limit: 30 votes per hour
  const redis = getRedis();
  if (redis) {
    const voteKey = `rate:peer:vote:${human.id}`;
    const count = await redis.get(voteKey);
    if (count && parseInt(count, 10) >= 30) {
      throw new AppError("RATE_LIMITED", "Vote rate limit exceeded (30/hour)");
    }
  }

  const body = await c.req.json();
  const parsed = voteSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid vote", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  // Fetch evidence
  const [evidenceRow] = await db
    .select({
      id: evidence.id,
      submittedByHumanId: evidence.submittedByHumanId,
      verificationStage: evidence.verificationStage,
      peerReviewCount: evidence.peerReviewCount,
      peerReviewsNeeded: evidence.peerReviewsNeeded,
      aiVerificationScore: evidence.aiVerificationScore,
      missionId: evidence.missionId,
    })
    .from(evidence)
    .where(eq(evidence.id, evidenceId))
    .limit(1);

  if (!evidenceRow) {
    throw new AppError("NOT_FOUND", "Evidence not found");
  }

  // Self-review check
  if (evidenceRow.submittedByHumanId === human.id) {
    throw new AppError("FORBIDDEN", "Cannot review your own evidence");
  }

  // Stage check
  if (evidenceRow.verificationStage !== "peer_review") {
    throw new AppError("FORBIDDEN", "Evidence is not in peer review stage");
  }

  // Duplicate vote check
  const [existingVote] = await db
    .select({ id: peerReviews.id })
    .from(peerReviews)
    .where(
      and(
        eq(peerReviews.evidenceId, evidenceId),
        eq(peerReviews.reviewerHumanId, human.id),
      ),
    )
    .limit(1);

  if (existingVote) {
    throw new AppError("CONFLICT", "Already voted on this evidence");
  }

  // Create peer review record
  const [review] = await db
    .insert(peerReviews)
    .values({
      evidenceId,
      reviewerHumanId: human.id,
      verdict: parsed.data.verdict,
      confidence: String(parsed.data.confidence),
      reasoning: parsed.data.reasoning,
    })
    .returning();

  // Update peer review count (atomic increment to avoid race conditions)
  const newCount = evidenceRow.peerReviewCount + 1;
  await db
    .update(evidence)
    .set({
      peerReviewCount: sql`${evidence.peerReviewCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(evidence.id, evidenceId));

  // Create review history entry
  await db.insert(reviewHistory).values({
    reviewerHumanId: human.id,
    submitterHumanId: evidenceRow.submittedByHumanId,
    evidenceId,
  });

  // Distribute peer review reward
  let rewardAmount = 2;
  try {
    const result = await distributePeerReviewReward(
      db, review!.id, human.id, evidenceId,
    );
    if (result) {
      rewardAmount = result.rewardAmount;

      // Update peer review with reward transaction ID
      await db
        .update(peerReviews)
        .set({ rewardTransactionId: result.transactionId })
        .where(eq(peerReviews.id, review!.id));
    }
  } catch {
    // Non-fatal: reward distribution can be retried
  }

  // Compute and apply verdict if enough reviews collected
  await computeAndApplyVerdict(db, evidenceId, newCount, evidenceRow);

  // Increment rate limit
  if (redis) {
    const voteKey = `rate:peer:vote:${human.id}`;
    const count = await redis.incr(voteKey);
    if (count === 1) {
      await redis.expire(voteKey, 3600);
    }
  }

  return c.json(
    {
      ok: true,
      data: {
        reviewId: review!.id,
        evidenceId,
        verdict: parsed.data.verdict,
        confidence: parsed.data.confidence,
        rewardAmount,
      },
      requestId: c.get("requestId"),
    },
    201,
  );
});

// ---------------------------------------------------------------------------
// GET /api/v1/peer-reviews/history - List past votes
// ---------------------------------------------------------------------------
const historyQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

peerReviewRoutes.get("/history", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const query = c.req.query();
  const parsed = historyQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid query parameters");
  }

  const { limit, cursor } = parsed.data;

  const conditions = [eq(peerReviews.reviewerHumanId, human.id)];

  if (cursor) {
    const [cursorReview] = await db
      .select({ createdAt: peerReviews.createdAt })
      .from(peerReviews)
      .where(eq(peerReviews.id, cursor))
      .limit(1);
    if (cursorReview) {
      conditions.push(lt(peerReviews.createdAt, cursorReview.createdAt));
    }
  }

  const rows = await db
    .select({
      id: peerReviews.id,
      evidenceId: peerReviews.evidenceId,
      verdict: peerReviews.verdict,
      confidence: peerReviews.confidence,
      reasoning: peerReviews.reasoning,
      createdAt: peerReviews.createdAt,
    })
    .from(peerReviews)
    .where(and(...conditions))
    .orderBy(desc(peerReviews.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = items[items.length - 1];

  return c.json({
    ok: true,
    data: {
      reviews: items.map((r) => ({
        ...r,
        confidence: Number(r.confidence),
        rewardAmount: 2,
      })),
      nextCursor: hasMore && lastItem ? lastItem.id : null,
    },
    meta: {
      hasMore,
      count: items.length,
    },
    requestId: c.get("requestId"),
  });
});

export default peerReviewRoutes;
