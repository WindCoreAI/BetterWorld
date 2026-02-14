/**
 * Fraud scoring BullMQ queue
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

export function getFraudScoringQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAMES.FRAUD_SCORING, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return queue;
}
