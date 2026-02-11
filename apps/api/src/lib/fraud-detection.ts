/**
 * Fraud Detection Engine (Sprint 9: Reputation & Impact)
 *
 * Three detection methods: pHash duplicate detection, velocity checks, statistical profiling.
 * Fraud scores accumulate per human with threshold actions (50=flag, 150=suspend).
 */
import { evidence, fraudScores, fraudEvents } from "@betterworld/db";
import {
  FRAUD_SCORE_DELTAS,
  FRAUD_THRESHOLDS,
  STATISTICAL_THRESHOLDS,
  VELOCITY_WINDOWS,
} from "@betterworld/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type Redis from "ioredis";
import pino from "pino";

const logger = pino({ name: "fraud-detection" });

// ────────────────── Velocity Check ──────────────────

export interface VelocityResult {
  flagged: boolean;
  count: number;
  window: string;
  scoreDelta: number;
}

/**
 * Check submission velocity using Redis sorted sets.
 */
export async function checkVelocity(
  redis: Redis,
  humanId: string,
): Promise<VelocityResult[]> {
  const now = Date.now();
  const results: VelocityResult[] = [];

  for (const [windowName, config] of Object.entries(VELOCITY_WINDOWS)) {
    const key = `fraud:velocity:${humanId}:${windowName}`;
    const windowStart = now - config.windowMinutes * 60 * 1000;

    // Add current timestamp
    await redis.zadd(key, now.toString(), `${now}`);
    // Remove old entries
    await redis.zremrangebyscore(key, "-inf", windowStart.toString());
    // Set TTL
    await redis.expire(key, config.windowMinutes * 60 + 60);

    const count = await redis.zcard(key);

    if (count >= config.threshold) {
      const deltas: Record<string, number> = {
        short: FRAUD_SCORE_DELTAS.velocityShortBurst,
        medium: FRAUD_SCORE_DELTAS.velocityMediumBurst,
        long: FRAUD_SCORE_DELTAS.velocityLongBurst,
      };

      results.push({
        flagged: true,
        count,
        window: windowName,
        scoreDelta: deltas[windowName] ?? 5,
      });
    }
  }

  return results;
}

// ────────────────── Statistical Profiling ──────────────────

export interface StatisticalResult {
  flagged: boolean;
  type: string;
  scoreDelta: number;
  details: Record<string, unknown>;
}

/**
 * Analyze GPS variance — flag if all submissions are at exact same location.
 */
