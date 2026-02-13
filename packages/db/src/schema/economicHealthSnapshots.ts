import { sql } from "drizzle-orm";
import {
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const economicHealthSnapshots = pgTable(
  "economic_health_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    totalFaucet: integer("total_faucet").notNull(),
    totalSink: integer("total_sink").notNull(),
    faucetSinkRatio: decimal("faucet_sink_ratio", { precision: 5, scale: 2 }).notNull(),
    activeAgents: integer("active_agents").notNull(),
    hardshipCount: integer("hardship_count").notNull(),
    hardshipRate: decimal("hardship_rate", { precision: 5, scale: 4 }).notNull(),
    medianBalance: decimal("median_balance", { precision: 10, scale: 2 }).notNull(),
    totalValidators: integer("total_validators").notNull(),
    alertTriggered: boolean("alert_triggered").notNull().default(false),
    alertDetails: jsonb("alert_details"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("econ_health_created_idx").on(table.createdAt),
    index("econ_health_alert_idx")
      .on(table.alertTriggered)
      .where(sql`alert_triggered = true`),
  ],
);
