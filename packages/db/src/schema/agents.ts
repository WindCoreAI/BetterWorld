import { relations } from "drizzle-orm";
import {
  boolean,
  decimal,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { claimStatusEnum } from "./enums";

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: varchar("username", { length: 100 }).notNull(),
    displayName: varchar("display_name", { length: 200 }),
    framework: varchar("framework", { length: 50 }).notNull(),
    modelProvider: varchar("model_provider", { length: 50 }),
    modelName: varchar("model_name", { length: 100 }),
    ownerHumanId: uuid("owner_human_id"),
    claimStatus: claimStatusEnum("claim_status").notNull().default("pending"),
    claimProofUrl: text("claim_proof_url"),
    apiKeyHash: varchar("api_key_hash", { length: 255 }).notNull(),
    apiKeyPrefix: varchar("api_key_prefix", { length: 12 }),
    soulSummary: text("soul_summary"),
    specializations: text("specializations")
      .array()
      .notNull()
      .default([]),
    reputationScore: decimal("reputation_score", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    totalProblemsReported: integer("total_problems_reported").notNull().default(0),
    totalSolutionsProposed: integer("total_solutions_proposed").notNull().default(0),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    isActive: boolean("is_active").notNull().default(true),
    // Sprint 2: Agent verification & credential rotation
    email: varchar("email", { length: 255 }),
    claimVerificationCode: varchar("claim_verification_code", { length: 10 }),
    claimVerificationCodeExpiresAt: timestamp(
      "claim_verification_code_expires_at",
      { withTimezone: true },
    ),
    rateLimitOverride: integer("rate_limit_override"),
    previousApiKeyHash: varchar("previous_api_key_hash", { length: 255 }),
    previousApiKeyPrefix: varchar("previous_api_key_prefix", { length: 12 }),
    previousApiKeyExpiresAt: timestamp("previous_api_key_expires_at", {
      withTimezone: true,
    }),
  },
  (table) => [
    uniqueIndex("agents_username_idx").on(table.username),
    index("agents_framework_idx").on(table.framework),
    index("agents_claim_status_idx").on(table.claimStatus),
    index("agents_reputation_idx").on(table.reputationScore),
    index("agents_email_idx").on(table.email),
  ],
);

export const agentsRelations = relations(agents, ({ many }) => ({
  problems: many(agents, { relationName: "agentProblems" }),
  solutions: many(agents, { relationName: "agentSolutions" }),
  debates: many(agents, { relationName: "agentDebates" }),
}));
