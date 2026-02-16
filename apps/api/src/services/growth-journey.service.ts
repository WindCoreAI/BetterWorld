/**
 * Growth Journey Service (Sprint 17: Community Identity & Visible Growth)
 *
 * Aggregates reputation trend, tier progress, skills, domain expertise,
 * personal milestones, and auto-generated next goals. Redis 5-min cache.
 */
import {
  reputationScores,
  reputationHistory,
  missionClaims,
  missions,
  streaks,
} from "@betterworld/db";
import { and, count, desc, eq, gte } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";

import { getRedis } from "../lib/container.js";

const logger = pino({ name: "growth-journey-service" });

const GROWTH_CACHE_TTL = 300; // 5 minutes

const TIER_THRESHOLDS: Record<string, { min: number; next: string | null; nextMin: number }> = {
  newcomer: { min: 0, next: "contributor", nextMin: 100 },
  contributor: { min: 100, next: "advocate", nextMin: 500 },
  advocate: { min: 500, next: "leader", nextMin: 2000 },
  leader: { min: 2000, next: "champion", nextMin: 5000 },
  champion: { min: 5000, next: null, nextMin: Infinity },
};

interface GrowthJourneyData {
  reputationTrend: Array<{ date: string; score: number; tier: string }>;
  currentTier: {
    tier: string;
    score: number;
    nextTier: string | null;
    nextTierThreshold: number;
    progressPercent: number;
  };
  skills: {
    evidenceQuality: { current: number; previous30d: number; trend: string };
    reviewAccuracy: { current: number; previous30d: number; trend: string };
    missionCompletionRate: { current: number; previous30d: number; trend: string };
  };
  domainExpertise: Array<{ domain: string; missionsCompleted: number; f1Score: number | null }>;
  personalMilestones: Array<{ type: string; value: string; date: string }>;
  nextGoals: Array<{ type: string; description: string; progressPercent: number }>;
}

export class GrowthJourneyService {
  constructor(private readonly db: PostgresJsDatabase) {}

  async getGrowthJourney(humanId: string): Promise<GrowthJourneyData> {
    try {
      const redis = getRedis();
      if (redis) {
        const cached = await redis.get(`growth:${humanId}`);
        if (cached) return JSON.parse(cached);
      }
    } catch {
      // Cache miss
    }

    const { currentScore, currentTierName, tierInfo } = await this.fetchCurrentReputation(humanId);
    const reputationTrend = await this.fetchReputationTrend(humanId);
    const completionRate = await this.fetchCompletionRate(humanId);
    const domainExpertise = await this.fetchDomainExpertise(humanId);
    const { currentStreak, longestStreak } = await this.fetchStreaks(humanId);
    const personalMilestones = await this.fetchPersonalMilestones(humanId, longestStreak);
    const nextGoals = this.buildNextGoals(tierInfo, currentScore, domainExpertise.length, currentStreak);

    const progressPercent =
      tierInfo.next
        ? Math.min(100, Math.round(((currentScore - tierInfo.min) / (tierInfo.nextMin - tierInfo.min)) * 100))
        : 100;

    const result: GrowthJourneyData = {
      reputationTrend,
      currentTier: {
        tier: currentTierName,
        score: currentScore,
        nextTier: tierInfo.next,
        nextTierThreshold: tierInfo.nextMin === Infinity ? 0 : tierInfo.nextMin,
        progressPercent,
      },
      skills: {
        evidenceQuality: { current: 0, previous30d: 0, trend: "stable" },
        reviewAccuracy: { current: 0, previous30d: 0, trend: "stable" },
        missionCompletionRate: {
          current: Math.round(completionRate * 100) / 100,
          previous30d: 0,
          trend: "stable",
        },
      },
      domainExpertise,
      personalMilestones,
      nextGoals,
    };

    try {
      const redis = getRedis();
      if (redis) {
        await redis.set(`growth:${humanId}`, JSON.stringify(result), "EX", GROWTH_CACHE_TTL);
      }
    } catch {
      // Non-fatal
    }

    logger.info({ humanId }, "Growth journey fetched");
    return result;
  }

  private async fetchCurrentReputation(humanId: string) {
    const [repScore] = await this.db
      .select({
        totalScore: reputationScores.totalScore,
        currentTier: reputationScores.currentTier,
      })
      .from(reputationScores)
      .where(eq(reputationScores.humanId, humanId))
      .limit(1);

    const currentScore = Number(repScore?.totalScore ?? 0);
    const currentTierName = repScore?.currentTier ?? "newcomer";
    const tierInfo = TIER_THRESHOLDS[currentTierName] ?? TIER_THRESHOLDS.newcomer!;
    return { currentScore, currentTierName, tierInfo };
  }

