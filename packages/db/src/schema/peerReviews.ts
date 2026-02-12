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
  varchar,
} from "drizzle-orm/pg-core";

import { peerReviewVerdictEnum } from "./enums";
import { evidence } from "./evidence";
import { humans } from "./humans";
import { observations } from "./observations";
import { tokenTransactions } from "./tokenTransactions";

export const peerReviews = pgTable(
  "peer_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evidenceId: uuid("evidence_id").references(() => evidence.id, {
      onDelete: "restrict",
    }),
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

    // Sprint 10: Phase 3 — Review type discriminator
    reviewType: varchar("review_type", { length: 20 }).notNull().default("evidence"),
    observationId: uuid("observation_id").references(() => observations.id, {
      onDelete: "restrict",
    }),
  },
  (table) => [
    index("idx_peer_reviews_evidence").on(table.evidenceId),
    index("idx_peer_reviews_reviewer").on(table.reviewerHumanId),
    unique("unique_peer_review").on(table.evidenceId, table.reviewerHumanId),
    check(
      "confidence_range",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
    ),
    // Sprint 10: Phase 3 — at least one of evidence or observation must be set
    check(
      "has_review_target",
      sql`${table.evidenceId} IS NOT NULL OR ${table.observationId} IS NOT NULL`,
    ),
    index("idx_peer_reviews_type").on(table.reviewType),
    index("idx_peer_reviews_observation").on(table.observationId),
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
  observation: one(observations, {
    fields: [peerReviews.observationId],
    references: [observations.id],
  }),
}));
