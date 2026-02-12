/* eslint-disable complexity, max-lines-per-function */
import {
  guardrailEvaluations,
  flaggedContent,
  missions,
  problems,
  solutions,
  debates,
  agents,
} from "@betterworld/db";
import {
  evaluateLayerA,
  evaluateLayerB,
  generateCacheKey,
  getCachedEvaluation,
  setCachedEvaluation,
  determineTrustTier,
  getThresholds,
  computeCompositeScore,
} from "@betterworld/guardrails";
import { QUEUE_NAMES } from "@betterworld/shared";
import type { PeerConsensusJobData } from "@betterworld/shared";
import { Queue, Worker, type Job } from "bullmq";
import { eq , sql } from "drizzle-orm";
import Redis from "ioredis";
import pino from "pino";


import { checkBudgetAvailable, recordAiCost } from "../lib/budget.js";
import { initDb, getDb, getRedis } from "../lib/container.js";

const logger = pino({ name: "guardrail-worker" });

// --- Types ---

export interface EvaluationJobData {
  evaluationId: string;
  contentId: string;
  contentType: "problem" | "solution" | "debate" | "mission";
  content: string;
  agentId: string;
  trustTier: string;
}

// --- Core processing logic ---

export interface ProcessingResult {
  cacheHit: boolean;
  layerARejected: boolean;
  processingTimeMs: number;
}

