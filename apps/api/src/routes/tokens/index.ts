/**
 * Token Routes (Sprint 6 - Phase 5 & 6: Tokens & Economy)
 *
 * Uses humans.tokenBalance as source of truth for balance (double-entry accounting).
 */

import crypto from "crypto";

import { SpendTokensSchema } from "@betterworld/shared/schemas/human";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { humanAuth } from "../../middleware/humanAuth";
import { logger } from "../../middleware/logger.js";

const app = new Hono<AppEnv>();

// POST /tokens/orientation-reward - Claim Orientation Reward (T058)
app.post("/orientation-reward", humanAuth(), async (c) => {
  const human = c.get("human");
  const { getDb } = await import("../../lib/container.js");
  const db = getDb();
  if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE" as const, message: "Database not available" }, requestId: c.get("requestId") }, 503);

  const { eq } = await import("drizzle-orm");
  const { humans, humanProfiles, tokenTransactions } = await import("@betterworld/db");

  try {
    return await db.transaction(async (tx) => {
      // Lock the humans row to get authoritative balance
      const [userRow] = await tx
        .select({ tokenBalance: humans.tokenBalance })
        .from(humans)
        .where(eq(humans.id, human.id))
        .for("update")
        .limit(1);

      // Lock profile row for orientation check
      const [profile] = await tx
        .select()
        .from(humanProfiles)
        .where(eq(humanProfiles.humanId, human.id))
        .for("update")
        .limit(1);

      if (!profile) {
        return c.json(
          { ok: false, error: { code: "PROFILE_NOT_FOUND" as const, message: "Profile not found" }, requestId: c.get("requestId") },
          404,
        );
      }

      if (profile.orientationCompletedAt) {
        return c.json(
          { ok: false, error: { code: "REWARD_ALREADY_CLAIMED" as const, message: "Orientation reward already claimed" }, requestId: c.get("requestId") },
          400,
        );
      }

      if (!userRow) {
        return c.json(
          { ok: false, error: { code: "USER_NOT_FOUND" as const, message: "User not found" }, requestId: c.get("requestId") },
          404,
        );
      }
      const currentBalance = parseInt(userRow.tokenBalance.toString(), 10);
      const rewardAmount = 10;
      const newBalance = currentBalance + rewardAmount;

      // Create transaction with correct double-entry fields
      const [transaction] = await tx
        .insert(tokenTransactions)
        .values({
          humanId: human.id,
          amount: rewardAmount,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          transactionType: "earn_orientation",
          description: "Welcome bonus for completing orientation",
          idempotencyKey: `orientation-${human.id}`,
        })
        .returning();

      // Update the authoritative balance on humans table
      await tx
        .update(humans)
        .set({ tokenBalance: newBalance.toString() })
        .where(eq(humans.id, human.id));

      // Update profile: mark orientation complete + increment earned counter
      await tx
        .update(humanProfiles)
        .set({
          orientationCompletedAt: new Date(),
          totalTokensEarned: profile.totalTokensEarned + rewardAmount,
        })
        .where(eq(humanProfiles.humanId, human.id));

      return c.json({ ok: true, data: { transaction, newBalance }, requestId: c.get("requestId") });
    });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : "Unknown" }, "Orientation reward failed");
    return c.json(
      { ok: false, error: { code: "INTERNAL_ERROR" as const, message: "Failed to claim reward" }, requestId: c.get("requestId") },
      500,
    );
  }
});

// POST /tokens/spend - Spend Tokens (T068)
app.post("/spend", humanAuth(), zValidator("json", SpendTokensSchema), async (c) => {
  const human = c.get("human");
  const { amount, type, referenceId, referenceType, description, idempotencyKey } = c.req.valid("json");
  const key = idempotencyKey || crypto.randomUUID();

  const { getDb, getRedis } = await import("../../lib/container.js");
  const db = getDb();
  const redis = getRedis();
  if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE" as const, message: "Database not available" }, requestId: c.get("requestId") }, 503);

  const { eq } = await import("drizzle-orm");
  const { humans, tokenTransactions } = await import("@betterworld/db");

  try {
    // Check idempotency cache
    if (redis) {
      const cached = await redis.get(`idempotency:${key}`);
      if (cached) {
        return c.json({ ...JSON.parse(cached), requestId: c.get("requestId") }, 200);
      }
    }

    const result = await db.transaction(async (tx) => {
      // Lock humans row for authoritative balance
      const [userRow] = await tx
        .select({ tokenBalance: humans.tokenBalance })
        .from(humans)
        .where(eq(humans.id, human.id))
        .for("update")
        .limit(1);

      if (!userRow) throw new Error("USER_NOT_FOUND");

      const currentBalance = parseInt(userRow.tokenBalance.toString(), 10);

      if (currentBalance < amount) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      const newBalance = currentBalance - amount;

      const [transaction] = await tx
        .insert(tokenTransactions)
        .values({
          humanId: human.id,
          amount: -amount,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          transactionType: type,
          referenceId: referenceId || null,
          referenceType: referenceType || null,
          description: description || `Spent ${amount} IT on ${type}`,
          idempotencyKey: key,
        })
        .returning();

      // Update authoritative balance
      await tx
        .update(humans)
        .set({ tokenBalance: newBalance.toString() })
        .where(eq(humans.id, human.id));

      return { ok: true, data: { transaction, newBalance } };
    });

    // Cache response for idempotency (1 hour)
    if (redis) {
      await redis.setex(`idempotency:${key}`, 3600, JSON.stringify(result));
    }

    return c.json({ ...result, requestId: c.get("requestId") }, 201);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "INSUFFICIENT_BALANCE") {
        return c.json(
          { ok: false, error: { code: "INSUFFICIENT_BALANCE" as const, message: "Insufficient token balance" }, requestId: c.get("requestId") },
          400,
        );
      }
      if (error.message === "USER_NOT_FOUND") {
        return c.json(
          { ok: false, error: { code: "USER_NOT_FOUND" as const, message: "User not found" }, requestId: c.get("requestId") },
          404,
        );
      }
    }

    logger.error({ error: error instanceof Error ? error.message : "Unknown" }, "Token spend failed");
    return c.json(
      { ok: false, error: { code: "INTERNAL_ERROR" as const, message: "Failed to spend tokens" }, requestId: c.get("requestId") },
      500,
    );
  }
});

