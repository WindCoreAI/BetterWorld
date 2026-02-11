/**
 * Reputation Engine (Sprint 9: Reputation & Impact)
 *
 * 4-factor reputation algorithm with tier management, decay, and history logging.
 * Formula: (quality×0.4 + accuracy×0.3 + streak×0.2 + endorsements×0.1) × tierMultiplier
 */
import { evidence, endorsements, peerReviews, reputationScores, reputationHistory, streaks } from "@betterworld/db";
import {
  REPUTATION_DECAY,
  REPUTATION_TIERS,
  REPUTATION_WEIGHTS,
  TIER_ORDER,
  type ReputationTierName,
} from "@betterworld/shared";
import { and, count, desc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";

import { broadcast } from "../ws/feed.js";

const logger = pino({ name: "reputation-engine" });

// ────────────────── Factor Calculations ──────────────────

/**
 * Factor 1: Mission quality — avg finalConfidence of last 10 verified evidence × 100
 */
async function calculateMissionQuality(
  db: PostgresJsDatabase,
  humanId: string,
): Promise<number> {
  // Get last 10 verified evidence entries, then compute average in-app
  const rows = await db
    .select({ confidence: evidence.finalConfidence })
    .from(evidence)
    .where(
      and(
        eq(evidence.submittedByHumanId, humanId),
        eq(evidence.verificationStage, "verified"),
      ),
    )
    .orderBy(desc(evidence.createdAt))
    .limit(10);

  if (rows.length === 0) return 0;

  const sum = rows.reduce(
    (acc, r) => acc + (r.confidence ? Number(r.confidence) : 0),
    0,
  );
  const avgVal = sum / rows.length;
  return Math.min(avgVal * 100, 100);
}

/**
 * Factor 2: Peer accuracy — alignment of peer reviews with final outcome × 100
 */
async function calculatePeerAccuracy(
  db: PostgresJsDatabase,
  humanId: string,
): Promise<number> {
  // Get peer reviews by this human, joined with evidence final verdict
  const reviews = await db
    .select({
      verdict: peerReviews.verdict,
      finalVerdict: evidence.finalVerdict,
    })
    .from(peerReviews)
    .innerJoin(evidence, eq(peerReviews.evidenceId, evidence.id))
    .where(
      and(
        eq(peerReviews.reviewerHumanId, humanId),
        sql`${evidence.finalVerdict} IS NOT NULL`,
      ),
    )
    .orderBy(desc(peerReviews.createdAt))
    .limit(50);

  if (reviews.length === 0) return 0;

  const correct = reviews.filter((r) => {
    const reviewApproved = r.verdict === "approve";
    const evidenceApproved = r.finalVerdict === "verified";
    return reviewApproved === evidenceApproved;
  }).length;

  return (correct / reviews.length) * 100;
}

/**
 * Factor 3: Streak bonus — min(streakDays / 30, 1.0) × 100
 */
async function calculateStreakBonus(
  db: PostgresJsDatabase,
  humanId: string,
): Promise<number> {
  const [streakRow] = await db
    .select({ currentStreak: streaks.currentStreak })
    .from(streaks)
    .where(eq(streaks.humanId, humanId))
    .limit(1);

  const streakDays = streakRow?.currentStreak ?? 0;
  return Math.min(streakDays / 30, 1.0) * 100;
}

/**
 * Factor 4: Endorsement score — min(endorsementCount / 10, 1.0) × 100
 */
async function calculateEndorsementScore(
  db: PostgresJsDatabase,
  humanId: string,
): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(endorsements)
    .where(
      and(
        eq(endorsements.toHumanId, humanId),
        eq(endorsements.status, "active"),
      ),
    );

  const endorsementCount = result?.count ?? 0;
  return Math.min(endorsementCount / 10, 1.0) * 100;
}

// ────────────────── Tier Logic ──────────────────

export function getTierForScore(score: number): ReputationTierName {
  if (score >= 5000) return "champion";
  if (score >= 2000) return "leader";
  if (score >= 500) return "advocate";
  if (score >= 100) return "contributor";
  return "newcomer";
}

export function getTokenMultiplier(tier: ReputationTierName): number {
  return REPUTATION_TIERS[tier].multiplier;
}

