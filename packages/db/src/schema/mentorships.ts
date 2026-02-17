/**
 * Mentorships Table (Sprint 18: Cooperative Depth & Governance)
 *
 * Tracks mentor-mentee guidance relationships with 30-day lifecycle.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { mentorshipStatusEnum, problemDomainEnum } from "./enums";
import { humans } from "./humans";

export const mentorships = pgTable(
  "mentorships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mentorHumanId: uuid("mentor_human_id")
      .notNull()
      .references(() => humans.id),
    menteeHumanId: uuid("mentee_human_id")
      .notNull()
      .references(() => humans.id),
    domain: problemDomainEnum("domain").notNull(),
    status: mentorshipStatusEnum("status").notNull().default("pending"),
    mentorAccepted: boolean("mentor_accepted").notNull().default(false),
    menteeAccepted: boolean("mentee_accepted").notNull().default(false),
    missionsGuided: integer("missions_guided").notNull().default(0),
    tokensEarnedByMentor: integer("tokens_earned_by_mentor").notNull().default(0),
    mentorRating: integer("mentor_rating"),
    menteeRating: integer("mentee_rating"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_mentorships_mentor").on(table.mentorHumanId),
    index("idx_mentorships_mentee").on(table.menteeHumanId),
    // Enforce 1 active/pending mentor per mentee
    uniqueIndex("idx_mentorships_active_mentee")
      .on(table.menteeHumanId)
      .where(sql`${table.status} IN ('pending', 'active')`),
    check(
      "mentor_rating_range",
      sql`${table.mentorRating} IS NULL OR (${table.mentorRating} >= 1 AND ${table.mentorRating} <= 5)`,
    ),
    check(
      "mentee_rating_range",
      sql`${table.menteeRating} IS NULL OR (${table.menteeRating} >= 1 AND ${table.menteeRating} <= 5)`,
    ),
  ],
);

export const mentorshipsRelations = relations(mentorships, ({ one }) => ({
  mentor: one(humans, {
    fields: [mentorships.mentorHumanId],
    references: [humans.id],
    relationName: "mentorshipsAsMentor",
  }),
  mentee: one(humans, {
    fields: [mentorships.menteeHumanId],
    references: [humans.id],
    relationName: "mentorshipsAsMentee",
  }),
}));
