import { relations } from "drizzle-orm";
import {
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { agents } from "./agents";
import { validatorTierEnum } from "./enums";
import { geographyPoint } from "./types";

export const validatorPool = pgTable(
  "validator_pool",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    tier: validatorTierEnum("tier").notNull().default("apprentice"),
    f1Score: decimal("f1_score", { precision: 5, scale: 4 })
      .notNull()
      .default("0.0000"),
    precision: decimal("precision", { precision: 5, scale: 4 })
      .notNull()
      .default("0.0000"),
    recall: decimal("recall", { precision: 5, scale: 4 })
      .notNull()
      .default("0.0000"),
    totalEvaluations: integer("total_evaluations").notNull().default(0),
    correctEvaluations: integer("correct_evaluations").notNull().default(0),
    domainScores: jsonb("domain_scores").default({}),
    homeRegionName: varchar("home_region_name", { length: 200 }),
    homeRegionPoint: geographyPoint("home_region_point"),
    dailyEvaluationCount: integer("daily_evaluation_count").notNull().default(0),
    dailyCountResetAt: timestamp("daily_count_reset_at", { withTimezone: true }),
    lastAssignmentAt: timestamp("last_assignment_at", { withTimezone: true }),
    lastResponseAt: timestamp("last_response_at", { withTimezone: true }),
    responseRate: decimal("response_rate", { precision: 3, scale: 2 })
      .notNull()
      .default("1.00"),
    capabilities: jsonb("capabilities").default({}),
    isActive: boolean("is_active").notNull().default(true),
    suspendedUntil: timestamp("suspended_until", { withTimezone: true }),
    suspensionCount: integer("suspension_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("validator_pool_agent_id_idx").on(table.agentId),
    index("validator_pool_tier_idx").on(table.tier),
    index("validator_pool_f1_score_idx").on(table.f1Score),
    index("validator_pool_is_active_idx").on(table.isActive),
  ],
);

export const validatorPoolRelations = relations(validatorPool, ({ one }) => ({
  agent: one(agents, {
    fields: [validatorPool.agentId],
    references: [agents.id],
  }),
}));
