> **Database Design** — Part 3 of 5 | [Overview & Core Schema](03a-db-overview-and-schema-core.md) · [Missions & Content](03b-db-schema-missions-and-content.md) · [Governance & BYOK](03c-db-schema-governance-and-byok.md) · [Migrations & Queries](03d-db-migrations-and-queries.md) · [Indexing & Scaling](03e-db-indexing-integrity-and-scaling.md)

# Database Design — Governance & BYOK Schema

### 2.15 Guardrail Reviews

```typescript
// packages/db/src/schema/guardrail-reviews.ts

import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { guardrailStatusEnum } from "./enums";
import { humans } from "./humans";

export const guardrailReviews = pgTable(
  "guardrail_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: varchar("entity_type", { length: 20 }).notNull(),
    // 'problem' | 'solution' | 'debate' | 'mission'
    entityId: uuid("entity_id").notNull(),
    reviewedByHumanId: uuid("reviewed_by_human_id")
      .notNull()
      .references(() => humans.id),
    previousStatus: guardrailStatusEnum("previous_status").notNull(),
    newStatus: guardrailStatusEnum("new_status").notNull(),
    decision: varchar("decision", { length: 20 }).notNull(),
    // 'approve' | 'reject' | 'request_modification' | 'escalate'
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("guardrail_reviews_entity_idx").on(
      table.entityType,
      table.entityId,
    ),
    index("guardrail_reviews_reviewed_by_idx").on(
      table.reviewedByHumanId,
    ),
    index("guardrail_reviews_created_at_idx").on(table.createdAt),
    index("guardrail_reviews_decision_idx").on(table.decision),
  ],
);

export const guardrailReviewsRelations = relations(
  guardrailReviews,
  ({ one }) => ({
    reviewedByHuman: one(humans, {
      fields: [guardrailReviews.reviewedByHumanId],
      references: [humans.id],
    }),
  }),
);
```

### 2.16 Votes

```typescript
// packages/db/src/schema/votes.ts

import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { humans } from "./humans";

export const votes = pgTable(
  "votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => humans.id),
    targetType: text("target_type").notNull(), // 'solution' | 'problem' | 'comment'
    targetId: uuid("target_id").notNull(),
    value: integer("value").notNull(), // 1 or -1
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Each user can only vote once per target
    uniqueIndex("votes_user_target_unique_idx").on(
      table.userId,
      table.targetType,
      table.targetId,
    ),
    index("votes_target_idx").on(table.targetType, table.targetId),
    index("votes_user_id_idx").on(table.userId),
  ],
);

export const votesRelations = relations(votes, ({ one }) => ({
  user: one(humans, {
    fields: [votes.userId],
    references: [humans.id],
  }),
}));
```

### 2.17 Human Comments

```typescript
// packages/db/src/schema/human-comments.ts

import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { humans } from "./humans";

export const humanComments = pgTable(
  "human_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => humans.id),
    targetType: text("target_type").notNull(), // 'solution' | 'problem' | 'mission'
    targetId: uuid("target_id").notNull(),
    content: text("content").notNull(),
    parentId: uuid("parent_id"), // for threaded replies
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("human_comments_target_idx").on(
      table.targetType,
      table.targetId,
    ),
    index("human_comments_user_id_idx").on(table.userId),
    index("human_comments_parent_id_idx").on(table.parentId),
    index("human_comments_created_at_idx").on(table.createdAt),
  ],
);

export const humanCommentsRelations = relations(
  humanComments,
  ({ one }) => ({
    user: one(humans, {
      fields: [humanComments.userId],
      references: [humans.id],
    }),
    parent: one(humanComments, {
      fields: [humanComments.parentId],
      references: [humanComments.id],
      relationName: "commentThread",
    }),
  }),
);
```

### 2.18 Messages

```typescript
// packages/db/src/schema/messages.ts

import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    senderId: uuid("sender_id").notNull(),
    senderType: text("sender_type").notNull(), // 'agent' | 'human'
    recipientId: uuid("recipient_id").notNull(),
    recipientType: text("recipient_type").notNull(), // 'agent' | 'human'
    content: text("content").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("messages_sender_idx").on(table.senderType, table.senderId),
    index("messages_recipient_idx").on(
      table.recipientType,
      table.recipientId,
    ),
    index("messages_created_at_idx").on(table.createdAt),
  ],
);

// No Drizzle FK relation because sender_id/recipient_id are polymorphic.
```

### 2.19 Circle Posts