export async function analyzeGpsVariance(
  db: PostgresJsDatabase,
  humanId: string,
): Promise<StatisticalResult | null> {
  const result = await db
    .select({
      varianceLat: sql<number>`COALESCE(VARIANCE(CAST(${evidence.latitude} AS float)), 0)`,
      varianceLng: sql<number>`COALESCE(VARIANCE(CAST(${evidence.longitude} AS float)), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(evidence)
    .where(
      and(
        eq(evidence.submittedByHumanId, humanId),
        sql`${evidence.latitude} IS NOT NULL`,
      ),
    );

  const row = result[0];
  if (
    !row ||
    Number(row.count) < STATISTICAL_THRESHOLDS.minSubmissionsForAnalysis
  ) {
    return null;
  }

  const varLat = Number(row.varianceLat);
  const varLng = Number(row.varianceLng);

  if (
    varLat < STATISTICAL_THRESHOLDS.minGpsVarianceLat &&
    varLng < STATISTICAL_THRESHOLDS.minGpsVarianceLng
  ) {
    return {
      flagged: true,
      type: "gps_clustering",
      scoreDelta: FRAUD_SCORE_DELTAS.gpsClustering,
      details: {
        varianceLat: varLat,
        varianceLng: varLng,
        submissionCount: Number(row.count),
      },
    };
  }
  return null;
}

/**
 * Analyze approval rate — flag if suspiciously high with enough submissions.
 */
export async function analyzeApprovalRate(
  db: PostgresJsDatabase,
  humanId: string,
): Promise<StatisticalResult | null> {
  const result = await db
    .select({
      total: sql<number>`COUNT(*)`,
      approved: sql<number>`COUNT(*) FILTER (WHERE ${evidence.finalVerdict} = 'verified')`,
    })
    .from(evidence)
    .where(
      and(
        eq(evidence.submittedByHumanId, humanId),
        sql`${evidence.finalVerdict} IS NOT NULL`,
      ),
    );

  const row = result[0];
  if (
    !row ||
    Number(row.total) < STATISTICAL_THRESHOLDS.minSubmissionsForAnalysis
  ) {
    return null;
  }

  const approvalRate = Number(row.approved) / Number(row.total);

  if (approvalRate > STATISTICAL_THRESHOLDS.maxApprovalRate) {
    return {
      flagged: true,
      type: "approval_anomaly",
      scoreDelta: FRAUD_SCORE_DELTAS.approvalAnomaly,
      details: {
        approvalRate,
        total: Number(row.total),
        approved: Number(row.approved),
      },
    };
  }
  return null;
}

/**
 * Analyze timing patterns — flag if submissions cluster at exact intervals.
 */
export async function analyzeTimingPatterns(
  db: PostgresJsDatabase,
  humanId: string,
): Promise<StatisticalResult | null> {
  const submissions = await db
    .select({ createdAt: evidence.createdAt })
    .from(evidence)
    .where(eq(evidence.submittedByHumanId, humanId))
    .orderBy(desc(evidence.createdAt))
    .limit(20);

  if (submissions.length < 5) return null;

  // Calculate intervals between consecutive submissions
  const intervals: number[] = [];
  for (let i = 1; i < submissions.length; i++) {
    const diff =
      submissions[i - 1]!.createdAt.getTime() -
      submissions[i]!.createdAt.getTime();
    intervals.push(diff);
  }

  if (intervals.length < 4) return null;

  // Check if intervals are suspiciously uniform (low variance)
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance =
    intervals.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
    intervals.length;
  const coefficientOfVariation = mean > 0 ? Math.sqrt(variance) / mean : 1;

  // CV < 0.1 means very uniform intervals (suspicious)
  if (coefficientOfVariation < 0.1) {
    return {
      flagged: true,
      type: "timing_pattern",
      scoreDelta: FRAUD_SCORE_DELTAS.timingPattern,
      details: {
        meanIntervalMs: mean,
        coefficientOfVariation,
        intervalCount: intervals.length,
      },
    };
  }
  return null;
}

// ────────────────── Fraud Score Aggregation ──────────────────

export interface FraudScoreUpdate {
  humanId: string;
  totalScore: number;
  status: string;
  newEvents: Array<{ detectionType: string; scoreDelta: number }>;
}

/**
 * Increment fraud score and apply threshold actions.
 */
export async function incrementFraudScore(
  db: PostgresJsDatabase,
  humanId: string,
  detectionType: string,
  scoreDelta: number,
  details: Record<string, unknown>,
  evidenceId?: string,
): Promise<FraudScoreUpdate> {
  return db.transaction(async (tx) => {
    // Ensure fraud score row exists
    await tx
      .insert(fraudScores)
      .values({ humanId })
      .onConflictDoNothing();

    // Get current score with lock
    const result = await tx.execute(
      sql`SELECT total_score, phash_score, velocity_score, statistical_score, status
          FROM fraud_scores WHERE human_id = ${humanId} FOR UPDATE`,
    );
    const row = (
      result as unknown as Array<{
        total_score: number;
        phash_score: number;
        velocity_score: number;
        statistical_score: number;
        status: string;
      }>
    )[0]!;

    const newTotal = row.total_score + scoreDelta;

    // Determine which component to update
    const isPhash = detectionType.startsWith("phash");
    const isVelocity = detectionType.startsWith("velocity");

    const updates: Record<string, unknown> = {
      totalScore: newTotal,
      lastScoredAt: new Date(),
      updatedAt: new Date(),
    };

    if (isPhash) {
      updates.phashScore = row.phash_score + scoreDelta;
    } else if (isVelocity) {
      updates.velocityScore = row.velocity_score + scoreDelta;
    } else {
      updates.statisticalScore = row.statistical_score + scoreDelta;
    }

    // Apply threshold actions
    let newStatus = row.status;
    if (
      newTotal >= FRAUD_THRESHOLDS.autoSuspend &&
      row.status !== "suspended"
    ) {
      newStatus = "suspended";
      updates.status = "suspended";
      updates.suspendedAt = new Date();
    } else if (
      newTotal >= FRAUD_THRESHOLDS.flagForReview &&
      row.status === "clean"
    ) {
      newStatus = "flagged";
      updates.status = "flagged";
      updates.flaggedAt = new Date();
    }

    await tx
      .update(fraudScores)
      .set(updates)
      .where(eq(fraudScores.humanId, humanId));

    // Log fraud event
    await tx.insert(fraudEvents).values({
      humanId,
      evidenceId: evidenceId ?? null,
      detectionType,
      scoreDelta,
      details,
    });

    logger.info(
      { humanId, detectionType, scoreDelta, newTotal, newStatus },
      "Fraud score incremented",
    );

    return {
      humanId,
      totalScore: newTotal,
      status: newStatus,
      newEvents: [{ detectionType, scoreDelta }],
    };
  });
}

/**
 * Ensure a fraud scores row exists for a human.
 */
export async function ensureFraudScoreRow(
  db: PostgresJsDatabase,
  humanId: string,
): Promise<void> {
  await db
    .insert(fraudScores)
    .values({ humanId })
    .onConflictDoNothing();
}
