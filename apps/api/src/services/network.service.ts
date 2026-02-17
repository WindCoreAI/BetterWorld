/**
 * Network Service (Sprint 16: Social Fabric Foundation)
 *
 * Aggregates follow, connection, peer review, and endorsement data
 * into a personal network summary. Provides interaction history with specific partners.
 */
import {
  follows,
  connections,
  humanProfiles,
  humans,
  reputationScores,
  peerReviews,
  endorsements,
  evidence,
} from "@betterworld/db";
import { and, eq, or, sql, desc, count } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";

import { getRedis } from "../lib/container.js";

const logger = pino({ name: "network-service" });

const NETWORK_CACHE_TTL = 300; // 5 minutes

interface NetworkSummary {
  followersCount: number;
  followingCount: number;
  connectionsCount: number;
  sharedDomains: string[];
  activeCities: string[];
  recentConnections: Array<{
    humanId: string;
    displayName: string;
    avatarUrl: string | null;
    tier: string;
    city: string | null;
    sharedDomains: string[];
    interactionCount: number;
    connectedSince: string;
  }>;
  topInteractionPartners: Array<{
    humanId: string;
    displayName: string;
    avatarUrl: string | null;
    tier: string;
    interactionCount: number;
    interactionTypes: string[];
  }>;
}

interface Interaction {
  type: string;
  direction: string;
  referenceId: string;
  date: string;
  domain?: string;
  missionTitle?: string;
}

interface InteractionHistory {
  partner: {
    humanId: string;
    displayName: string;
    avatarUrl: string | null;
    tier: string;
    city: string | null;
  };
  sharedDomains: string[];
  totalInteractions: number;
  interactions: Interaction[];
  connectionStatus: string | null;
  isFollowing: boolean;
  isFollowedBy: boolean;
}

export class NetworkService {
  constructor(private readonly db: PostgresJsDatabase) {}

