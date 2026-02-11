/**
 * Combined worker entrypoint — starts all BullMQ workers in a single process.
 *
 * Used by Dockerfile.worker to run all background workers on Fly.io.
 * Individual workers can still be run standalone during development.
 */
import pino from "pino";

const logger = pino({ name: "all-workers" });

async function main() {
  logger.info("Starting all BullMQ workers...");

  const { createGuardrailWorker } = await import("./guardrail-worker.js");
  const { createEvidenceVerificationWorker } = await import("./evidence-verification.js");
  const { createFraudScoringWorker } = await import("./fraud-scoring.js");
  const { createReputationDecayWorker } = await import("./reputation-decay.js");
  const { createMetricsAggregationWorker } = await import("./metrics-aggregation.js");

  const workers = [
    { name: "guardrail", create: createGuardrailWorker },
    { name: "evidence-verification", create: createEvidenceVerificationWorker },
    { name: "fraud-scoring", create: createFraudScoringWorker },
    { name: "reputation-decay", create: createReputationDecayWorker },
    { name: "metrics-aggregation", create: createMetricsAggregationWorker },
  ];

  for (const { name, create } of workers) {
    try {
      create();
      logger.info({ worker: name }, "Worker started");
    } catch (err) {
      logger.error({ worker: name, error: (err as Error).message }, "Failed to start worker");
    }
  }

  logger.info({ count: workers.length }, "All workers initialized");
}

main().catch((err) => {
  logger.error({ error: (err as Error).message }, "Fatal: worker startup failed");
  process.exit(1);
});
