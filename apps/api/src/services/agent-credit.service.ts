/**
 * Agent Credit Service — Atomic ledger operations with SELECT FOR UPDATE.
 *
 * Follows Constitution Principle IV: double-entry accounting with
 * balance_before/balance_after on every transaction.
 */
import { agents, agentCreditTransactions } from "@betterworld/db";
import { STARTER_GRANT_AMOUNT } from "@betterworld/shared";
import type { AgentCreditTransactionInput } from "@betterworld/shared";
import { eq, sql, desc, lt, and } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { logger } from "../middleware/logger.js";

export class AgentCreditService {
  constructor(private readonly db: PostgresJsDatabase) {}

  /**
   * Earn credits — atomic balance update with double-entry record.
   * Uses SELECT FOR UPDATE to prevent race conditions.
   */
  async earnCredits(
    agentId: string,
    amount: number,
    transactionType: AgentCreditTransactionInput["transactionType"],
    referenceId?: string,
    idempotencyKey?: string,
    description?: string,
  ): Promise<{ transactionId: string; balanceAfter: number }> {
    if (amount <= 0) {
      throw new Error("Earn amount must be positive");
    }

    return this.db.transaction(async (tx) => {
      // Check idempotency key first (outside lock for efficiency)
      if (idempotencyKey) {
        const existing = await tx
          .select({ id: agentCreditTransactions.id })
          .from(agentCreditTransactions)
          .where(eq(agentCreditTransactions.idempotencyKey, idempotencyKey))
          .limit(1);

        if (existing.length > 0) {
          // Duplicate — return existing transaction
          const agent = await tx
            .select({ creditBalance: agents.creditBalance })
            .from(agents)
            .where(eq(agents.id, agentId))
            .limit(1);
          return {
            transactionId: existing[0]!.id,
            balanceAfter: agent[0]?.creditBalance ?? 0,
          };
        }
      }

      // Lock agent row
      const lockedRows = await tx.execute(
        sql`SELECT id, credit_balance FROM agents WHERE id = ${agentId} FOR UPDATE`,
      );
      const lockedAgent = lockedRows[0] as { id: string; credit_balance: number } | undefined;

      if (!lockedAgent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      const balanceBefore = lockedAgent.credit_balance;
      const balanceAfter = balanceBefore + amount;

      // Insert transaction record (double-entry)
      const txRecords = await tx
        .insert(agentCreditTransactions)
        .values({
          agentId,
          amount,
          balanceBefore,
          balanceAfter,
          transactionType,
          referenceId,
          description: description ?? `${transactionType}: +${amount} credits`,
          idempotencyKey,
        })
        .returning({ id: agentCreditTransactions.id });

      const txRecord = txRecords[0]!;

      // Update balance atomically
      await tx.execute(
        sql`UPDATE agents SET credit_balance = ${balanceAfter} WHERE id = ${agentId}`,
      );

      logger.info(
        { agentId, amount, balanceBefore, balanceAfter, transactionType },
        "Credits earned",
      );

      return { transactionId: txRecord.id, balanceAfter };
    });
  }

  /**
   * Get agent's current credit balance.
   */
  async getBalance(agentId: string): Promise<number> {
    const [agent] = await this.db
      .select({ creditBalance: agents.creditBalance })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    return agent.creditBalance;
  }

  /**
   * Get agent's transaction history with cursor pagination.
   */
  async getTransactionHistory(
    agentId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{
    transactions: Array<{
      id: string;
      amount: number;
      balanceBefore: number;
      balanceAfter: number;
      transactionType: string;
      referenceId: string | null;
      referenceType: string | null;
      description: string | null;
      createdAt: Date;
    }>;
    nextCursor: string | null;
  }> {
    let query = this.db
      .select({
        id: agentCreditTransactions.id,
        amount: agentCreditTransactions.amount,
        balanceBefore: agentCreditTransactions.balanceBefore,
        balanceAfter: agentCreditTransactions.balanceAfter,
        transactionType: agentCreditTransactions.transactionType,
        referenceId: agentCreditTransactions.referenceId,
        referenceType: agentCreditTransactions.referenceType,
        description: agentCreditTransactions.description,
        createdAt: agentCreditTransactions.createdAt,
      })
      .from(agentCreditTransactions)
      .where(eq(agentCreditTransactions.agentId, agentId))
      .orderBy(desc(agentCreditTransactions.createdAt))
      .limit(limit + 1);

    if (cursor) {
      query = this.db
        .select({
          id: agentCreditTransactions.id,
          amount: agentCreditTransactions.amount,
          balanceBefore: agentCreditTransactions.balanceBefore,
          balanceAfter: agentCreditTransactions.balanceAfter,
          transactionType: agentCreditTransactions.transactionType,
          referenceId: agentCreditTransactions.referenceId,
          referenceType: agentCreditTransactions.referenceType,
          description: agentCreditTransactions.description,
          createdAt: agentCreditTransactions.createdAt,
        })
        .from(agentCreditTransactions)
        .where(
          and(
            eq(agentCreditTransactions.agentId, agentId),
            lt(agentCreditTransactions.id, cursor),
          ),
        )
        .orderBy(desc(agentCreditTransactions.createdAt))
        .limit(limit + 1);
    }

    const results = await query;

    const hasMore = results.length > limit;
    const transactions = results.slice(0, limit);
    const nextCursor = hasMore && transactions.length > 0 ? transactions[transactions.length - 1]!.id : null;

    return { transactions, nextCursor };
  }

  /**
   * Spend credits — atomic balance deduction with double-entry record.
   * Uses SELECT FOR UPDATE to prevent race conditions.
   * Returns null if insufficient balance (caller should handle).
   */
  async spendCredits(
    agentId: string,
    amount: number,
    transactionType: AgentCreditTransactionInput["transactionType"],
    referenceId?: string,
    idempotencyKey?: string,
    description?: string,
  ): Promise<{ transactionId: string; balanceAfter: number } | null> {
    if (amount <= 0) {
      throw new Error("Spend amount must be positive");
    }

    return this.db.transaction(async (tx) => {
      // Check idempotency key first (outside lock for efficiency)
      if (idempotencyKey) {
        const existing = await tx
          .select({ id: agentCreditTransactions.id })
          .from(agentCreditTransactions)
          .where(eq(agentCreditTransactions.idempotencyKey, idempotencyKey))
          .limit(1);

        if (existing.length > 0) {
          const agent = await tx
            .select({ creditBalance: agents.creditBalance })
            .from(agents)
            .where(eq(agents.id, agentId))
            .limit(1);
          return {
            transactionId: existing[0]!.id,
            balanceAfter: agent[0]?.creditBalance ?? 0,
          };
        }
      }

      // Lock agent row
      const lockedRows = await tx.execute(
        sql`SELECT id, credit_balance FROM agents WHERE id = ${agentId} FOR UPDATE`,
      );
      const lockedAgent = lockedRows[0] as { id: string; credit_balance: number } | undefined;

      if (!lockedAgent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      const balanceBefore = lockedAgent.credit_balance;

      // Insufficient balance — return null (caller handles)
      if (balanceBefore < amount) {
        return null;
      }

      const balanceAfter = balanceBefore - amount;

      // Insert transaction record (double-entry, negative amount for spending)
      const txRecords = await tx
        .insert(agentCreditTransactions)
        .values({
          agentId,
          amount: -amount,
          balanceBefore,
          balanceAfter,
          transactionType,
          referenceId,
          description: description ?? `${transactionType}: -${amount} credits`,
          idempotencyKey,
        })
        .returning({ id: agentCreditTransactions.id });

      const txRecord = txRecords[0]!;

      // Update balance atomically
      await tx.execute(
        sql`UPDATE agents SET credit_balance = ${balanceAfter} WHERE id = ${agentId}`,
      );

      logger.info(
        { agentId, amount, balanceBefore, balanceAfter, transactionType },
        "Credits spent",
      );

      return { transactionId: txRecord.id, balanceAfter };
    });
  }

  /**
   * Issue starter grant (one-time, idempotent via idempotency key).
   */
  async issueStarterGrant(agentId: string): Promise<{ transactionId: string; balanceAfter: number }> {
    return this.earnCredits(
      agentId,
      STARTER_GRANT_AMOUNT,
      "earn_starter_grant",
      undefined,
      `starter-grant:${agentId}`,
      `Starter grant: +${STARTER_GRANT_AMOUNT} credits`,
    );
  }
}
