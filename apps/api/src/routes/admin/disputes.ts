/**
 * Admin Dispute Resolution Routes (Sprint 8: Evidence Verification)
 *
 * GET /api/v1/admin/disputes - List appealed evidence
 * POST /api/v1/admin/disputes/:evidenceId/resolve - Resolve dispute
 */

import {
  evidence,
  missions,
  humans,
  peerReviews,
  verificationAuditLog,
} from "@betterworld/db";
import { AppError } from "@betterworld/shared";
import { and, eq, desc, lt, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { haversineDistance } from "../../lib/evidence-helpers.js";
import { finalizeEvidence } from "../../lib/evidence-outcome.js";
import { getSignedUrl } from "../../lib/storage.js";
import { parseUuidParam } from "../../lib/validation.js";
import { humanAuth } from "../../middleware/humanAuth.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";

const disputeRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// GET /api/v1/admin/disputes - List disputes
// ---------------------------------------------------------------------------
const listQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["pending", "resolved"]).default("pending"),
});

disputeRoutes.get("/", humanAuth(), requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const query = c.req.query();
  const parsed = listQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid query parameters");
  }

  const { limit, cursor, status } = parsed.data;

  const stageFilter = status === "pending"
    ? inArray(evidence.verificationStage, ["appealed", "admin_review"])
    : inArray(evidence.verificationStage, ["verified", "rejected"]);

  const conditions = [stageFilter];

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
      aiScore: evidence.aiVerificationScore,
      aiReasoning: evidence.aiVerificationReasoning,
      submittedAt: evidence.createdAt,
      missionTitle: missions.title,
      missionLatitude: missions.requiredLatitude,
      missionLongitude: missions.requiredLongitude,
      submitterName: humans.displayName,
    })
    .from(evidence)
    .innerJoin(missions, eq(evidence.missionId, missions.id))
    .innerJoin(humans, eq(evidence.submittedByHumanId, humans.id))
    .where(and(...conditions))
    .orderBy(desc(evidence.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  // Fetch appeal reasons from audit log and peer reviews
  const disputes = await Promise.all(
    items.map(async (row) => {
      // Get appeal reason from audit log
      const [appealLog] = await db
        .select({ reasoning: verificationAuditLog.reasoning, createdAt: verificationAuditLog.createdAt })
        .from(verificationAuditLog)
        .where(
          and(
            eq(verificationAuditLog.evidenceId, row.evidenceId),
            eq(verificationAuditLog.decision, "escalated"),
          ),
        )
        .orderBy(desc(verificationAuditLog.createdAt))
        .limit(1);

      // Get peer reviews
      const reviews = await db
        .select({
          reviewerId: peerReviews.reviewerHumanId,
          verdict: peerReviews.verdict,
          confidence: peerReviews.confidence,
          reasoning: peerReviews.reasoning,
        })
        .from(peerReviews)
        .where(eq(peerReviews.evidenceId, row.evidenceId));

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
        submitterName: row.submitterName,
        submitterId: row.submittedByHumanId,
        appealReason: appealLog?.reasoning ?? null,
        aiScore: row.aiScore ? Number(row.aiScore) : null,
        aiReasoning: row.aiReasoning,
        peerReviews: reviews.map((r) => ({
          ...r,
          confidence: Number(r.confidence),
        })),
        evidenceType: row.evidenceType,
        // Short-lived links so the operator can actually see what was submitted
        contentUrl: row.contentUrl ? await getSignedUrl(row.contentUrl) : null,
        thumbnailUrl: row.thumbnailUrl ? await getSignedUrl(row.thumbnailUrl) : null,
        evidenceLatitude: eLat,
        evidenceLongitude: eLng,
        missionLatitude: mLat,
        missionLongitude: mLng,
        gpsDistanceMeters,
        submittedAt: row.submittedAt,
        appealedAt: appealLog?.createdAt ?? null,
      };
    }),
  );

  const lastItem = items[items.length - 1];

  return c.json({
    ok: true,
    data: {
      disputes,
      nextCursor: hasMore && lastItem ? lastItem.evidenceId : null,
    },
    meta: {
      hasMore,
      count: disputes.length,
    },
    requestId: c.get("requestId"),
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/admin/disputes/:evidenceId/resolve - Resolve dispute
// ---------------------------------------------------------------------------
const resolveSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reasoning: z.string().min(10).max(5000),
});

disputeRoutes.post("/:evidenceId/resolve", humanAuth(), requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const evidenceId = parseUuidParam(c.req.param("evidenceId"), "evidenceId");

  const body = await c.req.json();
  const parsed = resolveSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid request", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  // Fetch evidence
  const [row] = await db
    .select({
      id: evidence.id,
      verificationStage: evidence.verificationStage,
      missionId: evidence.missionId,
    })
    .from(evidence)
    .where(eq(evidence.id, evidenceId))
    .limit(1);

  if (!row) {
    throw new AppError("NOT_FOUND", "Evidence not found");
  }

  if (row.verificationStage !== "appealed" && row.verificationStage !== "admin_review") {
    throw new AppError("CONFLICT", "Evidence is not in appealed or admin_review stage");
  }

  // The operator's decision is final: approve at full confidence (full reward),
  // or reject. finalizeEvidence also closes or reopens the claim, completes the
  // mission when its slots are done, and writes the audit entry.
  const outcome = await finalizeEvidence(db, {
    evidenceId,
    verdict: parsed.data.decision === "approve" ? "verified" : "rejected",
    confidence: parsed.data.decision === "approve" ? 1 : 0,
    source: "admin",
    reasoning: parsed.data.reasoning,
    decidedByHumanId: human.id,
    auditMetadata: { adminAction: "resolve_dispute", previousStage: row.verificationStage },
  });

  return c.json({
    ok: true,
    data: {
      evidenceId,
      decision: parsed.data.decision,
      rewardDistributed: outcome.rewardAmount !== null,
      rewardAmount: outcome.rewardAmount,
      claimStatus: outcome.claimStatus,
      missionCompleted: outcome.missionCompleted,
    },
    requestId: c.get("requestId"),
  });
});

export default disputeRoutes;