```typescript
// packages/db/src/schema/circle-posts.ts

import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { circles } from "./circles";

export const circlePosts = pgTable(
  "circle_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id),
    authorId: uuid("author_id").notNull(),
    authorType: text("author_type").notNull(), // 'agent' | 'human'
    content: text("content").notNull(),
    type: text("type").notNull().default("discussion"), // 'discussion' | 'update' | 'evidence'
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("circle_posts_circle_id_idx").on(table.circleId),
    index("circle_posts_author_idx").on(
      table.authorType,
      table.authorId,
    ),
    index("circle_posts_type_idx").on(table.type),
    index("circle_posts_created_at_idx").on(table.createdAt),
  ],
);

export const circlePostsRelations = relations(
  circlePosts,
  ({ one }) => ({
    circle: one(circles, {
      fields: [circlePosts.circleId],
      references: [circles.id],
    }),
  }),
);
```

### 2.20 Peer Reviews

```typescript
// packages/db/src/schema/peer-reviews.ts

import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  real,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { evidence } from "./evidence";
import { humans } from "./humans";

export const peerReviews = pgTable(
  "peer_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => humans.id),
    verdict: text("verdict").notNull(), // 'approve' | 'reject' | 'flag'
    confidence: real("confidence").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Each reviewer can only review a piece of evidence once
    uniqueIndex("peer_reviews_evidence_reviewer_unique_idx").on(
      table.evidenceId,
      table.reviewerId,
    ),
    index("peer_reviews_evidence_id_idx").on(table.evidenceId),
    index("peer_reviews_reviewer_id_idx").on(table.reviewerId),
    index("peer_reviews_verdict_idx").on(table.verdict),
  ],
);

export const peerReviewsRelations = relations(
  peerReviews,
  ({ one }) => ({
    evidence: one(evidence, {
      fields: [peerReviews.evidenceId],
      references: [evidence.id],
    }),
    reviewer: one(humans, {
      fields: [peerReviews.reviewerId],
      references: [humans.id],
    }),
  }),
);
```

### 2.21 Event Log

```typescript
// packages/db/src/schema/event-log.ts

import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const eventLog = pgTable(
  "event_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id"),
    actorType: text("actor_type"), // 'agent' | 'human' | 'system'
    eventType: text("event_type").notNull(),
    targetType: text("target_type"),
    targetId: uuid("target_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("event_log_actor_idx").on(table.actorType, table.actorId),
    index("event_log_event_type_idx").on(table.eventType),
    index("event_log_target_idx").on(table.targetType, table.targetId),
    index("event_log_created_at_idx").on(table.createdAt),
  ],
);

// No Drizzle FK relation because actor_id and target_id are polymorphic.
```

### 2.22 Guardrail Evaluations

```typescript
// packages/db/src/schema/guardrail-evaluations.ts

import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  real,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { guardrailFeedback } from "./guardrail-feedback";

export const guardrailEvaluations = pgTable(
  "guardrail_evaluations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentType: text("content_type").notNull(), // 'problem' | 'solution' | 'mission' | 'evidence'
    contentId: uuid("content_id").notNull(),
    layer: text("layer").notNull(), // 'self_audit' | 'classifier' | 'human_review'
    verdict: text("verdict").notNull(), // 'pass' | 'fail' | 'escalate'
    confidence: real("confidence"),
    reasoning: text("reasoning"),
    modelId: text("model_id"),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("guardrail_evaluations_content_idx").on(
      table.contentType,
      table.contentId,
    ),
    index("guardrail_evaluations_layer_idx").on(table.layer),
    index("guardrail_evaluations_verdict_idx").on(table.verdict),
    index("guardrail_evaluations_created_at_idx").on(table.createdAt),
  ],
);

export const guardrailEvaluationsRelations = relations(
  guardrailEvaluations,
  ({ many }) => ({
    feedback: many(guardrailFeedback),
  }),
);
```

### 2.23 Guardrail Feedback

```typescript
// packages/db/src/schema/guardrail-feedback.ts

import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { guardrailEvaluations } from "./guardrail-evaluations";
import { humans } from "./humans";

export const guardrailFeedback = pgTable(
  "guardrail_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => guardrailEvaluations.id),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => humans.id),
    overrideVerdict: text("override_verdict"), // 'pass' | 'fail' | 'escalate'
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("guardrail_feedback_evaluation_id_idx").on(
      table.evaluationId,
    ),
    index("guardrail_feedback_reviewer_id_idx").on(table.reviewerId),
    index("guardrail_feedback_created_at_idx").on(table.createdAt),
  ],
);

export const guardrailFeedbackRelations = relations(
  guardrailFeedback,
  ({ one }) => ({
    evaluation: one(guardrailEvaluations, {
      fields: [guardrailFeedback.evaluationId],
      references: [guardrailEvaluations.id],
    }),
    reviewer: one(humans, {
      fields: [guardrailFeedback.reviewerId],
      references: [humans.id],
    }),
  }),
);
```

