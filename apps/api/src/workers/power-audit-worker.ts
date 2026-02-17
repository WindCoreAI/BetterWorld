/**
 * Power Audit Worker (Sprint 18: Cooperative Depth & Governance — US11)
 *
 * Weekly cron (Mon 5 AM UTC): computes power distribution snapshot.
 * Tracks Gini coefficient, decision concentration, tier distribution, etc.
 */
import { Worker, Queue, type Job } from "bullmq";
import Redis from "ioredis";
import pino from "pino";

import { initDb, getDb } from "../lib/container.js";
import { PowerAuditService } from "../services/power-audit.js";

const logger = pino({ name: "power-audit-worker" });

const QUEUE_NAME = "power-audit";

export interface PowerAuditJobData {
  type: "weekly_snapshot";
}

async function processWeeklySnapshot(): Promise<{ snapshotId: string }> {
  const db = getDb();
  if (!db) throw new Error("Database not initialized");

  const service = new PowerAuditService(db);
  const snapshot = await service.computeSnapshot();
  const { id } = await service.saveSnapshot(snapshot);

  logger.info({ snapshotId: id, reviewGini: snapshot.reviewGini }, "Power audit snapshot saved");
  return { snapshotId: id };
}

export function createPowerAuditWorker(): Worker {
  const DATABASE_URL = process.env.DATABASE_URL ?? "";
  initDb(DATABASE_URL);

  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

  const worker = new Worker<PowerAuditJobData>(
    QUEUE_NAME,
    async (job: Job<PowerAuditJobData>) => {
      logger.info({ jobId: job.id, type: job.data.type }, "Processing power audit");

      if (job.data.type === "weekly_snapshot") {
        return processWeeklySnapshot();
      }

      logger.warn({ type: job.data.type }, "Unknown job type");
    },
    {
      connection,
      concurrency: 1,
      limiter: { max: 1, duration: 60_000 },
    },
  );

  // Weekly cron: Monday 5 AM UTC
  const queue = new Queue(QUEUE_NAME, { connection });
  queue
    .upsertJobScheduler(
      "power-audit-weekly",
      { pattern: "0 5 * * 1" },
      {
        name: "power-audit-weekly",
        data: { type: "weekly_snapshot" },
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
    logger.info({ jobId: job.id }, "Power audit job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, error: err.message },
      "Power audit job failed",
    );
  });

  logger.info("Power audit worker started");
  return worker;
}
