/**
 * Evidence outcome — the single place where a verification verdict is applied.
 *
 * Three paths reach a verdict (AI vision, peer review, operator review). Each
 * used to update the evidence row and pay the reward on its own, and none of
 * them touched the claim or the mission. As a result a claim stayed "active"
 * forever: the person could submit evidence again and be paid again, their
 * three-mission limit never freed up, missions never completed, and every
 * "missions completed" number on the platform read zero.
 *
 * finalizeEvidence() closes the loop in one transaction:
 *   verified → claim verified, mission completed once all its slots are
 *              verified, the person's completed-mission count incremented
 *   rejected → claim reopened so the person can submit again before the deadline
 * and then (outside the transaction, each step idempotent) pays the reward and
 * updates reputation, streak and the public impact cache.
 */
import {
  evidence,
  humanProfiles,
  missionClaims,
  missions,
  verificationAuditLog,
} from "@betterworld/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";

import { getRedis } from "./container.js";
import { selectPeerReviewers } from "./peer-assignment.js";
import { updateReputation } from "./reputation-engine.js";
import { distributeEvidenceReward } from "./reward-helpers.js";
import { recordActivity } from "./streak-tracker.js";
import { broadcast } from "../ws/feed.js";

const logger = pino({ name: "evidence-outcome" });

export type VerdictSource = "ai" | "peer" | "admin";

export interface EvidenceVerdict {
  evidenceId: string;
  verdict: "verified" | "rejected";
  /** Final confidence, 0..1. The reward scales with it. */
  confidence: number;
  source: VerdictSource;
  reasoning?: string | null;
  decidedByHumanId?: string;
  auditMetadata?: Record<string, unknown>;
  /** Extra evidence columns to set in the same update (e.g. peer verdict fields). */
  evidenceFields?: Partial<typeof evidence.$inferInsert>;
}

export interface EvidenceOutcome {
  /** False when the evidence already had a final verdict and nothing changed. */
  applied: boolean;
  verdict: "verified" | "rejected";
  rewardAmount: number | null;
  claimStatus: string | null;
  missionCompleted: boolean;
}

type Tx = Parameters<Parameters<PostgresJsDatabase["transaction"]>[0]>[0];

