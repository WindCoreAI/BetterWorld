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

  // Rate limit: 3 appeals per day
  const redis = getRedis();
  if (redis) {
    const appealKey = `rate:evidence:appeal:${human.id}`;
    const count = await redis.get(appealKey);
    if (count && parseInt(count, 10) >= 3) {
      throw new AppError("RATE_LIMITED", "Appeal rate limit exceeded (3/day)");
    }
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
  if (redis) {
    const appealKey = `rate:evidence:appeal:${human.id}`;
    const count = await redis.incr(appealKey);
    if (count === 1) {
      await redis.expire(appealKey, 86400); // 24 hours
    }
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

export default verifyRoutes;
