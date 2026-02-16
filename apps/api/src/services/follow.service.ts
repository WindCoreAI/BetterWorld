/**
 * Follow Service (Sprint 16: Social Fabric Foundation)
 *
 * One-way follow relationships: follow, unfollow, list following/followers,
 * get status, get counts. Max 200 follows per user.
 */
import {
  follows,
  humans,
  humanProfiles,
  reputationScores,
} from "@betterworld/db";
import { and, eq, sql, desc, count } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";

const logger = pino({ name: "follow-service" });

const MAX_FOLLOWS = 200;

export class FollowService {
  constructor(private readonly db: PostgresJsDatabase) {}

  /**
   * Follow a human participant.
   * Returns the follow record on success.
   */
  async follow(
    followerHumanId: string,
    followingHumanId: string,
  ): Promise<{ id: string; followingHumanId: string; createdAt: Date }> {
    // Self-follow prevention
    if (followerHumanId === followingHumanId) {
      throw new FollowError("SELF_FOLLOW", "Cannot follow yourself");
    }

    // Check target exists
    const [target] = await this.db
      .select({ id: humans.id })
      .from(humans)
      .where(eq(humans.id, followingHumanId))
      .limit(1);

    if (!target) {
      throw new FollowError("NOT_FOUND", "Target human does not exist");
    }

    // Check duplicate
    const [existing] = await this.db
      .select({ id: follows.id })
      .from(follows)
      .where(
        and(
          eq(follows.followerHumanId, followerHumanId),
          eq(follows.followingHumanId, followingHumanId),
        ),
      )
      .limit(1);

    if (existing) {
      throw new FollowError("ALREADY_FOLLOWING", "Already following this user");
    }

    // Check 200 follow limit
    const [countResult] = await this.db
      .select({ count: count() })
      .from(follows)
      .where(eq(follows.followerHumanId, followerHumanId));

    if ((countResult?.count ?? 0) >= MAX_FOLLOWS) {
      throw new FollowError(
        "FOLLOW_LIMIT_REACHED",
        `Already following ${MAX_FOLLOWS} users`,
      );
    }

    // Create follow
    const [created] = await this.db
      .insert(follows)
      .values({
        followerHumanId,
        followingHumanId,
      })
      .returning({
        id: follows.id,
        followingHumanId: follows.followingHumanId,
        createdAt: follows.createdAt,
      });

    if (!created) {
      throw new Error("Failed to create follow");
    }

    logger.info(
      { followerHumanId, followingHumanId },
      "Follow created",
    );

    return created;
  }

  /**
   * Unfollow a human participant.
   */
  async unfollow(
    followerHumanId: string,
    followingHumanId: string,
  ): Promise<boolean> {
    const result = await this.db
      .delete(follows)
      .where(
        and(
          eq(follows.followerHumanId, followerHumanId),
          eq(follows.followingHumanId, followingHumanId),
        ),
      )
      .returning({ id: follows.id });

    if (result.length === 0) {
      throw new FollowError("NOT_FOUND", "Not following this user");
    }

    logger.info(
      { followerHumanId, followingHumanId },
      "Follow removed",
    );

    return true;
  }

  /**
   * List humans the authenticated user follows (cursor-paginated).
   */
  async getFollowing(
    humanId: string,
    options: { cursor?: string; limit?: number } = {},
  ): Promise<{
    items: Array<{
      humanId: string;
      displayName: string;
      avatarUrl: string | null;
      tier: string;
      city: string | null;
      followedAt: Date;
    }>;
    hasMore: boolean;
    nextCursor: string | null;
  }> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const conditions = [eq(follows.followerHumanId, humanId)];

    if (options.cursor) {
      const [cursorTime, cursorId] = options.cursor.split("::");
      if (cursorTime && cursorId) {
        conditions.push(
          sql`(${follows.createdAt}, ${follows.id}) < (${cursorTime}, ${cursorId})`,
        );
      }
    }

