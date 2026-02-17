/**
 * Circles Tables (Sprint 18: Cooperative Depth & Governance)
 *
 * Circle entity, membership, discussion posts, and shared missions.
 */
import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  circlePostTypeEnum,
  circleRoleEnum,
  guardrailStatusEnum,
  problemDomainEnum,
} from "./enums";
import { humans } from "./humans";
import { missions } from "./missions";

export const circles = pgTable(
  "circles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    domain: problemDomainEnum("domain"),
    createdByHumanId: uuid("created_by_human_id")
      .notNull()
      .references(() => humans.id),
    memberCount: integer("member_count").notNull().default(1),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_circles_creator").on(table.createdByHumanId),
    index("idx_circles_domain").on(table.domain),
  ],
);

export const circleMembers = pgTable(
  "circle_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    humanId: uuid("human_id")
      .notNull()
      .references(() => humans.id),
    role: circleRoleEnum("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_circle_members_unique").on(table.circleId, table.humanId),
    index("idx_circle_members_human").on(table.humanId),
  ],
);

export const circlePosts = pgTable(
  "circle_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    authorHumanId: uuid("author_human_id")
      .notNull()
      .references(() => humans.id),
    content: text("content").notNull(),
    postType: circlePostTypeEnum("post_type").notNull().default("discussion"),
    guardrailStatus: guardrailStatusEnum("guardrail_status")
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_circle_posts_circle").on(table.circleId, table.createdAt),
  ],
);

export const circleMissions = pgTable(
  "circle_missions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id),
    sharedByHumanId: uuid("shared_by_human_id")
      .notNull()
      .references(() => humans.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Each mission shared once per circle
    uniqueIndex("idx_circle_missions_unique").on(
      table.circleId,
      table.missionId,
    ),
  ],
);

// Relations
export const circlesRelations = relations(circles, ({ one, many }) => ({
  creator: one(humans, {
    fields: [circles.createdByHumanId],
    references: [humans.id],
  }),
  members: many(circleMembers),
  posts: many(circlePosts),
  missions: many(circleMissions),
}));

export const circleMembersRelations = relations(circleMembers, ({ one }) => ({
  circle: one(circles, {
    fields: [circleMembers.circleId],
    references: [circles.id],
  }),
  human: one(humans, {
    fields: [circleMembers.humanId],
    references: [humans.id],
  }),
}));

export const circlePostsRelations = relations(circlePosts, ({ one }) => ({
  circle: one(circles, {
    fields: [circlePosts.circleId],
    references: [circles.id],
  }),
  author: one(humans, {
    fields: [circlePosts.authorHumanId],
    references: [humans.id],
  }),
}));

export const circleMissionsRelations = relations(circleMissions, ({ one }) => ({
  circle: one(circles, {
    fields: [circleMissions.circleId],
    references: [circles.id],
  }),
  mission: one(missions, {
    fields: [circleMissions.missionId],
    references: [missions.id],
  }),
  sharedBy: one(humans, {
    fields: [circleMissions.sharedByHumanId],
    references: [humans.id],
  }),
}));
