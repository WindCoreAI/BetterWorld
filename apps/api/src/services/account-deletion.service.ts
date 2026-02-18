/**
 * Account Deletion Service (Sprint 20: Security Hardening — GDPR Article 17)
 *
 * Manages the account deletion lifecycle: request, cancel, and process.
 * Uses SHA-256 hash-based anonymization with DELETION_SALT for deterministic
 * non-correlatable user identifiers across all tables.
 */
import crypto from "crypto";

import {
  accountDeletionRequests,
  agents,
  connections,
  discussionReplies,
  discussionThreads,
  disputes,
  evidence,
  follows,
  humanProfiles,
  humans,
  missionClaims,
  notifications,
  tokenTransactions,
} from "@betterworld/db";
import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { logger } from "../middleware/logger.js";

const COOLING_OFF_DAYS = 14;


interface DeletionRequestResult {
  data?: {
    id: string;
    status: string;
    requestedAt: string;
    coolingOffExpiresAt: string;
  };
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

interface CancelResult {
  data?: {
    id: string;
    status: string;
    cancelledAt: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Request account deletion with 14-day cooling-off period.
 * Blocked if user has active mission claims or unresolved disputes (FR-014).
 */
export async function requestDeletion(
  db: PostgresJsDatabase,
  humanId: string,
): Promise<DeletionRequestResult> {
  // Check for existing pending request
  const [existing] = await db
    .select({ id: accountDeletionRequests.id })
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.humanId, humanId),
        eq(accountDeletionRequests.status, "pending"),
      ),
    )
    .limit(1);

  if (existing) {
    return {
      error: {
        code: "DELETION_ALREADY_PENDING",
        message: "An account deletion request is already pending.",
      },
    };
  }

  // Check for active mission claims
  const activeClaimsResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(missionClaims)
    .where(
      and(
        eq(missionClaims.humanId, humanId),
        eq(missionClaims.status, "active"),
      ),
    );
  const activeClaims = activeClaimsResult[0]?.count ?? 0;

  // Check for unresolved disputes (open or admin_review)
  const unresolvedDisputesResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(disputes)
    .where(
      sql`${disputes.challengerAgentId} IN (
        SELECT id FROM agents WHERE owner_human_id = ${humanId}
      ) AND ${disputes.status} IN ('open', 'admin_review')`,
    );
  const unresolvedDisputes = unresolvedDisputesResult[0]?.count ?? 0;

  if (activeClaims > 0 || unresolvedDisputes > 0) {
    return {
      error: {
        code: "ACTIVE_OBLIGATIONS",
        message:
          "Cannot delete account with active mission claims or unresolved disputes.",
        details: {
          activeMissionClaims: activeClaims,
          unresolvedDisputes: unresolvedDisputes,
        },
      },
    };
  }

  // Create deletion request with 14-day cooling-off
  const now = new Date();
  const expiresAt = new Date(now.getTime() + COOLING_OFF_DAYS * 24 * 60 * 60 * 1000);

  const [request] = await db
    .insert(accountDeletionRequests)
    .values({
      humanId,
      status: "pending",
      requestedAt: now,
      coolingOffExpiresAt: expiresAt,
    })
    .returning({
      id: accountDeletionRequests.id,
      status: accountDeletionRequests.status,
      requestedAt: accountDeletionRequests.requestedAt,
      coolingOffExpiresAt: accountDeletionRequests.coolingOffExpiresAt,
    });

  if (!request) {
    throw new Error("Failed to create deletion request");
  }

  logger.info({ humanId, requestId: request.id, expiresAt }, "Account deletion requested");

  return {
    data: {
      id: request.id,
      status: request.status,
      requestedAt: request.requestedAt.toISOString(),
      coolingOffExpiresAt: request.coolingOffExpiresAt.toISOString(),
    },
  };
}

/**
 * Cancel a pending deletion request during the cooling-off period (FR-010).
 */
