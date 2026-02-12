import { relations } from "drizzle-orm";
import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { attestationStatusEnum } from "./enums";
import { humans } from "./humans";
import { problems } from "./problems";

export const attestations = pgTable(
  "attestations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "restrict" }),
    humanId: uuid("human_id")
      .notNull()
      .references(() => humans.id, { onDelete: "restrict" }),
    statusType: attestationStatusEnum("status_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("attestations_problem_status_idx").on(table.problemId, table.statusType),
    index("attestations_human_idx").on(table.humanId),
    uniqueIndex("attestations_unique").on(table.problemId, table.humanId),
  ],
);

export const attestationsRelations = relations(attestations, ({ one }) => ({
  problem: one(problems, {
    fields: [attestations.problemId],
    references: [problems.id],
  }),
  human: one(humans, {
    fields: [attestations.humanId],
    references: [humans.id],
  }),
}));
