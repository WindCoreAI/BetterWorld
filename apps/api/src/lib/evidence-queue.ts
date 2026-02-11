/**
 * Evidence verification BullMQ queue (Sprint 8)
 */

import { QUEUE_NAMES } from "@betterworld/shared";
import { Queue } from "bullmq";
import Redis from "ioredis";

let redisConnection: Redis | null = null;
let queue: Queue | null = null;

function getRedisConnection(): Redis {
  if (!redisConnection) {
    redisConnection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
  }
  return redisConnection;
}

export function getEvidenceVerificationQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAMES.EVIDENCE_AI_VERIFY, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: false,
      },
    });
  }
  return queue;
}
