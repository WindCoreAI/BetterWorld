/**
 * Peer Consensus Worker (Sprint 11 — T010)
 *
 * BullMQ worker that processes peer consensus jobs.
 * Triggered by the guardrail worker after Layer B completes.
 * Assigns validators and initiates the consensus pipeline.
 */
import { problems, solutions, debates } from "@betterworld/db";
import { QUEUE_NAMES } from "@betterworld/shared";
import type { PeerConsensusJobData } from "@betterworld/shared";
import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import Redis from "ioredis";
import pino from "pino";

import { initDb, getDb } from "../lib/container.js";
import { assignValidators } from "../services/evaluation-assignment.js";

const logger = pino({ name: "peer-consensus" });

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://betterworld:betterworld_dev@localhost:5432/betterworld";

/**
 * Create the peer consensus BullMQ worker.
 */
export function createPeerConsensusWorker(): Worker<PeerConsensusJobData> {
  const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

  initDb(DATABASE_URL);

  const worker = new Worker<PeerConsensusJobData>(
    QUEUE_NAMES.PEER_CONSENSUS,
    async (job: Job<PeerConsensusJobData>) => {
      const {
        submissionId,
        submissionType,
        agentId,
        content,
        domain,
        locationPoint,
      } = job.data;

      logger.info(
        { submissionId, submissionType, domain, jobId: job.id },
        "Processing peer consensus job",
      );

      const db = getDb();
      if (!db) {
        throw new Error("Database not initialized");
      }

      // Fetch submission details for evaluation notification
      let submission = { title: "", description: "" };

      try {
        if (submissionType === "problem") {
          const [problem] = await db
            .select({ title: problems.title, description: problems.description })
            .from(problems)
            .where(eq(problems.id, submissionId))
            .limit(1);
          if (problem) submission = problem;
        } else if (submissionType === "solution") {
          const [solution] = await db
            .select({ title: solutions.title, description: solutions.description })
            .from(solutions)
            .where(eq(solutions.id, submissionId))
            .limit(1);
          if (solution) submission = solution;
        } else if (submissionType === "debate") {
          const [debate] = await db
            .select({ title: debates.content, description: debates.content })
            .from(debates)
            .where(eq(debates.id, submissionId))
            .limit(1);
          if (debate) submission = { title: debate.title.slice(0, 100), description: debate.description };
        }
      } catch (err) {
        logger.warn(
          { submissionId, submissionType, error: (err as Error).message },
          "Failed to fetch submission details, using content from job data",
        );
        submission = { title: content.slice(0, 100), description: content };
      }

      // Assign validators
      const result = await assignValidators(
        db,
        submissionId,
        submissionType,
        agentId,
        domain,
        submission,
        locationPoint,
      );

      logger.info(
        {
          submissionId,
          assignedCount: result.assignedValidatorIds.length,
          tierFallback: result.tierFallback,
          expiresAt: result.expiresAt.toISOString(),
        },
        "Peer consensus job completed — validators assigned",
      );

      return {
        assignedValidators: result.assignedValidatorIds.length,
        tierFallback: result.tierFallback,
        quorumRequired: result.quorumRequired,
      };
    },
    {
      connection,
      concurrency: 5,
    },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, submissionId: job.data.submissionId }, "Job completed");
  });

  worker.on("failed", (job, err) => {
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 3;

    if (attemptsMade >= maxAttempts) {
      logger.error(
        {
          jobId: job?.id,
          submissionId: job?.data?.submissionId,
          attemptsMade,
          maxAttempts,
          error: err.message,
        },
        "DEAD LETTER: Peer consensus job exhausted all retries",
      );
    } else {
      logger.warn(
        {
          jobId: job?.id,
          submissionId: job?.data?.submissionId,
          attemptsMade,
          error: err.message,
        },
        "Peer consensus job failed, will retry",
      );
    }
  });

  worker.on("error", (err) => {
    logger.error({ error: err.message }, "Worker error");
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down peer consensus worker...");
    await worker.close();
    await connection.quit();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info("Peer consensus worker started");

  return worker;
}

// Start worker if running as standalone script
if (process.argv[1]?.includes("peer-consensus")) {
  createPeerConsensusWorker();
}
