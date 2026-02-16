/**
 * Intelligence Report Worker (Sprint 17: Community Identity & Visible Growth)
 *
 * Monthly cron (1st of month, 5 AM UTC): generates monthly intelligence report.
 * Deterministic jobId based on month prevents duplicates.
 */
import { QUEUE_NAMES } from "@betterworld/shared";
import { Worker, Queue, type Job } from "bullmq";
import Redis from "ioredis";
import pino from "pino";

import { initDb, getDb } from "../lib/container.js";
import { IntelligenceService } from "../services/intelligence.service.js";

const logger = pino({ name: "intelligence-report-worker" });

export interface IntelligenceReportJobData {
  type: "monthly_report";
  reportMonth?: string; // YYYY-MM, auto-computed if not provided
}

async function processMonthlyReport(reportMonth?: string): Promise<{
  reportMonth: string;
  reportId: string;
}> {
  const db = getDb();
  if (!db) throw new Error("Database not initialized");

  // Default to previous month
  if (!reportMonth) {
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    reportMonth = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;
  }

  const service = new IntelligenceService(db);
  const reportData = await service.generateReport(reportMonth);
  const reportId = await service.storeReport(reportMonth, reportData);

  logger.info({ reportMonth, reportId }, "Intelligence report generated");

  return { reportMonth, reportId };
}

export function createIntelligenceReportWorker(): Worker {
  const config = {
    host: process.env.REDIS_HOST ?? "localhost",
    port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
  };

  const connection = new Redis(config);
  const queue = new Queue(QUEUE_NAMES.INTELLIGENCE_REPORT, { connection: new Redis(config) });

  // Monthly cron: 1st of month, 5 AM UTC
  queue
    .add(
      "monthly-report",
      { type: "monthly_report" } satisfies IntelligenceReportJobData,
      {
        repeat: { pattern: "0 5 1 * *" },
        removeOnComplete: { count: 12 },
        removeOnFail: { count: 12 },
      },
    )
    .catch((err) => {
      logger.error({ error: (err as Error).message }, "Failed to add intelligence-report cron");
    });

  const DATABASE_URL = process.env.DATABASE_URL ?? "";
  initDb(DATABASE_URL);

  const worker = new Worker<IntelligenceReportJobData>(
    QUEUE_NAMES.INTELLIGENCE_REPORT,
    async (job: Job<IntelligenceReportJobData>) => {
      logger.info({ jobId: job.id }, "Processing intelligence report");
      const result = await processMonthlyReport(job.data.reportMonth);
      logger.info(result, "Intelligence report complete");
      return result;
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Intelligence report job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, error: err.message },
      "Intelligence report job failed",
    );
  });

  return worker;
}
