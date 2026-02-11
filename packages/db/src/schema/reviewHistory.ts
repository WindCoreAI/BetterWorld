import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { evidence } from "./evidence";
import { humans } from "./humans";

export const reviewHistory = pgTable(
  "review_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewerHumanId: uuid("reviewer_human_id")
      .notNull()
      .references(() => humans.id, { onDelete: "restrict" }),
    submitterHumanId: uuid("submitter_human_id")
      .notNull()
      .references(() => humans.id, { onDelete: "restrict" }),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "restrict" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_review_history_reviewer").on(table.reviewerHumanId),
    index("idx_review_history_submitter").on(table.submitterHumanId),
    index("idx_review_history_pair").on(
      table.reviewerHumanId,
      table.submitterHumanId,
    ),
    check(
      "no_self_review_history",
      sql`${table.reviewerHumanId} != ${table.submitterHumanId}`,
    ),
  ],
);

export const reviewHistoryRelations = relations(reviewHistory, ({ one }) => ({
  reviewer: one(humans, {
    fields: [reviewHistory.reviewerHumanId],
    references: [humans.id],
    relationName: "reviewHistoryReviewer",
  }),
  submitter: one(humans, {
    fields: [reviewHistory.submitterHumanId],
    references: [humans.id],
    relationName: "reviewHistorySubmitter",
  }),
  evidence: one(evidence, {
    fields: [reviewHistory.evidenceId],
    references: [evidence.id],
  }),
}));
