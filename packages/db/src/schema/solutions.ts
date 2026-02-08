import { relations, sql } from "drizzle-orm";
import {
  check,
  decimal,
  halfvec,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { agents } from "./agents";
import { debates } from "./debates";
import { guardrailStatusEnum, solutionStatusEnum } from "./enums";
import { problems } from "./problems";

export const solutions = pgTable(
  "solutions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "restrict" }),
    proposedByAgentId: uuid("proposed_by_agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description").notNull(),
    approach: text("approach").notNull(),
    expectedImpact: jsonb("expected_impact").notNull(),
    estimatedCost: jsonb("estimated_cost"),
    risksAndMitigations: jsonb("risks_and_mitigations").default([]),
    requiredSkills: text("required_skills")
      .array()
      .notNull()
      .default([]),
    requiredLocations: text("required_locations")
      .array()
      .notNull()
      .default([]),
    timelineEstimate: varchar("timeline_estimate", { length: 100 }),
    impactScore: decimal("impact_score", { precision: 5, scale: 2 }).notNull().default("0"),
    feasibilityScore: decimal("feasibility_score", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    costEfficiencyScore: decimal("cost_efficiency_score", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    compositeScore: decimal("composite_score", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    alignmentScore: decimal("alignment_score", { precision: 3, scale: 2 }),
    guardrailStatus: guardrailStatusEnum("guardrail_status").notNull().default("pending"),
    agentDebateCount: integer("agent_debate_count").notNull().default(0),
    humanVotes: integer("human_votes").notNull().default(0),
    humanVoteTokenWeight: decimal("human_vote_token_weight", { precision: 18, scale: 8 })
      .notNull()
      .default("0"),
    embedding: halfvec("embedding", { dimensions: 1024 }),
    status: solutionStatusEnum("status").notNull().default("proposed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("solutions_problem_id_idx").on(table.problemId),
    index("solutions_agent_id_idx").on(table.proposedByAgentId),
    index("solutions_status_idx").on(table.status),
    index("solutions_guardrail_idx").on(table.guardrailStatus),
    index("solutions_composite_score_idx").on(table.compositeScore),
    index("solutions_status_score_created_idx").on(
      table.status,
      table.compositeScore,
      table.createdAt,
    ),
    check(
      "alignment_score_range",
      sql`${table.alignmentScore} IS NULL OR (${table.alignmentScore} >= 0 AND ${table.alignmentScore} <= 1)`,
    ),
    check(
      "scores_non_negative",
      sql`${table.impactScore} >= 0 AND ${table.feasibilityScore} >= 0 AND ${table.costEfficiencyScore} >= 0 AND ${table.compositeScore} >= 0`,
    ),
  ],
);

export const solutionsRelations = relations(solutions, ({ one, many }) => ({
  problem: one(problems, {
    fields: [solutions.problemId],
    references: [problems.id],
  }),
  proposedByAgent: one(agents, {
    fields: [solutions.proposedByAgentId],
    references: [agents.id],
  }),
  debates: many(debates),
}));
