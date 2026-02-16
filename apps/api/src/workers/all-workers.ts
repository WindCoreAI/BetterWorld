/**
 * Combined worker entrypoint — starts all BullMQ workers in a single process.
 *
 * Used by Dockerfile.worker to run all background workers on Fly.io.
 * Individual workers can still be run standalone during development.
 */
import pino from "pino";

import { initSentry, captureException } from "../lib/sentry.js";

const logger = pino({ name: "all-workers" });

async function main() {
  // FR-024: Initialize Sentry for worker error tracking
  initSentry();

  logger.info("Starting all BullMQ workers...");

  const { createGuardrailWorker } = await import("./guardrail-worker.js");
  const { createEvidenceVerificationWorker } = await import("./evidence-verification.js");
  const { createFraudScoringWorker } = await import("./fraud-scoring.js");
  const { createReputationDecayWorker } = await import("./reputation-decay.js");
  const { createMetricsAggregationWorker } = await import("./metrics-aggregation.js");
  const { createMissionExpirationWorker } = await import("./mission-expiration.js");
  const { createMunicipalIngestWorker } = await import("./municipal-ingest.js");
  const { createPeerConsensusWorker } = await import("./peer-consensus.js");
  const { createEvaluationTimeoutWorker } = await import("./evaluation-timeout.js");
  const { createCityMetricsWorker } = await import("./city-metrics.js");
  const { createEconomicHealthWorker } = await import("./economic-health-worker.js");
  const { createSpotCheckWorker } = await import("./spot-check-worker.js");
  const { createPrivacyWorker } = await import("./privacy-worker.js");
  const { createPatternAggregationWorker } = await import("./pattern-aggregation-worker.js");
  const { createRateAdjustmentWorker } = await import("./rate-adjustment-worker.js");
  const { createTokenReconciliationWorker } = await import("./token-reconciliation.js");
  const { createCareMomentWorker } = await import("./care-moment-worker.js");
  const { createNotificationRetentionWorker } = await import("./notification-retention-worker.js");
  // Sprint 17: Community Identity & Visible Growth
  const { createMilestoneDetectionWorker } = await import("./milestone-detection-worker.js");
  const { createIntelligenceReportWorker } = await import("./intelligence-report-worker.js");

  const workers = [
    { name: "guardrail", create: createGuardrailWorker },
    { name: "evidence-verification", create: createEvidenceVerificationWorker },
    { name: "fraud-scoring", create: createFraudScoringWorker },
    { name: "reputation-decay", create: createReputationDecayWorker },
    { name: "metrics-aggregation", create: createMetricsAggregationWorker },
    { name: "mission-expiration", create: createMissionExpirationWorker },
    { name: "municipal-ingest", create: createMunicipalIngestWorker },
    // Sprint 11: Shadow Mode workers
    { name: "peer-consensus", create: createPeerConsensusWorker },
    { name: "evaluation-timeout", create: createEvaluationTimeoutWorker },
    { name: "city-metrics", create: createCityMetricsWorker },
    // Sprint 12: Production Shift workers
    { name: "economic-health", create: createEconomicHealthWorker },
    { name: "spot-check", create: createSpotCheckWorker },
    { name: "privacy", create: createPrivacyWorker },
    // Sprint 13: Phase 3 Integration workers
    { name: "pattern-aggregation", create: createPatternAggregationWorker },
    { name: "rate-adjustment", create: createRateAdjustmentWorker },
    // P0-D2: Token balance reconciliation (hourly)
    { name: "token-reconciliation", create: createTokenReconciliationWorker },
    // Sprint 16: Social Fabric Foundation
    { name: "care-moments", create: createCareMomentWorker },
    { name: "notification-retention", create: createNotificationRetentionWorker },
    // Sprint 17: Community Identity & Visible Growth
    { name: "milestone-detection", create: createMilestoneDetectionWorker },
    { name: "intelligence-report", create: createIntelligenceReportWorker },
  ];

  for (const { name, create } of workers) {
    try {
      create();
      logger.info({ worker: name }, "Worker started");
    } catch (err) {
      logger.error({ worker: name, error: (err as Error).message }, "Failed to start worker");
      // FR-024: Report worker startup failures to Sentry
      captureException(err instanceof Error ? err : new Error(String(err)), {
        worker: name,
        phase: "startup",
      });
    }
  }

  logger.info({ count: workers.length }, "All workers initialized");
}

main().catch((err) => {
  logger.error({ error: (err as Error).message }, "Fatal: worker startup failed");
  process.exit(1);
});
