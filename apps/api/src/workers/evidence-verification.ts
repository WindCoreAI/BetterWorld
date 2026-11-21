/**
 * Evidence Verification Worker (Sprint 8: Evidence Verification)
 *
 * BullMQ worker on "evidence-ai-verify" queue.
 * Uses Claude Vision to analyze evidence and route based on confidence:
 *   >= 0.80  verified (reward paid, claim closed)
 *   <  0.50  rejected (claim reopened for another attempt)
 *   between  human review — peers when the community can supply them, the operator otherwise
 *
 * The AI only ever decides about a photo it was actually shown. No AI key, an
 * exhausted budget, an unreadable file, a non-image file or a provider error
 * all end in human review; none of them leaves evidence waiting on nobody.
 */

import Anthropic from "@anthropic-ai/sdk";
import { evidence, missions } from "@betterworld/db";
import { QUEUE_NAMES, isAiConfigured, visionVerificationResponseSchema } from "@betterworld/shared";
import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import Redis from "ioredis";
import pino from "pino";

import { initDb, getDb, getRedis } from "../lib/container.js";
import { finalizeEvidence, routeEvidenceToHumanReview } from "../lib/evidence-outcome.js";
import { readStoredFile } from "../lib/storage.js";

const logger = pino({ name: "evidence-verification-worker" });

const SONNET_MODEL = process.env.CLAUDE_SONNET_MODEL ?? "claude-sonnet-4-5-20250929";
const COST_PER_IMAGE_CENTS = 5; // ~$0.05/image

/** Image formats the vision model accepts. */
const VISION_MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type VisionMediaType = (typeof VISION_MEDIA_TYPES)[number];

/** The API rejects images above 5 MB; base64 adds a third, so stay well below. */
const MAX_VISION_IMAGE_BYTES = 3_500_000;

