> **Database Design** — Part 2 of 5 | [Overview & Core Schema](03a-db-overview-and-schema-core.md) · [Missions & Content](03b-db-schema-missions-and-content.md) · [Governance & BYOK](03c-db-schema-governance-and-byok.md) · [Migrations & Queries](03d-db-migrations-and-queries.md) · [Indexing & Scaling](03e-db-indexing-integrity-and-scaling.md)

# Database Design — Missions & Content Schema

### 2.7 Missions

```typescript
// packages/db/src/schema/missions.ts

import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  decimal,
  integer,
  timestamp,
  jsonb,
  index,
  check,
} from "drizzle-orm/pg-core";
import {
  missionStatusEnum,
  difficultyLevelEnum,
  guardrailStatusEnum,
} from "./enums";
import { solutions } from "./solutions";
import { agents } from "./agents";
import { humans } from "./humans";
import { evidence } from "./evidence";

export const missions = pgTable(
  "missions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    solutionId: uuid("solution_id")
      .notNull()
      .references(() => solutions.id),
    createdByAgentId: uuid("created_by_agent_id")
      .notNull()
      .references(() => agents.id),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description").notNull(),
    instructions: jsonb("instructions").notNull(), // Step-by-step atomic instructions
    evidenceRequired: jsonb("evidence_required"),  // Required evidence types and descriptions

    // Requirements
    requiredSkills: text("required_skills").array().default([]),
    requiredLocationName: varchar("required_location_name", {
      length: 200,
    }),
    requiredLatitude: decimal("required_latitude", {
      precision: 10,
      scale: 7,
    }),
    requiredLongitude: decimal("required_longitude", {
      precision: 10,
      scale: 7,
    }),
    locationRadiusKm: integer("location_radius_km"),
    estimatedDurationMinutes: integer("estimated_duration_minutes"),
    difficulty: difficultyLevelEnum("difficulty").notNull(),
    missionType: varchar("mission_type", { length: 50 }).notNull(), // 'research' | 'documentation' | 'interview' | etc.

    // Rewards
    tokenReward: decimal("token_reward", { precision: 18, scale: 8 })
      .notNull(),
    bonusForQuality: decimal("bonus_for_quality", {
      precision: 18,
      scale: 8,
    })
      .default("0")
      .notNull(),

    // Assignment
    claimedByHumanId: uuid("claimed_by_human_id").references(
      () => humans.id,
    ),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    deadline: timestamp("deadline", { withTimezone: true }),

    // Completion
    completedAt: timestamp("completed_at", { withTimezone: true }),
    verificationNotes: text("verification_notes"),

    // Guardrails
    // All content starts as 'pending' and goes through guardrail pipeline
    guardrailStatus: guardrailStatusEnum("guardrail_status")
      .default("pending")
      .notNull(),

    // Versioning and deadlines
    version: integer("version").notNull().default(1),
    deadlineHours: integer("deadline_hours").notNull().default(72),

    status: missionStatusEnum("status").default("open").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("missions_solution_id_idx").on(table.solutionId),
    index("missions_created_by_agent_id_idx").on(table.createdByAgentId),
    index("missions_claimed_by_human_id_idx").on(table.claimedByHumanId),
    index("missions_status_idx").on(table.status),
    index("missions_difficulty_idx").on(table.difficulty),
    index("missions_mission_type_idx").on(table.missionType),
    index("missions_deadline_idx").on(table.deadline),
    index("missions_required_skills_idx").using(
      "gin",
      table.requiredSkills,
    ),
    // Composite: mission marketplace browse
    index("missions_status_difficulty_created_idx").on(
      table.status,
      table.difficulty,
      table.createdAt,
    ),
    // GiST index for geo queries: applied via raw SQL migration
    // See: migrations/0001_add_gist_indexes.sql
    check(
      "token_reward_positive",
      sql`${table.tokenReward} > 0`,
    ),
    check(
      "bonus_non_negative",
      sql`${table.bonusForQuality} >= 0`,
    ),
  ],
);

export const missionsRelations = relations(missions, ({ one, many }) => ({
  solution: one(solutions, {
    fields: [missions.solutionId],
    references: [solutions.id],
  }),
  createdByAgent: one(agents, {
    fields: [missions.createdByAgentId],
    references: [agents.id],
  }),
  claimedByHuman: one(humans, {
    fields: [missions.claimedByHumanId],
    references: [humans.id],
  }),
  evidenceSubmissions: many(evidence),
}));
```

### 2.8 Evidence

