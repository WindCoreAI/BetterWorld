import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { humans } from "./humans";

export const humanProfiles = pgTable(
  "human_profiles",
  {
    humanId: uuid("human_id")
      .primaryKey()
      .notNull()
      .references(() => humans.id, { onDelete: "cascade" }),

    // Core matching fields (50% of profile completeness)
    skills: text("skills").array().notNull().default(sql`ARRAY[]::text[]`), // ["data_analysis", "python", "community_organizing"]
    city: varchar("city", { length: 200 }),
    country: varchar("country", { length: 100 }),
    // PostGIS geography type for efficient geo-radius queries
    // Using custom type since Drizzle doesn't have built-in geography type
    location: varchar("location", { length: 255 }), // Will be cast to geography(Point, 4326) in migration
    serviceRadius: integer("service_radius").default(10), // kilometers (5-50km)
    languages: text("languages").array().notNull().default(sql`ARRAY[]::text[]`), // ["en", "id", "zh"]

    // Availability (20% of profile completeness)
    availability: jsonb("availability"), // Structured schedule: { weekdays: "18:00-22:00", weekends: "09:00-17:00" }

    // Identity (15% of profile completeness)
    bio: text("bio"), // 500-char bio
    avatarUrl: varchar("avatar_url", { length: 500 }),

    // Optional (15% of profile completeness)
    walletAddress: varchar("wallet_address", { length: 100 }),
    certifications: text("certifications").array(),

    // Metadata
    metadata: jsonb("metadata").notNull().default({}), // Orientation progress, preferences
    profileCompletenessScore: integer("profile_completeness_score")
      .notNull()
      .default(0), // 0-100%

    // Orientation tracking
    orientationCompletedAt: timestamp("orientation_completed_at", {
      withTimezone: true,
    }),

    // Reputation & mission stats (populated by Sprint 7)
    totalMissionsCompleted: integer("total_missions_completed")
      .notNull()
      .default(0),
    totalTokensEarned: integer("total_tokens_earned").notNull().default(0),
    streakDays: integer("streak_days").notNull().default(0),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Skills array index — GIN created in migration 0005 (Drizzle defaults to btree)
    index("human_profiles_skills_idx").on(table.skills),
    // Profile completeness for filtering
    index("human_profiles_completeness_idx").on(table.profileCompletenessScore),
    // Last active for engagement tracking
    index("human_profiles_last_active_idx").on(table.lastActiveAt),
  ],
);