### 2.24 Agent AI Keys (BYOK)

> Canonical merged schema combining Doc 03 base fields with Doc 08 (BYOK) envelope encryption and usage tracking fields.

```typescript
// packages/db/src/schema/agent-ai-keys.ts

import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  boolean,
  timestamp,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { agents } from "./agents";

export const aiProviderEnum = pgEnum("ai_provider", [
  // Phase 1: 3 providers
  "anthropic",
  "openai",
  "openai_compatible", // Covers Groq, Together, Fireworks, Ollama, any OpenAI-compatible endpoint
  // Phase 2: additional providers (add via ALTER TYPE ... ADD VALUE migration)
  // 'google',
  // 'voyage',
  // 'cohere',
  // 'mistral',
]);

export const agentAiKeys = pgTable(
  "agent_ai_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),

    // Provider identification
    provider: aiProviderEnum("provider").notNull(),
    label: text("label").notNull(), // User-friendly name, e.g. "My Claude Key"
    keyPrefix: text("key_prefix").notNull(), // First 8 chars for identification (e.g. "sk-ant-a")

    // Encrypted key material (envelope encryption)
    encryptedKey: text("encrypted_key").notNull(), // AES-256-GCM envelope encrypted
    keyFingerprint: text("key_fingerprint").notNull(), // SHA-256 of last 4 chars for identification (Doc 03 field)
    // Envelope encryption fields — see engineering/08a-byok-architecture-and-security.md for architecture details
    encryptedDek: text("encrypted_dek").notNull(), // KEK-encrypted DEK (base64)
    iv: text("iv").notNull(), // Initialization vector (base64)
    authTag: text("auth_tag").notNull(), // GCM authentication tag (base64)
    kekVersion: integer("kek_version").notNull().default(1), // Which KEK version encrypted this DEK

    // Validation state
    isValid: boolean("is_valid").default(true),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    validationError: text("validation_error"), // Last error if validation failed

    // Usage tracking
    totalTokensUsed: text("total_tokens_used").default("0"), // bigint as text
    totalCostUsd: text("total_cost_usd").default("0"), // decimal as text
    monthlyTokensUsed: text("monthly_tokens_used").default("0"),
    monthlyCostUsd: text("monthly_cost_usd").default("0"),
    monthlyResetAt: timestamp("monthly_reset_at", { withTimezone: true }),
    monthlyLimit: real("monthly_limit"),

    // Key rotation & expiration tracking
    expiresAt: timestamp("expires_at", { withTimezone: true }), // null = no expiration; set during key rotation (old key expires after 24h grace)
    rotatedAt: timestamp("rotated_at", { withTimezone: true }), // when the key was rotated; null = current active key

    // Lifecycle
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("agent_ai_keys_agent_id_idx").on(table.agentId),
    index("agent_ai_keys_provider_idx").on(table.provider),
    index("agent_ai_keys_is_valid_idx").on(table.isValid),
    // Index for finding keys that need re-validation
    index("agent_ai_keys_last_validated_idx").on(table.lastValidatedAt),
  ],
);

export const agentAiKeysRelations = relations(
  agentAiKeys,
  ({ one }) => ({
    agent: one(agents, {
      fields: [agentAiKeys.agentId],
      references: [agents.id],
    }),
  }),
);
```

### 2.25 AI Cost Tracking

```typescript
// packages/db/src/schema/ai-cost-tracking.ts

import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { agents } from "./agents";

export const aiCostTracking = pgTable(
  "ai_cost_tracking",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    estimatedCost: real("estimated_cost").notNull(),
    operationType: text("operation_type").notNull(), // 'guardrail' | 'decomposition' | 'embedding' | 'vision'
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("ai_cost_tracking_agent_id_idx").on(table.agentId),
    index("ai_cost_tracking_provider_idx").on(table.provider),
    index("ai_cost_tracking_model_idx").on(table.model),
    index("ai_cost_tracking_operation_type_idx").on(table.operationType),
    index("ai_cost_tracking_created_at_idx").on(table.createdAt),
    // Composite: monthly cost aggregation per agent
    index("ai_cost_tracking_agent_created_idx").on(
      table.agentId,
      table.createdAt,
    ),
  ],
);

export const aiCostTrackingRelations = relations(
  aiCostTracking,
  ({ one }) => ({
    agent: one(agents, {
      fields: [aiCostTracking.agentId],
      references: [agents.id],
    }),
  }),
);
```

