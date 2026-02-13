/**
 * Pattern Aggregation Worker (Sprint 13 — Phase 3 Integration)
 *
 * BullMQ repeatable worker that runs daily at 3 AM UTC.
 * For each enabled city + domain combination, discovers and updates
 * problem clusters and flags systemic issues.
 *
 * Feature-flagged via PATTERN_AGGREGATION_ENABLED.
 */
import { ALLOWED_DOMAINS, OPEN311_CITY_CONFIGS, QUEUE_NAMES } from "@betterworld/shared";
import { Worker } from "bullmq";
import Redis from "ioredis";
import pino from "pino";

import { getDb, initDb } from "../lib/container.js";
import { findClusters, generateClusterSummary } from "../services/pattern-aggregation.js";

const logger = pino({ name: "pattern-aggregation-worker" });

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://betterworld:betterworld_dev@localhost:5432/betterworld";

/**
 * Check if pattern aggregation is enabled via Redis feature flag.
 */
async function isPatternAggregationEnabled(redis: Redis): Promise<boolean> {
  try {
    const value = await redis.get("feature-flag:PATTERN_AGGREGATION_ENABLED");
    if (value !== null) {
      return JSON.parse(value) === true;
    }
  } catch {
    // Fall through to env var
  }

  // Env var fallback
  const envValue = process.env.PHASE3_PATTERN_AGGREGATION_ENABLED;
  if (envValue === "true") return true;
  if (envValue === "false") return false;

  // Default: disabled
  return false;
}

export function createPatternAggregationWorker(): Worker {
  const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

  initDb(DATABASE_URL);

  const worker = new Worker(
    QUEUE_NAMES.PATTERN_AGGREGATION,
    async () => {
      // 1. Check feature flag (reuse worker's Redis connection)
      const enabled = await isPatternAggregationEnabled(connection);
      if (!enabled) {
        logger.info("Pattern aggregation disabled via feature flag; skipping");
        return { skipped: true };
      }

      // 2. Get DB connection
      const db = getDb();
      if (!db) {
        throw new Error("Database not initialized");
      }

      // 3. Get enabled city configs
      const enabledCities = Object.entries(OPEN311_CITY_CONFIGS)
        .filter(([, config]) => config.enabled)
        .map(([id]) => id);

      // Even if cities are not "enabled" for ingestion, we still cluster their existing data
      const allCityIds = Object.keys(OPEN311_CITY_CONFIGS);
      const citiesToProcess = allCityIds.length > 0 ? allCityIds : enabledCities;

      logger.info(
        { cityCount: citiesToProcess.length, domains: ALLOWED_DOMAINS.length },
        "Starting pattern aggregation run",
      );

      let totalClusters = 0;
      let totalSystemic = 0;
      let totalNew = 0;

      // 4. For each city + domain combination, run clustering
      for (const cityId of citiesToProcess) {
        for (const domain of ALLOWED_DOMAINS) {
          try {
            const clusters = await findClusters(db, domain, cityId);

            totalClusters += clusters.length;
            totalSystemic += clusters.filter((c) => c.isSystemic).length;
            totalNew += clusters.filter((c) => c.isNew).length;

            // Generate summaries for new clusters
            for (const cluster of clusters) {
              if (cluster.isNew && cluster.memberProblemIds.length > 0) {
                // Generate a basic summary (AI-generated summary gated by future flag)
                const summary = generateClusterSummary(
                  cluster.memberProblemIds.map((_id) => ({
                    title: cluster.title,
                    description: "",
                    locationName: null,
                  })),
                );
                logger.debug(
                  { clusterId: cluster.id, summary },
                  "Generated cluster summary",
                );
              }
            }
          } catch (err) {
            logger.error(
              { cityId, domain, error: (err as Error).message },
              "Failed to cluster domain in city",
            );
          }
        }
      }

      logger.info(
        { totalClusters, totalSystemic, totalNew, citiesToProcess },
        "Pattern aggregation run complete",
      );

      return { totalClusters, totalSystemic, totalNew };
    },
    {
      connection,
      concurrency: 1,
    },
  );

  // Set up repeatable job (daily at 3 AM UTC)
  import("bullmq").then(({ Queue: Q }) => {
    const schedulerQueue = new Q(QUEUE_NAMES.PATTERN_AGGREGATION, {
      connection: new Redis(REDIS_URL, { maxRetriesPerRequest: null }),
    });
    schedulerQueue
      .add(
        "daily-clustering",
        {},
        {
          repeat: { pattern: "0 3 * * *" },
          removeOnComplete: { count: 7 },
          removeOnFail: { count: 10 },
        },
      )
      .catch((err) => {
        logger.error(
          { error: (err as Error).message },
          "Failed to schedule repeatable pattern aggregation job",
        );
      });
  });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Pattern aggregation job completed");
  });

  worker.on("failed", (job, err) => {
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 3;

    if (attemptsMade >= maxAttempts) {
      logger.error(
        { jobId: job?.id, attemptsMade, maxAttempts, error: err.message },
        "DEAD LETTER: Pattern aggregation job exhausted all retries",
      );
    } else {
      logger.warn(
        { jobId: job?.id, attemptsMade, error: err.message },
        "Pattern aggregation job failed, will retry",
      );
    }
  });

  worker.on("error", (err) => {
    logger.error({ error: err.message }, "Worker error");
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down pattern aggregation worker...");
    await worker.close();
    await connection.quit();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info("Pattern aggregation worker started (daily 3 AM UTC schedule)");

  return worker;
}

// Start worker if running as standalone script
if (process.argv[1]?.includes("pattern-aggregation")) {
  createPatternAggregationWorker();
}
