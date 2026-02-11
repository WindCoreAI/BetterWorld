/**
 * Evidence Perceptual Hashes Table (Sprint 9: Reputation & Impact)
 */
import { relations } from "drizzle-orm";
import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { evidence } from "./evidence";
import { humans } from "./humans";

export const evidencePhashes = pgTable(
  "evidence_phashes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    humanId: uuid("human_id")
      .notNull()
      .references(() => humans.id),
    phash: varchar("phash", { length: 16 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_phashes_human").on(table.humanId, table.createdAt),
    index("idx_phashes_hash").on(table.phash),
    uniqueIndex("idx_phashes_evidence").on(table.evidenceId),
  ],
);

export const evidencePhashesRelations = relations(
  evidencePhashes,
  ({ one }) => ({
    evidence: one(evidence, {
      fields: [evidencePhashes.evidenceId],
      references: [evidence.id],
    }),
    human: one(humans, {
      fields: [evidencePhashes.humanId],
      references: [humans.id],
    }),
  }),
);
