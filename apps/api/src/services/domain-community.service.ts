/**
 * Domain Community Service (Sprint 17: Community Identity & Visible Growth)
 *
 * Aggregates member count, missions, problems, solutions, top contributors,
 * and monthly highlights per domain. Redis 5-min cache per domain slug.
 */
import {
  problems,
  solutions,
  missions,
  humanProfiles,
  humans,
  reputationScores,
  groupMilestones,
} from "@betterworld/db";
import { APPROVED_DOMAINS, APPROVED_DOMAIN_NAMES } from "@betterworld/shared";
import { eq, sql, and, count, desc, gte, isNull, isNotNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";

import { getRedis } from "../lib/container.js";

const logger = pino({ name: "domain-community-service" });

const DOMAIN_CACHE_TTL = 300; // 5 minutes

interface DomainMetrics {
  memberCount: number;
  missionsCompleted: number;
  problemsResolved: number;
  activeMissions: number;
  totalSolutions: number;
}

interface DomainContributor {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  tier: string;
  reputationScore: number;
  type: "human" | "agent";
}

interface MonthlyHighlights {
  month: string;
  missionsCompletedThisMonth: number;
  problemsResolvedThisMonth: number;
  newMembersThisMonth: number;
  topPattern: string | null;
}

interface DomainListItem {
  slug: string;
  displayName: string;
  memberCount: number;
  missionsCompleted: number;
  problemsResolved: number;
  activeMilestone: { type: string; target: number; current: number } | null;
}

interface DomainDetail {
  slug: string;
  displayName: string;
  metrics: DomainMetrics;
  topContributors: DomainContributor[];
  monthlyHighlights: MonthlyHighlights;
  activeMilestones: Array<{
    id: string;
    milestoneType: string;
    targetValue: number;
    currentValue: number;
    reachedAt: string | null;
  }>;
  recentMilestones: Array<{
    id: string;
    milestoneType: string;
    targetValue: number;
    currentValue: number;
    reachedAt: string | null;
    bannerExpiresAt: string | null;
  }>;
  intelligence: {
    patterns: unknown[];
    trends: Record<string, unknown>;
  };
}

export class DomainCommunityService {
  constructor(private readonly db: PostgresJsDatabase) {}

  /**
   * List all 15 domains with basic metrics.
   */
  async listDomains(): Promise<DomainListItem[]> {
    try {
      const redis = getRedis();
      if (redis) {
        const cached = await redis.get("domain:list");
        if (cached) return JSON.parse(cached);
      }
    } catch {
      // Cache miss
    }

    const result: DomainListItem[] = [];

    for (const slug of APPROVED_DOMAINS) {
      const displayName = APPROVED_DOMAIN_NAMES[slug];

      // Member count: humans with primaryDomain = slug
      const [memberResult] = await this.db
        .select({ count: count() })
        .from(humanProfiles)
        .where(sql`${humanProfiles.primaryDomain} = ${slug}`);

      // Missions completed
      const [missionsResult] = await this.db
        .select({ count: count() })
        .from(missions)
        .where(and(sql`${missions.domain} = ${slug}`, eq(missions.status, "verified")));

      // Problems resolved
      const [problemsResult] = await this.db
        .select({ count: count() })
        .from(problems)
        .where(and(sql`${problems.domain} = ${slug}`, eq(problems.status, "resolved")));

      // Active milestone (closest unreached)
      const [activeMilestone] = await this.db
        .select({
          milestoneType: groupMilestones.milestoneType,
          targetValue: groupMilestones.targetValue,
          currentValue: groupMilestones.currentValue,
        })
        .from(groupMilestones)
        .where(
          and(
            eq(groupMilestones.groupType, "domain"),
            eq(groupMilestones.groupValue, slug),
            isNull(groupMilestones.reachedAt),
          ),
        )
        .orderBy(groupMilestones.targetValue)
        .limit(1);

      result.push({
        slug,
        displayName,
        memberCount: memberResult?.count ?? 0,
        missionsCompleted: missionsResult?.count ?? 0,
        problemsResolved: problemsResult?.count ?? 0,
        activeMilestone: activeMilestone
          ? {
              type: activeMilestone.milestoneType,
              target: activeMilestone.targetValue,
              current: activeMilestone.currentValue,
            }
          : null,
      });
    }

    try {
      const redis = getRedis();
      if (redis) {
        await redis.set("domain:list", JSON.stringify(result), "EX", DOMAIN_CACHE_TTL);
      }
    } catch {
      // Cache write failure non-fatal
    }

    return result;
  }

  /**
   * Get full domain community page data.
   */
  async getDomainDetail(
    slug: string,
    contributorLimit = 10,
  ): Promise<DomainDetail | null> {
    // Validate domain slug
    if (!APPROVED_DOMAINS.includes(slug as (typeof APPROVED_DOMAINS)[number])) {
      return null;
    }

    try {
      const redis = getRedis();
      if (redis) {
        const cached = await redis.get(`domain:${slug}`);
        if (cached) return JSON.parse(cached);
      }
    } catch {
      // Cache miss
    }

    const displayName = APPROVED_DOMAIN_NAMES[slug as (typeof APPROVED_DOMAINS)[number]];

    // Metrics
    const [memberResult] = await this.db
      .select({ count: count() })
      .from(humanProfiles)
      .where(sql`${humanProfiles.primaryDomain} = ${slug}`);

    const [missionsCompleted] = await this.db
      .select({ count: count() })
      .from(missions)
      .where(and(sql`${missions.domain} = ${slug}`, eq(missions.status, "verified")));

    const [problemsResolved] = await this.db
      .select({ count: count() })
      .from(problems)
      .where(and(sql`${problems.domain} = ${slug}`, eq(problems.status, "resolved")));

    const [activeMissionsResult] = await this.db
      .select({ count: count() })
      .from(missions)
      .where(
        and(
          sql`${missions.domain} = ${slug}`,
          sql`${missions.status} IN ('open', 'claimed', 'in_progress')`,
        ),
      );

    const [totalSolutions] = await this.db
      .select({ count: count() })
      .from(solutions)
      .innerJoin(problems, eq(solutions.problemId, problems.id))
      .where(sql`${problems.domain} = ${slug}`);

    const metrics: DomainMetrics = {
      memberCount: memberResult?.count ?? 0,
      missionsCompleted: missionsCompleted?.count ?? 0,
      problemsResolved: problemsResolved?.count ?? 0,
      activeMissions: activeMissionsResult?.count ?? 0,
      totalSolutions: totalSolutions?.count ?? 0,
    };

    // Top contributors (humans with reputation in this domain)
    const humanContributors = await this.db
      .select({
        id: humans.id,
        displayName: humans.displayName,
        avatarUrl: humanProfiles.avatarUrl,
        tier: reputationScores.currentTier,
        reputationScore: reputationScores.totalScore,
      })
      .from(humans)
      .innerJoin(humanProfiles, eq(humans.id, humanProfiles.humanId))
      .leftJoin(reputationScores, eq(humans.id, reputationScores.humanId))
      .where(sql`${humanProfiles.primaryDomain} = ${slug}`)
      .orderBy(desc(reputationScores.totalScore))
      .limit(contributorLimit);

    const topContributors: DomainContributor[] = humanContributors.map((h) => ({
      id: h.id,
      displayName: h.displayName,
      avatarUrl: h.avatarUrl ?? null,
      tier: h.tier ?? "newcomer",
      reputationScore: Number(h.reputationScore ?? 0),
      type: "human" as const,
    }));

    // Monthly highlights
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const [monthlyMissions] = await this.db
      .select({ count: count() })
      .from(missions)
      .where(
        and(
          sql`${missions.domain} = ${slug}`,
          eq(missions.status, "verified"),
          gte(missions.createdAt, monthStart),
        ),
      );

    const [monthlyProblems] = await this.db
      .select({ count: count() })
      .from(problems)
      .where(
        and(
          sql`${problems.domain} = ${slug}`,
          eq(problems.status, "resolved"),
          gte(problems.updatedAt, monthStart),
        ),
      );

    const [monthlyMembers] = await this.db
      .select({ count: count() })
      .from(humanProfiles)
      .where(
        and(
          sql`${humanProfiles.primaryDomain} = ${slug}`,
          gte(humanProfiles.createdAt, monthStart),
        ),
      );

    const monthlyHighlights: MonthlyHighlights = {
      month: monthStr,
      missionsCompletedThisMonth: monthlyMissions?.count ?? 0,
      problemsResolvedThisMonth: monthlyProblems?.count ?? 0,
      newMembersThisMonth: monthlyMembers?.count ?? 0,
      topPattern: null,
    };

    // Milestones
    const activeMilestones = await this.db
      .select({
        id: groupMilestones.id,
        milestoneType: groupMilestones.milestoneType,
        targetValue: groupMilestones.targetValue,
        currentValue: groupMilestones.currentValue,
        reachedAt: groupMilestones.reachedAt,
      })
      .from(groupMilestones)
      .where(
        and(
          eq(groupMilestones.groupType, "domain"),
          eq(groupMilestones.groupValue, slug),
          isNull(groupMilestones.reachedAt),
        ),
      )
      .orderBy(groupMilestones.targetValue)
      .limit(5);

    const recentMilestones = await this.db
      .select({
        id: groupMilestones.id,
        milestoneType: groupMilestones.milestoneType,
        targetValue: groupMilestones.targetValue,
        currentValue: groupMilestones.currentValue,
        reachedAt: groupMilestones.reachedAt,
        bannerExpiresAt: groupMilestones.bannerExpiresAt,
      })
      .from(groupMilestones)
      .where(
        and(
          eq(groupMilestones.groupType, "domain"),
          eq(groupMilestones.groupValue, slug),
          isNotNull(groupMilestones.reachedAt),
        ),
      )
      .orderBy(desc(groupMilestones.reachedAt))
      .limit(5);

    const detail: DomainDetail = {
      slug,
      displayName,
      metrics,
      topContributors,
      monthlyHighlights,
      activeMilestones: activeMilestones.map((m) => ({
        id: m.id,
        milestoneType: m.milestoneType,
        targetValue: m.targetValue,
        currentValue: m.currentValue,
        reachedAt: m.reachedAt?.toISOString() ?? null,
      })),
      recentMilestones: recentMilestones.map((m) => ({
        id: m.id,
        milestoneType: m.milestoneType,
        targetValue: m.targetValue,
        currentValue: m.currentValue,
        reachedAt: m.reachedAt?.toISOString() ?? null,
        bannerExpiresAt: m.bannerExpiresAt?.toISOString() ?? null,
      })),
      intelligence: {
        patterns: [],
        trends: {},
      },
    };

    try {
      const redis = getRedis();
      if (redis) {
        await redis.set(`domain:${slug}`, JSON.stringify(detail), "EX", DOMAIN_CACHE_TTL);
      }
    } catch {
      // Cache write failure non-fatal
    }

    logger.info({ slug }, "Domain detail fetched");
    return detail;
  }
}
