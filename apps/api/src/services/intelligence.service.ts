/**
 * Intelligence Service (Sprint 17: Community Identity & Visible Growth)
 *
 * Aggregates monthly community intelligence reports from existing data.
 * Redis 1-hour cache for report endpoints.
 */
import {
  problems,
  missions,
  humanProfiles,
  humans,
  intelligenceReports,
} from "@betterworld/db";
import type { ReportData } from "@betterworld/shared";
import { and, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { getRedis } from "../lib/container.js";

const INTELLIGENCE_CACHE_TTL = 3600; // 1 hour

export class IntelligenceService {
  constructor(private readonly db: PostgresJsDatabase) {}

  /**
   * Generate a monthly intelligence report.
   */
  async generateReport(reportMonth: string): Promise<ReportData> {
    const [year, month] = reportMonth.split("-").map(Number);
    const startDate = new Date(year!, month! - 1, 1);
    const endDate = new Date(year!, month!, 1);

    // Collective progress
    const [totalMissions] = await this.db
      .select({ count: count() })
      .from(missions)
      .where(eq(missions.status, "verified"));

    const [totalProblems] = await this.db
      .select({ count: count() })
      .from(problems)
      .where(eq(problems.status, "resolved"));

    const [newMembers] = await this.db
      .select({ count: count() })
      .from(humans)
      .where(
        and(gte(humans.createdAt, startDate), lt(humans.createdAt, endDate)),
      );

    const [activeParticipants] = await this.db
      .select({ count: count() })
      .from(humanProfiles)
      .where(gte(humanProfiles.lastActiveAt, startDate));

    // Domain trends
    const { ALLOWED_DOMAINS } = await import("@betterworld/shared");
    const domainTrends: Array<{
      domain: string;
      problemsDelta: number;
      missionsDelta: number;
      membersDelta: number;
    }> = [];

    for (const domain of ALLOWED_DOMAINS) {
      const [problemsDelta] = await this.db
        .select({ count: count() })
        .from(problems)
        .where(
          and(
            sql`${problems.domain} = ${domain}`,
            gte(problems.createdAt, startDate),
            lt(problems.createdAt, endDate),
          ),
        );

      const [missionsDelta] = await this.db
        .select({ count: count() })
        .from(missions)
        .where(
          and(
            sql`${missions.domain} = ${domain}`,
            gte(missions.createdAt, startDate),
            lt(missions.createdAt, endDate),
          ),
        );

      const [membersDelta] = await this.db
        .select({ count: count() })
        .from(humanProfiles)
        .where(
          and(
            sql`${humanProfiles.primaryDomain} = ${domain}`,
            gte(humanProfiles.createdAt, startDate),
            lt(humanProfiles.createdAt, endDate),
          ),
        );

      domainTrends.push({
        domain,
        problemsDelta: problemsDelta?.count ?? 0,
        missionsDelta: missionsDelta?.count ?? 0,
        membersDelta: membersDelta?.count ?? 0,
      });
    }

    const reportData: ReportData = {
      systemicIssues: [],
      crossCityAdoptions: [],
      domainTrends: domainTrends.filter(
        (d) => d.problemsDelta > 0 || d.missionsDelta > 0 || d.membersDelta > 0,
      ),
      topPatterns: [],
      collectiveProgress: {
        totalMissionsCompleted: totalMissions?.count ?? 0,
        totalProblemsResolved: totalProblems?.count ?? 0,
        totalNewMembers: newMembers?.count ?? 0,
        activeParticipants: activeParticipants?.count ?? 0,
      },
    };

    return reportData;
  }

  /**
   * Store a generated report.
   */
  async storeReport(reportMonth: string, reportData: ReportData): Promise<string> {
    const [row] = await this.db
      .insert(intelligenceReports)
      .values({
        reportMonth,
        reportData,
        generatedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: intelligenceReports.id });

    // If conflict (already exists), get the existing one
    if (!row) {
      const [existing] = await this.db
        .select({ id: intelligenceReports.id })
        .from(intelligenceReports)
        .where(eq(intelligenceReports.reportMonth, reportMonth))
        .limit(1);
      return existing!.id;
    }

    // Invalidate cache
    try {
      const redis = getRedis();
      if (redis) {
        await redis.del("intelligence:latest");
      }
    } catch {
      // Non-fatal
    }

    return row.id;
  }

  /**
   * Get the latest intelligence report.
   */
  async getLatest(): Promise<{
    reportMonth: string;
    generatedAt: string;
    data: ReportData;
  } | null> {
    try {
      const redis = getRedis();
      if (redis) {
        const cached = await redis.get("intelligence:latest");
        if (cached) return JSON.parse(cached);
      }
    } catch {
      // Cache miss
    }

    const [row] = await this.db
      .select()
      .from(intelligenceReports)
      .orderBy(desc(intelligenceReports.reportMonth))
      .limit(1);

    if (!row) return null;

    const result = {
      reportMonth: row.reportMonth,
      generatedAt: row.generatedAt.toISOString(),
      data: row.reportData as ReportData,
    };

    try {
      const redis = getRedis();
      if (redis) {
        await redis.set("intelligence:latest", JSON.stringify(result), "EX", INTELLIGENCE_CACHE_TTL);
      }
    } catch {
      // Non-fatal
    }

    return result;
  }

  /**
   * Get domain-filtered intelligence.
   */
  async getDomainIntelligence(domain: string): Promise<{
    reportMonth: string;
    domain: string;
    systemicIssues: unknown[];
    topPatterns: unknown[];
    trends: { problemsDelta: number; missionsDelta: number; membersDelta: number };
  } | null> {
    const cacheKey = `intelligence:domain:${domain}`;

    try {
      const redis = getRedis();
      if (redis) {
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
      }
    } catch {
      // Cache miss
    }

    const latest = await this.getLatest();
    if (!latest) return null;

    const domainTrend = latest.data.domainTrends.find(
      (d: { domain: string }) => d.domain === domain,
    );

    const result = {
      reportMonth: latest.reportMonth,
      domain,
      systemicIssues: latest.data.systemicIssues.filter(
        (i: unknown) => typeof i === "object" && i !== null,
      ),
      topPatterns: latest.data.topPatterns,
      trends: domainTrend ?? { problemsDelta: 0, missionsDelta: 0, membersDelta: 0 },
    };

    try {
      const redis = getRedis();
      if (redis) {
        await redis.set(cacheKey, JSON.stringify(result), "EX", INTELLIGENCE_CACHE_TTL);
      }
    } catch {
      // Non-fatal
    }

    return result;
  }
}
