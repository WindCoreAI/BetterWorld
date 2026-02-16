/**
 * Care Moment Service (Sprint 16: Social Fabric Foundation)
 *
 * Sends cheers and celebrations with optional 1-token gifts.
 * Uses double-entry token accounting. Notification IDs serve as care moment IDs
 * (no separate care_moments table).
 */
import {
  humans,
  tokenTransactions,
} from "@betterworld/db";
import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";

import { NotificationService } from "./notification.service.js";

const logger = pino({ name: "care-moment-service" });

export class CareMomentService {
  constructor(private readonly db: PostgresJsDatabase) {}

  /**
   * Send a cheer to a participant. Optional 1-token gift via double-entry.
   * Returns the cheer (notification) ID and transaction ID if gift was sent.
   */
  async sendCheer(
    senderHumanId: string,
    senderDisplayName: string,
    targetHumanId: string,
    options: {
      notificationId?: string;
      includeGift?: boolean;
    } = {},
  ): Promise<{
    cheerId: string;
    targetHumanId: string;
    giftSent: boolean;
    transactionId: string | null;
  }> {
    // Self-cheer prevention
    if (senderHumanId === targetHumanId) {
      throw new CareMomentError("SELF_CHEER", "Cannot cheer yourself");
    }

    // Check target exists
    const [target] = await this.db
      .select({ id: humans.id })
      .from(humans)
      .where(eq(humans.id, targetHumanId))
      .limit(1);

    if (!target) {
      throw new CareMomentError("NOT_FOUND", "Target human not found");
    }

    let transactionId: string | null = null;
    let giftSent = false;

    if (options.includeGift) {
      // Execute double-entry token transfer: 1 token from sender to receiver
      try {
        transactionId = await this.transferToken(
          senderHumanId,
          targetHumanId,
          "spend_cheer",
          `Cheer gift to participant`,
          `cheer:${senderHumanId}:${targetHumanId}:${Date.now()}`,
        );
        giftSent = true;
      } catch (err) {
        if (err instanceof CareMomentError && err.code === "INSUFFICIENT_BALANCE") {
          // Return the error - caller can offer cheer without gift
          throw err;
        }
        throw err;
      }
    }

    // Create notification for target
    const notifService = new NotificationService(this.db);
    const notification = await notifService.create({
      recipientHumanId: targetHumanId,
      type: "cheer",
      message: `${senderDisplayName} is cheering for you!${giftSent ? " (with a 1 IT gift)" : ""}`,
      actorHumanId: senderHumanId,
      referenceId: options.notificationId ?? undefined,
      referenceType: "care_moment",
      aggregationKey: `cheer:${targetHumanId}`,
    });

    logger.info(
      { senderHumanId, targetHumanId, giftSent },
      "Cheer sent",
    );

    return {
      cheerId: notification.id,
      targetHumanId,
      giftSent,
      transactionId,
    };
  }

