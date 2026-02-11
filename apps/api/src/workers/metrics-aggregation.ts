/**
 * Metrics Aggregation Worker (Sprint 9: Reputation & Impact)
 *
 * Hourly BullMQ job that aggregates platform metrics into Redis cache.
 */
import { QUEUE_NAMES } from "@betterworld/shared";
import { Worker, type Job } from "bullmq";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import Redis from "ioredis";
import pino from "pino";

import { initDb, getDb, getRedis, initRedis } from "../lib/container.js";
import {
  aggregateDashboardMetrics,
  aggregateHeatmapData,
  storeAllInRedis,
} from "../lib/metrics-aggregator.js";

const logger = pino({ name: "metrics-aggregation-worker" });

export interface AggregationJobData {
  triggeredBy: "cron" | "manual";
}

export interface AggregationResult {
  dashboardMetrics: boolean;
  heatmapPoints: number;
  durationMs: number;
}

/**
 * Run full metrics aggregation pipeline.
 */
export async function processMetricsAggregation(
  dbOverride?: PostgresJsDatabase | null,
  redisOverride?: Redis | null,
): Promise<AggregationResult> {
  const db = dbOverride ?? getDb();
  if (!db) throw new Error("Database not initialized");

  const redis = redisOverride ?? getRedis();
  if (!redis) throw new Error("Redis not initialized");

  const startTime = Date.now();

  logger.info("Starting metrics aggregation");

  // Aggregate all metrics
  const [dashboard, heatmap] = await Promise.all([
    aggregateDashboardMetrics(db),
    aggregateHeatmapData(db),
  ]);

  // Store in Redis
  await storeAllInRedis(redis, dashboard, heatmap);

  const durationMs = Date.now() - startTime;

  logger.info(
    { durationMs, heatmapPoints: heatmap.length },
    "Metrics aggregation complete",
  );

  return {
    dashboardMetrics: true,
    heatmapPoints: heatmap.length,
    durationMs,
  };
}

// ────────────────── Worker Initialization ──────────────────

export function createMetricsAggregationWorker(): Worker<AggregationJobData> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("REDIS_URL environment variable is required");

  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  initRedis(redisUrl);

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL environment variable is required");
  initDb(databaseUrl);

  const worker = new Worker<AggregationJobData>(
    QUEUE_NAMES.METRICS_AGGREGATION,
    async (_job: Job<AggregationJobData>) => {
      return processMetricsAggregation();
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Metrics aggregation job completed");
  });

  worker.on("failed", (job, err) => {
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 3;

    if (attemptsMade >= maxAttempts) {
      logger.error(
        { jobId: job?.id, attemptsMade, error: err.message },
        "DEAD LETTER: Metrics aggregation job exhausted all retries",
      );
    } else {
      logger.warn(
        { jobId: job?.id, attemptsMade, error: err.message },
        "Metrics aggregation job failed, will retry",
      );
    }
  });

  worker.on("error", (err) => {
    logger.error({ error: err.message }, "Metrics aggregation worker error");
  });

  const shutdown = async () => {
    logger.info("Shutting down metrics aggregation worker...");
    await worker.close();
    await connection.quit();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info({ cronSchedule: "0 * * * *" }, "Metrics aggregation worker started");
  return worker;
}

// Start worker if running as standalone script
if (process.argv[1]?.includes("metrics-aggregation")) {
  createMetricsAggregationWorker();
}
