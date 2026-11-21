import { flaggedContent, guardrailEvaluations } from "@betterworld/db";
import { AppError } from "@betterworld/shared";
import {
  flaggedContentListParamsSchema,
  adminReviewDecisionSchema,
} from "@betterworld/shared/schemas/guardrails";
import { and, eq, desc, lt, sql } from "drizzle-orm";
import { Hono } from "hono";


import { getDb, getRedis } from "../../lib/container.js";
import { recordHumanDecision, updateContentStatus } from "../../lib/content-status.js";
import { parseJsonWithFallback } from "../../lib/json.js";
import { parseUuidParam } from "../../lib/validation.js";
import type { AuthEnv } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/auth.js";
import { logger } from "../../middleware/logger.js";

export const flaggedRoutes = new Hono<AuthEnv>();

const PREVIEW_MAX_CHARS = 120;

/** One line describing a submission, for the review queue list. */
export function previewTitle(submittedContent: string | null): string | null {
  if (!submittedContent) return null;
  const content = parseJsonWithFallback<Record<string, unknown> | null>(submittedContent, null);
  if (!content || typeof content !== "object") return null;

  // Problems, solutions and missions have a title; debates and discussion posts only have a body.
  const text = [content.title, content.content, content.description].find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  if (!text) return null;

  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > PREVIEW_MAX_CHARS ? `${oneLine.slice(0, PREVIEW_MAX_CHARS - 1)}…` : oneLine;
}

// GET /api/v1/admin/flagged — List flagged content (cursor-based pagination)
flaggedRoutes.get("/", requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const query = c.req.query();
  const parsed = flaggedContentListParamsSchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid query parameters", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { status, contentType, cursor, limit } = parsed.data;

  const conditions = [];

  if (status !== "all") {
    conditions.push(eq(flaggedContent.status, status));
  }

  if (contentType !== "all") {
    conditions.push(eq(flaggedContent.contentType, contentType));
  }

  if (cursor) {
    conditions.push(lt(flaggedContent.createdAt, new Date(cursor)));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: flaggedContent.id,
      evaluationId: flaggedContent.evaluationId,
      contentId: flaggedContent.contentId,
      contentType: flaggedContent.contentType,
      agentId: flaggedContent.agentId,
      status: flaggedContent.status,
      assignedAdminId: flaggedContent.assignedAdminId,
      claimedAt: flaggedContent.claimedAt,
      adminDecision: flaggedContent.adminDecision,
      createdAt: flaggedContent.createdAt,
      submittedContent: guardrailEvaluations.submittedContent,
    })
    .from(flaggedContent)
    .leftJoin(guardrailEvaluations, eq(flaggedContent.evaluationId, guardrailEvaluations.id))
    .where(whereClause)
    .orderBy(desc(flaggedContent.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  // A reviewer needs to see what an item is before opening it; ids alone made
  // the queue a list of indistinguishable rows.
  const items = (hasMore ? rows.slice(0, limit) : rows).map(({ submittedContent, ...item }) => ({
    ...item,
    title: previewTitle(submittedContent),
  }));
  const nextCursor = hasMore ? items[items.length - 1]!.createdAt.toISOString() : null;

  // Total for the current filter (ignoring the cursor). The admin dashboard and
  // the queue page read `meta.total` and `meta.cursor`; neither was returned, so
  // "Pending Reviews" always showed 0 and "load more" never advanced.
  const totalConditions = [];
  if (status !== "all") totalConditions.push(eq(flaggedContent.status, status));
  if (contentType !== "all") totalConditions.push(eq(flaggedContent.contentType, contentType));
  const [totalRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(flaggedContent)
    .where(totalConditions.length > 0 ? and(...totalConditions) : undefined);

  return c.json({
    ok: true,
    data: items,
    meta: {
      hasMore,
      nextCursor,
      cursor: nextCursor,
      count: items.length,
      total: totalRow?.total ?? items.length,
    },
    requestId: c.get("requestId"),
  });
});

// GET /api/v1/admin/flagged/:id — Full details of a flagged item
flaggedRoutes.get("/:id", requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const id = parseUuidParam(c.req.param("id"));

  const [item] = await db
    .select()
    .from(flaggedContent)
    .where(eq(flaggedContent.id, id))
    .limit(1);

  if (!item) {
    throw new AppError("NOT_FOUND", "Flagged content not found");
  }

  // Fetch evaluation details
  const [evaluation] = await db
    .select()
    .from(guardrailEvaluations)
    .where(eq(guardrailEvaluations.id, item.evaluationId))
    .limit(1);

  // Safely parse evaluation data with error handling
  let parsedEvaluation = null;
  if (evaluation) {
    try {
      const submittedContent = parseJsonWithFallback(evaluation.submittedContent, {});
      const layerAResult = parseJsonWithFallback(evaluation.layerAResult, {
        passed: false,
        forbiddenPatterns: [],
        executionTimeMs: 0,
      });
      const layerBResult = evaluation.layerBResult
        ? parseJsonWithFallback(evaluation.layerBResult, null)
        : null;

      parsedEvaluation = {
        submittedContent,
        layerAResult,
        layerBResult,
        alignmentScore: evaluation.alignmentScore
          ? parseFloat(evaluation.alignmentScore)
          : null,
        alignmentDomain: evaluation.alignmentDomain,
        trustTier: evaluation.trustTier,
      };
    } catch (err) {
      logger.warn(
        { evaluationId: evaluation.id, error: err instanceof Error ? err.message : "Unknown" },
        "Failed to parse evaluation data",
      );
      parsedEvaluation = {
        submittedContent: { _error: "Invalid content format" },
        layerAResult: { passed: false, forbiddenPatterns: [], executionTimeMs: 0, _error: "Invalid format" },
        layerBResult: null,
        alignmentScore: null,
        alignmentDomain: null,
        trustTier: evaluation.trustTier,
      };
    }
  }

  return c.json({
    ok: true,
    data: {
      ...item,
      evaluation: parsedEvaluation,
    },
    requestId: c.get("requestId"),
  });
});

