/**
 * Peer Review Assignment Algorithm (Sprint 8: Evidence Verification)
 *
 * Stranger-only selection with 2-hop transitive exclusion via review_history table.
 */

import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pino from "pino";

const logger = pino({ name: "peer-assignment" });

/**
 * Select up to `count` reviewer candidates who are strangers to the submitter.
 *
 * Exclusion rules:
 * 1. Cannot be the submitter themselves
 * 2. Cannot be anyone who has reviewed the submitter before (or been reviewed by them)
 * 3. Cannot be 2-hop transitive connections
 *
 * Returns reviewer human IDs ordered randomly.
 * If fewer than `minRequired` eligible reviewers, returns empty array (escalate to admin).
 */
export async function selectPeerReviewers(
  db: PostgresJsDatabase,
  submitterHumanId: string,
  count: number = 3,
  minRequired: number = 2,
): Promise<string[]> {
  try {
    // Use raw SQL for the complex exclusion query
    const result = await db.execute(
      sql`
        SELECT h.id FROM humans h
        WHERE h.id != ${submitterHumanId}
          AND h.is_active = true
          AND h.id NOT IN (
            -- Direct: anyone who reviewed submitter or was reviewed by submitter
            SELECT reviewer_human_id FROM review_history WHERE submitter_human_id = ${submitterHumanId}
            UNION
            SELECT submitter_human_id FROM review_history WHERE reviewer_human_id = ${submitterHumanId}
            UNION
            -- 2-hop: if A->B exists and B->submitter exists, exclude A
            SELECT rh1.reviewer_human_id FROM review_history rh1
            JOIN review_history rh2 ON rh1.submitter_human_id = rh2.reviewer_human_id
            WHERE rh2.submitter_human_id = ${submitterHumanId}
            UNION
            -- 2-hop reverse: if submitter->B exists and B->A exists, exclude A
            SELECT rh2.submitter_human_id FROM review_history rh1
            JOIN review_history rh2 ON rh1.reviewer_human_id = rh2.submitter_human_id
            WHERE rh1.submitter_human_id = ${submitterHumanId}
          )
        ORDER BY RANDOM()
        LIMIT ${count}
      `,
    );

    const reviewerIds = (result as unknown as Array<{ id: string }>).map((r) => r.id);

    if (reviewerIds.length < minRequired) {
      logger.warn(
        { submitterHumanId, found: reviewerIds.length, minRequired },
        "Insufficient eligible reviewers - escalate to admin review",
      );
      return [];
    }

    return reviewerIds;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown", submitterHumanId },
      "Peer assignment query failed",
    );
    return [];
  }
}
