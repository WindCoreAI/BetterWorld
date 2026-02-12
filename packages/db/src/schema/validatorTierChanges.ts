import { relations } from "drizzle-orm";
import {
  decimal,
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { validatorTierEnum } from "./enums";
import { validatorPool } from "./validatorPool";

export const validatorTierChanges = pgTable(
  "validator_tier_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    validatorId: uuid("validator_id")
      .notNull()
      .references(() => validatorPool.id, { onDelete: "restrict" }),
    fromTier: validatorTierEnum("from_tier").notNull(),
    toTier: validatorTierEnum("to_tier").notNull(),
    f1ScoreAtChange: decimal("f1_score_at_change", { precision: 5, scale: 4 }).notNull(),
    totalEvaluationsAtChange: integer("total_evaluations_at_change").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("tier_changes_validator_idx").on(table.validatorId, table.changedAt),
  ],
);

export const validatorTierChangesRelations = relations(validatorTierChanges, ({ one }) => ({
  validator: one(validatorPool, {
    fields: [validatorTierChanges.validatorId],
    references: [validatorPool.id],
  }),
}));
