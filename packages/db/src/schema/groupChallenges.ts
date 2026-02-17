/**
 * Group Challenges Tables (Sprint 18: Cooperative Depth & Governance)
 *
 * Time-bounded competitive/collaborative events between cities or domains.
 */
import { relations } from "drizzle-orm";
import {
  date,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  challengeStatusEnum,
  challengeTypeEnum,
  groupTypeEnum,
} from "./enums";
import { humans } from "./humans";

export const groupChallenges = pgTable(
  "group_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challengeType: challengeTypeEnum("challenge_type").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    groups: jsonb("groups").notNull(),
    metric: varchar("metric", { length: 50 }).notNull(),
    targetValue: integer("target_value"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: challengeStatusEnum("status").notNull().default("upcoming"),
    results: jsonb("results"),
    createdByHumanId: uuid("created_by_human_id").references(() => humans.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_challenges_status").on(table.status, table.startDate),
    index("idx_challenges_dates").on(table.startDate, table.endDate),
  ],
);

export const challengeParticipants = pgTable(
  "challenge_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => groupChallenges.id, { onDelete: "cascade" }),
    humanId: uuid("human_id")
      .notNull()
      .references(() => humans.id),
    groupType: groupTypeEnum("group_type").notNull(),
    groupValue: varchar("group_value", { length: 100 }).notNull(),
    score: decimal("score", { precision: 10, scale: 2 }).notNull().default("0"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_challenge_participants_unique").on(
      table.challengeId,
      table.humanId,
    ),
    index("idx_challenge_participants_challenge").on(
      table.challengeId,
      table.score,
    ),
  ],
);

// Relations
export const groupChallengesRelations = relations(groupChallenges, ({ one, many }) => ({
  creator: one(humans, {
    fields: [groupChallenges.createdByHumanId],
    references: [humans.id],
  }),
  participants: many(challengeParticipants),
}));

export const challengeParticipantsRelations = relations(
  challengeParticipants,
  ({ one }) => ({
    challenge: one(groupChallenges, {
      fields: [challengeParticipants.challengeId],
      references: [groupChallenges.id],
    }),
    human: one(humans, {
      fields: [challengeParticipants.humanId],
      references: [humans.id],
    }),
  }),
);
