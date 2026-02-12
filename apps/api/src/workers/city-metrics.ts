/**
 * City Metrics Aggregation Worker (Sprint 11 — T041)
 *
 * BullMQ repeating job (daily at 6AM UTC) that aggregates
 * city-level metrics for local dashboards.
 */
import { QUEUE_NAMES } from "@betterworld/shared";
import { Queue, Worker } from "bullmq";
import { sql } from "drizzle-orm";
import Redis from "ioredis";
import pino from "pino";

import { initDb, getDb } from "../lib/container.js";

const logger = pino({ name: "city-metrics" });

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://betterworld:betterworld_dev@localhost:5432/betterworld";

const SUPPORTED_CITIES = [
  { id: "portland", displayName: "Portland, OR", center: { lat: 45.5152, lng: -122.6784 } },
  { id: "chicago", displayName: "Chicago, IL", center: { lat: 41.8781, lng: -87.6298 } },
];

// City bounding boxes (approximate)
const CITY_BOUNDS: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
  portland: { minLat: 45.4, maxLat: 45.7, minLng: -122.9, maxLng: -122.4 },
  chicago: { minLat: 41.6, maxLat: 42.1, minLng: -87.9, maxLng: -87.4 },
};

/**
 * Create the city metrics aggregation worker.
 */
export function createCityMetricsWorker(): Worker {
  const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

  initDb(DATABASE_URL);

  // Create queue and add daily repeating job
  const queue = new Queue(QUEUE_NAMES.CITY_METRICS, { connection: connection.duplicate() });
  queue.upsertJobScheduler(
    "city-metrics-daily",
    { pattern: "0 6 * * *" }, // Daily at 6 AM UTC
    { data: {} },
  ).catch((err) => {
    logger.error({ error: (err as Error).message }, "Failed to set up city metrics scheduler");
  });

  const worker = new Worker(
    QUEUE_NAMES.CITY_METRICS,
    async () => {
      const db = getDb();
      if (!db) {
        logger.warn("Database not available, skipping city metrics aggregation");
        return;
      }

      let redis: Redis | null = null;
      try {
        redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: true });
        await redis.connect();
      } catch {
        logger.warn("Redis not available for caching city metrics");
      }

      for (const city of SUPPORTED_CITIES) {
        try {
          const bounds = CITY_BOUNDS[city.id];
          if (!bounds) continue;

          // Problems by category for this city
          const problemsByCategory = await db.execute(sql`
            SELECT domain, COUNT(*) as count
            FROM problems
            WHERE (municipal_source_type = ${city.id}
              OR (latitude IS NOT NULL
                  AND CAST(latitude AS float) >= ${bounds.minLat}
                  AND CAST(latitude AS float) <= ${bounds.maxLat}
                  AND CAST(longitude AS float) >= ${bounds.minLng}
                  AND CAST(longitude AS float) <= ${bounds.maxLng}))
            GROUP BY domain
            ORDER BY count DESC
          `);

          // Avg resolution time
          const resolutionResult = await db.execute(sql`
            SELECT AVG(EXTRACT(DAY FROM (updated_at - created_at))) as avg_days
            FROM problems
            WHERE status = 'resolved'
              AND (municipal_source_type = ${city.id}
                OR (latitude IS NOT NULL
                    AND CAST(latitude AS float) >= ${bounds.minLat}
                    AND CAST(latitude AS float) <= ${bounds.maxLat}
                    AND CAST(longitude AS float) >= ${bounds.minLng}
                    AND CAST(longitude AS float) <= ${bounds.maxLng}))
          `);

          const resolution = (resolutionResult as Array<Record<string, string>>)[0];

          // Total observations for this city area
          const obsResult = await db.execute(sql`
            SELECT COUNT(*) as count
            FROM observations
            WHERE gps_lat >= ${bounds.minLat} AND gps_lat <= ${bounds.maxLat}
              AND gps_lng >= ${bounds.minLng} AND gps_lng <= ${bounds.maxLng}
          `);

          const obsCount = Number((obsResult as Array<Record<string, string>>)[0]?.count ?? 0);

          // Active local validators
          const validatorResult = await db.execute(sql`
            SELECT COUNT(*) as count
            FROM validator_pool
            WHERE home_region_name LIKE ${`%${city.displayName.split(",")[0]}%`}
              AND is_active = true
          `);

          const validatorCount = Number((validatorResult as Array<Record<string, string>>)[0]?.count ?? 0);

          // Total problems
          const totalResult = await db.execute(sql`
            SELECT COUNT(*) as count
            FROM problems
            WHERE municipal_source_type = ${city.id}
              OR (latitude IS NOT NULL
                  AND CAST(latitude AS float) >= ${bounds.minLat}
                  AND CAST(latitude AS float) <= ${bounds.maxLat}
                  AND CAST(longitude AS float) >= ${bounds.minLng}
                  AND CAST(longitude AS float) <= ${bounds.maxLng})
          `);

          const totalProblems = Number((totalResult as Array<Record<string, string>>)[0]?.count ?? 0);

          // Heatmap data
          const heatmapResult = await db.execute(sql`
            SELECT
              CAST(latitude AS float) as lat,
              CAST(longitude AS float) as lng,
              1.0 as intensity
            FROM problems
            WHERE latitude IS NOT NULL AND longitude IS NOT NULL
              AND (municipal_source_type = ${city.id}
                OR (CAST(latitude AS float) >= ${bounds.minLat}
                    AND CAST(latitude AS float) <= ${bounds.maxLat}
                    AND CAST(longitude AS float) >= ${bounds.minLng}
                    AND CAST(longitude AS float) <= ${bounds.maxLng}))
            LIMIT 500
          `);

          const metricsData = {
            city: city.id,
            displayName: city.displayName,
            metrics: {
              problemsByCategory: (problemsByCategory as Array<Record<string, string>>).map((r) => ({
                domain: r.domain ?? "unknown",
                count: Number(r.count ?? 0),
              })),
              avgResolutionTimeDays: resolution?.avg_days ? Number(Number(resolution.avg_days).toFixed(1)) : null,
              activeLocalValidators: validatorCount,
              totalProblems,
              totalObservations: obsCount,
            },
            heatmap: (heatmapResult as Array<Record<string, number>>).map((r) => ({
              lat: Number(r.lat),
              lng: Number(r.lng),
              intensity: Number(r.intensity ?? 0.5),
            })),
            lastAggregatedAt: new Date().toISOString(),
          };

          // Cache in Redis
          if (redis) {
            try {
              await redis.setex(
                `betterworld:city:metrics:${city.id}`,
                3600, // 1 hour TTL
                JSON.stringify(metricsData),
              );
            } catch {
              // Non-fatal
            }
          }

          logger.info(
            { city: city.id, totalProblems, categories: (problemsByCategory as unknown[]).length },
            "City metrics aggregated",
          );
        } catch (err) {
          logger.error(
            { city: city.id, error: (err as Error).message },
            "Failed to aggregate metrics for city",
          );
        }
      }

      if (redis) {
        await redis.quit();
      }
    },
    { connection },
  );

  worker.on("failed", (job, err) => {
    logger.error({ error: err.message }, "City metrics job failed");
  });

  worker.on("error", (err) => {
    logger.error({ error: err.message }, "Worker error");
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down city metrics worker...");
    await worker.close();
    await queue.close();
    await connection.quit();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info("City metrics worker started (daily at 6AM UTC)");

  return worker;
}

// Start worker if running as standalone script
if (process.argv[1]?.includes("city-metrics")) {
  createCityMetricsWorker();
}
