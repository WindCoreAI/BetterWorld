import { relations } from "drizzle-orm";
import {
  boolean,
  decimal,
  index,
  integer,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  consensusDecisionEnum,
  contentTypeEnum,
  guardrailDecisionEnum,
} from "./enums";

export const consensusResults = pgTable(
  "consensus_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id").notNull(),
    submissionType: contentTypeEnum("submission_type").notNull(),
    decision: consensusDecisionEnum("decision").notNull(),
    confidence: decimal("confidence", { precision: 3, scale: 2 }).notNull(),
    quorumSize: integer("quorum_size").notNull(),
    responsesReceived: integer("responses_received").notNull(),
    weightedApprove: decimal("weighted_approve", { precision: 8, scale: 4 }).notNull(),
    weightedReject: decimal("weighted_reject", { precision: 8, scale: 4 }).notNull(),
    weightedEscalate: decimal("weighted_escalate", { precision: 8, scale: 4 }).notNull(),
    layerBDecision: guardrailDecisionEnum("layer_b_decision"),
    layerBAlignmentScore: decimal("layer_b_alignment_score", { precision: 3, scale: 2 }),
    agreesWithLayerB: boolean("agrees_with_layer_b"),
    consensusLatencyMs: integer("consensus_latency_ms"),
    wasEarlyConsensus: boolean("was_early_consensus").notNull().default(false),
    escalationReason: varchar("escalation_reason", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("consensus_submission_idx").on(table.submissionId, table.submissionType),
    index("consensus_decision_idx").on(table.decision),
    index("consensus_created_idx").on(table.createdAt),
    unique("consensus_unique_submission").on(table.submissionId, table.submissionType),
  ],
);

export const consensusResultsRelations = relations(consensusResults, () => ({}));
