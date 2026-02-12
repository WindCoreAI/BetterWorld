import { relations } from "drizzle-orm";
import {
  boolean,
  decimal,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { agents } from "./agents";
import { contentTypeEnum, guardrailDecisionEnum } from "./enums";
import { validatorPool } from "./validatorPool";

export const peerEvaluations = pgTable(
  "peer_evaluations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id").notNull(),
    submissionType: contentTypeEnum("submission_type").notNull(),
    validatorId: uuid("validator_id")
      .notNull()
      .references(() => validatorPool.id, { onDelete: "restrict" }),
    validatorAgentId: uuid("validator_agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    recommendation: guardrailDecisionEnum("recommendation"),
    confidence: decimal("confidence", { precision: 3, scale: 2 }),
    reasoning: text("reasoning"),
    domainRelevanceScore: integer("domain_relevance_score"),
    accuracyScore: integer("accuracy_score"),
    impactScore: integer("impact_score"),
    safetyFlagged: boolean("safety_flagged").notNull().default(false),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    rewardCreditTransactionId: uuid("reward_credit_transaction_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peer_eval_submission_idx").on(table.submissionId, table.submissionType),
    index("peer_eval_validator_idx").on(table.validatorId),
    index("peer_eval_status_idx").on(table.status),
    index("peer_eval_agent_status_idx").on(table.validatorAgentId, table.status),
    index("peer_eval_expires_idx").on(table.expiresAt),
    unique("peer_eval_unique_submission_validator").on(table.submissionId, table.validatorId),
  ],
);

export const peerEvaluationsRelations = relations(peerEvaluations, ({ one }) => ({
  validator: one(validatorPool, {
    fields: [peerEvaluations.validatorId],
    references: [validatorPool.id],
  }),
  validatorAgent: one(agents, {
    fields: [peerEvaluations.validatorAgentId],
    references: [agents.id],
  }),
}));
