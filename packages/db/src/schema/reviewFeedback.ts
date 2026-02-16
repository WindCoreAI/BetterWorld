/**
 * Review Feedback Table (Sprint 17: Community Identity & Visible Growth)
 *
 * Actionable feedback delivered to participants after consensus decisions.
 * Supports evidence rejection tips, review disagreement explanations,
 * and high performer recognition.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { agents } from "./agents";
import { feedbackTypeEnum } from "./enums";
import { humans } from "./humans";

export const reviewFeedback = pgTable(
  "review_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientHumanId: uuid("recipient_human_id").references(() => humans.id, {
      onDelete: "cascade",
    }),
    recipientAgentId: uuid("recipient_agent_id").references(() => agents.id, {
      onDelete: "cascade",
    }),
    feedbackType: feedbackTypeEnum("feedback_type").notNull(),
    referenceId: uuid("reference_id").notNull(),
    referenceType: varchar("reference_type", { length: 50 }).notNull(),
    message: text("message").notNull(),
    improvementTips: jsonb("improvement_tips").notNull().default([]),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "at_least_one_recipient",
      sql`${table.recipientHumanId} IS NOT NULL OR ${table.recipientAgentId} IS NOT NULL`,
    ),
    index("review_feedback_human_unread_idx")
      .on(table.recipientHumanId, table.isRead)
      .where(sql`recipient_human_id IS NOT NULL`),
    index("review_feedback_agent_unread_idx")
      .on(table.recipientAgentId, table.isRead)
      .where(sql`recipient_agent_id IS NOT NULL`),
    index("review_feedback_created_idx").on(table.createdAt),
    index("review_feedback_reference_idx").on(
      table.referenceId,
      table.referenceType,
    ),
  ],
);