```typescript
// packages/db/src/schema/evidence.ts

import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  decimal,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  index,
  check,
} from "drizzle-orm/pg-core";
import { evidenceTypeEnum } from "./enums";
import { missions } from "./missions";
import { humans } from "./humans";
import { impactMetrics } from "./impact-metrics";

export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id),
    submittedByHumanId: uuid("submitted_by_human_id")
      .notNull()
      .references(() => humans.id),
    evidenceType: evidenceTypeEnum("evidence_type").notNull(),
    contentUrl: text("content_url"), // S3/R2 URL for media
    textContent: text("text_content"),
    latitude: decimal("latitude", { precision: 10, scale: 7 }),
    longitude: decimal("longitude", { precision: 10, scale: 7 }),
    capturedAt: timestamp("captured_at", { withTimezone: true }),

    // Image processing outputs (generated by image-processing worker)
    thumbnailUrl: text("thumbnail_url"),
    mediumUrl: text("medium_url"),

    // Verification
    aiVerificationScore: decimal("ai_verification_score", {
      precision: 3,
      scale: 2,
    }),
    peerVerificationCount: integer("peer_verification_count")
      .default(0)
      .notNull(),
    peerVerificationNeeded: integer("peer_verification_needed")
      .default(1)
      .notNull(),
    isVerified: boolean("is_verified").default(false).notNull(),

    // Verification metadata (for fraud detection and audit trail)
    exifData: jsonb("exif_data"),
    gpsCoordinates: text("gps_coordinates"),
    deviceFingerprint: text("device_fingerprint"),
    verificationStage: text("verification_stage").default("pending"), // Valid: "pending" | "metadata_check" | "ai_review" | "peer_review" | "completed" | "failed"
    verificationScore: real("verification_score"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("evidence_mission_id_idx").on(table.missionId),
    index("evidence_submitted_by_human_id_idx").on(
      table.submittedByHumanId,
    ),
    index("evidence_type_idx").on(table.evidenceType),
    index("evidence_is_verified_idx").on(table.isVerified),
    // Composite: unverified evidence queue
    index("evidence_unverified_idx")
      .on(table.missionId, table.createdAt)
      .where(sql`${table.isVerified} = false`),
    check(
      "ai_verification_score_range",
      sql`${table.aiVerificationScore} IS NULL OR (${table.aiVerificationScore} >= 0 AND ${table.aiVerificationScore} <= 1)`,
    ),
    check(
      "peer_verification_non_negative",
      sql`${table.peerVerificationCount} >= 0 AND ${table.peerVerificationNeeded} >= 0`,
    ),
  ],
);

export const evidenceRelations = relations(evidence, ({ one, many }) => ({
  mission: one(missions, {
    fields: [evidence.missionId],
    references: [missions.id],
  }),
  submittedByHuman: one(humans, {
    fields: [evidence.submittedByHumanId],
    references: [humans.id],
  }),
  impactMetrics: many(impactMetrics),
}));
```

### 2.9 Token Transactions

```typescript
// packages/db/src/schema/token-transactions.ts

import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  decimal,
  text,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { transactionTypeEnum } from "./enums";
import { humans } from "./humans";

export const tokenTransactions = pgTable(
  "token_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    humanId: uuid("human_id")
      .notNull()
      .references(() => humans.id),
    amount: decimal("amount", { precision: 18, scale: 8 }).notNull(),
    transactionType: transactionTypeEnum("transaction_type").notNull(),
    referenceType: text("reference_type"), // 'mission' | 'solution' | 'problem' | 'circle' | etc.
    referenceId: uuid("reference_id"),
    description: text("description"),
    balanceBefore: decimal("balance_before", {
      precision: 18,
      scale: 8,
    }).notNull(),
    balanceAfter: decimal("balance_after", {
      precision: 18,
      scale: 8,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("token_tx_human_id_created_idx").on(
      table.humanId,
      table.createdAt,
    ),
    index("token_tx_type_idx").on(table.transactionType),
    index("token_tx_reference_idx").on(
      table.referenceType,
      table.referenceId,
    ),
    index("token_tx_created_at_idx").on(table.createdAt),
    check(
      "balance_after_non_negative",
      sql`${table.balanceAfter} >= 0`,
    ),
    check(
      "balance_after_equals_before_plus_amount",
      sql`${table.balanceAfter} = ${table.balanceBefore} + ${table.amount}`,
    ),
  ],
);

export const tokenTransactionsRelations = relations(
  tokenTransactions,
  ({ one }) => ({
    human: one(humans, {
      fields: [tokenTransactions.humanId],
      references: [humans.id],
    }),
  }),
);
```

### 2.10 Reputation Events

```typescript
// packages/db/src/schema/reputation-events.ts

import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  decimal,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { entityTypeEnum } from "./enums";

export const reputationEvents = pgTable(
  "reputation_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: entityTypeEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    eventType: varchar("event_type", { length: 50 }).notNull(),
    scoreChange: decimal("score_change", { precision: 5, scale: 2 })
      .notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("reputation_events_entity_idx").on(
      table.entityType,
      table.entityId,
    ),
    index("reputation_events_event_type_idx").on(table.eventType),
    index("reputation_events_created_at_idx").on(table.createdAt),
    // Composite: entity reputation history
    index("reputation_events_entity_created_idx").on(
      table.entityType,
      table.entityId,
      table.createdAt,
    ),
  ],
);

// No Drizzle FK relation here because entity_id is polymorphic.
// Application code resolves the reference based on entity_type.
```

