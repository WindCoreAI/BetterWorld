import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { agentCreditTransactions } from "./agentCreditTransactions";
import { agents } from "./agents";
import { consensusResults } from "./consensusResults";
import { disputeStatusEnum } from "./enums";

export const disputes = pgTable(
  "disputes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    consensusId: uuid("consensus_id")
      .notNull()
      .references(() => consensusResults.id, { onDelete: "restrict" }),
    challengerAgentId: uuid("challenger_agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    stakeAmount: integer("stake_amount").notNull().default(10),
    stakeCreditTransactionId: uuid("stake_credit_transaction_id").references(
      () => agentCreditTransactions.id,
    ),
    reasoning: text("reasoning").notNull(),
    status: disputeStatusEnum("status").notNull().default("open"),
    adminReviewerId: uuid("admin_reviewer_id"),
    adminDecision: varchar("admin_decision", { length: 20 }),
    adminNotes: text("admin_notes"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    stakeReturned: boolean("stake_returned").notNull().default(false),
    bonusPaid: boolean("bonus_paid").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("disputes_consensus_idx").on(table.consensusId),
    index("disputes_challenger_idx").on(table.challengerAgentId),
    index("disputes_status_idx").on(table.status),
  ],
);

export const disputesRelations = relations(disputes, ({ one }) => ({
  consensus: one(consensusResults, {
    fields: [disputes.consensusId],
    references: [consensusResults.id],
  }),
  challenger: one(agents, {
    fields: [disputes.challengerAgentId],
    references: [agents.id],
  }),
  stakeCreditTransaction: one(agentCreditTransactions, {
    fields: [disputes.stakeCreditTransactionId],
    references: [agentCreditTransactions.id],
  }),
}));
