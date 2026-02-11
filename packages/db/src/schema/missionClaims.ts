import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { missionClaimStatusEnum } from "./enums";
import { humans } from "./humans";
import { missions } from "./missions";

export const missionClaims = pgTable(
  "mission_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "restrict" }),
    humanId: uuid("human_id")
      .notNull()
      .references(() => humans.id, { onDelete: "restrict" }),
    status: missionClaimStatusEnum("status").notNull().default("active"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    progressPercent: integer("progress_percent").default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_claims_mission_id").on(table.missionId),
    index("idx_claims_human_id").on(table.humanId),
    index("idx_claims_status").on(table.status),
    index("idx_claims_deadline").on(table.deadlineAt),
    check(
      "progress_percent_range",
      sql`${table.progressPercent} BETWEEN 0 AND 100`,
    ),
  ],
);

export const missionClaimsRelations = relations(missionClaims, ({ one }) => ({
  mission: one(missions, {
    fields: [missionClaims.missionId],
    references: [missions.id],
  }),
  human: one(humans, {
    fields: [missionClaims.humanId],
    references: [humans.id],
  }),
}));
