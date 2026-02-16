/**
 * Connections Table (Sprint 16: Social Fabric Foundation)
 *
 * Mutual connection relationship between human participants.
 * Supports pending/accepted/declined lifecycle with 30-day cooldown.
 */
import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { connectionStatusEnum } from "./enums";
import { humans } from "./humans";

export const connections = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requesterHumanId: uuid("requester_human_id")
      .notNull()
      .references(() => humans.id, { onDelete: "cascade" }),
    recipientHumanId: uuid("recipient_human_id")
      .notNull()
      .references(() => humans.id, { onDelete: "cascade" }),
    status: connectionStatusEnum("status").notNull().default("pending"),
    sharedDomains: text("shared_domains")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    interactionCount: integer("interaction_count").notNull().default(0),
    firstInteractionAt: timestamp("first_interaction_at", {
      withTimezone: true,
    }),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_connections_requester_status").using(
      "btree",
      table.requesterHumanId,
    ),
    index("idx_connections_recipient_status").using(
      "btree",
      table.recipientHumanId,
    ),
    index("idx_connections_recipient_pending").on(table.recipientHumanId),
    uniqueIndex("idx_connections_unique").on(
      table.requesterHumanId,
      table.recipientHumanId,
    ),
    check(
      "no_self_connection",
      sql`${table.requesterHumanId} != ${table.recipientHumanId}`,
    ),
  ],
);

export const connectionsRelations = relations(connections, ({ one }) => ({
  requester: one(humans, {
    fields: [connections.requesterHumanId],
    references: [humans.id],
    relationName: "connectionsSent",
  }),
  recipient: one(humans, {
    fields: [connections.recipientHumanId],
    references: [humans.id],
    relationName: "connectionsReceived",
  }),
}));