export async function processEvaluation(job: Job<EvaluationJobData>): Promise<ProcessingResult> {
  const { evaluationId, contentId, contentType, content, agentId } = job.data;
  const startTime = Date.now();

  const db = getDb();
  if (!db) {
    throw new Error("Database not initialized — call initDb() before processing jobs");
  }

  logger.info({ evaluationId, contentType, agentId }, "Processing evaluation");

  // Determine agent trust tier (cached for 1 hour)
  const redis = getRedis();
  const tierCacheKey = `trust:tier:${agentId}`;
  let trustTier = redis ? await redis.get(tierCacheKey) : null;

  if (!trustTier) {
    const [agentRow] = await db
      .select({
        createdAt: agents.createdAt,
      })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    trustTier = "new";
    if (agentRow) {
      const ageDays = Math.floor(
        (Date.now() - new Date(agentRow.createdAt).getTime()) / (1000 * 60 * 60 * 24),
      );

      // Count approved evaluations for this agent
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(guardrailEvaluations)
        .where(
          sql`${guardrailEvaluations.agentId} = ${agentId} AND ${guardrailEvaluations.finalDecision} = 'approved'`,
        );

      const approvedCount = countResult?.count ?? 0;
      trustTier = determineTrustTier(ageDays, approvedCount);
    }

    // Cache for 1 hour if Redis is available
    if (redis) {
      await redis.setex(tierCacheKey, 3600, trustTier);
    }
  }

  // Layer A: Rule engine (fast pre-filter, <10ms target)
  const layerAResult = await evaluateLayerA(content);

  if (!layerAResult.passed) {
    // Auto-reject: forbidden pattern detected
    logger.info(
      { evaluationId, patterns: layerAResult.forbiddenPatterns },
      "Layer A rejected: forbidden pattern detected"
    );

    await db.transaction(async (tx) => {
      await tx
        .update(guardrailEvaluations)
        .set({
          layerAResult: JSON.stringify(layerAResult),
          finalDecision: "rejected",
          trustTier,
          completedAt: new Date(),
          evaluationDurationMs: Date.now() - startTime,
        })
        .where(eq(guardrailEvaluations.id, evaluationId));

      await updateContentStatus(tx, contentId, contentType, "rejected");
    });
    return { cacheHit: false, layerARejected: true, processingTimeMs: Date.now() - startTime };
  }

  // Budget check: skip Layer B if daily cap reached
  const budgetAvailable = await checkBudgetAvailable();
  if (!budgetAvailable) {
    logger.warn({ evaluationId }, "Budget cap reached — skipping Layer B, flagging for admin review");

    await db.transaction(async (tx) => {
      await tx
        .update(guardrailEvaluations)
        .set({
          layerAResult: JSON.stringify(layerAResult),
          finalDecision: "flagged",
          trustTier,
          completedAt: new Date(),
          evaluationDurationMs: Date.now() - startTime,
        })
        .where(eq(guardrailEvaluations.id, evaluationId));

      await updateContentStatus(tx, contentId, contentType, "flagged");

      await tx.insert(flaggedContent).values({
        evaluationId,
        contentId,
        contentType,
        agentId,
        status: "pending_review",
      });
    });

    return { cacheHit: false, layerARejected: false, processingTimeMs: Date.now() - startTime };
  }

  // Layer B: LLM classifier (check cache first)
  const cacheKey = generateCacheKey(content);
  let layerBResult = await getCachedEvaluation(content);
  const cacheHit = layerBResult !== null;

  if (!layerBResult) {
    layerBResult = await evaluateLayerB(content, contentType);
    await setCachedEvaluation(content, layerBResult);
    // Record AI cost (~0.3 cents per call as safety margin)
    await recordAiCost(1);
  }

  if (cacheHit) {
    logger.info({ evaluationId, cacheKey }, "Cache hit - reusing previous evaluation");
  }

  // Determine final decision based on score and trust tier thresholds
  const score = layerBResult.alignmentScore;
  const thresholds = getThresholds(trustTier as "new" | "verified");
  let finalDecision: "approved" | "flagged" | "rejected";

  if (score >= thresholds.autoApprove) {
    finalDecision = "approved";
  } else if (score >= thresholds.autoRejectMax) {
    finalDecision = "flagged";
  } else {
    finalDecision = "rejected";
  }

  // For solutions: apply composite score-based decision routing
  if (contentType === "solution" && layerBResult.solutionScores) {
    const { impact, feasibility, costEfficiency } = layerBResult.solutionScores;
    const composite = computeCompositeScore(impact, feasibility, costEfficiency);
    layerBResult.solutionScores.composite = composite;

    // Score-based routing for solutions (in addition to alignment check)
    if (finalDecision === "approved") {
      if (composite < 40) {
        finalDecision = "rejected";
      } else if (composite < 60) {
        finalDecision = "flagged";
      }
    }
  }

  logger.info({ evaluationId, trustTier, score, thresholds, finalDecision }, "Decision made");

  // Update evaluation, content status, and flagged_content atomically
  await db.transaction(async (tx) => {
    await tx
      .update(guardrailEvaluations)
      .set({
        layerAResult: JSON.stringify(layerAResult),
        layerBResult: JSON.stringify(layerBResult),
        finalDecision,
        alignmentScore: String(score),
        alignmentDomain: layerBResult.alignedDomain,
        cacheHit,
        cacheKey,
        trustTier,
        completedAt: new Date(),
        evaluationDurationMs: Date.now() - startTime,
      })
      .where(eq(guardrailEvaluations.id, evaluationId));

    await updateContentStatus(tx, contentId, contentType, finalDecision);

    // For solutions: persist scores
    if (contentType === "solution" && layerBResult.solutionScores) {
      const { impact, feasibility, costEfficiency, composite } = layerBResult.solutionScores;
      await tx
        .update(solutions)
        .set({
          impactScore: String(impact),
          feasibilityScore: String(feasibility),
          costEfficiencyScore: String(costEfficiency),
          compositeScore: String(composite),
          alignmentScore: String(score),
        })
        .where(eq(solutions.id, contentId));
    }

    // For problems: persist alignment info
    if (contentType === "problem") {
      await tx
        .update(problems)
        .set({
          alignmentScore: String(score),
          alignmentDomain: layerBResult.alignedDomain,
        })
        .where(eq(problems.id, contentId));
    }

    // If flagged, create entry in flagged_content table for admin review
    if (finalDecision === "flagged") {
      await tx.insert(flaggedContent).values({
        evaluationId,
        contentId,
        contentType,
        agentId,
        status: "pending_review",
      });
      logger.info({ evaluationId, score }, "Content flagged for human review");
    }
  });

  // T012: Shadow peer validation pipeline integration
  // After Layer B decision, enqueue peer consensus job if shadow mode is enabled
  try {
    const { getFlag } = await import("../services/feature-flags.js");
    const peerValidationEnabled = await getFlag(redis, "PEER_VALIDATION_ENABLED");

    if (peerValidationEnabled && contentType !== "mission") {
      const peerQueue = new Queue(QUEUE_NAMES.PEER_CONSENSUS, {
        connection: new Redis(process.env.REDIS_URL || "redis://localhost:6379", { maxRetriesPerRequest: null }),
      });

      const peerJobData: PeerConsensusJobData = {
        submissionId: contentId,
        submissionType: contentType as "problem" | "solution" | "debate",
        agentId,
        content,
        domain: layerBResult?.alignedDomain || "community_building",
        layerBDecision: finalDecision,
        layerBAlignmentScore: score,
      };

      await peerQueue.add("peer-consensus", peerJobData, {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      });

      await peerQueue.close();

      logger.info(
        { evaluationId, contentId, contentType, finalDecision },
        "Peer consensus job enqueued (shadow mode)",
      );
    }
  } catch (peerErr) {
    // Shadow mode is non-blocking — do NOT affect Layer B routing
    logger.warn(
      { evaluationId, error: (peerErr as Error).message },
      "Failed to enqueue peer consensus job (shadow mode — non-blocking)",
    );
  }

  const processingTimeMs = Date.now() - startTime;
  logger.info(
    { evaluationId, finalDecision, score, cacheHit, durationMs: processingTimeMs },
    "Evaluation complete"
  );

  return { cacheHit, layerARejected: false, processingTimeMs };
}

async function updateContentStatus(
  db: ReturnType<typeof initDb>,
  contentId: string,
  contentType: "problem" | "solution" | "debate" | "mission",
  status: "approved" | "rejected" | "flagged"
): Promise<void> {
  switch (contentType) {
    case "problem":
      await db
        .update(problems)
        .set({ guardrailStatus: status })
        .where(eq(problems.id, contentId));
      break;
    case "solution":
      await db
        .update(solutions)
        .set({ guardrailStatus: status })
        .where(eq(solutions.id, contentId));
      break;
    case "debate":
      await db
        .update(debates)
        .set({ guardrailStatus: status })
        .where(eq(debates.id, contentId));
      break;
    case "mission":
      await db
        .update(missions)
        .set({ guardrailStatus: status })
        .where(eq(missions.id, contentId));
      break;
  }
}

