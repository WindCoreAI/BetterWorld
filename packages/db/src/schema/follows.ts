/**
 * Follows Table (Sprint 16: Social Fabric Foundation)
 *
 * One-way follow relationship between human participants.
 * Max 200 follows per user, no self-follows.
 */
import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { humans } from "./humans";

export const follows = pgTable(
  "follows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    followerHumanId: uuid("follower_human_id")
      .notNull()
      .references(() => humans.id, { onDelete: "cascade" }),
    followingHumanId: uuid("following_human_id")
      .notNull()
      .references(() => humans.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_follows_follower").on(table.followerHumanId),
    index("idx_follows_following").on(table.followingHumanId),
    uniqueIndex("idx_follows_unique").on(
      table.followerHumanId,
      table.followingHumanId,
    ),
    check(
      "no_self_follow",
      sql`${table.followerHumanId} != ${table.followingHumanId}`,
    ),
  ],
);

export const followsRelations = relations(follows, ({ one }) => ({
  follower: one(humans, {
    fields: [follows.followerHumanId],
    references: [humans.id],
    relationName: "followsGiven",
  }),
  following: one(humans, {
    fields: [follows.followingHumanId],
    references: [humans.id],
    relationName: "followsReceived",
  }),
}));
