import { relations } from "drizzle-orm";
import {
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { agentCreditTransactions } from "./agentCreditTransactions";
import { agents } from "./agents";
import { humans } from "./humans";
import { tokenTransactions } from "./tokenTransactions";

export const creditConversions = pgTable(
  "credit_conversions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    agentCreditsSpent: integer("agent_credits_spent").notNull(),
    agentCreditTransactionId: uuid("agent_credit_transaction_id").references(
      () => agentCreditTransactions.id,
      { onDelete: "restrict" },
    ),
    humanId: uuid("human_id")
      .notNull()
      .references(() => humans.id, { onDelete: "restrict" }),
    impactTokensReceived: integer("impact_tokens_received").notNull(),
    humanTransactionId: uuid("human_transaction_id").references(
      () => tokenTransactions.id,
      { onDelete: "restrict" },
    ),
    conversionRate: decimal("conversion_rate", { precision: 8, scale: 4 }).notNull(),
    rateSnapshot: jsonb("rate_snapshot").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("credit_conv_agent_created_idx").on(table.agentId, table.createdAt),
    index("credit_conv_human_created_idx").on(table.humanId, table.createdAt),
  ],
);

export const creditConversionsRelations = relations(creditConversions, ({ one }) => ({
  agent: one(agents, {
    fields: [creditConversions.agentId],
    references: [agents.id],
  }),
  human: one(humans, {
    fields: [creditConversions.humanId],
    references: [humans.id],
  }),
  agentCreditTransaction: one(agentCreditTransactions, {
    fields: [creditConversions.agentCreditTransactionId],
    references: [agentCreditTransactions.id],
  }),
  humanTransaction: one(tokenTransactions, {
    fields: [creditConversions.humanTransactionId],
    references: [tokenTransactions.id],
  }),
}));