// GET /tokens/balance - Get Token Balance (T069)
app.get("/balance", humanAuth(), async (c) => {
  const human = c.get("human");

  const { getDb } = await import("../../lib/container.js");
  const db = getDb();
  if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE" as const, message: "Database not available" }, requestId: c.get("requestId") }, 503);

  const { eq, sql } = await import("drizzle-orm");
  const { humans, humanProfiles, tokenTransactions } = await import("@betterworld/db");

  try {
    // All three queries are independent reads — run in parallel
    const [userResult, profileResult, spentResult] = await Promise.all([
      db.select({ tokenBalance: humans.tokenBalance }).from(humans).where(eq(humans.id, human.id)).limit(1),
      db.select({ totalTokensEarned: humanProfiles.totalTokensEarned }).from(humanProfiles).where(eq(humanProfiles.humanId, human.id)).limit(1),
      db.select({ total: sql<number>`COALESCE(SUM(ABS(${tokenTransactions.amount})), 0)` }).from(tokenTransactions).where(sql`${tokenTransactions.humanId} = ${human.id} AND ${tokenTransactions.amount} < 0`),
    ]);

    const [userRow] = userResult;
    const [profile] = profileResult;

    const balance = parseInt((userRow?.tokenBalance || "0").toString(), 10);
    const totalEarned = profile?.totalTokensEarned || 0;
    const totalSpent = Number(spentResult[0]?.total || 0);

    return c.json({
      ok: true,
      data: { balance, totalEarned, totalSpent },
      requestId: c.get("requestId"),
    });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : "Unknown" }, "Token balance fetch failed");
    return c.json(
      { ok: false, error: { code: "INTERNAL_ERROR" as const, message: "Failed to fetch balance" }, requestId: c.get("requestId") },
      500,
    );
  }
});

// GET /tokens/transactions - Get Transaction History (T070)
app.get("/transactions", humanAuth(), async (c) => {
  const human = c.get("human");

  // Validate limit parameter
  const limitParam = parseInt(c.req.query("limit") || "20", 10);
  const limit = Number.isNaN(limitParam) ? 20 : Math.min(Math.max(1, limitParam), 100);
  const cursor = c.req.query("cursor");

  const { getDb } = await import("../../lib/container.js");
  const db = getDb();
  if (!db) return c.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE" as const, message: "Database not available" }, requestId: c.get("requestId") }, 503);

  const { eq, and, lt, desc } = await import("drizzle-orm");
  const { tokenTransactions } = await import("@betterworld/db");

  try {
    // Build query with cursor-based pagination
    const conditions = [eq(tokenTransactions.humanId, human.id)];
    if (cursor) {
      // Validate cursor is a UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(cursor)) {
        return c.json(
          { ok: false, error: { code: "INVALID_CURSOR" as const, message: "Invalid cursor format" }, requestId: c.get("requestId") },
          400,
        );
      }
      conditions.push(lt(tokenTransactions.id, cursor));
    }

    const transactions = await db
      .select()
      .from(tokenTransactions)
      .where(and(...conditions))
      .orderBy(desc(tokenTransactions.createdAt))
      .limit(limit + 1);

    const hasMore = transactions.length > limit;
    const items = hasMore ? transactions.slice(0, limit) : transactions;
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem ? lastItem.id : null;

    return c.json({
      ok: true,
      data: { transactions: items, nextCursor },
      requestId: c.get("requestId"),
    });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : "Unknown" }, "Transaction history fetch failed");
    return c.json(
      { ok: false, error: { code: "INTERNAL_ERROR" as const, message: "Failed to fetch transactions" }, requestId: c.get("requestId") },
      500,
    );
  }
});

export default app;
