/**
 * Moderator Actions Table (Sprint 18: Cooperative Depth & Governance)
 *
 * Immutable audit log for all moderator decisions.
 * No UPDATE or DELETE operations allowed per constitution Principle II.
 */
import { relations } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { moderatorActionTypeEnum, problemDomainEnum } from "./enums";
import { humans } from "./humans";

export const moderatorActions = pgTable(
  "moderator_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    moderatorHumanId: uuid("moderator_human_id")
      .notNull()
      .references(() => humans.id),
    actionType: moderatorActionTypeEnum("action_type").notNull(),
    targetId: uuid("target_id").notNull(),
    targetType: varchar("target_type", { length: 50 }).notNull(),
    decision: varchar("decision", { length: 20 }),
    reason: text("reason"),
    domain: problemDomainEnum("domain").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_mod_actions_moderator").on(
      table.moderatorHumanId,
      table.createdAt,
    ),
    index("idx_mod_actions_target").on(table.targetId, table.targetType),
  ],
);

export const moderatorActionsRelations = relations(moderatorActions, ({ one }) => ({
  moderator: one(humans, {
    fields: [moderatorActions.moderatorHumanId],
    references: [humans.id],
  }),
}));