  /**
   * Get aggregated personal network summary.
   * Redis cached for 5 minutes.
   */
  async getNetworkSummary(humanId: string): Promise<NetworkSummary> {
    // Check Redis cache
    try {
      const redis = getRedis();
      if (redis) {
        const cached = await redis.get(`network:me:${humanId}`);
        if (cached) {
          return JSON.parse(cached);
        }
      }
    } catch {
      // Cache miss, continue
    }

    // Followers count
    const [followersResult] = await this.db
      .select({ count: count() })
      .from(follows)
      .where(eq(follows.followingHumanId, humanId));

    // Following count
    const [followingResult] = await this.db
      .select({ count: count() })
      .from(follows)
      .where(eq(follows.followerHumanId, humanId));

    // Connections count (accepted)
    const [connectionsResult] = await this.db
      .select({ count: count() })
      .from(connections)
      .where(
        and(
          or(
            eq(connections.requesterHumanId, humanId),
            eq(connections.recipientHumanId, humanId),
          ),
          eq(connections.status, "accepted"),
        ),
      );

    // Get profile for shared domains and cities
    const [profile] = await this.db
      .select({
        skills: humanProfiles.skills,
        city: humanProfiles.city,
      })
      .from(humanProfiles)
      .where(eq(humanProfiles.humanId, humanId))
      .limit(1);

    const sharedDomains = profile?.skills ?? [];
    const activeCities: string[] = [];
    if (profile?.city) activeCities.push(profile.city);

    // Recent connections (last 5)
    const recentConnectionRows = await this.db
      .select({
        connectionId: connections.id,
        requesterHumanId: connections.requesterHumanId,
        recipientHumanId: connections.recipientHumanId,
        sharedDomains: connections.sharedDomains,
        interactionCount: connections.interactionCount,
        acceptedAt: connections.acceptedAt,
      })
      .from(connections)
      .where(
        and(
          or(
            eq(connections.requesterHumanId, humanId),
            eq(connections.recipientHumanId, humanId),
          ),
          eq(connections.status, "accepted"),
        ),
      )
      .orderBy(desc(connections.acceptedAt))
      .limit(5);

    // Resolve human info for recent connections
    const recentConnections = await Promise.all(
      recentConnectionRows.map(async (conn) => {
        const partnerId =
          conn.requesterHumanId === humanId
            ? conn.recipientHumanId
            : conn.requesterHumanId;

        const [partner] = await this.db
          .select({
            displayName: humans.displayName,
            avatarUrl: humanProfiles.avatarUrl,
            tier: reputationScores.currentTier,
            city: humanProfiles.city,
          })
          .from(humans)
          .leftJoin(humanProfiles, eq(humans.id, humanProfiles.humanId))
          .leftJoin(reputationScores, eq(humans.id, reputationScores.humanId))
          .where(eq(humans.id, partnerId))
          .limit(1);

        return {
          humanId: partnerId,
          displayName: partner?.displayName ?? "Unknown",
          avatarUrl: partner?.avatarUrl ?? null,
          tier: partner?.tier ?? "newcomer",
          city: partner?.city ?? null,
          sharedDomains: (conn.sharedDomains as string[]) ?? [],
          interactionCount: conn.interactionCount ?? 0,
          connectedSince: conn.acceptedAt?.toISOString() ?? new Date().toISOString(),
        };
      }),
    );

    // Top interaction partners — from peer reviews + endorsements
    const interactionPartners = await this.db
      .select({
        partnerId: sql<string>`partner_id`,
        interactionCount: sql<number>`interaction_count`,
        interactionTypes: sql<string[]>`interaction_types`,
      })
      .from(
        sql`(
          SELECT partner_id, COUNT(*) as interaction_count,
            array_agg(DISTINCT interaction_type) as interaction_types
          FROM (
            SELECT
              CASE
                WHEN ${peerReviews.reviewerHumanId} = ${humanId}
                THEN (SELECT submitted_by_human_id FROM evidence WHERE id = ${peerReviews.evidenceId})
                ELSE ${peerReviews.reviewerHumanId}
              END as partner_id,
              'peer_review' as interaction_type
            FROM ${peerReviews}
            WHERE ${peerReviews.reviewerHumanId} = ${humanId}
              OR ${peerReviews.evidenceId} IN (SELECT id FROM evidence WHERE submitted_by_human_id = ${humanId})
            UNION ALL
            SELECT
              CASE
                WHEN ${endorsements.fromHumanId} = ${humanId}
                THEN ${endorsements.toHumanId}
                ELSE ${endorsements.fromHumanId}
              END as partner_id,
              'endorsement' as interaction_type
            FROM ${endorsements}
            WHERE ${endorsements.fromHumanId} = ${humanId}
              OR ${endorsements.toHumanId} = ${humanId}
          ) interactions
          WHERE partner_id IS NOT NULL AND partner_id != ${humanId}
          GROUP BY partner_id
          ORDER BY interaction_count DESC
          LIMIT 5
        ) top_partners`,
      );

    // Resolve partner info
    const topInteractionPartners = await Promise.all(
      interactionPartners.map(async (p) => {
        const [partner] = await this.db
          .select({
            displayName: humans.displayName,
            avatarUrl: humanProfiles.avatarUrl,
            tier: reputationScores.currentTier,
          })
          .from(humans)
          .leftJoin(humanProfiles, eq(humans.id, humanProfiles.humanId))
          .leftJoin(reputationScores, eq(humans.id, reputationScores.humanId))
          .where(eq(humans.id, p.partnerId))
          .limit(1);

        return {
          humanId: p.partnerId,
          displayName: partner?.displayName ?? "Unknown",
          avatarUrl: partner?.avatarUrl ?? null,
          tier: partner?.tier ?? "newcomer",
          interactionCount: Number(p.interactionCount),
          interactionTypes: p.interactionTypes ?? [],
        };
      }),
    );

    const summary: NetworkSummary = {
      followersCount: followersResult?.count ?? 0,
      followingCount: followingResult?.count ?? 0,
      connectionsCount: connectionsResult?.count ?? 0,
      sharedDomains,
      activeCities,
      recentConnections,
      topInteractionPartners,
    };

    // Cache result
    try {
      const redis = getRedis();
      if (redis) {
        await redis.set(
          `network:me:${humanId}`,
          JSON.stringify(summary),
          "EX",
          NETWORK_CACHE_TTL,
        );
      }
    } catch {
      // Cache write failure is non-fatal
    }

    logger.info({ humanId }, "Network summary fetched");

    return summary;
  }

