/**
 * Learning Pathways Table (Sprint 18: Cooperative Depth & Governance)
 *
 * Per-participant, per-domain structured progression.
 */
import { relations } from "drizzle-orm";
import {
  decimal,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { pathwayLevelEnum, problemDomainEnum } from "./enums";
import { humans } from "./humans";

export const learningPathways = pgTable(
  "learning_pathways",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    humanId: uuid("human_id")
      .notNull()
      .references(() => humans.id),
    domain: problemDomainEnum("domain").notNull(),
    currentLevel: pathwayLevelEnum("current_level").notNull().default("observer"),
    missionsCompleted: integer("missions_completed").notNull().default(0),
    missionTypesCount: integer("mission_types_count").notNull().default(0),
    peerReviewsCompleted: integer("peer_reviews_completed").notNull().default(0),
    reviewAccuracy: decimal("review_accuracy", { precision: 5, scale: 4 }),
    debatesParticipated: integer("debates_participated").notNull().default(0),
    crossCityMissions: integer("cross_city_missions").notNull().default(0),
    caseStudiesRead: integer("case_studies_read").notNull().default(0),
    progressPercent: integer("progress_percent").notNull().default(0),
    levelReachedAt: timestamp("level_reached_at", { withTimezone: true }),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_pathways_unique").on(table.humanId, table.domain),
    index("idx_pathways_human").on(table.humanId),
    index("idx_pathways_domain_level").on(table.domain, table.currentLevel),
  ],
);

export const learningPathwaysRelations = relations(learningPathways, ({ one }) => ({
  human: one(humans, {
    fields: [learningPathways.humanId],
    references: [humans.id],
  }),
}));
