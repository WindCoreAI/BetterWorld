/**
 * Welcome Ambassador Routes (Sprint 18: Cooperative Depth & Governance — US11)
 *
 * GET  /ambassador/me — Ambassador stats
 * POST /ambassador/welcome/:newcomerHumanId — Send welcome and earn token
 */
import { ambassadorAssignments, humans, tokenTransactions } from "@betterworld/db";
import { AppError } from "@betterworld/shared";
import { and, eq, count, gte, sql } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../../app.js";
import { getDb } from "../../lib/container.js";
import { humanAuth } from "../../middleware/humanAuth.js";

const ambassadorRoutes = new Hono<AppEnv>();

const MAX_MONTHLY_WELCOMES = 5;

// ── GET /ambassador/me ──
ambassadorRoutes.get("/ambassador/me", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");

  // Total welcomes
  const [totalCount] = await db
    .select({ count: count() })
    .from(ambassadorAssignments)
    .where(eq(ambassadorAssignments.ambassadorHumanId, human.id));

  // Tokens earned this month
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [monthlyCount] = await db
    .select({ count: count() })
    .from(ambassadorAssignments)
    .where(
      and(
        eq(ambassadorAssignments.ambassadorHumanId, human.id),
        eq(ambassadorAssignments.tokenAwarded, true),
        gte(ambassadorAssignments.createdAt, monthStart),
      ),
    );

  return c.json({
    ok: true,
    data: {
      totalWelcomes: totalCount?.count ?? 0,
      monthlyTokensEarned: monthlyCount?.count ?? 0,
      monthlyLimit: MAX_MONTHLY_WELCOMES,
    },
    requestId: c.get("requestId"),
  });
});

// ── POST /ambassador/welcome/:newcomerHumanId ──
ambassadorRoutes.post("/ambassador/welcome/:newcomerHumanId", humanAuth(), async (c) => {
  const db = getDb();
  if (!db) throw new AppError("SERVICE_UNAVAILABLE", "Database not available");

  const human = c.get("human");
  const newcomerHumanId = c.req.param("newcomerHumanId");

  if (human.id === newcomerHumanId) {
    return c.json({ ok: false, error: "CANNOT_WELCOME_SELF", message: "Cannot welcome yourself" }, 400);
  }

  // Check assignment exists
  const [assignment] = await db
    .select()
    .from(ambassadorAssignments)
    .where(
      and(
        eq(ambassadorAssignments.ambassadorHumanId, human.id),
        eq(ambassadorAssignments.newcomerHumanId, newcomerHumanId),
      ),
    )
    .limit(1);

  if (!assignment) {
    return c.json({ ok: false, error: "NOT_ASSIGNED", message: "Not assigned as ambassador for this newcomer" }, 404);
  }

  if (assignment.tokenAwarded) {
    return c.json({ ok: false, error: "ALREADY_WELCOMED", message: "Already welcomed this newcomer" }, 400);
  }

  // Check monthly cap
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [monthlyCount] = await db
    .select({ count: count() })
    .from(ambassadorAssignments)
    .where(
      and(
        eq(ambassadorAssignments.ambassadorHumanId, human.id),
        eq(ambassadorAssignments.tokenAwarded, true),
        gte(ambassadorAssignments.createdAt, monthStart),
      ),
    );

  if ((monthlyCount?.count ?? 0) >= MAX_MONTHLY_WELCOMES) {
    return c.json({ ok: false, error: "MONTHLY_LIMIT", message: `Maximum ${MAX_MONTHLY_WELCOMES} welcome tokens per month` }, 400);
  }

  // Award 1 token
  const idempotencyKey = `ambassador-welcome:${assignment.id}`;
  const balanceResult = await db.execute(
    sql`SELECT id, token_balance FROM humans WHERE id = ${human.id} FOR UPDATE`,
  );
  const humanRow = (balanceResult as unknown as Array<{ id: string; token_balance: string }>)[0];
  if (!humanRow) throw new AppError("NOT_FOUND", "User not found");

  const currentBalance = parseInt(humanRow.token_balance, 10) || 0;
  const newBalance = currentBalance + 1;

  await db
    .update(humans)
    .set({ tokenBalance: String(newBalance), updatedAt: new Date() })
    .where(eq(humans.id, human.id));

  await db.insert(tokenTransactions).values({
    humanId: human.id,
    amount: 1,
    balanceBefore: currentBalance,
    balanceAfter: newBalance,
    transactionType: "earn_ambassador_welcome",
    referenceId: assignment.id,
    referenceType: "ambassador_assignment",
    description: "Welcome ambassador reward (1 token)",
    idempotencyKey,
  });

  // Mark as welcomed
  await db
    .update(ambassadorAssignments)
    .set({ tokenAwarded: true, sentAt: new Date() })
    .where(eq(ambassadorAssignments.id, assignment.id));

  return c.json({
    ok: true,
    data: { newcomerHumanId, tokenAwarded: true },
    requestId: c.get("requestId"),
  });
});

export default ambassadorRoutes;
