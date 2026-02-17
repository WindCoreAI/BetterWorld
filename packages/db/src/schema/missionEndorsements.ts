/**
 * Mission Endorsements Table (Sprint 18: Cooperative Depth & Governance)
 *
 * Tracks endorsements for human-proposed missions (3+ required for activation).
 */
import { relations } from "drizzle-orm";
import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { humans } from "./humans";
import { missions } from "./missions";

export const missionEndorsements = pgTable(
  "mission_endorsements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    humanId: uuid("human_id")
      .notNull()
      .references(() => humans.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_mission_endorsements_unique").on(
      table.missionId,
      table.humanId,
    ),
    index("idx_mission_endorsements_mission").on(table.missionId),
  ],
);

export const missionEndorsementsRelations = relations(
  missionEndorsements,
  ({ one }) => ({
    mission: one(missions, {
      fields: [missionEndorsements.missionId],
      references: [missions.id],
    }),
    human: one(humans, {
      fields: [missionEndorsements.humanId],
      references: [humans.id],
    }),
  }),
);
