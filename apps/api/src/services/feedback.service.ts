/**
 * Feedback Service (Sprint 17: Community Identity & Visible Growth)
 *
 * Generate actionable feedback from consensus decisions and manage inbox.
 * Cursor-paginated, Redis 1-min cache for unread count.
 */
import { reviewFeedback } from "@betterworld/db";
import { and, count, desc, eq, lt, or } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";

import { NotificationService } from "./notification.service.js";
import { getRedis } from "../lib/container.js";

const logger = pino({ name: "feedback-service" });

const UNREAD_CACHE_TTL = 60; // 1 minute

interface FeedbackItem {
  id: string;
  feedbackType: string;
  message: string;
  improvementTips: unknown[];
  referenceId: string;
  referenceType: string;
  isRead: boolean;
  createdAt: string;
}

interface FeedbackListResult {
  items: FeedbackItem[];
  hasMore: boolean;
  nextCursor: string | null;
  unreadCount: number;
}

export class FeedbackService {
  constructor(private readonly db: PostgresJsDatabase) {}

  /**
   * Generate feedback from consensus decisions.
   * Called as a non-blocking post-action in consensus engine.
   */
  async generateFeedback(
    tx: PostgresJsDatabase,
    submissionId: string,
    submissionType: string,
    decision: string,
    completedEvals: Array<{ validatorId?: string; validatorAgentId?: string; decision: string }>,
  ): Promise<void> {
    // Determine feedback type based on decision
    let feedbackType: "evidence_rejection" | "review_disagreement" | "high_performer_recognition";
    let message: string;
    let tips: Array<{ tip: string; category: string }> = [];

    if (decision === "rejected") {
      feedbackType = "evidence_rejection";
      message = "Your submission was rejected by the review process.";
      tips = [
        { tip: "Ensure your submission clearly addresses the problem described", category: "content" },
        { tip: "Include specific evidence or documentation to support your claims", category: "evidence" },
        { tip: "Check that GPS location matches the mission area", category: "location" },
      ];
    } else if (decision === "approved") {
      // Check for disagreements among evaluators
      const approvals = completedEvals.filter((e) => e.decision === "approved").length;
      const rejections = completedEvals.filter((e) => e.decision === "rejected").length;

      if (rejections > 0 && approvals > rejections) {
        feedbackType = "review_disagreement";
        message = `Your submission was approved, but ${rejections} reviewer${rejections > 1 ? "s" : ""} disagreed. Consider the feedback for future submissions.`;
      } else {
        // Check for high performer pattern (all approvals)
        feedbackType = "high_performer_recognition";
        message = "Excellent work! Your submission received unanimous approval.";
      }
    } else {
      return; // Skip for other decisions
    }

    // Find the submitter (for evidence, it's the submitted_by field)
    // We store feedback referencing the submission, recipient determined at route level
    await tx.insert(reviewFeedback).values({
      recipientHumanId: null, // Set by caller when human submitter is known
      recipientAgentId: null, // Set by caller when agent submitter is known
      feedbackType,
      referenceId: submissionId,
      referenceType: submissionType,
      message,
      improvementTips: tips,
    });

    logger.info(
      { submissionId, feedbackType },
      "Feedback generated",
    );
  }

  /**
   * Create feedback directly with known recipient.
   */
  async createFeedback(params: {
    recipientHumanId?: string;
    recipientAgentId?: string;
    feedbackType: "evidence_rejection" | "review_disagreement" | "high_performer_recognition";
    referenceId: string;
    referenceType: string;
    message: string;
    improvementTips?: Array<{ tip: string; category: string }>;
  }): Promise<string> {
    const [row] = await this.db
      .insert(reviewFeedback)
      .values({
        recipientHumanId: params.recipientHumanId ?? null,
        recipientAgentId: params.recipientAgentId ?? null,
        feedbackType: params.feedbackType,
        referenceId: params.referenceId,
        referenceType: params.referenceType,
        message: params.message,
        improvementTips: params.improvementTips ?? [],
      })
      .returning({ id: reviewFeedback.id });

    // Create notification
    if (params.recipientHumanId) {
      try {
        const notifService = new NotificationService(this.db);
        await notifService.create({
          recipientHumanId: params.recipientHumanId,
          type: "feedback",
          message: params.message,
          referenceId: row!.id,
          referenceType: "feedback",
          aggregationKey: `feedback:${params.recipientHumanId}`,
        });
      } catch {
        // Non-fatal
      }

      // Invalidate unread cache
      try {
        const redis = getRedis();
        if (redis) {
          await redis.del(`feedback-unread:${params.recipientHumanId}`);
        }
      } catch {
        // Non-fatal
      }
    }

    return row!.id;
  }

