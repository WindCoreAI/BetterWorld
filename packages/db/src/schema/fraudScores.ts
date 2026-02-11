/**
 * Fraud Scores, Events, and Admin Actions Tables (Sprint 9: Reputation & Impact)
 */
import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { fraudActionEnum } from "./enums";
import { evidence } from "./evidence";
import { humans } from "./humans";

export const fraudScores = pgTable(
  "fraud_scores",
  {
    humanId: uuid("human_id")
      .primaryKey()
      .references(() => humans.id, { onDelete: "cascade" }),
    totalScore: integer("total_score").notNull().default(0),
    phashScore: integer("phash_score").notNull().default(0),
    velocityScore: integer("velocity_score").notNull().default(0),
    statisticalScore: integer("statistical_score").notNull().default(0),
    status: varchar("status", { length: 20 }).notNull().default("clean"),
    flaggedAt: timestamp("flagged_at", { withTimezone: true }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    lastScoredAt: timestamp("last_scored_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_fraud_scores_total").on(table.totalScore),
    check("total_score_non_negative", sql`${table.totalScore} >= 0`),
  ],
);

export const fraudScoresRelations = relations(fraudScores, ({ one }) => ({
  human: one(humans, {
    fields: [fraudScores.humanId],
    references: [humans.id],
  }),
}));

export const fraudEvents = pgTable(
  "fraud_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    humanId: uuid("human_id")
      .notNull()
      .references(() => humans.id),
    evidenceId: uuid("evidence_id").references(() => evidence.id),
    detectionType: varchar("detection_type", { length: 50 }).notNull(),
    scoreDelta: integer("score_delta").notNull(),
    details: jsonb("details").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_fraud_events_human").on(table.humanId, table.createdAt),
    index("idx_fraud_events_type").on(table.detectionType),
    index("idx_fraud_events_evidence").on(table.evidenceId),
  ],
);

export const fraudEventsRelations = relations(fraudEvents, ({ one }) => ({
  human: one(humans, {
    fields: [fraudEvents.humanId],
    references: [humans.id],
  }),
  evidence: one(evidence, {
    fields: [fraudEvents.evidenceId],
    references: [evidence.id],
  }),
}));

export const fraudAdminActions = pgTable(
  "fraud_admin_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    humanId: uuid("human_id")
      .notNull()
      .references(() => humans.id),
    adminId: uuid("admin_id").notNull(),
    action: fraudActionEnum("action").notNull(),
    reason: text("reason").notNull(),
    fraudScoreBefore: integer("fraud_score_before").notNull(),
    fraudScoreAfter: integer("fraud_score_after").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_fraud_admin_human").on(table.humanId, table.createdAt),
    index("idx_fraud_admin_admin").on(table.adminId),
  ],
);

export const fraudAdminActionsRelations = relations(
  fraudAdminActions,
  ({ one }) => ({
    human: one(humans, {
      fields: [fraudAdminActions.humanId],
      references: [humans.id],
    }),
  }),
);
