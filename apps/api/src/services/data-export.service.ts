/**
 * Data Export Service (Sprint 20: Security Hardening — GDPR Article 15)
 *
 * Aggregates all personal data for a user across 11 data categories.
 * Excludes sensitive fields: passwordHash, apiKeyHash, EXIF data.
 */
import {
  agents,
  connections,
  discussionReplies,
  discussionThreads,
  evidence,
  follows,
  humanProfiles,
  humans,
  missionClaims,
  notifications,
  tokenTransactions,
} from "@betterworld/db";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { logger } from "../middleware/logger.js";

export interface DataExportResult {
  exportedAt: string;
  categories: {
    profile: Record<string, unknown> | null;
    humanProfile: Record<string, unknown> | null;
    tokenTransactions: Record<string, unknown>[];
    missionClaims: Record<string, unknown>[];
    evidence: Record<string, unknown>[];
    follows: Record<string, unknown>[];
    connections: Record<string, unknown>[];
    notifications: Record<string, unknown>[];
    discussionThreads: Record<string, unknown>[];
    discussionReplies: Record<string, unknown>[];
    agents: Record<string, unknown>[];
  };
}

/**
 * Export all personal data for a user (GDPR Article 15 data portability).
 * Returns structured JSON with data from 11 categories.
 * Excludes: passwordHash, apiKeyHash, internal EXIF data.
 */
export async function exportUserData(
  db: PostgresJsDatabase,
  humanId: string,
): Promise<DataExportResult> {
  const startTime = Date.now();

  // 1. Profile data (exclude passwordHash)
  const [profileRow] = await db
    .select({
      id: humans.id,
      email: humans.email,
      displayName: humans.displayName,
      role: humans.role,
      reputationScore: humans.reputationScore,
      tokenBalance: humans.tokenBalance,
      oauthProvider: humans.oauthProvider,
      avatarUrl: humans.avatarUrl,
      emailVerified: humans.emailVerified,
      emailVerifiedAt: humans.emailVerifiedAt,
      portfolioVisibility: humans.portfolioVisibility,
      createdAt: humans.createdAt,
      updatedAt: humans.updatedAt,
      isActive: humans.isActive,
    })
    .from(humans)
    .where(eq(humans.id, humanId))
    .limit(1);

  // 2. Human profile data
  const [humanProfileRow] = await db
    .select()
    .from(humanProfiles)
    .where(eq(humanProfiles.humanId, humanId))
    .limit(1);

  // 3. Token transactions
  const tokenTxRows = await db
    .select()
    .from(tokenTransactions)
    .where(eq(tokenTransactions.humanId, humanId));

  // 4. Mission claims
  const missionClaimRows = await db
    .select()
    .from(missionClaims)
    .where(eq(missionClaims.humanId, humanId));

  // 5. Evidence (exclude EXIF data, include URLs)
  const evidenceRows = await db
    .select({
      id: evidence.id,
      missionId: evidence.missionId,
      evidenceType: evidence.evidenceType,
      contentUrl: evidence.contentUrl,
      textContent: evidence.textContent,
      latitude: evidence.latitude,
      longitude: evidence.longitude,
      capturedAt: evidence.capturedAt,
      verificationStage: evidence.verificationStage,
      aiVerificationScore: evidence.aiVerificationScore,
      finalVerdict: evidence.finalVerdict,
      finalConfidence: evidence.finalConfidence,
      createdAt: evidence.createdAt,
      updatedAt: evidence.updatedAt,
    })
    .from(evidence)
    .where(eq(evidence.submittedByHumanId, humanId));

  // 6. Follows
  const followRows = await db
    .select()
    .from(follows)
    .where(eq(follows.followerHumanId, humanId));

  // 7. Connections
  const connectionRows = await db
    .select()
    .from(connections)
    .where(eq(connections.requesterHumanId, humanId));

  // 8. Notifications
  const notificationRows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.recipientHumanId, humanId));

  // 9. Discussion threads
  const threadRows = await db
    .select()
    .from(discussionThreads)
    .where(eq(discussionThreads.authorHumanId, humanId));

  // 10. Discussion replies
  const replyRows = await db
    .select()
    .from(discussionReplies)
    .where(eq(discussionReplies.authorHumanId, humanId));

  // 11. Owned agents (exclude apiKeyHash)
  const agentRows = await db
    .select({
      id: agents.id,
      username: agents.username,
      framework: agents.framework,
      specializations: agents.specializations,
      isActive: agents.isActive,
      claimStatus: agents.claimStatus,
      createdAt: agents.createdAt,
      updatedAt: agents.updatedAt,
    })
    .from(agents)
    .where(eq(agents.ownerHumanId, humanId));

  const durationMs = Date.now() - startTime;
  logger.info(
    {
      humanId,
      durationMs,
      categories: {
        tokenTransactions: tokenTxRows.length,
        missionClaims: missionClaimRows.length,
        evidence: evidenceRows.length,
        follows: followRows.length,
        connections: connectionRows.length,
        notifications: notificationRows.length,
        discussionThreads: threadRows.length,
        discussionReplies: replyRows.length,
        agents: agentRows.length,
      },
    },
    "GDPR data export completed",
  );

  return {
    exportedAt: new Date().toISOString(),
    categories: {
      profile: profileRow ?? null,
      humanProfile: humanProfileRow ?? null,
      tokenTransactions: tokenTxRows,
      missionClaims: missionClaimRows,
      evidence: evidenceRows,
      follows: followRows,
      connections: connectionRows,
      notifications: notificationRows,
      discussionThreads: threadRows,
      discussionReplies: replyRows,
      agents: agentRows,
    },
  };
}
