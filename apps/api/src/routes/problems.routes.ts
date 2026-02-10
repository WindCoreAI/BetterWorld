import { problems, solutions, debates, guardrailEvaluations, flaggedContent } from "@betterworld/db";
import {
  paginationQuerySchema,
  AppError,
  createProblemSchema,
  updateProblemSchema,
} from "@betterworld/shared";
import { and, eq, desc, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { getDb } from "../lib/container.js";
import { enqueueForEvaluation } from "../lib/guardrail-helpers.js";
import { parseUuidParam } from "../lib/validation.js";
import { requireAgent } from "../middleware/auth.js";
import type { AuthEnv } from "../middleware/auth.js";

export const problemsRoutes = new Hono<AuthEnv>();

const problemListQuerySchema = paginationQuerySchema.extend({
  domain: z.string().optional(),
  severity: z.string().optional(),
  status: z.string().optional(),
  mine: z.enum(["true", "false"]).optional(),
  sort: z.enum(["recent", "upvotes", "solutions"]).optional(),
});

// GET /api/v1/problems — List problems
problemsRoutes.get("/", async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const query = c.req.query();
  const parsed = problemListQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid query parameters", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { limit, cursor, domain, severity, status, mine, sort } = parsed.data;
  const agent = c.get("agent");
  const isMine = mine === "true" && !!agent;

  const conditions = [];

  if (isMine) {
    // Agent sees all their own problems regardless of guardrailStatus
    conditions.push(eq(problems.reportedByAgentId, agent!.id));
  } else {
    // Public: approved only
    conditions.push(eq(problems.guardrailStatus, "approved"));
  }

  if (domain) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conditions.push(eq(problems.domain, domain as typeof problems.domain.enumValues[number]));
  }

  if (severity) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conditions.push(eq(problems.severity, severity as typeof problems.severity.enumValues[number]));
  }

  if (status) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conditions.push(eq(problems.status, status as typeof problems.status.enumValues[number]));
  }

  // Composite cursor (timestamp::id) for stable pagination
  if (cursor) {
    const [cursorTime, cursorId] = cursor.split("::");
    if (cursorTime && cursorId) {
      conditions.push(
        sql`(${problems.createdAt}, ${problems.id}) < (${cursorTime}, ${cursorId})`,
      );
    }
  }

  const orderBy = sort === "upvotes"
    ? desc(problems.upvotes)
    : sort === "solutions"
      ? desc(problems.solutionCount)
      : desc(problems.createdAt);

  const rows = await db
    .select({
      id: problems.id,
      reportedByAgentId: problems.reportedByAgentId,
      title: problems.title,
      description: problems.description,
      domain: problems.domain,
      severity: problems.severity,
      guardrailStatus: problems.guardrailStatus,
      solutionCount: problems.solutionCount,
      upvotes: problems.upvotes,
      status: problems.status,
      createdAt: problems.createdAt,
    })
    .from(problems)
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore
    ? `${items[items.length - 1]!.createdAt.toISOString()}::${items[items.length - 1]!.id}`
    : null;

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

// GET /api/v1/problems/:id — Get single problem
problemsRoutes.get("/:id", async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const id = parseUuidParam(c.req.param("id"));
  const agent = c.get("agent");

  const [problem] = await db
    .select()
    .from(problems)
    .where(eq(problems.id, id))
    .limit(1);

  if (!problem) {
    throw new AppError("NOT_FOUND", "Problem not found");
  }

  // Non-approved content: only visible to owning agent with sanitized details
  if (problem.guardrailStatus !== "approved") {
    if (!agent || problem.reportedByAgentId !== agent.id) {
      throw new AppError("FORBIDDEN", "You do not have access to this problem");
    }

    // Return sanitized view for non-approved content to prevent guardrail gaming
    return c.json({
      ok: true,
      data: {
        ...problem,
        guardrailExplanation:
          problem.guardrailStatus === "rejected"
            ? "This content did not meet constitutional guidelines"
            : "This content is pending review",
      },
      requestId: c.get("requestId"),
    });
  }

  return c.json({
    ok: true,
    data: problem,
    requestId: c.get("requestId"),
  });
});

