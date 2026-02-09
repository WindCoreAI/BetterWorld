import { problems, solutions, guardrailEvaluations, flaggedContent, debates } from "@betterworld/db";
import {
  paginationQuerySchema,
  AppError,
  createSolutionSchema,
  updateSolutionSchema,
} from "@betterworld/shared";
import { and, eq, desc, lt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { getDb } from "../lib/container.js";
import { enqueueForEvaluation } from "../lib/guardrail-helpers.js";
import { parseUuidParam } from "../lib/validation.js";
import { requireAgent } from "../middleware/auth.js";
import type { AuthEnv } from "../middleware/auth.js";

export const solutionsRoutes = new Hono<AuthEnv>();

const solutionListQuerySchema = paginationQuerySchema.extend({
  problemId: z.string().uuid().optional(),
  status: z.string().optional(),
  mine: z.enum(["true", "false"]).optional(),
  sort: z.enum(["recent", "score", "votes"]).optional(),
});

// GET /api/v1/solutions — List solutions
solutionsRoutes.get("/", async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const query = c.req.query();
  const parsed = solutionListQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid query parameters", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { limit, cursor, problemId, status, mine, sort } = parsed.data;
  const agent = c.get("agent");
  const isMine = mine === "true" && !!agent;

  const conditions = [];

  if (isMine) {
    conditions.push(eq(solutions.proposedByAgentId, agent!.id));
  } else {
    conditions.push(eq(solutions.guardrailStatus, "approved"));
  }

  if (problemId) {
    conditions.push(eq(solutions.problemId, problemId));
  }

  if (status) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conditions.push(eq(solutions.status, status as typeof solutions.status.enumValues[number]));
  }

  if (cursor) {
    if (sort === "score") {
      conditions.push(lt(solutions.compositeScore, cursor));
    } else {
      conditions.push(lt(solutions.createdAt, new Date(cursor)));
    }
  }

  const orderBy = sort === "score"
    ? desc(solutions.compositeScore)
    : desc(solutions.createdAt);

  const rows = await db
    .select({
      id: solutions.id,
      problemId: solutions.problemId,
      proposedByAgentId: solutions.proposedByAgentId,
      title: solutions.title,
      description: solutions.description,
      approach: solutions.approach,
      expectedImpact: solutions.expectedImpact,
      impactScore: solutions.impactScore,
      feasibilityScore: solutions.feasibilityScore,
      costEfficiencyScore: solutions.costEfficiencyScore,
      compositeScore: solutions.compositeScore,
      guardrailStatus: solutions.guardrailStatus,
      status: solutions.status,
      agentDebateCount: solutions.agentDebateCount,
      createdAt: solutions.createdAt,
    })
    .from(solutions)
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = items[items.length - 1];
  const nextCursor = hasMore
    ? (sort === "score" ? lastItem!.compositeScore : lastItem!.createdAt.toISOString())
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

// GET /api/v1/solutions/:id — Get single solution
solutionsRoutes.get("/:id", async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const id = parseUuidParam(c.req.param("id"));
  const agent = c.get("agent");

  const [solution] = await db
    .select()
    .from(solutions)
    .where(eq(solutions.id, id))
    .limit(1);

  if (!solution) {
    throw new AppError("NOT_FOUND", "Solution not found");
  }

  if (solution.guardrailStatus !== "approved") {
    if (!agent || solution.proposedByAgentId !== agent.id) {
      throw new AppError("FORBIDDEN", "You do not have access to this solution");
    }
  }

  return c.json({
    ok: true,
    data: solution,
    requestId: c.get("requestId"),
  });
});

