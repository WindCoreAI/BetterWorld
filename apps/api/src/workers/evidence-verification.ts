/**
 * Evidence Verification Worker (Sprint 8: Evidence Verification)
 *
 * BullMQ worker on "evidence-ai-verify" queue.
 * Uses Claude Sonnet Vision to analyze evidence and route based on confidence.
 */

import Anthropic from "@anthropic-ai/sdk";
import { evidence, missions, verificationAuditLog } from "@betterworld/db";
import { QUEUE_NAMES } from "@betterworld/shared";
import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import Redis from "ioredis";
import pino from "pino";

import { initDb, getDb, getRedis } from "../lib/container.js";
import { selectPeerReviewers } from "../lib/peer-assignment.js";
import { distributeEvidenceReward } from "../lib/reward-helpers.js";
import { broadcast } from "../ws/feed.js";

const logger = pino({ name: "evidence-verification-worker" });

const SONNET_MODEL = process.env.CLAUDE_SONNET_MODEL ?? "claude-sonnet-4-5-20250929";
const COST_PER_IMAGE_CENTS = 5; // ~$0.05/image

export interface VerifyJobData {
  evidenceId: string;
}

interface VerifyToolOutput {
  relevanceScore: number;
  gpsPlausibility: number;
  timestampPlausibility: number;
  authenticityScore: number;
  requirementChecklist: Array<{ requirement: string; met: boolean }>;
  overallConfidence: number;
  reasoning: string;
}

const VERIFY_TOOL: Anthropic.Tool = {
  name: "verify_evidence",
  description: "Verify evidence submission for mission completion",
  input_schema: {
    type: "object" as const,
    properties: {
      relevanceScore: { type: "number", description: "How relevant the evidence is to the mission (0-1)" },
      gpsPlausibility: { type: "number", description: "GPS location match plausibility (0-1)" },
      timestampPlausibility: { type: "number", description: "Timestamp plausibility (0-1)" },
      authenticityScore: { type: "number", description: "Authenticity score - not AI generated or stock (0-1)" },
      requirementChecklist: {
        type: "array",
        items: {
          type: "object",
          properties: {
            requirement: { type: "string" },
            met: { type: "boolean" },
          },
          required: ["requirement", "met"],
        },
      },
      overallConfidence: { type: "number", description: "Overall verification confidence (0-1)" },
      reasoning: { type: "string", description: "Detailed reasoning for the score" },
    },
    required: ["relevanceScore", "gpsPlausibility", "timestampPlausibility", "authenticityScore", "requirementChecklist", "overallConfidence", "reasoning"],
  },
};

/**
 * Check daily vision budget (check-then-increment pattern).
 */
async function checkVisionBudget(redis: Redis | null): Promise<boolean> {
  if (!redis) return true;

  const budgetCents = parseInt(process.env.VISION_DAILY_BUDGET_CENTS || "3700", 10);
  const date = new Date().toISOString().slice(0, 10);
  const key = `cost:daily:vision:evidence:${date}`;

  const current = await redis.get(key);
  const totalCents = current ? parseInt(current, 10) : 0;

  return totalCents < budgetCents;
}

async function incrementVisionCost(redis: Redis | null): Promise<void> {
  if (!redis) return;

  const date = new Date().toISOString().slice(0, 10);
  const key = `cost:daily:vision:evidence:${date}`;

  const count = await redis.incrby(key, COST_PER_IMAGE_CENTS);
  if (count === COST_PER_IMAGE_CENTS) {
    await redis.expire(key, 48 * 3600);
  }
}


/**
 * Route evidence based on AI verification score.
 */
