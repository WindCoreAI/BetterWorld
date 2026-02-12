/**
 * Agent Credits API routes (Sprint 10)
 *
 * GET /agents/credits/balance — Get credit balance and transaction history
 * GET /agents/credits/rate — Get conversion rate (placeholder)
 */
import { SEED_CONVERSION_RATE } from "@betterworld/shared";
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

export default agentCreditsRoutes;
