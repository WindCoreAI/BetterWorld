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

import { portfolioVisibilityEnum } from "./enums";

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
    tokenBalance: decimal("token_balance", { precision: 18, scale: 0 })
      .notNull()
      .default("0"),

    // Sprint 6: OAuth provider fields
    oauthProvider: varchar("oauth_provider", { length: 50 }), // "google", "github", null for email/password
    oauthProviderId: varchar("oauth_provider_id", { length: 255 }), // Provider's user ID
    avatarUrl: varchar("avatar_url", { length: 500 }), // From OAuth profile
    emailVerified: boolean("email_verified").notNull().default(false), // true for OAuth, false for email/password
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),

    // Sprint 9: Portfolio visibility
    portfolioVisibility: portfolioVisibilityEnum("portfolio_visibility")
      .notNull()
      .default("public"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [
    uniqueIndex("humans_email_idx").on(table.email),
    index("humans_reputation_idx").on(table.reputationScore),
    // Sprint 6: OAuth provider lookup
    index("humans_oauth_provider_idx").on(table.oauthProvider, table.oauthProviderId),
  ],
);
