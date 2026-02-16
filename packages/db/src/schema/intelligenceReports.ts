/**
 * Intelligence Reports Table (Sprint 17: Community Identity & Visible Growth)
 *
 * Monthly community intelligence reports aggregating platform patterns.
 * Each month has exactly one report (unique on report_month).
 */
import {
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const intelligenceReports = pgTable("intelligence_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportMonth: varchar("report_month", { length: 7 }).notNull().unique(),
  reportData: jsonb("report_data").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