interface LockedEvidence {
  id: string;
  mission_id: string;
  claim_id: string;
  submitted_by_human_id: string;
  verification_stage: string;
  photo_sequence_type: string;
  pair_id: string | null;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

async function applyVerified(tx: Tx, row: LockedEvidence): Promise<{ claimStatus: string | null; missionCompleted: boolean }> {
  const transitioned = (await tx.execute(
    sql`UPDATE mission_claims
        SET status = 'verified', completed_at = NOW(), progress_percent = 100, updated_at = NOW()
        WHERE id = ${row.claim_id} AND status IN ('active', 'submitted', 'released')
        RETURNING id`,
  )) as unknown as Array<{ id: string }>;

  if (transitioned.length === 0) {
    // Claim was already verified (or abandoned): nothing further to count.
    const [claim] = await tx
      .select({ status: missionClaims.status })
      .from(missionClaims)
      .where(eq(missionClaims.id, row.claim_id))
      .limit(1);
    return { claimStatus: claim?.status ?? null, missionCompleted: false };
  }

  await tx
    .update(humanProfiles)
    .set({
      totalMissionsCompleted: sql`${humanProfiles.totalMissionsCompleted} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(humanProfiles.humanId, row.submitted_by_human_id));

  // A mission is done when every slot it offers has a verified claim.
  const locked = (await tx.execute(
    sql`SELECT m.max_claims, m.status,
               (SELECT COUNT(*)::int FROM mission_claims c WHERE c.mission_id = m.id AND c.status = 'verified') AS verified_claims
        FROM missions m WHERE m.id = ${row.mission_id} FOR UPDATE`,
  )) as unknown as Array<{ max_claims: number; status: string; verified_claims: number }>;

  const mission = locked[0];
  let missionCompleted = false;
  if (mission && mission.verified_claims >= mission.max_claims && !["verified", "archived"].includes(mission.status)) {
    await tx
      .update(missions)
      .set({ status: "verified", updatedAt: new Date() })
      .where(eq(missions.id, row.mission_id));
    missionCompleted = true;
  }

  return { claimStatus: "verified", missionCompleted };
}

async function applyRejected(tx: Tx, row: LockedEvidence): Promise<{ claimStatus: string | null }> {
  // Give the claim back so the person can try again before their deadline.
  // (The hourly sweep releases claims whose deadline has passed.)
  await tx
    .update(missionClaims)
    .set({ status: "active", updatedAt: new Date() })
    .where(and(eq(missionClaims.id, row.claim_id), eq(missionClaims.status, "submitted")));

  const [claim] = await tx
    .select({ status: missionClaims.status })
    .from(missionClaims)
    .where(eq(missionClaims.id, row.claim_id))
    .limit(1);
  return { claimStatus: claim?.status ?? null };
}

/**
 * Apply a verification verdict to a piece of evidence. Idempotent: a verdict on
 * evidence that is already verified changes nothing and pays nothing.
 */
export async function finalizeEvidence(
  db: PostgresJsDatabase,
  verdict: EvidenceVerdict,
): Promise<EvidenceOutcome> {
  const confidence = clampConfidence(verdict.confidence);

  const txResult = await db.transaction(async (tx) => {
    const lockedRows = (await tx.execute(
      sql`SELECT id, mission_id, claim_id, submitted_by_human_id, verification_stage, photo_sequence_type, pair_id
          FROM evidence WHERE id = ${verdict.evidenceId} FOR UPDATE`,
    )) as unknown as LockedEvidence[];

    const row = lockedRows[0];
    if (!row) return null;

    // Verified is final. A rejection can only be overturned by an operator
    // (appeals put the evidence in "appealed"/"admin_review", not "rejected").
    if (row.verification_stage === "verified") {
      return { row, applied: false, claimStatus: null as string | null, missionCompleted: false };
    }
    if (row.verification_stage === "rejected" && verdict.source !== "admin") {
      return { row, applied: false, claimStatus: null as string | null, missionCompleted: false };
    }

    await tx
      .update(evidence)
      .set({
        ...verdict.evidenceFields,
        verificationStage: verdict.verdict,
        finalVerdict: verdict.verdict,
        finalConfidence: confidence.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(evidence.id, verdict.evidenceId));

    // A before/after pair is judged as one: the "before" photo follows the
    // verdict on the "after" photo. It is never verified or rewarded on its own.
    if (row.pair_id) {
      await tx
        .update(evidence)
        .set({ verificationStage: verdict.verdict, finalVerdict: verdict.verdict, updatedAt: new Date() })
        .where(
          and(
            eq(evidence.pairId, row.pair_id),
            eq(evidence.photoSequenceType, "before"),
            inArray(evidence.verificationStage, ["pending", "ai_processing", "peer_review", "admin_review"]),
          ),
        );
    }

    const result =
      verdict.verdict === "verified"
        ? await applyVerified(tx, row)
        : { ...(await applyRejected(tx, row)), missionCompleted: false };

    await tx.insert(verificationAuditLog).values({
      evidenceId: verdict.evidenceId,
      decisionSource: verdict.source,
      decision: verdict.verdict === "verified" ? "approved" : "rejected",
      score: confidence.toFixed(2),
      reasoning: verdict.reasoning ?? null,
      decidedByHumanId: verdict.decidedByHumanId,
      metadata: {
        ...verdict.auditMetadata,
        claimStatus: result.claimStatus,
        missionCompleted: result.missionCompleted,
      },
    });

    return { row, applied: true, ...result };
  });

  if (!txResult) {
    logger.warn({ evidenceId: verdict.evidenceId }, "Verdict for unknown evidence ignored");
    return { applied: false, verdict: verdict.verdict, rewardAmount: null, claimStatus: null, missionCompleted: false };
  }

  const { row, applied, claimStatus, missionCompleted } = txResult;
  if (!applied) {
    return { applied: false, verdict: verdict.verdict, rewardAmount: null, claimStatus, missionCompleted: false };
  }

  let rewardAmount: number | null = null;

  if (verdict.verdict === "verified") {
    try {
      const reward = await distributeEvidenceReward(db, verdict.evidenceId);
      rewardAmount = reward?.rewardAmount ?? null;
    } catch (err) {
      // The reward is idempotent per evidence id, so it can be re-run safely.
      logger.error(
        { evidenceId: verdict.evidenceId, error: err instanceof Error ? err.message : "Unknown" },
        "Reward distribution failed after verification",
      );
    }

    try {
      await updateReputation(
        db,
        row.submitted_by_human_id,
        verdict.source === "peer" ? "peer_review_verified" : "evidence_verified",
        verdict.evidenceId,
        "evidence",
      );
      await recordActivity(db, row.submitted_by_human_id);
    } catch (err) {
      logger.warn(
        { evidenceId: verdict.evidenceId, error: err instanceof Error ? err.message : "Unknown" },
        "Reputation/streak update failed after verification (non-fatal)",
      );
    }

    // The public impact numbers are cached for an hour; a verified action should show up now.
    try {
      await getRedis()?.del("metrics:aggregate:dashboard");
    } catch {
      // Non-fatal
    }

    broadcast({
      type: "evidence:verified",
      data: {
        evidenceId: verdict.evidenceId,
        missionId: row.mission_id,
        humanId: row.submitted_by_human_id,
        finalConfidence: confidence,
        missionCompleted,
      },
    });
  } else {
    broadcast({
      type: "evidence:rejected",
      data: {
        evidenceId: verdict.evidenceId,
        missionId: row.mission_id,
        humanId: row.submitted_by_human_id,
        reason: verdict.reasoning ?? `Rejected by ${verdict.source} review`,
      },
    });
  }

  logger.info(
    { evidenceId: verdict.evidenceId, verdict: verdict.verdict, source: verdict.source, claimStatus, missionCompleted, rewardAmount },
    "Evidence verdict applied",
  );

  return { applied: true, verdict: verdict.verdict, rewardAmount, claimStatus, missionCompleted };
}

/**
 * Send evidence to human review when the AI cannot decide (not configured,
 * unsure, over budget, or failing).
 *
 * Peer review needs `peer_reviews_needed` independent reviewers. When the
 * community is too small to supply them the evidence goes straight to the
 * operator's queue instead of waiting forever for votes that cannot arrive.
 */
export async function routeEvidenceToHumanReview(
  db: PostgresJsDatabase,
  evidenceId: string,
  reason: string,
): Promise<"peer_review" | "admin_review"> {
  const [row] = await db
    .select({
      submittedByHumanId: evidence.submittedByHumanId,
      peerReviewsNeeded: evidence.peerReviewsNeeded,
    })
    .from(evidence)
    .where(eq(evidence.id, evidenceId))
    .limit(1);

  if (!row) return "admin_review";

  const reviewers = await selectPeerReviewers(
    db,
    row.submittedByHumanId,
    row.peerReviewsNeeded,
    row.peerReviewsNeeded,
  );
  const stage = reviewers.length >= row.peerReviewsNeeded ? "peer_review" : "admin_review";

  await db
    .update(evidence)
    .set({ verificationStage: stage, updatedAt: new Date() })
    .where(
      and(
        eq(evidence.id, evidenceId),
        inArray(evidence.verificationStage, ["pending", "ai_processing", "peer_review"]),
      ),
    );

  await db.insert(verificationAuditLog).values({
    evidenceId,
    decisionSource: "system",
    decision: "escalated",
    reasoning: reason,
    metadata: {
      routedTo: stage,
      eligibleReviewers: reviewers.length,
      reviewersNeeded: row.peerReviewsNeeded,
    },
  });

  logger.info({ evidenceId, stage, reason, eligibleReviewers: reviewers.length }, "Evidence routed to human review");
  return stage;
}

/** Peer reviews that have waited this long without a verdict go to the operator. */
const PEER_REVIEW_MAX_WAIT_HOURS = parseInt(process.env.PEER_REVIEW_MAX_WAIT_HOURS || "72", 10);

/**
 * Escalate evidence stuck in peer review to the operator's queue.
 * Run periodically by the housekeeping sweep.
 */
export async function escalateStalePeerReviews(db: PostgresJsDatabase): Promise<number> {
  const cutoff = new Date(Date.now() - PEER_REVIEW_MAX_WAIT_HOURS * 3600 * 1000);

  const escalated = (await db.execute(
    sql`UPDATE evidence
        SET verification_stage = 'admin_review', updated_at = NOW()
        WHERE verification_stage = 'peer_review' AND updated_at < ${cutoff}
        RETURNING id`,
  )) as unknown as Array<{ id: string }>;

  for (const { id } of escalated) {
    await db.insert(verificationAuditLog).values({
      evidenceId: id,
      decisionSource: "system",
      decision: "escalated",
      reasoning: `No peer verdict after ${PEER_REVIEW_MAX_WAIT_HOURS} hours`,
      metadata: { routedTo: "admin_review", trigger: "peer_review_timeout" },
    });
  }

  if (escalated.length > 0) {
    logger.info({ count: escalated.length }, "Stale peer reviews escalated to operator review");
  }
  return escalated.length;
}
