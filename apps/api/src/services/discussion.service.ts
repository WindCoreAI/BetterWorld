/**
 * Discussion Service (Sprint 16: Social Fabric Foundation)
 *
 * Discussion threads and replies with full 3-layer guardrail pipeline.
 * Content NOT visible while pending per constitution.
 */
import {
  discussionThreads,
  discussionReplies,
  humans,
  humanProfiles,
  reputationScores,
} from "@betterworld/db";
import { evaluateLayerA } from "@betterworld/guardrails";
import { QUEUE_NAMES } from "@betterworld/shared";
import { Queue } from "bullmq";
import { and, eq, sql, desc, asc, ne } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import Redis from "ioredis";
import pino from "pino";

import { NotificationService } from "./notification.service.js";
import { getRedis } from "../lib/container.js";

const logger = pino({ name: "discussion-service" });

// Known domains from problemDomainEnum
const KNOWN_DOMAINS = [
  "clean_water", "food_security", "education_access", "healthcare",
  "renewable_energy", "waste_management", "affordable_housing",
  "digital_inclusion", "mental_health", "biodiversity",
  "climate_action", "gender_equality", "economic_opportunity",
  "peace_justice", "community_resilience",
];

// Known cities from Open311 configs
const KNOWN_CITIES = ["sanfrancisco", "newyork", "seattle"];

let _guardrailQueue: Queue | null = null;
function getGuardrailQueue(): Queue {
  if (!_guardrailQueue) {
    _guardrailQueue = new Queue(QUEUE_NAMES.GUARDRAIL_EVALUATION, {
      connection: new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
        maxRetriesPerRequest: null,
        lazyConnect: true,
      }),
    });
  }
  return _guardrailQueue;
}

export class DiscussionService {
  constructor(private readonly db: PostgresJsDatabase) {}

  /**
   * Create a new discussion thread with guardrail pipeline.
   */
  async createThread(params: {
    authorHumanId: string;
    authorDisplayName: string;
    scopeType: "domain" | "city";
    scopeValue: string;
    title: string;
    content: string;
  }): Promise<{
    id: string;
    scopeType: string;
    scopeValue: string;
    title: string;
    content: string;
    authorHumanId: string;
    authorDisplayName: string;
    guardrailStatus: string;
    replyCount: number;
    createdAt: Date;
  }> {
    const { authorHumanId, authorDisplayName, scopeType, scopeValue, title, content } = params;

    // Validate scope
    if (scopeType === "domain" && !KNOWN_DOMAINS.includes(scopeValue)) {
      throw new DiscussionError("INVALID_SCOPE", `Unknown domain: ${scopeValue}`);
    }
    if (scopeType === "city" && !KNOWN_CITIES.includes(scopeValue.toLowerCase())) {
      throw new DiscussionError("INVALID_SCOPE", `Unknown city: ${scopeValue}`);
    }

    // Rate limit: 10 threads/day
    await this.checkThreadRateLimit(authorHumanId);

    // Layer A: synchronous rule engine check
    const combinedContent = `${title}\n${content}`;
    const layerAResult = await evaluateLayerA(combinedContent);
    if (!layerAResult.passed) {
      throw new DiscussionError(
        "CONTENT_REJECTED",
        `Content rejected by rule engine: ${layerAResult.forbiddenPatterns.join(", ")}`,
      );
    }

    // Store with pending status
    const [created] = await this.db
      .insert(discussionThreads)
      .values({
        scopeType,
        scopeValue,
        authorHumanId,
        title,
        content,
        guardrailStatus: "pending",
      })
      .returning({
        id: discussionThreads.id,
        scopeType: discussionThreads.scopeType,
        scopeValue: discussionThreads.scopeValue,
        title: discussionThreads.title,
        content: discussionThreads.content,
        authorHumanId: discussionThreads.authorHumanId,
        guardrailStatus: discussionThreads.guardrailStatus,
        replyCount: discussionThreads.replyCount,
        createdAt: discussionThreads.createdAt,
      });

    if (!created) throw new Error("Failed to create discussion thread");

    // Queue Layer B evaluation
    try {
      const queue = getGuardrailQueue();
      await queue.add("evaluate", {
        evaluationId: created.id, // Use thread ID as evaluation ID for callback routing
        contentId: created.id,
        contentType: "discussion_thread",
        content: combinedContent,
        agentId: "system", // Placeholder for human-authored content
        trustTier: "new",
        humanAuthorId: authorHumanId,
      }, {
        jobId: `discussion-thread-${created.id}`,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      });
    } catch (err) {
      logger.error({ err, threadId: created.id }, "Failed to queue Layer B evaluation");
    }

    // Increment daily rate limit counter
    await this.incrementThreadCount(authorHumanId);

    logger.info(
      { threadId: created.id, authorHumanId, scopeType, scopeValue },
      "Discussion thread created (pending)",
    );

    return {
      ...created,
      authorDisplayName,
    };
  }

