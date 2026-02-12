import { relations } from "drizzle-orm";
import {
  decimal,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { observationTypeEnum, observationVerificationEnum } from "./enums";
import { humans } from "./humans";
import { problems } from "./problems";
import { geographyPoint } from "./types";

export const observations = pgTable(
  "observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    problemId: uuid("problem_id").references(() => problems.id, {
      onDelete: "restrict",
    }),
    observationType: observationTypeEnum("observation_type").notNull(),
    mediaUrl: text("media_url"),
    thumbnailUrl: text("thumbnail_url"),
    caption: varchar("caption", { length: 500 }).notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    gpsLat: decimal("gps_lat", { precision: 10, scale: 7 }),
    gpsLng: decimal("gps_lng", { precision: 10, scale: 7 }),
    gpsAccuracyMeters: integer("gps_accuracy_meters"),
    locationPoint: geographyPoint("location_point"),
    submittedByHumanId: uuid("submitted_by_human_id")
      .notNull()
      .references(() => humans.id, { onDelete: "restrict" }),
    verificationStatus: observationVerificationEnum("verification_status")
      .notNull()
      .default("pending"),
    verificationNotes: text("verification_notes"),
    perceptualHash: varchar("perceptual_hash", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("observations_problem_id_idx").on(table.problemId),
    index("observations_human_id_idx").on(table.submittedByHumanId),
    index("observations_verification_idx").on(table.verificationStatus),
    index("observations_created_at_idx").on(table.createdAt),
  ],
);

export const observationsRelations = relations(observations, ({ one }) => ({
  problem: one(problems, {
    fields: [observations.problemId],
    references: [problems.id],
  }),
  submittedBy: one(humans, {
    fields: [observations.submittedByHumanId],
    references: [humans.id],
  }),
}));
