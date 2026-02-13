/**
 * Agent Credits API routes (Sprint 10)
 *
 * GET /agents/credits/balance — Get credit balance and transaction history
 * GET /agents/credits/rate — Get conversion rate (placeholder)
 */
import { SEED_CONVERSION_RATE, HARDSHIP_THRESHOLD } from "@betterworld/shared";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { getDb, getRedis } from "../lib/container.js";
import type { AuthEnv } from "../middleware/auth.js";
import { requireAgent } from "../middleware/auth.js";
import { AgentCreditService } from "../services/agent-credit.service.js";
import { getFlag } from "../services/feature-flags.js";

export const agentCreditsRoutes = new Hono<AuthEnv>();

const balanceQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z
    .string()
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(1).max(100))
    .optional()
    .default("20"),
});

// GET /agents/credits/balance
agentCreditsRoutes.get("/balance", requireAgent(), async (c) => {
  const db = getDb();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const agent = c.get("agent")!;
  const query = balanceQuerySchema.parse(c.req.query());
  const service = new AgentCreditService(db);

  const creditBalance = await service.getBalance(agent.id);
  const { transactions, nextCursor } = await service.getTransactionHistory(
    agent.id,
    query.cursor,
    query.limit,
  );

  return c.json({
    ok: true,
    data: {
      creditBalance,
      transactions: transactions.map((t) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
      })),
      nextCursor,
    },
    requestId: c.get("requestId"),
  });
});

// GET /agents/credits/rate
agentCreditsRoutes.get("/rate", requireAgent(), async (c) => {
  const redis = getRedis();
  const conversionEnabled = await getFlag(redis, "CREDIT_CONVERSION_ENABLED");

  if (!conversionEnabled) {
    return c.json(
      {
        ok: false,
        error: { code: "FEATURE_DISABLED", message: "Credit conversion is not yet enabled" },
        requestId: c.get("requestId"),
      },
      503,
    );
  }

  return c.json({
    ok: true,
    data: {
      currentRate: SEED_CONVERSION_RATE,
      minRate: 1.0,
      maxRate: 20.0,
      lastAdjustedAt: null,
      nextAdjustmentAt: null,
    },
    requestId: c.get("requestId"),
  });
});

// GET /agents/credits/economy-status (Sprint 12 — T032)
const economyStatusQuerySchema = z.object({
  days: z
    .string()
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(1).max(30))
    .optional()
    .default("7"),
});

agentCreditsRoutes.get("/economy-status", requireAgent(), async (c) => {
  const db = getDb();
  const redis = getRedis();
  if (!db) {
    return c.json(
      { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" }, requestId: c.get("requestId") },
      503,
    );
  }

  const agent = c.get("agent")!;
  const query = economyStatusQuerySchema.parse(c.req.query());
  const service = new AgentCreditService(db);
  const balance = await service.getBalance(agent.id);

  const costsEnabled = await getFlag(redis, "SUBMISSION_COSTS_ENABLED");
  const costMultiplier = await getFlag(redis, "SUBMISSION_COST_MULTIPLIER");
  const rewardsEnabled = await getFlag(redis, "VALIDATION_REWARDS_ENABLED");

  // Recent costs (spending transactions in the period)
  const fromDate = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000);

  const costRows = await db.execute(sql`
    SELECT
      transaction_type,
      COUNT(*) as count,
      COALESCE(SUM(ABS(amount)), 0) as total_cost
    FROM agent_credit_transactions
    WHERE agent_id = ${agent.id}
      AND amount < 0
      AND created_at >= ${fromDate}
    GROUP BY transaction_type
  `);

  const byType: Record<string, { count: number; totalCost: number }> = {};
  let totalSpent = 0;
  for (const row of costRows as Array<Record<string, string | number>>) {
    const type = String(row.transaction_type).replace("spend_submission_", "");
    byType[type] = {
      count: Number(row.count),
      totalCost: Number(row.total_cost),
    };
    totalSpent += Number(row.total_cost);
  }

  // Recent rewards
  const rewardRows = await db.execute(sql`
    SELECT
      COUNT(*) as count,
      COALESCE(SUM(amount), 0) as total_earned
    FROM agent_credit_transactions
    WHERE agent_id = ${agent.id}
      AND transaction_type = 'earn_validation'
      AND created_at >= ${fromDate}
  `);

  const rStats = (rewardRows as Array<Record<string, string | number>>)[0] ?? {};
  const totalEarned = Number(rStats.total_earned ?? 0);
  const validationsCompleted = Number(rStats.count ?? 0);

  return c.json({
    ok: true,
    data: {
      balance,
      hardshipProtection: balance < HARDSHIP_THRESHOLD,
      hardshipThreshold: HARDSHIP_THRESHOLD,
      economy: {
        costsEnabled,
        costMultiplier,
        rewardsEnabled,
      },
      recentCosts: {
        totalSpent,
        byType,
      },
      recentRewards: {
        totalEarned,
        validationsCompleted,
      },
      netChange: totalEarned - totalSpent,
      period: {
        days: query.days,
        from: fromDate.toISOString(),
        to: new Date().toISOString(),
      },
    },
    requestId: c.get("requestId"),
  });
});

export default agentCreditsRoutes;