  /**
   * Get interaction history with a specific partner.
   */
  async getInteractionHistory(
    humanId: string,
    partnerId: string,
  ): Promise<InteractionHistory> {
    // Get partner info
    const [partner] = await this.db
      .select({
        displayName: humans.displayName,
        avatarUrl: humanProfiles.avatarUrl,
        tier: reputationScores.currentTier,
        city: humanProfiles.city,
        skills: humanProfiles.skills,
      })
      .from(humans)
      .leftJoin(humanProfiles, eq(humans.id, humanProfiles.humanId))
      .leftJoin(reputationScores, eq(humans.id, reputationScores.humanId))
      .where(eq(humans.id, partnerId))
      .limit(1);

    if (!partner) {
      throw new Error("Partner not found");
    }

    // Get own skills for shared domains
    const [ownProfile] = await this.db
      .select({ skills: humanProfiles.skills })
      .from(humanProfiles)
      .where(eq(humanProfiles.humanId, humanId))
      .limit(1);

    const ownSkills = new Set(ownProfile?.skills ?? []);
    const partnerSkills = partner.skills ?? [];
    const sharedDomains = partnerSkills.filter((s: string) => ownSkills.has(s));

    // Get peer review interactions
    const reviewInteractions: Interaction[] = [];

    // Reviews I gave on their evidence
    const myReviews = await this.db
      .select({
        id: peerReviews.id,
        createdAt: peerReviews.createdAt,
      })
      .from(peerReviews)
      .innerJoin(evidence, eq(evidence.id, peerReviews.evidenceId))
      .where(
        and(
          eq(peerReviews.reviewerHumanId, humanId),
          eq(evidence.submittedByHumanId, partnerId),
        ),
      )
      .orderBy(desc(peerReviews.createdAt))
      .limit(20);

    for (const r of myReviews) {
      reviewInteractions.push({
        type: "peer_review",
        direction: "you_reviewed_them",
        referenceId: r.id,
        date: r.createdAt.toISOString(),
      });
    }

    // Reviews they gave on my evidence
    const theirReviews = await this.db
      .select({
        id: peerReviews.id,
        createdAt: peerReviews.createdAt,
      })
      .from(peerReviews)
      .innerJoin(evidence, eq(evidence.id, peerReviews.evidenceId))
      .where(
        and(
          eq(peerReviews.reviewerHumanId, partnerId),
          eq(evidence.submittedByHumanId, humanId),
        ),
      )
      .orderBy(desc(peerReviews.createdAt))
      .limit(20);

    for (const r of theirReviews) {
      reviewInteractions.push({
        type: "peer_review",
        direction: "they_reviewed_you",
        referenceId: r.id,
        date: r.createdAt.toISOString(),
      });
    }

    // Endorsement interactions
    const endorsementInteractions: Interaction[] = [];

    const givenEndorsements = await this.db
      .select({ id: endorsements.id, createdAt: endorsements.createdAt })
      .from(endorsements)
      .where(
        and(
          eq(endorsements.fromHumanId, humanId),
          eq(endorsements.toHumanId, partnerId),
        ),
      );

    for (const e of givenEndorsements) {
      endorsementInteractions.push({
        type: "endorsement",
        direction: "you_endorsed_them",
        referenceId: e.id,
        date: e.createdAt.toISOString(),
      });
    }

    const receivedEndorsements = await this.db
      .select({ id: endorsements.id, createdAt: endorsements.createdAt })
      .from(endorsements)
      .where(
        and(
          eq(endorsements.fromHumanId, partnerId),
          eq(endorsements.toHumanId, humanId),
        ),
      );

    for (const e of receivedEndorsements) {
      endorsementInteractions.push({
        type: "endorsement",
        direction: "they_endorsed_you",
        referenceId: e.id,
        date: e.createdAt.toISOString(),
      });
    }

    // All interactions sorted by date
    const allInteractions = [
      ...reviewInteractions,
      ...endorsementInteractions,
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Connection status
    const [conn] = await this.db
      .select({ status: connections.status })
      .from(connections)
      .where(
        or(
          and(
            eq(connections.requesterHumanId, humanId),
            eq(connections.recipientHumanId, partnerId),
          ),
          and(
            eq(connections.requesterHumanId, partnerId),
            eq(connections.recipientHumanId, humanId),
          ),
        ),
      )
      .limit(1);

    // Follow status
    const [isFollowingRow] = await this.db
      .select({ id: follows.id })
      .from(follows)
      .where(
        and(
          eq(follows.followerHumanId, humanId),
          eq(follows.followingHumanId, partnerId),
        ),
      )
      .limit(1);

    const [isFollowedByRow] = await this.db
      .select({ id: follows.id })
      .from(follows)
      .where(
        and(
          eq(follows.followerHumanId, partnerId),
          eq(follows.followingHumanId, humanId),
        ),
      )
      .limit(1);

    return {
      partner: {
        humanId: partnerId,
        displayName: partner.displayName,
        avatarUrl: partner.avatarUrl ?? null,
        tier: partner.tier ?? "newcomer",
        city: partner.city ?? null,
      },
      sharedDomains,
      totalInteractions: allInteractions.length,
      interactions: allInteractions.slice(0, 50),
      connectionStatus: conn?.status ?? null,
      isFollowing: Boolean(isFollowingRow),
      isFollowedBy: Boolean(isFollowedByRow),
    };
  }
}
