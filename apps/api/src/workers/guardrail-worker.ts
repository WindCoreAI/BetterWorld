/* eslint-disable complexity, max-lines-per-function */
import {
  guardrailEvaluations,
  problems,
  solutions,
  agents,
} from "@betterworld/db";
import {
  evaluateLayerA,
  evaluateLayerB,
  generateCacheKey,
  getCachedEvaluation,
  setCachedEvaluation,
  resolveTrustTier,
  getThresholds,
  decideGuardrailOutcome,
  LayerBUnavailableError,
} from "@betterworld/guardrails";
import { QUEUE_NAMES } from "@betterworld/shared";
import type { LayerBResult, PeerConsensusJobData, TrustTier } from "@betterworld/shared";
import { Queue, Worker, type Job } from "bullmq";
import { eq , sql } from "drizzle-orm";
import Redis from "ioredis";
import pino from "pino";


import { checkBudgetAvailable, recordAiCost } from "../lib/budget.js";
import { initDb, getDb, getRedis } from "../lib/container.js";
import { flagForHumanReview, updateContentStatus, type DbOrTx } from "../lib/content-status.js";
import { getFlag } from "../services/feature-flags.js";
import { routeSubmission } from "../services/traffic-router.js";

const logger = pino({ name: "guardrail-worker" });

// Shared peer consensus queue to avoid creating new Redis connections per enqueue
let _peerConsensusQueue: Queue | null = null;
function getPeerConsensusQueue(): Queue {
  if (!_peerConsensusQueue) {
    _peerConsensusQueue = new Queue(QUEUE_NAMES.PEER_CONSENSUS, {
      connection: new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
        maxRetriesPerRequest: null,
        lazyConnect: true,
      }),
    });
  }
  return _peerConsensusQueue;
}

// --- Types ---

export interface EvaluationJobData {
  evaluationId: string;
  contentId: string;
  contentType: "problem" | "solution" | "debate" | "mission" | "discussion_thread" | "discussion_reply" | "circle_post" | "help_offer_message" | "help_request_note" | "gratitude_narrative" | "human_solution" | "human_mission_proposal";
  content: string;
  agentId: string;
  trustTier: string;
  /** For discussion content: the human author ID (discussions don't have an agentId) */
  humanAuthorId?: string;
}

// --- Core processing logic ---

export interface ProcessingResult {
  cacheHit: boolean;
  layerARejected: boolean;
  processingTimeMs: number;
}

/**
 * Trust tier for the author of a submission (cached for 1 hour).
 *
 * An agent whose claim status is "verified" — created by a human with a
 * verified email, or verified by an admin — gets standard thresholds. Others
 * earn the tier through account age and approved submissions; approvals made
 * by human reviewers count (recordHumanDecision writes them back).
 */
async function resolveAgentTrustTier(
  db: NonNullable<ReturnType<typeof getDb>>,
  redis: ReturnType<typeof getRedis>,
  agentId: string,
): Promise<TrustTier> {
  const tierCacheKey = `trust:tier:${agentId}`;
  const cached = redis ? await redis.get(tierCacheKey) : null;
  if (cached === "new" || cached === "verified") return cached;

  let tier: TrustTier = "new";

  const [agentRow] = await db
    .select({
      createdAt: agents.createdAt,
      claimStatus: agents.claimStatus,
    })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

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

    tier = resolveTrustTier({
      accountAgeDays: ageDays,
      approvedSubmissions: countResult?.count ?? 0,
      ownerVerified: agentRow.claimStatus === "verified",
    });
  }

  if (redis) {
    await redis.setex(tierCacheKey, 3600, tier);
  }
  return tier;
}

interface LayerBOutcome {
  /** null when the classifier could not produce a verdict. */
  result: LayerBResult | null;
  cacheHit: boolean;
  cacheKey: string | null;
  unavailableReason?: string;
}

/**
 * Run the classifier, or explain why it could not run.
 *
 * Never leaves a submission in limbo: a missing key, an exhausted budget, a
 * provider that rejects the request, or a provider that keeps failing all end
 * in "unavailable", and the caller sends the content to human review.
 * Transient failures are rethrown while retries remain so the queue backs off.
 */
async function runLayerB(job: Job<EvaluationJobData>): Promise<LayerBOutcome> {
  const { evaluationId, content, contentType } = job.data;

  const budgetAvailable = await checkBudgetAvailable();
  if (!budgetAvailable) {
    logger.warn({ evaluationId }, "Budget cap reached — skipping Layer B, flagging for admin review");
    return { result: null, cacheHit: false, cacheKey: null, unavailableReason: "budget_cap_reached" };
  }

  const cacheKey = generateCacheKey(content);
  const cached = await getCachedEvaluation(content);
  if (cached) {
    logger.info({ evaluationId, cacheKey }, "Cache hit - reusing previous evaluation");
    return { result: cached, cacheHit: true, cacheKey };
  }

  try {
    const result = await evaluateLayerB(content, contentType);
    await setCachedEvaluation(content, result);
    // Record AI cost (~0.3 cents per call as safety margin)
    await recordAiCost(1);
    return { result, cacheHit: false, cacheKey };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (err instanceof LayerBUnavailableError) {
      logger.warn({ evaluationId, reason: message }, "Layer B unavailable — routing to human review");
      return { result: null, cacheHit: false, cacheKey, unavailableReason: message };
    }

    const maxAttempts = job.opts?.attempts ?? 1;
    const isLastAttempt = (job.attemptsMade ?? 0) + 1 >= maxAttempts;
    if (isLastAttempt) {
      logger.error(
        { evaluationId, attemptsMade: job.attemptsMade, error: message },
        "Layer B failed on the final attempt — routing to human review",
      );
      return { result: null, cacheHit: false, cacheKey, unavailableReason: `classifier_error: ${message}` };
    }

    throw err; // retry with backoff
  }
}

