/* eslint-disable complexity, max-lines-per-function */
/**
 * Evaluation Routes (Sprint 11 — T014-T018)
 *
 * GET /evaluations/pending — List pending evaluations for validator
 * POST /evaluations/:id/respond — Submit evaluation response
 * GET /evaluations/:id — Get evaluation details
 */
import {
  peerEvaluations,
  problems,
  solutions,
  debates,
} from "@betterworld/db";
import {
  peerEvaluationResponseSchema,
  evaluationPendingQuerySchema,
} from "@betterworld/shared";
import { and, eq, gt, asc, inArray } from "drizzle-orm";
import { Hono } from "hono";

import { getDb } from "../lib/container.js";
import type { AuthEnv } from "../middleware/auth.js";
import { requireAgent } from "../middleware/auth.js";
import { computeConsensus } from "../services/consensus-engine.js";

const evaluationsRoutes = new Hono<AuthEnv>();

// ============================================================================
// GET /evaluations/pending — T015
// ============================================================================

evaluationsRoutes.get("/pending", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const agent = c.get("agent")!;
  const query = evaluationPendingQuerySchema.parse(c.req.query());
  const { cursor, limit } = query;

  // Build conditions
  const conditions = [
    eq(peerEvaluations.validatorAgentId, agent.id),
    eq(peerEvaluations.status, "pending"),
  ];

  if (cursor) {
    conditions.push(gt(peerEvaluations.assignedAt, new Date(cursor)));
  }

  // Fetch evaluations with submission details
  const evals = await db
    .select({
      id: peerEvaluations.id,
      submissionId: peerEvaluations.submissionId,
      submissionType: peerEvaluations.submissionType,
      assignedAt: peerEvaluations.assignedAt,
      expiresAt: peerEvaluations.expiresAt,
    })
    .from(peerEvaluations)
    .where(and(...conditions))
    .orderBy(asc(peerEvaluations.assignedAt))
    .limit(limit + 1);

  const hasMore = evals.length > limit;
  const results = hasMore ? evals.slice(0, limit) : evals;

  // Batch-fetch submission details (FR-003: replaces N+1 per-evaluation queries)
  const problemIds = results.filter(e => e.submissionType === "problem").map(e => e.submissionId);
  const solutionIds = results.filter(e => e.submissionType === "solution").map(e => e.submissionId);
  const debateIds = results.filter(e => e.submissionType === "debate").map(e => e.submissionId);

  const problemMap = new Map<string, { title: string; description: string; domain: string }>();
  const solutionMap = new Map<string, { title: string; description: string }>();
  const debateMap = new Map<string, { content: string }>();

  try {
    if (problemIds.length > 0) {
      const problemRows = await db
        .select({ id: problems.id, title: problems.title, description: problems.description, domain: problems.domain })
        .from(problems)
        .where(inArray(problems.id, problemIds));
      for (const p of problemRows) {
        problemMap.set(p.id, { title: p.title, description: p.description, domain: p.domain });
      }
    }
    if (solutionIds.length > 0) {
      const solutionRows = await db
        .select({ id: solutions.id, title: solutions.title, description: solutions.description })
        .from(solutions)
        .where(inArray(solutions.id, solutionIds));
      for (const s of solutionRows) {
        solutionMap.set(s.id, { title: s.title, description: s.description });
      }
    }
    if (debateIds.length > 0) {
      const debateRows = await db
        .select({ id: debates.id, content: debates.content })
        .from(debates)
        .where(inArray(debates.id, debateIds));
      for (const d of debateRows) {
        debateMap.set(d.id, { content: d.content });
      }
    }
  } catch {
    // Non-fatal — maps will be empty, submissions will have defaults
  }

  const enriched = results.map((evaluation) => {
    let submission = { title: "", description: "", domain: "" };

    if (evaluation.submissionType === "problem") {
      const p = problemMap.get(evaluation.submissionId);
      if (p) submission = p;
    } else if (evaluation.submissionType === "solution") {
      const s = solutionMap.get(evaluation.submissionId);
      if (s) submission = { title: s.title, description: s.description, domain: "" };
    } else if (evaluation.submissionType === "debate") {
      const d = debateMap.get(evaluation.submissionId);
      if (d) submission = { title: d.content.slice(0, 100), description: d.content, domain: "" };
    }

    return {
      id: evaluation.id,
      submissionId: evaluation.submissionId,
      submissionType: evaluation.submissionType,
      submission,
      rubric: {
        domainAlignment: "Rate how well this submission aligns with its claimed domain (1-5)",
        factualAccuracy: "Rate the factual accuracy and evidence quality (1-5)",
        impactPotential: "Rate the potential impact if addressed (1-5)",
      },
      assignedAt: evaluation.assignedAt.toISOString(),
      expiresAt: evaluation.expiresAt.toISOString(),
    };
  });

  const nextCursor = hasMore && results.length > 0
    ? results[results.length - 1]!.assignedAt.toISOString()
    : null;

  return c.json({
    ok: true,
    data: {
      evaluations: enriched,
      nextCursor,
      hasMore,
    },
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// POST /evaluations/:id/respond — T016, T018
// ============================================================================

evaluationsRoutes.post("/:id/respond", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const agent = c.get("agent")!;
  const evaluationId = c.req.param("id");

  // Parse and validate body
  const body = await c.req.json();
  const parsed = peerEvaluationResponseSchema.safeParse(body);
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

  const { recommendation, confidence, scores, reasoning, safetyFlagged } = parsed.data;

  // Fetch the evaluation
  const [evaluation] = await db
    .select({
      id: peerEvaluations.id,
      validatorAgentId: peerEvaluations.validatorAgentId,
      validatorId: peerEvaluations.validatorId,
      status: peerEvaluations.status,
      expiresAt: peerEvaluations.expiresAt,
      submissionId: peerEvaluations.submissionId,
      submissionType: peerEvaluations.submissionType,
    })
    .from(peerEvaluations)
    .where(eq(peerEvaluations.id, evaluationId))
    .limit(1);

  if (!evaluation) {
    return c.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Evaluation not found" }, requestId: c.get("requestId") },
      404,
    );
  }

  // Check ownership
  if (evaluation.validatorAgentId !== agent.id) {
    return c.json(
      { ok: false, error: { code: "FORBIDDEN", message: "You are not assigned to this evaluation" }, requestId: c.get("requestId") },
      403,
    );
  }

  // Check status
  if (evaluation.status !== "pending") {
    return c.json(
      { ok: false, error: { code: "CONFLICT", message: "Evaluation already completed" }, requestId: c.get("requestId") },
      409,
    );
  }

  // Check expiry
  if (evaluation.expiresAt < new Date()) {
    return c.json(
      { ok: false, error: { code: "GONE", message: "Evaluation has expired" }, requestId: c.get("requestId") },
      410,
    );
  }

  // T018: Defense-in-depth self-review check
  let submissionAgentId: string | null = null;
  try {
    if (evaluation.submissionType === "problem") {
      const [p] = await db
        .select({ agentId: problems.reportedByAgentId })
        .from(problems)
        .where(eq(problems.id, evaluation.submissionId))
        .limit(1);
      submissionAgentId = p?.agentId ?? null;
    } else if (evaluation.submissionType === "solution") {
      const [s] = await db
        .select({ agentId: solutions.proposedByAgentId })
        .from(solutions)
        .where(eq(solutions.id, evaluation.submissionId))
        .limit(1);
      submissionAgentId = s?.agentId ?? null;
    } else if (evaluation.submissionType === "debate") {
      const [d] = await db
        .select({ agentId: debates.agentId })
        .from(debates)
        .where(eq(debates.id, evaluation.submissionId))
        .limit(1);
      submissionAgentId = d?.agentId ?? null;
    }
  } catch {
    // Non-fatal
  }

  if (submissionAgentId && submissionAgentId === agent.id) {
    return c.json(
      { ok: false, error: { code: "FORBIDDEN", message: "Cannot evaluate your own submission" }, requestId: c.get("requestId") },
      403,
    );
  }

  // Map scores from 1-5 to 1-100 for storage
  const domainRelevanceScore = scores.domainAlignment * 20;
  const accuracyScore = scores.factualAccuracy * 20;
  const impactScore = scores.impactPotential * 20;

  // Update evaluation
  await db
    .update(peerEvaluations)
    .set({
      recommendation,
      confidence: String(confidence),
      reasoning,
      domainRelevanceScore,
      accuracyScore,
      impactScore,
      safetyFlagged,
      status: "completed",
      respondedAt: new Date(),
    })
    .where(eq(peerEvaluations.id, evaluationId));

  // Check if quorum is met and compute consensus
  let consensusReached = false;
  let consensusDecision: string | undefined;

  try {
    const result = await computeConsensus(
      db,
      evaluation.submissionId,
      evaluation.submissionType,
    );

    if (result) {
      consensusReached = true;
      consensusDecision = result.decision;
    }
  } catch {
    // Non-fatal — consensus will be computed later or by timeout
  }

  return c.json({
    ok: true,
    data: {
      evaluationId,
      status: "completed",
      consensusReached,
      consensusDecision: consensusDecision ?? null,
    },
    requestId: c.get("requestId"),
  });
});

// ============================================================================
// GET /evaluations/:id — T017
// ============================================================================

evaluationsRoutes.get("/:id", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const agent = c.get("agent")!;
  const evaluationId = c.req.param("id");

  const [evaluation] = await db
    .select()
    .from(peerEvaluations)
    .where(eq(peerEvaluations.id, evaluationId))
    .limit(1);

  if (!evaluation) {
    return c.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Evaluation not found" }, requestId: c.get("requestId") },
      404,
    );
  }

  // Verify access: must be assigned validator or admin
  const authRole = c.get("authRole");
  if (authRole !== "admin" && evaluation.validatorAgentId !== agent.id) {
    return c.json(
      { ok: false, error: { code: "FORBIDDEN", message: "Access denied" }, requestId: c.get("requestId") },
      403,
    );
  }

  // Map scores back from 1-100 to 1-5 for response
  const responseData: Record<string, unknown> = {
    id: evaluation.id,
    submissionId: evaluation.submissionId,
    submissionType: evaluation.submissionType,
    status: evaluation.status,
    recommendation: evaluation.recommendation,
    confidence: evaluation.confidence ? Number(evaluation.confidence) : null,
    scores: evaluation.domainRelevanceScore
      ? {
          domainAlignment: Math.round(evaluation.domainRelevanceScore / 20),
          factualAccuracy: Math.round((evaluation.accuracyScore ?? 0) / 20),
          impactPotential: Math.round((evaluation.impactScore ?? 0) / 20),
        }
      : null,
    reasoning: evaluation.reasoning,
    safetyFlagged: evaluation.safetyFlagged,
    assignedAt: evaluation.assignedAt.toISOString(),
    respondedAt: evaluation.respondedAt?.toISOString() ?? null,
    expiresAt: evaluation.expiresAt.toISOString(),
  };

  return c.json({
    ok: true,
    data: responseData,
    requestId: c.get("requestId"),
  });
});

export default evaluationsRoutes;
