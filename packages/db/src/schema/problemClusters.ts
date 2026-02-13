import { relations } from "drizzle-orm";
import {
  boolean,
  halfvec,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { geographicScopeEnum, problemDomainEnum } from "./enums";
import { problems } from "./problems";
import { geographyPoint } from "./types";

export const problemClusters = pgTable(
  "problem_clusters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    domain: problemDomainEnum("domain").notNull(),
    scope: geographicScopeEnum("scope").notNull(),
    centroidPoint: geographyPoint("centroid_point"),
    radiusMeters: integer("radius_meters").notNull(),
    city: varchar("city", { length: 100 }),
    memberProblemIds: uuid("member_problem_ids")
      .array()
      .notNull()
      .default([]),
    memberCount: integer("member_count").notNull().default(0),
    totalObservations: integer("total_observations").notNull().default(0),
    distinctReporters: integer("distinct_reporters").notNull().default(0),
    promotedToProblemId: uuid("promoted_to_problem_id").references(
      () => problems.id,
    ),
    promotedAt: timestamp("promoted_at", { withTimezone: true }),
    centroidEmbedding: halfvec("centroid_embedding", { dimensions: 1024 }),
    // Sprint 13: Phase 3 Integration
    isSystemic: boolean("is_systemic").notNull().default(false),
    summaryGeneratedAt: timestamp("summary_generated_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    lastAggregatedAt: timestamp("last_aggregated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("clusters_domain_idx").on(table.domain),
    index("clusters_city_idx").on(table.city),
    index("clusters_is_active_idx").on(table.isActive),
  ],
);

export const problemClustersRelations = relations(problemClusters, ({ one }) => ({
  promotedToProblem: one(problems, {
    fields: [problemClusters.promotedToProblemId],
    references: [problems.id],
  }),
}));
