/**
 * Power Audit Service (Sprint 18: Cooperative Depth & Governance — US11)
 *
 * Computes governance health metrics:
 * - Gini coefficient for review distribution
 * - Decision concentration
 * - Admin override rate
 * - Tier distribution
 * - Domain coverage
 * - Geographic balance
 */
import { peerReviews, reputationScores, humanProfiles, powerDistributionSnapshots } from "@betterworld/db";
import { count, sql, desc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

export class PowerAuditService {
  constructor(private readonly db: PostgresJsDatabase) {}

  /**
   * Compute a full power distribution snapshot.
   */
  async computeSnapshot(): Promise<{
    reviewGini: number;
    decisionConcentration: number;
    adminOverrideRate: number;
    tierDistribution: Record<string, number>;
    domainCoverage: number;
    geographicBalance: number;
  }> {
    // Get review counts per reviewer
    const reviewCounts = await this.db
      .select({
        reviewerHumanId: peerReviews.reviewerHumanId,
        count: count(),
      })
      .from(peerReviews)
      .groupBy(peerReviews.reviewerHumanId);

    const reviewGini = this.computeGini(reviewCounts.map((r) => r.count));

    // Decision concentration: top 10% of reviewers' share
    const sortedCounts = reviewCounts.map((r) => r.count).sort((a, b) => b - a);
    const top10Count = Math.max(1, Math.ceil(sortedCounts.length * 0.1));
    const top10Sum = sortedCounts.slice(0, top10Count).reduce((sum, c) => sum + c, 0);
    const totalReviews = sortedCounts.reduce((sum, c) => sum + c, 0);
    const decisionConcentration = totalReviews > 0 ? top10Sum / totalReviews : 0;

    // Tier distribution
    const tierResults = await this.db
      .select({
        tier: reputationScores.currentTier,
        count: count(),
      })
      .from(reputationScores)
      .groupBy(reputationScores.currentTier);

    const tierDistribution: Record<string, number> = {};
    for (const t of tierResults) {
      tierDistribution[t.tier] = t.count;
    }

    // Domain coverage: unique domains with active reviewers / 15 total domains
    const domainResults = await this.db
      .select({ domainCount: sql<number>`COUNT(DISTINCT ${humanProfiles.primaryDomain})` })
      .from(humanProfiles)
      .where(sql`${humanProfiles.primaryDomain} IS NOT NULL`);
    const domainCoverage = Math.min(1, (Number(domainResults[0]?.domainCount) || 0) / 15);

    // Geographic balance: unique cities / total participants
    const geoResults = await this.db
      .select({
        cityCount: sql<number>`COUNT(DISTINCT ${humanProfiles.city})`,
        totalCount: count(),
      })
      .from(humanProfiles)
      .where(sql`${humanProfiles.city} IS NOT NULL`);

    const cityCount = Number(geoResults[0]?.cityCount) || 0;
    const totalParticipants = Number(geoResults[0]?.totalCount) || 1;
    const geographicBalance = Math.min(1, cityCount / Math.max(1, Math.sqrt(totalParticipants)));

    return {
      reviewGini: Math.round(reviewGini * 10000) / 10000,
      decisionConcentration: Math.round(decisionConcentration * 10000) / 10000,
      adminOverrideRate: 0, // Would require tracking admin overrides
      tierDistribution,
      domainCoverage: Math.round(domainCoverage * 10000) / 10000,
      geographicBalance: Math.round(geographicBalance * 10000) / 10000,
    };
  }

  /**
   * Save a snapshot to the database.
   */
  async saveSnapshot(snapshot: {
    reviewGini: number;
    decisionConcentration: number;
    adminOverrideRate: number;
    tierDistribution: Record<string, number>;
    domainCoverage: number;
    geographicBalance: number;
  }): Promise<{ id: string }> {
    const [created] = await this.db
      .insert(powerDistributionSnapshots)
      .values({
        reviewGini: String(snapshot.reviewGini),
        decisionConcentration: String(snapshot.decisionConcentration),
        adminOverrideRate: String(snapshot.adminOverrideRate),
        tierDistribution: snapshot.tierDistribution,
        domainCoverage: String(snapshot.domainCoverage),
        geographicBalance: String(snapshot.geographicBalance),
      })
      .returning({ id: powerDistributionSnapshots.id });

    return { id: created!.id };
  }

  /**
   * Get latest snapshot and trend.
   */
  async getLatest(trendCount = 4): Promise<{
    latest: typeof powerDistributionSnapshots.$inferSelect | null;
    trend: Array<typeof powerDistributionSnapshots.$inferSelect>;
  }> {
    const snapshots = await this.db
      .select()
      .from(powerDistributionSnapshots)
      .orderBy(desc(powerDistributionSnapshots.computedAt))
      .limit(trendCount);

    return {
      latest: snapshots[0] ?? null,
      trend: snapshots,
    };
  }

  /**
   * Compute the Gini coefficient for an array of values.
   */
  private computeGini(values: number[]): number {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    const mean = sorted.reduce((sum, v) => sum + v, 0) / n;

    if (mean === 0) return 0;

    let sumDiff = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        sumDiff += Math.abs(sorted[i]! - sorted[j]!);
      }
    }

    return sumDiff / (2 * n * n * mean);
  }
}