async function routeByScore(
  db: PostgresJsDatabase,
  evidenceId: string,
  evidenceRow: { missionId: string; submittedByHumanId: string },
  score: number,
  output: VerifyToolOutput,
): Promise<void> {
  if (score >= 0.80) {
    await db.update(evidence).set({
      verificationStage: "verified",
      finalVerdict: "verified",
      finalConfidence: String(score.toFixed(2)),
      updatedAt: new Date(),
    }).where(eq(evidence.id, evidenceId));

    try { await distributeEvidenceReward(db, evidenceId); } catch { /* Non-fatal */ }

    await db.insert(verificationAuditLog).values({
      evidenceId, decisionSource: "ai", decision: "approved",
      score: String(score.toFixed(2)), reasoning: output.reasoning,
      metadata: { autoApprove: true, model: SONNET_MODEL },
    });

    broadcast({ type: "evidence:verified", data: { evidenceId, missionId: evidenceRow.missionId, humanId: evidenceRow.submittedByHumanId, finalConfidence: score } });
    logger.info({ evidenceId, score }, "Evidence auto-approved by AI");
  } else if (score < 0.50) {
    await db.update(evidence).set({
      verificationStage: "rejected",
      finalVerdict: "rejected",
      finalConfidence: String(score.toFixed(2)),
      updatedAt: new Date(),
    }).where(eq(evidence.id, evidenceId));

    await db.insert(verificationAuditLog).values({
      evidenceId, decisionSource: "ai", decision: "rejected",
      score: String(score.toFixed(2)), reasoning: output.reasoning,
      metadata: { autoReject: true, model: SONNET_MODEL },
    });

    broadcast({ type: "evidence:rejected", data: { evidenceId, missionId: evidenceRow.missionId, humanId: evidenceRow.submittedByHumanId, reason: output.reasoning } });
    logger.info({ evidenceId, score }, "Evidence auto-rejected by AI");
  } else {
    await routeToPeerReview(db, evidenceId, evidenceRow.submittedByHumanId, output.reasoning);

    await db.insert(verificationAuditLog).values({
      evidenceId, decisionSource: "ai", decision: "escalated",
      score: String(score.toFixed(2)), reasoning: output.reasoning,
      metadata: { routedToPeerReview: true, model: SONNET_MODEL },
    });

    logger.info({ evidenceId, score }, "Evidence routed to peer review");
  }
}

/**
 * Process evidence verification job.
 */
