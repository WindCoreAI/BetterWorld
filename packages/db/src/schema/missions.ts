import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  decimal,
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
import {
  difficultyLevelEnum,
  guardrailStatusEnum,
  missionStatusEnum,
  problemDomainEnum,
} from "./enums";
import { guardrailEvaluations } from "./guardrails";
import { solutions } from "./solutions";

export const missions = pgTable(
  "missions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    solutionId: uuid("solution_id")
      .notNull()
      .references(() => solutions.id, { onDelete: "restrict" }),
    createdByAgentId: uuid("created_by_agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description").notNull(),
    instructions: jsonb("instructions").notNull().default([]),
    evidenceRequired: jsonb("evidence_required").notNull().default([]),
    requiredSkills: text("required_skills")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    domain: problemDomainEnum("domain").notNull(),
    requiredLocationName: varchar("required_location_name", { length: 200 }),
    requiredLatitude: decimal("required_latitude", {
      precision: 10,
      scale: 7,
    }),
    requiredLongitude: decimal("required_longitude", {
      precision: 10,
      scale: 7,
    }),
    locationRadiusKm: integer("location_radius_km").default(5),
    estimatedDurationMinutes: integer("estimated_duration_minutes").notNull(),
    difficulty: difficultyLevelEnum("difficulty")
      .notNull()
      .default("intermediate"),
    missionType: varchar("mission_type", { length: 50 }),
    tokenReward: integer("token_reward").notNull(),
    bonusForQuality: integer("bonus_for_quality").default(0),
    maxClaims: integer("max_claims").notNull().default(1),
    currentClaimCount: integer("current_claim_count").notNull().default(0),
    guardrailStatus: guardrailStatusEnum("guardrail_status")
      .notNull()
      .default("pending"),
    guardrailEvaluationId: uuid("guardrail_evaluation_id").references(
      () => guardrailEvaluations.id,
    ),
    status: missionStatusEnum("status").notNull().default("open"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    isHoneypot: boolean("is_honeypot").notNull().default(false),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_missions_solution_id").on(table.solutionId),
    index("idx_missions_created_by_agent").on(table.createdByAgentId),
    index("idx_missions_status").on(table.status),
    index("idx_missions_domain").on(table.domain),
    index("idx_missions_difficulty").on(table.difficulty),
    index("idx_missions_expires_at").on(table.expiresAt),
    index("idx_missions_skills").on(table.requiredSkills),
    index("idx_missions_marketplace").on(
      table.status,
      table.domain,
      table.difficulty,
      table.createdAt,
    ),
    check("token_reward_positive", sql`${table.tokenReward} > 0`),
    check(
      "bonus_for_quality_non_negative",
      sql`${table.bonusForQuality} >= 0`,
    ),
    check("max_claims_at_least_one", sql`${table.maxClaims} >= 1`),
    check(
      "current_claim_count_non_negative",
      sql`${table.currentClaimCount} >= 0`,
    ),
    check(
      "current_claim_count_within_max",
      sql`${table.currentClaimCount} <= ${table.maxClaims}`,
    ),
  ],
);

export const missionsRelations = relations(missions, ({ one }) => ({
  solution: one(solutions, {
    fields: [missions.solutionId],
    references: [solutions.id],
  }),
  createdByAgent: one(agents, {
    fields: [missions.createdByAgentId],
    references: [agents.id],
  }),
}));
