import {
  boolean,
  decimal,
  index,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { rateDirectionEnum } from "./enums";

export const rateAdjustments = pgTable(
  "rate_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adjustmentType: rateDirectionEnum("adjustment_type").notNull(),
    faucetSinkRatio: decimal("faucet_sink_ratio", {
      precision: 5,
      scale: 2,
    }).notNull(),
    rewardMultiplierBefore: decimal("reward_multiplier_before", {
      precision: 5,
      scale: 4,
    }).notNull(),
    rewardMultiplierAfter: decimal("reward_multiplier_after", {
      precision: 5,
      scale: 4,
    }).notNull(),
    costMultiplierBefore: decimal("cost_multiplier_before", {
      precision: 5,
      scale: 4,
    }).notNull(),
    costMultiplierAfter: decimal("cost_multiplier_after", {
      precision: 5,
      scale: 4,
    }).notNull(),
    changePercent: decimal("change_percent", {
      precision: 5,
      scale: 2,
    }).notNull(),
    circuitBreakerActive: boolean("circuit_breaker_active")
      .notNull()
      .default(false),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    triggeredBy: varchar("triggered_by", { length: 20 })
      .notNull()
      .default("auto"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("rate_adj_created_idx").on(table.createdAt),
    index("rate_adj_circuit_idx").on(
      table.circuitBreakerActive,
      table.createdAt,
    ),
  ],
);
