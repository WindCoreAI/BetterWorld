/**
 * Reputation Scores & History Tables (Sprint 9: Reputation & Impact)
 */
import { relations, sql } from "drizzle-orm";
import {
  check,
  decimal,
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { reputationTierEnum } from "./enums";
import { humans } from "./humans";

export const reputationScores = pgTable(
  "reputation_scores",
  {
    humanId: uuid("human_id")
      .primaryKey()
      .references(() => humans.id, { onDelete: "cascade" }),
    totalScore: decimal("total_score", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    missionQualityScore: decimal("mission_quality_score", {
      precision: 8,
      scale: 2,
    })
      .notNull()
      .default("0"),
    peerAccuracyScore: decimal("peer_accuracy_score", {
      precision: 8,
      scale: 2,
    })
      .notNull()
      .default("0"),
    streakScore: decimal("streak_score", { precision: 8, scale: 2 })
      .notNull()
      .default("0"),
    endorsementScore: decimal("endorsement_score", {
      precision: 8,
      scale: 2,
    })
      .notNull()
      .default("0"),
    currentTier: reputationTierEnum("current_tier")
      .notNull()
      .default("newcomer"),
    tierMultiplier: decimal("tier_multiplier", { precision: 3, scale: 2 })
      .notNull()
      .default("1.00"),
    gracePeriodStart: timestamp("grace_period_start", { withTimezone: true }),
    gracePeriodTier: reputationTierEnum("grace_period_tier"),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    lastDecayAt: timestamp("last_decay_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_rep_scores_total").on(table.totalScore),
    index("idx_rep_scores_tier").on(table.currentTier),
    index("idx_rep_scores_last_activity").on(table.lastActivityAt),
    check("total_score_non_negative", sql`${table.totalScore} >= 0`),
  ],
);

export const reputationScoresRelations = relations(
  reputationScores,
  ({ one }) => ({
    human: one(humans, {
      fields: [reputationScores.humanId],
      references: [humans.id],
    }),
  }),
);

export const reputationHistory = pgTable(
  "reputation_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    humanId: uuid("human_id")
      .notNull()
      .references(() => humans.id),
    scoreBefore: decimal("score_before", { precision: 10, scale: 2 }).notNull(),
    scoreAfter: decimal("score_after", { precision: 10, scale: 2 }).notNull(),
    delta: decimal("delta", { precision: 10, scale: 2 }).notNull(),
    eventType: varchar("event_type", { length: 50 }).notNull(),
    eventSourceId: uuid("event_source_id"),
    eventSourceType: varchar("event_source_type", { length: 50 }),
    tierBefore: reputationTierEnum("tier_before"),
    tierAfter: reputationTierEnum("tier_after"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_rep_history_human_created").on(table.humanId, table.createdAt),
    index("idx_rep_history_event_type").on(table.eventType),
    index("idx_rep_history_created").on(table.createdAt),
  ],
);

export const reputationHistoryRelations = relations(
  reputationHistory,
  ({ one }) => ({
    human: one(humans, {
      fields: [reputationHistory.humanId],
      references: [humans.id],
    }),
  }),
);