  /**
   * Send a celebration to a participant. Optional 1-token gift via double-entry.
   */
  async sendCelebrate(
    senderHumanId: string,
    senderDisplayName: string,
    targetHumanId: string,
    milestoneType: string,
    options: {
      notificationId?: string;
      includeGift?: boolean;
    } = {},
  ): Promise<{
    celebrationId: string;
    targetHumanId: string;
    milestoneType: string;
    giftSent: boolean;
    transactionId: string | null;
  }> {
    // Self-celebrate prevention
    if (senderHumanId === targetHumanId) {
      throw new CareMomentError("SELF_CELEBRATE", "Cannot celebrate yourself");
    }

    // Check target exists
    const [target] = await this.db
      .select({ id: humans.id })
      .from(humans)
      .where(eq(humans.id, targetHumanId))
      .limit(1);

    if (!target) {
      throw new CareMomentError("NOT_FOUND", "Target human not found");
    }

    let transactionId: string | null = null;
    let giftSent = false;

    if (options.includeGift) {
      try {
        transactionId = await this.transferToken(
          senderHumanId,
          targetHumanId,
          "spend_celebrate",
          `Celebration gift for ${milestoneType.replace(/_/g, " ")}`,
          `celebrate:${senderHumanId}:${targetHumanId}:${milestoneType}:${Date.now()}`,
        );
        giftSent = true;
      } catch (err) {
        if (err instanceof CareMomentError && err.code === "INSUFFICIENT_BALANCE") {
          throw err;
        }
        throw err;
      }
    }

    // Milestone label for notification
    const milestoneLabels: Record<string, string> = {
      mission_count: "mission milestone",
      tier_promotion: "tier promotion",
      streak_record: "streak record",
    };
    const milestoneLabel = milestoneLabels[milestoneType] ?? milestoneType;

    // Create notification for target
    const notifService = new NotificationService(this.db);
    const notification = await notifService.create({
      recipientHumanId: targetHumanId,
      type: "celebration",
      message: `${senderDisplayName} celebrated your ${milestoneLabel}!${giftSent ? " (with a 1 IT gift)" : ""}`,
      actorHumanId: senderHumanId,
      referenceId: options.notificationId ?? undefined,
      referenceType: "care_moment",
      aggregationKey: `celebrate:${targetHumanId}:${milestoneType}`,
    });

    logger.info(
      { senderHumanId, targetHumanId, milestoneType, giftSent },
      "Celebration sent",
    );

    return {
      celebrationId: notification.id,
      targetHumanId,
      milestoneType,
      giftSent,
      transactionId,
    };
  }

  /**
   * Double-entry token transfer: deduct 1 from sender, credit 1 to receiver.
   * Uses SELECT FOR UPDATE to prevent race conditions.
   */
  private async transferToken(
    senderHumanId: string,
    receiverHumanId: string,
    transactionType: "spend_cheer" | "spend_celebrate",
    description: string,
    idempotencyKey: string,
  ): Promise<string> {
    return await this.db.transaction(async (tx) => {
      // Lock sender row and get balance
      const [sender] = await tx
        .select({ tokenBalance: humans.tokenBalance })
        .from(humans)
        .where(eq(humans.id, senderHumanId))
        .for("update")
        .limit(1);

      if (!sender) {
        throw new Error("Sender not found");
      }

      const senderBalance = Number(sender.tokenBalance);
      if (senderBalance < 1) {
        throw new CareMomentError(
          "INSUFFICIENT_BALANCE",
          "Insufficient token balance for gift. You can still send a cheer without a gift.",
        );
      }

      // Lock receiver row
      const [receiver] = await tx
        .select({ tokenBalance: humans.tokenBalance })
        .from(humans)
        .where(eq(humans.id, receiverHumanId))
        .for("update")
        .limit(1);

      if (!receiver) {
        throw new Error("Receiver not found");
      }

      const receiverBalance = Number(receiver.tokenBalance);

      // Deduct from sender
      await tx
        .update(humans)
        .set({ tokenBalance: sql`${humans.tokenBalance} - 1` })
        .where(eq(humans.id, senderHumanId));

      // Credit receiver
      await tx
        .update(humans)
        .set({ tokenBalance: sql`${humans.tokenBalance} + 1` })
        .where(eq(humans.id, receiverHumanId));

      // Sender debit transaction
      await tx.insert(tokenTransactions).values({
        humanId: senderHumanId,
        amount: -1,
        balanceBefore: senderBalance,
        balanceAfter: senderBalance - 1,
        transactionType,
        referenceId: receiverHumanId,
        referenceType: "care_gift",
        description,
        idempotencyKey: `${idempotencyKey}:sender`,
      });

      // Receiver credit transaction
      const [receiverTx] = await tx
        .insert(tokenTransactions)
        .values({
          humanId: receiverHumanId,
          amount: 1,
          balanceBefore: receiverBalance,
          balanceAfter: receiverBalance + 1,
          transactionType: "earn_reward",
          referenceId: senderHumanId,
          referenceType: "care_gift",
          description: `Received ${transactionType === "spend_cheer" ? "cheer" : "celebration"} gift`,
          idempotencyKey: `${idempotencyKey}:receiver`,
        })
        .returning({ id: tokenTransactions.id });

      return receiverTx?.id ?? "";
    });
  }
}

/**
 * Custom error class for care moment operations.
 */
export class CareMomentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CareMomentError";
  }
}
