import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { problemDomainEnum } from "./enums";

export const missionTemplates = pgTable(
  "mission_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description").notNull(),
    domain: problemDomainEnum("domain").notNull(),
    difficultyLevel: varchar("difficulty_level", { length: 20 }).notNull(),
    requiredPhotos: jsonb("required_photos").notNull().default([]),
    gpsRadiusMeters: integer("gps_radius_meters").notNull(),
    completionCriteria: jsonb("completion_criteria").notNull(),
    stepInstructions: jsonb("step_instructions").notNull(),
    estimatedDurationMinutes: integer("estimated_duration_minutes"),
    isActive: boolean("is_active").notNull().default(true),
    createdByAdminId: uuid("created_by_admin_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("mission_templates_domain_idx").on(table.domain),
    index("mission_templates_active_idx")
      .on(table.isActive)
      .where(sql`is_active = true`),
    check("gps_radius_positive", sql`${table.gpsRadiusMeters} > 0`),
  ],
);