export function getNextTierInfo(
  currentTier: ReputationTierName,
  currentScore: number,
): { name: string; threshold: number; progress: number } | null {
  const currentIndex = TIER_ORDER.indexOf(currentTier);
  if (currentIndex >= TIER_ORDER.length - 1) return null;

  const nextTierName = TIER_ORDER[currentIndex + 1]!;
  const nextTier = REPUTATION_TIERS[nextTierName];
  const currentThreshold = REPUTATION_TIERS[currentTier].minScore;
  const range = nextTier.minScore - currentThreshold;
  const progress =
    range > 0
      ? Math.min(((currentScore - currentThreshold) / range) * 100, 100)
      : 0;

  return {
    name: nextTier.displayName,
    threshold: nextTier.minScore,
    progress: Math.round(progress * 100) / 100,
  };
}

// ────────────────── Core Reputation Calculation ──────────────────

export interface ReputationBreakdownResult {
  missionQuality: number;
  peerAccuracy: number;
  streak: number;
  endorsements: number;
  totalScore: number;
}

/**
 * Calculate full reputation score for a human (absolute recalculation).
 */
export async function calculateReputation(
  db: PostgresJsDatabase,
  humanId: string,
): Promise<ReputationBreakdownResult> {
  const [missionQuality, peerAccuracy, streakBonus, endorsementScore] =
    await Promise.all([
      calculateMissionQuality(db, humanId),
      calculatePeerAccuracy(db, humanId),
      calculateStreakBonus(db, humanId),
      calculateEndorsementScore(db, humanId),
    ]);

  // Get current tier multiplier
  const [scoreRow] = await db
    .select({ tierMultiplier: reputationScores.tierMultiplier })
    .from(reputationScores)
    .where(eq(reputationScores.humanId, humanId))
    .limit(1);

  const tierMultiplier = scoreRow ? Number(scoreRow.tierMultiplier) : 1.0;

  const rawScore =
    missionQuality * REPUTATION_WEIGHTS.missionQuality +
    peerAccuracy * REPUTATION_WEIGHTS.peerAccuracy +
    streakBonus * REPUTATION_WEIGHTS.streak +
    endorsementScore * REPUTATION_WEIGHTS.endorsements;

  const totalScore = Math.max(0, rawScore * tierMultiplier);

  return {
    missionQuality: Math.round(missionQuality * 100) / 100,
    peerAccuracy: Math.round(peerAccuracy * 100) / 100,
    streak: Math.round(streakBonus * 100) / 100,
    endorsements: Math.round(endorsementScore * 100) / 100,
    totalScore: Math.round(totalScore * 100) / 100,
  };
}

// ────────────────── Reputation Update (Full Recalculation + History) ──────────────────

