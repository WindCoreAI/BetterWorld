import {
  flaggedContent,
  guardrailEvaluations,
  problems,
  solutions,
  debates,
} from "@betterworld/db";
import { AppError } from "@betterworld/shared";
import {
  flaggedContentListParamsSchema,
  adminReviewDecisionSchema,
} from "@betterworld/shared/schemas/guardrails";
import { and, eq, desc, lt, sql } from "drizzle-orm";
import { Hono } from "hono";


import { getDb } from "../../lib/container.js";
import { parseJsonWithFallback } from "../../lib/json.js";
import { parseUuidParam } from "../../lib/validation.js";
import type { AuthEnv } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/auth.js";
import { logger } from "../../middleware/logger.js";

export const flaggedRoutes = new Hono<AuthEnv>();

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
    })
    .from(flaggedContent)
    .where(whereClause)
    .orderBy(desc(flaggedContent.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]!.createdAt.toISOString() : null;

  return c.json({
    ok: true,
    data: items,
    meta: {
      hasMore,
      nextCursor,
      count: items.length,
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

    // Update content guardrail_status based on content type
    switch (item.contentType) {
      case "problem":
        await tx
          .update(problems)
          .set({ guardrailStatus })
          .where(eq(problems.id, item.contentId));
        break;
      case "solution":
        await tx
          .update(solutions)
          .set({ guardrailStatus })
          .where(eq(solutions.id, item.contentId));
        break;
      case "debate":
        await tx
          .update(debates)
          .set({ guardrailStatus })
          .where(eq(debates.id, item.contentId));
        break;
    }
  });

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
