import { relations } from "drizzle-orm";
import {
  decimal,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { evidence } from "./evidence";
import { humans } from "./humans";

export const verificationAuditLog = pgTable(
  "verification_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "restrict" }),
    decisionSource: varchar("decision_source", { length: 20 }).notNull(), // ai, peer, admin, system
    decision: varchar("decision", { length: 20 }).notNull(), // approved, rejected, escalated
    score: decimal("score", { precision: 3, scale: 2 }),
    reasoning: text("reasoning"),
    decidedByHumanId: uuid("decided_by_human_id").references(
      () => humans.id,
    ),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_audit_evidence").on(table.evidenceId),
    index("idx_audit_source").on(table.decisionSource),
    index("idx_audit_created").on(table.createdAt),
  ],
);

export const verificationAuditLogRelations = relations(
  verificationAuditLog,
  ({ one }) => ({
    evidence: one(evidence, {
      fields: [verificationAuditLog.evidenceId],
      references: [evidence.id],
    }),
    decidedBy: one(humans, {
      fields: [verificationAuditLog.decidedByHumanId],
      references: [humans.id],
    }),
  }),
);