// POST /api/v1/problems — Create a problem report
problemsRoutes.post("/", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const body = await c.req.json();
  const parsed = createProblemSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid request body", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const agent = c.get("agent")!;
  const data = parsed.data;

  const result = await db.transaction(async (tx) => {
    const { latitude, longitude, ...rest } = data;
    const [problem] = await tx
      .insert(problems)
      .values({
        ...rest,
        reportedByAgentId: agent.id,
        latitude: latitude != null ? String(latitude) : null,
        longitude: longitude != null ? String(longitude) : null,
        existingSolutions: data.existingSolutions ?? [],
        dataSources: data.dataSources ?? [],
        evidenceLinks: data.evidenceLinks ?? [],
        guardrailStatus: "pending",
      })
      .returning();

    const evaluationId = await enqueueForEvaluation(tx, {
      contentId: problem!.id,
      contentType: "problem",
      content: JSON.stringify({
        title: data.title,
        description: data.description,
        domain: data.domain,
      }),
      agentId: agent.id,
    });

    return { ...problem!, guardrailEvaluationId: evaluationId };
  });

  return c.json({
    ok: true,
    data: result,
    requestId: c.get("requestId"),
  }, 201);
});

// PATCH /api/v1/problems/:id — Update problem (owning agent only)
problemsRoutes.patch("/:id", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const id = parseUuidParam(c.req.param("id"));
  const agent = c.get("agent")!;

  const body = await c.req.json();
  const parsed = updateProblemSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid request body", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const [existing] = await db
    .select()
    .from(problems)
    .where(eq(problems.id, id))
    .limit(1);

  if (!existing) {
    throw new AppError("NOT_FOUND", "Problem not found");
  }

  if (existing.reportedByAgentId !== agent.id) {
    throw new AppError("FORBIDDEN", "You can only update your own problems");
  }

  const { latitude, longitude, ...updateRest } = parsed.data;
  const updateData: Record<string, unknown> = {
    ...updateRest,
    guardrailStatus: "pending",
    updatedAt: new Date(),
  };
  if (latitude !== undefined) updateData.latitude = latitude != null ? String(latitude) : null;
  if (longitude !== undefined) updateData.longitude = longitude != null ? String(longitude) : null;

  const result = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(problems)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set(updateData as any)
      .where(eq(problems.id, id))
      .returning();

    await enqueueForEvaluation(tx, {
      contentId: id,
      contentType: "problem",
      content: JSON.stringify({
        title: updated!.title,
        description: updated!.description,
        domain: updated!.domain,
      }),
      agentId: agent.id,
    });

    return updated!;
  });

  return c.json({
    ok: true,
    data: result,
    requestId: c.get("requestId"),
  });
});

// DELETE /api/v1/problems/:id — Delete problem with cascade
problemsRoutes.delete("/:id", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const id = parseUuidParam(c.req.param("id"));
  const agent = c.get("agent")!;

  const [existing] = await db
    .select({ id: problems.id, reportedByAgentId: problems.reportedByAgentId })
    .from(problems)
    .where(eq(problems.id, id))
    .limit(1);

  if (!existing) {
    throw new AppError("NOT_FOUND", "Problem not found");
  }

  if (existing.reportedByAgentId !== agent.id) {
    throw new AppError("FORBIDDEN", "You can only delete your own problems");
  }

  await db.transaction(async (tx) => {
    // Get solution IDs for this problem to cascade debates
    const solutionRows = await tx
      .select({ id: solutions.id })
      .from(solutions)
      .where(eq(solutions.problemId, id));

    const solutionIds = solutionRows.map((s) => s.id);
    const allContentIds = [id, ...solutionIds];

    // Batch delete all related content
    if (solutionIds.length > 0) {
      // Delete debates for all solutions in one query
      await tx.delete(debates).where(inArray(debates.solutionId, solutionIds));

      // Delete flagged content for problem + all solutions in one query
      await tx.delete(flaggedContent).where(inArray(flaggedContent.contentId, allContentIds));

      // Delete guardrail evaluations for problem + all solutions in one query
      await tx
        .delete(guardrailEvaluations)
        .where(inArray(guardrailEvaluations.contentId, allContentIds));
    } else {
      // No solutions, only delete flagged content and evaluations for the problem
      await tx.delete(flaggedContent).where(eq(flaggedContent.contentId, id));
      await tx.delete(guardrailEvaluations).where(eq(guardrailEvaluations.contentId, id));
    }

    // Delete solutions
    await tx.delete(solutions).where(eq(solutions.problemId, id));

    // Delete the problem
    await tx.delete(problems).where(eq(problems.id, id));
  });

  return c.json({
    ok: true,
    data: { deleted: true },
    requestId: c.get("requestId"),
  });
});
