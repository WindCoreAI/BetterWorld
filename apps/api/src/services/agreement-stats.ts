/* eslint-disable complexity */
/**
 * Agreement Statistics Service (Sprint 11 — T029, T030, T053)
 *
 * Computes agreement rates between peer consensus and Layer B.
 * Includes latency percentiles and pipeline health metrics.
 */
import { QUEUE_NAMES } from "@betterworld/shared";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type Redis from "ioredis";
import pino from "pino";

const logger = pino({ name: "agreement-stats" });

const CACHE_TTL = 300; // 5 minutes

// ============================================================================
// Agreement Stats — T029
// ============================================================================

export interface AgreementStats {
  overall: {
    totalSubmissions: number;
    agreements: number;
    disagreements: number;
    agreementRate: number;
    peerApproveLayerBReject: number;
    peerRejectLayerBApprove: number;
  };
  byDomain: Array<{
    domain: string;
    totalSubmissions: number;
    agreements: number;
    agreementRate: number;
  }>;
  bySubmissionType: Array<{
    submissionType: string;
    totalSubmissions: number;
    agreements: number;
    agreementRate: number;
  }>;
  period: { from: string; to: string };
}

export async function getAgreementStats(
  db: PostgresJsDatabase,
  redis: Redis | null,
  fromDate: string,
  toDate: string,
): Promise<AgreementStats> {
  // Check cache
  const cacheKey = `betterworld:shadow:agreement:${fromDate}:${toDate}`;
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {
      // Cache miss
    }
  }

  const from = new Date(fromDate);
  const to = new Date(toDate + "T23:59:59.999Z");

  // Overall stats
  const overallResult = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE agrees_with_layer_b = true) as agreements,
      COUNT(*) FILTER (WHERE agrees_with_layer_b = false) as disagreements,
      COUNT(*) FILTER (WHERE agrees_with_layer_b = false AND decision = 'approved' AND layer_b_decision IN ('rejected', 'flagged')) as peer_approve_lb_reject,
      COUNT(*) FILTER (WHERE agrees_with_layer_b = false AND decision IN ('rejected', 'escalated') AND layer_b_decision = 'approved') as peer_reject_lb_approve
    FROM consensus_results
    WHERE created_at >= ${from} AND created_at <= ${to}
      AND layer_b_decision IS NOT NULL
  `);

  const overall = (overallResult as Array<Record<string, string>>)[0] ?? {};
  const totalSubmissions = Number(overall.total ?? 0);
  const agreements = Number(overall.agreements ?? 0);

  // By domain — join through problems table for domain info
  const byDomainResult = await db.execute(sql`
    SELECT
      COALESCE(p.domain, 'unknown') as domain,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE cr.agrees_with_layer_b = true) as agreements
    FROM consensus_results cr
    LEFT JOIN problems p ON cr.submission_id = p.id AND cr.submission_type = 'problem'
    WHERE cr.created_at >= ${from} AND cr.created_at <= ${to}
      AND cr.layer_b_decision IS NOT NULL
    GROUP BY p.domain
    ORDER BY total DESC
  `);

  // By submission type
  const byTypeResult = await db.execute(sql`
    SELECT
      submission_type,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE agrees_with_layer_b = true) as agreements
    FROM consensus_results
    WHERE created_at >= ${from} AND created_at <= ${to}
      AND layer_b_decision IS NOT NULL
    GROUP BY submission_type
  `);

  const stats: AgreementStats = {
    overall: {
      totalSubmissions,
      agreements,
      disagreements: Number(overall.disagreements ?? 0),
      agreementRate: totalSubmissions > 0 ? agreements / totalSubmissions : 0,
      peerApproveLayerBReject: Number(overall.peer_approve_lb_reject ?? 0),
      peerRejectLayerBApprove: Number(overall.peer_reject_lb_approve ?? 0),
    },
    byDomain: (byDomainResult as Array<Record<string, string>>).map((r) => ({
      domain: r.domain ?? "unknown",
      totalSubmissions: Number(r.total ?? 0),
      agreements: Number(r.agreements ?? 0),
      agreementRate: Number(r.total ?? 0) > 0 ? Number(r.agreements ?? 0) / Number(r.total ?? 0) : 0,
    })),
    bySubmissionType: (byTypeResult as Array<Record<string, string>>).map((r) => ({
      submissionType: r.submission_type ?? "unknown",
      totalSubmissions: Number(r.total ?? 0),
      agreements: Number(r.agreements ?? 0),
      agreementRate: Number(r.total ?? 0) > 0 ? Number(r.agreements ?? 0) / Number(r.total ?? 0) : 0,
    })),
    period: { from: fromDate, to: toDate },
  };

  // Cache result
  if (redis) {
    try {
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(stats));
    } catch {
      // Non-fatal
    }
  }

  return stats;
}

// ============================================================================
// Latency Stats — T030
// ============================================================================

export interface LatencyStats {
  consensusLatency: {
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    avgMs: number;
    totalSamples: number;
  };
  validatorResponseTime: {
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    avgMs: number;
    totalResponses: number;
  };
  quorumStats: {
    totalAttempts: number;
    quorumMet: number;
    quorumTimeout: number;
    quorumSuccessRate: number;
  };
}

export async function getLatencyStats(
  db: PostgresJsDatabase,
  redis: Redis | null,
  fromDate: string,
  toDate: string,
): Promise<LatencyStats> {
  // Check cache
  const cacheKey = `betterworld:shadow:latency:${fromDate}:${toDate}`;
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {
      // Cache miss
    }
  }

  const from = new Date(fromDate);
  const to = new Date(toDate + "T23:59:59.999Z");

  // Consensus latency percentiles
  const latencyResult = await db.execute(sql`
    SELECT
      COALESCE(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY consensus_latency_ms), 0) as p50,
      COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY consensus_latency_ms), 0) as p95,
      COALESCE(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY consensus_latency_ms), 0) as p99,
      COALESCE(AVG(consensus_latency_ms), 0) as avg_ms,
      COUNT(*) as total
    FROM consensus_results
    WHERE created_at >= ${from} AND created_at <= ${to}
      AND consensus_latency_ms IS NOT NULL
  `);

  const latency = (latencyResult as Array<Record<string, string>>)[0] ?? {};

  // Validator response time (responded_at - assigned_at)
  const responseResult = await db.execute(sql`
    SELECT
      COALESCE(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (responded_at - assigned_at)) * 1000), 0) as p50,
      COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (responded_at - assigned_at)) * 1000), 0) as p95,
      COALESCE(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (responded_at - assigned_at)) * 1000), 0) as p99,
      COALESCE(AVG(EXTRACT(EPOCH FROM (responded_at - assigned_at)) * 1000), 0) as avg_ms,
      COUNT(*) as total
    FROM peer_evaluations
    WHERE responded_at IS NOT NULL
      AND assigned_at >= ${from} AND assigned_at <= ${to}
  `);

  const response = (responseResult as Array<Record<string, string>>)[0] ?? {};

  // Quorum stats
  const quorumResult = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE escalation_reason IS NULL OR escalation_reason != 'quorum_timeout') as quorum_met,
      COUNT(*) FILTER (WHERE escalation_reason = 'quorum_timeout') as quorum_timeout
    FROM consensus_results
    WHERE created_at >= ${from} AND created_at <= ${to}
  `);

  const quorum = (quorumResult as Array<Record<string, string>>)[0] ?? {};
  const totalAttempts = Number(quorum.total ?? 0);
  const quorumMet = Number(quorum.quorum_met ?? 0);

  const stats: LatencyStats = {
    consensusLatency: {
      p50Ms: Math.round(Number(latency.p50 ?? 0)),
      p95Ms: Math.round(Number(latency.p95 ?? 0)),
      p99Ms: Math.round(Number(latency.p99 ?? 0)),
      avgMs: Math.round(Number(latency.avg_ms ?? 0)),
      totalSamples: Number(latency.total ?? 0),
    },
    validatorResponseTime: {
      p50Ms: Math.round(Number(response.p50 ?? 0)),
      p95Ms: Math.round(Number(response.p95 ?? 0)),
      p99Ms: Math.round(Number(response.p99 ?? 0)),
      avgMs: Math.round(Number(response.avg_ms ?? 0)),
      totalResponses: Number(response.total ?? 0),
    },
    quorumStats: {
      totalAttempts,
      quorumMet,
      quorumTimeout: Number(quorum.quorum_timeout ?? 0),
      quorumSuccessRate: totalAttempts > 0 ? quorumMet / totalAttempts : 0,
    },
  };

  // Cache
  if (redis) {
    try {
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(stats));
    } catch {
      // Non-fatal
    }
  }

  return stats;
}

