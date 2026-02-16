/**
 * Discussion Threads Table (Sprint 16: Social Fabric Foundation)
 *
 * Conversation topics scoped to domains or cities.
 * Full 3-layer guardrail pipeline compliance.
 */
import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { discussionReplies } from "./discussionReplies";
import { discussionScopeTypeEnum, guardrailStatusEnum } from "./enums";
import { guardrailEvaluations } from "./guardrails";
import { humans } from "./humans";

export const discussionThreads = pgTable(
  "discussion_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scopeType: discussionScopeTypeEnum("scope_type").notNull(),
    scopeValue: varchar("scope_value", { length: 100 }).notNull(),
    authorHumanId: uuid("author_human_id")
      .notNull()
      .references(() => humans.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 200 }).notNull(),
    content: text("content").notNull(),
    guardrailStatus: guardrailStatusEnum("guardrail_status")
      .notNull()
      .default("pending"),
    guardrailEvaluationId: uuid("guardrail_evaluation_id").references(
      () => guardrailEvaluations.id,
    ),
    replyCount: integer("reply_count").notNull().default(0),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_threads_scope_activity").on(
      table.scopeType,
      table.scopeValue,
      table.lastActivityAt,
    ),
    index("idx_threads_author").on(table.authorHumanId),
    index("idx_threads_created").on(table.createdAt),
  ],
);

export const discussionThreadsRelations = relations(
  discussionThreads,
  ({ one, many }) => ({
    author: one(humans, {
      fields: [discussionThreads.authorHumanId],
      references: [humans.id],
      relationName: "discussionThreads",
    }),
    guardrailEvaluation: one(guardrailEvaluations, {
      fields: [discussionThreads.guardrailEvaluationId],
      references: [guardrailEvaluations.id],
    }),
    replies: many(discussionReplies),
  }),
);