// --- Queue Monitoring Metrics (T066) ---

export interface WorkerMetrics {
  jobsCompleted: number;
  jobsFailed: number;
  jobsDeadLettered: number;
  totalProcessingTimeMs: number;
  cacheHits: number;
  layerARejections: number;
  startedAt: number;
}

export function createMetrics(): WorkerMetrics {
  return {
    jobsCompleted: 0,
    jobsFailed: 0,
    jobsDeadLettered: 0,
    totalProcessingTimeMs: 0,
    cacheHits: 0,
    layerARejections: 0,
    startedAt: Date.now(),
  };
}

// --- Worker initialization ---

export function createGuardrailWorker(): Worker<EvaluationJobData> {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const concurrency = parseInt(process.env.GUARDRAIL_CONCURRENCY_LIMIT || "5", 10);
  const queueName = process.env.BULLMQ_QUEUE_NAME || QUEUE_NAMES.GUARDRAIL_EVALUATION;
  const metrics = createMetrics();

  // Initialize DB connection once at worker startup (singleton)
  const databaseUrl = process.env.DATABASE_URL ?? "postgresql://betterworld:betterworld_dev@localhost:5432/betterworld";
  initDb(databaseUrl);

  // Processor wrapper: delegates to processEvaluation and updates metrics
  const processor = async (job: Job<EvaluationJobData>) => {
    const result = await processEvaluation(job);
    metrics.totalProcessingTimeMs += result.processingTimeMs;
    if (result.cacheHit) metrics.cacheHits++;
    if (result.layerARejected) metrics.layerARejections++;
  };

  const worker = new Worker<EvaluationJobData>(queueName, processor, {
    connection,
    concurrency,
  });

  worker.on("completed", (job) => {
    metrics.jobsCompleted++;
    logger.info({ jobId: job.id, evaluationId: job.data.evaluationId }, "Job completed");
  });

  // T067: Dead letter queue handling — log failed jobs, escalate after all retries exhausted
  worker.on("failed", async (job, err) => {
    metrics.jobsFailed++;
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 3;

    if (attemptsMade >= maxAttempts) {
      metrics.jobsDeadLettered++;
      logger.error(
        {
          jobId: job?.id,
          evaluationId: job?.data?.evaluationId,
          attemptsMade,
          maxAttempts,
          error: err.message,
          stack: err.stack,
        },
        "DEAD LETTER: Job exhausted all retries — requires manual review"
      );

      // Mark evaluation as rejected to prevent zombie records
      try {
        const db = getDb();
        if (db && job?.data?.evaluationId) {
          await db
            .update(guardrailEvaluations)
            .set({
              finalDecision: "rejected",
              completedAt: new Date(),
              evaluationDurationMs: -1, // Sentinel: indicates failure, not actual duration
            })
            .where(eq(guardrailEvaluations.id, job.data.evaluationId));
          logger.info({ evaluationId: job.data.evaluationId }, "Dead-lettered evaluation marked as rejected");
        }
      } catch (dbErr) {
        logger.error(
          { error: (dbErr as Error).message, evaluationId: job?.data?.evaluationId },
          "Failed to update dead-lettered evaluation record"
        );
      }
    } else {
      logger.warn(
        {
          jobId: job?.id,
          evaluationId: job?.data?.evaluationId,
          attemptsMade,
          maxAttempts,
          error: err.message,
        },
        "Job failed, will retry"
      );
    }
  });

  worker.on("error", (err) => {
    logger.error({ error: err.message }, "Worker error");
  });

  // Periodic metrics logging (every 60s)
  const metricsInterval = setInterval(() => {
    const uptimeMs = Date.now() - metrics.startedAt;
    const totalJobs = metrics.jobsCompleted + metrics.jobsFailed;
    const failureRate = totalJobs > 0 ? metrics.jobsFailed / totalJobs : 0;
    const avgProcessingMs = metrics.jobsCompleted > 0
      ? metrics.totalProcessingTimeMs / metrics.jobsCompleted
      : 0;

    logger.info(
      {
        uptimeMs,
        jobsCompleted: metrics.jobsCompleted,
        jobsFailed: metrics.jobsFailed,
        jobsDeadLettered: metrics.jobsDeadLettered,
        failureRate: failureRate.toFixed(4),
        avgProcessingMs: Math.round(avgProcessingMs),
        cacheHits: metrics.cacheHits,
        layerARejections: metrics.layerARejections,
      },
      "Worker metrics snapshot"
    );
  }, 60_000);

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down guardrail worker...");
    clearInterval(metricsInterval);
    await worker.close();
    await connection.quit();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info({ concurrency, queueName }, "Guardrail worker started");

  return worker;
}

// Start worker if running as standalone script
if (process.argv[1]?.includes("guardrail-worker")) {
  createGuardrailWorker();
}
