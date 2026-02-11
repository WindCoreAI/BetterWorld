/**
 * Streaks Table (Sprint 9: Reputation & Impact)
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  decimal,
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { humans } from "./humans";

export const streaks = pgTable(
  "streaks",
  {
    humanId: uuid("human_id")
      .primaryKey()
      .references(() => humans.id, { onDelete: "cascade" }),
    currentStreak: integer("current_streak").notNull().default(0),
    longestStreak: integer("longest_streak").notNull().default(0),
    lastActiveDate: date("last_active_date"),
    streakMultiplier: decimal("streak_multiplier", { precision: 3, scale: 2 })
      .notNull()
      .default("1.00"),
    freezeAvailable: boolean("freeze_available").notNull().default(true),
    freezeLastUsedAt: timestamp("freeze_last_used_at", { withTimezone: true }),
    freezeActive: boolean("freeze_active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_streaks_current").on(table.currentStreak),
    index("idx_streaks_last_active").on(table.lastActiveDate),
    check("current_streak_non_negative", sql`${table.currentStreak} >= 0`),
    check("longest_streak_non_negative", sql`${table.longestStreak} >= 0`),
  ],
);

export const streaksRelations = relations(streaks, ({ one }) => ({
  human: one(humans, {
    fields: [streaks.humanId],
    references: [humans.id],
  }),
}));
