import { guardrailEvaluations } from "@betterworld/db";
import type { ContentType } from "@betterworld/shared";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { getGuardrailEvaluationQueue } from "./queue.js";
import type { EvaluationJobData } from "../workers/guardrail-worker.js";

export interface EnqueueParams {
  contentId: string;
  contentType: ContentType;
  content: string;
  agentId: string;
}

/**
 * Shared helper to create a guardrail evaluation record and enqueue a BullMQ job.
 * Used by POST endpoints for problems, solutions, and debates.
 * Accepts both PostgresJsDatabase and Drizzle transactions (PgTransaction extends PgDatabase).
 */
export async function enqueueForEvaluation(
  db: PostgresJsDatabase,
  params: EnqueueParams,
): Promise<string> {
  const { contentId, contentType, content, agentId } = params;

  const rows = await db
    .insert(guardrailEvaluations)
    .values({
      contentId,
      contentType,
      agentId,
      submittedContent: content,
      layerAResult: JSON.stringify({ passed: false, forbiddenPatterns: [], executionTimeMs: 0 }),
      finalDecision: "flagged", // Placeholder — worker always overwrites
      trustTier: "new",
    })
    .returning({ id: guardrailEvaluations.id });

  const evaluation = rows[0];
  if (!evaluation) {
    throw new Error("Failed to create guardrail evaluation record");
  }

  const jobData: EvaluationJobData = {
    evaluationId: evaluation.id,
    contentId,
    contentType,
    content,
    agentId,
    trustTier: "new",
  };

  const queue = getGuardrailEvaluationQueue();
  await queue.add("evaluate", jobData, {
    jobId: evaluation.id,
  });

  return evaluation.id;
}
