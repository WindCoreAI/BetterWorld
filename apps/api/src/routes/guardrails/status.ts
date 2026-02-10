import { guardrailEvaluations } from "@betterworld/db";
import { AppError } from "@betterworld/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";


import { getDb } from "../../lib/container.js";
import { parseJsonWithFallback } from "../../lib/json.js";
import { parseUuidParam } from "../../lib/validation.js";
import type { AuthEnv } from "../../middleware/auth.js";
import { requireAgent } from "../../middleware/auth.js";

export const statusRoutes = new Hono<AuthEnv>();

// GET /api/v1/guardrails/status/:id — Check evaluation status
statusRoutes.get("/:id", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const evaluationId = parseUuidParam(c.req.param("id"), "evaluationId");
  const agentId = c.get("agent")!.id;

  const [evaluation] = await db
    .select()
    .from(guardrailEvaluations)
    .where(
      and(
        eq(guardrailEvaluations.id, evaluationId),
        eq(guardrailEvaluations.agentId, agentId),
      ),
    )
    .limit(1);

  if (!evaluation) {
    throw new AppError("NOT_FOUND", "Evaluation not found");
  }

  // If not yet completed, return pending status
  if (!evaluation.completedAt) {
    const elapsedSeconds = Math.round(
      (Date.now() - new Date(evaluation.createdAt).getTime()) / 1000
    );

    return c.json({
      ok: true,
      data: {
        evaluationId: evaluation.id,
        status: "pending",
        startedAt: evaluation.createdAt.toISOString(),
        elapsedSeconds,
      },
      requestId: c.get("requestId"),
    });
  }

  // Completed — return full results
  const layerAResult = parseJsonWithFallback(evaluation.layerAResult, {
    passed: false,
    forbiddenPatterns: [],
    executionTimeMs: 0,
  });
  const layerBResult = evaluation.layerBResult
    ? parseJsonWithFallback(evaluation.layerBResult, null)
    : null;

  return c.json({
    ok: true,
    data: {
      evaluationId: evaluation.id,
      status: "completed",
      finalDecision: evaluation.finalDecision,
      alignmentScore: evaluation.alignmentScore
        ? parseFloat(evaluation.alignmentScore)
        : null,
      alignmentDomain: evaluation.alignmentDomain,
      layerAResult,
      layerBResult,
      cacheHit: evaluation.cacheHit,
      completedAt: evaluation.completedAt.toISOString(),
      evaluationDurationMs: evaluation.evaluationDurationMs,
    },
    requestId: c.get("requestId"),
  });
});
