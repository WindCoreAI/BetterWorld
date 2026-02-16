/**
 * Discussion Replies Table (Sprint 16: Social Fabric Foundation)
 *
 * Responses within discussion threads.
 * Full 3-layer guardrail pipeline compliance.
 */
import { relations } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { discussionThreads } from "./discussionThreads";
import { guardrailStatusEnum } from "./enums";
import { guardrailEvaluations } from "./guardrails";
import { humans } from "./humans";

export const discussionReplies = pgTable(
  "discussion_replies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => discussionThreads.id, { onDelete: "cascade" }),
    authorHumanId: uuid("author_human_id")
      .notNull()
      .references(() => humans.id, { onDelete: "restrict" }),
    content: text("content").notNull(),
    guardrailStatus: guardrailStatusEnum("guardrail_status")
      .notNull()
      .default("pending"),
    guardrailEvaluationId: uuid("guardrail_evaluation_id").references(
      () => guardrailEvaluations.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_replies_thread_created").on(table.threadId, table.createdAt),
    index("idx_replies_author").on(table.authorHumanId),
  ],
);

export const discussionRepliesRelations = relations(
  discussionReplies,
  ({ one }) => ({
    thread: one(discussionThreads, {
      fields: [discussionReplies.threadId],
      references: [discussionThreads.id],
    }),
    author: one(humans, {
      fields: [discussionReplies.authorHumanId],
      references: [humans.id],
      relationName: "discussionReplies",
    }),
    guardrailEvaluation: one(guardrailEvaluations, {
      fields: [discussionReplies.guardrailEvaluationId],
      references: [guardrailEvaluations.id],
    }),
  }),
);
