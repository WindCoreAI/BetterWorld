import { relations, sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { deletionRequestStatusEnum } from "./enums";
import { humans } from "./humans";

/**
 * Sprint 20: Security Hardening — Account Deletion Requests
 *
 * Tracks pending, cancelled, and completed account deletion requests.
 * GDPR Article 17 — right to erasure with 14-day cooling-off period.
 */
export const accountDeletionRequests = pgTable(
  "account_deletion_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    humanId: uuid("human_id")
      .notNull()
      .references(() => humans.id, { onDelete: "restrict" }),
    status: deletionRequestStatusEnum("status").notNull().default("pending"),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    coolingOffExpiresAt: timestamp("cooling_off_expires_at", {
      withTimezone: true,
    }).notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    anonymizedIdentifier: varchar("anonymized_identifier", { length: 12 }),
    deletionLog: jsonb("deletion_log"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_deletion_requests_human_pending")
      .on(table.humanId)
      .where(sql`status = 'pending'`),
    index("idx_deletion_requests_status_expires")
      .on(table.status, table.coolingOffExpiresAt)
      .where(sql`status = 'pending'`),
  ],
);

export const accountDeletionRequestsRelations = relations(
  accountDeletionRequests,
  ({ one }) => ({
    human: one(humans, {
      fields: [accountDeletionRequests.humanId],
      references: [humans.id],
    }),
  }),
);
