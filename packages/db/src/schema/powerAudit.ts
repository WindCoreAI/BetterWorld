/**
 * Power Distribution Snapshots Table (Sprint 18: Cooperative Depth & Governance)
 *
 * Weekly governance health metrics for transparency.
 */
import {
  decimal,
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const powerDistributionSnapshots = pgTable(
  "power_distribution_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewGini: decimal("review_gini", { precision: 5, scale: 4 }).notNull(),
    decisionConcentration: decimal("decision_concentration", {
      precision: 5,
      scale: 4,
    }).notNull(),
    adminOverrideRate: decimal("admin_override_rate", {
      precision: 5,
      scale: 4,
    }).notNull(),
    tierDistribution: jsonb("tier_distribution").notNull(),
    domainCoverage: decimal("domain_coverage", {
      precision: 5,
      scale: 4,
    }).notNull(),
    geographicBalance: decimal("geographic_balance", {
      precision: 5,
      scale: 4,
    }).notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_power_snapshots_computed").on(table.computedAt),
  ],
);
