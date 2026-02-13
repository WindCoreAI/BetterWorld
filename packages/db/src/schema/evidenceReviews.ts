import { relations } from "drizzle-orm";
import {
  decimal,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { agentCreditTransactions } from "./agentCreditTransactions";
import { agents } from "./agents";
import { evidenceReviewStatusEnum } from "./enums";
import { evidence } from "./evidence";
import { validatorPool } from "./validatorPool";

export const evidenceReviewAssignments = pgTable(
  "evidence_review_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "restrict" }),
    validatorId: uuid("validator_id")
      .notNull()
      .references(() => validatorPool.id, { onDelete: "restrict" }),
    validatorAgentId: uuid("validator_agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    capabilityMatch: varchar("capability_match", { length: 50 }),
    recommendation: varchar("recommendation", { length: 20 }),
    confidence: decimal("confidence", { precision: 3, scale: 2 }),
    reasoning: text("reasoning"),
    rewardAmount: decimal("reward_amount", { precision: 8, scale: 2 }),
    rewardTransactionId: uuid("reward_transaction_id").references(
      () => agentCreditTransactions.id,
    ),
    status: evidenceReviewStatusEnum("status").notNull().default("pending"),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("evi_review_evidence_idx").on(table.evidenceId),
    index("evi_review_validator_idx").on(table.validatorId),
    index("evi_review_status_idx").on(table.status),
    index("evi_review_expires_idx").on(table.expiresAt),
    uniqueIndex("evi_review_unique_idx").on(table.evidenceId, table.validatorId),
  ],
);

export const evidenceReviewAssignmentsRelations = relations(
  evidenceReviewAssignments,
  ({ one }) => ({
    evidence: one(evidence, {
      fields: [evidenceReviewAssignments.evidenceId],
      references: [evidence.id],
    }),
    validator: one(validatorPool, {
      fields: [evidenceReviewAssignments.validatorId],
      references: [validatorPool.id],
    }),
    validatorAgent: one(agents, {
      fields: [evidenceReviewAssignments.validatorAgentId],
      references: [agents.id],
    }),
    rewardTransaction: one(agentCreditTransactions, {
      fields: [evidenceReviewAssignments.rewardTransactionId],
      references: [agentCreditTransactions.id],
    }),
  }),
);
