# Data Model: Sprint 6 - Human Onboarding

**Feature**: 007-human-onboarding
**Created**: 2026-02-10
**Status**: Planning

This document defines the database schema changes required for Sprint 6 (Human Onboarding), including new tables, modifications to existing tables, indexes, and constraints.

---

## Table of Contents

1. [Schema Overview](#schema-overview)
2. [New Tables](#new-tables)
   - [human_profiles](#human_profiles)
   - [token_transactions](#token_transactions)
   - [better-auth Tables](#better-auth-tables)
3. [Modified Tables](#modified-tables)
   - [humans](#humans-modifications)
4. [Enums](#enums)
5. [Indexes](#indexes)
6. [Relationships](#relationships)
7. [Migration Strategy](#migration-strategy)

---

## Schema Overview

**New entities** (5 tables):
- `human_profiles` - Extended user profile attributes
- `token_transactions` - Double-entry token accounting
- `sessions` - better-auth session management
- `accounts` - better-auth OAuth provider accounts
- `verification_tokens` - better-auth email verification

**Modified entities** (1 table):
- `humans` - Add OAuth provider fields

**Total tables after Sprint 6**: 16 (11 existing + 5 new)

---

## New Tables

### human_profiles

Extended profile attributes for humans. One-to-one relationship with `humans` table.

**Purpose**: Store rich profile data for mission matching (Sprint 7), including skills, location, languages, availability, and profile completeness tracking.

**Schema**:
```typescript
// packages/db/src/schema/humanProfiles.ts
import {
  boolean,
  decimal,
  geography,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { humans } from "./humans";

export const humanProfiles = pgTable("human_profiles", {
  humanId: uuid("human_id")
    .primaryKey()
    .notNull()
    .references(() => humans.id, { onDelete: "cascade" }),

  // Core matching fields (50% of profile completeness)
  skills: text("skills")
    .array()
    .notNull()
    .default([]), // ["data_analysis", "python", "community_organizing"]
  city: varchar("city", { length: 200 }), // "Jakarta"
  country: varchar("country", { length: 100 }), // "Indonesia"
  location: geography("location", { type: "point", srid: 4326 }), // PostGIS POINT (lat, lng) for geo-radius queries
  serviceRadius: integer("service_radius").default(10), // kilometers (5-50km)
  languages: text("languages")
    .array()
    .notNull()
    .default([]), // ["en", "id", "zh"]

  // Availability (20% of profile completeness)
  availability: jsonb("availability"), // Structured schedule: { weekdays: "18:00-22:00", weekends: "09:00-17:00" }

  // Identity (15% of profile completeness)
  bio: text("bio"), // 500-char bio
  avatarUrl: varchar("avatar_url", { length: 500 }), // Profile picture URL

  // Optional (15% of profile completeness)
  walletAddress: varchar("wallet_address", { length: 100 }), // Future on-chain features
  certifications: text("certifications").array(), // ["cpr_certified", "first_aid"]

  // Metadata
  metadata: jsonb("metadata")
    .notNull()
    .default({}), // Orientation progress, preferences, etc.
  profileCompletenessScore: integer("profile_completeness_score")
    .notNull()
    .default(0), // 0-100%

  // Orientation tracking
  orientationCompletedAt: timestamp("orientation_completed_at", { withTimezone: true }),

  // Reputation & mission stats (populated by Sprint 7)
  totalMissionsCompleted: integer("total_missions_completed").notNull().default(0),
  totalTokensEarned: integer("total_tokens_earned").notNull().default(0),
  streakDays: integer("streak_days").notNull().default(0),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

**Field Notes**:

- **skills**: Array of skill identifiers (e.g., `["data_analysis", "python"]`). No predefined enum to allow organic growth.
- **location**: PostGIS geography type for efficient geo-radius queries via `ST_DWithin`. Automatically indexed with GIST.
- **availability**: JSONB for flexible schedule representation. Example:
  ```json
  {
    "weekdays": ["18:00-22:00"],
    "weekends": ["09:00-17:00"],
    "timezone": "Asia/Jakarta"
  }
  ```
- **metadata.orientation_progress**: Tracks orientation step (1-5) for resumability.
- **profileCompletenessScore**: Cached score (0-100%) calculated by `calculateProfileCompleteness()` utility.

**Constraints**:
- `CHECK (profile_completeness_score >= 0 AND profile_completeness_score <= 100)`
- `CHECK (service_radius >= 5 AND service_radius <= 50)` - Reasonable mission radius
- `CHECK (LENGTH(bio) <= 500)` - Bio character limit

**Indexes** (see [Indexes](#indexes) section)

---

### token_transactions

Double-entry accounting ledger for ImpactToken earn/spend operations.

**Purpose**: Track all token movements with `balance_before` and `balance_after` for audit integrity. Prevents race conditions via pessimistic locking.

**Schema**:
```typescript
// packages/db/src/schema/tokenTransactions.ts
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
import { humans } from "./humans";

export const transactionTypeEnum = pgEnum("transaction_type", [
  // Earn (positive amounts)
  "earn_orientation",
  "earn_mission",
  "earn_reward",
  "earn_bonus",
  "earn_referral",
  // Spend (negative amounts)
  "spend_vote",
  "spend_circle",
  "spend_analytics",
  "spend_custom",
]);

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
    metadata: jsonb("metadata").notNull().default({}), // Admin notes, reversal info, etc.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("token_tx_human_created_idx").on(table.humanId, table.createdAt.desc()),
    index("token_tx_type_idx").on(table.transactionType),
    index("token_tx_reference_idx").on(table.referenceId),
    uniqueIndex("token_tx_idempotency_idx").on(table.idempotencyKey),
  ],
);
```

**Field Notes**:

- **amount**: Signed integer. Positive for earn (e.g., `+10`), negative for spend (e.g., `-5`).
- **balanceBefore/balanceAfter**: Snapshot of `humans.token_balance` before and after transaction. Enables audit verification.
- **idempotencyKey**: Client-generated UUID or SHA-256 hash. Unique constraint prevents duplicate transactions.
- **transactionType**: Enum for filtering/reporting (e.g., "How many tokens were earned via missions?").

**Constraints**:
- `CHECK (balance_after = balance_before + amount)` - Enforces double-entry integrity
- `CHECK (balance_after >= 0)` - Prevents negative balances
- `UNIQUE (idempotency_key)` - Prevents duplicate transactions

**Indexes** (see [Indexes](#indexes) section)

**Example transaction**:
```sql
-- User earns 10 tokens from orientation
INSERT INTO token_transactions (
  human_id, amount, balance_before, balance_after,
  transaction_type, description, idempotency_key
) VALUES (
  '123e4567-e89b-12d3-a456-426614174000',
  10, 0, 10,
  'earn_orientation',
  'Welcome bonus for completing orientation',
  'a7b8c9d0-1234-5678-90ab-cdef12345678'
);

-- User spends 5 tokens on voting
INSERT INTO token_transactions (
  human_id, amount, balance_before, balance_after,
  transaction_type, reference_id, reference_type, description, idempotency_key
) VALUES (
  '123e4567-e89b-12d3-a456-426614174000',
  -5, 10, 5,
  'spend_vote',
  'problem-uuid',
  'problem',
  'Voted on problem with weight 5',
  'b1c2d3e4-5678-90ab-cdef-1234567890ab'
);
```

---

### better-auth Tables

better-auth requires 3 tables for OAuth and session management. These are auto-generated via `pnpm better-auth generate`.

#### sessions

**Purpose**: Track active user sessions with expiry and refresh token rotation.

**Schema** (better-auth managed):
```typescript
// Generated by better-auth
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => humans.id, { onDelete: "cascade" }),
  sessionToken: varchar("session_token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  refreshToken: varchar("refresh_token", { length: 255 }).unique(),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

**Expiry**:
- **Access token**: 15 minutes (JWT)
- **Refresh token**: 7 days, rotates on use
- **Session**: 30-day rolling expiry (extends on activity)

#### accounts

**Purpose**: Link users to OAuth provider accounts (Google, GitHub).

**Schema** (better-auth managed):
```typescript
// Generated by better-auth
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => humans.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 50 }).notNull(), // "google", "github"
  providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(), // OAuth provider's user ID
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  tokenType: varchar("token_type", { length: 50 }),
  scope: varchar("scope", { length: 500 }),
  idToken: text("id_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

**Constraints**:
- `UNIQUE (provider, provider_account_id)` - One account per provider

#### verification_tokens

**Purpose**: Store email verification codes for email/password registrations.

**Schema** (better-auth managed):
```typescript
// Generated by better-auth
export const verificationTokens = pgTable("verification_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: varchar("identifier", { length: 255 }).notNull(), // Email address
  token: varchar("token", { length: 10 }).notNull(), // 6-digit code
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  verified: boolean("verified").notNull().default(false),
  resendCount: integer("resend_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

**Constraints**:
- `CHECK (resend_count <= 3)` - Max 3 resend requests per hour (throttling)

---

## Modified Tables

### humans (Modifications)

**Changes**: Add OAuth provider fields to support better-auth integration.

**New fields**:
```typescript
// packages/db/src/schema/humans.ts
export const humans = pgTable("humans", {
  // ... existing fields (id, email, passwordHash, displayName, role, etc.) ...

  // Sprint 6: OAuth provider fields
  oauthProvider: varchar("oauth_provider", { length: 50 }), // "google", "github", null for email/password
  oauthProviderId: varchar("oauth_provider_id", { length: 255 }), // Provider's user ID
  avatarUrl: varchar("avatar_url", { length: 500 }), // From OAuth profile
  emailVerified: boolean("email_verified").notNull().default(false), // true for OAuth, false for email/password
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),

  // ... existing fields (reputationScore, tokenBalance, createdAt, etc.) ...
});
```

**Migration note**: Existing `humans` rows will have `oauth_provider = NULL`, `email_verified = false`.

**Constraint**:
- `CHECK (oauth_provider IN ('google', 'github') OR oauth_provider IS NULL)`

---

## Enums

**New enums** for Sprint 6:

```typescript
// packages/db/src/schema/enums.ts

// Token transaction types
export const transactionTypeEnum = pgEnum("transaction_type", [
  // Earn (positive amounts)
  "earn_orientation",
  "earn_mission",
  "earn_reward",
  "earn_bonus",
  "earn_referral",
  // Spend (negative amounts)
  "spend_vote",
  "spend_circle",
  "spend_analytics",
  "spend_custom",
]);

// Verification token user type (reused from agents)
export const entityTypeEnum = pgEnum("entity_type", [
  "agent",
  "human",
]); // Already exists, no change needed
```

---

## Indexes

### human_profiles

```typescript
// packages/db/src/schema/humanProfiles.ts
export const humanProfiles = pgTable(
  "human_profiles",
  { /* fields */ },
  (table) => [
    // Primary key index (automatic)
    // Geo-spatial index for location-based queries
    spatialIndex("human_profiles_location_gist_idx").using("gist", table.location),

    // Skills array index (GIN for array containment queries)
    index("human_profiles_skills_idx").using("gin", table.skills),

    // Profile completeness for filtering
    index("human_profiles_completeness_idx").on(table.profileCompletenessScore),

    // Last active for engagement tracking
    index("human_profiles_last_active_idx").on(table.lastActiveAt.desc()),
  ],
);
```

**Query patterns enabled**:
- **Geo-radius**: `SELECT * FROM human_profiles WHERE ST_DWithin(location, ST_MakePoint(lng, lat)::geography, 10000)` (10km radius)
- **Skill match**: `SELECT * FROM human_profiles WHERE skills @> ARRAY['python', 'data_analysis']`
- **High-completeness users**: `SELECT * FROM human_profiles WHERE profile_completeness_score >= 70`

### token_transactions

```typescript
// packages/db/src/schema/tokenTransactions.ts
export const tokenTransactions = pgTable(
  "token_transactions",
  { /* fields */ },
  (table) => [
    // Composite index for user's transaction history (most common query)
    index("token_tx_human_created_idx").on(table.humanId, table.createdAt.desc()),

    // Transaction type filtering (e.g., "all mission earnings")
    index("token_tx_type_idx").on(table.transactionType),

    // Reference lookup (e.g., "all votes on this problem")
    index("token_tx_reference_idx").on(table.referenceId),

    // Idempotency uniqueness (prevents duplicates)
    uniqueIndex("token_tx_idempotency_idx").on(table.idempotencyKey),
  ],
);
```

**Query patterns enabled**:
- **User history**: `SELECT * FROM token_transactions WHERE human_id = ? ORDER BY created_at DESC LIMIT 20`
- **Transaction type report**: `SELECT SUM(amount) FROM token_transactions WHERE transaction_type = 'earn_mission'`
- **Idempotency check**: `SELECT * FROM token_transactions WHERE idempotency_key = ?`

### humans (new indexes)

```typescript
// packages/db/src/schema/humans.ts
export const humans = pgTable(
  "humans",
  { /* fields */ },
  (table) => [
    // ... existing indexes (email, reputation) ...

    // Sprint 6: OAuth provider lookup
    index("humans_oauth_provider_idx").on(table.oauthProvider, table.oauthProviderId),
  ],
);
```

---

## Relationships

### Entity Relationship Diagram

```
┌─────────────┐                ┌──────────────────┐
│   humans    │────────────────│ human_profiles   │
│             │ 1:1            │                  │
│ id (PK)     │                │ human_id (PK/FK) │
│ email       │                │ skills           │
│ role        │                │ location         │
│ tokenBalance│                │ availability     │
└──────┬──────┘                └──────────────────┘
       │
       │ 1:N
       │
┌──────▼─────────────┐
│ token_transactions │
│                    │
│ id (PK)            │
│ human_id (FK)      │
│ amount             │
│ balance_before     │
│ balance_after      │
└────────────────────┘

┌─────────────┐       ┌──────────────┐       ┌────────────────────┐
│   humans    │───────│   sessions   │       │     accounts       │
│             │ 1:N   │              │       │                    │
│ id (PK)     │       │ user_id (FK) │       │ user_id (FK)       │
└──────┬──────┘       └──────────────┘       │ provider           │
       │                                      │ provider_account_id│
       │ 1:N                                  └────────────────────┘
       │
┌──────▼────────────────┐
│ verification_tokens   │
│                       │
│ identifier (email)    │
│ token (6-digit)       │
└───────────────────────┘
```

### Drizzle Relations

```typescript
// packages/db/src/schema/humans.ts
import { relations } from "drizzle-orm";

export const humansRelations = relations(humans, ({ one, many }) => ({
  profile: one(humanProfiles, {
    fields: [humans.id],
    references: [humanProfiles.humanId],
  }),
  tokenTransactions: many(tokenTransactions),
  sessions: many(sessions),
  accounts: many(accounts),
}));

// packages/db/src/schema/humanProfiles.ts
export const humanProfilesRelations = relations(humanProfiles, ({ one }) => ({
  human: one(humans, {
    fields: [humanProfiles.humanId],
    references: [humans.id],
  }),
}));

// packages/db/src/schema/tokenTransactions.ts
export const tokenTransactionsRelations = relations(tokenTransactions, ({ one }) => ({
  human: one(humans, {
    fields: [tokenTransactions.humanId],
    references: [humans.id],
  }),
}));
```

---

## Migration Strategy

### Step 1: Generate better-auth Schema

```bash
# Install better-auth
pnpm add better-auth

# Generate Drizzle schema files
pnpm better-auth generate --adapter drizzle --provider pg

# Output: packages/db/src/schema/sessions.ts, accounts.ts, verificationTokens.ts
```

### Step 2: Create Migration Files

```bash
# Create new schema files
touch packages/db/src/schema/humanProfiles.ts
touch packages/db/src/schema/tokenTransactions.ts

# Update existing humans.ts with OAuth fields

# Generate migration
pnpm drizzle-kit generate:pg
```

### Step 3: Apply Migration (Local)

```bash
# Start Docker services
docker-compose up -d

# Apply migration
pnpm drizzle-kit push:pg

# Verify tables
psql betterworld -c "\dt"
```

### Step 4: Seed Data (Optional)

```bash
# Seed test humans + profiles
pnpm --filter @betterworld/db seed:humans
```

### Step 5: Apply Migration (Production)

```bash
# Via Supabase dashboard or Drizzle Kit
PGHOST=<supabase-host> PGPASSWORD=<password> pnpm drizzle-kit push:pg
```

### Migration Safety

**Backwards compatibility**:
- ✅ New tables (`human_profiles`, `token_transactions`) don't affect existing functionality
- ✅ New fields in `humans` (OAuth provider fields) are nullable, won't break existing agent API
- ✅ better-auth tables are isolated from agent auth system

**Rollback plan**:
- If Sprint 6 fails, drop new tables: `DROP TABLE human_profiles CASCADE; DROP TABLE token_transactions CASCADE;`
- Remove OAuth fields from `humans`: `ALTER TABLE humans DROP COLUMN oauth_provider, DROP COLUMN oauth_provider_id;`
- better-auth tables can remain (unused, no side effects)

**Data retention**:
- All tables use `onDelete: "cascade"` for `human_id` foreign keys
- Deleting a human automatically deletes their profile, transactions, sessions, and accounts

---

## Data Constraints Summary

| Table | Constraint | Purpose |
|-------|-----------|---------|
| `human_profiles` | `profile_completeness_score >= 0 AND <= 100` | Valid percentage |
| `human_profiles` | `service_radius >= 5 AND <= 50` | Reasonable mission radius (km) |
| `human_profiles` | `LENGTH(bio) <= 500` | Bio character limit |
| `token_transactions` | `balance_after = balance_before + amount` | Double-entry integrity |
| `token_transactions` | `balance_after >= 0` | No negative balances |
| `token_transactions` | `UNIQUE (idempotency_key)` | Prevent duplicate transactions |
| `humans` | `UNIQUE (email)` | One account per email |
| `accounts` | `UNIQUE (provider, provider_account_id)` | One account per OAuth provider |
| `verification_tokens` | `resend_count <= 3` | Throttle verification requests |

---

## Storage Estimates

**Assumptions**:
- 10,000 humans after 6 months
- Average 20 token transactions per human
- Average 2 sessions per human (mobile + desktop)

| Table | Rows | Avg Row Size | Total Size |
|-------|------|--------------|------------|
| `humans` | 10,000 | 500 bytes | 5 MB |
| `human_profiles` | 10,000 | 2 KB | 20 MB |
| `token_transactions` | 200,000 | 300 bytes | 60 MB |
| `sessions` | 20,000 | 400 bytes | 8 MB |
| `accounts` | 15,000 | 500 bytes | 7.5 MB |
| `verification_tokens` | 500 (active) | 200 bytes | 100 KB |
| **Total** | | | **~101 MB** |

**Supabase free tier**: 500 MB (sufficient for Phase 2)

**Index overhead**: ~30% additional storage (~30 MB for indexes)

**Growth projection**: At 100K humans (Phase 3), total storage ~1 GB (still within free tier limits)

---

## Security Considerations

1. **API keys**: `passwordHash` in `humans` table uses bcrypt (cost factor 12)
2. **OAuth tokens**: `accessToken` and `refreshToken` in `accounts` table are encrypted at rest (Supabase encryption)
3. **Location privacy**: Geo-coordinates are snapped to 1km grid, exact addresses never stored
4. **PII protection**: `email`, `city`, `avatarUrl` are PII — access controlled by ownership checks
5. **Token integrity**: `CHECK (balance_after = balance_before + amount)` prevents manual balance manipulation
6. **Idempotency**: `UNIQUE (idempotency_key)` prevents replay attacks on token spending

---

## Next Steps

1. ✅ Create `humanProfiles.ts` and `tokenTransactions.ts` schema files
2. ✅ Modify `humans.ts` with OAuth fields
3. ✅ Run `pnpm better-auth generate` for sessions/accounts/verification_tokens
4. ✅ Generate migration with `pnpm drizzle-kit generate:pg`
5. ✅ Apply migration locally and test with seed data
6. ✅ Update TypeScript types in `@betterworld/shared` for API contracts
7. ✅ Implement Drizzle relations for query convenience

---

**Data Model Status**: ✅ **READY FOR IMPLEMENTATION**
**Estimated migration time**: 2-3 hours (local testing + production deployment)
