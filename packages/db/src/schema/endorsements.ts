/**
 * Endorsements Table (Sprint 9: Reputation & Impact)
 */
import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { endorsementStatusEnum } from "./enums";
import { humans } from "./humans";

export const endorsements = pgTable(
  "endorsements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromHumanId: uuid("from_human_id")
      .notNull()
      .references(() => humans.id),
    toHumanId: uuid("to_human_id")
      .notNull()
      .references(() => humans.id),
    reason: text("reason").notNull(),
    status: endorsementStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_endorsements_to").on(table.toHumanId, table.status),
    index("idx_endorsements_from").on(table.fromHumanId),
    uniqueIndex("idx_endorsements_unique").on(
      table.fromHumanId,
      table.toHumanId,
    ),
    check(
      "no_self_endorsement",
      sql`${table.fromHumanId} != ${table.toHumanId}`,
    ),
  ],
);

export const endorsementsRelations = relations(endorsements, ({ one }) => ({
  fromHuman: one(humans, {
    fields: [endorsements.fromHumanId],
    references: [humans.id],
    relationName: "endorsementsGiven",
  }),
  toHuman: one(humans, {
    fields: [endorsements.toHumanId],
    references: [humans.id],
    relationName: "endorsementsReceived",
  }),
}));
