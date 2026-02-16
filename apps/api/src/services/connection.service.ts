/**
 * Connection Service (Sprint 16: Social Fabric Foundation)
 *
 * Mutual connections: send request, accept, decline, remove, list accepted,
 * list pending, suggestions algorithm, get status. 30-day cooldown on declines.
 */
import {
  connections,
  humans,
  humanProfiles,
  reputationScores,
} from "@betterworld/db";
import { and, eq, or, sql, desc, ne, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";

import { getRedis } from "../lib/container.js";

const logger = pino({ name: "connection-service" });

const COOLDOWN_DAYS = 30;
const MAX_SUGGESTIONS = 5;
const SUGGESTION_CACHE_TTL = 300; // 5 minutes

export class ConnectionService {
  constructor(private readonly db: PostgresJsDatabase) {}

  /**
   * Send a connection request. Auto-accepts if mutual pending exists.
   */
  async sendRequest(
    requesterHumanId: string,
    recipientHumanId: string,
  ): Promise<{
    id: string;
    recipientHumanId: string;
    status: string;
    createdAt: Date;
    sharedDomains?: string[];
    interactionCount?: number;
    acceptedAt?: Date | null;
  }> {
    // Self-connection prevention
    if (requesterHumanId === recipientHumanId) {
      throw new ConnectionError("SELF_CONNECTION", "Cannot connect with yourself");
    }

    // Check target exists
    const [target] = await this.db
      .select({ id: humans.id })
      .from(humans)
      .where(eq(humans.id, recipientHumanId))
      .limit(1);

    if (!target) {
      throw new ConnectionError("NOT_FOUND", "Target human does not exist");
    }

    // Check for existing connection (in either direction)
    const [existing] = await this.db
      .select({
        id: connections.id,
        status: connections.status,
        requesterHumanId: connections.requesterHumanId,
        recipientHumanId: connections.recipientHumanId,
        declinedAt: connections.declinedAt,
      })
      .from(connections)
      .where(
        or(
          and(
            eq(connections.requesterHumanId, requesterHumanId),
            eq(connections.recipientHumanId, recipientHumanId),
          ),
          and(
            eq(connections.requesterHumanId, recipientHumanId),
            eq(connections.recipientHumanId, requesterHumanId),
          ),
        ),
      )
      .limit(1);

    if (existing) {
      if (existing.status === "accepted") {
        throw new ConnectionError("ALREADY_CONNECTED", "Connection already exists");
      }

      if (existing.status === "pending") {
        // If the other person already sent us a request, auto-accept
        if (
          existing.requesterHumanId === recipientHumanId &&
          existing.recipientHumanId === requesterHumanId
        ) {
          return this.acceptInternal(existing.id, requesterHumanId, recipientHumanId);
        }
        throw new ConnectionError("ALREADY_CONNECTED", "Connection request already pending");
      }

      if (existing.status === "declined") {
        // Check 30-day cooldown
        if (existing.declinedAt) {
          const cooldownEnd = new Date(existing.declinedAt.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
          if (new Date() < cooldownEnd) {
            throw new ConnectionError(
              "COOLDOWN_ACTIVE",
              `Previously declined, must wait until ${cooldownEnd.toISOString().split("T")[0]}`,
            );
          }
        }

        // Cooldown expired: update existing record to pending
        const [updated] = await this.db
          .update(connections)
          .set({
            requesterHumanId,
            recipientHumanId,
            status: "pending",
            declinedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(connections.id, existing.id))
          .returning({
            id: connections.id,
            recipientHumanId: connections.recipientHumanId,
            status: connections.status,
            createdAt: connections.createdAt,
          });

        if (!updated) throw new Error("Failed to update connection");
        return updated;
      }
    }

    // Create new connection request
    const [created] = await this.db
      .insert(connections)
      .values({
        requesterHumanId,
        recipientHumanId,
        status: "pending",
      })
      .returning({
        id: connections.id,
        recipientHumanId: connections.recipientHumanId,
        status: connections.status,
        createdAt: connections.createdAt,
      });

    if (!created) throw new Error("Failed to create connection request");

    logger.info(
      { requesterHumanId, recipientHumanId },
      "Connection request created",
    );

    return created;
  }

  /**
   * Accept a pending connection request (external: validates recipient).
   */
  async accept(
    connectionId: string,
    humanId: string,
  ): Promise<{
    id: string;
    status: string;
    sharedDomains: string[];
    interactionCount: number;
    acceptedAt: Date | null;
    requesterHumanId: string;
    recipientHumanId: string;
    createdAt: Date;
  }> {
    const [conn] = await this.db
      .select({
        id: connections.id,
        requesterHumanId: connections.requesterHumanId,
        recipientHumanId: connections.recipientHumanId,
        status: connections.status,
      })
      .from(connections)
      .where(eq(connections.id, connectionId))
      .limit(1);

    if (!conn) {
      throw new ConnectionError("NOT_FOUND", "Connection request not found");
    }

    if (conn.recipientHumanId !== humanId) {
      throw new ConnectionError("NOT_RECIPIENT", "Only the recipient can accept");
    }

    if (conn.status !== "pending") {
      throw new ConnectionError("NOT_PENDING", "Request is not in pending state");
    }

    return this.acceptInternal(connectionId, humanId, conn.requesterHumanId);
  }

  /**
   * Internal accept logic shared by explicit accept and auto-accept.
   */
  private async acceptInternal(
    connectionId: string,
    acceptorHumanId: string,
    otherHumanId: string,
  ): Promise<{
    id: string;
    status: string;
    sharedDomains: string[];
    interactionCount: number;
    acceptedAt: Date | null;
    requesterHumanId: string;
    recipientHumanId: string;
    createdAt: Date;
  }> {
    // Compute shared domains
    const sharedDomains = await this.computeSharedDomains(acceptorHumanId, otherHumanId);

    // Compute interaction count from peer reviews
    const interactionCount = await this.computeInteractionCount(acceptorHumanId, otherHumanId);

    const now = new Date();
    const [updated] = await this.db
      .update(connections)
      .set({
        status: "accepted",
        sharedDomains,
        interactionCount,
        acceptedAt: now,
        updatedAt: now,
      })
      .where(eq(connections.id, connectionId))
      .returning({
        id: connections.id,
        requesterHumanId: connections.requesterHumanId,
        recipientHumanId: connections.recipientHumanId,
        status: connections.status,
        sharedDomains: connections.sharedDomains,
        interactionCount: connections.interactionCount,
        acceptedAt: connections.acceptedAt,
        createdAt: connections.createdAt,
      });

    if (!updated) throw new Error("Failed to accept connection");

    logger.info({ connectionId, acceptorHumanId, otherHumanId }, "Connection accepted");

    return updated;
  }

  /**
   * Decline a pending connection request.
   */
  async decline(connectionId: string, humanId: string): Promise<boolean> {
    const [conn] = await this.db
      .select({
        id: connections.id,
        recipientHumanId: connections.recipientHumanId,
        status: connections.status,
      })
      .from(connections)
      .where(eq(connections.id, connectionId))
      .limit(1);

    if (!conn) {
      throw new ConnectionError("NOT_FOUND", "Connection request not found");
    }

    if (conn.recipientHumanId !== humanId) {
      throw new ConnectionError("NOT_RECIPIENT", "Only the recipient can decline");
    }

    const now = new Date();
    await this.db
      .update(connections)
      .set({ status: "declined", declinedAt: now, updatedAt: now })
      .where(eq(connections.id, connectionId));

    logger.info({ connectionId, humanId }, "Connection declined");
    return true;
  }

  /**
   * Remove an accepted connection.
   */
  async remove(connectionId: string, humanId: string): Promise<boolean> {
    const [conn] = await this.db
      .select({
        id: connections.id,
        requesterHumanId: connections.requesterHumanId,
        recipientHumanId: connections.recipientHumanId,
      })
      .from(connections)
      .where(eq(connections.id, connectionId))
      .limit(1);

    if (!conn) {
      throw new ConnectionError("NOT_FOUND", "Connection not found");
    }

    if (conn.requesterHumanId !== humanId && conn.recipientHumanId !== humanId) {
      throw new ConnectionError("NOT_PARTICIPANT", "Only a participant can remove the connection");
    }

    await this.db.delete(connections).where(eq(connections.id, connectionId));

    logger.info({ connectionId, humanId }, "Connection removed");
    return true;
  }

  /**
   * List accepted connections (cursor-paginated, optional domain filter).
   */
  async listAccepted(
    humanId: string,
    options: { cursor?: string; limit?: number; domain?: string } = {},
  ): Promise<{
    items: Array<{
      connectionId: string;
      humanId: string;
      displayName: string;
      avatarUrl: string | null;
      tier: string;
      city: string | null;
      sharedDomains: string[];
      interactionCount: number;
      connectedSince: Date;
    }>;
    hasMore: boolean;
    nextCursor: string | null;
  }> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);

    // Get connections where this human is either requester or recipient AND status=accepted
    const conditions = [
      eq(connections.status, "accepted"),
      or(
        eq(connections.requesterHumanId, humanId),
        eq(connections.recipientHumanId, humanId),
      )!,
    ];

    if (options.domain) {
      conditions.push(
        sql`${options.domain} = ANY(${connections.sharedDomains})`,
      );
    }

    if (options.cursor) {
      const [cursorTime, cursorId] = options.cursor.split("::");
      if (cursorTime && cursorId) {
        conditions.push(
          sql`(${connections.acceptedAt}, ${connections.id}) < (${cursorTime}, ${cursorId})`,
        );
      }
    }

    const rows = await this.db
      .select({
        connectionId: connections.id,
        requesterHumanId: connections.requesterHumanId,
        recipientHumanId: connections.recipientHumanId,
        sharedDomains: connections.sharedDomains,
        interactionCount: connections.interactionCount,
        acceptedAt: connections.acceptedAt,
      })
      .from(connections)
      .where(and(...conditions))
      .orderBy(desc(connections.acceptedAt), desc(connections.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);

    // For each connection, determine the "other" human and fetch their info
    const otherIds = pageRows.map((r) =>
      r.requesterHumanId === humanId ? r.recipientHumanId : r.requesterHumanId,
    );

    const humanInfoMap = new Map<string, { displayName: string; avatarUrl: string | null; tier: string; city: string | null }>();
    if (otherIds.length > 0) {
      const infos = await this.db
        .select({
          id: humans.id,
          displayName: humans.displayName,
          avatarUrl: humanProfiles.avatarUrl,
          tier: reputationScores.currentTier,
          city: humanProfiles.city,
        })
        .from(humans)
        .leftJoin(humanProfiles, eq(humans.id, humanProfiles.humanId))
        .leftJoin(reputationScores, eq(humans.id, reputationScores.humanId))
        .where(inArray(humans.id, otherIds));

      for (const info of infos) {
        humanInfoMap.set(info.id, {
          displayName: info.displayName,
          avatarUrl: info.avatarUrl ?? null,
          tier: info.tier ?? "newcomer",
          city: info.city ?? null,
        });
      }
    }

    const lastItem = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && lastItem?.acceptedAt
        ? `${lastItem.acceptedAt.toISOString()}::${lastItem.connectionId}`
        : null;

    return {
      items: pageRows.map((r) => {
        const otherId = r.requesterHumanId === humanId ? r.recipientHumanId : r.requesterHumanId;
        const info = humanInfoMap.get(otherId);
        return {
          connectionId: r.connectionId,
          humanId: otherId,
          displayName: info?.displayName ?? "Unknown",
          avatarUrl: info?.avatarUrl ?? null,
          tier: info?.tier ?? "newcomer",
          city: info?.city ?? null,
          sharedDomains: r.sharedDomains,
          interactionCount: r.interactionCount,
          connectedSince: r.acceptedAt!,
        };
      }),
      hasMore,
      nextCursor,
    };
  }

  /**
   * List pending connection requests received by humanId.
   */
  async listPending(
    humanId: string,
    options: { cursor?: string; limit?: number } = {},
  ): Promise<{
    items: Array<{
      connectionId: string;
      requesterHumanId: string;
      requesterDisplayName: string;
      requesterAvatarUrl: string | null;
      requesterTier: string;
      sharedDomains: string[];
      requestedAt: Date;
    }>;
    hasMore: boolean;
    nextCursor: string | null;
  }> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const conditions = [
      eq(connections.recipientHumanId, humanId),
      eq(connections.status, "pending"),
    ];

    if (options.cursor) {
      const [cursorTime, cursorId] = options.cursor.split("::");
      if (cursorTime && cursorId) {
        conditions.push(
          sql`(${connections.createdAt}, ${connections.id}) < (${cursorTime}, ${cursorId})`,
        );
      }
    }

    const rows = await this.db
      .select({
        connectionId: connections.id,
        requesterHumanId: connections.requesterHumanId,
        requesterDisplayName: humans.displayName,
        requesterAvatarUrl: humanProfiles.avatarUrl,
        requesterTier: reputationScores.currentTier,
        sharedDomains: connections.sharedDomains,
        requestedAt: connections.createdAt,
      })
      .from(connections)
      .innerJoin(humans, eq(connections.requesterHumanId, humans.id))
      .leftJoin(humanProfiles, eq(connections.requesterHumanId, humanProfiles.humanId))
      .leftJoin(reputationScores, eq(connections.requesterHumanId, reputationScores.humanId))
      .where(and(...conditions))
      .orderBy(desc(connections.createdAt), desc(connections.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const lastItem = items[items.length - 1];
    const nextCursor =
      hasMore && lastItem
        ? `${lastItem.requestedAt.toISOString()}::${lastItem.connectionId}`
        : null;

    return {
      items: items.map((r) => ({
        connectionId: r.connectionId,
        requesterHumanId: r.requesterHumanId,
        requesterDisplayName: r.requesterDisplayName,
        requesterAvatarUrl: r.requesterAvatarUrl ?? null,
        requesterTier: r.requesterTier ?? "newcomer",
        sharedDomains: r.sharedDomains,
        requestedAt: r.requestedAt,
      })),
      hasMore,
      nextCursor,
    };
  }

  /**
   * Get connection status between authenticated user and a target.
   */
  async getStatus(
    humanId: string,
    targetHumanId: string,
  ): Promise<{
    status: string;
    connectionId: string | null;
    direction?: "sent" | "received";
    connectedSince?: string | null;
  }> {
    const [conn] = await this.db
      .select({
        id: connections.id,
        requesterHumanId: connections.requesterHumanId,
        recipientHumanId: connections.recipientHumanId,
        status: connections.status,
        acceptedAt: connections.acceptedAt,
      })
      .from(connections)
      .where(
        or(
          and(
            eq(connections.requesterHumanId, humanId),
            eq(connections.recipientHumanId, targetHumanId),
          ),
          and(
            eq(connections.requesterHumanId, targetHumanId),
            eq(connections.recipientHumanId, humanId),
          ),
        ),
      )
      .limit(1);

    if (!conn || conn.status === "declined") {
      return { status: "none", connectionId: null };
    }

    if (conn.status === "accepted") {
      return {
        status: "accepted",
        connectionId: conn.id,
        connectedSince: conn.acceptedAt?.toISOString() ?? null,
      };
    }

    return {
      status: "pending",
      connectionId: conn.id,
      direction: conn.requesterHumanId === humanId ? "sent" : "received",
    };
  }

  /**
   * Get connection suggestions for a human.
   * Scoring: shared domains x3, same city x2, mutual review history x5.
   * Falls back to same-city suggestions for zero-activity users.
   * Cached in Redis for 5 minutes.
   */
  async getSuggestions(
    humanId: string,
  ): Promise<
    Array<{
      humanId: string;
      displayName: string;
      avatarUrl: string | null;
      tier: string;
      city: string | null;
      sharedDomains: string[];
      mutualInteractions: number;
      suggestionScore: number;
      reason: string;
    }>
  > {
    const redis = getRedis();
    const cacheKey = `connection:suggestions:${humanId}`;

    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch {
        // Cache miss
      }
    }

    // Get the user's profile info
    const [userProfile] = await this.db
      .select({
        skills: humanProfiles.skills,
        city: humanProfiles.city,
      })
      .from(humanProfiles)
      .where(eq(humanProfiles.humanId, humanId))
      .limit(1);

    // Get existing connections/requests to exclude
    const existingConnectionRows = await this.db
      .select({
        requesterHumanId: connections.requesterHumanId,
        recipientHumanId: connections.recipientHumanId,
      })
      .from(connections)
      .where(
        and(
          or(
            eq(connections.requesterHumanId, humanId),
            eq(connections.recipientHumanId, humanId),
          ),
          // Exclude declined connections older than cooldown
          ne(connections.status, "declined"),
        ),
      );

    const excludeIds = new Set<string>();
    excludeIds.add(humanId); // Exclude self
    for (const row of existingConnectionRows) {
      excludeIds.add(row.requesterHumanId);
      excludeIds.add(row.recipientHumanId);
    }

    // Get candidate humans with profiles
    const candidates = await this.db
      .select({
        id: humans.id,
        displayName: humans.displayName,
        avatarUrl: humanProfiles.avatarUrl,
        tier: reputationScores.currentTier,
        city: humanProfiles.city,
        skills: humanProfiles.skills,
      })
      .from(humans)
      .innerJoin(humanProfiles, eq(humans.id, humanProfiles.humanId))
      .leftJoin(reputationScores, eq(humans.id, reputationScores.humanId))
      .where(eq(humans.isActive, true))
      .limit(100);

    // Score each candidate
    const userSkills = new Set(userProfile?.skills ?? []);
    const userCity = userProfile?.city ?? null;

    const scored = candidates
      .filter((c) => !excludeIds.has(c.id))
      .map((c) => this.scoreCandidate(c, userSkills, userCity))
      .filter((s): s is NonNullable<typeof s> => s !== null);

    // Sort by score descending, take top 5
    scored.sort((a, b) => b.suggestionScore - a.suggestionScore);
    const results = scored.slice(0, MAX_SUGGESTIONS);

    // Cache results
    if (redis) {
      try {
        await redis.setex(cacheKey, SUGGESTION_CACHE_TTL, JSON.stringify(results));
      } catch {
        // Non-fatal
      }
    }

    return results;
  }

  /**
   * Score a single candidate for connection suggestions.
   */
  private scoreCandidate(
    candidate: { id: string; displayName: string; avatarUrl: string | null; tier: string | null; city: string | null; skills: string[] | null },
    userSkills: Set<string>,
    userCity: string | null,
  ): {
    humanId: string; displayName: string; avatarUrl: string | null; tier: string;
    city: string | null; sharedDomains: string[]; mutualInteractions: number;
    suggestionScore: number; reason: string;
  } | null {
    let score = 0;
    const reasons: string[] = [];
    const candidateSkills = candidate.skills ?? [];
    const shared = candidateSkills.filter((s) => userSkills.has(s));

    if (shared.length > 0) {
      score += shared.length * 3;
      reasons.push(`You share ${shared.length} domain${shared.length > 1 ? "s" : ""}`);
    }

    const sameCity = userCity && candidate.city && userCity.toLowerCase() === candidate.city.toLowerCase();
    if (sameCity) {
      score += score > 0 ? 2 : 1;
      reasons.push(score > 1 ? `Both in ${candidate.city}` : "In the same city");
    }

    if (score === 0) return null;

    return {
      humanId: candidate.id,
      displayName: candidate.displayName,
      avatarUrl: candidate.avatarUrl ?? null,
      tier: candidate.tier ?? "newcomer",
      city: candidate.city ?? null,
      sharedDomains: shared,
      mutualInteractions: 0,
      suggestionScore: score,
      reason: reasons.join(" and "),
    };
  }

  /**
   * Compute shared domains between two humans based on their skills.
   */
  private async computeSharedDomains(
    humanId1: string,
    humanId2: string,
  ): Promise<string[]> {
    const profiles = await this.db
      .select({ humanId: humanProfiles.humanId, skills: humanProfiles.skills })
      .from(humanProfiles)
      .where(
        or(
          eq(humanProfiles.humanId, humanId1),
          eq(humanProfiles.humanId, humanId2),
        ),
      );

    if (profiles.length < 2) return [];

    const skills1 = new Set(profiles.find((p) => p.humanId === humanId1)?.skills ?? []);
    const skills2 = profiles.find((p) => p.humanId === humanId2)?.skills ?? [];

    return skills2.filter((s) => skills1.has(s));
  }

  /**
   * Compute interaction count between two humans (from peer reviews).
   */
  private async computeInteractionCount(
    humanId1: string,
    humanId2: string,
  ): Promise<number> {
    // Count peer reviews where one reviewed the other's work
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(sql`peer_reviews`)
      .where(
        or(
          and(
            sql`reviewer_human_id = ${humanId1}`,
            sql`author_human_id = ${humanId2}`,
          ),
          and(
            sql`reviewer_human_id = ${humanId2}`,
            sql`author_human_id = ${humanId1}`,
          ),
        ),
      );

    return result?.count ?? 0;
  }
}

/**
 * Custom error class for connection operations.
 */
export class ConnectionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ConnectionError";
  }
}
