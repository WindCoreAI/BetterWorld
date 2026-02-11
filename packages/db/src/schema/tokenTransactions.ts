import {
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

import { transactionTypeEnum } from "./enums";
import { humans } from "./humans";

export const tokenTransactions = pgTable(
  "token_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    humanId: uuid("human_id")
      .notNull()
      .references(() => humans.id, { onDelete: "cascade" }),

    // Double-entry accounting fields
    amount: integer("amount").notNull(), // Positive for earn, negative for spend
    balanceBefore: integer("balance_before").notNull(),
    balanceAfter: integer("balance_after").notNull(),

    // Transaction metadata
    transactionType: transactionTypeEnum("transaction_type").notNull(),
    referenceId: uuid("reference_id"), // mission_id, problem_id, solution_id, circle_id
    referenceType: varchar("reference_type", { length: 50 }), // "mission", "problem", "solution", "circle"
    description: text("description"), // User-facing description

    // Idempotency
    idempotencyKey: varchar("idempotency_key", { length: 64 }), // SHA-256 hash or UUID

    // Audit trail
    metadata: jsonb("metadata").notNull().default({}), // Admin notes, reversal info
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Composite index for user's transaction history (most common query)
    index("token_tx_human_created_idx").on(table.humanId, table.createdAt),
    // Transaction type filtering (e.g., "all mission earnings")
    index("token_tx_type_idx").on(table.transactionType),
    // Reference lookup (e.g., "all votes on this problem")
    index("token_tx_reference_idx").on(table.referenceId),
    // Idempotency uniqueness (prevents duplicates)
    uniqueIndex("token_tx_idempotency_idx").on(table.idempotencyKey),
  ],
);