export async function processEvidenceVerification(
  dbOverride?: PostgresJsDatabase | null,
  redisOverride?: Redis | null,
  evidenceId?: string,
): Promise<void> {
  const db = dbOverride ?? getDb();
  if (!db) throw new Error("Database not initialized");

  const redis = redisOverride ?? getRedis();

  if (!evidenceId) return;

  // Fetch evidence + mission
  const [evidenceRow] = await db
    .select({
      id: evidence.id,
      missionId: evidence.missionId,
      contentUrl: evidence.contentUrl,
      evidenceType: evidence.evidenceType,
      latitude: evidence.latitude,
      longitude: evidence.longitude,
      capturedAt: evidence.capturedAt,
      submittedByHumanId: evidence.submittedByHumanId,
    })
    .from(evidence)
    .where(eq(evidence.id, evidenceId))
    .limit(1);

  if (!evidenceRow) {
    logger.warn({ evidenceId }, "Evidence not found for verification");
    return;
  }

  const [mission] = await db
    .select({
      title: missions.title,
      description: missions.description,
      evidenceRequired: missions.evidenceRequired,
      requiredLatitude: missions.requiredLatitude,
      requiredLongitude: missions.requiredLongitude,
    })
    .from(missions)
    .where(eq(missions.id, evidenceRow.missionId))
    .limit(1);

  if (!mission) {
    logger.warn({ missionId: evidenceRow.missionId }, "Mission not found for verification");
    return;
  }

  // Update stage to ai_processing
  await db
    .update(evidence)
    .set({ verificationStage: "ai_processing", updatedAt: new Date() })
    .where(eq(evidence.id, evidenceId));

  // Check budget
  const budgetAvailable = await checkVisionBudget(redis);
  if (!budgetAvailable) {
    logger.warn({ evidenceId }, "Vision budget exceeded, routing to peer review");
    await routeToPeerReview(db, evidenceId, evidenceRow.submittedByHumanId, "Budget exceeded");
    return;
  }

  try {
    // Call Claude Vision
    const anthropic = new Anthropic();

    const systemPrompt = `You are an evidence verification assistant. Analyze the submitted evidence for a social good mission. Be thorough but fair.`;

    const userMessage = `Mission: "${mission.title}"
Description: ${mission.description}
Evidence requirements: ${JSON.stringify(mission.evidenceRequired)}
Evidence type: ${evidenceRow.evidenceType}
GPS coordinates: ${evidenceRow.latitude}, ${evidenceRow.longitude}
Mission location: ${mission.requiredLatitude}, ${mission.requiredLongitude}
Captured at: ${evidenceRow.capturedAt?.toISOString() ?? "unknown"}

Please verify this evidence submission using the verify_evidence tool.`;

    const response = await anthropic.messages.create({
      model: SONNET_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      tools: [VERIFY_TOOL],
      tool_choice: { type: "tool", name: "verify_evidence" },
      messages: [{ role: "user", content: userMessage }],
    });

    // Increment cost after successful API call
    await incrementVisionCost(redis);

    // Parse tool_use response
    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      logger.warn({ evidenceId }, "No tool_use in response, routing to peer review");
      await routeToPeerReview(db, evidenceId, evidenceRow.submittedByHumanId, "AI response parsing failed");
      return;
    }

    const output = toolUse.input as VerifyToolOutput;
    const score = Math.max(0, Math.min(1, output.overallConfidence));

    // Update evidence with AI score
    await db
      .update(evidence)
      .set({
        aiVerificationScore: String(score.toFixed(2)),
        aiVerificationReasoning: output.reasoning,
        updatedAt: new Date(),
      })
      .where(eq(evidence.id, evidenceId));

    // Route based on score
    await routeByScore(db, evidenceId, evidenceRow, score, output);
  } catch (error) {
    logger.error(
      { evidenceId, error: error instanceof Error ? error.message : "Unknown" },
      "AI verification failed",
    );
    // Fallback to peer review on error
    await routeToPeerReview(db, evidenceId, evidenceRow.submittedByHumanId, "AI verification error");
    throw error; // Re-throw for BullMQ retry
  }
}

async function routeToPeerReview(
  db: PostgresJsDatabase,
  evidenceId: string,
  submitterHumanId: string,
  _reason: string,
): Promise<void> {
  await db
    .update(evidence)
    .set({
      verificationStage: "peer_review",
      updatedAt: new Date(),
    })
    .where(eq(evidence.id, evidenceId));

  // Attempt to select peer reviewers (best effort)
  try {
    await selectPeerReviewers(db, submitterHumanId);
  } catch {
    // Non-fatal: reviewers will pick up from queue
  }
}

// --- Worker initialization ---

export function createEvidenceVerificationWorker(): Worker<VerifyJobData> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("REDIS_URL environment variable is required");

  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL environment variable is required");
  initDb(databaseUrl);

  const worker = new Worker<VerifyJobData>(
    QUEUE_NAMES.EVIDENCE_AI_VERIFY,
    async (job: Job<VerifyJobData>) => {
      await processEvidenceVerification(null, null, job.data.evidenceId);
    },
    {
      connection,
      concurrency: 3,
    },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Evidence verification job completed");
  });

  worker.on("failed", (job, err) => {
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 3;

    if (attemptsMade >= maxAttempts) {
      logger.error(
        { jobId: job?.id, attemptsMade, error: err.message },
        "DEAD LETTER: Evidence verification job exhausted all retries",
      );
    } else {
      logger.warn(
        { jobId: job?.id, attemptsMade, error: err.message },
        "Evidence verification job failed, will retry",
      );
    }
  });

  worker.on("error", (err) => {
    logger.error({ error: err.message }, "Evidence verification worker error");
  });

  const shutdown = async () => {
    logger.info("Shutting down evidence verification worker...");
    await worker.close();
    await connection.quit();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info("Evidence verification worker started");
  return worker;
}

// Start worker if running as standalone script
if (process.argv[1]?.includes("evidence-verification")) {
  createEvidenceVerificationWorker();
}
