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
import { updateReputation } from "../lib/reputation-engine.js";
import { distributeEvidenceReward } from "../lib/reward-helpers.js";
import { getSignedUrl } from "../lib/storage.js";
import { recordActivity } from "../lib/streak-tracker.js";
import { broadcast } from "../ws/feed.js";

const logger = pino({ name: "evidence-verification-worker" });

const SONNET_MODEL = process.env.CLAUDE_SONNET_MODEL ?? "claude-sonnet-4-5-20250929";
const COST_PER_IMAGE_CENTS = 5; // ~$0.05/image

export interface VerifyJobData {
  evidenceId: string;
  pairId?: string;
  afterEvidenceId?: string;
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

    // Update reputation and streak after successful verification
    try {
      await updateReputation(db, evidenceRow.submittedByHumanId, "evidence_verified", evidenceId, "evidence");
      await recordActivity(db, evidenceRow.submittedByHumanId);
    } catch { /* Non-fatal: reputation/streak update failure shouldn't block verification */ }

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
 * Fetch evidence and its associated mission from the database.
 */
async function fetchEvidenceAndMission(db: PostgresJsDatabase, evidenceId: string) {
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

  if (!evidenceRow) return null;

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

  if (!mission) return null;

  return { evidenceRow, mission };
}

/**
 * Build Claude Vision content blocks (image + text prompt).
 */
async function buildVisionContentBlocks(
  evidenceRow: { evidenceType: string | null; contentUrl: string | null; latitude: string | null; longitude: string | null; capturedAt: Date | null; id: string },
  mission: { title: string; description: string; evidenceRequired: unknown; requiredLatitude: string | null; requiredLongitude: string | null },
): Promise<Anthropic.MessageCreateParams["messages"][0]["content"]> {
  const contentBlocks: Anthropic.MessageCreateParams["messages"][0]["content"] = [];
  const isImageEvidence = ["photo", "image"].includes(evidenceRow.evidenceType ?? "");

  if (isImageEvidence && evidenceRow.contentUrl) {
    try {
      const imageUrl = await getSignedUrl(evidenceRow.contentUrl, 600);
      const imageResponse = await fetch(imageUrl);
      if (imageResponse.ok) {
        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
        const base64Data = imageBuffer.toString("base64");
        const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
        const mediaType = contentType as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
        contentBlocks.push({
          type: "image",
          source: { type: "base64", media_type: mediaType, data: base64Data },
        });
        logger.info({ evidenceId: evidenceRow.id }, "Image included in AI verification request");
      } else {
        logger.warn({ evidenceId: evidenceRow.id, status: imageResponse.status }, "Failed to fetch image, using metadata only");
      }
    } catch (err) {
      logger.warn({ evidenceId: evidenceRow.id, error: err instanceof Error ? err.message : "Unknown" }, "Error fetching image, using metadata only");
    }
  }

  contentBlocks.push({
    type: "text",
    text: `Mission: "${mission.title}"
Description: ${mission.description}
Evidence requirements: ${JSON.stringify(mission.evidenceRequired)}
Evidence type: ${evidenceRow.evidenceType}
GPS coordinates: ${evidenceRow.latitude}, ${evidenceRow.longitude}
Mission location: ${mission.requiredLatitude}, ${mission.requiredLongitude}
Captured at: ${evidenceRow.capturedAt?.toISOString() ?? "unknown"}

Please verify this evidence submission using the verify_evidence tool.`,
  });

  return contentBlocks;
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

  const result = await fetchEvidenceAndMission(db, evidenceId);
  if (!result) {
    logger.warn({ evidenceId }, "Evidence or mission not found for verification");
    return;
  }

  const { evidenceRow, mission } = result;

  await db
    .update(evidence)
    .set({ verificationStage: "ai_processing", updatedAt: new Date() })
    .where(eq(evidence.id, evidenceId));

  const budgetAvailable = await checkVisionBudget(redis);
  if (!budgetAvailable) {
    logger.warn({ evidenceId }, "Vision budget exceeded, routing to peer review");
    await routeToPeerReview(db, evidenceId, evidenceRow.submittedByHumanId, "Budget exceeded");
    return;
  }

  try {
    const anthropic = new Anthropic();
    const contentBlocks = await buildVisionContentBlocks(evidenceRow, mission);

    const response = await anthropic.messages.create({
      model: SONNET_MODEL,
      max_tokens: 1024,
      system: "You are an evidence verification assistant. Analyze the submitted evidence for a social good mission. Be thorough but fair.",
      tools: [VERIFY_TOOL],
      tool_choice: { type: "tool", name: "verify_evidence" },
      messages: [{ role: "user", content: contentBlocks }],
    });

    await incrementVisionCost(redis);

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      logger.warn({ evidenceId }, "No tool_use in response, routing to peer review");
      await routeToPeerReview(db, evidenceId, evidenceRow.submittedByHumanId, "AI response parsing failed");
      return;
    }

    const output = toolUse.input as VerifyToolOutput;
    const score = Math.max(0, Math.min(1, output.overallConfidence));

    await db
      .update(evidence)
      .set({
        aiVerificationScore: String(score.toFixed(2)),
        aiVerificationReasoning: output.reasoning,
        updatedAt: new Date(),
      })
      .where(eq(evidence.id, evidenceId));

    await routeByScore(db, evidenceId, evidenceRow, score, output);
  } catch (error) {
    logger.error(
      { evidenceId, error: error instanceof Error ? error.message : "Unknown" },
      "AI verification failed",
    );
    await routeToPeerReview(db, evidenceId, evidenceRow.submittedByHumanId, "AI verification error");
    throw error;
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

// --- Before/After Pair Comparison (Sprint 12 — T057) ---

// eslint-disable-next-line complexity
async function processBeforeAfterComparison(
  dbOverride?: PostgresJsDatabase | null,
  redisOverride?: Redis | null,
  pairId?: string,
): Promise<void> {
  const db = dbOverride ?? getDb();
  if (!db) throw new Error("Database not initialized");

  const redis = redisOverride ?? getRedis();
  if (!pairId) return;

  // Fetch both before and after photos
  const pairRows = await db
    .select({
      id: evidence.id,
      missionId: evidence.missionId,
      contentUrl: evidence.contentUrl,
      photoSequenceType: evidence.photoSequenceType,
      submittedByHumanId: evidence.submittedByHumanId,
      latitude: evidence.latitude,
      longitude: evidence.longitude,
    })
    .from(evidence)
    .where(eq(evidence.pairId, pairId));

  const beforeRow = pairRows.find((r) => r.photoSequenceType === "before");
  const afterRow = pairRows.find((r) => r.photoSequenceType === "after");

  if (!beforeRow || !afterRow) {
    logger.warn({ pairId }, "Before/after pair incomplete, skipping comparison");
    return;
  }

  // Check pHash similarity — flag if before/after are too similar (possible fraud)
  try {
    const { calculatePhash, hammingDistance } = await import("../lib/phash.js");
    if (beforeRow.contentUrl && afterRow.contentUrl) {
      const beforeUrl = await getSignedUrl(beforeRow.contentUrl, 600);
      const afterUrl = await getSignedUrl(afterRow.contentUrl, 600);
      const [beforeResp, afterResp] = await Promise.all([
        fetch(beforeUrl), fetch(afterUrl),
      ]);
      if (beforeResp.ok && afterResp.ok) {
        const [beforeBuf, afterBuf] = await Promise.all([
          Buffer.from(await beforeResp.arrayBuffer()),
          Buffer.from(await afterResp.arrayBuffer()),
        ]);
        const [beforeHash, afterHash] = await Promise.all([
          calculatePhash(beforeBuf), calculatePhash(afterBuf),
        ]);
        const distance = hammingDistance(beforeHash, afterHash);
        if (distance < 5) {
          logger.warn({ pairId, distance }, "Before/after photos too similar — flagging as potential fraud");
          await db.update(evidence).set({
            verificationStage: "peer_review",
            aiVerificationReasoning: `Before/after photos suspiciously similar (hamming distance: ${distance}). Flagged for peer review.`,
            updatedAt: new Date(),
          }).where(eq(evidence.id, afterRow.id));
          return;
        }
      }
    }
  } catch (err) {
    logger.warn({ pairId, error: (err as Error).message }, "pHash comparison failed, continuing with AI comparison");
  }

  // Budget check
  const budgetAvailable = await checkVisionBudget(redis);
  if (!budgetAvailable) {
    logger.warn({ pairId }, "Vision budget exceeded for pair comparison, routing to peer review");
    await routeToPeerReview(db, afterRow.id, afterRow.submittedByHumanId, "Budget exceeded");
    return;
  }

  // AI comparison via before/after service
  try {
    const { comparePhotos } = await import("../services/before-after.service.js");

    const [mission] = await db
      .select({ title: missions.title, description: missions.description })
      .from(missions)
      .where(eq(missions.id, beforeRow.missionId))
      .limit(1);

    const missionContext = mission
      ? `${mission.title}: ${mission.description}`
      : "Social good mission";

    // Fetch images as base64
    let beforeBase64 = "";
    let afterBase64 = "";
    let beforeMediaType = "image/jpeg";
    let afterMediaType = "image/jpeg";

    if (beforeRow.contentUrl) {
      const url = await getSignedUrl(beforeRow.contentUrl, 600);
      const resp = await fetch(url);
      if (resp.ok) {
        beforeBase64 = Buffer.from(await resp.arrayBuffer()).toString("base64");
        beforeMediaType = resp.headers.get("content-type") || "image/jpeg";
      }
    }
    if (afterRow.contentUrl) {
      const url = await getSignedUrl(afterRow.contentUrl, 600);
      const resp = await fetch(url);
      if (resp.ok) {
        afterBase64 = Buffer.from(await resp.arrayBuffer()).toString("base64");
        afterMediaType = resp.headers.get("content-type") || "image/jpeg";
      }
    }

    if (!beforeBase64 || !afterBase64) {
      logger.warn({ pairId }, "Could not fetch images for comparison, routing to peer review");
      await routeToPeerReview(db, afterRow.id, afterRow.submittedByHumanId, "Image fetch failed");
      return;
    }

    await incrementVisionCost(redis);

    const result = await comparePhotos(
      beforeBase64, beforeMediaType,
      afterBase64, afterMediaType,
      missionContext,
    );

    // Update both evidence records with comparison results
    const score = result.confidence;
    await db.update(evidence).set({
      aiVerificationScore: String(score.toFixed(2)),
      aiVerificationReasoning: `Before/after comparison: ${result.reasoning} (improvement: ${(result.improvementScore * 100).toFixed(0)}%)`,
      updatedAt: new Date(),
    }).where(eq(evidence.id, afterRow.id));

    // Route based on decision
    await routeByScore(db, afterRow.id, afterRow, score, {
      relevanceScore: result.improvementScore,
      gpsPlausibility: 1,
      timestampPlausibility: 1,
      authenticityScore: result.confidence,
      requirementChecklist: [],
      overallConfidence: result.confidence,
      reasoning: result.reasoning,
    });

    logger.info(
      { pairId, decision: result.decision, improvementScore: result.improvementScore },
      "Before/after pair comparison completed",
    );
  } catch (err) {
    logger.error(
      { pairId, error: (err as Error).message },
      "Before/after comparison failed",
    );
    await routeToPeerReview(db, afterRow.id, afterRow.submittedByHumanId, "Comparison error");
    throw err;
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
      if (job.name === "compare-pair" && job.data.pairId) {
        await processBeforeAfterComparison(null, null, job.data.pairId);
      } else {
        await processEvidenceVerification(null, null, job.data.evidenceId);
      }
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