  private async fetchReputationTrend(humanId: string) {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const trendRows = await this.db
      .select({
        score: reputationHistory.scoreAfter,
        tier: reputationHistory.tierAfter,
        date: reputationHistory.createdAt,
      })
      .from(reputationHistory)
      .where(
        and(
          eq(reputationHistory.humanId, humanId),
          gte(reputationHistory.createdAt, ninetyDaysAgo),
        ),
      )
      .orderBy(reputationHistory.createdAt)
      .limit(90);

    return trendRows.map((r) => ({
      date: r.date.toISOString().split("T")[0]!,
      score: Number(r.score),
      tier: r.tier ?? "newcomer",
    }));
  }

  private async fetchCompletionRate(humanId: string) {
    const [totalClaims] = await this.db
      .select({ count: count() })
      .from(missionClaims)
      .where(eq(missionClaims.humanId, humanId));

    const [completedClaims] = await this.db
      .select({ count: count() })
      .from(missionClaims)
      .where(and(eq(missionClaims.humanId, humanId), eq(missionClaims.status, "verified")));

    const totalCount = totalClaims?.count ?? 0;
    const completedCount = completedClaims?.count ?? 0;
    return totalCount > 0 ? completedCount / totalCount : 0;
  }

  private async fetchDomainExpertise(humanId: string) {
    const domainRows = await this.db
      .select({
        domain: missions.domain,
        count: count(),
      })
      .from(missionClaims)
      .innerJoin(missions, eq(missionClaims.missionId, missions.id))
      .where(and(eq(missionClaims.humanId, humanId), eq(missionClaims.status, "verified")))
      .groupBy(missions.domain);

    return domainRows.map((d) => ({
      domain: d.domain,
      missionsCompleted: d.count,
      f1Score: null,
    }));
  }

  private async fetchStreaks(humanId: string) {
    const [streakData] = await this.db
      .select({
        currentStreak: streaks.currentStreak,
        longestStreak: streaks.longestStreak,
      })
      .from(streaks)
      .where(eq(streaks.humanId, humanId))
      .limit(1);

    return {
      currentStreak: streakData?.currentStreak ?? 0,
      longestStreak: streakData?.longestStreak ?? 0,
    };
  }

  private async fetchPersonalMilestones(humanId: string, longestStreak: number) {
    const tierPromotions = await this.db
      .select({
        tierAfter: reputationHistory.tierAfter,
        date: reputationHistory.createdAt,
      })
      .from(reputationHistory)
      .where(
        and(
          eq(reputationHistory.humanId, humanId),
          eq(reputationHistory.eventType, "tier_promotion"),
        ),
      )
      .orderBy(desc(reputationHistory.createdAt))
      .limit(10);

    const milestones = tierPromotions.map((p) => ({
      type: "tier_promotion",
      value: p.tierAfter ?? "unknown",
      date: p.date.toISOString(),
    }));

    if (longestStreak > 0) {
      milestones.push({
        type: "streak_record",
        value: String(longestStreak),
        date: new Date().toISOString(),
      });
    }

    return milestones;
  }

  private buildNextGoals(
    tierInfo: { min: number; next: string | null; nextMin: number },
    currentScore: number,
    domainCount: number,
    currentStreak: number,
  ) {
    const nextGoals: Array<{ type: string; description: string; progressPercent: number }> = [];

    if (tierInfo.next) {
      const range = tierInfo.nextMin - tierInfo.min;
      const progress = currentScore - tierInfo.min;
      const percent = range > 0 ? Math.min(100, Math.round((progress / range) * 100)) : 0;
      const remaining = Math.max(0, tierInfo.nextMin - currentScore);
      nextGoals.push({
        type: "tier_progress",
        description: `${remaining} points to ${tierInfo.next} tier`,
        progressPercent: percent,
      });
    }

    if (domainCount < 3) {
      const needed = 3 - domainCount;
      nextGoals.push({
        type: "domain_breadth",
        description: `Try ${needed} more domain${needed > 1 ? "s" : ""} to reach 3-domain explorer`,
        progressPercent: Math.round((domainCount / 3) * 100),
      });
    }

    if (currentStreak < 30) {
      const needed = 30 - currentStreak;
      nextGoals.push({
        type: "streak",
        description: `${needed} more days to reach 30-day streak`,
        progressPercent: Math.round((currentStreak / 30) * 100),
      });
    }

    return nextGoals;
  }
}
