/**
 * Evidence Review Routes (Sprint 13 — Phase 3 Integration)
 *
 * GET  /evidence-reviews/pending   — List own pending evidence review assignments
 * POST /evidence-reviews/:id/respond — Submit evidence review response
 * GET  /evidence-reviews/:id       — Evidence review detail (ownership check)
 */
import { evidenceReviewAssignments, evidence } from "@betterworld/db";
import { submitEvidenceReviewSchema, AppError } from "@betterworld/shared";
import { and, eq, gt, asc } from "drizzle-orm";
import { Hono } from "hono";

import { getDb } from "../lib/container.js";
import { parseUuidParam } from "../lib/validation.js";
import type { AuthEnv } from "../middleware/auth.js";
import { requireAgent } from "../middleware/auth.js";
import { submitEvidenceReview } from "../services/evidence-review.service.js";

const evidenceReviewRoutes = new Hono<AuthEnv>();

// ============================================================================
// GET /evidence-reviews/pending
// ============================================================================

evidenceReviewRoutes.get("/pending", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      {
        ok: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" },
        requestId: c.get("requestId"),
      },
      503,
    );
  }

  const agent = c.get("agent");
  if (!agent) {
    throw new AppError("UNAUTHORIZED", "Agent authentication required");
  }

  const cursor = c.req.query("cursor");
  const limit = Math.min(Number(c.req.query("limit")) || 20, 100);

  // Build conditions
  const conditions = [
    eq(evidenceReviewAssignments.validatorAgentId, agent.id),
    eq(evidenceReviewAssignments.status, "pending"),
  ];

  if (cursor) {
    conditions.push(gt(evidenceReviewAssignments.assignedAt, new Date(cursor)));
  }

  const assignments = await db
    .select({
      id: evidenceReviewAssignments.id,
      evidenceId: evidenceReviewAssignments.evidenceId,
      capabilityMatch: evidenceReviewAssignments.capabilityMatch,
      status: evidenceReviewAssignments.status,
      assignedAt: evidenceReviewAssignments.assignedAt,
      expiresAt: evidenceReviewAssignments.expiresAt,
    })
    .from(evidenceReviewAssignments)
    .where(and(...conditions))
    .orderBy(asc(evidenceReviewAssignments.assignedAt))
    .limit(limit + 1);

  const hasMore = assignments.length > limit;
  const results = hasMore ? assignments.slice(0, limit) : assignments;

  // Enrich with evidence details
  const enriched = await Promise.all(
    results.map(async (a) => {
      let evidenceDetails: { evidenceType: string; missionId: string } | null = null;
      try {
        const [ev] = await db
          .select({
            evidenceType: evidence.evidenceType,
            missionId: evidence.missionId,
          })
          .from(evidence)
          .where(eq(evidence.id, a.evidenceId))
          .limit(1);
        if (ev) {
          evidenceDetails = ev;
        }
      } catch {
        // Non-fatal
      }

      return {
        id: a.id,
        evidenceId: a.evidenceId,
        evidenceType: evidenceDetails?.evidenceType ?? null,
        missionId: evidenceDetails?.missionId ?? null,
        capabilityMatch: a.capabilityMatch,
        status: a.status,
        assignedAt: a.assignedAt.toISOString(),
        expiresAt: a.expiresAt.toISOString(),
      };
    }),
  );

  const nextCursor =
    hasMore && results.length > 0
      ? results[results.length - 1]!.assignedAt.toISOString()
      : null;

  return c.json({
    ok: true,
    data: {
      reviews: enriched,
      nextCursor,
      hasMore,
    },
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// POST /evidence-reviews/:id/respond
// ============================================================================

evidenceReviewRoutes.post("/:id/respond", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      {
        ok: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" },
        requestId: c.get("requestId"),
      },
      503,
    );
  }

  const agent = c.get("agent");
  if (!agent) {
    throw new AppError("UNAUTHORIZED", "Agent authentication required");
  }

  const reviewId = parseUuidParam(c.req.param("id"), "reviewId");

  // Parse and validate body
  const body = await c.req.json();
  const parsed = submitEvidenceReviewSchema.safeParse(body);
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

  const { recommendation, confidence, reasoning } = parsed.data;

  try {
    const result = await submitEvidenceReview(
      db,
      reviewId,
      agent.id,
      recommendation,
      confidence,
      reasoning,
    );

    return c.json({
      ok: true,
      data: result,
      requestId: c.get("requestId"),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("not found")) {
      throw new AppError("NOT_FOUND", message);
    }
    if (message.includes("not assigned")) {
      throw new AppError("FORBIDDEN", message);
    }
    if (message.includes("expired")) {
      throw new AppError("GONE", message);
    }
    if (message.includes("already completed")) {
      throw new AppError("CONFLICT", message);
    }
    throw err;
  }
});

// ============================================================================
// GET /evidence-reviews/:id
// ============================================================================

evidenceReviewRoutes.get("/:id", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      {
        ok: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" },
        requestId: c.get("requestId"),
      },
      503,
    );
  }

  const agent = c.get("agent");
  if (!agent) {
    throw new AppError("UNAUTHORIZED", "Agent authentication required");
  }

  const reviewId = parseUuidParam(c.req.param("id"), "reviewId");

  const [assignment] = await db
    .select({
      id: evidenceReviewAssignments.id,
      evidenceId: evidenceReviewAssignments.evidenceId,
      validatorAgentId: evidenceReviewAssignments.validatorAgentId,
      capabilityMatch: evidenceReviewAssignments.capabilityMatch,
      recommendation: evidenceReviewAssignments.recommendation,
      confidence: evidenceReviewAssignments.confidence,
      reasoning: evidenceReviewAssignments.reasoning,
      rewardAmount: evidenceReviewAssignments.rewardAmount,
      rewardTransactionId: evidenceReviewAssignments.rewardTransactionId,
      status: evidenceReviewAssignments.status,
      assignedAt: evidenceReviewAssignments.assignedAt,
      respondedAt: evidenceReviewAssignments.respondedAt,
      expiresAt: evidenceReviewAssignments.expiresAt,
    })
    .from(evidenceReviewAssignments)
    .where(eq(evidenceReviewAssignments.id, reviewId))
    .limit(1);

  if (!assignment) {
    throw new AppError("NOT_FOUND", "Evidence review not found");
  }

  // Ownership check: must be the assigned validator
  if (assignment.validatorAgentId !== agent.id) {
    throw new AppError("FORBIDDEN", "Access denied");
  }

  return c.json({
    ok: true,
    data: {
      id: assignment.id,
      evidenceId: assignment.evidenceId,
      capabilityMatch: assignment.capabilityMatch,
      recommendation: assignment.recommendation,
      confidence: assignment.confidence ? Number(assignment.confidence) : null,
      reasoning: assignment.reasoning,
      rewardAmount: assignment.rewardAmount ? Number(assignment.rewardAmount) : null,
      rewardTransactionId: assignment.rewardTransactionId,
      status: assignment.status,
      assignedAt: assignment.assignedAt.toISOString(),
      respondedAt: assignment.respondedAt?.toISOString() ?? null,
      expiresAt: assignment.expiresAt.toISOString(),
    },
    requestId: c.get("requestId"),
  });
});

export default evidenceReviewRoutes;