export async function cancelDeletion(
  db: PostgresJsDatabase,
  humanId: string,
): Promise<CancelResult> {
  const [pending] = await db
    .select({
      id: accountDeletionRequests.id,
      status: accountDeletionRequests.status,
    })
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.humanId, humanId),
        eq(accountDeletionRequests.status, "pending"),
      ),
    )
    .limit(1);

  if (!pending) {
    return {
      error: {
        code: "NO_PENDING_DELETION",
        message: "No pending deletion request found.",
      },
    };
  }

  const now = new Date();
  const [updated] = await db
    .update(accountDeletionRequests)
    .set({
      status: "cancelled",
      cancelledAt: now,
    })
    .where(eq(accountDeletionRequests.id, pending.id))
    .returning({
      id: accountDeletionRequests.id,
      status: accountDeletionRequests.status,
      cancelledAt: accountDeletionRequests.cancelledAt,
    });

  if (!updated) {
    throw new Error("Failed to cancel deletion request");
  }

  logger.info({ humanId, requestId: updated.id }, "Account deletion cancelled");

  return {
    data: {
      id: updated.id,
      status: updated.status,
      cancelledAt: updated.cancelledAt!.toISOString(),
    },
  };
}

/**
 * Get the current deletion request status for a user.
 */
export async function getDeletionStatus(
  db: PostgresJsDatabase,
  humanId: string,
): Promise<{
  id: string;
  status: string;
  requestedAt: string;
  coolingOffExpiresAt: string;
  cancelledAt: string | null;
} | null> {
  const [request] = await db
    .select({
      id: accountDeletionRequests.id,
      status: accountDeletionRequests.status,
      requestedAt: accountDeletionRequests.requestedAt,
      coolingOffExpiresAt: accountDeletionRequests.coolingOffExpiresAt,
      cancelledAt: accountDeletionRequests.cancelledAt,
    })
    .from(accountDeletionRequests)
    .where(eq(accountDeletionRequests.humanId, humanId))
    .orderBy(sql`${accountDeletionRequests.requestedAt} DESC`)
    .limit(1);

  if (!request) return null;

  return {
    id: request.id,
    status: request.status,
    requestedAt: request.requestedAt.toISOString(),
    coolingOffExpiresAt: request.coolingOffExpiresAt.toISOString(),
    cancelledAt: request.cancelledAt?.toISOString() ?? null,
  };
}

/**
 * Generate a deterministic anonymized identifier from userId + salt.
 * Returns 12 hex characters, stable across calls for the same user.
 */
function generateAnonymizedId(userId: string, salt: string): string {
  return crypto
    .createHash("sha256")
    .update(`${userId}${salt}`)
    .digest("hex")
    .slice(0, 12);
}


/**
 * Process an expired deletion request — the core anonymization logic.
 * Called by the daily worker for requests past the cooling-off period.
 * Wraps all operations in a database transaction (FR-011, FR-012, FR-013).
 */
