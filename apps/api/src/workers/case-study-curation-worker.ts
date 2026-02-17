/**
 * Case Study Curation Worker (Sprint 18: Cooperative Depth & Governance — US7)
 *
 * Weekly cron job (Sat 2 AM UTC) that identifies eligible missions
 * and creates draft case studies for admin review.
 */
import { Worker, Queue, type Job } from "bullmq";
import Redis from "ioredis";
import pino from "pino";

import { initDb, getDb } from "../lib/container.js";
import { CaseStudyCurationService } from "../services/case-study-curation.js";

const logger = pino({ name: "case-study-curation-worker" });

const QUEUE_NAME = "case-study-curation";

export interface CaseStudyCurationJobData {
  type: "weekly_curation";
}

async function processWeeklyCuration(): Promise<{ created: number }> {
  const db = getDb();
  if (!db) throw new Error("Database not initialized");

  const curationService = new CaseStudyCurationService(db);
  const eligible = await curationService.findEligibleMissions();

  let created = 0;
  for (const mission of eligible) {
    try {
      await curationService.createDraft(
        mission.missionId,
        mission.title,
        mission.domain,
        [mission.claimerHumanId],
      );
      created++;
    } catch (err) {
      logger.warn(
        { missionId: mission.missionId, error: (err as Error).message },
        "Failed to create case study draft",
      );
    }
  }

  logger.info({ eligible: eligible.length, created }, "Weekly case study curation complete");
  return { created };
}

export function createCaseStudyCurationWorker(): Worker {
  const DATABASE_URL = process.env.DATABASE_URL ?? "";
  initDb(DATABASE_URL);

  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

  const worker = new Worker<CaseStudyCurationJobData>(
    QUEUE_NAME,
    async (job: Job<CaseStudyCurationJobData>) => {
      logger.info({ jobId: job.id, type: job.data.type }, "Processing case study curation job");

      if (job.data.type === "weekly_curation") {
        return processWeeklyCuration();
      }

      logger.warn({ type: job.data.type }, "Unknown job type");
    },
    {
      connection,
      concurrency: 1,
      limiter: { max: 1, duration: 60_000 },
    },
  );

  const queue = new Queue(QUEUE_NAME, { connection });
  queue
    .upsertJobScheduler(
      "case-study-weekly-curation",
      { pattern: "0 2 * * 6" }, // Saturday 2 AM UTC
      {
        name: "case-study-weekly-curation",
        data: { type: "weekly_curation" },
        opts: {
          removeOnComplete: { count: 4 },
          removeOnFail: { count: 8 },
          attempts: 2,
          backoff: { type: "exponential", delay: 30_000 },
        },
      },
    )
    .catch((err) => {
      logger.error({ error: (err as Error).message }, "Failed to register repeatable job");
    });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Case study curation job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, "Case study curation job failed");
  });

  logger.info("Case study curation worker started");
  return worker;
}
