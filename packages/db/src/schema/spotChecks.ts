import { sql } from "drizzle-orm";
import {
  boolean,
  decimal,
  index,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { consensusDecisionEnum, contentTypeEnum, guardrailDecisionEnum } from "./enums";

export const spotChecks = pgTable(
  "spot_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id").notNull(),
    submissionType: contentTypeEnum("submission_type").notNull(),
    peerDecision: consensusDecisionEnum("peer_decision").notNull(),
    peerConfidence: decimal("peer_confidence", { precision: 3, scale: 2 }).notNull(),
    layerBDecision: guardrailDecisionEnum("layer_b_decision").notNull(),
    layerBAlignmentScore: decimal("layer_b_alignment_score", { precision: 3, scale: 2 }).notNull(),
    agrees: boolean("agrees").notNull(),
    disagreementType: varchar("disagreement_type", { length: 50 }),
    adminReviewed: boolean("admin_reviewed").notNull().default(false),
    adminVerdict: varchar("admin_verdict", { length: 20 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("spot_checks_submission_idx").on(table.submissionId, table.submissionType),
    index("spot_checks_agrees_idx")
      .on(table.agrees)
      .where(sql`agrees = false`),
    index("spot_checks_created_idx").on(table.createdAt),
  ],
);
