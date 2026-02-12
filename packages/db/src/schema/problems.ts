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
import { guardrailStatusEnum, problemDomainEnum, problemStatusEnum, severityLevelEnum } from "./enums";
import { guardrailEvaluations } from "./guardrails";
import { solutions } from "./solutions";
import { geographyPoint } from "./types";

export const problems = pgTable(
  "problems",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportedByAgentId: uuid("reported_by_agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description").notNull(),
    domain: problemDomainEnum("domain").notNull(),
    severity: severityLevelEnum("severity").notNull(),
    affectedPopulationEstimate: varchar("affected_population_estimate", { length: 100 }),
    geographicScope: varchar("geographic_scope", { length: 50 }),
    locationName: varchar("location_name", { length: 200 }),
    latitude: decimal("latitude", { precision: 10, scale: 7 }),
    longitude: decimal("longitude", { precision: 10, scale: 7 }),
    existingSolutions: jsonb("existing_solutions").default([]),
    dataSources: jsonb("data_sources").default([]),
    evidenceLinks: text("evidence_links")
      .array()
      .notNull()
      .default([]),
    alignmentScore: decimal("alignment_score", { precision: 3, scale: 2 }),
    alignmentDomain: varchar("alignment_domain", { length: 50 }),
    guardrailStatus: guardrailStatusEnum("guardrail_status").notNull().default("pending"),
    guardrailEvaluationId: uuid("guardrail_evaluation_id").references(() => guardrailEvaluations.id),
    guardrailReviewNotes: text("guardrail_review_notes"),
    upvotes: integer("upvotes").notNull().default(0),
    evidenceCount: integer("evidence_count").notNull().default(0),
    solutionCount: integer("solution_count").notNull().default(0),
    embedding: halfvec("embedding", { dimensions: 1024 }),
    status: problemStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),

    // Sprint 10: Phase 3 — PostGIS + hyperlocal fields
    locationPoint: geographyPoint("location_point"),
    localUrgency: varchar("local_urgency", { length: 20 }),
    actionability: varchar("actionability", { length: 20 }),
    radiusMeters: integer("radius_meters"),
    observationCount: integer("observation_count").notNull().default(0),
    municipalSourceId: varchar("municipal_source_id", { length: 100 }),
    municipalSourceType: varchar("municipal_source_type", { length: 50 }),
  },
  (table) => [
    index("problems_agent_id_idx").on(table.reportedByAgentId),
    index("problems_domain_idx").on(table.domain),
    index("problems_severity_idx").on(table.severity),
    index("problems_status_idx").on(table.status),
    index("problems_guardrail_idx").on(table.guardrailStatus),
    index("problems_created_at_idx").on(table.createdAt),
    index("problems_status_domain_created_idx").on(table.status, table.domain, table.createdAt),
    check(
      "alignment_score_range",
      sql`${table.alignmentScore} IS NULL OR (${table.alignmentScore} >= 0 AND ${table.alignmentScore} <= 1)`,
    ),
    // Sprint 10: Phase 3 indexes
    index("problems_geo_scope_urgency_idx").on(table.geographicScope, table.localUrgency, table.createdAt),
    index("problems_municipal_source_idx").on(table.municipalSourceType, table.municipalSourceId),
    index("problems_observation_count_idx").on(table.observationCount),
  ],
);

export const problemsRelations = relations(problems, ({ one, many }) => ({
  reportedByAgent: one(agents, {
    fields: [problems.reportedByAgentId],
    references: [agents.id],
  }),
  solutions: many(solutions),
}));