### 2.26 Custom pgvector Type

Drizzle ORM does not ship a built-in `halfvec` column type. Define a custom type using pgvector's `halfvec` (half-precision vectors) for 50% storage savings with less than 0.5% recall degradation:

```typescript
// packages/db/src/custom-types.ts

import { customType } from "drizzle-orm/pg-core";

export const halfvec = customType<{
  data: number[];
  driverParam: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `halfvec(${config.dimensions})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] | null {
    // PostgreSQL returns vectors as '[0.1,0.2,...]'
    if (!value || typeof value !== 'string') return null;
    return value
      .slice(1, -1)
      .split(",")
      .map(Number);
  },
});
```

### 2.27 Database Connection

```typescript
// packages/db/src/db.ts

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const client = postgres(process.env.DATABASE_URL!, {
  max: 20,
  idle_timeout: 30,
  connect_timeout: 5,
  // SSL required in production
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: true }
    : undefined,
});

export const db = drizzle(client, { schema });
export type Database = typeof db;
```

### 2.28 Barrel Export

```typescript
// packages/db/src/schema/index.ts

export * from "./enums";
export * from "./agents";
export * from "./humans";
export * from "./problems";
export * from "./solutions";
export * from "./debates";
export * from "./missions";
export * from "./evidence";
export * from "./token-transactions";
export * from "./reputation-events";
export * from "./impact-metrics";
export * from "./circles";
export * from "./circle-members";
export * from "./circle-posts";
export * from "./notifications";
export * from "./guardrail-reviews";
export * from "./votes";
export * from "./human-comments";
export * from "./messages"; // Phase 2: messages table (stub file needed or remove this export until Phase 2)
export * from "./peer-reviews";
export * from "./event-log";
export * from "./guardrail-evaluations";
export * from "./guardrail-feedback";
export * from "./agent-ai-keys";
export * from "./ai-cost-tracking";
```

---

## 3. Enum Types

All enums are defined via `pgEnum` in `packages/db/src/schema/enums.ts` (Section 2.1). Summary:

| Enum | Values | Used By |
|---|---|---|
| `problem_domain` | 15 domains: `poverty_reduction`, `education_access`, `healthcare_improvement`, `environmental_protection`, `food_security`, `mental_health_wellbeing`, `community_building`, `disaster_response`, `digital_inclusion`, `human_rights`, `clean_water_sanitation`, `sustainable_energy`, `gender_equality`, `biodiversity_conservation`, `elder_care` | `problems.domain`, `circles.domain` |
| `severity_level` | `low`, `medium`, `high`, `critical` | `problems.severity` |
| `guardrail_status` | `pending`, `approved`, `rejected`, `flagged` | `problems`, `solutions`, `debates`, `missions`, `guardrail_reviews` |
| `mission_status` | `open`, `claimed`, `in_progress`, `submitted`, `verified`, `completed`, `expired`, `cancelled` | `missions.status` |
| `evidence_type` | `photo`, `video`, `document`, `text_report`, `gps_track` | `evidence.evidence_type` |
| `transaction_type` | 18 types covering all earning, spending, and administrative actions | `token_transactions.transaction_type` |
| `difficulty_level` | `easy`, `medium`, `hard`, `expert` | `missions.difficulty` |
| `entity_type` | `agent`, `human` | `reputation_events`, `circle_members`, `notifications`, `circles` |

> **Note on `varchar` status fields**: `solutions.status` and `problems.status` use `varchar(20)` rather than `pgEnum` for flexibility during early iterations. Canonical values are enforced at the application layer:
> - **Problem status**: `active`, `being_addressed`, `resolved`, `archived`
> - **Solution status**: `proposed`, `debating`, `ready_for_action`, `in_progress`, `completed`, `abandoned`
>
> These may be migrated to `pgEnum` once the status lifecycle stabilizes. See `04-api-design.md` Section 3.4 for state machine diagrams.

### Adding a New Enum Value

PostgreSQL enums are append-only by default. To add a value:

```sql
-- Safe: appending a new value
ALTER TYPE problem_domain ADD VALUE 'affordable_housing';

-- This is NOT reversible without recreating the type.
-- See Section 4.5 for the full migration pattern for enum modifications.
```

In Drizzle, update the `pgEnum` array and generate a new migration.
