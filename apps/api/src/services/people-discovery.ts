/**
 * People Discovery Service (Sprint 18: Cooperative Depth & Governance — US11)
 *
 * Extends connection suggestion algorithm with:
 * - Contribution pattern similarity (x2)
 * - Tier proximity (x1)
 * - Pathway overlap (x1)
 * - Domain/city filters
 */
import { humans, humanProfiles, reputationScores, connections, learningPathways } from "@betterworld/db";
import { and, eq, desc, sql, ne } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

interface DiscoverPerson {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  city: string | null;
  primaryDomain: string | null;
  bio: string | null;
  tier: string | null;
  totalMissionsCompleted: number | null;
  score: number;
  reasons: string[];
}

export class PeopleDiscoveryService {
  constructor(private readonly db: PostgresJsDatabase) {}

  /**
   * Discover people with scoring and filters.
   */
  async discover(
    humanId: string,
    options: {
      domain?: string;
      city?: string;
      limit?: number;
    } = {},
  ): Promise<DiscoverPerson[]> {
    const limit = Math.min(options.limit ?? 20, 50);

    // Get the requesting user's profile
    const [myProfile] = await this.db
      .select({
        city: humanProfiles.city,
        primaryDomain: humanProfiles.primaryDomain,
      })
      .from(humanProfiles)
      .where(eq(humanProfiles.humanId, humanId))
      .limit(1);

    // Get user's enrolled pathways
    const myPathways = await this.db
      .select({ domain: learningPathways.domain })
      .from(learningPathways)
      .where(eq(learningPathways.humanId, humanId));
    const myPathwayDomains = new Set(myPathways.map((p) => p.domain));

    // Get existing connections to exclude
    const existingConnections = await this.db
      .select({ partnerId: sql<string>`
        CASE
          WHEN ${connections.requesterHumanId} = ${humanId} THEN ${connections.recipientHumanId}
          ELSE ${connections.requesterHumanId}
        END
      ` })
      .from(connections)
      .where(
        and(
          eq(connections.status, "accepted"),
          sql`(${connections.requesterHumanId} = ${humanId} OR ${connections.recipientHumanId} = ${humanId})`,
        ),
      );

    const connectedIds = new Set(existingConnections.map((c) => c.partnerId));
    connectedIds.add(humanId); // Exclude self

    // Build query conditions
    const conditions = [
      eq(humans.isActive, true),
      ne(humans.id, humanId),
    ];

    if (options.city) {
      conditions.push(eq(humanProfiles.city, options.city));
    }
    if (options.domain) {
      conditions.push(eq(humanProfiles.primaryDomain, options.domain as never));
    }

    // Fetch candidates
    const candidates = await this.db
      .select({
        id: humans.id,
        displayName: humans.displayName,
        avatarUrl: humans.avatarUrl,
        city: humanProfiles.city,
        primaryDomain: humanProfiles.primaryDomain,
        bio: humanProfiles.bio,
        tier: reputationScores.currentTier,
        totalMissionsCompleted: humanProfiles.totalMissionsCompleted,
      })
      .from(humans)
      .leftJoin(humanProfiles, eq(humans.id, humanProfiles.humanId))
      .leftJoin(reputationScores, eq(humans.id, reputationScores.humanId))
      .where(and(...conditions))
      .orderBy(desc(humanProfiles.totalMissionsCompleted))
      .limit(100); // Fetch extra for scoring

    // Score each candidate
    const scored: DiscoverPerson[] = [];
    for (const candidate of candidates) {
      if (connectedIds.has(candidate.id)) continue;

      let score = 0;
      const reasons: string[] = [];

      // Same domain bonus (x2)
      if (myProfile?.primaryDomain && candidate.primaryDomain === myProfile.primaryDomain) {
        score += 2;
        reasons.push("Same domain");
      }

      // Same city bonus (x1.5)
      if (myProfile?.city && candidate.city && candidate.city.toLowerCase() === myProfile.city.toLowerCase()) {
        score += 1.5;
        reasons.push("Same city");
      }

      // Pathway overlap (x1)
      if (candidate.primaryDomain && myPathwayDomains.has(candidate.primaryDomain)) {
        score += 1;
        reasons.push("Shared learning pathway");
      }

      // Activity bonus
      if ((candidate.totalMissionsCompleted ?? 0) > 0) {
        score += 0.5;
        reasons.push("Active contributor");
      }

      scored.push({ ...candidate, score, reasons });
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit);
  }
}
