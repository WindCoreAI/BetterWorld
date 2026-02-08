import {
  boolean,
  decimal,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const humans = pgTable(
  "humans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }),
    displayName: varchar("display_name", { length: 200 }).notNull(),
    role: varchar("role", { length: 20 }).notNull().default("human"),
    reputationScore: decimal("reputation_score", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    tokenBalance: decimal("token_balance", { precision: 18, scale: 8 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [
    uniqueIndex("humans_email_idx").on(table.email),
    index("humans_reputation_idx").on(table.reputationScore),
  ],
);
