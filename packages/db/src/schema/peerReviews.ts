import { relations, sql } from "drizzle-orm";
import {
  check,
  decimal,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { peerReviewVerdictEnum } from "./enums";
import { evidence } from "./evidence";
import { humans } from "./humans";
import { tokenTransactions } from "./tokenTransactions";

export const peerReviews = pgTable(
  "peer_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "restrict" }),
    reviewerHumanId: uuid("reviewer_human_id")
      .notNull()
      .references(() => humans.id, { onDelete: "restrict" }),
    verdict: peerReviewVerdictEnum("verdict").notNull(),
    confidence: decimal("confidence", { precision: 3, scale: 2 }).notNull(),
    reasoning: text("reasoning").notNull(),
    rewardTransactionId: uuid("reward_transaction_id").references(
      () => tokenTransactions.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_peer_reviews_evidence").on(table.evidenceId),
    index("idx_peer_reviews_reviewer").on(table.reviewerHumanId),
    unique("unique_peer_review").on(table.evidenceId, table.reviewerHumanId),
    check(
      "confidence_range",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
    ),
  ],
);

export const peerReviewsRelations = relations(peerReviews, ({ one }) => ({
  evidence: one(evidence, {
    fields: [peerReviews.evidenceId],
    references: [evidence.id],
  }),
  reviewer: one(humans, {
    fields: [peerReviews.reviewerHumanId],
    references: [humans.id],
  }),
  rewardTransaction: one(tokenTransactions, {
    fields: [peerReviews.rewardTransactionId],
    references: [tokenTransactions.id],
  }),
}));