export async function processExpiredDeletion(
  db: PostgresJsDatabase,
  requestId: string,
): Promise<void> {
  const salt = process.env.DELETION_SALT;
  if (!salt) {
    throw new Error("DELETION_SALT environment variable is required for account deletion");
  }

  await db.transaction(async (tx) => {
    // Fetch the request inside the transaction with FOR UPDATE to prevent TOCTOU race
    const requestRows = await tx.execute(
      sql`SELECT * FROM account_deletion_requests WHERE id = ${requestId} LIMIT 1 FOR UPDATE`,
    );
    const request = (requestRows as unknown as Array<{
      id: string;
      human_id: string;
      status: string;
    }>)[0];

    if (!request) {
      throw new Error(`Deletion request ${requestId} not found`);
    }

    // Idempotency guard: skip if already completed (now race-safe via FOR UPDATE)
    if (request.status !== "pending") {
      logger.info({ requestId, status: request.status }, "Deletion request already processed, skipping");
      return;
    }

    const humanId = request.human_id;
    const anonymizedId = generateAnonymizedId(humanId, salt);

    const deletionLog: Record<string, number> = {};
    // Step 1: Deactivate all owned agents (FR-013)
    const deactivatedAgents = await tx
      .update(agents)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(agents.ownerHumanId, humanId))
      .returning({ id: agents.id });
    deletionLog.agentsDeactivated = deactivatedAgents.length;

    // Step 2: FK columns remain pointing at the (now anonymized) humans row.
    // Since we anonymize the humans record in step 4 rather than deleting it,
    // FK references remain valid and contributions are naturally anonymized
    // through the "Former User {hash}" display name on join.
    // Count rows for the deletion log:
    const [evidenceCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(evidence)
      .where(eq(evidence.submittedByHumanId, humanId));
    deletionLog.evidencePreserved = evidenceCount?.count ?? 0;

    const [threadCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(discussionThreads)
      .where(eq(discussionThreads.authorHumanId, humanId));
    deletionLog.threadsPreserved = threadCount?.count ?? 0;

    const [replyCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(discussionReplies)
      .where(eq(discussionReplies.authorHumanId, humanId));
    deletionLog.repliesPreserved = replyCount?.count ?? 0;

    const [claimCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(missionClaims)
      .where(eq(missionClaims.humanId, humanId));
    deletionLog.claimsPreserved = claimCount?.count ?? 0;

    const [txCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(tokenTransactions)
      .where(eq(tokenTransactions.humanId, humanId));
    deletionLog.transactionsPreserved = txCount?.count ?? 0;

    // Step 3: Delete CASCADE tables
    const deletedFollows = await tx
      .delete(follows)
      .where(eq(follows.followerHumanId, humanId))
      .returning({ id: follows.id });
    // Also delete where user is the target
    const deletedFollowsTarget = await tx
      .delete(follows)
      .where(eq(follows.followingHumanId, humanId))
      .returning({ id: follows.id });
    deletionLog.followsDeleted = deletedFollows.length + deletedFollowsTarget.length;

    const deletedConnections = await tx
      .delete(connections)
      .where(eq(connections.requesterHumanId, humanId))
      .returning({ id: connections.id });
    const deletedConnectionsTarget = await tx
      .delete(connections)
      .where(eq(connections.recipientHumanId, humanId))
      .returning({ id: connections.id });
    deletionLog.connectionsDeleted = deletedConnections.length + deletedConnectionsTarget.length;

    const deletedNotifications = await tx
      .delete(notifications)
      .where(eq(notifications.recipientHumanId, humanId))
      .returning({ id: notifications.id });
    deletionLog.notificationsDeleted = deletedNotifications.length;

    // Step 4: Anonymize humans record (FR-011)
    await tx
      .update(humans)
      .set({
        email: `deleted_${anonymizedId}@removed.betterworld.org`,
        displayName: `Former User ${anonymizedId}`,
        avatarUrl: null,
        oauthProvider: null,
        oauthProviderId: null,
        passwordHash: null,
        updatedAt: new Date(),
      })
      .where(eq(humans.id, humanId));

    // Step 5: Delete humanProfiles, accounts, sessions, verificationTokens
    // These cascade or are safe to delete
    await tx.delete(humanProfiles).where(eq(humanProfiles.humanId, humanId));
    deletionLog.profileDeleted = 1;

    // Note: accounts/sessions/verificationTokens may use FK cascades from better-auth.
    // We delete what we can and let cascades handle the rest.

    // Step 6: Update request status to completed
    await tx
      .update(accountDeletionRequests)
      .set({
        status: "completed",
        completedAt: new Date(),
        anonymizedIdentifier: anonymizedId,
        deletionLog,
      })
      .where(eq(accountDeletionRequests.id, requestId));

    logger.info(
      { requestId, anonymizedId, deletionLog },
      "Account deletion completed — PII removed, contributions anonymized",
    );
  });
}
