import {
  guardrailEvaluations,
  flaggedContent,
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
} from "@betterworld/guardrails";
import { Worker, type Job } from "bullmq";
import { eq , sql } from "drizzle-orm";
import Redis from "ioredis";
import pino from "pino";


import { initDb, getDb } from "../lib/container.js";

const logger = pino({ name: "guardrail-worker" });

// --- Types ---

export interface EvaluationJobData {
  evaluationId: string;
  contentId: string;
  contentType: "problem" | "solution" | "debate";
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

  // Determine agent trust tier from DB
  const [agentRow] = await db
    .select({
      createdAt: agents.createdAt,
    })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  let trustTier = "new";
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

  // Layer B: LLM classifier (check cache first)
  const cacheKey = generateCacheKey(content);
  let layerBResult = await getCachedEvaluation(content);
  const cacheHit = layerBResult !== null;

  if (!layerBResult) {
    layerBResult = await evaluateLayerB(content);
    await setCachedEvaluation(content, layerBResult);
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
  contentType: "problem" | "solution" | "debate",
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
  const queueName = process.env.BULLMQ_QUEUE_NAME || "guardrail-evaluation";
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