export async function updateReputation(
  db: PostgresJsDatabase,
  humanId: string,
  eventType: string,
  eventSourceId?: string,
  eventSourceType?: string,
): Promise<void> {
  const breakdown = await calculateReputation(db, humanId);

  // eslint-disable-next-line complexity
  await db.transaction(async (tx) => {
    // Ensure reputation row exists
    const [existing] = await tx
      .select({
        totalScore: reputationScores.totalScore,
        currentTier: reputationScores.currentTier,
        tierMultiplier: reputationScores.tierMultiplier,
        gracePeriodStart: reputationScores.gracePeriodStart,
        gracePeriodTier: reputationScores.gracePeriodTier,
      })
      .from(reputationScores)
      .where(eq(reputationScores.humanId, humanId))
      .limit(1);

    if (!existing) {
      // Create initial row
      await tx.insert(reputationScores).values({
        humanId,
        totalScore: String(breakdown.totalScore),
        missionQualityScore: String(breakdown.missionQuality),
        peerAccuracyScore: String(breakdown.peerAccuracy),
        streakScore: String(breakdown.streak),
        endorsementScore: String(breakdown.endorsements),
        currentTier: getTierForScore(breakdown.totalScore),
        tierMultiplier: String(
          getTokenMultiplier(getTierForScore(breakdown.totalScore)),
        ),
        lastActivityAt: new Date(),
      });
      return;
    }

    const previousScore = Number(existing.totalScore);
    const previousTier = existing.currentTier as ReputationTierName;
    const delta = breakdown.totalScore - previousScore;

    // Determine new tier
    const newTier = getTierForScore(breakdown.totalScore);
    let effectiveTier = previousTier;
    let gracePeriodStart = existing.gracePeriodStart;
    let gracePeriodTier = existing.gracePeriodTier as ReputationTierName | null;

    if (TIER_ORDER.indexOf(newTier) > TIER_ORDER.indexOf(previousTier)) {
      // Promotion
      effectiveTier = newTier;
      gracePeriodStart = null;
      gracePeriodTier = null;
    } else if (
      TIER_ORDER.indexOf(newTier) < TIER_ORDER.indexOf(previousTier)
    ) {
      // Potential demotion — initiate grace period
      if (!gracePeriodStart) {
        gracePeriodStart = new Date();
        gracePeriodTier = previousTier;
        effectiveTier = previousTier; // Keep tier during grace
      } else {
        // Check if grace period expired
        const graceMs =
          REPUTATION_DECAY.gracePeriodDays * 24 * 60 * 60 * 1000;
        if (Date.now() - gracePeriodStart.getTime() > graceMs) {
          // Grace period expired — demote
          effectiveTier = newTier;
          gracePeriodStart = null;
          gracePeriodTier = null;
        } else {
          effectiveTier = previousTier; // Still in grace period
        }
      }
    } else if (
      gracePeriodStart &&
      TIER_ORDER.indexOf(newTier) >= TIER_ORDER.indexOf(previousTier)
    ) {
      // Recovered during grace period
      gracePeriodStart = null;
      gracePeriodTier = null;
      effectiveTier = previousTier;
    }

    // Update reputation scores
    await tx
      .update(reputationScores)
      .set({
        totalScore: String(breakdown.totalScore),
        missionQualityScore: String(breakdown.missionQuality),
        peerAccuracyScore: String(breakdown.peerAccuracy),
        streakScore: String(breakdown.streak),
        endorsementScore: String(breakdown.endorsements),
        currentTier: effectiveTier,
        tierMultiplier: String(getTokenMultiplier(effectiveTier)),
        gracePeriodStart,
        gracePeriodTier,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(reputationScores.humanId, humanId));

    // Log to history
    await tx.insert(reputationHistory).values({
      humanId,
      scoreBefore: String(previousScore),
      scoreAfter: String(breakdown.totalScore),
      delta: String(delta),
      eventType,
      eventSourceId: eventSourceId ?? null,
      eventSourceType: eventSourceType ?? null,
      tierBefore: previousTier !== effectiveTier ? previousTier : null,
      tierAfter: previousTier !== effectiveTier ? effectiveTier : null,
    });

    // Broadcast events
    if (delta !== 0) {
      broadcast({
        type: "reputation:updated",
        data: {
          humanId,
          totalScore: breakdown.totalScore,
          delta,
          tier: effectiveTier,
        },
      });
    }

    if (previousTier !== effectiveTier) {
      if (
        TIER_ORDER.indexOf(effectiveTier) > TIER_ORDER.indexOf(previousTier)
      ) {
        broadcast({
          type: "reputation:tier_promoted",
          data: { humanId, from: previousTier, to: effectiveTier },
        });
      } else {
        broadcast({
          type: "reputation:tier_demoted",
          data: { humanId, from: previousTier, to: effectiveTier },
        });
      }
    }

    if (gracePeriodStart && !existing.gracePeriodStart) {
      broadcast({
        type: "reputation:grace_period_started",
        data: {
          humanId,
          tier: previousTier,
          expiresAt: new Date(
            gracePeriodStart.getTime() +
              REPUTATION_DECAY.gracePeriodDays * 24 * 60 * 60 * 1000,
          ).toISOString(),
        },
      });
    }
  });

  logger.info(
    { humanId, eventType, totalScore: breakdown.totalScore },
    "Reputation updated",
  );
}

// ────────────────── Decay Logic ──────────────────

/**
 * Apply reputation decay for inactive humans.
 * 2%/week after 7 days inactive, 5%/week after 90 days inactive.
 */
export async function applyDecay(
  db: PostgresJsDatabase,
  humanId: string,
): Promise<{ decayed: boolean; decayAmount: number }> {
  const [scoreRow] = await db
    .select({
      totalScore: reputationScores.totalScore,
      lastActivityAt: reputationScores.lastActivityAt,
      currentTier: reputationScores.currentTier,
      gracePeriodStart: reputationScores.gracePeriodStart,
      gracePeriodTier: reputationScores.gracePeriodTier,
    })
    .from(reputationScores)
    .where(eq(reputationScores.humanId, humanId))
    .limit(1);

  if (!scoreRow || !scoreRow.lastActivityAt) {
    return { decayed: false, decayAmount: 0 };
  }

  const currentScore = Number(scoreRow.totalScore);
  if (currentScore <= 0) return { decayed: false, decayAmount: 0 };

  const inactiveDays = Math.floor(
    (Date.now() - scoreRow.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (inactiveDays < REPUTATION_DECAY.inactivityThresholdDays) {
    return { decayed: false, decayAmount: 0 };
  }

  // Daily rate = weekly rate / 7 (cron runs daily, spec defines weekly rates)
  const weeklyRate =
    inactiveDays >= REPUTATION_DECAY.acceleratedThresholdDays
      ? REPUTATION_DECAY.acceleratedPercent
      : REPUTATION_DECAY.standardPercent;
  const dailyRate = weeklyRate / 7;

  const decayAmount = Math.round(currentScore * (dailyRate / 100) * 100) / 100;
  const newScore = Math.max(0, currentScore - decayAmount);

  await db.transaction(async (tx) => {
    const scoreTier = getTierForScore(newScore);
    const previousTier = scoreRow.currentTier as ReputationTierName;
    let effectiveTier = previousTier;
    let gracePeriodStart = scoreRow.gracePeriodStart;
    let gracePeriodTier = scoreRow.gracePeriodTier as ReputationTierName | null;

    // Handle tier demotion with grace period
    if (TIER_ORDER.indexOf(scoreTier) < TIER_ORDER.indexOf(previousTier)) {
      if (!gracePeriodStart) {
        // Initiate grace period
        gracePeriodStart = new Date();
        gracePeriodTier = previousTier;
        effectiveTier = previousTier; // Keep tier during grace
      } else {
        const graceMs =
          REPUTATION_DECAY.gracePeriodDays * 24 * 60 * 60 * 1000;
        if (Date.now() - gracePeriodStart.getTime() > graceMs) {
          // Grace expired — demote
          effectiveTier = scoreTier;
          gracePeriodStart = null;
          gracePeriodTier = null;
        } else {
          effectiveTier = previousTier; // Still in grace
        }
      }
    } else {
      // Score still qualifies for current tier — clear any grace period
      if (gracePeriodStart) {
        gracePeriodStart = null;
        gracePeriodTier = null;
      }
      effectiveTier = scoreTier;
    }

    await tx
      .update(reputationScores)
      .set({
        totalScore: String(newScore),
        lastDecayAt: new Date(),
        currentTier: effectiveTier,
        tierMultiplier: String(getTokenMultiplier(effectiveTier)),
        gracePeriodStart,
        gracePeriodTier,
        updatedAt: new Date(),
      })
      .where(eq(reputationScores.humanId, humanId));

    await tx.insert(reputationHistory).values({
      humanId,
      scoreBefore: String(currentScore),
      scoreAfter: String(newScore),
      delta: String(-decayAmount),
      eventType: "decay",
      tierBefore: previousTier !== effectiveTier ? previousTier : null,
      tierAfter: previousTier !== effectiveTier ? effectiveTier : null,
      metadata: { dailyRate, weeklyRate, inactiveDays },
    });
  });

  logger.info(
    { humanId, decayAmount, newScore, inactiveDays },
    "Reputation decayed",
  );
  return { decayed: true, decayAmount };
}

/**
 * Ensure a reputation scores row exists for a human. Called lazily.
 */
export async function ensureReputationRow(
  db: PostgresJsDatabase,
  humanId: string,
): Promise<void> {
  const [existing] = await db
    .select({ humanId: reputationScores.humanId })
    .from(reputationScores)
    .where(eq(reputationScores.humanId, humanId))
    .limit(1);

  if (!existing) {
    await db
      .insert(reputationScores)
      .values({ humanId })
      .onConflictDoNothing();
  }
}
