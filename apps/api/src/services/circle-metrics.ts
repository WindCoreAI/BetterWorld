/**
 * Circle Metrics Service (Sprint 18: Cooperative Depth & Governance — US9)
 *
 * Computes collective metrics for a circle:
 * - Total missions completed by members
 * - Member activity levels
 * - Domain distribution
 * - Post count
 */
import { circleMembers, circlePosts, circleMissions, missionClaims, humanProfiles } from "@betterworld/db";
import { and, eq, count, sql, desc, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

export interface CircleMetrics {
  memberCount: number;
  totalMissionsCompleted: number;
  totalPostCount: number;
  sharedMissionCount: number;
  domainDistribution: Array<{ domain: string; count: number }>;
  activeMemberCount: number;
}

export class CircleMetricsService {
  constructor(private readonly db: PostgresJsDatabase) {}

  /**
   * Compute collective metrics for a circle.
   */
  async getMetrics(circleId: string): Promise<CircleMetrics> {
    // Member count
    const [memberCountResult] = await this.db
      .select({ count: count() })
      .from(circleMembers)
      .where(eq(circleMembers.circleId, circleId));
    const memberCount = memberCountResult?.count ?? 0;

    // Get member IDs
    const members = await this.db
      .select({ humanId: circleMembers.humanId })
      .from(circleMembers)
      .where(eq(circleMembers.circleId, circleId));

    const memberIds = members.map((m) => m.humanId);

    // Missions completed by members
    let totalMissionsCompleted = 0;
    if (memberIds.length > 0) {
      const [missionResult] = await this.db
        .select({ count: count() })
        .from(missionClaims)
        .where(
          and(
            inArray(missionClaims.humanId, memberIds),
            eq(missionClaims.status, "verified"),
          ),
        );
      totalMissionsCompleted = missionResult?.count ?? 0;
    }

    // Post count
    const [postCountResult] = await this.db
      .select({ count: count() })
      .from(circlePosts)
      .where(eq(circlePosts.circleId, circleId));
    const totalPostCount = postCountResult?.count ?? 0;

    // Shared mission count
    const [sharedMissionResult] = await this.db
      .select({ count: count() })
      .from(circleMissions)
      .where(eq(circleMissions.circleId, circleId));
    const sharedMissionCount = sharedMissionResult?.count ?? 0;

    // Domain distribution from member profiles
    let domainDistribution: Array<{ domain: string; count: number }> = [];
    if (memberIds.length > 0) {
      const domainResults = await this.db
        .select({
          domain: humanProfiles.primaryDomain,
          count: count(),
        })
        .from(humanProfiles)
        .where(
          and(
            inArray(humanProfiles.humanId, memberIds),
            sql`${humanProfiles.primaryDomain} IS NOT NULL`,
          ),
        )
        .groupBy(humanProfiles.primaryDomain)
        .orderBy(desc(count()));

      domainDistribution = domainResults
        .filter((d) => d.domain !== null)
        .map((d) => ({ domain: d.domain!, count: d.count }));
    }

    // Active members (with recent mission activity)
    let activeMemberCount = 0;
    if (memberIds.length > 0) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const [activeResult] = await this.db
        .select({ count: sql<number>`COUNT(DISTINCT ${missionClaims.humanId})` })
        .from(missionClaims)
        .where(
          and(
            inArray(missionClaims.humanId, memberIds),
            sql`${missionClaims.claimedAt} >= ${thirtyDaysAgo}`,
          ),
        );
      activeMemberCount = Number(activeResult?.count) || 0;
    }

    return {
      memberCount,
      totalMissionsCompleted,
      totalPostCount,
      sharedMissionCount,
      domainDistribution,
      activeMemberCount,
    };
  }
}
