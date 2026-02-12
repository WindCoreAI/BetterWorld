/**
 * Municipal ingestion worker (Sprint 10)
 *
 * BullMQ worker for Open311 polling.
 * Fetches municipal service requests, transforms, deduplicates, and routes through guardrails.
 */
import { problems } from "@betterworld/db";
import { OPEN311_BATCH_SIZE, OPEN311_CITY_CONFIGS, SYSTEM_MUNICIPAL_AGENT_ID } from "@betterworld/shared";
import { Queue, Worker } from "bullmq";
import { eq, and } from "drizzle-orm";
import Redis from "ioredis";
import pino from "pino";

import { getFlag } from "../services/feature-flags.js";
import {
  Open311Client,
  transformRequestToProblem,
  getLastSyncTimestamp,
  setLastSyncTimestamp,
  trackIngestionStats,
} from "../services/open311.service.js";

const loggerInstance = pino({ name: "municipal-ingest" });

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://betterworld:betterworld_dev@localhost:5432/betterworld";

export interface IngestJobData {
  cityId: string;
}

/**
 * Create the municipal ingestion BullMQ worker.
 */
export function createMunicipalIngestWorker() {
  const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

  const worker = new Worker<IngestJobData>(
    "municipal-ingest",
    async (job) => {
      const { cityId } = job.data;
      loggerInstance.info({ cityId, jobId: job.id }, "Starting municipal ingestion");

      // Check feature flag
      let redis: Redis | null = null;
      try {
        redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });
      } catch {
        loggerInstance.warn("Redis not available for feature flag check");
        return { skipped: true, reason: "redis_unavailable" };
      }

      try {
        const enabled = await getFlag(redis, "HYPERLOCAL_INGESTION_ENABLED");
        if (!enabled) {
          loggerInstance.info({ cityId }, "Ingestion disabled via feature flag, skipping");
          return { skipped: true, reason: "feature_disabled" };
        }

        const cityConfig = OPEN311_CITY_CONFIGS[cityId];
        if (!cityConfig) {
          loggerInstance.error({ cityId }, "Unknown city configuration");
          return { error: "unknown_city" };
        }

        const client = new Open311Client();

        // Get last sync timestamp
        const lastSync = await getLastSyncTimestamp(redis, cityId);
        const startDate = lastSync || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // Fetch requests
        const requests = await client.fetchRequests(
          cityConfig.endpoint,
          { start_date: startDate, status: "open" },
          cityConfig.apiKey,
        );

        loggerInstance.info(
          { cityId, fetchedCount: requests.length },
          "Fetched Open311 requests",
        );

        // Initialize DB for processing
        const { drizzle } = await import("drizzle-orm/postgres-js");
        const postgres = (await import("postgres")).default;
        const pgClient = postgres(DATABASE_URL, {
          connection: { statement_timeout: 30000 },
        });
        const db = drizzle(pgClient);

        let ingested = 0;
        let skipped = 0;
        let errors = 0;

        // Process in batches
        const batches = [];
        for (let i = 0; i < requests.length; i += OPEN311_BATCH_SIZE) {
          batches.push(requests.slice(i, i + OPEN311_BATCH_SIZE));
        }

        for (const batch of batches) {
          for (const request of batch) {
            try {
              // Transform
              const problemData = transformRequestToProblem(request, cityConfig);
              if (!problemData) {
                skipped++;
                continue;
              }

              // Dedup check
              const existing = await db
                .select({ id: problems.id })
                .from(problems)
                .where(
                  and(
                    eq(problems.municipalSourceType, problemData.municipalSourceType),
                    eq(problems.municipalSourceId, problemData.municipalSourceId),
                  ),
                )
                .limit(1);

              if (existing.length > 0) {
                skipped++;
                continue;
              }

              // Insert as pending (goes through guardrail pipeline)
              await db.insert(problems).values({
                reportedByAgentId: SYSTEM_MUNICIPAL_AGENT_ID,
                title: problemData.title,
                description: problemData.description,
                domain: problemData.domain as never,
                severity: problemData.severity as never,
                geographicScope: problemData.geographicScope,
                latitude: problemData.latitude,
                longitude: problemData.longitude,
                locationName: problemData.address,
                municipalSourceId: problemData.municipalSourceId,
                municipalSourceType: problemData.municipalSourceType,
                guardrailStatus: "pending",
              });

              ingested++;
            } catch (err) {
              errors++;
              loggerInstance.warn(
                { error: err instanceof Error ? err.message : "Unknown", requestId: request.service_request_id },
                "Failed to process Open311 request",
              );
            }
          }
        }

        // Update sync timestamp
        await setLastSyncTimestamp(redis, cityId, new Date().toISOString());

        // Track stats
        await trackIngestionStats(redis, cityId, { ingested, skipped, errors });

        loggerInstance.info(
          { cityId, ingested, skipped, errors },
          "Municipal ingestion complete",
        );

        await pgClient.end();

        return { ingested, skipped, errors };
      } finally {
        if (redis) {
          await redis.quit();
        }
      }
    },
    {
      connection,
      concurrency: 1,
      limiter: { max: 1, duration: 60000 },
    },
  );

  worker.on("failed", (job, err) => {
    loggerInstance.error(
      { jobId: job?.id, cityId: job?.data.cityId, error: err.message },
      "Municipal ingestion job failed",
    );
  });

  return worker;
}

/**
 * Register repeatable jobs for Open311 ingestion.
 */
export async function registerOpen311RepeatableJobs() {
  const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue<IngestJobData>("municipal-ingest", { connection });

  for (const [cityId, config] of Object.entries(OPEN311_CITY_CONFIGS)) {
    await queue.add(
      `ingest-${cityId}`,
      { cityId },
      {
        repeat: { every: config.pollingIntervalMs },
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 50 },
      },
    );

    loggerInstance.info(
      { cityId, intervalMs: config.pollingIntervalMs },
      "Registered Open311 repeatable job",
    );
  }

  await connection.quit();
}
