import {
  boolean,
  decimal,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { agents } from "./agents";
import {
  contentTypeEnum,
  guardrailDecisionEnum,
  flaggedContentStatusEnum,
  adminDecisionEnum,
  patternSeverityEnum,
} from "./enums";

// 1. Guardrail Evaluations - Audit trail for all evaluations
export const guardrailEvaluations = pgTable(
  "guardrail_evaluations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentId: uuid("content_id").notNull(),
    contentType: contentTypeEnum("content_type").notNull(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    submittedContent: text("submitted_content").notNull(), // JSONB stored as text
    layerAResult: text("layer_a_result").notNull(), // JSONB: { passed, forbidden_patterns, execution_time_ms }
    layerBResult: text("layer_b_result"), // JSONB: { aligned_domain, alignment_score, harm_risk, etc. }
    finalDecision: guardrailDecisionEnum("final_decision").notNull(),
    alignmentScore: decimal("alignment_score", { precision: 3, scale: 2 }),
    alignmentDomain: varchar("alignment_domain", { length: 50 }),
    cacheHit: boolean("cache_hit").notNull().default(false),
    cacheKey: varchar("cache_key", { length: 64 }),
    trustTier: varchar("trust_tier", { length: 20 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    evaluationDurationMs: integer("evaluation_duration_ms"),
  },
  (table) => ({
    contentIdIdx: index("guardrail_evaluations_content_id_idx").on(
      table.contentId
    ),
    agentIdIdx: index("guardrail_evaluations_agent_id_idx").on(table.agentId),
    cacheKeyIdx: index("guardrail_evaluations_cache_key_idx").on(
      table.cacheKey
    ),
    createdAtIdx: index("guardrail_evaluations_created_at_idx").on(
      table.createdAt
    ),
    finalDecisionIdx: index("guardrail_evaluations_final_decision_idx").on(
      table.finalDecision
    ),
  })
);

// 2. Flagged Content - Human admin review queue
export const flaggedContent = pgTable(
  "flagged_content",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .unique()
      .references(() => guardrailEvaluations.id),
    contentId: uuid("content_id").notNull(),
    contentType: contentTypeEnum("content_type").notNull(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    status: flaggedContentStatusEnum("status")
      .notNull()
      .default("pending_review"),
    assignedAdminId: uuid("assigned_admin_id"), // FK to admin_users (not defined yet)
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    adminDecision: adminDecisionEnum("admin_decision"),
    adminNotes: text("admin_notes"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statusCreatedAtIdx: index("flagged_content_status_created_at_idx").on(
      table.status,
      table.createdAt
    ),
    assignedAdminIdx: index("flagged_content_assigned_admin_idx").on(
      table.assignedAdminId
    ),
    agentIdIdx: index("flagged_content_agent_id_idx").on(table.agentId),
  })
);

// 3. Forbidden Patterns - Layer A configuration
export const forbiddenPatterns = pgTable("forbidden_patterns", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  description: text("description").notNull(),
  regexPattern: text("regex_pattern").notNull(),
  severity: patternSeverityEnum("severity").notNull().default("high"),
  exampleViolations: text("example_violations").array().notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// 4. Approved Domains - Layer B configuration
export const approvedDomains = pgTable("approved_domains", {
  id: serial("id").primaryKey(),
  domainKey: varchar("domain_key", { length: 50 }).notNull().unique(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  description: text("description").notNull(),
  unSdgAlignment: integer("un_sdg_alignment").array().notNull(),
  exampleTopics: text("example_topics").array().notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// 5. Trust Tiers - Agent trust model configuration
export const trustTiers = pgTable("trust_tiers", {
  id: serial("id").primaryKey(),
  tierName: varchar("tier_name", { length: 20 }).notNull().unique(),
  displayName: varchar("display_name", { length: 50 }).notNull(),
  minAccountAgeDays: integer("min_account_age_days").notNull(),
  minApprovedSubmissions: integer("min_approved_submissions").notNull(),
  autoApproveThreshold: decimal("auto_approve_threshold", {
    precision: 3,
    scale: 2,
  }),
  autoFlagThresholdMin: decimal("auto_flag_threshold_min", {
    precision: 3,
    scale: 2,
  }),
  autoRejectThresholdMax: decimal("auto_reject_threshold_max", {
    precision: 3,
    scale: 2,
  }),
  description: text("description").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// 6. Evaluation Cache - Redis-backed result cache
export const evaluationCache = pgTable(
  "evaluation_cache",
  {
    cacheKey: varchar("cache_key", { length: 64 }).primaryKey(),
    evaluationResult: text("evaluation_result").notNull(), // JSONB stored as text
    alignmentScore: decimal("alignment_score", { precision: 3, scale: 2 })
      .notNull(),
    alignmentDomain: varchar("alignment_domain", { length: 50 }),
    hitCount: integer("hit_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    expiresAtIdx: index("evaluation_cache_expires_at_idx").on(table.expiresAt),
  })
);
