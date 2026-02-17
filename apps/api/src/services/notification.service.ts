/**
 * Notification Service (Sprint 16: Social Fabric Foundation)
 *
 * Creates notifications with aggregation, marks read, provides unread count
 * with Redis caching, and pushes real-time via WebSocket.
 */
import { notifications, humans } from "@betterworld/db";
import { and, eq, sql, desc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";

import { getRedis } from "../lib/container.js";
import { sendToHuman } from "../ws/feed.js";

const logger = pino({ name: "notification-service" });

type NotificationType =
  | "streak_warning"
  | "milestone"
  | "cheer"
  | "celebration"
  | "comeback"
  | "reply"
  | "connection_request"
  | "connection_accepted"
  | "follow"
  // Sprint 17: Community Identity & Visible Growth
  | "feedback"
  | "milestone_celebration"
  | "intelligence_report"
  // Sprint 18: Cooperative Depth & Governance
  | "mentorship_request"
  | "mentorship_accepted"
  | "mentorship_completed"
  | "mentorship_rating_prompt"
  | "mentee_mission_completed"
  | "buddy_invitation"
  | "buddy_accepted"
  | "buddy_declined"
  | "help_offer_received"
  | "help_offer_accepted"
  | "help_offer_declined"
  | "moderator_approved"
  | "moderator_decision"
  | "pathway_level_up"
  | "challenge_started"
  | "challenge_completed"
  | "achievement_earned"
  | "ambassador_assigned"
  | "ambassador_welcome"
  | "moderator_revoked"
  | "mission_endorsed";

interface CreateNotificationParams {
  recipientHumanId: string;
  type: NotificationType;
  message: string;
  actorHumanId?: string;
  referenceId?: string;
  referenceType?: string;
  aggregationKey?: string;
}

function unreadCacheKey(humanId: string): string {
  return `notifications:unread:${humanId}`;
}

export class NotificationService {
  constructor(private readonly db: PostgresJsDatabase) {}

  /**
   * Create a notification. If aggregationKey matches an existing unread
   * notification, increment its count instead of creating a new row.
   * Then push via WebSocket.
   */
  async create(params: CreateNotificationParams): Promise<{ id: string; aggregated: boolean }> {
    const {
      recipientHumanId,
      type,
      message,
      actorHumanId,
      referenceId,
      referenceType,
      aggregationKey,
    } = params;

    // Check for aggregation
    if (aggregationKey) {
      const [existing] = await this.db
        .select({ id: notifications.id, aggregationCount: notifications.aggregationCount })
        .from(notifications)
        .where(
          and(
            eq(notifications.aggregationKey, aggregationKey),
            eq(notifications.recipientHumanId, recipientHumanId),
            eq(notifications.isRead, false),
          ),
        )
        .limit(1);

      if (existing) {
        // Aggregate into existing notification
        await this.db
          .update(notifications)
          .set({
            aggregationCount: existing.aggregationCount + 1,
            message,
            actorHumanId: actorHumanId ?? undefined,
            createdAt: new Date(),
          })
          .where(eq(notifications.id, existing.id));

        // Re-push the updated notification via WebSocket
        const notificationData = {
          id: existing.id,
          type,
          message,
          aggregationCount: existing.aggregationCount + 1,
          referenceId,
          referenceType,
        };
        sendToHuman(recipientHumanId, {
          type: "notification",
          data: notificationData,
        });

        logger.info(
          { notificationId: existing.id, aggregationCount: existing.aggregationCount + 1 },
          "Notification aggregated",
        );

        return { id: existing.id, aggregated: true };
      }
    }

    // Create new notification
    const [created] = await this.db
      .insert(notifications)
      .values({
        recipientHumanId,
        type: type as never,
        message,
        actorHumanId,
        referenceId,
        referenceType,
        aggregationKey,
      })
      .returning({ id: notifications.id });

    if (!created) {
      throw new Error("Failed to create notification");
    }

    // Invalidate unread count cache
    await this.invalidateUnreadCache(recipientHumanId);

    // Push via WebSocket
    const notificationData = {
      id: created.id,
      type,
      message,
      aggregationCount: 1,
      referenceId,
      referenceType,
      actorHumanId,
    };
    sendToHuman(recipientHumanId, {
      type: "notification",
      data: notificationData,
    });

    logger.info(
      { notificationId: created.id, recipientHumanId, type },
      "Notification created",
    );

    return { id: created.id, aggregated: false };
  }

  /**
   * Mark a single notification as read.
   */
  async markRead(notificationId: string, humanId: string): Promise<boolean> {
    const [notif] = await this.db
      .select({
        id: notifications.id,
        recipientHumanId: notifications.recipientHumanId,
      })
      .from(notifications)
      .where(eq(notifications.id, notificationId))
      .limit(1);

    if (!notif) return false;

    if (notif.recipientHumanId !== humanId) {
      throw new Error("NOT_RECIPIENT");
    }

    await this.db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(notifications.id, notificationId));

    await this.invalidateUnreadCache(humanId);

    return true;
  }

  /**
   * Mark all unread notifications as read for a human.
   */
  async markAllRead(humanId: string): Promise<number> {
    const result = await this.db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(notifications.recipientHumanId, humanId),
          eq(notifications.isRead, false),
        ),
      )
      .returning({ id: notifications.id });

    await this.invalidateUnreadCache(humanId);

    return result.length;
  }

  /**
   * Get unread notification count with Redis caching (60s TTL).
   */
  async getUnreadCount(humanId: string): Promise<number> {
    const redis = getRedis();
    const cacheKey = unreadCacheKey(humanId);

    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached !== null) {
          return parseInt(cached, 10);
        }
      } catch {
        // Cache miss, proceed to DB
      }
    }

    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientHumanId, humanId),
          eq(notifications.isRead, false),
        ),
      );

    const count = result?.count ?? 0;

    if (redis) {
      try {
        await redis.setex(cacheKey, 60, String(count));
      } catch {
        // Non-fatal
      }
    }

    return count;
  }

  /**
   * List notifications with cursor pagination (newest first).
   */
  async list(
    humanId: string,
    options: {
      cursor?: string;
      limit?: number;
      unreadOnly?: boolean;
      type?: NotificationType;
    } = {},
  ): Promise<{
    notifications: Array<{
      id: string;
      type: string;
      message: string;
      referenceId: string | null;
      referenceType: string | null;
      actorHumanId: string | null;
      actorDisplayName: string | null;
      aggregationCount: number;
      isRead: boolean;
      readAt: Date | null;
      createdAt: Date;
    }>;
    hasMore: boolean;
    nextCursor: string | null;
  }> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const conditions = [eq(notifications.recipientHumanId, humanId)];

    if (options.unreadOnly) {
      conditions.push(eq(notifications.isRead, false));
    }

    if (options.type) {
      conditions.push(eq(notifications.type, options.type as never));
    }

    if (options.cursor) {
      const [cursorTime, cursorId] = options.cursor.split("::");
      if (cursorTime && cursorId) {
        conditions.push(
          sql`(${notifications.createdAt}, ${notifications.id}) < (${cursorTime}, ${cursorId})`,
        );
      }
    }

    const rows = await this.db
      .select({
        id: notifications.id,
        type: notifications.type,
        message: notifications.message,
        referenceId: notifications.referenceId,
        referenceType: notifications.referenceType,
        actorHumanId: notifications.actorHumanId,
        actorDisplayName: humans.displayName,
        aggregationCount: notifications.aggregationCount,
        isRead: notifications.isRead,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .leftJoin(humans, eq(notifications.actorHumanId, humans.id))
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem
      ? `${lastItem.createdAt.toISOString()}::${lastItem.id}`
      : null;

    return {
      notifications: items,
      hasMore,
      nextCursor,
    };
  }

  private async invalidateUnreadCache(humanId: string): Promise<void> {
    const redis = getRedis();
    if (redis) {
      try {
        await redis.del(unreadCacheKey(humanId));
      } catch {
        // Non-fatal
      }
    }
  }
}
