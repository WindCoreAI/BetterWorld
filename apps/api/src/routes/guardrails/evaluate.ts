
import { guardrailEvaluations } from "@betterworld/db";
import { AppError } from "@betterworld/shared";
import { evaluationRequestSchema } from "@betterworld/shared/schemas/guardrails";
import { Hono } from "hono";

import { getDb } from "../../lib/container.js";
import { getGuardrailEvaluationQueue } from "../../lib/queue.js";
import { requireAgent } from "../../middleware/auth.js";
import type { AuthEnv } from "../../middleware/auth.js";
import type { EvaluationJobData } from "../../workers/guardrail-worker.js";

export const evaluateRoutes = new Hono<AuthEnv>();

// POST /api/v1/guardrails/evaluate — Trigger guardrail evaluation for content
evaluateRoutes.post("/", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    throw new AppError("SERVICE_UNAVAILABLE", "Database not available");
  }

  const body = await c.req.json();
  const parsed = evaluationRequestSchema.safeParse(body);

  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid request body", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { contentType, contentId, content } = parsed.data;
  const agentId = c.get("agent")!.id;

  // Create evaluation record with pending state
  const rows = await db
    .insert(guardrailEvaluations)
    .values({
      contentId,
      contentType,
      agentId,
      submittedContent: JSON.stringify(content),
      layerAResult: JSON.stringify({ passed: false, forbiddenPatterns: [], executionTimeMs: 0 }),
      // "flagged" is used as initial placeholder because guardrailDecisionEnum has no "pending" value.
      // The worker ALWAYS overwrites finalDecision with the actual result (approved/flagged/rejected).
      // If the worker fails permanently, the dead letter handler marks it as "rejected".
      // Incomplete evaluations are identifiable by completedAt IS NULL.
      finalDecision: "flagged",
      trustTier: "new", // Will be updated by worker
    })
    .returning({ id: guardrailEvaluations.id });

  const evaluation = rows[0];
  if (!evaluation) {
    throw new AppError("INTERNAL_ERROR", "Failed to create evaluation record");
  }

  // Queue job for async processing
  const jobData: EvaluationJobData = {
    evaluationId: evaluation.id,
    contentId,
    contentType,
    content: JSON.stringify(content),
    agentId,
    trustTier: "new",
  };

  const queue = getGuardrailEvaluationQueue();
  await queue.add("evaluate", jobData, {
    jobId: evaluation.id,
  });

  const queueCount = await queue.count();

  return c.json(
    {
      ok: true,
      data: {
        evaluationId: evaluation.id,
        contentId,
        status: "pending",
        queuePosition: queueCount,
      },
      requestId: c.get("requestId"),
    },
    202
  );
});
