import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { humans } from "./humans";

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => humans.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 50 }).notNull(), // "google", "github"
    providerAccountId: varchar("provider_account_id", { length: 255 })
      .notNull(), // OAuth provider's user ID
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    tokenType: varchar("token_type", { length: 50 }),
    scope: varchar("scope", { length: 500 }),
    idToken: text("id_token"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("accounts_provider_idx").on(table.provider, table.providerAccountId),
  ],
);