  /**
   * Create a reply to a thread with guardrail pipeline.
   */
  async createReply(params: {
    threadId: string;
    authorHumanId: string;
    authorDisplayName: string;
    content: string;
  }): Promise<{
    id: string;
    threadId: string;
    content: string;
    authorHumanId: string;
    authorDisplayName: string;
    guardrailStatus: string;
    createdAt: Date;
  }> {
    const { threadId, authorHumanId, authorDisplayName, content } = params;

    // Check thread exists and is approved
    const [thread] = await this.db
      .select({ id: discussionThreads.id, guardrailStatus: discussionThreads.guardrailStatus })
      .from(discussionThreads)
      .where(eq(discussionThreads.id, threadId))
      .limit(1);

    if (!thread) {
      throw new DiscussionError("NOT_FOUND", "Thread not found");
    }

    if (thread.guardrailStatus !== "approved") {
      throw new DiscussionError("NOT_FOUND", "Thread not found");
    }

    // Rate limit: 50 replies/day
    await this.checkReplyRateLimit(authorHumanId);

    // Layer A: synchronous rule engine check
    const layerAResult = await evaluateLayerA(content);
    if (!layerAResult.passed) {
      throw new DiscussionError(
        "CONTENT_REJECTED",
        `Content rejected by rule engine: ${layerAResult.forbiddenPatterns.join(", ")}`,
      );
    }

    // Store with pending status
    const [created] = await this.db
      .insert(discussionReplies)
      .values({
        threadId,
        authorHumanId,
        content,
        guardrailStatus: "pending",
      })
      .returning({
        id: discussionReplies.id,
        threadId: discussionReplies.threadId,
        content: discussionReplies.content,
        authorHumanId: discussionReplies.authorHumanId,
        guardrailStatus: discussionReplies.guardrailStatus,
        createdAt: discussionReplies.createdAt,
      });

    if (!created) throw new Error("Failed to create discussion reply");

    // Queue Layer B evaluation
    try {
      const queue = getGuardrailQueue();
      await queue.add("evaluate", {
        evaluationId: created.id,
        contentId: created.id,
        contentType: "discussion_reply",
        content,
        agentId: "system",
        trustTier: "new",
        humanAuthorId: authorHumanId,
      }, {
        jobId: `discussion-reply-${created.id}`,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      });
    } catch (err) {
      logger.error({ err, replyId: created.id }, "Failed to queue Layer B evaluation");
    }

    // Increment daily rate limit counter
    await this.incrementReplyCount(authorHumanId);

    logger.info(
      { replyId: created.id, threadId, authorHumanId },
      "Discussion reply created (pending)",
    );

    return {
      ...created,
      authorDisplayName,
    };
  }

  /**
   * Callback from guardrail worker on evaluation completion.
   * Updates guardrailStatus and triggers notifications as needed.
   */
  async onGuardrailComplete(
    contentId: string,
    contentType: "discussion_thread" | "discussion_reply",
    decision: "approved" | "rejected" | "flagged",
    humanAuthorId?: string,
  ): Promise<void> {
    if (contentType === "discussion_thread") {
      await this.handleThreadGuardrail(contentId, decision, humanAuthorId);
    } else if (contentType === "discussion_reply") {
      await this.handleReplyGuardrail(contentId, decision, humanAuthorId);
    }
  }