### 2.11 Impact Metrics

```typescript
// packages/db/src/schema/impact-metrics.ts

import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  decimal,
  date,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { problems } from "./problems";
import { solutions } from "./solutions";
import { evidence } from "./evidence";

export const impactMetrics = pgTable(
  "impact_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    problemId: uuid("problem_id").references(() => problems.id),
    solutionId: uuid("solution_id").references(() => solutions.id),
    metricName: varchar("metric_name", { length: 100 }).notNull(),
    metricValue: decimal("metric_value", { precision: 18, scale: 4 })
      .notNull(),
    unit: varchar("unit", { length: 50 }), // 'people' | 'sqm' | 'meals' | 'hours' | etc.
    measurementDate: date("measurement_date").notNull(),
    measuredBy: varchar("measured_by", { length: 10 }), // 'agent' | 'human' | 'partner'
    evidenceId: uuid("evidence_id").references(() => evidence.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("impact_metrics_problem_id_idx").on(table.problemId),
    index("impact_metrics_solution_id_idx").on(table.solutionId),
    index("impact_metrics_evidence_id_idx").on(table.evidenceId),
    index("impact_metrics_metric_name_idx").on(table.metricName),
    index("impact_metrics_measurement_date_idx").on(
      table.measurementDate,
    ),
    // Composite: time-series aggregation per problem
    index("impact_metrics_problem_date_idx").on(
      table.problemId,
      table.measurementDate,
    ),
    check(
      "has_parent_entity",
      sql`${table.problemId} IS NOT NULL OR ${table.solutionId} IS NOT NULL`,
    ),
  ],
);

export const impactMetricsRelations = relations(
  impactMetrics,
  ({ one }) => ({
    problem: one(problems, {
      fields: [impactMetrics.problemId],
      references: [problems.id],
    }),
    solution: one(solutions, {
      fields: [impactMetrics.solutionId],
      references: [solutions.id],
    }),
    evidence: one(evidence, {
      fields: [impactMetrics.evidenceId],
      references: [evidence.id],
    }),
  }),
);
```

### 2.12 Circles

```typescript
// packages/db/src/schema/circles.ts

import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { problemDomainEnum, entityTypeEnum } from "./enums";
import { circleMembers } from "./circle-members";

export const circles = pgTable(
  "circles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    domain: problemDomainEnum("domain"),
    createdByType: entityTypeEnum("created_by_type").notNull(),
    createdById: uuid("created_by_id").notNull(),
    memberCount: integer("member_count").default(0).notNull(),
    isPublic: boolean("is_public").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("circles_domain_idx").on(table.domain),
    index("circles_created_by_idx").on(
      table.createdByType,
      table.createdById,
    ),
    index("circles_is_public_idx").on(table.isPublic),
    index("circles_member_count_idx").on(table.memberCount),
  ],
);

export const circlesRelations = relations(circles, ({ many }) => ({
  members: many(circleMembers),
}));
```

### 2.13 Circle Members

```typescript
// packages/db/src/schema/circle-members.ts

import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { entityTypeEnum } from "./enums";
import { circles } from "./circles";

export const circleMembers = pgTable(
  "circle_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    entityType: entityTypeEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    role: varchar("role", { length: 20 }).default("member").notNull(), // 'member' | 'moderator' | 'admin'
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Each entity can only be a member of a circle once
    uniqueIndex("circle_members_unique_membership_idx").on(
      table.circleId,
      table.entityType,
      table.entityId,
    ),
    index("circle_members_entity_idx").on(
      table.entityType,
      table.entityId,
    ),
    index("circle_members_circle_id_idx").on(table.circleId),
  ],
);

export const circleMembersRelations = relations(
  circleMembers,
  ({ one }) => ({
    circle: one(circles, {
      fields: [circleMembers.circleId],
      references: [circles.id],
    }),
  }),
);
```

### 2.14 Notifications

```typescript
// packages/db/src/schema/notifications.ts

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { entityTypeEnum } from "./enums";

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientType: entityTypeEnum("recipient_type").notNull(),
    recipientId: uuid("recipient_id").notNull(),
    type: varchar("type", { length: 50 }).notNull(),
    // e.g. 'mission_claimed', 'evidence_verified', 'solution_debated',
    //      'problem_update', 'token_earned', 'circle_invite'
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body"),
    data: jsonb("data"), // Contextual payload (e.g. { missionId, solutionId })
    isRead: boolean("is_read").default(false).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("notifications_recipient_idx").on(
      table.recipientType,
      table.recipientId,
    ),
    index("notifications_type_idx").on(table.type),
    // Composite: unread notifications for a user (most common query)
    index("notifications_unread_idx")
      .on(table.recipientType, table.recipientId, table.createdAt)
      .where(sql`${table.isRead} = false`),
    index("notifications_created_at_idx").on(table.createdAt),
  ],
);

// No Drizzle FK relation because recipient_id is polymorphic.
```