export const AUTO_VERIFY_MIN_SCORE = 0.8;
export const AUTO_REJECT_BELOW_SCORE = 0.5;

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
  score: number,
  output: Pick<VerifyToolOutput, "reasoning">,
): Promise<void> {
  if (score >= AUTO_VERIFY_MIN_SCORE) {
    await finalizeEvidence(db, {
      evidenceId,
      verdict: "verified",
      confidence: score,
      source: "ai",
      reasoning: output.reasoning,
      auditMetadata: { autoApprove: true, model: SONNET_MODEL },
    });
    logger.info({ evidenceId, score }, "Evidence auto-approved by AI");
  } else if (score < AUTO_REJECT_BELOW_SCORE) {
    await finalizeEvidence(db, {
      evidenceId,
      verdict: "rejected",
      confidence: score,
      source: "ai",
      reasoning: output.reasoning,
      auditMetadata: { autoReject: true, model: SONNET_MODEL },
    });
    logger.info({ evidenceId, score }, "Evidence auto-rejected by AI");
  } else {
    const stage = await routeEvidenceToHumanReview(
      db,
      evidenceId,
      `AI confidence ${score.toFixed(2)} is between the reject and approve thresholds: ${output.reasoning}`,
    );
    logger.info({ evidenceId, score, stage }, "Evidence routed to human review");
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
      mediumUrl: evidence.mediumUrl,
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
 * Load an image the vision model can accept. Prefers the resized "medium"
 * rendition (smaller, always WebP) and falls back to the original.
 */
async function loadVisionImage(
  candidates: Array<string | null | undefined>,
): Promise<{ data: string; mediaType: VisionMediaType } | null> {
  for (const stored of candidates) {
    if (!stored) continue;
    const file = await readStoredFile(stored);
    if (!file) continue;
    const mediaType = file.contentType.split(";")[0]!.trim() as VisionMediaType;
    if (!VISION_MEDIA_TYPES.includes(mediaType)) continue;
    if (file.buffer.length > MAX_VISION_IMAGE_BYTES) continue;
    return { data: file.buffer.toString("base64"), mediaType };
  }
  return null;
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

  if (!isAiConfigured()) {
    await routeEvidenceToHumanReview(db, evidenceId, "AI verification is not configured on this instance");
    return;
  }

  await db
    .update(evidence)
    .set({ verificationStage: "ai_processing", updatedAt: new Date() })
    .where(eq(evidence.id, evidenceId));

  const budgetAvailable = await checkVisionBudget(redis);
  if (!budgetAvailable) {
    logger.warn({ evidenceId }, "Vision budget exceeded, routing to human review");
    await routeEvidenceToHumanReview(db, evidenceId, "Daily AI verification budget reached");
    return;
  }

  // The model may only judge what it can see. Videos, documents and images we
  // cannot load go to people.
  const isImageEvidence = ["photo", "image"].includes(evidenceRow.evidenceType ?? "");
  const image = isImageEvidence
    ? await loadVisionImage([evidenceRow.mediumUrl, evidenceRow.contentUrl])
    : null;

  if (!image) {
    await routeEvidenceToHumanReview(
      db,
      evidenceId,
      isImageEvidence
        ? "The submitted image could not be loaded for AI verification"
        : `AI verification does not support ${evidenceRow.evidenceType} evidence`,
    );
    return;
  }

  const verdict = await askVisionModel(image, evidenceRow, mission);
  if (verdict.called) {
    await incrementVisionCost(redis);
  }

  if (!verdict.ok) {
    logger.warn({ evidenceId, reason: verdict.reason }, "No usable AI verdict — routing to human review");
    if (verdict.note) {
      await db
        .update(evidence)
        .set({ aiVerificationReasoning: verdict.note, updatedAt: new Date() })
        .where(eq(evidence.id, evidenceId));
    }
    await routeEvidenceToHumanReview(db, evidenceId, verdict.reason);
    return;
  }

  await db
    .update(evidence)
    .set({
      aiVerificationScore: String(verdict.score.toFixed(2)),
      aiVerificationReasoning: verdict.output.reasoning,
      updatedAt: new Date(),
    })
    .where(eq(evidence.id, evidenceId));

  await routeByScore(db, evidenceId, verdict.score, verdict.output);
}

type VisionVerdict =
  | { ok: true; called: true; score: number; output: VerifyToolOutput }
  | { ok: false; called: boolean; reason: string; note?: string };

/**
 * Ask the vision model about one image. Never throws: every failure comes back
 * as a reason, and the caller hands the evidence to a person.
 */
async function askVisionModel(
  image: { data: string; mediaType: VisionMediaType },
  evidenceRow: { id: string; evidenceType: string | null; latitude: string | null; longitude: string | null; capturedAt: Date | null },
  mission: { title: string; description: string; evidenceRequired: unknown; requiredLatitude: string | null; requiredLongitude: string | null },
): Promise<VisionVerdict> {
  let response: Anthropic.Message;
  try {
    const anthropic = new Anthropic();

    response = await anthropic.messages.create({
      model: SONNET_MODEL,
      max_tokens: 1024,
      system: "You are an evidence verification assistant. Analyze the submitted evidence for a social good mission. Be thorough but fair.",
      tools: [VERIFY_TOOL],
      tool_choice: { type: "tool", name: "verify_evidence" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
            {
              type: "text",
              text: `Mission: "${mission.title}"
Description: ${mission.description}
Evidence requirements: ${JSON.stringify(mission.evidenceRequired)}
Evidence type: ${evidenceRow.evidenceType}
GPS coordinates: ${evidenceRow.latitude}, ${evidenceRow.longitude}
Mission location: ${mission.requiredLatitude}, ${mission.requiredLongitude}
Captured at: ${evidenceRow.capturedAt?.toISOString() ?? "unknown"}

Please verify this evidence submission using the verify_evidence tool.`,
            },
          ],
        },
      ],
    });
  } catch (error) {
    // The SDK has already retried rate limits, 5xx and network errors. Whatever
    // is left (bad key, retired model, refused request, persistent outage) will
    // not be fixed by running the job again, so a person takes over.
    const message = error instanceof Error ? error.message : "Unknown";
    logger.error({ evidenceId: evidenceRow.id, error: message }, "AI verification call failed");
    return { ok: false, called: false, reason: `AI verification failed: ${message}` };
  }

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return { ok: false, called: true, reason: "AI response could not be parsed" };
  }

  // Sprint 20: Validate vision verification response with strict Zod schema (FR-002)
  const parseResult = visionVerificationResponseSchema.safeParse(toolUse.input);
  if (!parseResult.success) {
    logger.error(
      { evidenceId: evidenceRow.id, zodErrors: parseResult.error.flatten() },
      "Vision verification response failed Zod validation",
    );
    return {
      ok: false,
      called: true,
      reason: "AI response failed schema validation",
      note: "AI verification response failed schema validation",
    };
  }

  const output = parseResult.data as VerifyToolOutput;
  return { ok: true, called: true, score: Math.max(0, Math.min(1, output.overallConfidence)), output };
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
      mediumUrl: evidence.mediumUrl,
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

  if (!isAiConfigured()) {
    await routeEvidenceToHumanReview(db, afterRow.id, "AI verification is not configured on this instance");
    return;
  }

  // Check pHash similarity — flag if before/after are too similar (possible fraud)
  try {
    const { calculatePhash, hammingDistance } = await import("../lib/phash.js");
    const [beforeFile, afterFile] = await Promise.all([
      beforeRow.contentUrl ? readStoredFile(beforeRow.contentUrl) : null,
      afterRow.contentUrl ? readStoredFile(afterRow.contentUrl) : null,
    ]);
    if (beforeFile && afterFile) {
      const [beforeHash, afterHash] = await Promise.all([
        calculatePhash(beforeFile.buffer), calculatePhash(afterFile.buffer),
      ]);
      const distance = hammingDistance(beforeHash, afterHash);
      if (distance < 5) {
        logger.warn({ pairId, distance }, "Before/after photos too similar — flagging as potential fraud");
        await db.update(evidence).set({
          aiVerificationReasoning: `Before/after photos suspiciously similar (hamming distance: ${distance}). Flagged for human review.`,
          updatedAt: new Date(),
        }).where(eq(evidence.id, afterRow.id));
        await routeEvidenceToHumanReview(db, afterRow.id, `Before/after photos are nearly identical (hamming distance ${distance})`);
        return;
      }
    }
  } catch (err) {
    logger.warn({ pairId, error: (err as Error).message }, "pHash comparison failed, continuing with AI comparison");
  }

  // Budget check
  const budgetAvailable = await checkVisionBudget(redis);
  if (!budgetAvailable) {
    logger.warn({ pairId }, "Vision budget exceeded for pair comparison, routing to human review");
    await routeEvidenceToHumanReview(db, afterRow.id, "Daily AI verification budget reached");
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

    const [beforeImage, afterImage] = await Promise.all([
      loadVisionImage([beforeRow.mediumUrl, beforeRow.contentUrl]),
      loadVisionImage([afterRow.mediumUrl, afterRow.contentUrl]),
    ]);

    if (!beforeImage || !afterImage) {
      logger.warn({ pairId }, "Could not load images for comparison, routing to human review");
      await routeEvidenceToHumanReview(db, afterRow.id, "The before/after images could not be loaded for AI verification");
      return;
    }

    await incrementVisionCost(redis);

    const result = await comparePhotos(
      beforeImage.data, beforeImage.mediaType,
      afterImage.data, afterImage.mediaType,
      missionContext,
    );

    // Update the "after" evidence record with comparison results
    const score = result.confidence;
    await db.update(evidence).set({
      aiVerificationScore: String(score.toFixed(2)),
      aiVerificationReasoning: `Before/after comparison: ${result.reasoning} (improvement: ${(result.improvementScore * 100).toFixed(0)}%)`,
      updatedAt: new Date(),
    }).where(eq(evidence.id, afterRow.id));

    await routeByScore(db, afterRow.id, score, { reasoning: result.reasoning });

    logger.info(
      { pairId, decision: result.decision, improvementScore: result.improvementScore },
      "Before/after pair comparison completed",
    );
  } catch (err) {
    const message = (err as Error).message;
    logger.error({ pairId, error: message }, "Before/after comparison failed — routing to human review");
    await routeEvidenceToHumanReview(db, afterRow.id, `AI comparison failed: ${message}`);
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

  worker.on("failed", async (job, err) => {
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 3;

    if (attemptsMade >= maxAttempts) {
      logger.error(
        { jobId: job?.id, attemptsMade, error: err.message },
        "DEAD LETTER: Evidence verification job exhausted all retries — sending to human review",
      );
      // Last line of defence (e.g. the database was down for every attempt):
      // never leave evidence waiting on a job that will not run again.
      const evidenceId = job?.data?.evidenceId ?? job?.data?.afterEvidenceId;
      const db = getDb();
      if (db && evidenceId) {
        try {
          await routeEvidenceToHumanReview(db, evidenceId, `Verification job failed: ${err.message}`);
        } catch (routeErr) {
          logger.error(
            { evidenceId, error: (routeErr as Error).message },
            "Could not route dead-lettered evidence to human review",
          );
        }
      }
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
