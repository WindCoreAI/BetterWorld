/**
 * Case Studies Table (Sprint 18: Cooperative Depth & Governance)
 *
 * AI-curated success stories from high-quality missions.
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

import { caseStudyStatusEnum, problemDomainEnum } from "./enums";
import { humans } from "./humans";
import { missions } from "./missions";

export const caseStudies = pgTable(
  "case_studies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id),
    domain: problemDomainEnum("domain").notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    summary: text("summary").notNull(),
    context: text("context"),
    approach: text("approach"),
    evidenceQuality: text("evidence_quality"),
    keyLearnings: text("key_learnings"),
    contributorHumanIds: uuid("contributor_human_ids")
      .array()
      .notNull()
      .default([]),
    status: caseStudyStatusEnum("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedByHumanId: uuid("published_by_human_id").references(
      () => humans.id,
    ),
    readCount: integer("read_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_case_studies_mission").on(table.missionId),
    index("idx_case_studies_domain").on(table.domain),
    index("idx_case_studies_status").on(table.status, table.createdAt),
  ],
);

export const caseStudiesRelations = relations(caseStudies, ({ one }) => ({
  mission: one(missions, {
    fields: [caseStudies.missionId],
    references: [missions.id],
  }),
  publishedBy: one(humans, {
    fields: [caseStudies.publishedByHumanId],
    references: [humans.id],
  }),
}));
