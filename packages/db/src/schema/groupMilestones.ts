/**
 * Group Milestones Table (Sprint 17: Community Identity & Visible Growth)
 *
 * Tracks collective achievement progress for domains and cities.
 * Milestones are permanent records once created.
 */
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { groupTypeEnum, milestoneTypeEnum } from "./enums";

export const groupMilestones = pgTable(
  "group_milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupType: groupTypeEnum("group_type").notNull(),
    groupValue: varchar("group_value", { length: 100 }).notNull(),
    milestoneType: milestoneTypeEnum("milestone_type").notNull(),
    targetValue: integer("target_value").notNull(),
    currentValue: integer("current_value").notNull().default(0),
    reachedAt: timestamp("reached_at", { withTimezone: true }),
    bannerExpiresAt: timestamp("banner_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("group_milestones_unique").on(
      table.groupType,
      table.groupValue,
      table.milestoneType,
      table.targetValue,
    ),
    index("group_milestones_group_idx").on(table.groupType, table.groupValue),
    index("group_milestones_active_banner_idx")
      .on(table.bannerExpiresAt)
      .where(sql`banner_expires_at IS NOT NULL`),
    index("group_milestones_unreached_idx")
      .on(table.groupType, table.groupValue)
      .where(sql`reached_at IS NULL`),
  ],
);
