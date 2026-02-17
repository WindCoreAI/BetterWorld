/**
 * Moderator Audit Service (Sprint 18: Cooperative Depth & Governance — US3)
 *
 * Records all moderator decisions as immutable entries in the moderator_actions table.
 * No UPDATE or DELETE operations are exposed — only INSERT per constitution Principle II.
 */
import { moderatorActions } from "@betterworld/db";
import { eq, desc, and, count } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";

const logger = pino({ name: "moderator-audit" });

export interface AuditEntry {
  moderatorHumanId: string;
  actionType: "content_approved" | "content_rejected" | "content_escalated" | "help_response" | "newcomer_welcome";
  targetId: string;
  targetType: string;
  decision: string;
  reason?: string;
  domain: string;
}

export class ModeratorAuditService {
  constructor(private readonly db: PostgresJsDatabase) {}

  /**
   * Record an immutable moderator action.
   */
  async record(entry: AuditEntry): Promise<{ id: string }> {
    const [created] = await this.db
      .insert(moderatorActions)
      .values({
        moderatorHumanId: entry.moderatorHumanId,
        actionType: entry.actionType,
        targetId: entry.targetId,
        targetType: entry.targetType,
        decision: entry.decision,
        reason: entry.reason ?? null,
        domain: entry.domain as never,
      })
      .returning({ id: moderatorActions.id });

    if (!created) {
      throw new Error("Failed to record moderator action");
    }

    logger.info(
      { moderatorId: entry.moderatorHumanId, actionType: entry.actionType, targetId: entry.targetId },
      "Moderator action recorded",
    );

    return { id: created.id };
  }

  /**
   * Get audit trail for a specific moderator.
   */
  async getByModerator(
    moderatorHumanId: string,
    limit = 50,
    _cursor?: string,
  ): Promise<Array<{
    id: string;
    actionType: string;
    targetId: string;
    targetType: string;
    decision: string | null;
    reason: string | null;
    domain: string;
    createdAt: Date;
  }>> {
    const query = this.db
      .select({
        id: moderatorActions.id,
        actionType: moderatorActions.actionType,
        targetId: moderatorActions.targetId,
        targetType: moderatorActions.targetType,
        decision: moderatorActions.decision,
        reason: moderatorActions.reason,
        domain: moderatorActions.domain,
        createdAt: moderatorActions.createdAt,
      })
      .from(moderatorActions)
      .where(eq(moderatorActions.moderatorHumanId, moderatorHumanId))
      .orderBy(desc(moderatorActions.createdAt))
      .limit(limit);

    return query;
  }

  /**
   * Get moderator statistics.
   */
  async getStats(moderatorHumanId: string): Promise<{
    totalActions: number;
    approvedCount: number;
    rejectedCount: number;
    escalatedCount: number;
  }> {
    const [total] = await this.db
      .select({ count: count() })
      .from(moderatorActions)
      .where(eq(moderatorActions.moderatorHumanId, moderatorHumanId));

    const [approved] = await this.db
      .select({ count: count() })
      .from(moderatorActions)
      .where(
        and(
          eq(moderatorActions.moderatorHumanId, moderatorHumanId),
          eq(moderatorActions.decision, "approved"),
        ),
      );

    const [rejected] = await this.db
      .select({ count: count() })
      .from(moderatorActions)
      .where(
        and(
          eq(moderatorActions.moderatorHumanId, moderatorHumanId),
          eq(moderatorActions.decision, "rejected"),
        ),
      );

    const [escalated] = await this.db
      .select({ count: count() })
      .from(moderatorActions)
      .where(
        and(
          eq(moderatorActions.moderatorHumanId, moderatorHumanId),
          eq(moderatorActions.decision, "escalated"),
        ),
      );

    return {
      totalActions: total?.count ?? 0,
      approvedCount: approved?.count ?? 0,
      rejectedCount: rejected?.count ?? 0,
      escalatedCount: escalated?.count ?? 0,
    };
  }
}
