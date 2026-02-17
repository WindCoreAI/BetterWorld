/**
 * Mission Help Offers Table (Sprint 18: Cooperative Depth & Governance)
 *
 * Tracks informal help offers on mission claims.
 */
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { guardrailStatusEnum, helpOfferStatusEnum } from "./enums";
import { humans } from "./humans";
import { missionClaims } from "./missionClaims";

export const missionHelpOffers = pgTable(
  "mission_help_offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    missionClaimId: uuid("mission_claim_id")
      .notNull()
      .references(() => missionClaims.id),
    helperHumanId: uuid("helper_human_id")
      .notNull()
      .references(() => humans.id),
    message: varchar("message", { length: 500 }).notNull(),
    status: helpOfferStatusEnum("status").notNull().default("pending"),
    isContributing: boolean("is_contributing").notNull().default(false),
    guardrailStatus: guardrailStatusEnum("guardrail_status")
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // One offer per helper per claim
    uniqueIndex("idx_help_offers_unique").on(
      table.missionClaimId,
      table.helperHumanId,
    ),
    index("idx_help_offers_claim").on(table.missionClaimId),
    index("idx_help_offers_helper").on(table.helperHumanId),
  ],
);

export const missionHelpOffersRelations = relations(missionHelpOffers, ({ one }) => ({
  missionClaim: one(missionClaims, {
    fields: [missionHelpOffers.missionClaimId],
    references: [missionClaims.id],
  }),
  helper: one(humans, {
    fields: [missionHelpOffers.helperHumanId],
    references: [humans.id],
  }),
}));