  private async handleThreadGuardrail(
    contentId: string,
    decision: "approved" | "rejected" | "flagged",
    humanAuthorId?: string,
  ): Promise<void> {
    await this.db
      .update(discussionThreads)
      .set({ guardrailStatus: decision, updatedAt: new Date() })
      .where(eq(discussionThreads.id, contentId));

    if (!humanAuthorId) return;

    const messageMap: Record<string, string | undefined> = {
      approved: "Your discussion thread has been approved and is now visible",
      rejected: "Your discussion thread did not meet community guidelines",
    };
    const message = messageMap[decision];
    if (!message) return;

    try {
      const notifService = new NotificationService(this.db);
      await notifService.create({
        recipientHumanId: humanAuthorId,
        type: "reply",
        message,
        referenceId: contentId,
        referenceType: "discussion_thread",
      });
    } catch {
      // Non-fatal
    }
  }

  private async handleReplyGuardrail(
    contentId: string,
    decision: "approved" | "rejected" | "flagged",
    humanAuthorId?: string,
  ): Promise<void> {
    await this.db
      .update(discussionReplies)
      .set({ guardrailStatus: decision })
      .where(eq(discussionReplies.id, contentId));

    if (decision === "approved") {
      await this.handleApprovedReply(contentId);
    }

    if (humanAuthorId && decision !== "approved") {
      await this.notifyReplyAuthor(contentId, decision, humanAuthorId);
    }
  }

