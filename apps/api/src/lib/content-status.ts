/**
 * Guardrail status transitions for every moderated content type.
 *
 * One place that knows which table a content type lives in, shared by the
 * guardrail worker (automatic verdicts) and the admin review routes (human
 * verdicts). Before this existed the admin review route only knew problems,
 * solutions and debates, so a flagged mission could never be approved.
 */
import {
  circlePosts,
  debates,
  discussionReplies,
  discussionThreads,
  flaggedContent,
  guardrailEvaluations,
  missionHelpOffers,
  missions,
  problems,
  solutions,
} from "@betterworld/db";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

// A database handle or an open transaction — both expose the same query API.
export type DbOrTx =
  | PostgresJsDatabase
  | Parameters<Parameters<PostgresJsDatabase["transaction"]>[0]>[0];

export type GuardrailContentStatus = "approved" | "rejected" | "flagged";

/**
 * Set guardrail_status on the row behind (contentType, contentId).
 * Returns false for content types that carry no status column of their own.
 */
export async function updateContentStatus(
  db: DbOrTx,
  contentId: string,
  contentType: string,
  status: GuardrailContentStatus,
): Promise<boolean> {
  switch (contentType) {
    case "problem":
      await db.update(problems).set({ guardrailStatus: status }).where(eq(problems.id, contentId));
      return true;
    case "solution":
    case "human_solution":
      await db.update(solutions).set({ guardrailStatus: status }).where(eq(solutions.id, contentId));
      return true;
    case "debate":
      await db.update(debates).set({ guardrailStatus: status }).where(eq(debates.id, contentId));
      return true;
    case "mission":
    case "human_mission_proposal":
      await db.update(missions).set({ guardrailStatus: status }).where(eq(missions.id, contentId));
      return true;
    case "discussion_thread":
      await db
        .update(discussionThreads)
        .set({ guardrailStatus: status })
        .where(eq(discussionThreads.id, contentId));
      return true;
    case "discussion_reply":
      await db
        .update(discussionReplies)
        .set({ guardrailStatus: status })
        .where(eq(discussionReplies.id, contentId));
      return true;
    case "circle_post":
      await db.update(circlePosts).set({ guardrailStatus: status }).where(eq(circlePosts.id, contentId));
      return true;
    case "help_offer_message":
      await db
        .update(missionHelpOffers)
        .set({ guardrailStatus: status })
        .where(eq(missionHelpOffers.id, contentId));
      return true;
    case "help_request_note":
    case "gratitude_narrative":
      // Stored inline on another row; the calling route owns the status.
      return false;
    default:
      return false;
  }
}

export interface FlagForReviewParams {
  evaluationId: string;
  contentId: string;
  contentType: string;
  agentId: string;
}

/**
 * Put a piece of content in front of a human: mark it flagged and make sure it
 * has exactly one open entry in the admin review queue. Safe to call twice.
 */
export async function flagForHumanReview(db: DbOrTx, params: FlagForReviewParams): Promise<void> {
  await updateContentStatus(db, params.contentId, params.contentType, "flagged");
  await db
    .insert(flaggedContent)
    .values({
      evaluationId: params.evaluationId,
      contentId: params.contentId,
      contentType: params.contentType as typeof flaggedContent.$inferInsert.contentType,
      agentId: params.agentId,
      status: "pending_review",
    })
    .onConflictDoNothing({ target: flaggedContent.evaluationId });
}

/**
 * Record a human reviewer's verdict as the final decision of the evaluation.
 *
 * The evaluation row keeps what the automatic layers produced (layer A/B
 * results, score); final_decision becomes what actually happened to the
 * content. This is what lets human approvals count toward an agent's track
 * record and makes GET /guardrails/status/:id tell the truth after review.
 */
export async function recordHumanDecision(
  db: DbOrTx,
  evaluationId: string,
  decision: "approved" | "rejected",
): Promise<void> {
  await db
    .update(guardrailEvaluations)
    .set({ finalDecision: decision, completedAt: new Date() })
    .where(eq(guardrailEvaluations.id, evaluationId));
}
