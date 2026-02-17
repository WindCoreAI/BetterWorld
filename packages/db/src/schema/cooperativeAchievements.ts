/**
 * Cooperative Achievements Tables (Sprint 18: Cooperative Depth & Governance)
 *
 * Shared achievements earned by groups of participants.
 */
import { relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { cooperativeAchievementTypeEnum } from "./enums";
import { humans } from "./humans";

export const cooperativeAchievements = pgTable(
  "cooperative_achievements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    achievementType: cooperativeAchievementTypeEnum("achievement_type").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    referenceIds: jsonb("reference_ids").notNull().default([]),
    earnedAt: timestamp("earned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const cooperativeAchievementEarners = pgTable(
  "cooperative_achievement_earners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    achievementId: uuid("achievement_id")
      .notNull()
      .references(() => cooperativeAchievements.id, { onDelete: "cascade" }),
    humanId: uuid("human_id")
      .notNull()
      .references(() => humans.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_achievement_earners_unique").on(
      table.achievementId,
      table.humanId,
    ),
    index("idx_achievement_earners_human").on(table.humanId, table.createdAt),
  ],
);

// Relations
export const cooperativeAchievementsRelations = relations(
  cooperativeAchievements,
  ({ many }) => ({
    earners: many(cooperativeAchievementEarners),
  }),
);

export const cooperativeAchievementEarnersRelations = relations(
  cooperativeAchievementEarners,
  ({ one }) => ({
    achievement: one(cooperativeAchievements, {
      fields: [cooperativeAchievementEarners.achievementId],
      references: [cooperativeAchievements.id],
    }),
    human: one(humans, {
      fields: [cooperativeAchievementEarners.humanId],
      references: [humans.id],
    }),
  }),
);
