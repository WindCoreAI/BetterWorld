/**
 * Agent Fingerprint Worker (Sprint 18: Cooperative Depth & Governance — US11)
 *
 * Weekly cron (Mon 6 AM UTC): computes behavioral fingerprints for all active agents.
 */
import { Worker, Queue, type Job } from "bullmq";
import Redis from "ioredis";
import pino from "pino";

import { initDb, getDb } from "../lib/container.js";
import { AgentFingerprintService } from "../services/agent-fingerprint.js";

const logger = pino({ name: "agent-fingerprint-worker" });

const QUEUE_NAME = "agent-fingerprint";

export interface AgentFingerprintJobData {
  type: "weekly_compute";
}

async function processWeeklyCompute(): Promise<{ computed: number }> {
  const db = getDb();
  if (!db) throw new Error("Database not initialized");

  const service = new AgentFingerprintService(db);
  return service.computeAll();
}

export function createAgentFingerprintWorker(): Worker {
  const DATABASE_URL = process.env.DATABASE_URL ?? "";
  initDb(DATABASE_URL);

  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

  const worker = new Worker<AgentFingerprintJobData>(
    QUEUE_NAME,
    async (job: Job<AgentFingerprintJobData>) => {
      logger.info({ jobId: job.id, type: job.data.type }, "Processing agent fingerprint");

      if (job.data.type === "weekly_compute") {
        const result = await processWeeklyCompute();
        logger.info(result, "Agent fingerprint computation complete");
        return result;
      }

      logger.warn({ type: job.data.type }, "Unknown job type");
    },
    {
      connection,
      concurrency: 1,
      limiter: { max: 1, duration: 60_000 },
    },
  );

  // Weekly cron: Monday 6 AM UTC
  const queue = new Queue(QUEUE_NAME, { connection });
  queue
    .upsertJobScheduler(
      "agent-fingerprint-weekly",
      { pattern: "0 6 * * 1" },
      {
        name: "agent-fingerprint-weekly",
        data: { type: "weekly_compute" },
        opts: {
          removeOnComplete: { count: 4 },
          removeOnFail: { count: 12 },
          attempts: 2,
          backoff: { type: "exponential", delay: 30_000 },
        },
      },
    )
    .catch((err) => {
      logger.error({ error: (err as Error).message }, "Failed to register repeatable job");
    });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Agent fingerprint job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, error: err.message },
      "Agent fingerprint job failed",
    );
  });

  logger.info("Agent fingerprint worker started");
  return worker;
}
