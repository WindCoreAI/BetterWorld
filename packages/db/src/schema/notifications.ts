/**
 * Notifications Table (Sprint 16: Social Fabric Foundation)
 *
 * In-app notification store for all notification types.
 * Supports aggregation, read/unread status, and WebSocket delivery.
 */
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { notificationTypeEnum } from "./enums";
import { humans } from "./humans";

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientHumanId: uuid("recipient_human_id")
      .notNull()
      .references(() => humans.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    referenceId: uuid("reference_id"),
    referenceType: varchar("reference_type", { length: 50 }),
    actorHumanId: uuid("actor_human_id").references(() => humans.id, {
      onDelete: "set null",
    }),
    message: text("message").notNull(),
    aggregationKey: varchar("aggregation_key", { length: 100 }),
    aggregationCount: integer("aggregation_count").notNull().default(1),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_notifications_recipient_unread").on(
      table.recipientHumanId,
      table.isRead,
    ),
    index("idx_notifications_recipient_created").on(
      table.recipientHumanId,
      table.createdAt,
    ),
    index("idx_notifications_aggregation").on(table.aggregationKey),
  ],
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  recipient: one(humans, {
    fields: [notifications.recipientHumanId],
    references: [humans.id],
    relationName: "notificationsReceived",
  }),
  actor: one(humans, {
    fields: [notifications.actorHumanId],
    references: [humans.id],
    relationName: "notificationsSent",
  }),
}));
