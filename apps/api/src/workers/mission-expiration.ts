import { missions, missionClaims } from "@betterworld/db";
import { QUEUE_NAMES } from "@betterworld/shared";
import { Worker, type Job } from "bullmq";
import { and, eq, lt, sql, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import Redis from "ioredis";

import { initDb, getDb } from "../lib/container.js";
import { logger } from "../middleware/logger.js";

// --- Types ---

export interface ExpirationJobData {
  triggeredBy: "cron" | "manual";
}

export interface ExpirationResult {
  processedCount: number;
  expiredCount: number;
  skippedCount: number;
  releasedClaimsCount: number;
}

// --- Core processing logic ---

const BATCH_SIZE = 100;

export async function processMissionExpiration(
  dbOverride?: PostgresJsDatabase | null,
): Promise<ExpirationResult> {
  const db = dbOverride ?? getDb();
  if (!db) {
    throw new Error("Database not initialized — call initDb() before processing jobs");
  }

  const now = new Date();
  const result: ExpirationResult = {
    processedCount: 0,
    expiredCount: 0,
    skippedCount: 0,
    releasedClaimsCount: 0,
  };

  logger.info("Starting mission expiration sweep");

  // Query expired missions in batches
  let hasMore = true;
  while (hasMore) {
    const expiredMissions = await db
      .select({ id: missions.id, currentClaimCount: missions.currentClaimCount })
      .from(missions)
      .where(
        and(
          eq(missions.status, "open"),
          lt(missions.expiresAt, now),
        ),
      )
      .limit(BATCH_SIZE);

    if (expiredMissions.length === 0) {
      hasMore = false;
      break;
    }

    // Batch-fetch active claims for all expired missions (avoid N+1)
    const expiredMissionIds = expiredMissions.map((m) => m.id);
    const allActiveClaims = expiredMissionIds.length > 0
      ? await db
          .select({
            id: missionClaims.id,
            missionId: missionClaims.missionId,
            deadlineAt: missionClaims.deadlineAt,
          })
          .from(missionClaims)
          .where(
            and(
              inArray(missionClaims.missionId, expiredMissionIds),
              eq(missionClaims.status, "active"),
            ),
          )
      : [];

    // Group claims by missionId
    const claimsByMission = new Map<string, typeof allActiveClaims>();
    for (const claim of allActiveClaims) {
      const existing = claimsByMission.get(claim.missionId) ?? [];
      existing.push(claim);
      claimsByMission.set(claim.missionId, existing);
    }

    for (const mission of expiredMissions) {
      result.processedCount++;

      // Check for active claims with deadlineAt > NOW() (7-day grace period)
      const activeClaims = claimsByMission.get(mission.id) ?? [];
      const hasGracePeriodClaims = activeClaims.some(
        (claim) => claim.deadlineAt && new Date(claim.deadlineAt) > now,
      );

      if (hasGracePeriodClaims) {
        // Mission has active claims still within their deadline — skip
        logger.info(
          { missionId: mission.id, activeClaimsCount: activeClaims.length },
          "Skipping mission: active claims still within grace period",
        );
        result.skippedCount++;
        continue;
      }

      // Expire the mission and release any remaining active/submitted claims
      await db.transaction(async (tx) => {
        // Update mission status to expired
        await tx
          .update(missions)
          .set({ status: "expired", updatedAt: new Date() })
          .where(eq(missions.id, mission.id));

        // Release active and submitted claims
        const releasedResult = await tx.execute(
          sql`UPDATE mission_claims
              SET status = 'released', updated_at = NOW()
              WHERE mission_id = ${mission.id}
                AND status IN ('active', 'submitted')
              RETURNING id`,
        );

        const releasedCount = (releasedResult as unknown as Array<{ id: string }>).length;
        result.releasedClaimsCount += releasedCount;

        // Decrement currentClaimCount by released count
        if (releasedCount > 0) {
          await tx
            .update(missions)
            .set({
              currentClaimCount: sql`GREATEST(${missions.currentClaimCount} - ${releasedCount}, 0)`,
            })
            .where(eq(missions.id, mission.id));
        }

        // Log refund placeholder — agents don't have token balances in current schema
        if (releasedCount > 0) {
          logger.warn(
            { missionId: mission.id, releasedCount },
            "TODO: Refund token rewards to mission creator (agent token balances not yet implemented)",
          );
        }

        logger.info(
          { missionId: mission.id, releasedCount },
          "Mission expired and claims released",
        );
      });

      result.expiredCount++;
    }

    // If we got less than BATCH_SIZE, there are no more to process
    if (expiredMissions.length < BATCH_SIZE) {
      hasMore = false;
    }
  }

  logger.info(
    {
      processedCount: result.processedCount,
      expiredCount: result.expiredCount,
      skippedCount: result.skippedCount,
      releasedClaimsCount: result.releasedClaimsCount,
    },
    "Mission expiration sweep complete",
  );

  return result;
}

// --- Queue Monitoring Metrics ---

export interface WorkerMetrics {
  jobsCompleted: number;
  jobsFailed: number;
  jobsDeadLettered: number;
  totalProcessingTimeMs: number;
  totalExpired: number;
  totalSkipped: number;
  totalReleasedClaims: number;
  startedAt: number;
}

export function createMetrics(): WorkerMetrics {
  return {
    jobsCompleted: 0,
    jobsFailed: 0,
    jobsDeadLettered: 0,
    totalProcessingTimeMs: 0,
    totalExpired: 0,
    totalSkipped: 0,
    totalReleasedClaims: 0,
    startedAt: Date.now(),
  };
}

// --- Worker initialization ---

export function createMissionExpirationWorker(): Worker<ExpirationJobData> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL environment variable is required");
  }
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queueName = process.env.MISSION_EXPIRATION_QUEUE_NAME || QUEUE_NAMES.MISSION_EXPIRATION;
  const metrics = createMetrics();

  // Initialize DB connection once at worker startup (singleton)
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  initDb(databaseUrl);

  // Processor wrapper: delegates to processMissionExpiration and updates metrics
  const processor = async (_job: Job<ExpirationJobData>) => {
    const startTime = Date.now();
    const result = await processMissionExpiration();
    const processingTimeMs = Date.now() - startTime;

    metrics.totalProcessingTimeMs += processingTimeMs;
    metrics.totalExpired += result.expiredCount;
    metrics.totalSkipped += result.skippedCount;
    metrics.totalReleasedClaims += result.releasedClaimsCount;

    return result;
  };

  const worker = new Worker<ExpirationJobData>(queueName, processor, {
    connection,
    concurrency: 1, // Only one expiration sweep at a time
  });

  worker.on("completed", (job) => {
    metrics.jobsCompleted++;
    logger.info({ jobId: job.id }, "Mission expiration job completed");
  });

  worker.on("failed", async (job, err) => {
    metrics.jobsFailed++;
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 3;

    if (attemptsMade >= maxAttempts) {
      metrics.jobsDeadLettered++;
      logger.error(
        {
          jobId: job?.id,
          attemptsMade,
          maxAttempts,
          error: err.message,
          stack: err.stack,
        },
        "DEAD LETTER: Mission expiration job exhausted all retries — requires manual review",
      );
    } else {
      logger.warn(
        {
          jobId: job?.id,
          attemptsMade,
          maxAttempts,
          error: err.message,
        },
        "Mission expiration job failed, will retry",
      );
    }
  });

  worker.on("error", (err) => {
    logger.error({ error: err.message }, "Mission expiration worker error");
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
        totalExpired: metrics.totalExpired,
        totalSkipped: metrics.totalSkipped,
        totalReleasedClaims: metrics.totalReleasedClaims,
      },
      "Mission expiration worker metrics snapshot",
    );
  }, 60_000);
  metricsInterval.unref(); // Don't prevent process exit

  // Graceful shutdown — let event loop drain naturally
  const shutdown = async () => {
    logger.info("Shutting down mission expiration worker...");
    clearInterval(metricsInterval);
    await worker.close();
    await connection.quit();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info({ queueName, cronSchedule: "0 2 * * *" }, "Mission expiration worker started");

  // Expose cleanup for tests
  (worker as Worker<ExpirationJobData> & { cleanup: () => Promise<void> }).cleanup = async () => {
    clearInterval(metricsInterval);
  };

  return worker;
}

// Start worker if running as standalone script
if (process.argv[1]?.includes("mission-expiration")) {
  createMissionExpirationWorker();
}
