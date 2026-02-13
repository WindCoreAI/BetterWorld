import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  evidenceTypeEnum,
  evidenceVerificationStageEnum,
  photoSequenceTypeEnum,
} from "./enums";
import { humans } from "./humans";
import { missionClaims } from "./missionClaims";
import { missions } from "./missions";
import { tokenTransactions } from "./tokenTransactions";

export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "restrict" }),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => missionClaims.id, { onDelete: "restrict" }),
    submittedByHumanId: uuid("submitted_by_human_id")
      .notNull()
      .references(() => humans.id, { onDelete: "restrict" }),
    evidenceType: evidenceTypeEnum("evidence_type").notNull(),
    contentUrl: text("content_url"),
    textContent: text("text_content"),
    thumbnailUrl: text("thumbnail_url"),
    mediumUrl: text("medium_url"),
    latitude: decimal("latitude", { precision: 10, scale: 7 }),
    longitude: decimal("longitude", { precision: 10, scale: 7 }),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    exifData: jsonb("exif_data"),
    fileSize: integer("file_size"),
    mimeType: varchar("mime_type", { length: 100 }),
    aiVerificationScore: decimal("ai_verification_score", {
      precision: 3,
      scale: 2,
    }),
    aiVerificationReasoning: text("ai_verification_reasoning"),
    verificationStage: evidenceVerificationStageEnum("verification_stage")
      .notNull()
      .default("pending"),
    peerReviewCount: integer("peer_review_count").notNull().default(0),
    peerReviewsNeeded: integer("peer_reviews_needed").notNull().default(3),
    peerVerdict: varchar("peer_verdict", { length: 20 }),
    peerAverageConfidence: decimal("peer_average_confidence", {
      precision: 3,
      scale: 2,
    }),
    finalVerdict: varchar("final_verdict", { length: 20 }),
    finalConfidence: decimal("final_confidence", {
      precision: 3,
      scale: 2,
    }),
    rewardTransactionId: uuid("reward_transaction_id").references(
      () => tokenTransactions.id,
    ),
    isHoneypotSubmission: boolean("is_honeypot_submission")
      .notNull()
      .default(false),
    // Sprint 12: Before/after photo pairs
    pairId: uuid("pair_id"),
    photoSequenceType: photoSequenceTypeEnum("photo_sequence_type")
      .notNull()
      .default("standalone"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_evidence_mission_id").on(table.missionId),
    index("idx_evidence_claim_id").on(table.claimId),
    index("idx_evidence_human_id").on(table.submittedByHumanId),
    index("idx_evidence_stage").on(table.verificationStage),
    index("idx_evidence_pending").on(table.verificationStage, table.createdAt),
    index("idx_evidence_peer_review").on(table.verificationStage, table.createdAt),
    check(
      "ai_score_range",
      sql`${table.aiVerificationScore} IS NULL OR (${table.aiVerificationScore} >= 0 AND ${table.aiVerificationScore} <= 1)`,
    ),
    check("peer_count_non_negative", sql`${table.peerReviewCount} >= 0`),
    check("peer_needed_positive", sql`${table.peerReviewsNeeded} >= 1`),
    check(
      "has_content",
      sql`${table.contentUrl} IS NOT NULL OR ${table.textContent} IS NOT NULL`,
    ),
    // Sprint 12: pair index for before/after queries
    index("evidence_pair_idx")
      .on(table.pairId)
      .where(sql`pair_id IS NOT NULL`),
  ],
);

export const evidenceRelations = relations(evidence, ({ one }) => ({
  mission: one(missions, {
    fields: [evidence.missionId],
    references: [missions.id],
  }),
  claim: one(missionClaims, {
    fields: [evidence.claimId],
    references: [missionClaims.id],
  }),
  submittedBy: one(humans, {
    fields: [evidence.submittedByHumanId],
    references: [humans.id],
  }),
  rewardTransaction: one(tokenTransactions, {
    fields: [evidence.rewardTransactionId],
    references: [tokenTransactions.id],
  }),
}));