// POST /api/v1/solutions — Create solution proposal
solutionsRoutes.post("/", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const body = await c.req.json();
  const parsed = createSolutionSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid request body", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const agent = c.get("agent")!;
  const { problemId, ...solutionData } = parsed.data;

  // Verify problem exists and is active
  const [problem] = await db
    .select({ id: problems.id, status: problems.status })
    .from(problems)
    .where(eq(problems.id, problemId))
    .limit(1);

  if (!problem) {
    throw new AppError("NOT_FOUND", "Referenced problem does not exist");
  }

  if (problem.status === "archived") {
    throw new AppError("CONFLICT", "Cannot submit solutions to an archived problem");
  }

  const result = await db.transaction(async (tx) => {
    const [solution] = await tx
      .insert(solutions)
      .values({
        ...solutionData,
        problemId,
        proposedByAgentId: agent.id,
        expectedImpact: solutionData.expectedImpact,
        estimatedCost: solutionData.estimatedCost ?? null,
        risksAndMitigations: solutionData.risksAndMitigations ?? [],
        requiredSkills: solutionData.requiredSkills ?? [],
        requiredLocations: solutionData.requiredLocations ?? [],
        guardrailStatus: "pending",
      })
      .returning();

    // Increment parent problem's solutionCount
    await tx
      .update(problems)
      .set({ solutionCount: sql`${problems.solutionCount} + 1` })
      .where(eq(problems.id, problemId));

    // Enqueue for guardrail evaluation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evaluationId = await enqueueForEvaluation(tx as any, {
      contentId: solution!.id,
      contentType: "solution",
      content: JSON.stringify({
        title: solutionData.title,
        description: solutionData.description,
        approach: solutionData.approach,
      }),
      agentId: agent.id,
    });

    return { ...solution!, guardrailEvaluationId: evaluationId };
  });

  return c.json({
    ok: true,
    data: result,
    requestId: c.get("requestId"),
  }, 201);
});

// PATCH /api/v1/solutions/:id — Update solution (owning agent only)
solutionsRoutes.patch("/:id", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const id = parseUuidParam(c.req.param("id"));
  const agent = c.get("agent")!;

  const body = await c.req.json();
  const parsed = updateSolutionSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid request body", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const [existing] = await db
    .select()
    .from(solutions)
    .where(eq(solutions.id, id))
    .limit(1);

  if (!existing) {
    throw new AppError("NOT_FOUND", "Solution not found");
  }

  if (existing.proposedByAgentId !== agent.id) {
    throw new AppError("FORBIDDEN", "You can only update your own solutions");
  }

  const updateData = parsed.data;

  const result = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(solutions)
      .set({
        ...updateData,
        guardrailStatus: "pending",
        impactScore: "0",
        feasibilityScore: "0",
        costEfficiencyScore: "0",
        compositeScore: "0",
        updatedAt: new Date(),
      })
      .where(eq(solutions.id, id))
      .returning();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await enqueueForEvaluation(tx as any, {
      contentId: id,
      contentType: "solution",
      content: JSON.stringify({
        title: updated!.title,
        description: updated!.description,
        approach: updated!.approach,
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

// DELETE /api/v1/solutions/:id — Delete solution with cascade
solutionsRoutes.delete("/:id", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const id = parseUuidParam(c.req.param("id"));
  const agent = c.get("agent")!;

  const [existing] = await db
    .select({ id: solutions.id, proposedByAgentId: solutions.proposedByAgentId, problemId: solutions.problemId })
    .from(solutions)
    .where(eq(solutions.id, id))
    .limit(1);

  if (!existing) {
    throw new AppError("NOT_FOUND", "Solution not found");
  }

  if (existing.proposedByAgentId !== agent.id) {
    throw new AppError("FORBIDDEN", "You can only delete your own solutions");
  }

  await db.transaction(async (tx) => {
    // Delete debates on this solution
    await tx.delete(debates).where(eq(debates.solutionId, id));
    // Delete flagged content referencing this solution
    await tx.delete(flaggedContent).where(eq(flaggedContent.contentId, id));
    // Delete guardrail evaluations referencing this solution
    await tx.delete(guardrailEvaluations).where(eq(guardrailEvaluations.contentId, id));
    // Delete the solution
    await tx.delete(solutions).where(eq(solutions.id, id));
    // Decrement parent problem's solutionCount
    await tx
      .update(problems)
      .set({ solutionCount: sql`GREATEST(${problems.solutionCount} - 1, 0)` })
      .where(eq(problems.id, existing.problemId));
  });

  return c.json({
    ok: true,
    data: { deleted: true },
    requestId: c.get("requestId"),
  });
});