    const rows = await this.db
      .select({
        followId: follows.id,
        humanId: follows.followingHumanId,
        displayName: humans.displayName,
        avatarUrl: humanProfiles.avatarUrl,
        tier: reputationScores.currentTier,
        city: humanProfiles.city,
        followedAt: follows.createdAt,
      })
      .from(follows)
      .innerJoin(humans, eq(follows.followingHumanId, humans.id))
      .leftJoin(humanProfiles, eq(follows.followingHumanId, humanProfiles.humanId))
      .leftJoin(reputationScores, eq(follows.followingHumanId, reputationScores.humanId))
      .where(and(...conditions))
      .orderBy(desc(follows.createdAt), desc(follows.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const lastItem = items[items.length - 1];
    const nextCursor =
      hasMore && lastItem
        ? `${lastItem.followedAt.toISOString()}::${lastItem.followId}`
        : null;

    return {
      items: items.map((r) => ({
        humanId: r.humanId,
        displayName: r.displayName,
        avatarUrl: r.avatarUrl ?? null,
        tier: r.tier ?? "newcomer",
        city: r.city ?? null,
        followedAt: r.followedAt,
      })),
      hasMore,
      nextCursor,
    };
  }

  /**
   * List humans who follow the authenticated user (cursor-paginated).
   * Includes isFollowingBack for each follower.
   */
  async getFollowers(
    humanId: string,
    options: { cursor?: string; limit?: number } = {},
  ): Promise<{
    items: Array<{
      humanId: string;
      displayName: string;
      avatarUrl: string | null;
      tier: string;
      city: string | null;
      followedAt: Date;
      isFollowingBack: boolean;
    }>;
    hasMore: boolean;
    nextCursor: string | null;
  }> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const conditions = [eq(follows.followingHumanId, humanId)];

    if (options.cursor) {
      const [cursorTime, cursorId] = options.cursor.split("::");
      if (cursorTime && cursorId) {
        conditions.push(
          sql`(${follows.createdAt}, ${follows.id}) < (${cursorTime}, ${cursorId})`,
        );
      }
    }

    // Subquery to check if the authenticated user follows back
    const followBackSubquery = sql<boolean>`EXISTS (
      SELECT 1 FROM follows fb
      WHERE fb.follower_human_id = ${humanId}
      AND fb.following_human_id = ${follows.followerHumanId}
    )`;

    const rows = await this.db
      .select({
        followId: follows.id,
        humanId: follows.followerHumanId,
        displayName: humans.displayName,
        avatarUrl: humanProfiles.avatarUrl,
        tier: reputationScores.currentTier,
        city: humanProfiles.city,
        followedAt: follows.createdAt,
        isFollowingBack: followBackSubquery.as("is_following_back"),
      })
      .from(follows)
      .innerJoin(humans, eq(follows.followerHumanId, humans.id))
      .leftJoin(humanProfiles, eq(follows.followerHumanId, humanProfiles.humanId))
      .leftJoin(reputationScores, eq(follows.followerHumanId, reputationScores.humanId))
      .where(and(...conditions))
      .orderBy(desc(follows.createdAt), desc(follows.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const lastItem = items[items.length - 1];
    const nextCursor =
      hasMore && lastItem
        ? `${lastItem.followedAt.toISOString()}::${lastItem.followId}`
        : null;

    return {
      items: items.map((r) => ({
        humanId: r.humanId,
        displayName: r.displayName,
        avatarUrl: r.avatarUrl ?? null,
        tier: r.tier ?? "newcomer",
        city: r.city ?? null,
        followedAt: r.followedAt,
        isFollowingBack: Boolean(r.isFollowingBack),
      })),
      hasMore,
      nextCursor,
    };
  }

  /**
   * Check follow status between authenticated user and a target.
   */
  async getStatus(
    humanId: string,
    targetHumanId: string,
  ): Promise<{
    isFollowing: boolean;
    isFollowedBy: boolean;
    followingSince: Date | null;
  }> {
    const [isFollowingRow] = await this.db
      .select({ createdAt: follows.createdAt })
      .from(follows)
      .where(
        and(
          eq(follows.followerHumanId, humanId),
          eq(follows.followingHumanId, targetHumanId),
        ),
      )
      .limit(1);

    const [isFollowedByRow] = await this.db
      .select({ id: follows.id })
      .from(follows)
      .where(
        and(
          eq(follows.followerHumanId, targetHumanId),
          eq(follows.followingHumanId, humanId),
        ),
      )
      .limit(1);

    return {
      isFollowing: Boolean(isFollowingRow),
      isFollowedBy: Boolean(isFollowedByRow),
      followingSince: isFollowingRow?.createdAt ?? null,
    };
  }

  /**
   * Get follow counts for a human (public).
   */
  async getCounts(
    humanId: string,
  ): Promise<{
    followersCount: number;
    followingCount: number;
  }> {
    const [followersResult] = await this.db
      .select({ count: count() })
      .from(follows)
      .where(eq(follows.followingHumanId, humanId));

    const [followingResult] = await this.db
      .select({ count: count() })
      .from(follows)
      .where(eq(follows.followerHumanId, humanId));

    return {
      followersCount: followersResult?.count ?? 0,
      followingCount: followingResult?.count ?? 0,
    };
  }
}

/**
 * Custom error class for follow operations.
 */
export class FollowError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FollowError";
  }
}