  /**
   * List feedback for a user (cursor-paginated).
   */
  async listFeedback(
    userId: string,
    isHuman: boolean,
    options: {
      unreadOnly?: boolean;
      type?: string;
      cursor?: string;
      limit?: number;
    },
  ): Promise<FeedbackListResult> {
    const limit = options.limit ?? 20;
    const conditions = [];

    if (isHuman) {
      conditions.push(eq(reviewFeedback.recipientHumanId, userId));
    } else {
      conditions.push(eq(reviewFeedback.recipientAgentId, userId));
    }

    if (options.unreadOnly) {
      conditions.push(eq(reviewFeedback.isRead, false));
    }

    if (options.type) {
      conditions.push(
        eq(
          reviewFeedback.feedbackType,
          options.type as "evidence_rejection" | "review_disagreement" | "high_performer_recognition",
        ),
      );
    }

    if (options.cursor) {
      const [timestamp, id] = options.cursor.split("::");
      if (timestamp && id) {
        conditions.push(
          or(
            lt(reviewFeedback.createdAt, new Date(timestamp)),
            and(
              eq(reviewFeedback.createdAt, new Date(timestamp)),
              lt(reviewFeedback.id, id),
            ),
          )!,
        );
      }
    }

    const rows = await this.db
      .select()
      .from(reviewFeedback)
      .where(and(...conditions))
      .orderBy(desc(reviewFeedback.createdAt), desc(reviewFeedback.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((r) => ({
      id: r.id,
      feedbackType: r.feedbackType,
      message: r.message,
      improvementTips: r.improvementTips as unknown[],
      referenceId: r.referenceId,
      referenceType: r.referenceType,
      isRead: r.isRead,
      createdAt: r.createdAt.toISOString(),
    }));

    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem
      ? `${lastItem.createdAt}::${lastItem.id}`
      : null;

    const unreadCount = await this.getUnreadCount(userId, isHuman);

    return { items, hasMore, nextCursor, unreadCount };
  }

  /**
   * Mark feedback as read with ownership check.
   */
  async markRead(
    feedbackId: string,
    userId: string,
    isHuman: boolean,
  ): Promise<{ id: string; isRead: boolean; readAt: string } | null> {
    const condition = isHuman
      ? eq(reviewFeedback.recipientHumanId, userId)
      : eq(reviewFeedback.recipientAgentId, userId);

    const [row] = await this.db
      .select()
      .from(reviewFeedback)
      .where(and(eq(reviewFeedback.id, feedbackId), condition))
      .limit(1);

    if (!row) return null;

    const now = new Date();
    await this.db
      .update(reviewFeedback)
      .set({ isRead: true, readAt: now })
      .where(eq(reviewFeedback.id, feedbackId));

    // Invalidate unread cache
    try {
      const redis = getRedis();
      if (redis) {
        await redis.del(`feedback-unread:${userId}`);
      }
    } catch {
      // Non-fatal
    }

    return { id: feedbackId, isRead: true, readAt: now.toISOString() };
  }

  /**
   * Get unread count with Redis 1-min cache.
   */
  async getUnreadCount(userId: string, isHuman: boolean): Promise<number> {
    const cacheKey = `feedback-unread:${userId}`;

    try {
      const redis = getRedis();
      if (redis) {
        const cached = await redis.get(cacheKey);
        if (cached !== null) return Number(cached);
      }
    } catch {
      // Cache miss
    }

    const condition = isHuman
      ? eq(reviewFeedback.recipientHumanId, userId)
      : eq(reviewFeedback.recipientAgentId, userId);

    const [result] = await this.db
      .select({ count: count() })
      .from(reviewFeedback)
      .where(and(condition, eq(reviewFeedback.isRead, false)));

    const unreadCount = result?.count ?? 0;

    try {
      const redis = getRedis();
      if (redis) {
        await redis.set(cacheKey, String(unreadCount), "EX", UNREAD_CACHE_TTL);
      }
    } catch {
      // Non-fatal
    }

    return unreadCount;
  }
}
