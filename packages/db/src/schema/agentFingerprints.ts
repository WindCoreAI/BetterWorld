/**
 * Agent Fingerprints Table (Sprint 18: Cooperative Depth & Governance)
 *
 * Weekly behavioral profile for each agent.
 */
import { relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { agents } from "./agents";

export const agentFingerprints = pgTable(
  "agent_fingerprints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    domainFocus: jsonb("domain_focus").notNull(),
    approachPattern: jsonb("approach_pattern").notNull(),
    geographicFocus: jsonb("geographic_focus").notNull(),
    scalePreference: jsonb("scale_preference").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_agent_fingerprints_agent").on(table.agentId, table.computedAt),
  ],
);

export const agentFingerprintsRelations = relations(agentFingerprints, ({ one }) => ({
  agent: one(agents, {
    fields: [agentFingerprints.agentId],
    references: [agents.id],
  }),
}));
