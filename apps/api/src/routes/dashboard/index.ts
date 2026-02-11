/**
 * Dashboard Route (Sprint 6 - Phase 7: User Story 5)
 *
 * Uses humans.tokenBalance as authoritative balance source.
 */

import { parsePostGISPoint } from "@betterworld/shared/utils/geocode";
import { calculateProfileCompleteness, type ProfileInput } from "@betterworld/shared/utils/profileCompleteness";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { humanAuth } from "../../middleware/humanAuth";
import { logger } from "../../middleware/logger.js";

const app = new Hono<AppEnv>();

// GET /dashboard - Get Dashboard Data (T079)
app.get("/", humanAuth(), async (c) => {
  const human = c.get("human");

  try {
    const { getDb } = await import("../../lib/container.js");
    const db = getDb();
    if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE" as const, message: "Database not available" }, requestId: c.get("requestId") }, 503);

    const { eq, desc, sql } = await import("drizzle-orm");
    const { humans, humanProfiles, tokenTransactions } = await import("@betterworld/db");

    const [userResult, profileResult, spentResult] = await Promise.all([
      db.select({
        id: humans.id,
        email: humans.email,
        displayName: humans.displayName,
        avatarUrl: humans.avatarUrl,
        emailVerified: humans.emailVerified,
        reputationScore: humans.reputationScore,
        tokenBalance: humans.tokenBalance,
      }).from(humans).where(eq(humans.id, human.id)).limit(1),
      db.select().from(humanProfiles).where(eq(humanProfiles.humanId, human.id)).limit(1),
      db.select({ total: sql<number>`COALESCE(SUM(ABS(${tokenTransactions.amount})), 0)` })
        .from(tokenTransactions)
        .where(sql`${tokenTransactions.humanId} = ${human.id} AND ${tokenTransactions.amount} < 0`),
    ]);
    const [user] = userResult;
    const [profile] = profileResult;

    if (!user) {
      return c.json(
        { ok: false, error: { code: "USER_NOT_FOUND" as const, message: "User not found" }, requestId: c.get("requestId") },
        404,
      );
    }

    // Use authoritative balance from humans table
    const balance = parseInt((user.tokenBalance || "0").toString(), 10);
    const totalEarned = profile?.totalTokensEarned || 0;

    const totalSpent = Number(spentResult[0]?.total || 0);

    let completeness: { score: number; suggestions: string[] } = { score: 0, suggestions: [] };
    if (profile) {
      const coords = profile.location ? parsePostGISPoint(profile.location) : null;
      const lat = coords?.lat ?? null;
      const lng = coords?.lng ?? null;

      completeness = calculateProfileCompleteness({
        skills: profile.skills,
        city: profile.city,
        country: profile.country,
        latitude: lat,
        longitude: lng,
        languages: profile.languages,
        availability: profile.availability as ProfileInput["availability"],
        bio: profile.bio,
        avatarUrl: user.avatarUrl,
        walletAddress: profile.walletAddress,
        certifications: profile.certifications,
      });
    }

    const recentActivity = await db
      .select()
      .from(tokenTransactions)
      .where(eq(tokenTransactions.humanId, human.id))
      .orderBy(desc(tokenTransactions.createdAt))
      .limit(10);

    return c.json({
      ok: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          emailVerified: user.emailVerified,
        },
        tokens: { balance, totalEarned, totalSpent },
        reputation: {
          score: parseFloat(user.reputationScore),
          rank: null,
          percentile: null,
        },
        profile: {
          completenessScore: completeness.score,
          suggestions: completeness.suggestions,
          orientationCompleted: !!profile?.orientationCompletedAt,
        },
        missions: {
          active: 0,
          completed: profile?.totalMissionsCompleted || 0,
          streakDays: profile?.streakDays || 0,
        },
        recentActivity: recentActivity.map((tx) => ({
          id: tx.id,
          type: tx.amount > 0 ? ("token_earned" as const) : ("token_spent" as const),
          description: tx.description || "",
          amount: Math.abs(tx.amount),
          timestamp: tx.createdAt,
        })),
      },
      requestId: c.get("requestId"),
    });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : "Unknown" }, "Dashboard fetch failed");
    return c.json(
      { ok: false, error: { code: "INTERNAL_ERROR" as const, message: "Failed to fetch dashboard" }, requestId: c.get("requestId") },
      500,
    );
  }
});

export default app;
