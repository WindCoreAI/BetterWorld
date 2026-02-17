/**
 * Feed Scoring Service (Sprint 18: Cooperative Depth & Governance — US11)
 *
 * Scores feed events for personalized ranking:
 * - Freshness decay (exponential, half-life 24h)
 * - Connection bonus (followed user = 3x, same city = 1.5x, same domain = 1.5x)
 * - Fallback to global activity when < 10 personal items
 */
import { feedEvents, follows, humanProfiles } from "@betterworld/db";
import { and, eq, gte, desc, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";

const logger = pino({ name: "feed-scoring" });

const FRESHNESS_HALF_LIFE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface ScoredFeedItem {
  id: string;
  eventType: string;
  actorHumanId: string | null;
  targetId: string;
  targetType: string;
  domain: string | null;
  city: string | null;
  createdAt: Date;
  score: number;
}

export class FeedScoringService {
  constructor(private readonly db: PostgresJsDatabase) {}

  /**
   * Get a scored, personalized feed for a user.
   */
  async getPersonalizedFeed(
    humanId: string,
    limit: number = 20,
    beforeDate?: Date,
  ): Promise<ScoredFeedItem[]> {
    const now = Date.now();

    // Get user's profile for domain/city matching
    const [profile] = await this.db
      .select({
        city: humanProfiles.city,
        primaryDomain: humanProfiles.primaryDomain,
      })
      .from(humanProfiles)
      .where(eq(humanProfiles.humanId, humanId))
      .limit(1);

    // Get followed user IDs
    const followedUsers = await this.db
      .select({ followedId: follows.followingHumanId })
      .from(follows)
      .where(eq(follows.followerHumanId, humanId))
      .limit(200);

    const followedIds = new Set(followedUsers.map((f) => f.followedId));

    // Get recent feed events (30 days)
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const conditions = [gte(feedEvents.createdAt, thirtyDaysAgo)];
    if (beforeDate) {
      conditions.push(sql`${feedEvents.createdAt} < ${beforeDate}`);
    }

    const rawEvents = await this.db
      .select({
        id: feedEvents.id,
        eventType: feedEvents.eventType,
        actorHumanId: feedEvents.actorHumanId,
        targetId: feedEvents.targetId,
        targetType: feedEvents.targetType,
        domain: feedEvents.domain,
        city: feedEvents.city,
        createdAt: feedEvents.createdAt,
      })
      .from(feedEvents)
      .where(and(...conditions))
      .orderBy(desc(feedEvents.createdAt))
      .limit(200); // Fetch extra for scoring

    // Score each event
    const scored = rawEvents.map((event) => {
      let score = 1.0;

      // Freshness decay
      const ageMs = now - event.createdAt.getTime();
      score *= Math.pow(0.5, ageMs / FRESHNESS_HALF_LIFE_MS);

      // Connection bonus
      if (event.actorHumanId && followedIds.has(event.actorHumanId)) {
        score *= 3.0;
      }

      // Domain match
      if (profile?.primaryDomain && event.domain === profile.primaryDomain) {
        score *= 1.5;
      }

      // City match
      if (profile?.city && event.city && event.city.toLowerCase() === profile.city.toLowerCase()) {
        score *= 1.5;
      }

      return { ...event, score };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit);
  }

  /**
   * Prune feed events older than 30 days.
   */
  async pruneOldEvents(): Promise<{ deleted: number }> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await this.db
      .delete(feedEvents)
      .where(sql`${feedEvents.createdAt} < ${thirtyDaysAgo}`);

    const deleted = (result as unknown as { rowCount?: number })?.rowCount ?? 0;
    logger.info({ deleted }, "Pruned old feed events");
    return { deleted };
  }
}