export async function processEvaluation(job: Job<EvaluationJobData>): Promise<ProcessingResult> {
  const { evaluationId, contentId, contentType, content, agentId } = job.data;
  const startTime = Date.now();

  const db = getDb();
  if (!db) {
    throw new Error("Database not initialized — call initDb() before processing jobs");
  }

  logger.info({ evaluationId, contentType, agentId }, "Processing evaluation");

  const redis = getRedis();
  const trustTier = await resolveAgentTrustTier(db, redis, agentId);

  // Layer A: Rule engine (fast keyword pre-filter, <10ms target)
  const layerAResult = await evaluateLayerA(content);

  // Layer B: LLM classifier (cached, budgeted, may be unavailable)
  const layerB = await runLayerB(job);
  const layerBResult = layerB.result;
  const { cacheHit, cacheKey } = layerB;

  const thresholds = getThresholds(trustTier);
  const outcome = decideGuardrailOutcome({
    layerA: layerAResult,
    layerB: layerBResult,
    thresholds,
    contentType,
  });
  const finalDecision = outcome.decision;
  const score = layerBResult?.alignmentScore ?? null;

  if (layerBResult?.solutionScores && outcome.composite !== undefined) {
    layerBResult.solutionScores.composite = outcome.composite;
  }

  logger.info(
    {
      evaluationId,
      trustTier,
      score,
      thresholds,
      finalDecision,
      reason: outcome.reason,
      forbiddenPatterns: layerAResult.forbiddenPatterns,
    },
    "Decision made",
  );

  // Sprint 12: Production traffic routing — peer consensus can make the production
  // decision instead of Layer B. Only for content both layers handled cleanly:
  // keyword hits and classifier outages always go the direct (human review) route.
  let routingDecision: "layer_b" | "peer_consensus" = "layer_b";

  if (contentType !== "mission" && layerBResult && layerAResult.passed) {
    try {
      const routeResult = await routeSubmission(contentId, trustTier, redis);
      routingDecision = routeResult.route;

      logger.info(
        { evaluationId, contentId, route: routeResult.route, reason: routeResult.reason, trafficPct: routeResult.trafficPct },
        "Traffic routing decision",
      );
    } catch (routeErr) {
      // Fail-safe: default to Layer B on routing error
      logger.warn(
        { evaluationId, error: (routeErr as Error).message },
        "Traffic routing failed — defaulting to Layer B",
      );
    }
  }

  /** Persist the scores the classifier produced, independent of the routing decision. */
  const persistScores = async (tx: DbOrTx) => {
    if (!layerBResult || score === null) return;

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

    if (contentType === "problem") {
      await tx
        .update(problems)
        .set({
          alignmentScore: String(score),
          alignmentDomain: layerBResult.alignedDomain,
        })
        .where(eq(problems.id, contentId));
    }
  };

  /** Apply the decision to the content and, when flagged, queue it for human review. */
  const applyDecision = async (tx: DbOrTx) => {
    if (finalDecision === "flagged") {
      await flagForHumanReview(tx, { evaluationId, contentId, contentType, agentId });
      logger.info({ evaluationId, score, reason: outcome.reason }, "Content flagged for human review");
    } else {
      await updateContentStatus(tx, contentId, contentType, finalDecision);
    }
  };

  if (routingDecision === "peer_consensus" && layerBResult && score !== null) {
    // PEER CONSENSUS PATH: Hold Layer B result, let peer consensus make the production decision
    // Record the evaluation with Layer B results but do NOT apply finalDecision to content yet
    await db.transaction(async (tx) => {
      await tx
        .update(guardrailEvaluations)
        .set({
          layerAResult: JSON.stringify(layerAResult),
          layerBResult: JSON.stringify(layerBResult),
          // Do NOT set finalDecision — peer consensus will determine it
          alignmentScore: String(score),
          alignmentDomain: layerBResult.alignedDomain,
          cacheHit,
          cacheKey,
          trustTier,
          routingDecision: "peer_consensus",
          // Don't set completedAt — evaluation is not complete until consensus
          evaluationDurationMs: Date.now() - startTime,
        })
        .where(eq(guardrailEvaluations.id, evaluationId));

      await persistScores(tx);
    });

    // Enqueue peer consensus job for production decision-making
    try {
      const peerQueue = getPeerConsensusQueue();

      const peerJobData: PeerConsensusJobData = {
        submissionId: contentId,
        submissionType: contentType as "problem" | "solution" | "debate",
        agentId,
        content,
        domain: layerBResult.alignedDomain || "community_building",
        layerBDecision: finalDecision,
        layerBAlignmentScore: score,
      };

      await peerQueue.add("peer-consensus", peerJobData, {
        jobId: `peer-${contentType}-${contentId}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      });

      logger.info(
        { evaluationId, contentId, contentType, layerBDecision: finalDecision },
        "Peer consensus job enqueued (production routing)",
      );
    } catch (peerErr) {
      // CRITICAL: If peer enqueue fails, fall back to Layer B decision
      logger.error(
        { evaluationId, error: (peerErr as Error).message },
        "Failed to enqueue peer consensus — falling back to Layer B",
      );

      await db.transaction(async (tx) => {
        await tx
          .update(guardrailEvaluations)
          .set({
            finalDecision,
            completedAt: new Date(),
          })
          .where(eq(guardrailEvaluations.id, evaluationId));

        await applyDecision(tx);
      });
    }
  } else {
    // DIRECT PATH: apply the decision now
    await db.transaction(async (tx) => {
      await tx
        .update(guardrailEvaluations)
        .set({
          layerAResult: JSON.stringify(layerAResult),
          layerBResult: layerBResult ? JSON.stringify(layerBResult) : null,
          finalDecision,
          alignmentScore: score !== null ? String(score) : null,
          alignmentDomain: layerBResult?.alignedDomain ?? null,
          cacheHit,
          cacheKey,
          trustTier,
          routingDecision: "layer_b",
          completedAt: new Date(),
          evaluationDurationMs: Date.now() - startTime,
        })
        .where(eq(guardrailEvaluations.id, evaluationId));

      await applyDecision(tx);
      await persistScores(tx);
    });

    // Discussion content callback: notify author and participants
    if (contentType === "discussion_thread" || contentType === "discussion_reply") {
      try {
        const { DiscussionService } = await import("../services/discussion.service.js");
        const discussionService = new DiscussionService(db);
        await discussionService.onGuardrailComplete(
          contentId,
          contentType,
          finalDecision,
          job.data.humanAuthorId,
        );
      } catch (cbErr) {
        logger.warn(
          { evaluationId, error: (cbErr as Error).message },
          "Discussion guardrail callback failed (non-blocking)",
        );
      }
    }

    // Also enqueue shadow peer validation if enabled (for Layer B-routed items)
    if (layerBResult && score !== null) {
      try {
        const peerValidationEnabled = await getFlag(redis, "PEER_VALIDATION_ENABLED");

        if (peerValidationEnabled) {
          const peerQueue = getPeerConsensusQueue();

          const peerJobData: PeerConsensusJobData = {
            submissionId: contentId,
            submissionType: contentType as "problem" | "solution" | "debate",
            agentId,
            content,
            domain: layerBResult.alignedDomain || "community_building",
            layerBDecision: finalDecision,
            layerBAlignmentScore: score,
          };

          await peerQueue.add("peer-consensus", peerJobData, {
            jobId: `peer-${contentType}-${contentId}`,
            attempts: 3,
            backoff: { type: "exponential", delay: 5000 },
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 50 },
          });

          logger.info(
            { evaluationId, contentId, contentType, finalDecision },
            "Peer consensus job enqueued (shadow mode for Layer B-routed item)",
          );
        }
      } catch (peerErr) {
        // Shadow mode is non-blocking
        logger.warn(
          { evaluationId, error: (peerErr as Error).message },
          "Failed to enqueue peer consensus job (shadow — non-blocking)",
        );
      }
    }
  }

  const processingTimeMs = Date.now() - startTime;
  logger.info(
    { evaluationId, finalDecision, score, cacheHit, durationMs: processingTimeMs },
    "Evaluation complete"
  );

  return {
    cacheHit,
    // Kept for the worker's metrics: a keyword hit the classifier confirmed as a violation.
    layerARejected: !layerAResult.passed && finalDecision === "rejected",
    processingTimeMs,
  };
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

      // The pipeline could not reach a verdict. Hand the content to a human
      // reviewer rather than leaving it "pending" forever: before this, the
      // evaluation row was marked rejected while the content itself stayed
      // pending and invisible to both its author and the admin queue.
      try {
        const db = getDb();
        if (db && job?.data?.evaluationId) {
          const { evaluationId, contentId, contentType, agentId } = job.data;
          await db.transaction(async (tx) => {
            await tx
              .update(guardrailEvaluations)
              .set({
                finalDecision: "flagged",
                completedAt: new Date(),
                evaluationDurationMs: -1, // Sentinel: indicates failure, not actual duration
              })
              .where(eq(guardrailEvaluations.id, evaluationId));
            await flagForHumanReview(tx, { evaluationId, contentId, contentType, agentId });
          });
          logger.info({ evaluationId }, "Dead-lettered evaluation sent to human review");
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