// ============================================================================
// Pipeline Health — T053
// ============================================================================

export interface PipelineHealth {
  shadowCoverageRate: number;
  queueActive: number;
  queueWaiting: number;
  queueFailed: number;
  quorumFormationRate: number;
}

export async function getShadowPipelineHealth(
  db: PostgresJsDatabase,
  redis: Redis | null,
  fromDate: string,
  toDate: string,
): Promise<PipelineHealth> {
  const from = new Date(fromDate);
  const to = new Date(toDate + "T23:59:59.999Z");

  // Compare guardrail evaluations count with consensus results count
  const coverageResult = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM guardrail_evaluations WHERE completed_at >= ${from} AND completed_at <= ${to}) as guardrail_count,
      (SELECT COUNT(*) FROM consensus_results WHERE created_at >= ${from} AND created_at <= ${to}) as consensus_count
  `);

  const coverage = (coverageResult as Array<Record<string, string>>)[0] ?? {};
  const guardrailCount = Number(coverage.guardrail_count ?? 0);
  const consensusCount = Number(coverage.consensus_count ?? 0);
  const shadowCoverageRate = guardrailCount > 0 ? consensusCount / guardrailCount : 0;

  if (shadowCoverageRate < 0.9 && guardrailCount > 10) {
    logger.warn(
      { shadowCoverageRate, guardrailCount, consensusCount },
      "Shadow coverage rate below 90%",
    );
  }

  // Queue metrics from BullMQ
  let queueActive = 0;
  let queueWaiting = 0;
  let queueFailed = 0;

  if (redis) {
    try {
      const { Queue } = await import("bullmq");
      const queue = new Queue(QUEUE_NAMES.PEER_CONSENSUS, {
        connection: { host: redis.options.host, port: redis.options.port },
      });
      const counts = await queue.getJobCounts();
      queueActive = counts.active ?? 0;
      queueWaiting = counts.waiting ?? 0;
      queueFailed = counts.failed ?? 0;
      await queue.close();
    } catch {
      // Non-fatal
    }
  }

  // Quorum formation rate
  const quorumResult = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE escalation_reason = 'quorum_timeout') as timeout_count
    FROM consensus_results
    WHERE created_at >= ${from} AND created_at <= ${to}
  `);

  const quorum = (quorumResult as Array<Record<string, string>>)[0] ?? {};
  const totalConsensus = Number(quorum.total ?? 0);
  const timeoutCount = Number(quorum.timeout_count ?? 0);
  const quorumFormationRate = totalConsensus > 0 ? (totalConsensus - timeoutCount) / totalConsensus : 1;

  if (quorumFormationRate < 0.9 && totalConsensus > 10) {
    logger.warn(
      { quorumFormationRate, totalConsensus, timeoutCount },
      "Quorum formation rate below 90%",
    );
  }

  return {
    shadowCoverageRate,
    queueActive,
    queueWaiting,
    queueFailed,
    quorumFormationRate,
  };
}
