/**
 * Housekeeping schedules.
 *
 * Three workers process jobs that nothing ever enqueued: mission expiration,
 * metrics aggregation and reputation decay each waited on a queue with no
 * producer, so stale claims were never released and the cached impact numbers
 * were never refreshed. This registers their repeatable jobs.
 *
 * upsertJobScheduler is idempotent per scheduler id, so calling this from
 * several processes (or on every restart) keeps exactly one schedule each.
 */
import { QUEUE_NAMES } from "@betterworld/shared";
import { Queue } from "bullmq";
import Redis from "ioredis";
import pino from "pino";

const logger = pino({ name: "schedules" });

interface Schedule {
  queue: string;
  schedulerId: string;
  jobName: string;
  /** Cron pattern (UTC). */
  pattern: string;
}

export function housekeepingSchedules(): Schedule[] {
  return [
    {
      // Releases expired missions and overdue claims, and escalates evidence
      // that has waited too long for peer reviewers.
      queue: process.env.MISSION_EXPIRATION_QUEUE_NAME || QUEUE_NAMES.MISSION_EXPIRATION,
      schedulerId: "mission-expiration-hourly",
      jobName: "expire-missions",
      pattern: "15 * * * *",
    },
    {
      queue: QUEUE_NAMES.METRICS_AGGREGATION,
      schedulerId: "metrics-aggregation-hourly",
      jobName: "aggregate-metrics",
      pattern: "5 * * * *",
    },
    {
      queue: QUEUE_NAMES.REPUTATION_DECAY,
      schedulerId: "reputation-decay-daily",
      jobName: "reputation-decay",
      pattern: "30 2 * * *",
    },
  ];
}

export async function scheduleHousekeepingJobs(redisUrl = process.env.REDIS_URL): Promise<number> {
  if (!redisUrl) {
    logger.warn("REDIS_URL not set — housekeeping schedules not registered");
    return 0;
  }

  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  let registered = 0;

  try {
    for (const s of housekeepingSchedules()) {
      const queue = new Queue(s.queue, { connection });
      try {
        await queue.upsertJobScheduler(
          s.schedulerId,
          { pattern: s.pattern },
          {
            name: s.jobName,
            data: { triggeredBy: "cron" },
            opts: {
              attempts: 3,
              backoff: { type: "exponential", delay: 30_000 },
              removeOnComplete: { count: 50 },
              removeOnFail: { count: 50 },
            },
          },
        );
        registered += 1;
      } finally {
        await queue.close();
      }
    }
    logger.info({ registered }, "Housekeeping schedules registered");
  } finally {
    await connection.quit().catch(() => undefined);
  }

  return registered;
}