// POST /api/v1/admin/flagged/:id/claim — Claim item for review (atomic via SELECT FOR UPDATE)
flaggedRoutes.post("/:id/claim", requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const id = parseUuidParam(c.req.param("id"));
  const adminUser = c.get("user");
  if (!adminUser) {
    throw new AppError("UNAUTHORIZED", "Admin user required");
  }

  // Atomic claim via SELECT FOR UPDATE inside a transaction
  const claimedAt = new Date();
  const result = await db.transaction(async (tx) => {
    const rows = await tx.execute(
      sql`SELECT id, status, assigned_admin_id
          FROM flagged_content
          WHERE id = ${id}
          FOR UPDATE SKIP LOCKED`,
    );

    const row = rows[0] as
      | { id: string; status: string; assigned_admin_id: string | null }
      | undefined;

    if (!row) {
      // Row doesn't exist or is locked by a concurrent claim
      return null;
    }

    if (row.assigned_admin_id) {
      throw new AppError("ALREADY_CLAIMED", "Item already claimed by another admin");
    }

    if (row.status !== "pending_review") {
      throw new AppError("ALREADY_CLAIMED", `Cannot claim item with status: ${row.status}`);
    }

    await tx
      .update(flaggedContent)
      .set({
        assignedAdminId: adminUser.sub,
        claimedAt,
      })
      .where(eq(flaggedContent.id, id));

    return { id };
  });

  if (!result) {
    // SKIP LOCKED returned nothing — item doesn't exist or is locked by concurrent operation
    throw new AppError(
      "CONFLICT" as const,
      "Item is unavailable (already claimed, being processed, or does not exist)",
    );
  }

  return c.json({
    ok: true,
    data: { id, claimedBy: adminUser.sub, claimedAt: claimedAt.toISOString() },
    requestId: c.get("requestId"),
  });
});

// POST /api/v1/admin/review/:id — Submit review decision
flaggedRoutes.post("/:id/review", requireAdmin(), async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const id = parseUuidParam(c.req.param("id"));
  const adminUser = c.get("user");
  if (!adminUser) {
    throw new AppError("UNAUTHORIZED", "Admin user required");
  }

  const body = await c.req.json();
  const parsed = adminReviewDecisionSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid request body", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { decision, notes } = parsed.data;

  // Verify the item is claimed by this admin
  const [item] = await db
    .select()
    .from(flaggedContent)
    .where(eq(flaggedContent.id, id))
    .limit(1);

  if (!item) {
    throw new AppError("NOT_FOUND", "Flagged content not found");
  }

  if (item.assignedAdminId !== adminUser.sub) {
    throw new AppError("FORBIDDEN", "You must claim this item before reviewing");
  }

  if (item.status !== "pending_review") {
    throw new AppError("ALREADY_CLAIMED", `Cannot review item with status: ${item.status}`);
  }

  // Map review decision to guardrail status
  const guardrailStatus = decision === "approve" ? "approved" : "rejected";
  const flaggedStatus = decision === "approve" ? "approved" : "rejected";

  // Update flagged_content + content table atomically in a transaction
  const reviewedAt = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(flaggedContent)
      .set({
        adminDecision: decision,
        adminNotes: notes,
        reviewedAt,
        status: flaggedStatus,
      })
      .where(eq(flaggedContent.id, id));

    // Apply the verdict to the content itself — for every moderated content
    // type (missions included; they used to be silently skipped here, so a
    // flagged mission could never be approved).
    await updateContentStatus(tx, item.contentId, item.contentType, guardrailStatus);

    // The human verdict is the evaluation's final decision. This is what makes
    // approvals count toward the agent's track record.
    await recordHumanDecision(tx, item.evaluationId, guardrailStatus);
  });

  // The agent's trust tier depends on its approved-submission count.
  const redis = getRedis();
  if (redis) {
    await redis.del(`trust:tier:${item.agentId}`).catch(() => undefined);
  }

  return c.json({
    ok: true,
    data: {
      id,
      decision,
      notes,
      contentId: item.contentId,
      contentType: item.contentType,
      guardrailStatus,
      reviewedAt: reviewedAt.toISOString(),
      reviewedBy: adminUser.sub,
    },
    requestId: c.get("requestId"),
  });
});
