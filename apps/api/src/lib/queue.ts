/* eslint-disable complexity, max-lines-per-function */
import { QUEUE_NAMES } from "@betterworld/shared";
import { Queue } from "bullmq";
import Redis from "ioredis";
import pino from "pino";

const logger = pino({ name: "guardrail-queue" });

// Lazy-initialized Redis connection and queue
let redisConnection: Redis | null = null;
let queue: Queue | null = null;

function getRedisConnection(): Redis {
  if (!redisConnection) {
    redisConnection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: null, // Required for BullMQ
      lazyConnect: true, // Defer TCP connection until first command
    });
  }
  return redisConnection;
}

export function getGuardrailEvaluationQueue(): Queue {
  if (!queue) {
    queue = new Queue(
      process.env.BULLMQ_QUEUE_NAME || QUEUE_NAMES.GUARDRAIL_EVALUATION,
      {
        connection: getRedisConnection(),
        defaultJobOptions: {
          attempts: 3, // Retry up to 3 times
          backoff: {
            type: "exponential",
            delay: 1000, // Start with 1s, then 2s, 4s
          },
          removeOnComplete: 1000, // Keep last 1000 completed jobs for audit
          removeOnFail: false, // Keep failed jobs for investigation
        },
      },
    );
  }
  return queue;
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, closing guardrail evaluation queue");
  if (queue) await queue.close();
  if (redisConnection) await redisConnection.quit();
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, closing guardrail evaluation queue");
  if (queue) await queue.close();
  if (redisConnection) await redisConnection.quit();
});
