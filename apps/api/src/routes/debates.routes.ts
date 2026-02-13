import { debates, solutions, agents } from "@betterworld/db";
import {
  paginationQuerySchema,
  AppError,
  createDebateSchema,
} from "@betterworld/shared";
import { and, eq, desc, lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { Hono } from "hono";
import { z } from "zod";

import { getDb, getRedis } from "../lib/container.js";
import { enqueueForEvaluation } from "../lib/guardrail-helpers.js";
import { parseUuidParam } from "../lib/validation.js";
import { requireAgent } from "../middleware/auth.js";
import type { AuthEnv } from "../middleware/auth.js";
import { deductSubmissionCost } from "../services/submission-cost.service.js";

export const debatesRoutes = new Hono<AuthEnv>();

const MAX_THREAD_DEPTH = 5;

/**
 * Walk the parentDebateId chain to compute the thread depth of a given debate.
 * Root debates have depth 1. Each level of nesting adds 1.
 */
async function getThreadDepth(
  db: PostgresJsDatabase,
  debateId: string,
): Promise<number> {
  let depth = 0;
  let currentId: string | null = debateId;
  while (currentId) {
    depth++;
    const rows = await db
      .select({ parentDebateId: debates.parentDebateId })
      .from(debates)
      .where(eq(debates.id, currentId))
      .limit(1);
    currentId = rows[0]?.parentDebateId ?? null;
  }
  return depth;
}

const debateListQuerySchema = paginationQuerySchema.extend({
  stance: z.enum(["support", "oppose", "modify", "question"]).optional(),
});

// GET /api/v1/solutions/:solutionId/debates — List debates for a solution
debatesRoutes.get("/", async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const rawSolutionId = c.req.param("solutionId");
  if (!rawSolutionId) {
    throw new AppError("VALIDATION_ERROR", "Missing solutionId parameter");
  }
  const solutionId = parseUuidParam(rawSolutionId, "solutionId");

  // Verify solution exists
  const [solution] = await db
    .select({ id: solutions.id })
    .from(solutions)
    .where(eq(solutions.id, solutionId))
    .limit(1);

  if (!solution) {
    throw new AppError("NOT_FOUND", "Solution not found");
  }

  const query = c.req.query();
  const parsed = debateListQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid query parameters", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { limit, cursor, stance } = parsed.data;
  const agent = c.get("agent");

  const conditions = [eq(debates.solutionId, solutionId)];

  // Public: approved only. Owning agent: also sees own pending
  if (!agent) {
    conditions.push(eq(debates.guardrailStatus, "approved"));
  }

  if (stance) {
    conditions.push(eq(debates.stance, stance));
  }

  if (cursor) {
    conditions.push(lt(debates.createdAt, new Date(cursor)));
  }

  const rows = await db
    .select({
      id: debates.id,
      solutionId: debates.solutionId,
      agentId: debates.agentId,
      parentDebateId: debates.parentDebateId,
      stance: debates.stance,
      content: debates.content,
      evidenceLinks: debates.evidenceLinks,
      guardrailStatus: debates.guardrailStatus,
      upvotes: debates.upvotes,
      createdAt: debates.createdAt,
      agentUsername: agents.username,
      agentDisplayName: agents.displayName,
    })
    .from(debates)
    .leftJoin(agents, eq(debates.agentId, agents.id))
    .where(and(...conditions))
    .orderBy(desc(debates.createdAt))
    .limit(limit + 1);

  // Filter: for authenticated agents, show only approved + own pending
  const filtered = agent
    ? rows.filter(r => r.guardrailStatus === "approved" || r.agentId === agent.id)
    : rows;

  const hasMore = filtered.length > limit;
  const items = hasMore ? filtered.slice(0, limit) : filtered;
  const lastItem = items[items.length - 1];
  const nextCursor = hasMore && lastItem ? lastItem.createdAt.toISOString() : null;

  const data = items.map(r => ({
    id: r.id,
    solutionId: r.solutionId,
    agentId: r.agentId,
    parentDebateId: r.parentDebateId,
    stance: r.stance,
    content: r.content,
    evidenceLinks: r.evidenceLinks,
    guardrailStatus: r.guardrailStatus,
    upvotes: r.upvotes,
    createdAt: r.createdAt,
    agent: {
      id: r.agentId,
      username: r.agentUsername,
      displayName: r.agentDisplayName,
    },
  }));

  return c.json({
    ok: true,
    data,
    meta: {
      hasMore,
      nextCursor,
      count: data.length,
    },
    requestId: c.get("requestId"),
  });
});

// POST /api/v1/solutions/:solutionId/debates — Create a debate
debatesRoutes.post("/", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const rawSolutionId = c.req.param("solutionId");
  if (!rawSolutionId) {
    throw new AppError("VALIDATION_ERROR", "Missing solutionId parameter");
  }
  const solutionId = parseUuidParam(rawSolutionId, "solutionId");
  const agent = c.get("agent")!;

  const body = await c.req.json();
  const parsed = createDebateSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid request body", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { parentDebateId, stance, content, evidenceLinks } = parsed.data;

  // Verify solution exists
  const [solution] = await db
    .select({ id: solutions.id, status: solutions.status })
    .from(solutions)
    .where(eq(solutions.id, solutionId))
    .limit(1);

  if (!solution) {
    throw new AppError("NOT_FOUND", "Solution not found");
  }

  // Validate parent debate if provided
  if (parentDebateId) {
    const [parent] = await db
      .select({ id: debates.id, solutionId: debates.solutionId })
      .from(debates)
      .where(eq(debates.id, parentDebateId))
      .limit(1);

    if (!parent) {
      throw new AppError("VALIDATION_ERROR", "Parent debate not found", { status: 422 });
    }

    if (parent.solutionId !== solutionId) {
      throw new AppError("VALIDATION_ERROR", "Parent debate belongs to a different solution", { status: 422 });
    }

    // Check thread depth
    const depth = await getThreadDepth(db, parentDebateId);
    if (depth >= MAX_THREAD_DEPTH) {
      throw new AppError("VALIDATION_ERROR", `Thread depth cannot exceed ${MAX_THREAD_DEPTH}`, { status: 422 });
    }
  }

  const redis = getRedis();

  const result = await db.transaction(async (tx) => {
    const [debate] = await tx
      .insert(debates)
      .values({
        solutionId,
        agentId: agent.id,
        parentDebateId: parentDebateId ?? null,
        stance,
        content,
        evidenceLinks: evidenceLinks ?? [],
        guardrailStatus: "pending",
      })
      .returning();

    // Sprint 12: Deduct submission cost
    await deductSubmissionCost(db, redis, agent.id, "debate", debate!.id);

    // Increment solution's agentDebateCount
    await tx
      .update(solutions)
      .set({ agentDebateCount: sql`${solutions.agentDebateCount} + 1` })
      .where(eq(solutions.id, solutionId));

    // Transition solution status to "debating" on first debate
    if (solution.status === "proposed") {
      await tx
        .update(solutions)
        .set({ status: "debating" })
        .where(eq(solutions.id, solutionId));
    }

    // Enqueue for guardrail evaluation
    const evaluationId = await enqueueForEvaluation(tx, {
      contentId: debate!.id,
      contentType: "debate",
      content: JSON.stringify({
        stance,
        content,
      }),
      agentId: agent.id,
    });

    return { ...debate!, guardrailEvaluationId: evaluationId };
  });

  return c.json({
    ok: true,
    data: result,
    requestId: c.get("requestId"),
  }, 201);
});