  private async handleApprovedReply(contentId: string): Promise<void> {
    const [reply] = await this.db
      .select({
        threadId: discussionReplies.threadId,
        authorHumanId: discussionReplies.authorHumanId,
      })
      .from(discussionReplies)
      .where(eq(discussionReplies.id, contentId))
      .limit(1);

    if (!reply) return;

    await this.db
      .update(discussionThreads)
      .set({
        replyCount: sql`${discussionThreads.replyCount} + 1`,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(discussionThreads.id, reply.threadId));

    try {
      await this.notifyReplyParticipants(reply.threadId, reply.authorHumanId);
    } catch {
      // Non-fatal
    }
  }

  private async notifyReplyParticipants(threadId: string, replyAuthorId: string): Promise<void> {
    const [thread] = await this.db
      .select({ authorHumanId: discussionThreads.authorHumanId })
      .from(discussionThreads)
      .where(eq(discussionThreads.id, threadId))
      .limit(1);

    const notifService = new NotificationService(this.db);
    const repliers = await this.db
      .selectDistinct({ authorHumanId: discussionReplies.authorHumanId })
      .from(discussionReplies)
      .where(
        and(
          eq(discussionReplies.threadId, threadId),
          eq(discussionReplies.guardrailStatus, "approved"),
          ne(discussionReplies.authorHumanId, replyAuthorId),
        ),
      );

    const recipientIds = new Set<string>();
    if (thread && thread.authorHumanId !== replyAuthorId) {
      recipientIds.add(thread.authorHumanId);
    }
    for (const r of repliers) {
      recipientIds.add(r.authorHumanId);
    }

    for (const recipientId of recipientIds) {
      await notifService.create({
        recipientHumanId: recipientId,
        type: "reply",
        message: "Someone replied to a discussion you're participating in",
        actorHumanId: replyAuthorId,
        referenceId: threadId,
        referenceType: "discussion_thread",
        aggregationKey: `reply:${threadId}`,
      });
    }
  }

  private async notifyReplyAuthor(
    contentId: string,
    decision: string,
    humanAuthorId: string,
  ): Promise<void> {
    try {
      const notifService = new NotificationService(this.db);
      await notifService.create({
        recipientHumanId: humanAuthorId,
        type: "reply",
        message: decision === "rejected"
          ? "Your reply did not meet community guidelines"
          : "Your reply is under review",
        referenceId: contentId,
        referenceType: "discussion_reply",
      });
    } catch {
      // Non-fatal
    }
  }

  /**
   * List threads by scope (approved only, cursor-paginated).
   */
  async listThreads(options: {
    scopeType: string;
    scopeValue: string;
    cursor?: string;
    limit?: number;
    sort?: "activity" | "recent";
  }): Promise<{
    items: Array<{
      id: string;
      title: string;
      authorHumanId: string;
      authorDisplayName: string;
      authorAvatarUrl: string | null;
      authorTier: string;
      replyCount: number;
      lastActivityAt: Date;
      createdAt: Date;
    }>;
    hasMore: boolean;
    nextCursor: string | null;
  }> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const sortField = options.sort === "recent" ? discussionThreads.createdAt : discussionThreads.lastActivityAt;

    const conditions = [
      eq(discussionThreads.scopeType, options.scopeType as "domain" | "city"),
      eq(discussionThreads.scopeValue, options.scopeValue),
      eq(discussionThreads.guardrailStatus, "approved"),
    ];

    if (options.cursor) {
      const [cursorTime, cursorId] = options.cursor.split("::");
      if (cursorTime && cursorId) {
        conditions.push(
          sql`(${sortField}, ${discussionThreads.id}) < (${cursorTime}, ${cursorId})`,
        );
      }
    }

    const rows = await this.db
      .select({
        id: discussionThreads.id,
        title: discussionThreads.title,
        authorHumanId: discussionThreads.authorHumanId,
        authorDisplayName: humans.displayName,
        authorAvatarUrl: humanProfiles.avatarUrl,
        authorTier: reputationScores.currentTier,
        replyCount: discussionThreads.replyCount,
        lastActivityAt: discussionThreads.lastActivityAt,
        createdAt: discussionThreads.createdAt,
      })
      .from(discussionThreads)
      .innerJoin(humans, eq(discussionThreads.authorHumanId, humans.id))
      .leftJoin(humanProfiles, eq(discussionThreads.authorHumanId, humanProfiles.humanId))
      .leftJoin(reputationScores, eq(discussionThreads.authorHumanId, reputationScores.humanId))
      .where(and(...conditions))
      .orderBy(desc(sortField), desc(discussionThreads.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const lastItem = items[items.length - 1];
    const cursorValue = options.sort === "recent" ? lastItem?.createdAt : lastItem?.lastActivityAt;
    const nextCursor =
      hasMore && lastItem && cursorValue
        ? `${cursorValue.toISOString()}::${lastItem.id}`
        : null;

    return {
      items: items.map((r) => ({
        id: r.id,
        title: r.title,
        authorHumanId: r.authorHumanId,
        authorDisplayName: r.authorDisplayName,
        authorAvatarUrl: r.authorAvatarUrl ?? null,
        authorTier: r.authorTier ?? "newcomer",
        replyCount: r.replyCount,
        lastActivityAt: r.lastActivityAt,
        createdAt: r.createdAt,
      })),
      hasMore,
      nextCursor,
    };
  }

  /**
   * Get a single thread (approved only).
   */
  async getThread(threadId: string): Promise<{
    id: string;
    scopeType: string;
    scopeValue: string;
    title: string;
    content: string;
    authorHumanId: string;
    authorDisplayName: string;
    authorAvatarUrl: string | null;
    authorTier: string;
    replyCount: number;
    lastActivityAt: Date;
    createdAt: Date;
  } | null> {
    const [row] = await this.db
      .select({
        id: discussionThreads.id,
        scopeType: discussionThreads.scopeType,
        scopeValue: discussionThreads.scopeValue,
        title: discussionThreads.title,
        content: discussionThreads.content,
        authorHumanId: discussionThreads.authorHumanId,
        authorDisplayName: humans.displayName,
        authorAvatarUrl: humanProfiles.avatarUrl,
        authorTier: reputationScores.currentTier,
        replyCount: discussionThreads.replyCount,
        lastActivityAt: discussionThreads.lastActivityAt,
        createdAt: discussionThreads.createdAt,
        guardrailStatus: discussionThreads.guardrailStatus,
      })
      .from(discussionThreads)
      .innerJoin(humans, eq(discussionThreads.authorHumanId, humans.id))
      .leftJoin(humanProfiles, eq(discussionThreads.authorHumanId, humanProfiles.humanId))
      .leftJoin(reputationScores, eq(discussionThreads.authorHumanId, reputationScores.humanId))
      .where(eq(discussionThreads.id, threadId))
      .limit(1);

    if (!row || row.guardrailStatus !== "approved") return null;

    return {
      id: row.id,
      scopeType: row.scopeType,
      scopeValue: row.scopeValue,
      title: row.title,
      content: row.content,
      authorHumanId: row.authorHumanId,
      authorDisplayName: row.authorDisplayName,
      authorAvatarUrl: row.authorAvatarUrl ?? null,
      authorTier: row.authorTier ?? "newcomer",
      replyCount: row.replyCount,
      lastActivityAt: row.lastActivityAt,
      createdAt: row.createdAt,
    };
  }

  /**
   * List replies for a thread (approved only, chronological, cursor-paginated).
   */
  async listReplies(
    threadId: string,
    options: { cursor?: string; limit?: number } = {},
  ): Promise<{
    items: Array<{
      id: string;
      content: string;
      authorHumanId: string;
      authorDisplayName: string;
      authorAvatarUrl: string | null;
      authorTier: string;
      createdAt: Date;
    }>;
    hasMore: boolean;
    nextCursor: string | null;
  }> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const conditions = [
      eq(discussionReplies.threadId, threadId),
      eq(discussionReplies.guardrailStatus, "approved"),
    ];

    if (options.cursor) {
      const [cursorTime, cursorId] = options.cursor.split("::");
      if (cursorTime && cursorId) {
        conditions.push(
          sql`(${discussionReplies.createdAt}, ${discussionReplies.id}) > (${cursorTime}, ${cursorId})`,
        );
      }
    }

    const rows = await this.db
      .select({
        id: discussionReplies.id,
        content: discussionReplies.content,
        authorHumanId: discussionReplies.authorHumanId,
        authorDisplayName: humans.displayName,
        authorAvatarUrl: humanProfiles.avatarUrl,
        authorTier: reputationScores.currentTier,
        createdAt: discussionReplies.createdAt,
      })
      .from(discussionReplies)
      .innerJoin(humans, eq(discussionReplies.authorHumanId, humans.id))
      .leftJoin(humanProfiles, eq(discussionReplies.authorHumanId, humanProfiles.humanId))
      .leftJoin(reputationScores, eq(discussionReplies.authorHumanId, reputationScores.humanId))
      .where(and(...conditions))
      .orderBy(asc(discussionReplies.createdAt), asc(discussionReplies.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const lastItem = items[items.length - 1];
    const nextCursor =
      hasMore && lastItem
        ? `${lastItem.createdAt.toISOString()}::${lastItem.id}`
        : null;

    return {
      items: items.map((r) => ({
        id: r.id,
        content: r.content,
        authorHumanId: r.authorHumanId,
        authorDisplayName: r.authorDisplayName,
        authorAvatarUrl: r.authorAvatarUrl ?? null,
        authorTier: r.authorTier ?? "newcomer",
        createdAt: r.createdAt,
      })),
      hasMore,
      nextCursor,
    };
  }

  // --- Rate Limiting ---

  private async checkThreadRateLimit(humanId: string): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    const key = `ratelimit:threads:${humanId}:${this.todayKey()}`;
    const count = await redis.get(key);
    if (count !== null && parseInt(count, 10) >= 10) {
      throw new DiscussionError("THREAD_RATE_LIMIT", "Exceeded 10 threads per day");
    }
  }

  private async incrementThreadCount(humanId: string): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    const key = `ratelimit:threads:${humanId}:${this.todayKey()}`;
    await redis.incr(key);
    await redis.expire(key, 86400);
  }

  private async checkReplyRateLimit(humanId: string): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    const key = `ratelimit:replies:${humanId}:${this.todayKey()}`;
    const count = await redis.get(key);
    if (count !== null && parseInt(count, 10) >= 50) {
      throw new DiscussionError("REPLY_RATE_LIMIT", "Exceeded 50 replies per day");
    }
  }

  private async incrementReplyCount(humanId: string): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    const key = `ratelimit:replies:${humanId}:${this.todayKey()}`;
    await redis.incr(key);
    await redis.expire(key, 86400);
  }

  private todayKey(): string {
    return new Date().toISOString().split("T")[0]!;
  }
}

export class DiscussionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DiscussionError";
  }
}
