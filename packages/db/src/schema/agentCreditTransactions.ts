import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { agents } from "./agents";
import { agentCreditTypeEnum } from "./enums";

export const agentCreditTransactions = pgTable(
  "agent_credit_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),

    // Double-entry accounting fields (Constitution Principle IV)
    amount: integer("amount").notNull(),
    balanceBefore: integer("balance_before").notNull(),
    balanceAfter: integer("balance_after").notNull(),

    // Transaction metadata
    transactionType: agentCreditTypeEnum("transaction_type").notNull(),
    referenceId: uuid("reference_id"),
    referenceType: varchar("reference_type", { length: 50 }),
    description: text("description"),

    // Idempotency
    idempotencyKey: varchar("idempotency_key", { length: 64 }),

    // Audit trail
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Agent's transaction history (most common query)
    index("agent_credit_tx_agent_created_idx").on(table.agentId, table.createdAt),
    // Transaction type filtering
    index("agent_credit_tx_type_idx").on(table.transactionType),
    // Idempotency uniqueness
    uniqueIndex("agent_credit_tx_idempotency_idx").on(table.idempotencyKey),
    // Double-entry accounting check constraint
    check(
      "balance_consistency",
      sql`${table.balanceAfter} = ${table.balanceBefore} + ${table.amount}`,
    ),
  ],
);

export const agentCreditTransactionsRelations = relations(
  agentCreditTransactions,
  ({ one }) => ({
    agent: one(agents, {
      fields: [agentCreditTransactions.agentId],
      references: [agents.id],
    }),
  }),
);
