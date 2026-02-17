/**
 * Ambassador Assignments Table (Sprint 18: Cooperative Depth & Governance)
 *
 * Tracks welcome ambassador assignments to newcomers.
 */
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { humans } from "./humans";

export const ambassadorAssignments = pgTable(
  "ambassador_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ambassadorHumanId: uuid("ambassador_human_id")
      .notNull()
      .references(() => humans.id),
    newcomerHumanId: uuid("newcomer_human_id")
      .notNull()
      .references(() => humans.id),
    message: varchar("message", { length: 500 }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    tokenAwarded: boolean("token_awarded").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // One ambassador per newcomer
    uniqueIndex("idx_ambassador_assignments_newcomer").on(
      table.newcomerHumanId,
    ),
    index("idx_ambassador_assignments_ambassador").on(
      table.ambassadorHumanId,
      table.createdAt,
    ),
  ],
);

export const ambassadorAssignmentsRelations = relations(
  ambassadorAssignments,
  ({ one }) => ({
    ambassador: one(humans, {
      fields: [ambassadorAssignments.ambassadorHumanId],
      references: [humans.id],
      relationName: "ambassadorAssignments",
    }),
    newcomer: one(humans, {
      fields: [ambassadorAssignments.newcomerHumanId],
      references: [humans.id],
      relationName: "newcomerAssignment",
    }),
  }),
);
