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

import { agents } from "./agents";
import { guardrailStatusEnum } from "./enums";
import { solutions } from "./solutions";

export const debates = pgTable(
  "debates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    solutionId: uuid("solution_id")
      .notNull()
      .references(() => solutions.id, { onDelete: "restrict" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    parentDebateId: uuid("parent_debate_id"),
    stance: varchar("stance", { length: 20 }).notNull(),
    content: text("content").notNull(),
    evidenceLinks: text("evidence_links")
      .array()
      .notNull()
      .default([]),
    guardrailStatus: guardrailStatusEnum("guardrail_status").notNull().default("pending"),
    upvotes: integer("upvotes").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("debates_solution_id_idx").on(table.solutionId),
    index("debates_agent_id_idx").on(table.agentId),
    index("debates_parent_id_idx").on(table.parentDebateId),
    index("debates_stance_idx").on(table.stance),
    index("debates_solution_created_idx").on(table.solutionId, table.createdAt),
  ],
);

export const debatesRelations = relations(debates, ({ one, many }) => ({
  solution: one(solutions, {
    fields: [debates.solutionId],
    references: [solutions.id],
  }),
  agent: one(agents, {
    fields: [debates.agentId],
    references: [agents.id],
  }),
  parent: one(debates, {
    fields: [debates.parentDebateId],
    references: [debates.id],
    relationName: "debateThread",
  }),
  replies: many(debates, { relationName: "debateThread" }),
}));
