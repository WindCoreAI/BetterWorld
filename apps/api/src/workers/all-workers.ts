/**
 * Combined worker entrypoint — starts all BullMQ workers in a single process.
 *
 * Two ways to run it:
 *   - standalone:  `tsx src/workers/all-workers.ts`  (Dockerfile.worker, `pnpm dev:workers`)
 *   - embedded:    the API process calls startAllWorkers() when EMBEDDED_WORKERS
 *                  is on (the default outside production), so a single process
 *                  runs the whole platform.
 *
 * Every worker is loaded and started in isolation: one worker that cannot be
 * imported or constructed is logged and skipped, it never prevents the others
 * (in particular the guardrail and evidence workers) from starting.
 */
import "../lib/load-env.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pino from "pino";

import { scheduleHousekeepingJobs } from "./schedules.js";
import { initSentry, captureException } from "../lib/sentry.js";

const logger = pino({ name: "all-workers" });

type WorkerFactory = () => unknown;

/** Each entry imports its module lazily so a broken module only costs that worker. */
const WORKERS: Array<{ name: string; load: () => Promise<WorkerFactory> }> = [
  { name: "guardrail", load: async () => (await import("./guardrail-worker.js")).createGuardrailWorker },
  { name: "evidence-verification", load: async () => (await import("./evidence-verification.js")).createEvidenceVerificationWorker },
  { name: "fraud-scoring", load: async () => (await import("./fraud-scoring.js")).createFraudScoringWorker },
  { name: "reputation-decay", load: async () => (await import("./reputation-decay.js")).createReputationDecayWorker },
  { name: "metrics-aggregation", load: async () => (await import("./metrics-aggregation.js")).createMetricsAggregationWorker },
  { name: "mission-expiration", load: async () => (await import("./mission-expiration.js")).createMissionExpirationWorker },
  { name: "municipal-ingest", load: async () => (await import("./municipal-ingest.js")).createMunicipalIngestWorker },
  // Sprint 11: Shadow Mode workers
  { name: "peer-consensus", load: async () => (await import("./peer-consensus.js")).createPeerConsensusWorker },
  { name: "evaluation-timeout", load: async () => (await import("./evaluation-timeout.js")).createEvaluationTimeoutWorker },
  { name: "city-metrics", load: async () => (await import("./city-metrics.js")).createCityMetricsWorker },
  // Sprint 12: Production Shift workers
  { name: "economic-health", load: async () => (await import("./economic-health-worker.js")).createEconomicHealthWorker },
  { name: "spot-check", load: async () => (await import("./spot-check-worker.js")).createSpotCheckWorker },
  { name: "privacy", load: async () => (await import("./privacy-worker.js")).createPrivacyWorker },
  // Sprint 13: Phase 3 Integration workers
  { name: "pattern-aggregation", load: async () => (await import("./pattern-aggregation-worker.js")).createPatternAggregationWorker },
  { name: "rate-adjustment", load: async () => (await import("./rate-adjustment-worker.js")).createRateAdjustmentWorker },
  // P0-D2: Token balance reconciliation (hourly)
  { name: "token-reconciliation", load: async () => (await import("./token-reconciliation.js")).createTokenReconciliationWorker },
  // Sprint 16: Social Fabric Foundation
  { name: "care-moments", load: async () => (await import("./care-moment-worker.js")).createCareMomentWorker },
  { name: "notification-retention", load: async () => (await import("./notification-retention-worker.js")).createNotificationRetentionWorker },
  // Sprint 17: Community Identity & Visible Growth
  { name: "milestone-detection", load: async () => (await import("./milestone-detection-worker.js")).createMilestoneDetectionWorker },
  { name: "intelligence-report", load: async () => (await import("./intelligence-report-worker.js")).createIntelligenceReportWorker },
  // Sprint 18: Cooperative Depth & Governance
  { name: "mentorship-expiry", load: async () => (await import("./mentorship-expiry-worker.js")).createMentorshipExpiryWorker },
  { name: "moderator-eligibility", load: async () => (await import("./moderator-eligibility-worker.js")).createModeratorEligibilityWorker },
  { name: "case-study-curation", load: async () => (await import("./case-study-curation-worker.js")).createCaseStudyCurationWorker },
  { name: "achievement-detection", load: async () => (await import("./achievement-detection-worker.js")).createAchievementDetectionWorker },
  { name: "power-audit", load: async () => (await import("./power-audit-worker.js")).createPowerAuditWorker },
  { name: "agent-fingerprint", load: async () => (await import("./agent-fingerprint-worker.js")).createAgentFingerprintWorker },
  { name: "feed-event-processor", load: async () => (await import("./feed-event-processor-worker.js")).createFeedEventProcessorWorker },
  // Sprint 20: Security Hardening
  { name: "account-deletion", load: async () => (await import("./account-deletion-worker.js")).createAccountDeletionWorker },
];

/** Workers the core loop cannot run without. If one of these fails, say so loudly. */
const ESSENTIAL = new Set(["guardrail", "evidence-verification"]);

export interface WorkerStartupReport {
  started: string[];
  failed: Array<{ name: string; error: string }>;
}

export async function startAllWorkers(): Promise<WorkerStartupReport> {
  // FR-024: Initialize Sentry for worker error tracking
  initSentry();

  // Every worker registers its own SIGTERM/SIGINT handlers.
  process.setMaxListeners(Math.max(process.getMaxListeners(), WORKERS.length * 2 + 20));

  logger.info({ count: WORKERS.length }, "Starting BullMQ workers...");

  const report: WorkerStartupReport = { started: [], failed: [] };

  for (const { name, load } of WORKERS) {
    try {
      const create = await load();
      create();
      report.started.push(name);
      logger.info({ worker: name }, "Worker started");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      report.failed.push({ name, error: message });
      logger.error(
        { worker: name, essential: ESSENTIAL.has(name), error: message },
        ESSENTIAL.has(name)
          ? "ESSENTIAL worker failed to start — submissions will not be processed"
          : "Failed to start worker",
      );
      // FR-024: Report worker startup failures to Sentry
      captureException(err instanceof Error ? err : new Error(message), {
        worker: name,
        phase: "startup",
      });
    }
  }

  try {
    await scheduleHousekeepingJobs();
  } catch (err) {
    logger.error({ error: (err as Error).message }, "Failed to register housekeeping schedules");
  }

  logger.info(
    { started: report.started.length, failed: report.failed.map((f) => f.name) },
    "Workers initialized",
  );

  return report;
}

// Start immediately only when this file is the process entrypoint.
const isEntrypoint =
  !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  startAllWorkers()
    .then((report) => {
      if (report.failed.some((f) => ESSENTIAL.has(f.name))) {
        logger.error("An essential worker failed to start — exiting so the supervisor restarts us");
        process.exit(1);
      }
    })
    .catch((err) => {
      logger.error({ error: (err as Error).message }, "Fatal: worker startup failed");
      process.exit(1);
    });
}
